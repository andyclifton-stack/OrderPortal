const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createRuntime } = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
const make = () => {
  const r = createRuntime(source, 4, { strictInputs: true });
  r.notifications = [];
  r.api.buildNotificationWarning_ = payloads => { r.notifications.push(...payloads); return null; };
  return r;
};
const order = (r, id) => r.api.getDashboardData().orders.find(o => o.id === id);
const save = (r, id, attachmentOnly = false) => r.api.updateOrder(id, '', attachmentOnly ? '' : 25, '', '', null, order(r, id).version, [], attachmentOnly, 'Credit card');

const r = make();
assert(save(r, 'PERF-1').saved);
const confirmation = r.notifications.find(p => p.subject.startsWith('Order Update:'));
assert(confirmation.body.includes('Processed by'));
assert(confirmation.body.includes('Admin'));
assert.equal(order(r, 'PERF-1').processedBy, 'admin@claremontschool.co.uk');
// Subsequent editors must not replace the person who originally processed it.
r.setActor('finance@claremontschool.co.uk');
r.notifications.length = 0;
assert(save(r, 'PERF-1').saved);
assert(r.notifications.find(p => p.subject.startsWith('Order Update:')).body.includes('Admin (admin@claremontschool.co.uk)</td>'));

const bulk = make();
assert(bulk.api.bulkFinalizeOrders(['PERF-1', 'PERF-2'].map(id => ({ id, expectedVersion: order(bulk, id).version, quantity: 1, finalPrice: 10, expectedDate: '', paymentMethod: 'Credit card' }))).success);
const processorColumn = bulk.sheets.Orders.rows[0].indexOf('Processed By');
for (const id of ['PERF-1', 'PERF-2']) {
  const savedRow = bulk.sheets.Orders.rows.find(row => row[0] === id);
  assert.equal(savedRow[processorColumn], 'admin@claremontschool.co.uk', 'Bulk processing persists the processor on each order');
  assert.equal(order(bulk, id).processedBy, 'admin@claremontschool.co.uk', 'The saved processor is returned for order details');
}
const grouped = bulk.notifications.find(p => p.subject.startsWith('Orders Confirmed:'));
assert(grouped.body.includes('Processed by'));
assert.equal((grouped.body.match(/>Admin<\/td>/g) || []).length, 2);

const columns = r.api.getOrdersMetadataColumnsForRead_(r.sheets.Orders);
const legacy = r.api.extractOrderData_(r.sheets.Orders.rows[1], columns);
assert(r.api.formatEmailBody_('Order Updated', 'Updated.', legacy).includes('Not recorded'));
const pending = r.api.extractOrderData_(r.sheets.Orders.rows[3], columns);
assert(!r.api.formatEmailBody_('New Order Request', 'Submitted.', pending).includes('Processed by'));
assert.equal(r.api.getOrderChatDisplayName_('sally.thorn@claremontschool.co.uk'), 'Sally Thorn');
const unsafe = r.api.formatEmailBody_('Order Updated', 'Updated.', { ...legacy, processedBy: '<script>@example.com' });
assert(unsafe.includes('&lt;script&gt;') || unsafe.includes('&lt;Script&gt;'));
assert(!unsafe.includes('<script>'));
const attachment = make();
assert(save(attachment, 'PERF-2', true).saved);
assert.equal(attachment.notifications.length, 0);

const preview = r.api.formatEmailBody_('Order Updated', 'The status of your order has been updated.', { ...legacy, processedBy: 'sally.thorn@claremontschool.co.uk', desc: 'Network cabinet for Clyde House - deliver to prep.' });
const output = path.resolve(__dirname, '../output/processed-by-email-20261008');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'email-preview.html'), '<!doctype html><meta charset="utf-8"><title>Order email preview</title><body style="font-family:Arial,sans-serif;max-width:1000px;margin:32px"><h3 style="color:#283583">Claremont Purchasing Portal</h3>' + preview + '</body>');
console.log('Processed-by email checks passed: individual, bulk, original processor, legacy, pending, escaping and attachment-only updates. No emails sent.');
