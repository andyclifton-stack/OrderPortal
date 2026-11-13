const fs=require('fs'),path=require('path'),assert=require('assert');
const {createRuntime}=require('./performance-fixtures.cjs');
const root=path.resolve(__dirname,'..'),baseline=path.resolve(root,'../implementation-backups/performance-20260907/local');
const reports=[];
function stats(x){const a=x.slice().sort((a,b)=>a-b);return {median:+((a[4]+a[5])/2).toFixed(2),slowest:+a.at(-1).toFixed(2)};}
for(const variant of ['before','after'])for(const count of [100,1000,5000]){
 const edits=[],bulks=[],editWrites=[],bulkWrites=[];
 for(let i=0;i<10;i++){
  const rt=createRuntime(path.join(variant==='before'?baseline:root,'Code.js'),count);
  let t=performance.now();const result=rt.api.submitOrder({id:'PERF-1',selectedDept:'English',supplier:'Updated supplier',link:'https://example.com',desc:'Edited synthetic order',code:'NEW',qty:3,unitPrice:7,location:'Prep',dateNeeded:'',files:[],removedAttachments:[]});
  edits.push(performance.now()-t);assert.ok(result.saved,JSON.stringify(result));editWrites.push(rt.calls.writes.length);rt.resetCalls();
  const items=rt.sheets.Orders.rows.slice(1).filter(r=>!r[13]).slice(0,20).map(r=>({id:r[0],quantity:r[8],finalPrice:r[10],expectedDate:'2026-09-15',costNote:''}));
  t=performance.now();const bulk=rt.api.bulkFinalizeOrders(items);bulks.push(performance.now()-t);assert.ok(bulk.success,JSON.stringify(bulk));bulkWrites.push(rt.calls.writes.length);
  assert.ok(rt.sheets.Orders.rows.slice(1).every(row=>row[16]==='=FORMULA_PRESERVE'));
 }
 const report={variant,count,editMs:stats(edits),bulk20Ms:stats(bulks),editWriteCalls:editWrites[0],bulkWriteCalls:bulkWrites[0]};reports.push(report);console.log(JSON.stringify(report));
}
fs.writeFileSync(path.resolve(root,'../implementation-backups/performance-20260907/results/save-measurements.json'),JSON.stringify(reports,null,2));
