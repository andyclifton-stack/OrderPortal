const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "Code.js"), "utf8").replace(/\r\n/g, "\n");
const portal = fs.readFileSync(path.join(root, "Index.html"), "utf8").replace(/\r\n/g, "\n");
const configuration = fs.readFileSync(path.join(root, "configuration.html"), "utf8").replace(/\r\n/g, "\n");
const dashboard = fs.readFileSync(path.join(root, "dashboard.html"), "utf8").replace(/\r\n/g, "\n");

const expectedPublicFunctions = [
  "doGet",
  "portalRpc",
  "getConfigurationChangeVersion",
  "getAdminConfigurationPreview",
  "getAdminSignoffCleanupPreview",
  "clearAdminPurchaseSignoffs",
  "saveAdminBudgetConfiguration",
  "setAdminBudgetActive",
  "saveAdminUserConfiguration",
  "setAdminUserActive",
  "saveAdminSystemSettings",
  "getUserContext",
  "getSimulationTargets",
  "setSimulation",
  "getDashboardData",
  "getOrderDetails",
  "getOrderRecord",
  "getOrderExportPage",
  "getOrderSupplierSuggestions",
  "getBudgetTransferStatus",
  "getPortalSaveStatus",
  "getOrderApprovalHistory",
  "auditDepartmentNameIssues",
  "getOverviewDashboardData",
  "getOverviewExportPage",
  "submitOrder",
  "createBudgetTransfer",
  "logInvoice",
  "processInvoice",
  "saveOrderInvoiceEvidence",
  "savePurchaseReportingSite",
  "saveOrderReturn",
  "bulkFinalizeOrders",
  "updateInvoice",
  "updateOrder",
  "reviewOrderApproval",
  "resubmitOrderApproval",
  "userCancelOrder",
  "addNote",
  "removeInvoiceRecord",
  "voidDuplicateInvoice",
  "reportMissingBudget"
].sort();

const reviewedServer = server + (process.env.PORTAL_TEST_UNEXPECTED_ACTION ? '\nfunction unexpectedAction() {}' : '');
const actualPublicFunctions = [...reviewedServer.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)]
  .map(match => match[1])
  .filter(name => !name.endsWith("_"))
  .sort();
assert.deepStrictEqual(actualPublicFunctions, expectedPublicFunctions, "Apps Script public functions must match the reviewed allow-list");

[
  "getConfig_",
  "logError_",
  "sendPortalErrorNotification_",
  "sendEmailAlert_",
  "getOrderChatConfiguration_",
  "shouldSendOrderChatAlert_",
  "buildOrderChatMessage_",
  "sendOrderChatAlert_",
  "uploadFileToDrive_",
  "extractOrderData_",
  "formatEmailBody_"
].forEach(name => assert.ok(server.includes(`function ${name}(`), `${name} must remain private`));

assert.match(server, /const calculatedTotal = .*Math\.round\(quantity \* unitPrice \* 100\) \/ 100;/);
assert.ok(server.includes("validateQuantityField_(input.qty)"));
assert.ok(server.includes("validateMoneyField_(input.unitPrice"));
assert.ok(server.includes("validateMoneyField_(input.cost"));
assert.ok(server.includes("parseOptionalDateField_(input.dateNeeded"));
assert.ok(server.includes("if (!canEditPendingRequest_(user, data[i], orderColumns))"));
assert.ok(server.includes("if (recordType === \"Transfer\") return \"Budget transfer records cannot be managed as orders.\""));
assert.ok(server.includes("hasCalculationError"));
assert.ok(server.includes("Budget calculation unavailable"));

