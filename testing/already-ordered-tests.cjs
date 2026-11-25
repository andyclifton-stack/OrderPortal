const assert=require('assert'),path=require('path'),fs=require('fs'),vm=require('vm');
const {createRuntime}=require('./performance-fixtures.cjs');
const source=path.resolve(__dirname,'../Code.js');
const form={selectedDept:'Science',supplier:'Synthetic supplier',desc:'Already ordered test',qty:2,unitPrice:10,alreadyOrdered:true,finalCost:'24.50',deliveryDate:'2026-11-05',paymentMethod:'Invoice / on account',supplierOrderReference:'TEST-REF-123',files:[],clientRequestId:'already-001'};
function make(options={}){const r=createRuntime(source,0,{strictInputs:true,...options});r.api.logError_=()=>{};r.sheets.Users.rows[0].push('Processing Departments');r.sheets.Users.rows[2][1]='Science, English';r.sheets.Users.rows[2][8]='Science';return r;}
for(const actor of ['admin','staff']){
 const r=make(),a=r.api;r.setActor(actor+'@claremontschool.co.uk');
 const result=a.submitOrder(form);assert(result.saved,JSON.stringify(result));const row=r.sheets.Orders.rows.at(-1),c=a.getOrdersMetadataColumnsForRead_(r.sheets.Orders);
 assert(row[13]);assert(row[14]);assert.equal(row[15],24.5);assert.equal(row[10],20);assert.equal(row[c.paymentMethodIndex],form.paymentMethod);assert.equal(row[c.recordTypeIndex],'Order');assert(row[17].includes('TEST-REF-123'));assert.equal(row[c.processedByIndex],actor+'@claremontschool.co.uk');assert.equal(row[c.approvalStatusIndex],'NOT_REQUIRED');
 assert(a.submitOrder(form).replayed);assert.equal(r.sheets.Orders.rows.length,2);assert.equal(r.calls.batches,1);
 assert.equal(a.submitOrder({...form,finalCost:'25'}).saved,false);
}
{
 const r=make();
 r.setActor('staff@claremontschool.co.uk');
 const result=r.api.submitOrder({...form,paymentMethod:'Credit card'});
 assert(result.saved,JSON.stringify(result));
 const row=r.sheets.Orders.rows.at(-1), columns=r.api.getOrdersMetadataColumnsForRead_(r.sheets.Orders);
 assert.equal(row[columns.approvalStatusIndex],'AWAITING_SIGNOFF');
}
for(const change of [{selectedDept:'English'},{selectedDept:'Unknown'},{finalCost:'0'},{finalCost:'-1'},{finalCost:'1.234'},{paymentMethod:''},{deliveryDate:'garbage'},{supplierOrderReference:'x'.repeat(101)}]){
 const r=make();r.setActor('staff@claremontschool.co.uk');let denied=false;try{denied=!r.api.submitOrder({...form,...change}).saved;}catch{denied=true;}assert(denied,JSON.stringify(change));assert.equal(r.sheets.Orders.rows.length,1);
}
{
 const r=make();r.setActor('head@claremontschool.co.uk');assert.equal(r.api.submitOrder(form).saved,false,'Head title alone grants no ordering permission');
 assert(r.api.submitOrder({...form,alreadyOrdered:false}).saved,'ordinary requests still work');assert.equal(r.sheets.Orders.rows.at(-1)[13],'');
}
for(const options of [{failBeforeCommit:true},{loseCommitResponse:true}]){
 const r=make(options);try{r.api.submitOrder(form);}catch(e){assert(/SAVE_STATUS_UNKNOWN/.test(e.message));}
 assert.equal(r.sheets.Orders.rows.length,options.failBeforeCommit?1:2);
 if(options.loseCommitResponse)assert(r.api.submitOrder(form).replayed);
}
{
 const r=make();r.api.appendOrderApprovalAudit_=()=>{throw Error('Audit failed');};assert.throws(()=>r.api.submitOrder(form),/Audit failed/);assert.equal(r.sheets.Orders.rows.length,1);
}
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1].replace(/<\?[\s\S]*?\?>/g,'null'));
const elements={};for(const id of ['alreadyOrderedSection','editingOrderId','formAlreadyOrdered','formDept','alreadyOrderedFields','formFinalCost','formDeliveryDate','formOrderedPayment','formSupplierReference','formTotal','formNoChargeGroup','orderPaymentRequiredMark','formUnit','unitPriceRequiredMark','orderFormModeHelp','submitBtn'])elements[id]={value:'',checked:false,dataset:{},setAttribute(){}};
const caps={canManageOrders:true};const ctx={document:{getElementById:id=>elements[id]},currentUser:{processingDepartments:['Science']},canDo:k=>!!caps[k],orderSubmitBusy:false,updateCreateRecoveryNotice_(){},updateOrderBudgetWarning_(){}};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('      function canRecordAlreadyOrdered_()'),html.indexOf('      function sendOrder()')),ctx);
elements.formDept.value='Science';elements.formTotal.value='20.00';ctx.updateAlreadyOrdered_();assert(!elements.alreadyOrderedSection.hidden);assert(elements.alreadyOrderedFields.hidden);
elements.formAlreadyOrdered.checked=true;ctx.updateAlreadyOrdered_();assert.equal(elements.formFinalCost.value,'20.00');assert.equal(elements.submitBtn.innerText,'Save as ordered');assert(elements.formOrderedPayment.required);assert(!elements.formUnit.required);
elements.formFinalCost.value='24.50';elements.formFinalCost.dataset.edited='true';ctx.updateAlreadyOrdered_();assert.equal(elements.formFinalCost.value,'24.50');
elements.formDept.value='English';ctx.updateAlreadyOrdered_();assert(!ctx.canRecordAlreadyOrdered_());assert(elements.formAlreadyOrdered.checked,'retain the draft when changing to a temporarily ineligible budget');assert.equal(elements.formFinalCost.value,'24.50');
elements.formDept.value='Science';elements.formFinalCost.value='0';ctx.updateAlreadyOrdered_();assert(!elements.formNoChargeGroup.hidden);assert(!elements.formOrderedPayment.required);
elements.formAlreadyOrdered.checked=false;elements.editingOrderId.value='existing';ctx.updateAlreadyOrdered_();assert(elements.alreadyOrderedSection.hidden);assert(elements.formOrderedPayment.disabled);
console.log('Already ordered: atomic creation, final cost/payment/reference/delivery, approval rules, scoped permissions, Head denial, replay/failure recovery, UI visibility/reset/defaulting and syntax passed.');
