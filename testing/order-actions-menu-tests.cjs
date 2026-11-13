const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '../Index.html'), 'utf8');
const start = html.indexOf('function buildOrderActionsHtml_(');
const source = html.slice(start, html.indexOf('let orderActionsTrigger_', start));
const build = vm.runInNewContext(source + ';buildOrderActionsHtml_', {isInvoiceOrder:o=>o.recordType === 'Invoice',escapeBulkHtml:String});
// Compare the new menu with the former row controls over all capability/status combinations.
for (let mask = 0; mask < 1024; mask++) {
  const bit = n => !!(mask & (1 << n));
  const caps = {canDuplicateRequests:bit(0),canCancelOrders:bit(1),hasExplicitOrderProcessingPermission:bit(2),canViewAllFinanceData:bit(3)};
  const actions = {canEdit:bit(4),canProcess:bit(5),canCorrect:bit(6)};
  const completed=bit(7), cancelled=bit(8), transfer=bit(9);
  for (const access of [false,true]) {
    const result=build({id:"order'1",hasNotes:true},caps,actions,completed,cancelled,transfer,access);
    assert.equal(result.includes('duplicateOrder('), !transfer && !cancelled && caps.canDuplicateRequests);
    assert.equal(result.includes('editOrder('), !transfer && actions.canEdit);
    assert.equal(result.includes('openFinance('), !transfer && !cancelled && (actions.canProcess || actions.canCorrect));
    assert.equal(result.includes('cancelOrder('), !transfer && caps.canCancelOrders && !completed && !cancelled && (access || caps.canViewAllFinanceData));
    assert(result.includes('openNotes(') && result.includes('openDetails('));
    assert(result.includes('bi-envelope-fill'), 'Existing notes remain visible in the row');
    const popup = result.split('<template>')[1] || '';
    assert(!popup.includes('openNotes('), 'Messages must not be hidden inside the menu');
    assert(result.includes('order%271'), 'IDs must not break inline action attributes');
  }
}
assert(build({id:'empty'}, {}, {}, false, false, false, false).includes('bi-envelope"'), 'Empty message icon remains unfilled');
assert(!build({id:'denied'},{canCancelOrders:true},{canEdit:true,canCancel:false},false,false,false,true).includes('cancelOrder('), 'Server cancellation action controls row visibility');
assert(build({id:'locked'},{canViewAllFinanceData:true},{canAddEvidence:true},true,false,false,true).includes('openFinance('), 'Evidence-only actions remain available on protected orders');
console.log('Order menu respects record-specific permissions across 2,048 combinations.');