assert.ok(server.includes("if (files.length > 5)"));
assert.ok(server.includes("larger than the 5 MB attachment limit"));
assert.ok(server.includes("trashUploadedFiles_(uploadedFileIds)"));
assert.ok(server.includes("if (!orderRowSaved && !e.saveUncertain) trashUploadedFiles_(uploadedFileIds);"));
assert.ok(server.includes("if (!invoiceRowSaved && !e.saveUncertain) trashUploadedFiles_(uploadedFileIds);"));
assert.ok(server.includes("warningCode"));
assert.ok(server.includes("warningMessage"));
assert.ok(server.includes("NOTIFICATION_FAILED"));
assert.ok(server.includes("let orderChatPayload = null;"));
assert.ok(server.includes("orderChatPayload = createOrderChatPayload_(user, isEdit, orderObj);"));
assert.ok(server.includes("const orderChatResult = sendOrderChatAlert_(orderChatPayload);"));
assert.ok(
  server.indexOf("const orderChatResult = sendOrderChatAlert_(orderChatPayload);") > server.indexOf("const result = withWriteLock_(\"submitOrder\""),
  "Chat delivery must run after the order write lock completes"
);
assert.ok(server.includes("CacheService.getScriptCache()"));
assert.ok(server.includes('const PORTAL_ERROR_ALERT_EMAIL_ = "andy.clifton+error@claremontschool.co.uk";'));
assert.ok(server.includes("function createPortalErrorDeliveryPlan_"));
assert.ok(server.includes("deliveryPlan.forEach(emailData => { portalAssertExecutionAccount_(); sendPortalServiceEmail_(emailData); });"));
assert.ok(server.includes("Do not call logError_ here"));
assert.ok(!server.includes("error-email-test"), "The temporary development email-test route must not remain in the final build");

assert.ok(server.includes("renamedDependencies.rollback();"));
assert.ok(server.includes("appendConfigurationAudit_"));
assert.ok(server.indexOf("SpreadsheetApp.flush();\n      appendConfigurationAudit_") > -1,
  "Department audit must be written only after the related spreadsheet writes flush");

assert.ok(portal.includes("bootstrap.Modal.getOrCreateInstance"));
assert.ok(configuration.includes("bootstrap.Modal.getOrCreateInstance"));
assert.ok(portal.includes("document.getElementById('finMessage').value = \"\";"));
assert.ok(portal.includes("document.getElementById('newNoteText').value = \"\";"));
assert.ok(portal.includes("function prepLogInvoiceTab(force = false)"));
[
  "invSupplier",
  "invDesc",
  "invCost",
  "invInvoiceNumber",
  "invFiles"
].forEach(id => assert.ok(portal.includes(`document.getElementById('${id}')`), `Log Invoice reset must cover ${id}`));

assert.ok(portal.includes("function normalizeWriteResponse_"));
assert.ok(portal.includes("function showSavedResult_"));
assert.ok(portal.includes("Budget calculation unavailable for:"));
assert.ok(portal.indexOf("updateBudgetHealthAlert_(activeView);") > portal.indexOf("let activeView = 'All';"));
assert.ok(configuration.includes('id="senderAlias"') && configuration.includes('readonly'));

assert.ok(portal.includes("function getSafeLink"));
assert.ok(portal.includes("!['http:', 'https:'].includes(parsed.protocol)"));
assert.ok(portal.includes("rel=\"noopener\""));
assert.ok(portal.includes("function escapeBulkHtml"));
assert.ok(dashboard.includes("function escapeHtml"));
assert.ok(server.includes("function escapeEmailHtml_"));
assert.ok(server.includes("replace(/\\n/g,'<br>')"));

