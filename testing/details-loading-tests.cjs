const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname,'../Index.html'),'utf8');
const start = html.indexOf('let detailsRequest_ = null;');
const end = html.indexOf('function canCancelFromDetails_',start);
function setup() {
 const elements = {};
 for (const id of ['detailsModal','detailsBody','detailsCancelOrder','detailsNote','detailsReview','detailsEditOrder','detailsEditInvoice','detailsAddEvidence','detailsEvidenceForm','detailsLinkedBack','detailsLinkedStatus','detailsReportingSite','detailsRetry']) elements[id] = {innerHTML:'',hidden:false,attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.events[k]=f},reset(){}};
 const requests=[], recoveries=[], timers=new Map(); let next=0, shows=0;
 const order={id:'one',version:1,detailsDeferred:true,desc:'First order',supplier:'Supplier',totalPrice:10};
 const runner={withSuccessHandler(f){this.success=f;return this},withFailureHandler(f){this.failure=f;return this},getOrderDetails(id,version){requests.push({id,version,success:this.success,failure:this.failure})}};
 const ctx={document:{getElementById:id=>elements[id]},globalData:{orders:[order]},portalRun_:()=>runner,
  portalRead_:(name,args)=>new Promise((resolve,reject)=>recoveries.push({name,args,resolve,reject})),
  replaceLoadedOrder_:latest=>{ctx.globalData.orders=ctx.globalData.orders.map(order=>order.id===latest.id?latest:order);},
  setTimeout:f=>{timers.set(++next,f);return next},clearTimeout:id=>timers.delete(id),getModal_:()=>({show(){shows++},hide(){elements.detailsModal.events['hidden.bs.modal']?.()}}),escapeBulkHtml:s=>String(s).replaceAll('<','&lt;'),formatCurrency:String,getSafeLink:(_,s)=>s,isInvoiceOrder:()=>false,isCompletedOrder:()=>false,isCancelledOrder:()=>false,buildOrderStatusHtml_:()=>'',returnSummaryHtml_:()=>'',canCancelFromDetails_:()=>true};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('function isInvoiceOrder('),html.indexOf('function parseOrderMoney(')),ctx);
 vm.runInContext(html.slice(html.indexOf('function formatApprovalHistory_('),html.indexOf('function matchesLocalReviewScope_(')),ctx);
 vm.runInContext(html.slice(start,end),ctx);
 return {ctx,elements,requests,recoveries,timers,order,get shows(){return shows}};
}
const tick=()=>new Promise(setImmediate);
(async()=>{
let t=setup();t.ctx.openDetails('one');
assert.equal(t.shows,1);assert(t.elements.detailsBody.innerHTML.includes('Loading order details'));assert(t.elements.detailsCancelOrder.hidden);
assert(t.elements.detailsReview.hidden);assert(t.elements.detailsReportingSite.hidden);
assert(t.elements.detailsAddEvidence.hidden);
// Multiple saved attachments must be independent links, never one comma-joined URL.
const attachmentCase=setup(),linkedUrls=[];
attachmentCase.ctx.getSafeLink=(url,label)=>{linkedUrls.push(url);return label;};
attachmentCase.ctx.openDetails('one');
attachmentCase.requests[0].success({detailsDeferred:false,attachment:'https://drive.google.com/file/d/one/view, https://drive.google.com/file/d/two/view'});
assert.deepEqual(linkedUrls.filter(Boolean),['https://drive.google.com/file/d/one/view','https://drive.google.com/file/d/two/view']);
assert(attachmentCase.elements.detailsBody.innerHTML.includes('View Attachment 1'));
assert(attachmentCase.elements.detailsBody.innerHTML.includes('View Attachment 2'));
t.requests[0].success({detailsDeferred:false,location:'Loaded location'});
assert(t.elements.detailsBody.innerHTML.includes('Loaded location'));assert(!t.elements.detailsBody.innerHTML.includes('Loading order details'));assert.equal(t.elements.detailsBody.attrs['aria-busy'],'false');assert(!t.elements.detailsCancelOrder.hidden);assert.equal(t.timers.size,0);
t=setup();t.ctx.openDetails('one');t.elements.detailsModal.events['hide.bs.modal']();t.requests[0].success({detailsDeferred:false,location:'late'});assert.equal(t.shows,1);assert(!t.elements.detailsBody.innerHTML.includes('late'));assert.equal(t.timers.size,0);
t=setup();t.ctx.openDetails('one');t.requests[0].failure(new Error('failed'));assert.equal(t.recoveries[0].name,'getOrderRecord');t.recoveries[0].reject(new Error('still unavailable'));await tick();assert(t.elements.detailsBody.innerHTML.includes('Retry'));t.elements.detailsRetry.onclick();assert.equal(t.requests.length,2);t.requests[1].success({detailsDeferred:false,location:'Retried'});assert(t.elements.detailsBody.innerHTML.includes('Retried'));
t=setup();t.ctx.openDetails('one');[...t.timers.values()][0]();assert(t.elements.detailsBody.innerHTML.includes('too long'));t.requests[0].success({detailsDeferred:false,location:'late'});assert(!t.elements.detailsBody.innerHTML.includes('late'));t.elements.detailsRetry.onclick();assert.equal(t.requests.length,2);
t=setup();t.ctx.openDetails('one');t.ctx.globalData.orders[0]={...t.order,version:2};t.requests[0].success({detailsDeferred:false,location:'stale'});assert.equal(t.recoveries[0].name,'getOrderRecord');t.recoveries[0].resolve({...t.order,version:2,detailsDeferred:false,location:'Newest'});await tick();assert(t.elements.detailsBody.innerHTML.includes('Newest'));assert(!t.elements.detailsBody.innerHTML.includes('stale'));
t=setup();t.ctx.openDetails('one');t.ctx.globalData.orders.push({id:'two',version:1,detailsDeferred:true,desc:'Second order'});t.ctx.openDetails('two');t.requests[0].success({detailsDeferred:false,location:'Wrong order'});assert(t.elements.detailsBody.innerHTML.includes('Loading order details'));t.requests[1].success({detailsDeferred:false,location:'Right order'});assert(t.elements.detailsBody.innerHTML.includes('Right order'));assert(!t.elements.detailsBody.innerHTML.includes('Wrong order'));
t=setup();t.order.detailsDeferred=false;t.ctx.openDetails('one');assert.equal(t.requests.length,0);assert(t.elements.detailsBody.innerHTML.includes('First order'));
t.order.approvalStatus='APPROVED';t.order.actions={canViewApprovalHistory:true};t.ctx.openDetails('one');
assert(!t.elements.detailsReview.hidden);assert.equal(t.elements.detailsReview.textContent,'Review history');
t.order.actions={canViewApprovalHistory:false};t.ctx.openDetails('one');assert(t.elements.detailsReview.hidden);
assert(t.elements.detailsAddEvidence.hidden);
let openedEvidence;
t.ctx.openDetailsEvidence_=order=>{openedEvidence=order.id;};
t.order.actions={canAddEvidence:true};t.ctx.openDetails('one');
assert(!t.elements.detailsAddEvidence.hidden);
t.elements.detailsAddEvidence.onclick();
assert.equal(openedEvidence,'one');
const history=t.ctx.formatApprovalHistory_([
 {action:'SIGNOFF_REQUIRED',revision:1},{action:'QUERY_RAISED',revision:1,note:'<private>'},
 {action:'RESUBMITTED',revision:2},{action:'APPROVED',revision:2}
]);
for(const label of ['Independent sign-off requested','Query raised','Resubmitted for sign-off','Approved','&lt;private>']) assert(history.includes(label));
assert(!history.includes('QUERY_RAISED'));
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {if(match[1].trim())new vm.Script(match[1]);}
console.log('PASS: immediate loading, success, cached opening, close while loading, failure/retry, timeout/late response, version conflict, overlapping requests and script syntax.');
})().catch(error=>{console.error(error);process.exitCode=1;});
