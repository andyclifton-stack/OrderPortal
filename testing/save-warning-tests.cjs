const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'../Index.html'),'utf8');
function setup(storage=new Map()) {
 const elements={};
 const element=id=>elements[id] ||= {value:'',hidden:true,style:{},dataset:{},textContent:'Save',classList:{add(){},remove(){}},files:[]};
 let success,failure; const timers=[];
 const run={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;},logInvoice(){}};
 const c={document:{getElementById:element,querySelector:()=>({})},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  globalData:{meta:{environment:'test'}},currentUser:{email:'test@example.com'},orderSubmitBusy:false,invoiceSubmitBusy:false,invoiceRequestId:'',invoiceRequiredFieldIds:[],SUBMIT_REQUEST_TIMEOUT_MS:45000,
  canDo:()=>true,clearRequiredFieldErrors(){},markRequiredFieldError(){},hasBudgetCalculationError_:()=>false,createPortalReference_:()=> 'request-1',
  portalRun_:()=>run,confirmMissingDraftFiles_:()=>false,queuePortalDraftSave_(){},createAttemptForms_:new Map(),createFormSnapshot_:()=> 'synthetic unchanged form',
  validateInvoiceForm:()=>({isValid:true,values:{dept:'Science',supplier:'Test',desc:'Test',cost:1,paymentMethod:'Credit card'}}),
  normalizeWriteResponse_:v=>v,showProcessing(){element('overlay').style.display='flex';},showMsg(){},showSavedResult_(){},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},google:{script:{run}}};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function updateInvoiceCreditHint('),html.indexOf('function parseOrderMoney(')),c);
 vm.runInContext(html.slice(html.indexOf('function setInvoiceButtonsSaving('),html.indexOf('function createRecoveryKey_(')),c);
 vm.runInContext(html.slice(html.indexOf('function createRecoveryKey_('),html.indexOf('let createRecoveryBusy_')),c);
 c.guardPendingCreate_=()=>!!c.pendingCreate_('invoice');
 return {c,elements,storage,timers,success:v=>success(v),failure:()=>failure(new Error('Lost response'))};
}
(async()=>{
 for(const outcome of ['success','failure','timeout','rejected','unconfirmed']) {
  const t=setup();t.c.saveLogInvoice(true);await new Promise(setImmediate);
  assert(t.c.pendingCreate_('invoice'),'Recovery reference is saved before dispatch');
  assert.equal(t.elements.saveRecoveryNotice.hidden,true,'Normal in-flight save has no warning');
  if(outcome==='failure')t.failure();
  else if(outcome==='timeout')t.timers[0]();
  else t.success(outcome==='success'?{success:true,saved:true}:outcome==='rejected'?{success:false,saved:false}:{success:false});
  const uncertain=['failure','timeout','unconfirmed'].includes(outcome);
  assert.equal(t.elements.saveRecoveryNotice.hidden,!uncertain,outcome);
  assert.equal(!!t.c.pendingCreate_('invoice'),uncertain,outcome+' preserves only unresolved references');
  if(outcome==='timeout') {t.success({success:true,saved:true});assert.equal(t.elements.saveRecoveryNotice.hidden,false,'Late callback cannot hide an unresolved timeout');}
 }
 const t=setup();t.c.saveLogInvoice(true);await new Promise(setImmediate);
 const reloaded=setup(t.storage);reloaded.c.updateCreateRecoveryNotice_();
 assert.equal(reloaded.elements.saveRecoveryNotice.hidden,false,'Reload restores interrupted-save warning');
 assert.equal(reloaded.elements.recoverInvoiceButton.hidden,false);
 t.c.orderSubmitBusy=false;t.c.rememberCreate_('order','old-order');
 assert.equal(t.elements.saveRecoveryNotice.hidden,false,'An active invoice must not hide an unresolved order');
 assert.equal(t.elements.recoverOrderButton.hidden,false);
 assert.equal(t.elements.recoverInvoiceButton.hidden,true);
 t.c.orderSubmitBusy=true;t.c.updateCreateRecoveryNotice_();
 assert.equal(t.elements.saveRecoveryNotice.hidden,true,'Active orders also suppress their own warning');
 // Exercise the exact order completion/timeout restoration callback.
 t.c.submitBtn={};t.c.defaultButtonText='Submit';
 vm.runInContext('var restore = '+html.match(/const restoreButton = (\(\) => \{[\s\S]*?\n            \});/)[1],t.c);
 t.c.restore();assert.equal(t.elements.recoverOrderButton.hidden,false);
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1].replace(/<\?[\s\S]*?\?>/g,'"test"'));
 console.log('Save warning checks passed: normal save, success, rejection, failure, timeout, late response, reload, concurrent recovery, order restore and syntax.');
})().catch(e=>{console.error(e);process.exitCode=1;});
