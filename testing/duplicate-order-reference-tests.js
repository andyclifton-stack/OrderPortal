const assert = require('assert');
const path = require('path');
const { createRuntime } = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');

function duplicateFixture() {
  const rt = createRuntime(source, 3);
  const rows = rt.sheets.Orders.rows;
  rows[1][0] = rows[2][0] = '26041000132';
  rows[1][1] = 'English';
  rows[1][6] = 'Membership';
  rows[1][13] = new Date('2026-09-02T12:00:00Z');
  rows[1][15] = 109;
  rows[2][1] = 'Science';
  rows[2][6] = 'Marker pens';
  rt.resetCalls();
  return rt;
}

// Reported failure: a completed earlier order shares the pending order's ID.
const rt = duplicateFixture();
const before = JSON.stringify(rt.sheets.Orders.rows);
const failed = rt.api.updateOrder('26041000132', '2026-09-15', '45', '', '', null, undefined, [], false, 'Invoice / on account');
assert.equal(failed.success, false);
assert.equal(failed.saved, false);
assert.match(failed.message, /shared by more than one record/);
assert.equal(JSON.stringify(rt.sheets.Orders.rows), before);
assert.equal(rt.calls.writes.length, 0);

// Repairs give the intended order a unique reference; the other order stays intact.
rt.sheets.Orders.rows[2][0] = '26041000132-R2';
const saved = rt.api.updateOrder('26041000132-R2', '2026-09-15', '45', '', '', null, undefined, [], false, 'Invoice / on account');
assert.equal(saved.success, true, JSON.stringify(saved));
assert.equal(rt.sheets.Orders.rows[2][15], 45);
assert.equal(rt.sheets.Orders.rows[2][14].getDate(), 15);
assert.ok(rt.sheets.Orders.rows[2][13] instanceof Date);
assert.equal(rt.sheets.Orders.rows[1][15], 109);

// Every other writable reference-based path must reject the same ambiguity.
for (const invoke of [
  api => api.userCancelOrder('26041000132', 'test'),
  api => api.addNote('26041000132', 'test'),
  api => api.submitOrder({id:'26041000132',selectedDept:'English',supplier:'Test',desc:'Test',qty:1,unitPrice:10,files:[]}),
  api => api.bulkFinalizeOrders([{id:'PERF-2',quantity:1,finalPrice:25,expectedDate:'',paymentMethod:'Credit card'},{id:'26041000132',quantity:2,finalPrice:45,expectedDate:'2026-09-15',paymentMethod:'Credit card'}]),
  api => api.reviewOrderApproval('26041000132', 'APPROVE', ''),
  api => api.resubmitOrderApproval('26041000132', '')
]) {
  const fixture = duplicateFixture();
  const result = invoke(fixture.api);
  assert.equal(result.success, false, JSON.stringify(result));
  assert.match(result.message || result.error, /shared by more than one record/);
  assert.equal(fixture.calls.writes.length, 0);
}

// Duplicate references elsewhere must not prevent unrelated valid saves.
const unrelated = duplicateFixture();
assert.equal(unrelated.api.updateOrder('PERF-2', '2026-09-15', '45', '', '', null, undefined, [], false, 'Invoice / on account').success, true);

// Numeric/string/whitespace representations must not bypass the duplicate check.
assert.throws(() => rt.api.assertUniqueOrderReference_([['ID'],[123],[' 123 ']],'123'), /shared/);

// A reset/stale counter must never allocate a reference already present in data.
const ids = createRuntime(source, 2);
ids.setDevelopment(false);
ids.properties.order_id_counter = '26041000127';
ids.sheets.Orders.rows[1][0] = 26041000132;
ids.sheets.Orders.rows[2][0] = '26041000236';
assert.equal(ids.api.nextOrderId_(), '26041000237');
assert.equal(ids.api.nextOrderId_(), '26041000238');
ids.setDevelopment(true);
ids.properties.DEV_order_id_counter = '26090700000';
ids.sheets.Orders.rows[1][0] = 'DEV-26090700050';
assert.equal(ids.api.nextOrderId_(), 'DEV-26090700051');
assert.equal(ids.properties.order_id_counter, '26041000238');
console.log('Duplicate reference regression tests passed.');
