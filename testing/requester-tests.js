const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
const { createRuntime } = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
const before = path.resolve(__dirname, '../../implementation-backups/requester-20260915/Code.js');
const rt = createRuntime(source, 3);
const { api, sheets } = rt;
const sam = 'sam@claremontschool.co.uk';
const submitter = 'staff@claremontschool.co.uk';
rt.setActor(submitter);
sheets.Users.rows.push([sam, 'Science', 'Staff', 'Prep', '', true, false, false]);
sheets.Users.rows.push(['inactive@claremontschool.co.uk', 'Science', 'Staff', 'Prep', '', false]);
sheets.Users.rows.push(['other@claremontschool.co.uk', 'English', 'Staff', 'Prep', '', true]);
let user = api.getUserContext();
assert.ok(user.requesterChoices.science.some(p => p.email === sam));
assert.ok(!user.requesterChoices.english, 'Do not expose unrelated department colleagues');
assert.ok(!JSON.stringify(user.requesterChoices).includes('inactive@'));
assert.ok(!JSON.stringify(user.requesterChoices).includes('finance@'), 'Non-requesting roles excluded');
assert.equal(api.resolveOrderRequester_(user, 'Science', ''), submitter);
assert.equal(api.resolveOrderRequester_(user, 'Science', sam.toUpperCase()), sam);
assert.throws(() => api.resolveOrderRequester_(user, 'English', sam), /no longer available/);
const form = {selectedDept:'Science', supplier:'Test supplier', desc:'Requested for Sam', qty:1, unitPrice:5, location:'Prep', files:[], requesterEmail:sam};
let emails=[];
api.buildNotificationWarning_=payloads=>{emails.push(...payloads);return null;};
const result=api.submitOrder(form);
assert.equal(result.success,true,JSON.stringify(result));
const order=sheets.Orders.rows.at(-1);
const columns=api.getOrdersMetadataColumnsForRead_(sheets.Orders);
assert.equal(order[3],sam);
assert.equal(order[columns.submittedByIndex],submitter);
assert.equal(order[11],'Prep');
assert.ok(emails.some(payload=>payload.options?.replyTo===sam),'Finance replies go to selected requester');
assert.ok(emails.some(payload=>String(payload.body).includes('Submitted by')));
assert.equal(api.getDashboardData().orders[0].submittedBy,submitter);
const chat=api.buildOrderChatMessage_({requesterEmail:sam,order:{requester:sam,submittedBy:submitter}});
assert.ok(chat.includes('submitted by Staff') && chat.includes('Requester: '+sam));
const oldCount=sheets.Orders.rows.length;
sheets.Users.rows.find(row=>row[0]===sam)[5]=false;
assert.equal(api.submitOrder(form).success,false,'Removed access revalidated at submission');
assert.equal(sheets.Orders.rows.length,oldCount);
assert.equal(api.submitOrder({...form, requesterEmail:'other@claremontschool.co.uk'}).success,false);
sheets.Users.rows.find(row=>row[0]===sam)[5]=true;
rt.setActor('admin@claremontschool.co.uk');
assert.equal(api.submitOrder({...form,id:order[0],requesterEmail:'other@claremontschool.co.uk',desc:'Edited'}).success,true);
assert.equal(order[3],sam,'Editing retains original requester');
assert.equal(order[columns.submittedByIndex],submitter,'Editing retains actual submitter');
rt.setActor(submitter);
sheets.Users.rows.find(row=>row[0]===submitter)[6]=true;
user=api.getUserContext();
assert.equal(api.shouldRequireIndependentSignoff_(user,order,columns),true,'Submitting for someone else cannot bypass sign-off');
order[columns.processedByIndex]=submitter;
order[columns.approvalStatusIndex]='AWAITING_SIGNOFF';
assert.equal(api.getOrderRecordActions_(user,order,columns).canApprove,false);
assert.equal(api.reviewOrderApproval(order[0],'APPROVE','').success,false);
// A submitter must also be blocked when somebody else processed the order.
order[columns.processedByIndex]='head@claremontschool.co.uk';
assert.equal(api.reviewOrderApproval(order[0],'APPROVE','').success,false);
rt.setActor('admin@claremontschool.co.uk');
assert.equal(api.getOrderRecordActions_(api.getUserContext(),order,columns).canApprove,true);
order[columns.processedByIndex]=submitter;
order[columns.approvalStatusIndex]='APPROVED';
api.resetOrderApprovalAfterMaterialChange_(api.getPortalSpreadsheet_(),sheets.Orders,sheets.Orders.rows.length,order,columns,'admin@claremontschool.co.uk','Correction');
assert.equal(order[columns.approvalStatusIndex],'AWAITING_SIGNOFF');
assert.equal(api.getOrderSubmittedBy_(['','','',sam],{}),sam,'Legacy orders fall back to requester');

