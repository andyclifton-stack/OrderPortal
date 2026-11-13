const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8').replace(/\r\n/g, '\n');
const start = html.indexOf("function renderBudgetOverview_(");
const end = html.indexOf('function buildOrderActionsHtml_', start);
assert.ok(start > 0 && end > start);
const source = html.slice(start, end);
const elements = {};
const document = { getElementById(id) {
  return elements[id] ||= { style: {}, classList: { toggle() {} },
    setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; } };
} };
const context = vm.createContext({ document, activeView: 'IT', currentBudgetLimit: 0,
  globalData: { budgets: {}, summary:{ledger:{}} }, derivedData: { deptSummary: {} },
  formatCurrency: value => Number(value).toFixed(2), updateSortIcons() {},
  attachTooltipListeners() {}, getVisibleBudgets() { return context.globalData.budgets; }
});
vm.runInContext(source, context);
function render(allocation, used, remaining, spent, committed, view = 'IT', hasCalculationError = false) {
  context.globalData.budgets = allocation === null ? {} : { IT: { total:allocation, remaining } };
  context.globalData.summary.ledger = {IT:{allocation,used,remaining,spent,committed,hasCalculationError}};
  context.derivedData.deptSummary = { IT: { spent, committed } };
  context.renderBudgetOverview_(view);
  return ['barRemaining', 'barCommitted', 'barSpent'].map(id => Number(parseFloat(elements[id].style.width).toFixed(4)));
}
assert.deepStrictEqual(render(0, 877.75, -877.75, 671.96, 205.79), [0, 0, 100], 'Zero allocation with use still shows the ledger bar');
assert.strictEqual(elements.valRemaining.textContent, '-877.75');
assert.strictEqual(elements.budgetOverdrawn.hidden, false, 'Negative remaining budget must show its text warning');
assert.deepStrictEqual(render(1000, 450, 550, 200, 100, 'All'), [55, 0, 45]);
assert.strictEqual(elements.valSpent.textContent, '200.00');
assert.strictEqual(elements.valCommitted.textContent, '100.00');
assert.strictEqual(elements.valRemaining.textContent, '550.00', 'Partial activity does not overstate the ledger balance');
assert.strictEqual(elements.budgetOverdrawn.hidden, true, 'Switching to a healthy budget must clear its warning');
assert.deepStrictEqual(render(0, 877.75, -877.75, 671.96, 205.79), [0, 0, 100], 'Switching back must not retain previous widths');
assert.deepStrictEqual(render(0, 0, 0, 0, 0), [0, 0, 0]);
assert.deepStrictEqual(render(null, 0, 0, 75, 25), [0, 0, 0]);
assert.strictEqual(elements.valRemaining.textContent, 'No budget set');
assert.strictEqual(elements.budgetOverdrawn.hidden, true, 'An unallocated department must not retain an over-budget label');
assert.deepStrictEqual(render(0, 100, -100, 75, 25, 'All'), [0, 0, 100]);
assert.strictEqual(elements.budgetOverdrawn.hidden, false, 'All Departments must also warn when remaining is negative');
assert.deepStrictEqual(render(0, 0, 0, 0, 0, 'All'), [0, 0, 0]);
assert.strictEqual(elements.budgetOverdrawn.hidden, true, 'A zero balance is not over budget');
assert.deepStrictEqual(render(100, 0, 100, 0, 0, 'All', true), [0, 0, 0]);
assert.strictEqual(elements.valRemaining.textContent, 'Unavailable');
console.log('Budget bars: authoritative balance, separate visible activity, zero/missing/invalid budgets and department switching passed.');
