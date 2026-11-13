const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const readPage = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const overview = readPage('dashboard.html');
const configuration = readPage('configuration.html');
const slice = (page, start, end) => page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start)));

for (const page of [overview, configuration]) {
  assert.ok(page.includes("includePortalStyles_('PortalClientContext')"));
  assert.ok(!page.includes('google.script.run'), 'RPCs preserve the active tab preview');
  for (const [, code] of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    new vm.Script(code);
  }
}

const fields = new Map();
const document = { getElementById(id) { return fields.get(id); } };
const context = vm.createContext({ document });
for (const id of ['total-budget', 'actual-spend', 'pending-value', 'available-budget', 'pending-count-text',
  'carry-over-note', 'available-budget-note', 'spend-bar', 'spend-track', 'spend-text']) {
  fields.set(id, {classList:{toggle(){}}, style:{}, dataset:{}, textContent:'', hidden:false});
}
vm.runInContext([
  slice(overview, 'function reportingDate_', 'function initPeriodFilter_'),
  slice(overview, 'function parseDashboardAmount', '// --- CHARTS ---'),
  slice(overview, 'function isCompletedOrder', 'function updateChartsWithData'),
  slice(overview, 'function formatCurrency(num)', '// --- THEME LOGIC ---'),
  slice(configuration, 'function updateAccessPicker_', 'function refreshAccessPickers_'),
  slice(configuration, 'function effectiveUserAccess_', 'function validateUserDraft'),
  'function normalize(value) { return String(value || "").trim().toLowerCase(); }'
].join('\n'), context);

context.updateCards({
  orders: [],
  budgets: {},
  overview: { actualSpend:35, pendingValue:10, pendingCount:2, carryOver:{count:1,value:15},
    ledger:{allocation:100,used:80,remaining:20} }
});
assert.equal(fields.get('actual-spend').textContent, '£35.00');
assert.equal(fields.get('available-budget').textContent, '£20.00', 'use ledger balance rather than subtracting the selected period');
assert.equal(fields.get('spend-bar').dataset.tone, 'warning');
assert.match(fields.get('carry-over-note').textContent, /1 still open.*£15.00/);
context.updateCards({orders:[], budgets:{}, siteScoped:true, overview:{actualSpend:15,pendingValue:0,pendingCount:0,ledger:null}});
assert.equal(fields.get('total-budget').textContent, 'Not available');
assert.equal(fields.get('spend-track').hidden, true);
assert.equal(fields.get('carry-over-note').hidden, true);
assert.match(fields.get('available-budget-note').textContent, /departments/);
assert.equal(context.displayReportingDate_({dateReq:'31/08/2026', dateOrdered:'01/09/2026', status:'Ordered'}), '01/09/2026');
assert.equal(context.displayReportingDate_({dateReq:'31/08/2026', reportingDate:'2026-10-01', status:'Processed'}), '01/10/2026');
assert.equal(context.displayMonth_('2026-11'), 'Nov 2026');

const choices = ['Science', 'Prep Art', 'Prep History'].map((name, index) => {
  const input = {checked:index < 2};
  return {dataset:{search:name}, querySelector:() => input, input};
});
fields.set('group', {querySelectorAll:() => choices});
fields.set('search', {value:'prep'});
fields.set('count', {textContent:''});
context.updateAccessPicker_('group', 'search', 'count');
assert.equal(fields.get('count').textContent, '2 selected · 2 of 3 shown');
assert.equal(choices[0].hidden, true);
assert.equal(choices[0].input.checked, true, 'filtering preserves selections outside the results');
assert.equal(choices[2].hidden, false);

const draft = {role:'Head',site:'Prep',departments:['Science'],processingDepartments:['Art'],
  canProcessOrders:true,canLogInvoices:false};
const effective = context.effectiveUserAccess_(draft, false).join(' ');
assert.match(effective, /Prep site overview/);
assert.match(effective, /Science/);
assert.match(effective, /normal orders across the school/);
assert.match(effective, /review colleagues’ purchases in Art/);
assert.match(effective, /Own purchases require another authorised reviewer/);
assert.match(context.effectiveUserAccess_({...draft,role:'Wipro'}, true).join(' '), /inactive.*Finance overview/);
assert.doesNotMatch(context.effectiveUserAccess_({...draft,role:'Wipro'}, true).join(' '), /authorised reviewer|in Art/);

