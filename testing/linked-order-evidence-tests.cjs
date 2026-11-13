const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8');
const section = (start,end) => html.slice(html.indexOf(start),html.indexOf(end));

function setup() {
 const elements = new Map(), timers = [], requests = [];
 const order = {id:'matched',version:'match-version',invoiceNumber:'EXISTING',actions:{canAddEvidence:true}};
 const records = new Map([[order.id,order]]);
 let shown = null;
 const show = id => {
   if (shown?.id === id) return;
   assert.equal(shown,null,'another dialog is still visible');
   shown = element(id);
 };
 const makeElement = id => {
   const listeners = new Map();
   const el = {id,hidden:true,disabled:false,files:[],value:'',resetCount:0,
     focus(){this.focused=true;},reset(){this.resetCount++;},
     classList:{contains:name=>name === 'show' && shown?.id === id},
     addEventListener(name,callback,options){listeners.set(name,[...(listeners.get(name) || []),{callback,once:options?.once}]);},
     emit(name){const current=listeners.get(name) || [];listeners.set(name,current.filter(entry=>!entry.once));current.forEach(entry=>entry.callback());}
   };
   return el;
 };
 const formIds = ['detailsEvidenceReference','detailsEvidenceReferenceGroup','detailsEvidenceFiles','detailsEvidenceSave','detailsEvidenceBack','detailsEvidenceFeedback'];
 const makeForm = () => {
   const form = makeElement('detailsEvidenceForm');
   const children = formIds.map(makeElement);
   form.reset = () => {
      form.resetCount++;
      children.find(child=>child.id==='detailsEvidenceReference').value='';
      children.find(child=>child.id==='detailsEvidenceFiles').files=[];
   };
   form.cloneNode = makeForm;
   form.replaceWith = replacement => replacement.attach();
   form.attach = () => [form,...children].forEach(child=>elements.set(child.id,child));
   return form;
 };
 makeForm().attach();
 const element = id => {
   if (elements.has(id)) return elements.get(id);
   const el = makeElement(id);
   elements.set(id,el);
   return el;
 };
 const hide = id => {
   assert.equal(shown?.id,id);
   shown = null;
   element(id).emit('hidden.bs.modal');
 };
 const runner = {
   withSuccessHandler(callback){this.success=callback;return this;},
   withFailureHandler(callback){this.failure=callback;return this;},
   saveOrderInvoiceEvidence(input){requests.push({kind:'reference',input,success:this.success});},
   updateOrder(...input){requests.push({kind:'attachment',input,success:this.success});}
 };
 const sandbox = {
   document:{getElementById:element,querySelector:selector=>selector === '.modal.show' ? shown : null},
   setTimeout:callback=>timers.push(callback),
   getModal_:id=>({show:()=>show(id),hide:()=>hide(id)}),
   openDetails:id=>{
      assert(records.has(id));
      sandbox.renderedOrder=records.get(id);
      vm.runInContext('bindDetailsClose_();detailsRecordId_=String(renderedOrder.id);document.getElementById("detailsLinkedBack").hidden=!linkedDetailsHistory_.length;',sandbox);
      element('detailsLinkedStatus').hidden=true;
      element('detailsEvidenceForm').hidden=true;
      show('detailsModal');
   },
   portalRead_:async (name,args)=>{
      assert.equal(name,'getOrderRecord');
      if (!records.has(args[0])) throw new Error('Record unavailable');
      return records.get(args[0]);
   },
   replaceLoadedOrder_:loaded=>assert.equal(loaded,records.get(loaded.id)),
   financeSaveBusy_:false,
   beginFinanceSave_:(_attachmentOnly,id,buttonId)=>{
      assert.equal(id,'detailsModal');assert.equal(buttonId,'detailsEvidenceSave');
      sandbox.financeSaveBusy_=true;return ()=>{sandbox.financeSaveBusy_=false;};
   },
   financeFilesValid_:files=>files.length <= 5 && files.every(file=>file.size <= 5*1024*1024),
   readFinanceFiles_:async files=>files.map(file=>file.name),
   mutationRun_:()=>runner,
   normalizeWriteResponse_:response=>response,
   isInvoiceOrder:()=>false,
   showFinanceFeedback_:(id,message,match)=>{const box=element(id);box.hidden=false;box.textContent=message;box.match=match;},
   loadData:()=>{}
 };
 vm.createContext(sandbox);
 vm.runInContext(section('let linkedOrderLoading_ = false;','function setupReturnControls_') +
   section('function sendPurchaseEvidence_','async function saveFinance(') +
   section('let detailsRequest_ = null;','function loadDetailsForView_') +
   section('function showAfterDetails_','function canCancelFromDetails_'),sandbox);
 return {sandbox,order,records,element,show,hide,requests,flush:()=>timers.splice(0).forEach(run=>run()),visible:()=>shown?.id};
}

