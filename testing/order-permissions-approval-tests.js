const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "Code.js"), "utf8");
const portal = fs.readFileSync(path.join(root, "Index.html"), "utf8");
const configuration = fs.readFileSync(path.join(root, "configuration.html"), "utf8");

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
  ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/test/exec" }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) }
};
vm.createContext(context);
vm.runInContext(`${server}
globalThis.__permissionApi = {
  getUserCapabilities_, canViewOrderRecord_, canProcessOrderRecord_, getOrderRecordActions_,
  shouldRequireIndependentSignoff_, getRequiredDevelopmentProperty_, isConfigurationEnabledFlag_,
  bootstrapDevelopmentEnvironment_
};`, context);
const api = context.__permissionApi;
assert.strictEqual(api.isConfigurationEnabledFlag_(""), false);
assert.strictEqual(api.isConfigurationEnabledFlag_(undefined), false);
assert.strictEqual(api.isConfigurationEnabledFlag_(true), true);

function user(role, flags) {
  const record = Object.assign({
    email: "person@claremontschool.co.uk",
    realEmail: "person@claremontschool.co.uk",
    role,
    realRole: role,
    depts: ["Science"],
    isSimulated: false,
    canProcessOrders: false,
    canLogInvoices: false
  }, flags || {});
  record.capabilities = api.getUserCapabilities_(record);
  return record;
}

const ordinaryStaff = user("Staff");
assert.strictEqual(ordinaryStaff.capabilities.hasExplicitOrderProcessingPermission, false, "blank order permission must default false");
assert.strictEqual(ordinaryStaff.capabilities.hasExplicitInvoiceLoggingPermission, false, "blank invoice permission must default false");
assert.strictEqual(ordinaryStaff.capabilities.canManageOrders, false);
assert.strictEqual(ordinaryStaff.capabilities.canLogInvoice, false);

const processor = user("Staff", { canProcessOrders: true });
assert.strictEqual(processor.capabilities.canManageOrders, true);
assert.strictEqual(processor.capabilities.canViewAllOrderData, true);
assert.strictEqual(processor.capabilities.canViewAllFinanceData, false);
assert.strictEqual(api.canViewOrderRecord_(processor, "English", "Order"), true, "processor must see cross-department normal orders");
assert.strictEqual(api.canViewOrderRecord_(processor, "English", "Invoice"), false, "processor must not see cross-department invoices");
assert.strictEqual(api.canViewOrderRecord_(processor, "English", "Transfer"), false, "processor must not see cross-department transfers");
assert.strictEqual(api.canProcessOrderRecord_(processor, "English", "Order"), true);
assert.strictEqual(api.canProcessOrderRecord_(processor, "English", "Invoice"), false);

const invoiceLogger = user("Staff", { canLogInvoices: true });
assert.strictEqual(invoiceLogger.capabilities.canLogInvoice, true);
assert.strictEqual(api.canViewOrderRecord_(invoiceLogger, "English", "Invoice"), false, "invoice logger remains department-scoped");
assert.strictEqual(api.canViewOrderRecord_(invoiceLogger, "Science", "Invoice"), true);

const headProcessor = user("Head", { canProcessOrders: true });
assert.strictEqual(headProcessor.capabilities.canManageOrders, true);
assert.strictEqual(headProcessor.capabilities.canAccessFinanceDashboard, true, "existing Head overview must remain");
const wipro = user("Wipro", { canProcessOrders: true, canLogInvoices: true });
assert.strictEqual(wipro.capabilities.hasExplicitOrderProcessingPermission, false, "role permissions must not become add-ons");
assert.strictEqual(wipro.capabilities.canViewAllFinanceData, true);
const admin = user("Admin");
assert.strictEqual(admin.capabilities.canApproveOrders, true);
assert.strictEqual(admin.capabilities.canManageConfiguration, true);

const columns = { recordTypeIndex: 20, processedByIndex: 22, approvalStatusIndex: 23 };
function row(requester, processorEmail, status, completed) {
  const values = new Array(27).fill("");
  values[0] = "TEST-1";
  values[1] = "English";
  values[3] = requester;
  values[6] = "Synthetic order";
  values[13] = completed ? new Date() : "";
  values[20] = "Order";
  values[22] = processorEmail || "";
  values[23] = status || "NOT_REQUIRED";
  return values;
}

assert.strictEqual(api.shouldRequireIndependentSignoff_(processor, row("PERSON@claremontschool.co.uk")), true, "self-processing comparison must be case-insensitive");
assert.strictEqual(api.shouldRequireIndependentSignoff_(processor, row("someone.else@claremontschool.co.uk")), false);
assert.strictEqual(api.shouldRequireIndependentSignoff_(admin, row("person@claremontschool.co.uk")), false, "Admin own purchases do not require independent review");

const secondProcessor = user("Staff", {
  email: "reviewer@claremontschool.co.uk",
  realEmail: "reviewer@claremontschool.co.uk",
  canProcessOrders: true
});
const awaiting = row("person@claremontschool.co.uk", "person@claremontschool.co.uk", "AWAITING_SIGNOFF", true);
assert.strictEqual(api.getOrderRecordActions_(processor, awaiting, columns).canApprove, false, "requester/processor must not self-approve");
assert.strictEqual(api.getOrderRecordActions_(admin, awaiting, columns).canApprove, true, "Admin can clear their own existing queued purchase");
assert.strictEqual(api.getOrderRecordActions_(secondProcessor, awaiting, columns).canApprove, true, "another processor may approve");
const adminReviewer = user("Admin", { email: "admin.reviewer@claremontschool.co.uk", realEmail: "admin.reviewer@claremontschool.co.uk" });
assert.strictEqual(api.getOrderRecordActions_(adminReviewer, awaiting, columns).canApprove, true, "Admin fallback may approve someone else's purchase");

