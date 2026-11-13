const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRuntime } = require('./performance-fixtures.cjs');

const root = path.join(__dirname, '..');
const runtime = createRuntime(path.join(root, 'Code.js'), 8);
const { api, sheets, setActor, setDevelopment } = runtime;
const school = 'claremontschool.co.uk';
const staff = 'staff@' + school;
const head = 'head@' + school;
const synthetic = 'dev-ux-staff@' + school;
const preview = email => ({mode:'preview', email});
const dashboard = view => api.portalRpc('getDashboardData', [{paged:true}], view);

// A stale legacy Users cell does not apply a preview to other calls or tabs.
sheets.Users.rows[1][4] = staff;
sheets.Users.rows[0].push('Processing Departments');
sheets.Users.rows[2][7] = true;
sheets.Users.rows[2][8] = 'Science';
sheets.Users.rows.push([synthetic, 'Science', 'Staff', 'Senior', '', true, false, false]);
const originalUsers = JSON.stringify(sheets.Users.rows);
const originalOrders = JSON.stringify(sheets.Orders.rows);
const opened = api.portalRpc('setSimulation', [staff, 'preview'], null);
assert.equal(opened.context.email, staff);
assert.equal(opened.context.mode, 'preview');
assert.equal(JSON.stringify(sheets.Users.rows), originalUsers);

const staffView = dashboard(opened.context);
assert.equal(staffView.user.email, staff);
assert.equal(staffView.user.isPreview, true);
assert.equal(staffView.user.capabilities.canCreateRequests, false);
assert.equal(staffView.user.capabilities.canLogInvoice, false);
assert.equal(staffView.user.capabilities.canManageOrders, false);
assert.equal(staffView.user.previewEntryForms.canCreateRequests, true);
assert.equal(staffView.user.previewEntryForms.canLogInvoice, true);
assert.equal(staffView.user.previewEntryForms.canManageOrders, true);
assert.equal(dashboard(preview(synthetic)).user.previewEntryForms.canLogInvoice, false);
assert.equal(dashboard(null).user.role, 'Admin');
const headView = dashboard(preview(head));
assert.equal(headView.user.email, head);
assert.equal(headView.user.capabilities.canAccessFinanceDashboard, true);
assert.ok(api.portalRpc('getSimulationTargets', [], preview(head)).includes(staff), 'real Admin can switch target while previewing');
assert.ok(api.portalRpc('getOverviewDashboardData', [{summaryOnly:true}], preview(head)).success);
assert.equal(dashboard(opened.context).user.email, staff);

for (const method of ['submitOrder', 'logInvoice', 'userCancelOrder', 'saveAdminUserConfiguration', 'processInvoice', 'saveOrderInvoiceEvidence', 'savePurchaseReportingSite', 'saveOrderReturn', 'reviewOrderApproval']) {
  assert.throws(() => api.portalRpc(method, [], opened.context), /read-only/);
}
for (const bad of [false, 0, '', [], {}, {mode:'preview',email:''}, {mode:'preview',email:'   '}, {mode:'wrong',email:staff}]) {
  assert.throws(() => api.portalRpc('submitOrder', [], bad), /view context is invalid/);
}
for (const method of ['constructor', '__proto__', 'sendEmailAlert_', 'portalRpc']) {
  assert.throws(() => api.portalRpc(method, [], null), /action is unavailable/);
}
assert.equal(JSON.stringify(sheets.Users.rows), originalUsers);
assert.equal(JSON.stringify(sheets.Orders.rows), originalOrders);
assert.equal(dashboard(null).user.role, 'Admin', 'rejected calls cannot leak their actor into the next RPC');

setActor(staff);
assert.throws(() => dashboard(preview(head)), /Only an administrator/);
assert.throws(() => api.portalRpc('setSimulation', [head, 'preview'], null), /Admin access/);
const ownView = dashboard(null).user;
assert.equal(ownView.email, staff);
for (const [name, available] of Object.entries(staffView.user.previewEntryForms)) assert.equal(available, ownView.capabilities[name]);
assert.equal(JSON.stringify(staffView.user.requesterChoices), JSON.stringify(ownView.requesterChoices));
setActor('admin@' + school);
assert.throws(() => dashboard({mode:'test',email:staff}), /synthetic DEV accounts/);
const testView = dashboard({mode:'test',email:synthetic});
assert.equal(testView.user.isDevTest, true);
assert.equal(testView.user.capabilities.canCreateRequests, true);
setDevelopment(false);
assert.throws(() => dashboard({mode:'test',email:synthetic}), /only for synthetic DEV accounts/);
assert.equal(dashboard(null).user.role, 'Admin');

const shared = fs.readFileSync(path.join(root, 'PortalClientContext.html'), 'utf8').replace(/<\/?script>/g, '');
function browserTab(storage = new Map(), blocked = false) {
  const calls = [];
  const runner = {
    withSuccessHandler(){ return this; },
    withFailureHandler(){ return this; },
    portalRpc(method, args, context){ calls.push({method,args,context}); }
  };
  const context = vm.createContext({
    location:{hostname:'script.google.com'}, google:{script:{run:runner}},
    sessionStorage:{
      getItem(key){ if (blocked) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem(key,value){ if (blocked) throw new Error('blocked'); storage.set(key,value); },
      removeItem(key){ if (blocked) throw new Error('blocked'); storage.delete(key); }
    }
  });
  vm.runInContext(shared, context);
  return {context, calls, storage};
}
const first = browserTab(), second = browserTab();
first.context.portalViewContext.set(preview(head));
first.context.portalRun.getOverviewDashboardData({});
second.context.portalRun.getDashboardData({});
assert.equal(first.calls[0].context.email, head);
assert.equal(second.calls[0].context, null);
const nextPage = browserTab(first.storage);
nextPage.context.portalRun.getOverviewDashboardData({});
assert.equal(nextPage.calls[0].context.email, head, 'navigation in the same tab keeps the context');
nextPage.context.portalViewContext.set(null);
assert.equal(browserTab(first.storage).context.portalViewContext.get(), null);
const malformed = browserTab(new Map([['orders.portal.viewContext', '{"mode":"preview","email":""}']]));
assert.equal(malformed.context.portalViewContext.get().mode, 'invalid', 'invalid storage never falls back to Admin');
const blocked = browserTab(new Map(), true);
assert.equal(blocked.context.portalViewContext.get().mode, 'invalid');
assert.throws(() => blocked.context.portalViewContext.set(preview(head)), /Allow storage/);
console.log('Preview context: isolated tabs, target switching, read-only writes, malformed/blocked storage, and DEV test guards passed.');
