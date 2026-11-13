const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '../Index.html'), 'utf8');
const ctx = {getOrderCost_: o => o.finalPrice ?? o.totalPrice, escapeBulkHtml: s => s, escapeTooltipText: s => s};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function isInvoiceOrder('), html.indexOf('function parseOrderMoney(')), ctx);
vm.runInContext(html.slice(html.indexOf('function formatCompactExpectedDate_('), html.indexOf('function toDateInputValue(')), ctx);
const credit = {recordType:'Invoice', totalPrice:-13.45, dept:'IT'};
const status = (o, completed=false, cancelled=false, transfer=false) => ctx.buildOrderStatusHtml_(o, completed, cancelled, transfer, o.recordType==='Invoice', true);
const pending = status(credit);
assert(!pending.includes('Over budget'));
assert.match(pending, /Pending<\/span><span aria-hidden="true"><\/span><span[^>]*aria-label="Invoice logged"/);
assert(pending.indexOf('bi-receipt') < pending.lastIndexOf('Credit note'));
assert(status({...credit,totalPrice:13.45}).includes('Over budget'));
for (const [completed,cancelled] of [[true,false],[false,true]]) {
  const result = status(credit, completed, cancelled);
  assert(!result.includes('Over budget'));
  assert(!result.includes('Invoice logged'));
  assert(result.includes('Credit note'));
}
const budgetCheck = html.slice(html.indexOf('let isOverBudgetRisk = '), html.indexOf('if (!isCompleted && !isCancelled && !isTransfer) pendingVisible'));
ctx.caps = {canUseAllDepartmentView:true};
ctx.globalData = {paging:false};
ctx.isCompleted = false; ctx.isCancelled = false;
for (const cost of [-13.45,13.45]) {
  ctx.o = {...credit,totalPrice:cost}; ctx.budgetFlags = {IT:-100};
  const result = vm.runInContext(`(()=>{${budgetCheck};return isOverBudgetRisk;})()`, ctx);
  assert.equal(result, cost > 0);
  assert.equal(ctx.budgetFlags.IT, -100-cost);
}
ctx.globalData = {paging:true};
ctx.o = {...credit,overBudget:true};
assert.equal(vm.runInContext(`(()=>{${budgetCheck};return isOverBudgetRisk;})()`,ctx),false);
console.log('Credit status tests passed: indicator order, empty warning slot, pending/processed/cancelled credits, positive warnings and signed running balance.');
