const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "Code.js"), "utf8");
const configurationHtml = fs.readFileSync(path.join(root, "configuration.html"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "Index.html"), "utf8");

class FakeRange {
  constructor(sheet, row, column, rowCount, columnCount) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount || 1;
    this.columnCount = columnCount || 1;
  }
  getValues() {
    const values = [];
    for (let r = 0; r < this.rowCount; r += 1) {
      const row = [];
      for (let c = 0; c < this.columnCount; c += 1) {
        row.push((this.sheet.values[this.row - 1 + r] || [])[this.column - 1 + c] ?? "");
      }
      values.push(row);
    }
    return values;
  }
  getValue() {
    return this.getValues()[0][0];
  }
}

class FakeSheet {
  constructor(values) {
    this.values = values.map(row => row.slice());
  }
  getLastRow() {
    return this.values.length;
  }
  getLastColumn() {
    return Math.max(0, ...this.values.map(row => row.length));
  }
  getDataRange() {
    return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn());
  }
  getRange(row, column, rowCount, columnCount) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }
}

let activeEmail = "admin@claremontschool.co.uk";
let workbook = null;
const context = {
  console,
  JSON,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  RegExp,
  Error,
  Set,
  Map,
  Session: {
    getActiveUser: () => ({ getEmail: () => activeEmail }),
    getEffectiveUser: () => ({ getEmail: () => activeEmail }),
    getScriptTimeZone: () => "Europe/London"
  },
  ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/test/exec" }) },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => workbook
  },
  Utilities: {
    parseCsv: value => [String(value || "").split(",")]
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => key.endsWith('_data_version') ? "0" : null,
      setProperty: () => {}
    })
  },
  LockService: {
    getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
  }
};
vm.createContext(context);
vm.runInContext(
  `${source}
  globalThis.__configurationTestApi = {
    getUserCapabilities_,
    isConfigurationActiveValue_,
    getAuthorizedUserContext_,
    normalizeUserConfigurationPayload_,
    getBudgetSnapshot_,
    buildNewBudgetFormulaStrings_,
    isConfigurationFormulaErrorDisplay_
  };`,
  context,
  { filename: "Code.js" }
);
const api = context.__configurationTestApi;

function fakeWorkbook(sheets) {
  return {
    getSheetByName: name => sheets[name] || null
  };
}

function expectThrowsWith(fn, messagePart) {
  assert.throws(fn, error => String(error.message || error).includes(messagePart));
}

const liveAdminCaps = api.getUserCapabilities_({
  role: "Admin",
  realRole: "Admin",
  isSimulated: false
});
assert.strictEqual(liveAdminCaps.canManageConfiguration, true);
for (const user of [
  { role: "Staff", realRole: "Staff", isSimulated: false },
  { role: "Head", realRole: "Head", isSimulated: false },
  { role: "Wipro", realRole: "Wipro", isSimulated: false },
  { role: "Staff", realRole: "Admin", isSimulated: true }
]) {
  assert.strictEqual(api.getUserCapabilities_(user).canManageConfiguration, false);
}

for (const inactiveValue of [false, 0, "false", "No", "Inactive", "disabled", "0"]) {
  assert.strictEqual(api.isConfigurationActiveValue_(inactiveValue), false);
}
for (const activeValue of [true, 1, "", "Yes", "Active"]) {
  assert.strictEqual(api.isConfigurationActiveValue_(activeValue), true);
}

const usersSheet = new FakeSheet([
  ["Email", "Department", "Role", "Default Site", "Simulation Email", "Active"],
  ["admin@claremontschool.co.uk", "IT", "Admin", "Senior", "", true],
  ["staff@claremontschool.co.uk", "IT", "Staff", "Prep", "", true],
  ["inactive@claremontschool.co.uk", "IT", "Staff", "Prep", "", false]
]);
workbook = fakeWorkbook({ Users: usersSheet });
activeEmail = "staff@claremontschool.co.uk";
assert.strictEqual(api.getAuthorizedUserContext_().role, "Staff");
activeEmail = "inactive@claremontschool.co.uk";
expectThrowsWith(() => api.getAuthorizedUserContext_(), "inactive");
activeEmail = "unknown@claremontschool.co.uk";
expectThrowsWith(() => api.getAuthorizedUserContext_(), "not authorized");

