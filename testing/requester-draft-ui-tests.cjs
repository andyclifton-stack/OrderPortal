const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8');
const source = (start,end) => html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));

function portal(storage, drafts, options = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const node = {value:'',files:[],options:[],style:{},dataset:{},addEventListener(){}};
      if (id === 'invFiles') Object.defineProperty(node,'value',{get(){ return ''; },set(value){ if (!value) this.files=[]; }});
      elements.set(id,node);
    }
    return elements.get(id);
  };
  element('formQty').value = '1';
  element('formDept').options = (options.departments || ['Science','English']).map(value => ({value}));
  element('formDept').value = 'Science';
  element('formRequester').value = 'staff@example.test';
  element('formRequester').options = ['staff@example.test','colleague@example.test'].map(value => ({value}));
  element('formLocation').value = 'Senior';
  element('invDept').value = 'Science';
  element('invDept').options = element('formDept').options;
  const context = {
    File, Date, Map, Set, JSON, Array, Object, String, Number,
    DataTransfer:class { constructor() { this.files = []; this.items = {add:file => this.files.push(file)}; } },
    document:{getElementById:element,querySelector:() => null,addEventListener(){}},
    window:{addEventListener(){}},sessionStorage:{getItem:key => storage.get(key),setItem:(key,value) => storage.set(key,value),removeItem:key => storage.delete(key)},
    setTimeout,clearTimeout,globalData:{meta:{environment:'dev'}},currentUser:{email:'staff@example.test'},orderLocationManuallyChosen:false,
    pendingOrderFiles:[],existingOrderAttachments:[],removedOrderAttachments:new Set(),
    editingOrderVersion:'',editingOrderRecord_:null,orderDepartmentTouched_:false,invoiceDepartmentTouched_:false,
    invoiceSubmitBusy:false,invoiceRequestId:'',invoiceRequiredFieldIds:[],
    createPortalReference_:() => 'test-tab',canDo:() => true,canRecordAlreadyOrdered_:() => !options.disallowOrdered,
    updateRequesterChoices_(){},updateOrderFormGlCode(){},updateInvoiceCreditHint(){},renderOrderAttachments_(){},
    showDraftWarning_:(id,message) => { element(id).textContent = message; },
    clearDraftWarning_:(id) => { element(id).textContent = ''; },clearRequiredFieldErrors(){},
    showConfirm:(title,message,confirm) => { context.confirmation = {title,message,confirm}; }
  };
  vm.createContext(context);
  vm.runInContext(source('function hasInvoiceDraft_()', 'const orderRequiredFieldIds') +
    source('function hasOrderDraft_()', 'function hasUnsavedInput_()') +
    source('function captureDraftRouting_()', 'function isFinanceLiveView_()'),context);
  context.draftStoreRequest_ = async (method,key,value) => {
    if (options.noDatabase) throw new Error('Storage unavailable');
    if (method === 'put') drafts.set(key,value);
    if (method === 'delete') drafts.delete(key);
    return drafts.get(key);
  };
  return {context,element};
}

