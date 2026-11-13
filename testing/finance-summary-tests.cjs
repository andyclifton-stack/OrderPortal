const assert=require('assert'),path=require('path');
const {createRuntime}=require('./performance-fixtures.cjs');
const make=n=>createRuntime(path.resolve(__dirname,'../Code.js'),n,{strictInputs:true});
for(const role of ['admin','finance','head']){
 const r=make(1200);r.setActor(role+'@claremontschool.co.uk');
 const full=r.api.getOverviewDashboardData();assert(full.success);
 for(const period of ['All','2025','2026'])for(const department of ['All','Science','English']){
  const data=r.api.getOverviewDashboardData({summaryOnly:true,period,department});assert(data.success);assert(data.orders.length<=5);
  const scoped=full.orders.filter(o=>(department==='All'||!data.overview.departments.includes(department)||o.dept===department)&&(period==='All'||(period==='2025'&&o.dateReq.endsWith('2026'))));
  const completed=scoped.filter(o=>o.isCompleted),pending=scoped.filter(o=>o.status==='Pending');
  assert.equal(data.overview.actualSpend,completed.length*24,role+period+department);
  assert.equal(data.overview.pendingCount,pending.length);assert.equal(data.overview.pendingValue,pending.length*25);
  assert.equal(data.overview.monthly.reduce((sum,[,value])=>sum+value,0),completed.length*24);
  assert.equal(data.overview.departmentSpend.reduce((sum,[,value])=>sum+value,0),completed.length*24);
  let offset=0,revision='',all=[];do{const chunk=r.api.getOverviewExportPage({period,department,offset,revision});revision=chunk.revision;all.push(...chunk.orders);offset=chunk.nextOffset;if(offset>=chunk.total)break;}while(true);
  assert.equal(all.length,scoped.length);assert.equal(new Set(all.map(o=>o.id)).size,all.length);
 }
 if(role==='head')assert(full.orders.every(o=>o.location==='Senior'));
 const first=r.api.getOverviewExportPage({period:'All'});r.sheets.Orders.rows[1][6]='Changed';
 assert.throws(()=>r.api.getOverviewExportPage({period:'All',offset:500,revision:first.revision}),/changed/);
 r.setActor('staff@claremontschool.co.uk');assert(!r.api.getOverviewDashboardData({summaryOnly:true}).success);assert.throws(()=>r.api.getOverviewExportPage({period:'All'}),/Access denied/);
}
{
 const r=make(5000),data=r.api.getOverviewDashboardData({summaryOnly:true,period:'All'});assert(JSON.stringify(data).length<15000);
 const row=r.sheets.Orders.rows[1];row[15]=0;row[13]=new Date('2026-09-01T12:00:00Z');
 let summary=r.api.getOverviewDashboardData({summaryOnly:true,period:'2026'});assert.equal(summary.overview.actualSpend,0);assert.equal(summary.overview.monthly.length,12);
 row[15]=650;summary=r.api.getOverviewDashboardData({summaryOnly:true,period:'2026'});assert.equal(summary.overview.actualSpend,650);assert.equal(summary.orders[0].id,row[0]);assert.equal(summary.overview.monthly[0][1],650);
 row[20]='Transfer';summary=r.api.getOverviewDashboardData({summaryOnly:true,period:'All'});assert.equal(summary.overview.netTransferOut,650);assert(!summary.orders.some(o=>o.id===row[0]));
}
console.log('Finance summary passed: role and site access, academic periods, department filters, complete totals, monthly series, full chunked exports, changed-data rejection, transfers, zero actual cost and bounded payload.');
