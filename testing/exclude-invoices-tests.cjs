const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {createRuntime}=require('./performance-fixtures.cjs');
const source=path.resolve(__dirname,'../Code.js');
for(const role of ['admin','staff','head','finance']){
 const r=createRuntime(source,120),query={department:'All',pageSize:25};r.setActor(role+'@claremontschool.co.uk');
 r.sheets.Orders.rows[3][20]='Invoice';r.sheets.Orders.rows[5][20]='Invoice';r.sheets.Orders.rows[5][10]=-13.45;
 r.sheets.Orders.rows[7][20]='Transfer';
 let col=r.sheets.Orders.rows[0].indexOf('Payment Method');if(col<0){col=r.sheets.Orders.rows[0].length;r.sheets.Orders.rows[0].push('Payment Method');}r.sheets.Orders.rows[1][col]='Invoice / on account';
 const before=r.api.getDashboardData({paged:true,query});assert(before.success,before.error);
 const after=r.api.getDashboardData({paged:true,query:{...query,excludeInvoices:true},knownRevision:before.meta.revision});assert(after.success,after.error);assert(!after.notModified);
 assert.equal(after.paging.total,before.paging.total-2);assert(!after.orders.some(o=>o.recordType==='Invoice'));assert.equal(JSON.stringify(after.summary),JSON.stringify(before.summary));
 const rows=[];for(let page=1;page<=Math.ceil(after.paging.total/25);page++)rows.push(...r.api.getDashboardData({paged:true,query:{...query,page,excludeInvoices:true}}).orders);
 assert.equal(rows.length,after.paging.total);assert.equal(new Set(rows.map(o=>o.id)).size,rows.length);assert(rows.some(o=>o.recordType==='Transfer'));
 const exported=r.api.getOrderExportPage({query:{...query,excludeInvoices:true}});assert.equal(exported.total,after.paging.total);assert(!exported.orders.some(o=>o.recordType==='Invoice'));
 const pending=r.api.getDashboardData({paged:true,query:{...query,excludeInvoices:true,pendingOnly:true}});assert(pending.orders.every(o=>!o.isCompleted&&o.recordType!=='Invoice'));
 const payment=r.api.getDashboardData({paged:true,query:{...query,excludeInvoices:true,paymentMethod:'Invoice / on account'}});assert.equal(payment.paging.total,1);assert.equal(payment.orders[0].recordType,'Order');
 const reset=r.api.getDashboardData({paged:true,query:{...query,excludeInvoices:false}});assert.equal(reset.paging.total,before.paging.total);
 assert.equal(r.api.getDashboardData({paged:true,query:{...query,excludeInvoices:'true'}}).paging.total,before.paging.total);
}
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
function extract(name){const start=html.indexOf('function '+name+'(');assert(start>=0);const end=html.indexOf('\n      function ',start+1);return html.slice(start,end<0?undefined:end);}
const els={};for(const id of ['recordView','deptFilter','searchText','pendingFilter','returnsFilter','excludeInvoicesFilter','paymentMethodFilter','dateFilterField','searchDateFrom','searchDateTo','requestOwnership'])els[id]={id,value:'',checked:false};
els.deptFilter.value='All';els.deptFilter.options=[{value:'All'}];
const context={canDo:()=>true,document:{getElementById:id=>els[id],querySelector:()=>null},currentSort:{field:'dateReq',dir:'desc'},currentPage:3,rowsPerPage:25,reviewScope_:'',selectedOrderIds:new Set(),setRowsPerPagePreference_(){},getStoredRowsPerPage_(){return 25;},updateBulkBar(){},resetSelectionAndRender(){context.currentPage=1;}};
vm.createContext(context);vm.runInContext(['getOrderPageQuery_','captureUiState_','restoreUiState_','clearFilters','changeOrderStatusFilter_'].map(extract).join('\n'),context);
els.excludeInvoicesFilter.checked=true;assert.equal(context.getOrderPageQuery_().excludeInvoices,true);
const state=context.captureUiState_();els.excludeInvoicesFilter.checked=false;context.restoreUiState_(state);assert(els.excludeInvoicesFilter.checked);
context.clearFilters();assert(!els.excludeInvoicesFilter.checked);assert.equal(context.currentPage,1);
context.restoreUiState_({});assert(!els.excludeInvoicesFilter.checked);
const setFilter=(id,checked=true)=>{els[id].checked=checked;context.changeOrderStatusFilter_(els[id]);return context.getOrderPageQuery_();};
const r=createRuntime(source,10);
const statusFilters=q=>[q.pendingOnly,q.excludeInvoices,q.returnsOnly,q.reviewScope];
const assertQuery=(query,expected)=>{
 assert.deepEqual(statusFilters(query),expected);
 assert.deepEqual(statusFilters(r.api.normalizeOrderQuery_(query,r.api.getUserContext())),expected,'Displayed status switches must match the server query');
};
setFilter('pendingFilter');
assertQuery(setFilter('excludeInvoicesFilter'),[true,true,false,'']);
assertQuery(setFilter('returnsFilter'),[false,false,true,'']);
assertQuery(setFilter('pendingFilter'),[true,false,false,'']);
setFilter('returnsFilter');
assertQuery(setFilter('excludeInvoicesFilter'),[false,true,false,'']);
context.clearFilters();context.reviewScope_='mine';
assertQuery(setFilter('returnsFilter'),[false,false,true,'']);
assertQuery(setFilter('returnsFilter',false),[false,false,false,'']);
console.log('Exclude invoices passed: roles, invoices and credit notes, pagination/revisions, unchanged budget totals, exports, pending/payment combinations, transfers, defaults, UI query/state/reset.');