const testScriptProperties = {
  ORDER_CHAT_WEBHOOK_URL: "https://chat.googleapis.com/v1/spaces/TESTSPACE/messages?key=test-key&token=test-token",
  ORDER_CHAT_WATCH_EMAIL: "Samuel.Bodle@claremontschool.co.uk"
};
let scriptServiceUrl = "https://script.google.com/macros/s/test/exec";
let chatFetchResponseCode = 200;
let chatFetchShouldThrow = false;
const chatFetchCalls = [];
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
  ScriptApp: { getService: () => ({ getUrl: () => scriptServiceUrl }) },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: name => testScriptProperties[name] || ""
    })
  },
  UrlFetchApp: {
    fetch: (url, options) => {
      chatFetchCalls.push({ url, options });
      if (chatFetchShouldThrow) throw new Error("Fetch failed for secret URL");
      return { getResponseCode: () => chatFetchResponseCode };
    }
  }
};
vm.createContext(context);
vm.runInContext(`${server}\nglobalThis.__reliabilityApi = { validateTextField_, validateMoneyField_, validateQuantityField_, parseOptionalDateField_, normalizeHttpUrl_, normalizeSupplierLinkValue_, escapeEmailHtml_, isPortalValidationError_, createPortalErrorEmailData_, createPortalErrorDeliveryPlan_, isValidOrderChatWebhookUrl_, getOrderChatConfiguration_, shouldSendOrderChatAlert_, buildOrderChatMessage_, createOrderChatPayload_, sendOrderChatAlert_ };`, context);
const api = context.__reliabilityApi;

assert.strictEqual(api.isValidOrderChatWebhookUrl_(testScriptProperties.ORDER_CHAT_WEBHOOK_URL), true);
assert.strictEqual(api.isValidOrderChatWebhookUrl_("https://example.com/v1/spaces/TEST/messages?key=x&token=y"), false);
assert.strictEqual(api.isValidOrderChatWebhookUrl_("https://chat.googleapis.com/v1/spaces/TEST/messages?key=x"), false);
const chatConfiguration = api.getOrderChatConfiguration_();
assert.strictEqual(chatConfiguration.watchEmail, "samuel.bodle@claremontschool.co.uk");
assert.strictEqual(chatConfiguration.isValid, true);

const samuelUser = {
  email: "SAMUEL.BODLE@claremontschool.co.uk",
  realEmail: "Samuel.Bodle@claremontschool.co.uk",
  isSimulated: false
};
const simulatedSamuelUser = {
  email: "samuel.bodle@claremontschool.co.uk",
  realEmail: "admin@claremontschool.co.uk",
  isSimulated: true
};
assert.strictEqual(api.shouldSendOrderChatAlert_(samuelUser, false, chatConfiguration.watchEmail, false), true);
assert.strictEqual(api.shouldSendOrderChatAlert_(samuelUser, true, chatConfiguration.watchEmail, false), false);
assert.strictEqual(api.shouldSendOrderChatAlert_(simulatedSamuelUser, false, chatConfiguration.watchEmail, false), false);
assert.strictEqual(api.shouldSendOrderChatAlert_(simulatedSamuelUser, false, chatConfiguration.watchEmail, true), true);
assert.strictEqual(api.shouldSendOrderChatAlert_(
  { email: "someone.else@claremontschool.co.uk", realEmail: "someone.else@claremontschool.co.uk", isSimulated: false },
  false,
  chatConfiguration.watchEmail,
  false
), false);

const chatOrder = {
  id: "DEV-CHAT-1",
  dept: "IT",
  requester: "samuel.bodle@claremontschool.co.uk",
  supplier: "Example Supplier",
  desc: "Synthetic laptop charger",
  totalPrice: 45,
  notes: "Private note must not appear",
  attachment: "https://example.com/private-attachment"
};
scriptServiceUrl = "https://script.google.com/macros/s/test/exec";
const liveChatPayload = api.createOrderChatPayload_(samuelUser, false, chatOrder);
assert.ok(liveChatPayload);
assert.strictEqual(liveChatPayload.isDevelopment, false);
assert.strictEqual(liveChatPayload.portalUrl, "https://orders.gbclm.co.uk");
assert.strictEqual(api.createOrderChatPayload_(samuelUser, true, chatOrder), null, "order edits must not alert Chat");
assert.strictEqual(api.createOrderChatPayload_(simulatedSamuelUser, false, chatOrder), null, "live simulation must not alert Chat");

