const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRuntime} = require('./performance-fixtures.cjs');

const project = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(project,'AmazonDevelopment.js'),'utf8');
const runtime = options => {
  const r = createRuntime(path.join(project,'Code.js'),7,{strictInputs:true,...options});
  r.api.Drive = {Files:{get:id=>({id,mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}})}};
  vm.runInContext(source,r.api);
  return r;
};
const snapshot = r => Object.fromEntries(['Users','Budgets','Orders'].map(name=>[name,JSON.stringify(r.sheets[name].rows)]));

{
  const r = runtime();
  const originals = Object.fromEntries(['Users','Budgets','Orders'].map(name=>[name,r.sheets[name].rows.slice(1).map(row=>row.slice())]));
  const first = r.api.seedOrderPortalUsabilityDevelopmentFixtures();
  assert.equal(first.environment,'DEV');
  assert.equal(first.notifications,'SUPPRESSED');
  assert.equal(first.liveWrites,false);
  assert.equal(first.created.users,6);
  assert.equal(first.created.budgets,2);
  assert.equal(first.created.orders,23);
  for (const [name,rows] of Object.entries(originals)) {
    assert.deepEqual(r.sheets[name].rows.slice(1,rows.length+1),rows,name + ' retained existing records');
  }
  const budgets = r.sheets.Budgets.rows.slice(-2);
  assert(budgets.every(row=>String(row[2]).startsWith('=SUMPRODUCT(')));
  assert(budgets.every(row=>/^DEV UX (Prep|Senior)$/.test(row[0])));
  const scope = email => ({mode:'test',email:'dev-ux-'+email+'@claremontschool.co.uk'});
  const read = (role,id) => r.api.portalRpc('getOrderRecord',[id],scope(role));
  assert(read('staff','DEV-UX-REQ-OWN').actions.canEdit);
  assert(read('staff','DEV-UX-REQ-FOR').actions.canEdit);
  assert.equal(read('staff','DEV-UX-RETURN-BASE').actions.canRefund,false);
  assert(read('buyer','DEV-UX-RETURN-BASE').actions.canRefund);
  assert.equal(read('lead','DEV-UX-RETURN-BASE').actions.canRefund,false);
  assert(read('admin','DEV-UX-INV-REVIEW').actions.canApprove);
  assert(read('finance','DEV-UX-INV-LOGGED').actions.canProcess);
  assert(read('processor','DEV-UX-REQ-NO-CHARGE').actions.canProcess);
  assert(read('buyer','DEV-UX-RETURN-QUEUE').returnInfo.pending);
  const priorCommitment=read('admin','DEV-UX-PRIOR-COMMITMENT');
  assert.equal(priorCommitment.status,'Pending');
  assert.equal(priorCommitment.totalPrice,55);
  assert.equal(priorCommitment.reportingSite,'Prep');
  const original = snapshot(r);
  const again = r.api.seedOrderPortalUsabilityDevelopmentFixtures();
  assert.equal(again.created.users + again.created.budgets + again.created.orders,0);
  assert.deepEqual(snapshot(r),original);
}

{
  const r = runtime(), before = snapshot(r);
  r.setActor('staff@claremontschool.co.uk');
  assert.throws(()=>r.api.seedOrderPortalUsabilityDevelopmentFixtures(),/Admin required/);
  r.setActor('admin@claremontschool.co.uk');
  r.setDevelopment(false);
  r.api.SpreadsheetApp.getActiveSpreadsheet = ()=>{throw Error('Unexpected live workbook access');};
  assert.throws(()=>r.api.seedOrderPortalUsabilityDevelopmentFixtures(),/DEV only/);
  assert.deepEqual(snapshot(r),before);
}

{
  const r = runtime({failBeforeCommit:true}), before = snapshot(r);
  assert.throws(()=>r.api.seedOrderPortalUsabilityDevelopmentFixtures(),/atomic request rejection|could not be confirmed/);
  assert.deepEqual(snapshot(r),before);
}

console.log('Usability DEV fixtures passed: six roles, two budgets, 23 labelled records including prior-year carry-over, append-only repeat, live and non-Admin denial, and atomic failure protection.');
