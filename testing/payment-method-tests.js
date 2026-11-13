const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { createRuntime } = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
const make = () => createRuntime(source, 4, { strictInputs: true });
const order = (r, id) => r.api.getDashboardData().orders.find(o => o.id === id);
const save = (r, id, method, attachmentOnly = false) => r.api.updateOrder(id, '', attachmentOnly ? '' : 25, '', '', null, order(r,id).version, [], attachmentOnly, method);

{
  const r=make(); const before=JSON.stringify(r.sheets.Orders.rows);
  assert.equal(order(r,'PERF-0').paymentMethod, '');
  assert.equal(save(r,'PERF-1','').saved,false);
  assert.equal(save(r,'PERF-1','Cash').saved,false);
  assert.equal(JSON.stringify(r.sheets.Orders.rows),before,'Invalid processing cannot mutate orders or add headers');
  assert(save(r,'PERF-1','Credit card').saved);
  assert.equal(order(r,'PERF-1').paymentMethod,'Credit card');
  assert.equal(order(r,'PERF-1').processedBy,'admin@claremontschool.co.uk');
  assert.equal(order(r,'PERF-0').paymentMethod,'','Migration never guesses historical payment methods');
  assert.equal(save(r,'PERF-1','').saved,false,'Known methods cannot accidentally be cleared');
  const audit=[];r.api.appendOrderFieldChanges_=(ss,id,actor,changes)=>audit.push(...changes);
  assert(save(r,'PERF-1','Invoice / on account').saved);
  assert(audit.some(c=>c.field==='Payment Method' && c.oldValue==='Credit card' && c.newValue==='Invoice / on account'));
  assert(save(r,'PERF-0','').saved,'Legacy completed orders allow unrelated updates without guessing');
  assert.equal(order(r,'PERF-0').paymentMethod,'');
  assert(save(r,'PERF-2','',true).saved,'Attachment-only updates bypass processing requirement');
  assert.equal(order(r,'PERF-2').isCompleted,false);
}
{
  const r=make();const before=JSON.stringify(r.sheets.Orders.rows);
  const items=['PERF-1','PERF-2'].map((id,i)=>({id,expectedVersion:order(r,id).version,quantity:1,finalPrice:10,expectedDate:'',paymentMethod:i?'':'Credit card'}));
  assert.equal(r.api.bulkFinalizeOrders(items).success,false);
  assert.equal(JSON.stringify(r.sheets.Orders.rows),before,'A missing choice prevents the entire batch');
  items[1].paymentMethod='Invoice / on account';
  assert(r.api.bulkFinalizeOrders(items).success);
  assert.equal(order(r,'PERF-1').paymentMethod,'Credit card');
  assert.equal(order(r,'PERF-2').paymentMethod,'Invoice / on account');
}
{
  const r=make(); r.setActor('staff@claremontschool.co.uk');
  assert.equal(save(r,'PERF-2','Credit card').saved,false,'Unauthorised staff cannot supply a method and process orders');
}
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  new vm.Script(match[1].replace(/<\?[\s\S]*?\?>/g,'"test"'));
}
const exportFunction=html.slice(html.indexOf('function formatForExcel('),html.indexOf('let simulationTargets_'));
const ctx={getOrderCost_:o=>o.finalPrice ?? o.totalPrice};vm.createContext(ctx);vm.runInContext(exportFunction,ctx);
vm.runInContext(html.slice(html.indexOf('function isInvoiceOrder('),html.indexOf('function parseOrderMoney(')),ctx);
const exported=ctx.formatForExcel([{id:'ONE',dateReq:'01/09/2026',dateOrdered:'04/09/2026',recordType:'Order',dept:'Science',glCode:'SCI',desc:'Example',finalPrice:12,processedBy:'finance@example.com'}])[0];
assert.equal(exported['Payment Method'],'Not recorded');assert.equal(exported['Date Ordered'],'04/09/2026');assert.equal(exported['GL Code'],'SCI');assert.equal(exported['Cost'],12);
assert.equal(ctx.formatForExcel([{recordType:'Order',status:'Ordered',finalPrice:0}])[0]['Payment Method'],'No charge');
console.log('Payment method integration, migration, validation, permissions, audit, bulk and export checks passed.');