const userSection = slice(configuration, '<section class="panel" id="users">', '<section class="panel" id="system-settings">');
assert.match(userSection, /class="table-responsive user-access-table-region"[^>]*tabindex="0"/);
assert.doesNotMatch(userSection, /table-mobile-cards/, 'The access table retains a single row per user at phone widths');
assert.match(configuration, /\.user-access-table-region\s*\{[^}]*overflow-x:auto/);
assert.match(configuration, /\.user-access-table \.user-identity,[^{]+\{\s*white-space:nowrap/);
for (const id of ['userSearch', 'roleFilter', 'userStatusFilter', 'userResultCount', 'userRows', 'userEmpty']) {
  fields.set(id, {value:'', style:{}});
}
const longEmail = 'a.very.long.synthetic.account.for.the.access.table@claremontschool.co.uk';
context.configState = {data:{users:[{email:longEmail,role:'Staff',defaultSite:'Prep',isCurrentUser:true,
  departments:['Prep Art'],processingDepartments:['Prep Art'],canProcessOrders:true,canLogInvoices:true}]}};
vm.runInContext([
  slice(configuration, 'function escapeHtml', 'function formatMoney'),
  slice(configuration, 'function renderUsers()', 'function renderRoleGuide()')
].join('\n'), context);
context.renderUsers();
const userRow = fields.get('userRows').innerHTML;
assert.equal((userRow.match(/<tr\b/g) || []).length, 1);
assert.ok(userRow.includes('<strong>' + longEmail + '</strong>'), 'The full school address remains visible text');
assert.match(userRow, /<span[^>]+>Processing budgets: Prep Art<\/span>/);
fields.get('userSearch').value = 'access.table';
context.renderUsers();
assert.equal(fields.get('userResultCount').textContent, 'Showing 1 of 1 users');

const stub = (extra = {}) => ({ style:{}, setAttribute(name, value) { this[name] = value; }, ...extra });
const noticeChildren = new Map(['strong', 'small', '.portal-loading-dot'].map(key => [key, stub()]));
const notice = stub({
  querySelector: key => noticeChildren.get(key),
  appendChild(button) { noticeChildren.set('button', button); }
});
for (const id of ['dashboard-freshness', 'dashboardWorkspace', 'export-btn']) fields.set(id, stub());
fields.set('dashboardLoading', stub({querySelector: () => notice}));
fields.set('dept-filter', {value:'Prep Art'});
fields.set('period-filter', {value:'2024'});
let activeContext = {mode:'preview',email:'head@example.test'}, request, failure;
const runner = {
  withSuccessHandler() { return this; },
  withFailureHandler(handler) { failure = handler; return this; },
  getOverviewDashboardData(query) { request = { ...query, activeContext }; }
};
Object.assign(context, {
  portalViewContext: { get: () => activeContext, set: value => { activeContext = value; } },
  portalRun: runner, setTimeout: () => 1, clearTimeout() {}, console: {error() {}}
});
document.createElement = () => stub();
vm.runInContext([
  'let globalData = { user:{isPreview:true} }; function academicYear_() { return 2026; }',
  slice(overview, 'let dashboardLoadGeneration', 'const SYSTEM_BUDGET_DEPARTMENTS')
].join('\n'), context);
context.exitDashboardPreview_();
assert.deepEqual(request, {summaryOnly:true, period:'2026', department:'All', activeContext:null});
assert.equal(fields.get('dashboardWorkspace').style.display, 'none');
assert.equal(fields.get('dashboardWorkspace').inert, true, 'Previous view is hidden and disabled while the real view loads');
assert.equal(fields.get('dashboardLoading').style.display, 'block');
assert.equal(notice.role, 'status');
failure();
assert.equal(notice.role, 'alert');
assert.equal(noticeChildren.get('button').textContent, 'Try again');
noticeChildren.get('button').onclick();
assert.equal(notice.role, 'status', 'Retry uses the same frame and restores the loading state');
assert.equal(noticeChildren.get('button').hidden, true);
console.log('Reporting and access UI: ledger and period separation, site scope, reporting dates, search retention, role permissions, full email rows and preview exit passed.');
