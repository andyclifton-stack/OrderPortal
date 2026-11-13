const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRuntime } = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
const request = { paged: true, requestId: 'recovery-test', source: 'auto_refresh_interval', query: { department: 'All', pageSize: 10 } };
const transient = 'Service Spreadsheets failed while accessing document with ID synthetic-dev.';
function fixture(failures, message = transient, target = 'header') {
  const r = createRuntime(source, 100, { strictInputs: true });
  r.setActor('staff@claremontschool.co.uk');
  const events = [], sleeps = [], alerts = [];
  r.api.console.log = value => events.push(value);
  r.api.Utilities.sleep = ms => sleeps.push(ms);
  r.api.sendPortalErrorNotification_ = (e, context, options) => alerts.push({ e, context, options });
  let reads = 0;
  const sheet = r.sheets.Orders, getRange = sheet.getRange.bind(sheet);
  sheet.getRange = (...args) => {
    const range = getRange(...args), getValues = range.getValues.bind(range);
    if ((target === 'header' && args[0] === 1) || (target === 'rows' && args[0] === 2)) {
      range.getValues = () => { reads++; if (reads <= failures) throw Error(message); return getValues(); };
    }
    return range;
  };
  return { r, events, sleeps, alerts, reads: () => reads };
}
for (const paged of [true, false]) {
  for (const target of ['header', 'rows']) {
    for (const failures of [0, 1, 2, 3]) {
      const f = fixture(failures, transient, target);
      const response = f.r.api.getDashboardData({ ...request, paged });
      assert.equal(response.success, failures < 3);
      assert.equal(f.reads(), Math.min(failures + 1, 3));
      assert.equal(f.sleeps.length, Math.min(failures, 2));
      f.sleeps.forEach((ms, i) => assert(ms >= 500 * 2 ** i && ms < 500 * 2 ** i + 250));
      assert.equal(f.alerts.length, failures === 3 ? 1 : 0);
      assert.equal(f.r.calls.writes.length, 0);
      if (response.success) assert(response.orders.every(order => order.dept === 'Science'));
      if (failures === 1 || failures === 2) assert(f.events.some(v => v.includes('dashboard_recovered')));
      if (failures === 3) {
        assert.equal(response.retryable, false, 'Browser must not multiply exhausted server retries');
        const alert = f.alerts[0];
        const email = f.r.api.createPortalErrorEmailData_(alert.e, alert.context, 'test@example.com', {}, alert.options);
        assert(email.body.includes('Request: recovery-test'));
        assert(email.body.includes('Source: auto_refresh_interval'));
        assert(email.body.includes('Read attempts: 3'));
        assert(!response.orders, 'No partial orders returned');
      }
    }
  }
}
for (const message of ['Permission denied', 'Service invoked too many times for one day: spreadsheets.', 'Unexpected coding error']) {
  const f = fixture(10, message);
  assert.equal(f.r.api.getDashboardData(request).success, false);
  assert.equal(f.reads(), 1); assert.equal(f.sleeps.length, 0); assert.equal(f.alerts.length, 1);
}
{
  const f = fixture(0);
  f.r.setActor('unknown@claremontschool.co.uk');
  assert.equal(f.r.api.getDashboardData(request).errorCode, 'AUTH_UNAUTHORIZED');
  assert.equal(f.sleeps.length, 0); assert.equal(f.alerts.length, 0);
}
{
  const f = fixture(1);
  f.r.api.Utilities.sleep = () => f.r.setActor('unknown@claremontschool.co.uk');
  assert.equal(f.r.api.getDashboardData(request).errorCode, 'AUTH_UNAUTHORIZED', 'Every retry rechecks access');
  assert.equal(f.reads(), 1); assert.equal(f.alerts.length, 0);
}
// Exercise the actual UI load function with a failed server response.
const html = fs.readFileSync(path.resolve(__dirname, '../Index.html'), 'utf8');
const loadSource = html.slice(html.indexOf('      function loadData(options)'), html.indexOf('      function refreshDataInPlace', html.indexOf('      function loadData(options)')));
async function browserFailure(initial, retryable, expectedCalls) {
  let calls = 0, success, retrySchedules = 0;
  const runner = { withSuccessHandler(fn) { success = fn; return this; }, withFailureHandler() { return this; }, getDashboardData() {
    calls++; queueMicrotask(() => success({ success: false, error: transient, errorCode: 'SERVER_ERROR', retryable }));
  } };
  const context = {
    Promise, console: { warn() {} }, performance: { now: () => 1 }, document: { getElementById: () => ({ style: { display: initial ? 'none' : 'block' } }) },
    window: { __portalComponentsReady: Promise.resolve(true) }, refreshInFlight: false, refreshSeq: 0, appliedRefreshSeq: 0, dashboardAttemptToken: 0,
    refreshFailed_: false, lastSuccessfulRefresh_: null, orderPageBusy_: false, loadingInterval: null, lastDataRevision: null,
    DASHBOARD_REQUEST_TIMEOUT_MS: 45000, INITIAL_LOAD_RETRY_DELAY_MS: 1500,
    portalRun_: () => runner, getOrderPageQuery_: () => ({}), setOrderPageBusy_() {}, updateFreshness_() {}, createPortalReference_: () => 'test',
    clearTimeout() {}, clearInterval() {}, showLoadError_() {}, showMsg() {},
    setTimeout(fn, ms) { if (ms === 1500) { retrySchedules++; queueMicrotask(fn); } return 1; },
    normalizeDashboardData_() { const e = Error(transient); e.code = 'SERVER_ERROR'; throw e; }
  };
  vm.createContext(context); vm.runInContext(loadSource, context);
  assert.equal(await context.loadData({ initial }), false);
  assert.equal(calls, expectedCalls); assert.equal(retrySchedules, expectedCalls - 1);
  assert.equal(context.refreshInFlight, false, 'Failure releases refresh controls');
}
(async () => {
  await browserFailure(true, false, 1);
  await browserFailure(false, false, 1);
  await browserFailure(true, undefined, 2);
  console.log('PASS dashboard recovery: transient and persistent failures, bounded delays, read-only safety, authorization, diagnostics, and browser retry coordination');
})().catch(error => { console.error(error); process.exitCode = 1; });
