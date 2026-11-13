const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
function runtime(type='Invoice') {
 const nodes = {}, get = id => nodes[id] ||= {value:'',textContent:'',innerText:'',style:{},files:[],options:[{value:'Prep'}]};
 const calls = {tabs:[],confirm:[],messages:[]};
 const source = {id:'source',recordType:type,dept:'Science',supplier:'Subscription supplier',desc:'Monthly subscription',totalPrice:61.08,finalPrice:88.9,paymentMethod:'Credit card',invoiceNumber:'OLD',attachment:'old.pdf',qty:1,unitPrice:61.08,location:'Prep',reportingSite:'Prep'};
 const c = {document:{getElementById:get,querySelector:s=>s},globalData:{orders:[source]},orderSubmitBusy:false,invoiceSubmitBusy:false,invoiceRequestId:'old-request',canDo:()=>true,hasOrderDraft_:()=>false,guardPendingCreate_:()=>false,loadOrderDetails_:()=>false,showMsg:(...a)=>calls.messages.push(a),showConfirm:(...a)=>calls.confirm.push(a),updateInvoiceCreditHint:()=>{},clearRequiredFieldErrors:()=>{},getOrderCost_:o=>o.finalPrice!==''&&o.finalPrice!=null?o.finalPrice:o.totalPrice,isInvoiceOrder:o=>o.recordType==='Invoice',bootstrap:{Tab:function(s){this.show=()=>calls.tabs.push(s)}},updateRequesterChoices_:()=>{},resetOrderAttachmentState_:()=>calls.attachmentsReset=true,resetOrderForm_:()=>{},selectOrderFormDepartment:()=>{},toDateInputValue:()=>'',setExistingOrderAttachments_:()=>{}};
 c.invoiceRequiredFieldIds=[];
 Object.assign(c,{invoiceDepartmentTouched_:false,queuePortalDraftSave_(){},showDraftFilesNotice_(){},showDraftWarning_(){},clearDraftWarning_(){},isCancelledOrder:o=>o.status==='Cancelled',calcTotal(){}});
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function hasInvoiceDraft_()'),html.indexOf('const orderRequiredFieldIds')),c);
 vm.runInContext(html.slice(html.indexOf('function duplicateOrder('),html.indexOf('function cancelEdit()')),c);
 return {c,get,source,calls};
}
let r=runtime();r.get('invInvoiceNumber').value='old';r.get('invFiles').files=[];r.c.duplicateOrder('source',true);
assert.equal(r.get('invoiceFormTitle').textContent,'Duplicate invoice');assert.equal(r.get('invCost').value,88.9);assert.equal(r.get('invPaymentMethod').value,'Credit card');assert.equal(r.get('invInvoiceNumber').value,'');assert.equal(r.get('invFiles').value,'');assert.equal(r.get('invReportingSite').value,'');assert.equal(r.c.invoiceRequestId,'');assert(r.calls.tabs[0].includes('#tabLogInvoice'));
for(const field of ['invDept','invSupplier','invDesc'])assert(r.get(field).value);
r.c.prepLogInvoiceTab();assert.equal(r.get('invoiceFormTitle').textContent,'Duplicate invoice');r.c.prepLogInvoiceTab(true);assert.equal(r.get('invoiceFormTitle').textContent,'Log invoice / direct spend');
for(const method of ['', 'Cash', 'Invoice / on account']){r=runtime();r.source.paymentMethod=method;r.source.finalPrice=-13.45;r.c.duplicateOrder('source');assert.equal(r.get('invPaymentMethod').value,method==='Invoice / on account'?method:'');assert.equal(r.get('invCost').value,-13.45);}
r=runtime();r.get('invDesc').value='unfinished';r.c.duplicateOrder('source');assert.equal(r.calls.confirm.length,1);assert.equal(r.get('invDesc').value,'unfinished');r.calls.confirm[0][2]();assert.equal(r.get('invDesc').value,'Monthly subscription');
r=runtime();r.get('invFiles').files=[{}];r.c.duplicateOrder('source');assert.equal(r.calls.confirm.length,1);
r=runtime();r.c.canDo=cap=>cap!=='canLogInvoice';r.c.duplicateOrder('source');assert.equal(r.calls.messages.length,1);assert.equal(r.calls.tabs.length,0);
r=runtime();r.c.guardPendingCreate_=()=>true;r.c.duplicateOrder('source');assert.equal(r.calls.tabs.length,0);
for(const busy of ['orderSubmitBusy','invoiceSubmitBusy']){r=runtime();r.c[busy]=true;r.c.duplicateOrder('source');assert.equal(r.calls.tabs.length,0);}
r=runtime('Order');r.source.status='Cancelled';r.source.desc='CANCELLED - Replacement cable';r.source.dateNeeded='01/01/2025';r.c.duplicateOrder('source');assert.equal(r.get('formTitle').innerText,'Duplicate request');assert.equal(r.get('formDesc').value,'Replacement cable');assert.equal(r.get('formDateNeeded').value,'');assert.equal(r.get('editingOrderId').value,'');assert.strictEqual(r.calls.tabs[0],r.get('btnTabNew'));
r=runtime('Transfer');r.c.duplicateOrder('source');assert.equal(r.calls.tabs.length,0);
const {createRuntime}=require('./performance-fixtures.cjs');const backend=createRuntime(path.resolve(__dirname,'../Code.js'),4,{strictInputs:true});
const request={dept:'Science',supplier:'Subscription supplier',desc:'Monthly subscription',cost:88.90,paymentMethod:'Credit card',reportingSite:'Prep',invoiceNumber:'',files:[],clientRequestId:'duplicate-invoice-fixture'};
assert(backend.api.logInvoice(request).saved);const id=backend.sheets.Orders.rows.at(-1)[0];const saved=backend.api.getDashboardData().orders.find(o=>o.id===id);assert.equal(saved.recordType,'Invoice');assert.equal(saved.paymentMethod,'Credit card');assert.equal(saved.totalPrice,88.9);assert.equal(saved.invoiceNumber,'');assert(backend.api.logInvoice(request).replayed);
console.log('Invoice duplication tests passed: type routing, latest signed cost, methods, reference/attachment reset, permissions, drafts, busy/recovery guards, ordinary orders and invoice save/replay.');