scriptServiceUrl = "https://script.google.com/macros/s/test/dev";
assert.strictEqual(api.createOrderChatPayload_(simulatedSamuelUser, false, chatOrder), null, "Dev must not fall back to the live Chat destination");
testScriptProperties.DEV_ORDER_CHAT_WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/DEVTEST/messages?key=test&token=test";
const developmentChatPayload = api.createOrderChatPayload_(simulatedSamuelUser, false, chatOrder);
assert.ok(developmentChatPayload);
assert.strictEqual(developmentChatPayload.configuration.webhookUrl, testScriptProperties.DEV_ORDER_CHAT_WEBHOOK_URL);
assert.strictEqual(developmentChatPayload.isDevelopment, true);
assert.strictEqual(developmentChatPayload.portalUrl, scriptServiceUrl);
const chatMessage = api.buildOrderChatMessage_(developmentChatPayload);
assert.ok(chatMessage.startsWith("[DEV TEST] 📦 New order submitted by Samuel Bodle"));
assert.ok(chatMessage.includes("Requester: samuel.bodle@claremontschool.co.uk"));
assert.ok(chatMessage.includes("Order reference: DEV-CHAT-1"));
assert.ok(chatMessage.includes("Department: IT"));
assert.ok(chatMessage.includes("Supplier: Example Supplier"));
assert.ok(chatMessage.includes("Description: Synthetic laptop charger"));
assert.ok(chatMessage.includes("Estimated value: £45.00"));
assert.ok(chatMessage.includes("Open portal: " + scriptServiceUrl));
assert.ok(!chatMessage.includes("Private note"));
assert.ok(!chatMessage.includes("private-attachment"));

chatFetchCalls.length = 0;
chatFetchResponseCode = 200;
chatFetchShouldThrow = false;
assert.equal(api.sendOrderChatAlert_(developmentChatPayload).skipped, true);
assert.equal(chatFetchCalls.length, 0, 'Development notifications require explicit opt-in');
testScriptProperties.DEV_ALLOW_TEST_NOTIFICATIONS = 'true';
assert.equal(api.sendOrderChatAlert_(developmentChatPayload).skipped, true, 'DEV remains silent even with old opt-in');
scriptServiceUrl = 'https://script.google.com/macros/s/test/exec';
const successfulChatDelivery = api.sendOrderChatAlert_(developmentChatPayload);
assert.strictEqual(successfulChatDelivery.success, true);
assert.strictEqual(chatFetchCalls.length, 1);
assert.strictEqual(chatFetchCalls[0].url, testScriptProperties.DEV_ORDER_CHAT_WEBHOOK_URL);
assert.strictEqual(chatFetchCalls[0].options.method, "post");
assert.strictEqual(chatFetchCalls[0].options.muteHttpExceptions, true);
assert.strictEqual(JSON.parse(chatFetchCalls[0].options.payload).text, chatMessage);

chatFetchResponseCode = 503;
const failedChatDelivery = api.sendOrderChatAlert_(developmentChatPayload);
assert.strictEqual(failedChatDelivery.success, false);
assert.strictEqual(failedChatDelivery.error, "HTTP_503");
const callsBeforeInvalidConfiguration = chatFetchCalls.length;
const invalidChatDelivery = api.sendOrderChatAlert_({
  configuration: { webhookUrl: "https://example.com/secret", watchEmail: chatConfiguration.watchEmail, isValid: false },
  order: chatOrder
});
assert.strictEqual(invalidChatDelivery.success, false);
assert.strictEqual(invalidChatDelivery.error, "INVALID_CONFIGURATION");
assert.strictEqual(chatFetchCalls.length, callsBeforeInvalidConfiguration, "invalid webhook configuration must not be fetched");
chatFetchShouldThrow = true;
const thrownChatDelivery = api.sendOrderChatAlert_(developmentChatPayload);
assert.strictEqual(thrownChatDelivery.success, false);
assert.strictEqual(thrownChatDelivery.error, "REQUEST_FAILED");
chatFetchShouldThrow = false;
chatFetchResponseCode = 200;
scriptServiceUrl = "https://script.google.com/macros/s/test/exec";