(async()=>{
 const t = setup();
 const origin = t.element('financeModal');
 origin.value='unsaved value';origin.files=[{name:'unsaved.pdf'}];
 t.show(origin.id);
 await t.sandbox.openLinkedOrder_(t.order.id);
 assert.equal(t.visible(),'detailsModal');
 t.sandbox.openDetailsEvidence_({...t.order,actions:{}});
 assert(t.element('detailsEvidenceForm').hidden);
 t.sandbox.openDetailsEvidence_(t.order);
 const form = t.element('detailsEvidenceForm');
 const feedback = t.element('detailsEvidenceFeedback');
 const button = t.element('detailsEvidenceSave');
 const submit = () => form.onsubmit({preventDefault(){}});
 assert.equal(t.visible(),'detailsModal');
 assert(!form.hidden);
 await submit();
 assert.match(feedback.textContent,/choose a file or enter/i);
 t.element('detailsEvidenceReference').value=' NEW-REF ';
 await submit();
 assert.equal(t.requests.length,1);
 assert.equal(t.requests[0].kind,'reference');
 assert.equal(t.requests[0].input.invoiceNumber,'NEW-REF');
 assert.equal(t.requests[0].input.expectedVersion,t.order.version);
 t.requests[0].success({success:false,saved:false,message:'Duplicate',matchingOrderId:'other'});
 assert.equal(feedback.match,'other');
 await submit();
 t.requests[1].success({success:true,saved:true,message:'Invoice evidence saved to the purchase.'});
 assert.match(feedback.textContent,/saved/i);
 assert.equal(t.element('detailsInvoiceNumber').textContent,'NEW-REF');
 assert.equal(t.element('detailsEvidenceReference').value,'NEW-REF');
 assert(button.disabled);
 t.hide('detailsModal');t.flush();
 assert.equal(t.visible(),origin.id);
 assert.equal(origin.value,'unsaved value');
 assert.equal(origin.files[0].name,'unsaved.pdf');

 const locked = setup();
 locked.sandbox.openDetailsEvidence_({...locked.order,returnInfo:{refunds:[{id:'credit'}]}});
 assert(locked.element('detailsEvidenceReferenceGroup').hidden);
 const submitLocked = () => locked.element('detailsEvidenceForm').onsubmit({preventDefault(){}});
 await submitLocked();
 assert.equal(locked.element('detailsEvidenceFeedback').textContent,'Choose a file to add.');
 locked.element('detailsEvidenceReference').value='ignored';
 locked.element('detailsEvidenceFiles').files=[{name:'invoice.pdf',size:512}];
 await submitLocked();
 const attachment = locked.requests[0];
 assert.equal(attachment.kind,'attachment');
 assert.equal(attachment.input[4],'');
 assert.equal(attachment.input[6],locked.order.version);
 assert.deepEqual(Array.from(attachment.input[7]),['invoice.pdf']);
 assert.equal(attachment.input[8],true);

 const transition = setup();
 transition.show('invoiceEditModal');
 await transition.sandbox.openLinkedOrder_(transition.order.id);
 transition.sandbox.showAfterDetails_(()=>transition.show('reportingSiteModal'),'reportingSiteModal');
 transition.flush();
 assert.equal(transition.visible(),'reportingSiteModal');
 transition.hide('reportingSiteModal');
 transition.show('successModal');
 transition.flush();
 assert.equal(transition.visible(),'successModal');
 transition.hide('successModal');transition.flush();
 assert.equal(transition.visible(),'invoiceEditModal');

 const nested = setup();
 const other={...nested.order,id:'other',version:'other-version'};
 const third={...nested.order,id:'third',version:'third-version'};
 nested.records.set(other.id,other);nested.records.set(third.id,third);
 nested.sandbox.openDetails(nested.order.id);
 nested.sandbox.openDetailsEvidence_(nested.order);
 const originalForm=nested.element('detailsEvidenceForm');
 const originalFile={name:'original-invoice.pdf',size:512};
 nested.element('detailsEvidenceReference').value=' ORIGINAL-REFERENCE ';
 nested.element('detailsEvidenceFiles').files=[originalFile];
 await originalForm.onsubmit({preventDefault(){}});
 nested.requests[0].success({success:false,saved:false,message:'Duplicate',matchingOrderId:other.id});
 await nested.sandbox.openLinkedOrder_(other.id);
 assert(!nested.element('detailsLinkedBack').hidden);
 assert.notEqual(nested.element('detailsEvidenceForm'),originalForm);
 assert.equal(nested.element('detailsEvidenceFiles').files.length,0);
 nested.sandbox.openDetailsEvidence_(other);
 const otherForm=nested.element('detailsEvidenceForm');
 const otherFile={name:'other-invoice.pdf',size:512};
 nested.element('detailsEvidenceFiles').files=[otherFile];
 await nested.sandbox.openLinkedOrder_(third.id);
 nested.records.delete(other.id);
 await nested.sandbox.returnToLinkedDetails_();
 assert.equal(nested.sandbox.renderedOrder.id,third.id);
 assert.match(nested.element('detailsLinkedStatus').textContent,/could not be opened/i);
 nested.records.set(other.id,other);
 await nested.sandbox.returnToLinkedDetails_();
 assert.equal(nested.element('detailsEvidenceForm'),otherForm);
 assert.equal(nested.element('detailsEvidenceFiles').files[0],otherFile);
 nested.records.set(nested.order.id,{...nested.order,version:'newest-version'});
 await nested.sandbox.returnToLinkedDetails_();
 assert.equal(nested.element('detailsEvidenceForm'),originalForm);
 assert.equal(nested.element('detailsEvidenceReference').value,' ORIGINAL-REFERENCE ');
 assert.equal(nested.element('detailsEvidenceFiles').files[0],originalFile);
 assert.equal(nested.element('detailsEvidenceFeedback').match,other.id);
 assert(nested.element('detailsLinkedBack').hidden);
 await originalForm.onsubmit({preventDefault(){}});
 assert.equal(nested.requests[1].input.expectedVersion,nested.order.version);
 assert.equal(nested.requests[1].input.files[0],originalFile.name);
 console.log('Linked order evidence passed: scope, reference validation, refund-locked append, one visible modal, and nested Back with original files, reference, feedback and save version.');
})().catch(error=>{console.error(error);process.exitCode=1;});
