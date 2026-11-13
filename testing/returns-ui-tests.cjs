const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
const source=html.slice(html.indexOf('let returnFormOrder_ = null'),html.indexOf('function openFinance('));
function setup(){
 const ids=['finId','returnFormTitle','returnPurchaseSummary','returnFormHelp','returnRefundFields','returnAmount','returnDate','returnConfirmed','returnKeepPending','returnKeepPendingGroup','returnNote','returnNoteLabel','returnFormError','saveReturnButton','financeModal','returnModal','returnForm','returnPreview','refundReference','refundEvidence','returnReversalFields','returnCreditId','returnReopen','returnMatchingOrder'];
 const elements=Object.fromEntries(ids.map(id=>[id,{value:'',textContent:'',disabled:false,checked:false,hidden:false,files:[],reportValidity(){return true},checkValidity(){return true},addEventListener(){},removeEventListener(){},replaceChildren(...children){this.children=children;}}]));
 elements.finId.value='test';elements.returnModal.querySelectorAll=()=>ids.filter(x=>!x.includes('Modal')).map(x=>elements[x]);
 const calls=[];let success,failure;
 const runner={withSuccessHandler(f){success=f;return this},withFailureHandler(f){failure=f;return this},saveOrderReturn(f){calls.push(f)}};
 const order={id:'test',version:'one',desc:'Purchase',returnInfo:{remaining:24,pending:true,refunds:[{id:'credit',date:'2026-11-05',amount:10},{id:'reversed',amount:7,reversalId:'rev'}]}};
 const ctx={Intl,Date,Option:function(text,value){this.text=text;this.value=value},formatCurrency:value=>'£'+Number(value).toFixed(2),document:{getElementById:id=>elements[id]},globalData:{orders:[order]},getModal_:()=>({show(){},hide(){}}),mutationRun_:()=>runner,normalizeWriteResponse_:x=>x,showSavedResult_(){},loadData(){},financeFilesValid_:()=>true,readFinanceFiles_:async files=>files};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('function toDateInputValue('),html.indexOf('function getBulkReviewState(')),ctx);
 vm.runInContext(source,ctx);ctx.openReturnForm_('refund');
 return {ctx,elements,calls,success:r=>success(r),failure:()=>failure()};
}
(async()=>{
 let t=setup();assert.equal(t.elements.returnAmount.value,'');assert.equal(t.elements.returnDate.value,'');assert(t.elements.returnKeepPending.checked);
 t.elements.returnAmount.value='24';t.ctx.updateReturnAmount_();assert(t.elements.returnKeepPendingGroup.hidden);
 t.elements.returnAmount.value='10';t.ctx.updateReturnAmount_();assert(!t.elements.returnKeepPendingGroup.hidden);
 assert(t.elements.returnKeepPending.checked,'A change to full amount and back must preserve the pending choice');
 assert(t.elements.returnPreview.textContent.includes('£14.00'));
 await t.ctx.saveReturn_();assert.equal(t.calls.length,0,'A refund requires reference or evidence');
 t.elements.refundReference.value='credit-ref';
 const attempt=t.ctx.saveReturn_();await t.ctx.saveReturn_();await attempt;assert.equal(t.calls.length,1);assert(t.elements.saveReturnButton.disabled);
 assert.equal(t.calls[0].refundReference,'credit-ref');
 t.success({success:false,message:'Check date'});assert(!t.elements.saveReturnButton.disabled);assert.equal(t.elements.returnFormError.textContent,'Check date');
 await t.ctx.saveReturn_();await t.success({success:true,saved:true});assert(!t.elements.saveReturnButton.disabled);
 t=setup();t.elements.refundReference.value='credit-ref';await t.ctx.saveReturn_();t.failure();assert(t.elements.saveReturnButton.disabled);assert(t.elements.returnFormError.textContent.includes('refresh'));
 t.ctx.openReturnForm_('mark');assert(!t.elements.saveReturnButton.disabled);assert(t.elements.returnRefundFields.hidden);assert(t.elements.returnNote.required);assert(!t.elements.returnConfirmed.required);
 t.ctx.openReturnForm_('reverse');assert.deepEqual(t.elements.returnCreditId.children.map(item=>item.value),['','credit']);assert(t.elements.returnNote.required);
 assert.equal(t.elements.returnCreditId.children[1].text,'05/11/2026 · £10.00 · credit');
 console.log('Return UI passed: defaults, partial-only checkbox, single submission, validation, success, uncertain response and reopening.');
})().catch(e=>{console.error(e);process.exitCode=1});