const normalErrorMail = api.createPortalErrorEmailData_(
  new Error("Example failure"),
  "submitOrder",
  "orders@claremontschool.co.uk",
  { activeEmail: "user@claremontschool.co.uk", effectiveEmail: "owner@claremontschool.co.uk" },
  {}
);
assert.strictEqual(normalErrorMail.to, "orders@claremontschool.co.uk");
assert.strictEqual(Object.prototype.hasOwnProperty.call(normalErrorMail, "bcc"), false);
assert.ok(normalErrorMail.body.includes("Active: user@claremontschool.co.uk"));

const normalDeliveryPlan = api.createPortalErrorDeliveryPlan_(
  new Error("Example failure"),
  "submitOrder",
  "orders@claremontschool.co.uk",
  { activeEmail: "user@claremontschool.co.uk", effectiveEmail: "owner@claremontschool.co.uk" },
  {}
);
assert.deepStrictEqual(Array.from(normalDeliveryPlan, item => item.to), [
  "andy.clifton+error@claremontschool.co.uk"
]);

const deduplicatedErrorMail = api.createPortalErrorEmailData_(
  new Error("Example failure"),
  "submitOrder",
  "ANDY.CLIFTON+ERROR@ClaremontSchool.co.uk",
  { activeEmail: "user@claremontschool.co.uk", effectiveEmail: "owner@claremontschool.co.uk" },
  {}
);
assert.strictEqual(deduplicatedErrorMail.to, "ANDY.CLIFTON+ERROR@ClaremontSchool.co.uk");
assert.strictEqual(Object.prototype.hasOwnProperty.call(deduplicatedErrorMail, "bcc"), false);
const deduplicatedDeliveryPlan = api.createPortalErrorDeliveryPlan_(
  new Error("Example failure"),
  "submitOrder",
  "ANDY.CLIFTON+ERROR@ClaremontSchool.co.uk",
  { activeEmail: "user@claremontschool.co.uk", effectiveEmail: "owner@claremontschool.co.uk" },
  {}
);
assert.strictEqual(deduplicatedDeliveryPlan.length, 1);

const testErrorMail = api.createPortalErrorEmailData_(
  new Error("TEST ONLY"),
  "Development test",
  "orders@claremontschool.co.uk",
  { activeEmail: "admin@claremontschool.co.uk", effectiveEmail: "owner@claremontschool.co.uk" },
  { test: true }
);
assert.strictEqual(testErrorMail.subject, "[TEST] Portal Error Notification");
assert.ok(testErrorMail.body.includes("No portal fault occurred"));