(async () => {
  const storage = new Map(), drafts = new Map();
  const first = portal(storage,drafts);
  await first.context.restorePortalDraft_();
  const file = new File(['synthetic evidence'],'quote.txt',{type:'text/plain',lastModified:42});
  first.element('formDept').value = 'English';
  first.element('formRequester').value = 'colleague@example.test';
  first.element('formLocation').value = 'Prep';
  first.element('formDesc').value = 'Saved draft';
  first.element('formAlreadyOrdered').checked = true;
  first.element('formFinalCost').value = '13.50';
  first.element('formFinalCost').dataset.edited = 'true';
  first.context.orderLocationManuallyChosen = true;
  first.context.pendingOrderFiles.push(file);
  first.element('invDept').value = 'English';
  first.element('invDesc').value = 'Separate invoice draft';
  first.element('invFiles').files = [file];
  const routing = first.context.captureDraftRouting_();
  first.element('formDept').value = 'Science';
  first.element('formLocation').value = 'Senior';
  first.element('invDept').value = 'Science';
  first.context.restoreDraftRouting_(routing);
  assert.equal(first.element('formDept').value,'English');
  assert.equal(first.element('formLocation').value,'Prep');
  assert.equal(first.element('invDept').value,'English');
  first.context.persistPortalDraft_();

  const delayed = portal(storage,drafts);
  const databaseRequest = delayed.context.draftStoreRequest_;
  let release;
  delayed.context.draftStoreRequest_ = (method,...args) => method === 'get'
    ? new Promise(resolve => { release = () => resolve(databaseRequest(method,...args)); })
    : databaseRequest(method,...args);
  const loading = delayed.context.restorePortalDraft_();
  delayed.context.persistPortalDraft_();
  assert.equal(drafts.size,1,'Leaving before draft restoration finishes must not clear the stored draft');
  release();
  await loading;

  const reloaded = portal(storage,drafts);
  await reloaded.context.restorePortalDraft_();
  assert.equal(reloaded.element('formDesc').value,'Saved draft');
  assert.equal(reloaded.element('formDept').value,'English');
  assert.equal(reloaded.element('formRequester').value,'colleague@example.test');
  assert.equal(reloaded.element('formLocation').value,'Prep');
  assert.equal(reloaded.element('formAlreadyOrdered').checked,true);
  assert.equal(reloaded.element('formFinalCost').value,'13.50');
  assert.equal(await reloaded.context.pendingOrderFiles[0].text(),'synthetic evidence');
  assert.equal(reloaded.element('invDept').value,'English');
  assert.equal(reloaded.element('invFiles').files[0].name,'quote.txt');

  const revoked = portal(storage,drafts,{departments:['Science'],disallowOrdered:true});
  await revoked.context.restorePortalDraft_();
  assert.equal(revoked.element('formDept').value,'','Never silently substitute a charging department');
  assert.equal(revoked.element('formAlreadyOrdered').checked,true,'Never silently change a placed purchase into a pending request');
  assert.match(revoked.element('orderDraftWarning').textContent,/Access or requester options changed/);
  assert.equal(revoked.element('invDept').value,'');

  const limited = portal(storage,drafts,{noDatabase:true});
  await limited.context.restorePortalDraft_();
  assert.equal(limited.element('formDesc').value,'Saved draft');
  assert.equal(limited.context.pendingOrderFiles.length,0);
  assert.equal(limited.element('orderDraftFileNotice').dataset.missing,'true','Prompt to reattach when File storage is unavailable');

  // Keep the previous IDB value around to model a refresh before deletion/update completes.
  const staleStorage = new Map(drafts);
  reloaded.element('invSupplier').value = 'Synthetic supplier';
  reloaded.element('invInvoiceNumber').value = 'INV-123';
  reloaded.context.invoiceDepartmentTouched_ = true;
  reloaded.context.discardInvoiceDraft_();
  assert.match(reloaded.context.confirmation.message,/Synthetic supplier · Invoice INV-123 · English/);
  assert.equal(reloaded.element('invFiles').files.length,1,'Merely opening confirmation must keep the draft');
  reloaded.context.confirmation.confirm();
  assert.equal(reloaded.context.hasInvoiceDraft_(),false);
  assert.equal(reloaded.element('invInvoiceNumber').value,'');
  assert.equal(reloaded.element('invFiles').files.length,0);
  assert.equal(reloaded.context.invoiceDepartmentTouched_,false);
  assert.equal(reloaded.element('formDesc').value,'Saved draft');
  const afterDiscard = portal(storage,staleStorage);
  await afterDiscard.context.restorePortalDraft_();
  assert.equal(afterDiscard.context.hasInvoiceDraft_(),false,'A stale file-backed invoice must not reappear after discard');
  assert.equal(await afterDiscard.context.pendingOrderFiles[0].text(),'synthetic evidence','An unrelated request keeps its attachments');
  console.log('Requester draft checks passed: refresh, reload with evidence, permission changes, explicit reattachment, and invoice-only discard.');
})().catch(error => { console.error(error); process.exitCode = 1; });
