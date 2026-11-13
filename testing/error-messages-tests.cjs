const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {createRuntime} = require('./performance-fixtures.cjs');
const root = path.resolve(__dirname, '..');
const make = () => createRuntime(path.join(root, 'Code.js'), 3, {strictInputs:true});
const secret = 'Technical diagnostic: synthetic document ID and stack trace';
for (const configured of ['purchases@claremontschool.co.uk', '', 'buyer@example.com']) {
  const r = make(), sent = [];
  r.setDevelopment(false);
  r.api.sendPortalServiceEmail_ = mail => sent.push(mail);
  r.api.getConfig_ = () => { throw Error('Technical mail must not read Finance configuration'); };
  const plan = r.api.createPortalErrorDeliveryPlan_(Error(secret), 'getDashboardData', configured,
    {activeEmail:'buyer@example.com', effectiveEmail:'owner@example.com'}, {requestContext:{requestId:'test-reference',source:'auto_refresh_focus'}});
  assert.equal(plan.length, 1);
  assert.equal(plan[0].to, 'andy.clifton+error@claremontschool.co.uk');
  assert(!plan[0].cc && !plan[0].bcc);
  assert(plan[0].body.includes(secret) && plan[0].body.includes('test-reference'));
  r.api.sendPortalErrorNotification_(Error(secret), 'getDashboardData');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'andy.clifton+error@claremontschool.co.uk');
  let attempts = 0;
  r.api.sendPortalServiceEmail_ = () => { attempts++; throw Error('Synthetic mail outage'); };
  r.api.logError_(Error(secret), 'getDashboardData');
  assert.equal(attempts, 1, 'No fallback to Finance or end user on delivery failure');
  r.setDevelopment(true);
  assert(r.api.sendPortalErrorNotification_(Error(secret), 'test').skipped);
  assert.equal(attempts, 1, 'Hosted development must not send technical emails');
}
{
  const r = make(), alerts = [];
  r.api.getPortalSpreadsheet_ = () => { throw Error(secret); };
  r.api.sendPortalErrorNotification_ = (e, context, options) => alerts.push({e,context,options});
  for (const method of ['getDashboardData', 'getOverviewDashboardData']) {
    const result = r.api[method]({requestId:'test-reference'});
    assert.equal(result.success,false);
    assert(!result.error.includes(secret));
    assert.equal(result.meta.requestId,'test-reference');
    assert.equal(alerts.at(-1).options.requestContext.requestId,'test-reference');
    assert.equal(alerts.at(-1).e.message,secret);
  }
  assert.equal(r.calls.writes.length,0);
}
const html = fs.readFileSync(path.join(root,'Index.html'),'utf8');
const extract = (start,end) => html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const elements = {};
const el = id => elements[id] ||= {style:{},classList:{remove(){}},innerText:'',textContent:''};
const c = {document:{getElementById:el},window:{__portalBootState:{reference:'fallback-reference'}},
  loadingInterval:null,clearInterval(){},createPortalReference_:()=> 'new-reference'};
vm.createContext(c);
vm.runInContext(extract('function buildClientDiagnosticDetails_(', 'function resetLoadErrorUi_('),c);
vm.runInContext(extract('function showLoadError_(', 'function retryInitialLoad_('),c);
c.showLoadError_(secret,{reference:'test-reference',detail:secret,canRetry:true});
assert(!el('errorMsg').innerText.includes(secret));
assert.equal(el('errorDiagnostics').innerText,'Reference: test-reference');
assert.equal(el('errorRetryBtn').style.display,'inline-block');
c.showLoadError_('You do not have access.',{stage:'authorization'});
assert.equal(el('errorMsg').innerText,'You do not have access.');
assert.equal(el('errorDiagnostics').innerText,'Reference: fallback-reference');
assert(!extract('function clientDetails(', 'function showPrebootError(').includes('userAgent'));
assert(!extract('function clientDetails(', 'function showPrebootError(').includes('Detail:'));
console.log('PASS error privacy: sole monitored recipient, no fallback, dev suppression, private diagnostics, matching references, safe UI and authorization messages');