assert.throws(
  () => api.getRequiredDevelopmentProperty_("DEV_SPREADSHEET_ID"),
  /Production data was not accessed/,
  "missing development properties must fail closed"
);

assert.ok(server.includes("if (isDevelopmentRuntime_())"));
assert.ok(server.includes("if (developmentValues.every(value => !value)) bootstrapDevelopmentEnvironment_();"), "first /dev load must initialise isolated resources when all DEV properties are absent");
assert.ok(server.includes("Session.getEffectiveUser().getEmail()"), "development setup must support deploying-user identity fallback");
assert.ok(server.includes("SpreadsheetApp.openById(devId)"));
assert.ok(server.includes("const actualRecipient = developmentRecipient || intendedRecipient"));
assert.ok(server.includes("if (user.isSimulated && !isDevelopmentRuntime_())"), "live simulated approval must be rejected");
const otherDeptPending = row("person@claremontschool.co.uk", "", "NOT_REQUIRED", false);
assert.strictEqual(api.getOrderRecordActions_(processor, otherDeptPending, columns).canProcess, true);
assert.strictEqual(api.getOrderRecordActions_(processor, otherDeptPending, columns).canCancel, false, "cross-department visibility must not widen cancellation");
assert.strictEqual(api.getOrderRecordActions_(user("Staff",{depts:["English"]}), otherDeptPending, columns).canCancel, true, "assigned department keeps pending cancellation");
assert.ok(server.includes("sheet.getRange(item.rowNumber, orderColumns.processedByColumn, 1, 5)"), "bulk processing must include approval metadata in editability preflight");
assert.ok(server.indexOf("const normalizedItems = []") < server.indexOf("normalizedItems.forEach(item =>"), "bulk writes must follow full validation");

assert.ok(configuration.includes('id="userCanProcessOrders"'));
assert.ok(configuration.includes('id="userCanLogInvoices"'));
assert.ok(portal.includes("ORDERING VIEW:"));
assert.ok(portal.includes("Awaiting independent sign-off"));
assert.ok(portal.includes("function openApprovalReview"));
assert.ok(portal.includes("function submitApprovalDecision"));
assert.ok(server.includes("function getApprovalNotificationRecipients_()"));
assert.ok(server.includes("const centralAddress = (getConfig_().financeEmail"), "sign-off alerts must use the existing central ordering address");
assert.ok(server.includes("to: getConfig_().financeEmail"), "review results must return to the central ordering address");
assert.ok(!server.includes("getEligibleApprovalRecipients_"), "ordering users must not receive individual sign-off alerts");
assert.ok(portal.includes("function toggleOrderActionsMenu_"), "Finance actions must remain available through the tested actions menu");
assert.ok(portal.includes("'Process invoice'"), "Finance must have an explicit processing entry point");
assert.ok(portal.includes("'Mark invoice processed'"), "Finance must be able to process an invoice record");

const emptyIterator = () => ({ hasNext: () => false, next: () => null });
const makeSheet = () => ({
  setName: () => {},
  setFrozenRows: () => {},
  hideColumns: () => {},
  hideSheet: () => {},
  getLastRow: () => 1,
  appendRow: () => {},
  getRange: (...args) => ({
    setValues: rows => {
      if (typeof args[0] === "number" && typeof args[3] === "number") {
        rows.forEach(row => assert.strictEqual(row.length, args[3], "fixture row width must match its target range"));
      }
      return this;
    }
  })
});
const developmentProperties = {};
context.ScriptApp.getService = () => ({ getUrl: () => "https://script.google.com/macros/s/test/dev" });
context.Session = {
  getActiveUser: () => ({ getEmail: () => "admin@claremontschool.co.uk" }),
  getEffectiveUser: () => ({ getEmail: () => "owner@claremontschool.co.uk" })
};
context.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: name => developmentProperties[name] || "",
    setProperties: values => Object.assign(developmentProperties, values)
  })
};
context.DriveApp = {
  getFilesByName: emptyIterator,
  getFoldersByName: emptyIterator,
  createFolder: () => ({ getId: () => "dev-folder-id" })
};
context.SpreadsheetApp = {
  create: () => {
    const firstSheet = makeSheet();
    return {
      getId: () => "dev-spreadsheet-id",
      getSheets: () => [firstSheet],
      insertSheet: () => makeSheet()
    };
  }
};
const setupResult = api.bootstrapDevelopmentEnvironment_();
assert.strictEqual(setupResult.created, true);
assert.strictEqual(developmentProperties.DEV_SPREADSHEET_ID, "dev-spreadsheet-id");
assert.strictEqual(developmentProperties.DEV_ATTACHMENT_FOLDER_ID, "dev-folder-id");
assert.strictEqual(developmentProperties.DEV_NOTIFICATION_EMAIL, "admin@claremontschool.co.uk");

console.log("Order permissions and independent approval tests passed.");

