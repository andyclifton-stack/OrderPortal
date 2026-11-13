const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRuntime } = require('./performance-fixtures.cjs');
const root = path.resolve(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const make = (actor = 'admin@claremontschool.co.uk') => {
  const r = createRuntime(path.join(root, 'Code.js'), 4, { strictInputs: true });
  r.setActor(actor);
  r.api.logError_ = () => {};
  return r;
};
const cancel = (r, id, version) => {
  const row = r.sheets.Orders.rows.find(row => row[0] === id);
  return r.api.userCancelOrder(id, 'No longer needed', version || r.api.orderVersion_(row));
};
{
  const r = make();
  // Admin can cancel outside its assigned department.
  r.sheets.Users.rows[1][1] = 'Science';
  const result = cancel(r, 'PERF-1');
  assert.equal(result.saved, true);
  const row = r.sheets.Orders.rows[2];
  assert.match(row[6], /^CANCELLED - /);
  assert.equal(row[15], 0);
  assert.match(row[17], /admin.*Cancelled. Reason: No longer needed/);
  assert.equal(r.sheets.Orders.rows.length, 5, 'Keep the order history');
  const before = JSON.stringify(r.sheets.Orders.rows);
  assert.equal(cancel(r, 'PERF-1').saved, false);
  assert.equal(JSON.stringify(r.sheets.Orders.rows), before);
}
for (const scenario of ['ordered', 'transfer', 'stale', 'other-department', 'unknown-user']) {
  const r = make(scenario === 'other-department' ? 'staff@claremontschool.co.uk' : scenario === 'unknown-user' ? 'unknown@claremontschool.co.uk' : undefined);
  if (scenario === 'transfer') r.sheets.Orders.rows[2][20] = 'Transfer';
  const before = JSON.stringify(r.sheets.Orders.rows);
  let rejected = false;
  try { rejected = !cancel(r, scenario === 'ordered' ? 'PERF-0' : 'PERF-1', scenario === 'stale' ? 'stale-version' : undefined).saved; }
  catch (error) { assert.equal(scenario, 'unknown-user'); rejected = true; }
  assert(rejected, scenario + ' must be rejected');
  assert.equal(JSON.stringify(r.sheets.Orders.rows), before);
}
for (const actor of ['staff', 'head', 'finance']) {
  const r = make(actor + '@claremontschool.co.uk');
  const before = JSON.stringify(r.sheets.Orders.rows);
  assert.equal(cancel(r, 'PERF-2').saved, actor !== 'finance', actor + ' keeps existing bin permissions');
  if (actor === 'finance') assert.equal(JSON.stringify(r.sheets.Orders.rows), before);
}
const fallback = portal.slice(portal.indexOf('function buildFallbackCapabilities_()'), portal.indexOf('\n      function ', portal.indexOf('function buildFallbackCapabilities_()') + 10));
for (const role of ['Wipro', 'Admin', 'Staff', 'Head', 'Unknown']) {
  const caps = vm.runInNewContext(fallback + '\nbuildFallbackCapabilities_()', { currentUser: { role } });
  assert.equal(caps.canCancelOrders, ['Admin', 'Staff', 'Head'].includes(role), 'Browser fallback: ' + role);
}
const detailsGuard = portal.slice(portal.indexOf('function canCancelFromDetails_('), portal.indexOf('function cancelFromDetails_('));
for (const role of ['Admin', 'Staff', 'Head', 'Wipro']) {
  for (const order of [{desc:'Pending',recordType:'Order'}, {desc:'Ordered',completed:true}, {desc:'CANCELLED - test',status:'Cancelled',finalPrice:0}, {desc:'Invoice',recordType:'Invoice'}, {desc:'Transfer',recordType:'Transfer'}]) {
    order.actions = {canCancel:role !== 'Wipro'};
    const allowed = vm.runInNewContext(portal.slice(portal.indexOf('function isCancelledOrder('),portal.indexOf('\n      function ',portal.indexOf('function isCancelledOrder(')+10)) + detailsGuard + '\ncanCancelFromDetails_(order)', {currentUser:{role},canDo:()=>true,isCompletedOrder:o=>!!o.completed,order});
    assert.equal(allowed, role !== 'Wipro' && ['Pending','Invoice'].includes(order.desc));
  }
}
console.log('Order Details cancellation and unchanged bin permissions passed.');
