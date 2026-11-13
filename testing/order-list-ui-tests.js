const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "Index.html"), "utf8");
const scriptlets = html.match(/<\?[\s\S]*?\?>/g) || [];
assert.equal((html.match(/<\?/g) || []).length, scriptlets.length, 'Every Apps Script template opener must be closed');
assert(scriptlets.every(tag => /^<\?= (appUrl|initialOrderRef|initialApprovalRef) \?>$/.test(tag) ||
  /^<\?!= includePortalStyles_\('(SharedPolish|SharedDropdowns|PortalClientContext)'\); \?>$/.test(tag)),
  'Only known Apps Script template tags may appear in Index');

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.trim());
inlineScripts.forEach((source, index) => {
  assert.doesNotThrow(() => new Function(source), `Inline script ${index} must parse`);
});

assert.ok(
  /\.order-cost-column\s*\{[^}]*min-width:\s*105px;[^}]*white-space:\s*nowrap;/s.test(html),
  "Cost cells must reserve enough width and prevent wrapping"
);
assert.match(html, /class="sortable order-cost-column"[^>]*data-sort-field="totalPrice"[^>]*><button[^>]*onclick="sortBy\('totalPrice'\)"/);
assert.ok(html.includes('data-label="Cost" class="order-cost-column"'));
assert.ok(
  /\.portal-width\s*\{[^}]*max-width:\s*1400px;/s.test(html),
  'Portal should retain its existing width on normal screens'
);
assert.ok(
  /@media\s*\(min-width:\s*1600px\)\s*\{\s*\.portal-width\s*\{[^}]*max-width:\s*1600px;/s.test(html),
  'Portal should use more available space on wide screens'
);
assert.match(html, /class="container-fluid portal-width" id="mainApp"[^\n]*role="main" style="display:none;"/);

assert.ok(html.includes('id="applyBudgetTransferBtn"'));
assert.ok(html.includes('id="budgetTransferStatus" role="status" aria-live="polite"'));
assert.ok(html.includes("function setBudgetTransferInFlight_(active)"));
assert.ok(html.includes("if (budgetTransferInFlight) return;"));
assert.ok(html.includes("setBudgetTransferInFlight_(true);"));
assert.ok(html.includes("applyButton.disabled = budgetTransferInFlight;"));

assert.ok(html.includes("const ROWS_PER_PAGE_STORAGE_KEY_ = 'portalRowsPerPage';"));
assert.ok(html.includes("const ALLOWED_ROWS_PER_PAGE_ = [10, 25, 50];"));
assert.ok(html.includes("let rowsPerPage = getStoredRowsPerPage_();"));
assert.ok(html.includes("function updateRows(v) { setRowsPerPagePreference_(v); renderApp(true); }"));
assert.ok(html.includes("rowsPerPage = normalizeRowsPerPage_(rowsSelect.value, rowsPerPage);"));
assert.ok(html.includes("setRowsPerPagePreference_(state.rowsPerPage || getStoredRowsPerPage_());"));

assert.ok(
  /function shouldSkipAutoRefresh_\(\)\s*\{[^}]*if \(document\.hidden\) return true;/s.test(html),
  "Automatic refreshes must not run while the tab is hidden"
);
assert.ok(html.includes("silentFailure: true"));
assert.ok(html.includes("[PORTAL_BACKGROUND_REFRESH_FAILED]"));
assert.ok(
  /document\.addEventListener\('visibilitychange',[\s\S]*?if \(document\.hidden\)\s*\{[\s\S]*?stopAutoRefresh_\(\);/s.test(html),
  "Hiding the tab must stop its refresh timer"
);
assert.ok(html.includes('scheduleReturnRefresh_("visibility")'));

console.log("Order list UI tests passed.");
