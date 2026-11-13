const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRuntime} = require('./performance-fixtures.cjs');

const source = path.resolve(__dirname, '../Code.js');
const code = fs.readFileSync(source, 'utf8');

function fixture() {
  const runtime = createRuntime(source, 4, {strictInputs:true});
  const {api, sheets} = runtime;
  vm.runInContext(code.slice(code.indexOf('function appendOrderFieldChanges_('), code.indexOf('function collectOrderFieldChanges_(')), api);
  api.logError_ = () => {};
  const rows = sheets.Orders.rows;
  const invoice = (id, department, supplier, finalCost) => {
    const row = rows[1].slice();
    Object.assign(row, {
      0:id, 1:department, 4:supplier, 8:1, 9:28.8, 10:28.8,
      13:new Date('2026-07-01T12:00:00Z'), 15:finalCost, 18:'same-2026', 20:'Invoice',
      23:'AWAITING_SIGNOFF'
    });
    rows.push(row);
  };
  invoice('retained', 'English', 'Motia', '');
  invoice('duplicate', 'Science', 'Fuel Motia', 28.8);
  const record = id => api.getOrderRecord(id);
  const form = {
    id:'duplicate', expectedVersion:record('duplicate').version,
    retainedId:'retained', retainedVersion:record('retained').version,
    reason:'Same invoice, entered against the wrong budget.'
  };
  return {...runtime, record, form};
}

{
  const {api, sheets, record, form} = fixture();
  const original = JSON.stringify(record('retained'));
  const before = record('duplicate');
  const overview = () => api.getOverviewDashboardData({summaryOnly:true,period:'All'}).overview;
  const spend = overview().actualSpend;
  assert.equal(before.actions.canVoidDuplicateInvoice, true);
  assert.equal(api.portalRpc('voidDuplicateInvoice', [form], null).saved, true);
  const after = record('duplicate');
  assert.equal(after.status, 'Voided');
  assert.equal(after.finalPrice, 0);
  assert.equal(after.totalPrice, 28.8);
  assert.equal(after.attachment, before.attachment);
  assert.equal(after.desc, before.desc);
  assert.equal(after.actions.canVoidDuplicateInvoice, false);
  assert.equal(after.actions.canApprove, false);
  assert.equal(after.actions.canEditInvoice, false);
  assert.match(after.notes, /Original kept: retained\. Amount removed from spend: £28\.80/);
  assert.equal(JSON.stringify(record('retained')), original);
  assert.equal(Math.round((spend - overview().actualSpend) * 100), 2880);
  const history = api.getOrderExportPage({query:{department:'All',search:'duplicate',recordView:'removed'}});
  const master = api.getOrderExportPage({mode:'master'});
  assert.equal(history.orders[0].status, 'Voided');
  assert(!master.orders.some(order => order.id === 'duplicate'));
  assert(master.orders.some(order => order.id === 'retained'));
  const audit = sheets['Order Change Audit'].rows.slice(1);
  assert(audit.every(row => row[0] instanceof Date && row[1] === 'duplicate' && row[2] === 'admin@claremontschool.co.uk'));
  assert(audit.some(row => row[3] === 'Final Cost' && row[4] === 28.8 && row[5] === 0));
  assert(audit.some(row => row[3] === 'Original invoice kept' && row[5] === 'retained'));
  assert(audit.some(row => row[3] === 'Void reason' && row[5] === form.reason));
  assert.equal(api.voidDuplicateInvoice(form).code, 'ORDER_CHANGED');
  assert.equal(sheets['Order Change Audit'].rows.length, 1 + audit.length);
}

for (const overrides of [{retainedId:'duplicate'}, {retainedId:'missing'}, {retainedVersion:'stale'}, {reason:' '}]) {
  const {api, sheets, form} = fixture();
  const before = JSON.stringify(sheets.Orders.rows);
  assert.equal(api.voidDuplicateInvoice({...form, ...overrides}).saved, false);
  assert.equal(JSON.stringify(sheets.Orders.rows), before);
}

for (const actor of ['staff', 'finance', 'head']) {
  const {api, form, record, setActor} = fixture();
  setActor(actor + '@claremontschool.co.uk');
  assert.equal(record('duplicate').actions.canVoidDuplicateInvoice, false);
  assert.equal(api.voidDuplicateInvoice(form).saved, false);
}

{
  const {api, sheets, form, record} = fixture();
  sheets.Orders.rows.at(-2)[18] = 'different-invoice';
  assert.equal(api.voidDuplicateInvoice({...form, retainedVersion:record('retained').version}).saved, false);
}

{
  const {api, sheets, form} = fixture();
  api.Sheets.Spreadsheets.batchUpdate = () => { throw Error('Atomic write failed'); };
  const before = JSON.stringify(sheets.Orders.rows);
  assert.throws(() => api.voidDuplicateInvoice(form), /SAVE_STATUS_UNKNOWN/);
  assert.equal(JSON.stringify(sheets.Orders.rows), before);
  assert.equal(sheets['Order Change Audit'].rows.length, 0);
}

console.log('Duplicate invoice void: Admin access, matching and stale references, retained original, audited atomic spend removal, exports and failed-write safety passed.');