assert.strictEqual(api.validateTextField_("  Example  ", "Name", { required: true, maxLength: 20 }), "Example");
assert.throws(() => api.validateTextField_("", "Name", { required: true }), /Name is required/);
assert.strictEqual(api.validateQuantityField_("3"), 3);
assert.throws(() => api.validateQuantityField_("1.5"), /whole number/);
assert.strictEqual(api.validateMoneyField_("10.25", "Cost", { positive: true }), 10.25);
assert.throws(() => api.validateMoneyField_("10.256", "Cost", { positive: true }), /two decimal places/);
assert.throws(() => api.validateMoneyField_("-1", "Cost", { nonNegative: true }), /cannot be negative/);
assert.strictEqual(api.normalizeHttpUrl_("", "Link"), "");
assert.strictEqual(api.normalizeHttpUrl_("https://example.com/a?b=1", "Link"), "https://example.com/a?b=1");
assert.strictEqual(api.normalizeHttpUrl_("example.com/path?q=one", "Link"), "https://example.com/path?q=one");
assert.strictEqual(api.normalizeHttpUrl_("http://example.com:8080/path", "Link"), "http://example.com:8080/path");
assert.strictEqual(
  api.normalizeHttpUrl_("https://www.amazon.co.uk/example/dp/B012345678?tag=school-21&ref_=abc", "Link"),
  "https://www.amazon.co.uk/example/dp/B012345678?tag=school-21&ref_=abc"
);
assert.throws(() => api.normalizeHttpUrl_("javascript:alert(1)", "Link"), /http or https/);
assert.throws(() => api.normalizeHttpUrl_("data:text/html,test", "Link"), /http or https/);
assert.throws(() => api.normalizeHttpUrl_("https://example .com", "Link"), /without spaces/);
assert.throws(() => api.normalizeHttpUrl_("https://example", "Link"), /valid web address/);
assert.throws(() => api.normalizeHttpUrl_("https://example.com:70000/path", "Link"), /valid port number/);
assert.strictEqual(api.normalizeSupplierLinkValue_("KCS catalogue reference"), "KCS catalogue reference");
assert.strictEqual(api.normalizeSupplierLinkValue_("javascript:alert(1)"), "javascript:alert(1)");
assert.strictEqual(api.normalizeSupplierLinkValue_("www.example.com/item/123"), "https://www.example.com/item/123");
assert.strictEqual(api.normalizeSupplierLinkValue_("https://example.com/item/123"), "https://example.com/item/123");
try {
  api.normalizeHttpUrl_("javascript:alert(1)", "Link");
  assert.fail("Unsafe supplier link should fail validation");
} catch (error) {
  assert.strictEqual(api.isPortalValidationError_(error), true);
}
assert.ok(!server.includes("new URL(candidate)"), "Server validation must not depend on the unavailable browser URL API");
assert.ok(portal.includes("function normalizeSupplierLinkForSubmission_"));
assert.ok(portal.includes("link: validation.values.link"));
assert.ok(server.includes("const link = normalizeSupplierLinkValue_(input.link);"));
assert.ok(portal.includes("const suffixHasLetter = suffix.toLowerCase() !== suffix.toUpperCase();"));

const getSafeLinkSource = portal.slice(
  portal.indexOf("function getSafeLink"),
  portal.indexOf("const loadingMessages", portal.indexOf("function getSafeLink"))
);
const normalizeSupplierLinkSource = portal.slice(
  portal.indexOf("function normalizeSupplierLinkForSubmission_"),
  portal.indexOf("function validateForm", portal.indexOf("function normalizeSupplierLinkForSubmission_"))
);
const portalLinkContext = { URL, escapeBulkHtml: value => String(value) };
vm.createContext(portalLinkContext);
vm.runInContext(`${getSafeLinkSource}\n${normalizeSupplierLinkSource}\nglobalThis.__portalLinkApi = { getSafeLink, normalizeSupplierLinkForSubmission_ };`, portalLinkContext);
assert.strictEqual(portalLinkContext.__portalLinkApi.getSafeLink("KCS catalogue reference", "KCS"), "KCS");
assert.strictEqual(portalLinkContext.__portalLinkApi.getSafeLink("javascript:alert(1)", "KCS"), "KCS");
assert.ok(portalLinkContext.__portalLinkApi.getSafeLink("www.example.com/item/123", "Example").includes("<a href="));
assert.strictEqual(portalLinkContext.__portalLinkApi.normalizeSupplierLinkForSubmission_("KCS catalogue reference"), "KCS catalogue reference");
assert.strictEqual(api.escapeEmailHtml_("<b>A&B</b>"), "&lt;b&gt;A&amp;B&lt;/b&gt;");
assert.ok(api.parseOptionalDateField_("2026-08-11", "Date") instanceof Date);
assert.throws(() => api.parseOptionalDateField_("11/08/2026", "Date"), /valid date/);

console.log("Reliability and security tests passed.");
