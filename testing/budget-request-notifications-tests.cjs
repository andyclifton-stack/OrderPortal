const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {createRuntime} = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
function make(options = {}) {
  const r = createRuntime(source, 0, {strictInputs:true,...options});
  r.sheets.Users.rows[0].push('Processing Departments');
  r.sheets.Users.rows[3][8] = 'Science';
  const add = (email,role,budgets,active=true,global=false) => r.sheets.Users.rows.push([email,'Science',role,'Senior','',active,global,false,budgets]);
  add('buyer@example.com','Staff','Science');
  add('other@example.com','Head','English');
  add('inactive@example.com','Head','Science',false);
  add('global@example.com','Staff','',true,true);
  add('title-only@example.com','Head','');
  add('test@example.com','Admin','Science'); // Existing Finance recipient.
  add('finance-scope@example.com','Wipro','Science'); // Finance ignores budget add-ons.
  add(' HEAD@claremontschool.co.uk ','Head','Science');
  r.notifications=[];
  r.api.buildNotificationWarning_=payloads=>{r.notifications.push(...payloads);return null;};
  r.setActor('staff@claremontschool.co.uk');
  return r;
}
const form={selectedDept:'Science',supplier:'Synthetic supplier',desc:'Budget notification test <safe>',qty:1,unitPrice:12.5,location:'Senior',files:[],clientRequestId:'notify-test-001'};
const recipients=r=>r.notifications.map(p=>p.to).sort();
const r=make();
assert(r.api.submitOrder(form).saved);
assert.deepEqual(recipients(r),['buyer@example.com','head@claremontschool.co.uk','test@example.com']);
const email=r.notifications.find(p=>p.to==='head@claremontschool.co.uk');
assert(email.body.includes('processing rights for this budget'));
assert(email.body.includes('&lt;safe&gt;'));
assert(email.body.includes('View purchase'));
assert(email.subject.includes('Science'));
assert(r.api.submitOrder(form).replayed);
assert.equal(r.notifications.length,3,'Receipt replay sends no duplicate emails');
const head=make();head.setActor('head@claremontschool.co.uk');
assert(head.api.submitOrder(form).saved);
assert.deepEqual(recipients(head),['buyer@example.com','test@example.com'],'Submitter gets no processor notification');
const onBehalf=make();onBehalf.setActor('head@claremontschool.co.uk');
assert(onBehalf.api.submitOrder({...form,requesterEmail:'staff@claremontschool.co.uk'}).saved);
assert.deepEqual(recipients(onBehalf),['buyer@example.com','test@example.com'],'Submitting for another person still excludes submitter');
const edited=make();assert(edited.api.submitOrder(form).saved);edited.notifications=[];
const row=edited.sheets.Orders.rows.at(-1);
assert(edited.api.submitOrder({...form,id:row[0],expectedVersion:edited.api.orderVersion_(row),desc:'Edited request'}).saved);
assert.deepEqual(recipients(edited),['staff@claremontschool.co.uk'],'Edit retains existing requester notification only');
const ordered=make();ordered.setActor('head@claremontschool.co.uk');
assert(ordered.api.submitOrder({...form,alreadyOrdered:true,finalCost:12.5,paymentMethod:'Credit card'}).saved);
assert(!ordered.notifications.some(p=>p.subject.startsWith('New request:')),'Already ordered retains its existing notifications');
const removed=make();removed.sheets.Users.rows[3][8]='English';
assert(removed.api.submitOrder(form).saved);assert(!recipients(removed).includes('head@claremontschool.co.uk'));
const inactive=make();inactive.sheets.Users.rows[3][5]=false;
assert(inactive.api.submitOrder(form).saved);assert(!recipients(inactive).includes('head@claremontschool.co.uk'),'Later duplicate cannot reactivate an inactive first row');
const over=make();over.sheets.Budgets.rows[1][3]=1;
assert(over.api.submitOrder(form).saved);assert(over.notifications.every(p=>p.subject.startsWith('[OVER BUDGET]')));
const legacy=make();legacy.sheets.Users.rows[0].pop();
assert(legacy.api.submitOrder(form).saved);assert.deepEqual(recipients(legacy),['test@example.com']);
const rejected=make();assert(!rejected.api.submitOrder({...form,unitPrice:0}).saved);assert.equal(rejected.notifications.length,0);
const failed=make({failBeforeCommit:true});try{failed.api.submitOrder(form);}catch{}assert.equal(failed.notifications.length,0);
const uncertain=make({loseCommitResponse:true});assert(uncertain.api.submitOrder(form).saved,'Receipt readback proves the commit after a lost response');assert.equal(uncertain.notifications.length,3);
assert(uncertain.api.submitOrder(form).replayed);assert.equal(uncertain.notifications.length,3,'Recovered save is not notified twice');
const out=path.resolve(__dirname,'../output/budget-notifications-20261105');fs.mkdirSync(out,{recursive:true});
// Restore the real notification functions in the isolated VM. No network exists.
const vm=require('vm'), code=fs.readFileSync(source,'utf8');
const delivery=make();
for(const [start,end] of [['function buildNotificationWarning_(', 'function getConfigurationHeaderIndex_('],['function sendEmailAlert_(', 'function uploadFileToDrive_(']]) {
  vm.runInContext(code.slice(code.indexOf(start),code.indexOf(end,code.indexOf(start))),delivery.api);
}
let sends=0;delivery.api.MailApp={sendEmail(){sends++;}};
const developmentMessages=[];
delivery.api.sendDevelopmentServiceEmail_=message=>developmentMessages.push(message);
assert(delivery.api.submitOrder(form).saved);assert.equal(sends,0,'DEV does not use MailApp');
assert.equal(developmentMessages.length,3);
assert(developmentMessages.every(message=>message.to==='andy.clifton@claremontschool.co.uk' && message.subject.startsWith('[DEV TEST]')));

delivery.setDevelopment(false);
delivery.api.developmentChatAndErrorAlertsSuppressed_=()=>false;
delivery.api.getDevelopmentNotificationEmail_=()=>'';
let renderedEmail;
delivery.api.sendPortalServiceEmail_=message=>{sends++;renderedEmail=message;if(sends===2)throw Error('Synthetic mail failure');};
const warning=delivery.api.submitOrder({...form,clientRequestId:'notify-failure-002'});
assert(warning.saved);assert.equal(sends,3,'A failed recipient does not stop later recipients');
assert(JSON.stringify(warning).includes('NOTIFICATION_FAILED'));
fs.writeFileSync(path.join(out,'email-preview.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Budget notification preview</title><body style="font-family:Arial;background:white;padding:20px"><p>Synthetic email preview — no email sent</p>'+renderedEmail.htmlBody+'</body>');
console.log('PASS: scoped recipients, self/on-behalf exclusion, active access, role restrictions, Finance deduplication, duplicate user rows, permission removal, legacy fields, new/edit/already-ordered flows, receipt replay, rejected/failed/uncertain saves, escaping and purchase link. No emails sent.');
