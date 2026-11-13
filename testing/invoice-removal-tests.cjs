const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {createRuntime}=require('./performance-fixtures.cjs');
const source=path.resolve(__dirname,'../Code.js'), code=fs.readFileSync(source,'utf8');
function fixture(processed=true, amount=28.8) {
  const r=createRuntime(source,4,{strictInputs:true}), {api,sheets}=r;
  vm.runInContext(code.slice(code.indexOf('function appendOrderFieldChanges_('),code.indexOf('function collectOrderFieldChanges_(')),api);
  api.logError_=()=>{};
  const row=sheets.Orders.rows[1].slice();
  Object.assign(row,{0:'remove-me',1:'Science',4:'Supplier',6:'Entered twice',8:1,9:amount,10:amount,13:processed?new Date('2026-07-01T12:00:00Z'):'',14:'',15:processed?amount:'',18:'',20:'Invoice',23:'AWAITING_SIGNOFF'});
  sheets.Orders.rows.push(row);
  const record=()=>api.getOrderRecord('remove-me');
  return {...r,row,record,form:{id:'remove-me',expectedVersion:record().version,reason:'Duplicate'}};
}
for (const processed of [true,false]) for (const amount of [28.8,0,-12]) {
  const {api,sheets,row,record,form}=fixture(processed,amount);
  const before=record(), untouched=JSON.stringify(sheets.Orders.rows.slice(0,-1));
  const overview=()=>api.getOverviewDashboardData({summaryOnly:true,period:'All'}).overview;
  const spent=overview().actualSpend, committed=overview().pendingValue;
  assert.equal(before.actions.canRemoveInvoiceRecord,true);
  assert.equal(api.portalRpc('removeInvoiceRecord',[form],null).saved,true);
  const after=record();
  assert.equal(after.status,'Removed');assert.equal(after.finalPrice,0);assert.equal(after.totalPrice,amount);
  assert.equal(after.attachment,before.attachment);assert.equal(after.desc,before.desc);
  assert.equal(after.actions.canRemoveInvoiceRecord,false);assert.equal(after.actions.canApprove,false);assert.equal(after.actions.canEditInvoice,false);
  assert.match(after.notes,/Invoice record removed.*Reason: Duplicate/);
  assert.equal(JSON.stringify(sheets.Orders.rows.slice(1,-1)),JSON.stringify(JSON.parse(untouched).slice(1)));
  if(processed)assert.equal(Math.round((spent-overview().actualSpend)*100),Math.round(amount*100));
  else assert.equal(Math.round((committed-overview().pendingValue)*100),Math.round(amount*100));
  const active=api.getOrderExportPage({query:{department:'All',search:'remove-me'}});
  const removed=api.getOrderExportPage({query:{department:'All',search:'remove-me',recordView:'removed',pendingOnly:true,excludeInvoices:true}});
  assert.equal(active.orders.length,0);assert.equal(removed.orders.length,1);assert.equal(removed.orders[0].status,'Removed');
  assert(!api.getOrderExportPage({mode:'master'}).orders.some(o=>o.id==='remove-me'));
  const audit=sheets['Order Change Audit'].rows.slice(1);
  assert(audit.every(r=>r[0] instanceof Date && r[1]==='remove-me' && r[2]==='admin@claremontschool.co.uk'));
  assert(audit.some(r=>r[3]==='Status' && r[4]===(processed?'Processed':'Pending') && r[5]==='Removed'));
  assert(audit.some(r=>r[3]==='Removal reason' && r[5]==='Duplicate'));
  assert.equal(api.removeInvoiceRecord(form).code,'ORDER_CHANGED');assert.equal(sheets['Order Change Audit'].rows.length,audit.length+1);
}
for (const overrides of [{reason:''},{reason:'Invalid'},{reason:'Other',explanation:' '},{expectedVersion:'stale'}]) {
  const {api,sheets,form}=fixture(), before=JSON.stringify(sheets.Orders.rows);
  assert.equal(api.removeInvoiceRecord({...form,...overrides}).saved,false);
  assert.equal(JSON.stringify(sheets.Orders.rows),before);
}
{
  const {api,record,form}=fixture();
  assert.equal(api.removeInvoiceRecord({...form,reason:'Other',explanation:'Wrong accounting period'}).saved,true);
  assert.match(record().notes,/Other: Wrong accounting period/);
}
for(const actor of ['staff','finance','head']){
  const {api,sheets,form,setActor,record}=fixture();setActor(actor+'@claremontschool.co.uk');
  assert.equal(record().actions.canRemoveInvoiceRecord,false);
  const before=JSON.stringify(sheets.Orders.rows);assert.equal(api.removeInvoiceRecord(form).saved,false);assert.equal(JSON.stringify(sheets.Orders.rows),before);
}
for(const flag of ['isPreview','isSimulated']){
  const {api,sheets,form}=fixture(), getUser=api.getAuthorizedUserContext_;
  api.getAuthorizedUserContext_=()=>({...getUser(),[flag]:true});
  const before=JSON.stringify(sheets.Orders.rows);assert.equal(api.removeInvoiceRecord(form).saved,false);assert.equal(JSON.stringify(sheets.Orders.rows),before);
}
for(const returnInfo of [{pending:true,parentId:'',refunds:[]},{pending:false,parentId:'original',refunds:[]},{pending:false,parentId:'',refunds:[{id:'credit'}]}]){
  const {api,sheets,form,record}=fixture();api.getOrderReturnInfo_=()=>returnInfo;
  assert.equal(record().actions.canRemoveInvoiceRecord,false);
  const before=JSON.stringify(sheets.Orders.rows);assert.equal(api.removeInvoiceRecord(form).saved,false);assert.equal(JSON.stringify(sheets.Orders.rows),before);
}
{
  const {api,sheets,form}=fixture(), before=JSON.stringify(sheets.Orders.rows);
  api.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('Atomic write failed');};
  assert.throws(()=>api.removeInvoiceRecord(form),/SAVE_STATUS_UNKNOWN/);
  assert.equal(JSON.stringify(sheets.Orders.rows),before);assert.equal(sheets['Order Change Audit'].rows.length,0);
}
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
for(const [i,match] of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())if(match[1].trim())new vm.Script(match[1],{filename:'Index-inline-'+i});
console.log('Invoice removal: pending/processed/credit/zero amounts, permissions, reason validation, unchanged other records, atomic audit, stale saves, failure safety, removed view, exports and browser syntax passed.');
