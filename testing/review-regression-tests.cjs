const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const portal = fs.readFileSync(path.join(root,'Index.html'),'utf8');
const restore = portal.slice(portal.indexOf('const restoreButton = () =>'),portal.indexOf('submitBtn.innerText = "Sending..."'));
assert(restore.indexOf('updateCreateRecoveryNotice_()') > restore.indexOf('submitBtn.disabled = false'),'Recovery state must be applied after normal button restoration');
const retired = ['development','NotificationsSuppressed_'].join('');
for (const directory of [root,__dirname]) {
  for (const file of fs.readdirSync(directory)) {
    if (!/\.(js|cjs)$/.test(file)) continue;
    assert(!fs.readFileSync(path.join(directory,file),'utf8').includes(retired),`Retired helper in ${file}`);
  }
}
const {createRuntime} = require('./performance-fixtures.cjs');
// Captured from the September baseline using synthetic rows, with no school data.
const expected = require('./dashboard-contract-fixture.json');
for (const role of ['admin','staff','head','finance']) {
  const runtime = createRuntime(path.join(root,'Code.js'),100);
  runtime.setActor(role+'@claremontschool.co.uk');
  const result = runtime.api.getDashboardData();
  assert(result.success);
  assert(runtime.calls.reads <= expected[role].readCeiling,`${role} exceeded the baseline spreadsheet-read ceiling`);
  assert.equal(result.orders.length,expected[role].count);
  assert.deepEqual(JSON.parse(JSON.stringify(result.orders.slice(0,3).map(({id,dept,qty,totalPrice})=>({id,dept,qty,totalPrice})))),expected[role].firstOrders);
}
console.log('Recovery restoration, retired helper references and read ceilings passed.');