const budgetsSheet = new FakeSheet([
  ["Department", "TotalAllocation", "Spent", "Remaining", "GL Code", "Active"],
  ["IT", 10000, 2500, 7500, "6100-IT", true],
  ["Old Department", 5000, 1000, 4000, "6999", false],
  ["Wipro", 0, 0, 0, "", true]
]);
workbook = fakeWorkbook({ Budgets: budgetsSheet });
const normalizedUser = api.normalizeUserConfigurationPayload_(workbook, {
  email: "new.user@claremontschool.co.uk",
  role: "Staff",
  defaultSite: "Prep",
  departments: ["IT"]
});
assert.deepStrictEqual(Array.from(normalizedUser.departments), ["IT"]);
expectThrowsWith(() => api.normalizeUserConfigurationPayload_(workbook, {
  email: "new.user@claremontschool.co.uk",
  role: "Staff",
  defaultSite: "",
  departments: ["IT"]
}), "default site");
expectThrowsWith(() => api.normalizeUserConfigurationPayload_(workbook, {
  email: "new.user@claremontschool.co.uk",
  role: "Staff",
  defaultSite: "Prep",
  departments: []
}), "at least one active department");
expectThrowsWith(() => api.normalizeUserConfigurationPayload_(workbook, {
  email: "new.user@claremontschool.co.uk",
  role: "Staff",
  defaultSite: "Prep",
  departments: ["Old Department"]
}), "not an active department");

const budgetSnapshot = api.getBudgetSnapshot_(workbook);
assert.ok(budgetSnapshot.IT);
assert.ok(!budgetSnapshot["Old Department"]);

const newBudgetFormulas = api.buildNewBudgetFormulaStrings_("A58", "B58", "C58", "B", "K", "P");
assert.strictEqual(
  newBudgetFormulas.spent,
  '=SUMPRODUCT((Orders!$B$2:$B=A58) * (IF(Orders!$P$2:$P<>"", Orders!$P$2:$P, Orders!$K$2:$K)))'
);
assert.strictEqual(newBudgetFormulas.remaining, "=B58-C58");
assert.ok(!newBudgetFormulas.spent.includes("Orders!$B:$B"));
assert.strictEqual(api.isConfigurationFormulaErrorDisplay_("#VALUE!"), true);
assert.strictEqual(api.isConfigurationFormulaErrorDisplay_(" #N/A"), true);
assert.strictEqual(api.isConfigurationFormulaErrorDisplay_("£0.00"), false);
assert.ok(source.includes("nothing was saved. Please contact IT."));
assert.ok(source.includes("clearContent();"));

for (const endpoint of [
  "saveAdminBudgetConfiguration",
  "setAdminBudgetActive",
  "saveAdminUserConfiguration",
  "setAdminUserActive",
  "saveAdminSystemSettings"
]) {
  const endpointPattern = new RegExp(`function ${endpoint.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\([^]*?configurationWriteResponse_\\(`);
  assert.ok(endpointPattern.test(source), `${endpoint} must use the server-enforced configuration write guard`);
}
assert.ok(source.includes("requireLiveConfigurationAdmin_(user)"));
assert.ok(source.includes("The final active Admin account cannot be deactivated."));
assert.ok(source.includes("You cannot deactivate your own account."));
assert.ok(source.includes("The Wipro system department cannot be deactivated."));
assert.ok(source.includes("pending order"));

const systemSettingsBody = source.slice(
  source.indexOf("function saveAdminSystemSettings"),
  source.indexOf("function getBudgetSnapshot_")
);
assert.ok(systemSettingsBody.includes('getRange("B2")'));
assert.ok(!systemSettingsBody.includes('getRange("B3")'));

assert.ok(configurationHtml.includes('id="senderAlias"'));
assert.ok(configurationHtml.includes('readonly aria-readonly="true"'));
assert.ok(configurationHtml.includes("Required for every account."));
assert.ok(configurationHtml.includes("Choose at least one department."));
assert.ok(!configurationHtml.includes("Preview only"));
for (const sectionBody of ["departmentsBody", "usersBody", "systemSettingsBody", "auditBody"]) {
  assert.ok(configurationHtml.includes(`class="collapse" id="${sectionBody}"`));
}

assert.ok(indexHtml.includes('id="ddConfiguration"'));
assert.ok(indexHtml.includes('target="_blank" rel="noopener"'));
assert.ok(indexHtml.includes("getConfigurationChangeVersion"));
assert.match(indexHtml, /version\s*===\s*lastConfigurationVersion/);
assert.ok(indexHtml.includes("masterSheetChoiceModal"));

console.log("Configuration live tests passed.");
