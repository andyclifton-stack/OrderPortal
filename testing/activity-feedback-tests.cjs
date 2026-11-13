const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'../Index.html'),'utf8');
function extract(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));}
function setup(){
 const elements={},calls=[],readers=[],timers=new Map();let nextTimer=0;
 const el=id=>elements[id] ||= {id,style:{display:''},attrs:{},events:{},textContent:id==='saveAttachmentOnlyButton'?'Save attachment only':'Update Status',value:'',files:[],disabled:false,hidden:false,
  classList:{values:new Set(['initial-load']),add(s){this.values.add(s)},remove(s){this.values.delete(s)}},setAttribute(k,v){this.attrs[k]=v},reportValidity(){return true},
  addEventListener(k,f){this.events[k]=f},removeEventListener(k){delete this.events[k]},querySelectorAll(){return ['saveAttachmentOnlyButton','saveProcessButton','finAttachments','finMessage','financeClose'].map(el)}};
 el('finAttachments').files=[{name:'test.txt',size:12,type:'text/plain'}];el('orderCorrectionFields').style.display='none';el('finId').value='test-order';
 el('finFinalPrice').value='10.00';el('finNoChargeGroup').hidden=true;el('finPaymentMethod').value='Credit card';
 el('spinner').style.display='none';el('deptFilter').value='Science';
 const run=new Proxy({}, {get(_,name){if(name==='withSuccessHandler')return f=>{run.success=f;return run};if(name==='withFailureHandler')return f=>{run.failure=f;return run};if(name==='success'||name==='failure')return _[name];return (...args)=>calls.push({name,args,success:run.success,failure:run.failure});}});
 const c={document:{getElementById:el},navigator:{onLine:true},lastRefreshReference_:'',canDo:()=>true,financeOrderVersion:'v1',resetLoadErrorUi_(){},portalRun_:()=>run,
  financeMode_:'order',financeOrder_:{id:'test-order',version:'v1'},financeAmountAcknowledged_:'',isInvoiceOrder:o=>o.recordType==='Invoice',
  FileReader:class{constructor(){readers.push(this)}readAsDataURL(){}},setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer},clearTimeout(id){timers.delete(id)},
  normalizeWriteResponse_:r=>r,showMsg:(...args)=>calls.push({message:args}),showSavedResult_:(...args)=>calls.push({saved:args}),loadData:()=>calls.push({refresh:true}),getModal_:()=>({hide:()=>calls.push({closed:true})}),reviewScope_:'',exportInFlight_:false};
 vm.createContext(c);
 vm.runInContext(extract('function showProcessing(msg)', 'window.retryInitialLoad_'),c);
 vm.runInContext(extract('const activeMutations_ = new Set();', "let orderRequestId ="),c);
 vm.runInContext(extract('let financeSaveBusy_ = false;', 'function formatApprovalHistory_'),c);
 vm.runInContext(extract('function setOrderPageBusy_(', 'function portalRead_('),c);
 return {c,el,calls,readers,timers};
}
const tick=()=>new Promise(setImmediate);
(async()=>{
 for(const outcome of ['success','rejected','failure','timeout','read-error']){
  const t=setup();t.c.saveFinance(true);t.c.saveFinance(true);
  assert.equal(t.readers.length,1,'Repeated clicks must not reread files or dispatch another save');
  assert.equal(t.el('loadingText').innerText,'Saving attachments…');assert.equal(t.el('spinner').style.display,'block');
  assert(!t.el('overlay').classList.values.has('initial-load'));assert(t.el('overlay').classList.values.has('processing-state'));
  assert(t.el('saveAttachmentOnlyButton').disabled);assert(t.el('saveProcessButton').disabled);assert(t.el('finMessage').disabled);
  let prevented=false;t.el('financeModal').events['hide.bs.modal']({preventDefault(){prevented=true}});assert(prevented);
  if(outcome==='read-error')t.readers[0].onerror();else t.readers[0].onload({target:{result:'data:text/plain;base64,dGVzdA=='}});
  await tick();
  const request=t.calls.find(c=>c.name==='updateOrder');
  if(outcome!=='read-error'){
   assert(request);assert.equal(request.args[0],'test-order');assert.equal(request.args[8],true);
   if(outcome==='timeout')[...t.timers.values()][0]();
   else if(outcome==='failure')request.failure(new Error('offline'));
   else request.success({success:outcome==='success',saved:outcome==='success',message:'result'});
  } else assert(!request);
  assert(!t.el('saveAttachmentOnlyButton').disabled);assert(!t.el('saveProcessButton').disabled);
  assert.equal(t.el('saveAttachmentOnlyButton').textContent,'Save attachment only');assert.equal(t.el('financeModal').attrs['aria-busy'],'false');assert(!t.el('financeModal').events['hide.bs.modal']);
  assert.equal(t.el('overlay').style.display,'none');
  if(outcome==='success'){assert(t.calls.some(c=>c.closed));assert(t.calls.some(c=>c.saved?.[1]==='Evidence saved'));}
  else assert(!t.calls.some(c=>c.closed),'Failure preserves the form');
  if(outcome==='timeout'||outcome==='failure'){const n=t.calls.length;request.success({success:true,saved:true});assert.equal(t.calls.length,n,'Late responses must not close or overwrite the form');}
 }
 const t=setup();t.c.saveFinance(false);assert.equal(t.el('loadingText').innerText,'Saving update…');
 t.readers[0].onload({target:{result:'data:text/plain;base64,dGVzdA=='}});await tick();t.calls.find(c=>c.name==='updateOrder').success({success:true,saved:true});
 const invoice=setup();invoice.c.financeMode_='invoice';invoice.c.financeOrder_.recordType='Invoice';
 invoice.c.saveFinance(false);invoice.readers[0].onload({target:{result:'data:text/plain;base64,dGVzdA=='}});await tick();
 const process=invoice.calls.find(c=>c.name==='processInvoice');
 assert.equal(process.args[0].expectedVersion,'v1');
 assert.equal(process.args[0].cost,undefined,'Processing does not submit an editable invoice amount');
 process.success({success:true,saved:true});
 t.c.setOrderPageBusy_(true);assert.equal(t.el('viewLoadingText').textContent,'Loading Science…');assert(!t.el('viewLoadingNotice').hidden);assert(t.el('orderPageNotice').hidden);assert(t.el('orderTable').inert);
 t.c.setOrderPageBusy_(false,true);assert(t.el('viewLoadingNotice').hidden);assert(t.el('orderPageSpinner').hidden);assert(!t.el('orderTable').inert);
 t.el('deptFilter').value='English';t.c.setOrderPageBusy_(true);t.c.setOrderPageBusy_(false,false);
 assert(t.el('viewLoadingText').textContent.includes('Your previous view is still displayed'));assert(!t.el('viewLoadingRetry').hidden);assert(t.el('orderTable').inert);
 t.c.setOrderPageBusy_(true,false,false);assert(!t.el('viewLoadingNotice').hidden,'Keep the failed-view warning during an automatic retry');assert(t.el('viewLoadingText').textContent.includes('Your previous view is still displayed'));
 t.c.setOrderPageBusy_(true);assert(t.el('viewLoadingRetry').hidden);t.c.setOrderPageBusy_(false,true);assert(t.el('viewLoadingNotice').hidden);
 t.c.setOrderPageBusy_(true,true,false);assert(t.el('viewLoadingNotice').hidden);assert.equal(t.el('orderTable').attrs['data-loading-feedback'],'false','Automatic refresh must not flash loading feedback');
 t.c.setOrderPageBusy_(false,true);assert(t.el('orderPageNotice').hidden);assert.equal(t.el('orderPageStatusText').textContent,'','No routine list caption');
 t.el('filterCard').style.display='none';t.c.setOrderPageBusy_(true);assert(t.el('viewLoadingNotice').hidden);assert(!t.el('orderPageNotice').hidden);assert(!t.el('orderPageSpinner').hidden);
 t.c.setOrderPageBusy_(false,false);assert(t.el('viewLoadingNotice').hidden);assert(!t.el('orderPageRetry').hidden);
 t.c.navigator.onLine=false;t.c.setOrderPageBusy_(false,false);assert(t.el('orderPageStatusText').textContent.includes('offline'));
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
 console.log('PASS: visible progress after startup, finance double-click protection, locked form, success/rejection/failure/timeout/late callback/file-read failure, restored controls, department feedback/retry, quiet background refresh and script syntax.');
})().catch(error=>{console.error(error);process.exitCode=1});
