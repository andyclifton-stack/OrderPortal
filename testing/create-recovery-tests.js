const assert=require('assert'),path=require('path');
const {createRuntime}=require('./performance-fixtures.cjs');
const source=path.resolve(__dirname,'../Code.js');
const make=opts=>{const r=createRuntime(source,3,{strictInputs:true,...opts});r.api.logError_=()=>{};return r;};
const order={selectedDept:'Science',supplier:'Recovery test',desc:'Synthetic',qty:1,unitPrice:5,location:'Senior',files:[],clientRequestId:'order-recovery'};
const invoice={dept:'Science',supplier:'Recovery test',desc:'Synthetic',cost:5,paymentMethod:'Credit card',reportingSite:'Senior',invoiceNumber:'',files:[],clientRequestId:'invoice-recovery'};
for(const [kind,input,method] of [['order',order,'submitOrder'],['invoice',invoice,'logInvoice']]){
 const r=make({loseCommitResponse:true});let uploads=0;
 r.api.uploadFileToDrive_=()=>{uploads++;return {url:'https://example.org/test',fileId:'synthetic-file'};};
 const form={...input,files:[{name:'test.txt',type:'text/plain',data:'dGVzdA=='}]};
 const batch=r.api.Sheets.Spreadsheets.batchUpdate;
 r.api.Sheets.Spreadsheets.batchUpdate=(...args)=>{try{return batch(...args);}finally{const sheet=r.sheets['Portal Save Receipts'],native=sheet.getRange.bind(sheet);sheet.getRange=(row,col,...other)=>{if(col===2)throw Error('Receipt response interrupted');return native(row,col,...other);};}};
 assert.throws(()=>r.api[method](form),/SAVE_STATUS_UNKNOWN/);assert.equal(uploads,1);
 assert.equal(r.api.getPortalSaveStatus(kind,form.clientRequestId).state,'DONE');
 assert(r.api[method](form).replayed);assert.equal(uploads,1,'Receipt checked before uploading attachments again');
 assert.equal(r.sheets.Orders.rows.length,5,'Only one new record exists');
 assert.equal(r.api.getPortalSaveStatus(kind,form.clientRequestId,true).state,'DONE','Completed records cannot be cancelled by recovery');
 r.sheets.Users.rows[4][2]='Admin';r.setActor('finance@claremontschool.co.uk');
 assert.equal(r.api.getPortalSaveStatus(kind,form.clientRequestId).state,'NOT_FOUND','Recovery cannot see another actor receipt');
}
for(const [kind,input,method] of [['order',order,'submitOrder'],['invoice',invoice,'logInvoice']]){
 const r=make();assert.equal(r.api.getPortalSaveStatus(kind,input.clientRequestId).state,'NOT_FOUND');
 assert.equal(r.api.getPortalSaveStatus(kind,input.clientRequestId,true).state,'CANCELLED');
 const blocked=r.api[method](input);assert.equal(blocked.saved,false);assert.match(blocked.message,/cancelled/);assert.equal(r.sheets.Orders.rows.length,4);
 assert(r.api[method]({...input,clientRequestId:input.clientRequestId+'-new'}).saved);
}
{
 const r=make({failBeforeCommit:true});assert.throws(()=>r.api.submitOrder(order),/SAVE_STATUS_UNKNOWN/);
 assert.equal(r.api.getPortalSaveStatus('order',order.clientRequestId,true).state,'PENDING','Uncertain commits are never abandoned automatically');
 assert.throws(()=>r.api.submitOrder(order),/SAVE_STATUS_UNKNOWN/);
}
{
 const r=make();let cleaned=[];
 r.api.uploadFileToDrive_=()=>{assert.equal(r.api.getPortalSaveStatus('order',order.clientRequestId,true).state,'CANCELLED');return {url:'https://example.org/test',fileId:'late-upload'};};
 r.api.trashUploadedFiles_=ids=>{cleaned=Array.from(ids);};
 const result=r.api.submitOrder({...order,files:[{name:'test.txt',type:'text/plain',data:'dGVzdA=='}]});
 assert.equal(result.saved,false);assert.match(result.message,/cancelled/);assert.deepEqual(cleaned,['late-upload']);assert.equal(r.sheets.Orders.rows.length,4,'A cancelled upload cannot commit later');
}
{
 const r=make();const row=r.sheets.Orders.rows[1],v=r.api.orderVersion_(row);
 assert(r.api.addNote('PERF-0','One note',v).saved);
 assert.equal(r.api.addNote('PERF-0','One note',v).saved,false,'Retrying an uncertain note cannot append twice');
 assert.equal(r.sheets.Orders.rows[1][17].split('One note').length-1,1);
 assert.equal(r.api.addNote('PERF-0','Missing version').saved,false);
}
{
 const r=make();r.setActor('finance@claremontschool.co.uk');assert.throws(()=>r.api.getPortalSaveStatus('order','test'),/permission/);
 assert.throws(()=>r.api.getPortalSaveStatus('transfer','test'),/Invalid request type/);
}
console.log('Create recovery tests passed: lost responses, receipt checks before attachments, cancelled late requests, uncertain commits, actor isolation and idempotent note retries.');