// Compare against the exact pre-change source using identical synthetic data.
const old=createRuntime(before,100), current=createRuntime(source,100);
old.api.getDashboardData();current.api.getDashboardData();
assert.equal(current.calls.reads,old.calls.reads,'No additional spreadsheet reads for dropdown');
const big=createRuntime(source,0);
for(let n=0;n<1000;n++)big.sheets.Users.rows.push(['colleague'+n+'@example.com','Science','Staff','Senior','',true]);
let start=performance.now();
const bigUser=big.api.getUserContext();
const ms=performance.now()-start;
console.log('1000-colleague authentication + choices: '+ms.toFixed(1)+' ms; dashboard reads unchanged at '+current.calls.reads);
assert.equal(bigUser.requesterChoices.science.length,1002);

// Execute the actual form functions with a lightweight DOM, without remote services.
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
class Element {
  constructor(value=''){this.value=value;this.options=[];this.style={};this.dataset={};}
  add(option){this.options.push(option);if(this.options.length===1)this.value=option.value;}
  set innerHTML(value){this.options=[];this.value='';}
}
const ids=['formRequester','requesterField','formDept','formLocation','editingOrderId'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
elements.formDept.value='Science';
elements.formLocation.options=[{value:'Prep'},{value:'Senior'},{value:'Clyde'}];
elements.formLocation.value='Senior';
const ctx={document:{getElementById:id=>elements[id]},currentUser:{email:submitter,defaultSite:'Senior',requesterChoices:{science:[{email:sam,name:'Sam',defaultSite:'Prep'}]}},Option:function(text,value){this.text=text;this.value=value;},orderLocationManuallyChosen:false};
vm.createContext(ctx);
for(const name of ['updateRequesterChoices_','applyRequesterSite_']){
  const start=html.indexOf('      function '+name+'(');
  const end=html.indexOf('\n      }',start)+8;
  vm.runInContext(html.slice(start,end),ctx);
}
ctx.updateRequesterChoices_(true);
assert.equal(elements.requesterField.style.display,'');
assert.equal(elements.formRequester.value,submitter);
elements.formRequester.value=sam;ctx.applyRequesterSite_();
assert.equal(elements.formLocation.value,'Prep');
ctx.orderLocationManuallyChosen=true;elements.formLocation.value='Clyde';
elements.formRequester.value=submitter;ctx.applyRequesterSite_();
assert.equal(elements.formLocation.value,'Clyde','Manual site survives requester changes');
ctx.orderLocationManuallyChosen=false;
elements.formDept.value='English';ctx.updateRequesterChoices_(true);
assert.equal(elements.requesterField.style.display,'none');
assert.equal(elements.formRequester.value,submitter);
assert.equal(elements.formLocation.value,'Senior');
elements.formDept.value='Science';elements.editingOrderId.value='EXISTING';ctx.updateRequesterChoices_(true);
assert.equal(elements.requesterField.style.display,'none','Existing requester cannot be replaced by edit');
elements.editingOrderId.value='';ctx.updateRequesterChoices_(true);
assert.equal(elements.formRequester.value,submitter,'New request defaults to Me');
console.log('Requester tests passed: scope, inactivity, save identity, email routing, edits, approvals, performance and form behaviour.');
