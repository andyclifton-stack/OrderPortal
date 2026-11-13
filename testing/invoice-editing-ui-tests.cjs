const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
const source=html.slice(html.indexOf('let invoiceEditRecord_ = null;'),html.indexOf('let financeSaveBusy_ = false;'));
function setup(){
 const ids=['editInvoiceDept','invoiceEditReference','editInvoiceSupplier','editInvoiceNumber','editInvoiceDesc','editInvoiceCost','editInvoicePayment','editInvoiceReportingSite','editInvoiceReason','editInvoiceFiles','editInvoiceAttachments','invoiceEditError','saveInvoiceEditButton','invoiceEditModal','invoiceEditForm'];
 const elements=Object.fromEntries(ids.map(id=>[id,{value:'',textContent:'',disabled:false,files:[],options:[],add(option){this.options.push(option)},reportValidity(){return true},setAttribute(){},addEventListener(){},removeEventListener(){}}]));
 elements.invoiceEditModal.querySelectorAll=()=>ids.filter(id=>!['invoiceEditModal','invoiceEditForm'].includes(id)).map(id=>elements[id]);
 const calls=[];let success,failure;
 const runner={withSuccessHandler(f){success=f;return this},withFailureHandler(f){failure=f;return this},updateInvoice(f){calls.push(f)}};
 const order={id:'test',version:'version-one',dept:'Science',supplier:'Supplier',desc:'Test',totalPrice:10,paymentMethod:'Credit card',recordType:'Invoice',actions:{canEditInvoice:true}};
 const ctx={document:{getElementById:id=>elements[id]},globalData:{orders:[order]},loadOrderDetails_:()=>false,getVisibleBudgetDepartments:()=>['Science'],Option:function(text,value){this.text=text;this.value=value},isCompletedOrder:()=>false,getOrderCost_:o=>String(o.totalPrice),getSafeLink:()=>'',getModal_:()=>({show(){},hide(){}}),mutationRun_:()=>runner,normalizeWriteResponse_:x=>x,showMsg(){},showSavedResult_(){},loadData(){}};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.openInvoiceEditor('test');
 return {ctx,elements,calls,success:r=>success(r),failure:()=>failure(new Error('Transport failure'))};
}
(async()=>{
 let t=setup();t.elements.editInvoiceReason.value='Correct amount';
 await t.ctx.saveInvoiceEdit();await t.ctx.saveInvoiceEdit();assert.equal(t.calls.length,1,'double click sends one request');
 assert(t.elements.saveInvoiceEditButton.disabled);
 t.success({success:false,saved:false,message:'Check amount',code:'INVOICE_AMOUNT_WARNING'});
 assert(!t.elements.saveInvoiceEditButton.disabled);assert(t.elements.saveInvoiceEditButton.textContent.includes('Amount is correct'));
 await t.ctx.saveInvoiceEdit();assert.equal(t.calls[1].amountConfirmed,true);
 t.success({success:true,saved:true});assert(!t.elements.saveInvoiceEditButton.disabled);
 t=setup();t.elements.editInvoiceReason.value='Correction';await t.ctx.saveInvoiceEdit();t.failure();
 assert(t.elements.saveInvoiceEditButton.disabled,'uncertain save cannot immediately be repeated');
 assert(t.elements.invoiceEditError.textContent.includes('refresh the Order List'));
 t.ctx.openInvoiceEditor('test');assert(!t.elements.saveInvoiceEditButton.disabled,'reopened editor restores controls');
 t=setup();t.elements.editInvoiceReason.value='   ';await t.ctx.saveInvoiceEdit();assert.equal(t.calls.length,0);
 t.elements.editInvoiceReason.value='Correction';t.elements.editInvoiceCost.value='0';await t.ctx.saveInvoiceEdit();assert.equal(t.calls.length,0);
 console.log('Invoice editor UI: double-click suppression, busy controls, warning acknowledgement, success restoration, uncertain-save block, reopened form and validation passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
