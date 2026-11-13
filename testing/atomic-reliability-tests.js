const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {createRuntime} = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
const make = options => {
  const r = createRuntime(source, 3, {strictInputs:true, ...options});
  r.api.logError_ = () => {};
  return r;
};
const form = {selectedDept:'Science', supplier:'Review supplier', desc:'Synthetic test', qty:1,
  unitPrice:10, location:'Senior', files:[], clientRequestId:'request-001'};
const version = (r,id) => r.api.getDashboardData().orders.find(o => o.id === id).version;

{
  const r=make(); const n=r.sheets.Orders.rows.length;
  assert(r.api.submitOrder(form).saved);
  const replay=r.api.submitOrder(form);
  assert(replay.saved && replay.replayed);
  assert.equal(r.sheets.Orders.rows.length,n+1);
  assert.equal(r.calls.batches,1);
  assert.equal(r.api.submitOrder({...form,desc:'Changed payload'}).success,false);
  assert.equal(r.api.submitOrder({...form,clientRequestId:''}).success,false);
}
{
  const r=make({failBeforeCommit:true}); const before=JSON.stringify(r.sheets.Orders.rows);
  const transfer={fromDept:'Science',toDept:'English',amount:50,clientRequestId:'transfer-001'};
  assert.throws(()=>r.api.createBudgetTransfer(transfer),/SAVE_STATUS_UNKNOWN/);
  assert.equal(JSON.stringify(r.sheets.Orders.rows),before,'Failed atomic save changes neither side');
  assert.throws(()=>r.api.createBudgetTransfer(transfer),/SAVE_STATUS_UNKNOWN/,'Uncertain request must not be submitted twice');
}
{
  const r=make({loseCommitResponse:true});
  const transfer={fromDept:'Science',toDept:'English',amount:50,clientRequestId:'transfer-002'};
  assert(r.api.createBudgetTransfer(transfer).saved);
  assert(r.api.createBudgetTransfer(transfer).replayed);
  const rows=r.sheets.Orders.rows.slice(4);
  assert.equal(rows.length,2);assert.equal(rows[0][15]+rows[1][15],0);
  assert.equal(r.calls.batches,1);
}
{
  const r=make();r.api.bumpDataVersion_=()=>{throw Error('Property service unavailable');};
  assert(r.api.submitOrder(form).saved,'Bookkeeping failure must not misreport a committed save');
  assert.equal(r.sheets.Orders.rows.length,5);
}
{
  const r=make();const initial=version(r,'PERF-1');
  const edit={...form,id:'PERF-1',selectedDept:'English',expectedVersion:initial};
  assert(r.api.submitOrder({...edit,supplier:'Editor one'}).saved);
  const second=r.api.submitOrder({...edit,desc:'Editor two'});
  assert.equal(second.saved,false);assert.match(second.message,/changed/);
  assert.equal(r.sheets.Orders.rows[2][4],'Editor one');
  assert.equal(r.api.submitOrder({...edit,expectedVersion:''}).saved,false);
}
{
  const r=make();let row=r.sheets.Orders.rows[2];
  row[3]='head@claremontschool.co.uk';row[22]=row[3];row[23]='AWAITING_SIGNOFF';row[24]=1;row[13]=new Date();row[15]=10;
  const original=version(r,'PERF-1');
  assert(r.api.updateOrder('PERF-1','',900,'','',null,original).saved);
  const stale=r.api.reviewOrderApproval('PERF-1','APPROVE','',original);
  assert.equal(stale.success,false);assert.match(stale.error,/changed/);
  assert(r.api.reviewOrderApproval('PERF-1','APPROVE','',version(r,'PERF-1')).saved);
}
{
  const r=make();const before=JSON.stringify(r.sheets.Orders.rows);
  r.api.appendOrderFieldChanges_=()=>{throw Error('Audit failure before commit');};
  assert.throws(()=>r.api.submitOrder({...form,id:'PERF-1',selectedDept:'English',expectedVersion:version(r,'PERF-1')}),/Audit failure/);
  assert.equal(JSON.stringify(r.sheets.Orders.rows),before,'Audit failure must not leave edited order fields');
}
{
  const r=make();const invoice={dept:'Science',supplier:'Acme',desc:'Invoice',cost:50,paymentMethod:'Credit card',reportingSite:'Unassigned',invoiceNumber:'INV-01',files:[],clientRequestId:'invoice-001'};
  assert(r.api.logInvoice(invoice).saved);assert(r.api.logInvoice(invoice).replayed);
  const duplicate=r.api.logInvoice({...invoice,supplier:' ACME ',invoiceNumber:'inv-01',clientRequestId:'invoice-002'});
  assert.equal(duplicate.saved,false);assert.match(duplicate.message,/already recorded/);
}
{
  const r=make();const original=r.api.Sheets.Spreadsheets.batchUpdate;let requests;
  r.api.Sheets.Spreadsheets.batchUpdate=(payload,id)=>{requests=payload.requests;return original(payload,id);};
  assert(r.api.submitOrder({...form,supplier:'=1+1',desc:'=Users!A2'}).saved);
  const cells=requests.flatMap(q=>q.updateCells?q.updateCells.rows.flatMap(row=>row.values):[]);
  assert(cells.some(cell=>cell.userEnteredValue?.stringValue==='=1+1'));
  assert(!cells.some(cell=>cell.userEnteredValue?.formulaValue));
  assert.equal(r.sheets.Orders.rows[2][16],'=FORMULA_PRESERVE');
}
{
  const r=make();const compact=r.api.getDashboardData({compact:true}),full=r.api.getDashboardData();
  const orders=compact.orderRows.map(row=>Object.fromEntries(compact.orderFields.map((key,i)=>[key,row[i]])));
  assert.equal(JSON.stringify(orders),JSON.stringify(full.orders));
  const privateSetup=fs.readFileSync(path.resolve(__dirname,'../setupSystem.js'),'utf8');
  assert(!/^function\s+\w+\(/m.test(privateSetup.replace(/^function\s+\w+_\(/gm,'')));
  const ctx={getPortalSpreadsheet_:()=>({getSheetByName:()=>({getLastRow:()=>1})}),isDevelopmentRuntime_:()=>true};
  vm.createContext(ctx);vm.runInContext(privateSetup,ctx);
  assert.throws(()=>ctx.setupSystem_(),/existing data/);
  ctx.isDevelopmentRuntime_=()=>false;assert.throws(()=>ctx.setupSystem_(),/disabled/);
}
console.log('Atomic reliability: duplicate suppression, lost responses, failed commits, stale edits/approvals, audit failure, literal text, compact transport and setup protection passed.');

{
 const r=make();r.properties.DEV_SPREADSHEET_ID='synthetic-live';
 assert.throws(()=>r.api.getPortalSpreadsheet_(),/separate from the live/);
}
{
 const r=make();const calls=[];r.api.MailApp={sendEmail:()=>calls.push('email')};r.api.UrlFetchApp={fetch:()=>calls.push('chat')};
 assert(r.api.sendPortalErrorNotification_(Error('test'),'test').skipped);
 assert(r.api.sendOrderChatAlert_({configuration:{isValid:true}}).skipped);
 assert.equal(calls.length,0);
}

assert.equal(make().api.isValidConfigurationEmail_('=1+1@example.com'),false,'Configuration email must never become a spreadsheet formula');
