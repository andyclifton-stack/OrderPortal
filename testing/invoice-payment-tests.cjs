const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {createRuntime} = require('./performance-fixtures.cjs');
const r = createRuntime(path.resolve(__dirname, '../Code.js'), 4, {strictInputs:true});
const form = {dept:'Science',supplier:'Payment test',desc:'Direct spend',cost:5,reportingSite:'Unassigned',files:[]};
const before = JSON.stringify(r.sheets.Orders.rows);
for (const paymentMethod of ['', 'Cash', '<script>']) {
  assert.equal(r.api.logInvoice({...form,paymentMethod}).saved,false);
  assert.equal(JSON.stringify(r.sheets.Orders.rows),before);
}
for (const paymentMethod of ['Credit card','Invoice / on account']) {
  const request = {...form,paymentMethod,invoiceNumber:'INV-'+paymentMethod,clientRequestId:'invoice-'+paymentMethod.replace(/\W/g,'')};
  assert(r.api.logInvoice(request).saved);
  const id = r.sheets.Orders.rows.at(-1)[0];
  const get = () => r.api.getDashboardData().orders.find(o=>o.id===id);
  assert.equal(get().paymentMethod,paymentMethod);
  assert.equal(get().recordType,'Invoice');
  assert(r.api.logInvoice(request).replayed);
  assert(r.api.processInvoice({id,expectedVersion:get().version}).saved);
  assert.equal(get().paymentMethod,paymentMethod,'Finance processing preserves the logged method');
}
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
const ctx={getOrderCost_:o=>o.totalPrice};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function isInvoiceOrder('),html.indexOf('function parseOrderMoney(')),ctx);
vm.runInContext(html.slice(html.indexOf('function formatForExcel('),html.indexOf('let simulationTargets_')),ctx);
const rows=ctx.formatForExcel([{recordType:'Invoice',paymentMethod:'Credit card'},{recordType:'Invoice'},{recordType:'Transfer'}]);
assert.deepEqual(Array.from(rows,r=>r['Payment Method']),['Credit card','Not recorded','Not applicable']);
const fields={invDept:'Science',invSupplier:'Test',invDesc:'Test',invCost:'5',invPaymentMethod:'',invReportingSite:'Unassigned'};
ctx.document={getElementById:id=>({value:fields[id]})};
vm.runInContext(html.slice(html.indexOf('function validateInvoiceForm()'),html.indexOf('function setInvoiceButtonsSaving')),ctx);
assert.equal(ctx.validateInvoiceForm().fieldId,'invPaymentMethod');
fields.invPaymentMethod='Credit card';
assert.equal(ctx.validateInvoiceForm().values.paymentMethod,'Credit card');
console.log('Invoice payment validation, persistence, replay, processing preservation, exports and form checks passed.');
