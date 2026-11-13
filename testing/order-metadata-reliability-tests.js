const assert = require('assert');
const path = require('path');
const { createRuntime } = require('./performance-fixtures.cjs');
const source = path.resolve(__dirname, '../Code.js');
const rt = createRuntime(source, 3);
const sheet = rt.sheets.Orders;
sheet.rows[0].push('Payment Method'); // This check represents an already migrated workbook.
const sleeps = [];
rt.api.Utilities.sleep = ms => sleeps.push(ms);
sheet.hideColumns = sheet.showColumns = () => { throw Error('Unexpected layout change'); };
rt.resetCalls();
const columns = rt.api.ensureOrdersMetadataColumns_(sheet);
assert.equal(rt.calls.reads, 1);
assert.equal(rt.calls.writes.length, 0);
assert.equal(columns.invoiceNumberColumn, 19);
assert.equal(columns.approvedAtColumn, 27);
assert.equal(columns.approvedAtIndex, 26);

const originalRange = sheet.getRange.bind(sheet);
let attempts = 0;
sheet.getRange = (...args) => {
  if (++attempts < 3) throw Error('Service Spreadsheets failed while accessing document with ID test');
  return originalRange(...args);
};
assert.equal(rt.api.ensureOrdersMetadataColumns_(sheet).approvedAtColumn, 27);
assert.equal(attempts, 3);
assert.deepEqual(sleeps, [250, 500]);
attempts = 0;
sheet.getRange = () => { attempts++; throw Error('Service Spreadsheets failed while accessing document with ID test'); };
assert.throws(() => rt.api.ensureOrdersMetadataColumns_(sheet), /Service Spreadsheets/);
assert.equal(attempts, 3);
attempts = 0;
sheet.getRange = () => { attempts++; throw Error('Permission denied'); };
assert.throws(() => rt.api.ensureOrdersMetadataColumns_(sheet), /Permission denied/);
assert.equal(attempts, 1);

// Preserve migration of older workbooks, including Record Type before GL Code.
const migration = createRuntime(source, 0);
const oldSheet = migration.sheets.Orders;
oldSheet.rows[0] = oldSheet.rows[0].slice(0, 20).concat('GL Code');
oldSheet.insertColumnAfter = column => oldSheet.rows.forEach(row => row.splice(column, 0, ''));
oldSheet.insertColumnBefore = column => oldSheet.insertColumnAfter(column - 1);
oldSheet.showColumns = () => {};
const migrated = migration.api.ensureOrdersMetadataColumns_(oldSheet);
assert.equal(migrated.recordTypeColumn, 21);
assert.equal(migrated.glCodeColumn, 22);
assert.equal(migrated.invoiceNumberColumn, 19);
assert.equal(migrated.approvedAtColumn, 27);
const again = migration.api.ensureOrdersMetadataColumns_(oldSheet);
assert.deepEqual(again, migrated);

// A transient failure before an edit recovers without replaying order writes.
const edit = createRuntime(source, 3);
edit.api.Utilities.sleep = () => {};
const getRange = edit.sheets.Orders.getRange.bind(edit.sheets.Orders);
let failed = false;
edit.sheets.Orders.getRange = (...args) => {
  if (!failed && args[0] === 1 && args[2] === 1) {
    failed = true;
    throw Error('Service Spreadsheets failed while accessing document with ID test');
  }
  return getRange(...args);
};
const result = edit.api.submitOrder({id:'PERF-1',selectedDept:'English',supplier:'Updated',desc:'Updated order',qty:1,unitPrice:10,files:[]});
assert.equal(failed, true);
assert.equal(result.success, true, JSON.stringify(result));
assert.equal(edit.sheets.Orders.rows.length, 4);
assert.equal(edit.calls.writes.filter(w => w[0] === 'Orders' && w[2] === 5).length, 1);
console.log('Order metadata reliability tests passed.');
