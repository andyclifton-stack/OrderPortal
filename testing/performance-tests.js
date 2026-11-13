const assert=require('assert'),path=require('path');
const {createRuntime}=require('./performance-fixtures.cjs');
const baseline=process.env.PORTAL_PERFORMANCE_BASELINE;
if (baseline) {
for (const actor of ['admin','staff','head','finance']) {
  const old=createRuntime(baseline,100), current=createRuntime(path.resolve(__dirname,'../Code.js'),100);
  old.setActor(actor+'@claremontschool.co.uk');current.setActor(actor+'@claremontschool.co.uk');
  const a=old.api.getDashboardData(),b=current.api.getDashboardData();
  delete a.meta;delete b.meta;
  // New optional requester fields are covered by requester-tests.js.
  delete b.user.requesterChoices;
  b.orders.forEach(order => { delete order.submittedBy; delete order.version; });
  // Staff and Head may now edit their own pending requests within assigned departments.
  if (['staff','head'].includes(actor)) {
    a.user.capabilities.canEditExistingOrders = true;
    a.orders.filter(order => order.status === 'Pending' && order.recordType === 'Order' &&
      order.requester === actor+'@claremontschool.co.uk').forEach(order => { order.actions.canEdit = true; });
  }
  // Compare the original public fields; later features have dedicated tests.
  function originalContract(value, original) {
    if (Array.isArray(original)) return value.map((v,i)=>originalContract(v,original[i]));
    if (original && typeof original === 'object') return Object.fromEntries(Object.keys(original).map(k=>[k,originalContract(value[k],original[k])]));
    return value;
  }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(originalContract(b,a))),JSON.parse(JSON.stringify(a)),'Original response fields preserve '+actor+' behaviour');
}
}
const rt=createRuntime(path.resolve(__dirname,'../Code.js'),100);
const {api,sheets}=rt;
const first=api.getDashboardData();
assert.equal(first.success,true,first.error);
assert.equal(first.orders.length,100);
assert.ok(first.meta.revision);
assert.equal(rt.calls.timezones,1,'Resolve timezone only once per dashboard request');
const next=api.getDashboardData({knownRevision:first.meta.revision});
assert.equal(next.notModified,true);assert.equal(next.orders,undefined);
assert.ok(JSON.stringify(next).length<600);
assert.equal(api.getDashboardData().orders.length,100,'Old callers receive complete data');
sheets.Orders.rows[1][6]='Direct sheet edit';
const changed=api.getDashboardData({knownRevision:first.meta.revision});
assert.equal(changed.notModified,undefined);assert.notEqual(changed.meta.revision,first.meta.revision);
sheets.Budgets.rows[1][3]=98000;
const budget=api.getDashboardData({knownRevision:changed.meta.revision});
assert.notEqual(budget.meta.revision,changed.meta.revision);
rt.setActor('staff@claremontschool.co.uk');
const staff=api.getDashboardData({knownRevision:budget.meta.revision});
assert.equal(staff.orders.length,50);assert.ok(staff.orders.every(o=>o.dept==='Science'));
sheets.Users.rows[2][6]=true;
const processor=api.getDashboardData({knownRevision:staff.meta.revision});
assert.equal(processor.orders.length,100);assert.notEqual(processor.meta.revision,staff.meta.revision);
sheets.Users.rows[2][5]=false;
assert.equal(api.getDashboardData({knownRevision:processor.meta.revision}).errorCode,'AUTH_UNAUTHORIZED');
rt.setActor('admin@claremontschool.co.uk');
const oldCount=sheets.Orders.rows.length;sheets.Orders.rows.splice(1);
const empty=api.getDashboardData();assert.equal(empty.orders.length,0);
assert.equal(api.getDashboardData({knownRevision:empty.meta.revision}).notModified,true);
rt.properties.order_id_counter='100001';rt.properties.portal_data_version='7';rt.properties.configuration_data_version='8';
api.nextOrderId_();api.markConfigurationChanged_();
assert.equal(rt.properties.order_id_counter,'100001');assert.equal(rt.properties.portal_data_version,'7');assert.equal(rt.properties.configuration_data_version,'8');
assert.equal(rt.properties.DEV_portal_data_version,'1');
rt.setDevelopment(false);assert.equal(api.getDataVersion_(),'7');

const writes=createRuntime(path.resolve(__dirname,'../Code.js'),3);
// Metadata headers mirror the active schema read from the source constants.
const edit=writes.api.submitOrder({id:'PERF-1',selectedDept:'English',supplier:'Updated supplier',link:'https://example.com',desc:'Updated description',code:'NEW',qty:3,unitPrice:7,location:'Prep',dateNeeded:'',note:'',files:[],removedAttachments:[]});
assert.equal(edit.success,true,JSON.stringify(edit));
assert.equal(writes.sheets.Orders.rows[2][4],'Updated supplier');
assert.equal(writes.sheets.Orders.rows[2][16],'=FORMULA_PRESERVE');
assert.ok(writes.calls.writes.some(w=>w[0]==='Orders'&&w[2]===5&&w[4]===9),'Editable cells use one E:M write');
const preserved=writes.sheets.Orders.rows[2][16];
writes.api.writeAdjacentOrderCells_(writes.sheets.Orders,2,[[19,'invoice'],[15,'date'],[14,'ordered'],[18,'note']]);
assert.equal(writes.sheets.Orders.rows[1][16],'=FORMULA_PRESERVE','Sparse writes never bridge calculated columns');
assert.equal(writes.sheets.Orders.rows[2][16],preserved);
console.log('Performance behaviour tests passed: conditional reads, direct edits, permissions, isolation, empty data and batched edits.');
