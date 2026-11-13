const assert = require('assert');
const path = require('path');
const {createRuntime} = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
for (const role of ['Staff', 'Head']) {
  const rt = createRuntime(source, 12);
  const account = rt.sheets.Users.rows.find(r => r[2] === role);
  rt.setActor(account[0]);
  rt.sheets.Orders.rows[3][20] = 'Invoice'; // Assigned Science, Senior site, pending.
  const before = rt.api.getDashboardData();
  assert.ok(before.orders.some(r => r.id === 'PERF-2'));
  const budgetBefore = JSON.stringify(before.budgets.Science);
  account[6] = true;
  account[7] = true; // Legacy/direct-sheet conflict must fail closed.
  const after = rt.api.getDashboardData({knownRevision: before.revision});
  assert.equal(after.notModified, undefined);
  assert.ok(!after.orders.some(r => r.id === 'PERF-2'));
  assert.equal(after.user.capabilities.canLogInvoice, false);
  assert.equal(JSON.stringify(after.budgets.Science), budgetBefore);
  if (role === 'Head') assert.ok(!rt.api.getOverviewDashboardData().orders.some(r => r.id === 'PERF-2'));
  const original = JSON.stringify(rt.sheets.Orders.rows);
  assert.match(JSON.stringify(rt.api.addNote('PERF-2', 'Hidden invoice note')), /Unauthorized/);
  assert.equal(rt.api.userCancelOrder('PERF-2', 'Hidden invoice cancellation').saved, false);
  assert.throws(() => rt.api.logInvoice({dept:'Science', supplier:'Test', desc:'Test invoice', cost:10}), /permission/);
  assert.equal(JSON.stringify(rt.sheets.Orders.rows), original);
  account[6] = false;
  assert.ok(rt.api.getDashboardData().orders.some(r => r.id === 'PERF-2'));
  assert.equal(rt.api.getUserContext().capabilities.canLogInvoice, true);
}
for (const role of ['Admin', 'Wipro']) {
  const rt = createRuntime(source, 4);
  const account = rt.sheets.Users.rows.find(r => r[2] === role);
  account[6] = account[7] = true;
  rt.setActor(account[0]);
  rt.sheets.Orders.rows[3][20] = 'Invoice';
  assert.ok(rt.api.getDashboardData().orders.some(r => r.id === 'PERF-2'));
  assert.equal(rt.api.getUserContext().capabilities.canLogInvoice, true);
}
const rt = createRuntime(source, 4);
const usersBefore = JSON.stringify(rt.sheets.Users.rows);
const expectedConfigurationRevision = JSON.parse(rt.api.getAdminConfigurationPreview()).configurationRevision;
const result = rt.api.saveAdminUserConfiguration({expectedConfigurationRevision,email:'staff@claremontschool.co.uk',originalEmail:'staff@claremontschool.co.uk',role:'Staff',defaultSite:'Senior',departments:['Science'],canProcessOrders:true,canLogInvoices:true});
assert.equal(JSON.parse(result).success, false);
assert.match(JSON.stringify(result), /Choose either/);
assert.equal(JSON.stringify(rt.sheets.Users.rows), usersBefore);
rt.sheets.Config.rows[1][1] = 'replacement@example.com';
assert.equal(rt.api.getConfig_().financeEmail, 'replacement@example.com');
console.log('Invoice visibility, legacy conflicts, role preservation, hidden-record writes, API validation and notification configuration passed.');

