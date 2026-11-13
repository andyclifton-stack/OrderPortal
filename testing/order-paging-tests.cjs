const assert=require('assert'),path=require('path'),fs=require('fs');
const {createRuntime}=require('./performance-fixtures.cjs');const source=path.resolve(__dirname,'../Code.js');
const make=n=>createRuntime(source,n,{strictInputs:true});
const query={department:'All',pageSize:25,sortField:'dateReq',sortDirection:'desc'};
const page=(r,q={},extra={})=>r.api.getDashboardData({paged:true,query:{...query,...q},...extra});
const ids=data=>Array.from(data.orders,o=>o.id);
for(const role of ['admin','staff','head','finance']){
 const r=make(500);r.setActor(role+'@claremontschool.co.uk');
 const first=page(r);assert(first.success,first.error);assert.equal(first.orders.length,25);
 const visible=role==='staff'||role==='head'?250:500;assert.equal(first.paging.total,visible);
 assert.equal(first.summary.deptSummary.Science.spent,84*24);assert.equal(first.summary.deptSummary.Science.committed,166*25);
 if(role==='staff'||role==='head'){assert(!first.summary.deptSummary.English);assert(first.orders.every(o=>o.dept==='Science'));}
 const all=[];for(let p=1;p<=Math.ceil(visible/25);p++)all.push(...ids(page(r,{page:p})));
 assert.equal(new Set(all).size,visible,'Every record appears exactly once with equal-date tie breaks');
 const noop=page(r,{}, {knownRevision:first.meta.revision});assert(noop.notModified);
 assert(!page(r,{page:2},{knownRevision:first.meta.revision}).notModified,'A different page is not an unchanged response');
 assert.equal(page(r,{page:999}).paging.page,Math.ceil(visible/25));
 const changed=first.orders[0].id;r.sheets.Orders.rows.find(row=>row[0]===changed)[6]='Direct edit';
 assert(!page(r,{}, {knownRevision:first.meta.revision}).notModified,'Direct edits invalidate the result');
}
{
 const r=make(1200),first=page(r);const summary=JSON.stringify(first.summary);
 const search=page(r,{search:'Synthetic order 999'});assert.deepEqual(ids(search),['PERF-999']);assert.equal(JSON.stringify(search.summary),summary,'Filters never narrow budget totals');
 const pending=page(r,{department:'Science',pendingOnly:true});assert.equal(pending.paging.total,400);assert(pending.orders.every(o=>!o.isCompleted));
 const dates=page(r,{from:'2026-01-01',to:'2026-01-01'});assert.equal(dates.paging.total,6);
 const badDate=page(r,{from:'2026-02-31'});assert(!badDate.success);
 const badRange=page(r,{from:'2026-10-02',to:'2026-09-01'});assert(!badRange.success);
 const column=r.sheets.Orders.rows[0].length;r.sheets.Orders.rows[0].push('Payment Method');r.sheets.Orders.rows[1][column]='Credit card';
 assert.equal(page(r,{paymentMethod:'Credit card'}).paging.total,1);
 r.sheets.Orders.rows[1][23]='AWAITING_SIGNOFF';assert.equal(page(r,{approvalOnly:true}).paging.total,1);assert.equal(page(r).summary.approvalCount,1);
 const record=r.api.getOrderRecord('PERF-1100');assert.equal(record.id,'PERF-1100');assert(record.version);assert.equal(record.notes,'Test note 1100');assert(record.actions);
 const exportRows=[];let offset=0,revision='';do{const data=r.api.getOrderExportPage({query,offset,revision});revision=data.revision;assert(data.orders.length<=500);exportRows.push(...data.orders);offset=data.nextOffset;if(offset>=data.total)break;}while(true);
 assert.equal(exportRows.length,1200);assert.equal(new Set(exportRows.map(o=>o.id)).size,1200);assert(exportRows.some(o=>o.id==='PERF-1100'));
 const filtered=r.api.getOrderExportPage({query:{...query,search:'Synthetic order 999'}});assert.deepEqual(ids(filtered),['PERF-999']);
 const master=r.api.getOrderExportPage({mode:'master'});assert.equal(master.total,400);assert(master.orders.every(o=>o.finalPrice!==''));
 r.sheets.Orders.rows[1][6]='Changed during export';assert.throws(()=>r.api.getOrderExportPage({query,offset:500,revision}),/changed/);
 r.setActor('staff@claremontschool.co.uk');assert.throws(()=>r.api.getOrderRecord('PERF-1'),/Access denied/);assert.throws(()=>r.api.getOrderExportPage({mode:'master'}),/Access denied/);
 assert.equal(r.api.getOrderExportPage({query}).total,600);assert.throws(()=>r.api.getOrderExportPage({query,revision}),/changed/);
 r.sheets.Users.rows[2][5]=false;assert(!page(r).success);assert.throws(()=>r.api.getOrderSupplierSuggestions('Supplier'),/Access denied/);
}
{
 const r=make(5000),response=page(r);assert(JSON.stringify(response).length<70000,'Initial page payload is bounded');
 const supplier=r.sheets.Orders.rows[1];supplier[4]='A rare older supplier';assert(r.api.getOrderSupplierSuggestions('rare older').includes('A rare older supplier'));
 const p1=page(r,{pendingOnly:true}),p2=page(r,{pendingOnly:true,page:2});
 const selected=[p1.orders[0],p2.orders[0]];assert.notEqual(selected[0].id,selected[1].id);
 const result=r.api.bulkFinalizeOrders(selected.map(o=>({id:o.id,expectedVersion:o.version,quantity:o.qty,finalPrice:25,expectedDate:'',paymentMethod:'Credit card'})));assert(result.saved || result.success,JSON.stringify(result));
 const stale=r.api.bulkFinalizeOrders(selected.map(o=>({id:o.id,expectedVersion:o.version,quantity:o.qty,finalPrice:25,expectedDate:'',paymentMethod:'Credit card'})));assert(!stale.saved && !stale.success,'Cross-page selections still enforce record versions');
}
console.log('Order paging passed: all roles, complete summaries, stable pages, search/date/payment/approval filters, off-page details, full and filtered exports, concurrent edits, revocation, supplier search and cross-page bulk updates.');
