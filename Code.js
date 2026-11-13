// Static, trusted style includes are rendered into each page by Apps Script.
function includePortalStyles_(name) {
  if (!['SharedPolish','SharedDropdowns','PortalClientContext'].includes(name)) throw new Error('Unknown portal style.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * CLAREMONT PURCHASING PORTAL - SERVER V26 (Fixed Dark Mode + LockService)
 */

function doGet(e) {
  try { portalAssertExecutionAccount_(); }
  catch (error) {
    if (!error.portalRecoveryBlocked) throw error;
    return HtmlService.createHtmlOutput('<h2>Portal address updated</h2><p>Please open the <a href="' + escapeEmailHtml_(getPortalPublicUrl_()) + '">current purchasing portal</a>.</p>')
      .setTitle('Claremont Order Portal - Address updated');
  }
  const params = e && e.parameter ? e.parameter : {};
  if (params.senderTest === '1') return developmentSenderTestPage_();
  if (params.returnDev === '1') return returnDevelopmentPage_();
  if (params.amazonDev === '1') return amazonDevelopmentPage_();
  if (params.uxDev === '1') return orderPortalUsabilityDevelopmentPage_();
  if (params.invoiceEditTest === '1') return invoiceEditingDevEvidencePage_();
  if (params.adminSignoffCleanup === '1') return adminSignoffCleanupPage_();
  if (isDevelopmentRuntime_()) {
    const properties = PropertiesService.getScriptProperties();
    const developmentValues = [DEV_SPREADSHEET_PROPERTY_, DEV_ATTACHMENT_FOLDER_PROPERTY_, DEV_NOTIFICATION_EMAIL_PROPERTY_]
      .map(name => properties.getProperty(name) || "");
    if (developmentValues.every(value => !value)) bootstrapDevelopmentEnvironment_();
  }
  if (params.devSetup === "1") {
    try {
      const result = bootstrapDevelopmentEnvironment_();
      return HtmlService.createHtmlOutput(
        "<h2>Development environment ready</h2><p>Isolated test spreadsheet and attachment folder are configured.</p>" +
        "<p>Test spreadsheet: <code>" + result.spreadsheetId + "</code></p><p>You can now return to the normal /dev URL.</p>"
      ).setTitle("Development Environment Setup");
    } catch (error) {
      return HtmlService.createHtmlOutput(
        "<h2>Development setup stopped safely</h2><p>" + escapeEmailHtml_(error.message || error) + "</p>"
      ).setTitle("Development Environment Setup");
    }
  }
  if (params.page === 'changes') {
    const user = getAuthorizedUserContext_();
    requireCapability_(user, 'canAccessFinanceDashboard', 'Access denied. This page is available from the admin menu.', 'recent_changes_access_denied');
    const template = HtmlService.createTemplateFromFile('changes');
    template.appUrl = ScriptApp.getService().getUrl();
    const changeView = getRecentChangesView_();
    template.changeGroups = changeView.groups;
    template.olderEntries = changeView.olderEntries;
    return template.evaluate()
      .setTitle('Claremont Order Portal - Recent changes')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (params.page === 'configuration') {
    const template = HtmlService.createTemplateFromFile('configuration');
    template.appUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
      .setTitle('Claremont Order Portal - Configuration')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  if (params.page === 'dashboard') {
    const template = HtmlService.createTemplateFromFile('dashboard');
    template.appUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
      .setTitle('Claremont Order Portal - Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  const template = HtmlService.createTemplateFromFile('Index');
  template.appUrl = ScriptApp.getService().getUrl();
  template.initialOrderRef = String(params.order || '').slice(0,100);
  template.initialApprovalRef = String(params.approval || '').slice(0,100);
  return template.evaluate()
    .setTitle('Claremont Order Portal')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Per-execution context comes only from the calling tab, never a persisted Users field.
var portalViewContext_ = null;
function normalizePortalViewContext_(context) {
  if (context == null) return null;
  if (typeof context !== 'object' || Array.isArray(context) ||
      !['preview','test'].includes(context.mode) ||
      typeof context.email !== 'string' || !context.email.trim() || context.email.length > 254) {
    throw createAuthError_('The view context is invalid. Exit preview and reload.','invalid_view_context');
  }
  return {mode:context.mode,email:context.email.trim().toLowerCase()};
}

function portalRpc(method, args, context) {
  const handlers = {getDashboardData:typeof getDashboardData === 'function' ? getDashboardData : null,
    getOrderExportPage:typeof getOrderExportPage === 'function' ? getOrderExportPage : null,
    getOrderRecord:typeof getOrderRecord === 'function' ? getOrderRecord : null,
    getOrderSupplierSuggestions:typeof getOrderSupplierSuggestions === 'function' ? getOrderSupplierSuggestions : null,
    getOrderDetails:typeof getOrderDetails === 'function' ? getOrderDetails : null,
    getOverviewExportPage:typeof getOverviewExportPage === 'function' ? getOverviewExportPage : null,
    getOverviewDashboardData:typeof getOverviewDashboardData === 'function' ? getOverviewDashboardData : null,
    getOrderApprovalHistory:typeof getOrderApprovalHistory === 'function' ? getOrderApprovalHistory : null,
    getConfigurationChangeVersion:typeof getConfigurationChangeVersion === 'function' ? getConfigurationChangeVersion : null,
    getAdminConfigurationPreview:typeof getAdminConfigurationPreview === 'function' ? getAdminConfigurationPreview : null,
    getWeeklyFinanceSettings:typeof getWeeklyFinanceSettings === 'function' ? getWeeklyFinanceSettings : null,
    getWeeklyFinancePreview:typeof getWeeklyFinancePreview === 'function' ? getWeeklyFinancePreview : null,
    getSimulationTargets:typeof getSimulationTargets === 'function' ? getSimulationTargets : null,
    getBudgetTransferStatus:typeof getBudgetTransferStatus === 'function' ? getBudgetTransferStatus : null,
    getAdminSignoffCleanupPreview:typeof getAdminSignoffCleanupPreview === 'function' ? getAdminSignoffCleanupPreview : null,
    setSimulation:typeof setSimulation === 'function' ? setSimulation : null,
    getPortalSaveStatus:typeof getPortalSaveStatus === 'function' ? getPortalSaveStatus : null,
    submitOrder:typeof submitOrder === 'function' ? submitOrder : null,
    createBudgetTransfer:typeof createBudgetTransfer === 'function' ? createBudgetTransfer : null,
    processInvoice:typeof processInvoice === 'function' ? processInvoice : null,
    saveOrderInvoiceEvidence:typeof saveOrderInvoiceEvidence === 'function' ? saveOrderInvoiceEvidence : null,
    savePurchaseReportingSite:typeof savePurchaseReportingSite === 'function' ? savePurchaseReportingSite : null,
    updateInvoice:typeof updateInvoice === 'function' ? updateInvoice : null,
    removeInvoiceRecord:typeof removeInvoiceRecord === 'function' ? removeInvoiceRecord : null,
    voidDuplicateInvoice:typeof voidDuplicateInvoice === 'function' ? voidDuplicateInvoice : null,
    logInvoice:typeof logInvoice === 'function' ? logInvoice : null,
    bulkFinalizeOrders:typeof bulkFinalizeOrders === 'function' ? bulkFinalizeOrders : null,
    updateOrder:typeof updateOrder === 'function' ? updateOrder : null,
    userCancelOrder:typeof userCancelOrder === 'function' ? userCancelOrder : null,
    addNote:typeof addNote === 'function' ? addNote : null,
    reportMissingBudget:typeof reportMissingBudget === 'function' ? reportMissingBudget : null,
    saveOrderReturn:typeof saveOrderReturn === 'function' ? saveOrderReturn : null,
    reviewOrderApproval:typeof reviewOrderApproval === 'function' ? reviewOrderApproval : null,
    resubmitOrderApproval:typeof resubmitOrderApproval === 'function' ? resubmitOrderApproval : null,
    saveAdminBudgetConfiguration:typeof saveAdminBudgetConfiguration === 'function' ? saveAdminBudgetConfiguration : null,
    setAdminBudgetActive:typeof setAdminBudgetActive === 'function' ? setAdminBudgetActive : null,
    saveAdminUserConfiguration:typeof saveAdminUserConfiguration === 'function' ? saveAdminUserConfiguration : null,
    setAdminUserActive:typeof setAdminUserActive === 'function' ? setAdminUserActive : null,
    saveAdminSystemSettings:typeof saveAdminSystemSettings === 'function' ? saveAdminSystemSettings : null,
    saveWeeklyFinanceSettings:typeof saveWeeklyFinanceSettings === 'function' ? saveWeeklyFinanceSettings : null,
    sendWeeklyFinanceTest:typeof sendWeeklyFinanceTest === 'function' ? sendWeeklyFinanceTest : null,
    sendWeeklyFinanceNow:typeof sendWeeklyFinanceNow === 'function' ? sendWeeklyFinanceNow : null,
    clearAdminPurchaseSignoffs:typeof clearAdminPurchaseSignoffs === 'function' ? clearAdminPurchaseSignoffs : null};
  if (!Object.prototype.hasOwnProperty.call(handlers,method) || typeof handlers[method] !== 'function' || !Array.isArray(args)) throw new Error('This portal action is unavailable. Reload the page.');
  const readMethods = ["getDashboardData","getOrderExportPage","getOrderRecord","getOrderSupplierSuggestions","getOrderDetails","getOverviewExportPage","getOverviewDashboardData","getOrderApprovalHistory","getConfigurationChangeVersion","getAdminConfigurationPreview","getWeeklyFinanceSettings","getWeeklyFinancePreview","getSimulationTargets","getBudgetTransferStatus","getAdminSignoffCleanupPreview","setSimulation"];
  const previous = portalViewContext_;
  try {
    portalViewContext_ = normalizePortalViewContext_(context);
    if (portalViewContext_) {
      const user = getAuthorizedUserContext_();
      if (user.isPreview && !readMethods.includes(method)) throw new Error('View preview is read-only. Exit preview to make changes.');
    }
    return handlers[method].apply(null,args);
  } finally { portalViewContext_ = previous; }
}

// --- UTILS & CONFIG ---
// Newest first. Entries ship with the change; keep older entries for the archive.
function getRecentChanges_() {
  return [
    { date: '2026-11-13', text: 'Interrupted submissions show a clear check action, including after a reload. Confirmed original entries are cleared; changed entries are kept with confirmation before saving as a new purchase. Finance form labels and cost displays on phones are easier to use.' },
    { date: '2026-11-11', text: 'Remove an invoice record with a reason, without finding the original reference. Removed records keep their attachments and audit history in the Removed records view and are excluded from budgets and reports.' },
    { date: '2026-11-10', text: 'Account preview now shows the new request and invoice forms available to the selected user. You can inspect the forms without saving anything.' },
    { date: '2026-11-05', text: 'Requests now keep your drafts. You can edit your own pending requests, find your purchases more easily and follow clearer Notes conversations.' },
    { date: '2026-11-05', text: 'Invoice processing, corrections and attachments are clearer. Duplicate invoice references are blocked, and bulk actions show everything selected.' },
    { date: '2026-11-05', text: 'Purchase reviews and returns awaiting refund are easier to find. Refunds show their effect on the purchase total before you save.' },
    { date: '2026-11-05', text: 'Clearer budgets and reports, with small layout and readability improvements for phones, light mode and dark mode. Account preview is now read-only and stays in its own tab.' },
    { date: '2026-11-05', text: 'Notification emails are easier to read and link directly to purchases. Budget processors are notified when someone else submits a request to their budget. The weekly Finance report now includes invoice reviews, returns and refunds.' },
    { date: '2026-11-04', text: 'Authorised department buyers can select Already ordered on a new request and record the final cost, payment method and expected delivery in one save.' },
    { date: '2026-11-04', text: 'The Manage purchase window now keeps return controls across the top, with purchase details neatly arranged below.' },
    { date: '2026-11-04', text: 'Manage returns and record full or partial refunds from the original purchase. Ordering teams can confirm refunds for their departments; linked credits update budgets automatically.' },
    { date: '2026-10-21', text: 'Admins can edit pending and processed invoices from the action menu or invoice details. Corrections retain processing status and record the reason and changed values. Amount checks help catch invoice numbers entered as prices.' },
    { date: '2026-10-20', text: 'Technical error alerts now go only to the IT error inbox. Loading and refresh problems show clear next steps and a reference to quote to IT, while interrupted saves still guide you to check the result before trying again.' },
    { date: '2026-10-19', text: 'Admins can again record and complete their own orders and invoices without a second sign-off. Admins can also approve their own purchases already awaiting review. Department buyers still need independent review for their own purchases.' },
    { date: '2026-10-16', text: 'Department buyers can process requests and log purchases for their authorised budgets. Use Log Invoice / Direct Spend to record purchases already made. Own purchases need independent review, with query and correction history retained. Supporting files open individually from purchase details. Portal review does not hold or release an Amazon order.' },
    { date: '2026-10-13', text: 'Duplicating an invoice now opens Duplicate Invoice with editable details, the latest cost and payment method. Add the new invoice reference and attachment before saving; the new record remains an invoice.' },
    { date: '2026-10-12', text: 'The dashboard now retries brief spreadsheet connection failures automatically, including refreshes. Error alerts are sent only if recovery fails.' },
    { date: '2026-10-12', text: 'Order status indicators now line up consistently, with Credit note on the right. Credit notes no longer show an over-budget warning.' },
    { date: '2026-10-08', text: 'Use Exclude invoices in Additional filtering to hide logged invoices and credit notes from the order list and its export. Both filter switches now match in size and sit side by side on desktop.' },
    { date: '2026-10-08', text: 'Order update and bulk confirmation emails now show the name of the person who processed each order.' },
    { date: '2026-10-05', text: 'Improved attachment storage and recovery arrangements so the IT team can restore the portal if its operating account becomes unavailable.' },
    { date: '2026-10-05', text: 'Log credit notes and refunds using a negative cost in Log Invoice / Direct Spend. Credits are clearly labelled and reduce spend; Finance can process them individually or in bulk.' },
    { date: '2026-10-02', text: 'General presentation improvements.' },
    { date: '2026-10-02', text: 'General system improvements and reliability updates.' },
    { date: '2026-10-02', text: 'Log Invoice / Direct Spend now requires a payment method: Credit card or Invoice / on account. The choice appears in details, payment filters, notification emails and exports. Older invoices show Not recorded.' },
    { date: '2026-10-01', text: 'Order Details now opens immediately with a loading message while the details arrive. You can close it while loading or retry if loading fails.' },
    { date: '2026-09-29', text: 'Full department, requester and location names now appear in a tooltip that follows the pointer when viewing the order list.' },
    { date: '2026-09-29', text: 'Order actions are grouped in a three-dot menu, with messages and order details still directly visible. The table fills the available space, keeps long department names to one line, and lines up status labels consistently, with over-budget warnings before invoice icons.' },
    { date: '2026-09-28', text: 'Finance Update now has a wider, more compact layout. Admin users can cancel pending orders using a smaller button beside Update Status, with a reason and a separate confirmation.' },
    { date: '2026-09-28', text: 'Admin users can now cancel a pending order from Order Details, with a reason and confirmation before it is cancelled. Missing reasons show clear guidance beside the reason box. The existing bin button is unchanged.' },
    { date: '2026-09-28', text: 'Pending orders in dark mode now use a softer charcoal highlight and a fine amber edge, making them easier to spot without the brown tint.' },
    { date: '2026-09-28', text: 'Tightened order-table spacing on larger screens to avoid unnecessary sideways scrolling, while keeping text, buttons and column order unchanged.' },
    { date: '2026-09-28', text: 'Clearer active filters, labelled order actions, explicit over-budget wording and aligned prices. Request and invoice forms now have consistent labels, clearer read-only fields and guidance beside fields that need correcting.' },
    { date: '2026-09-28', text: 'Subtle order-list refinements: softer department labels in both themes, tidier sorting headings and clearer budget figures, with familiar controls and column order preserved.' },
    { date: '2026-09-25', text: 'Newly processed orders require a payment method. Order Details and exports show credit card or invoice / on account, with older unassigned orders kept as not recorded. Pending-only, payment and date filters are grouped in a translucent Additional filtering panel; exports include date ordered and processor.' },
    { date: '2026-09-25', text: 'Order Details now shows who processed an order, with a clear label when that information was not recorded.' },
    { date: '2026-09-22', text: 'Finance and Admin users can now add missing attachments retrospectively from Manage without replacing any files already saved.' },
    { date: '2026-09-18', text: 'Improved save reliability, transfer recovery, duplicate invoice checks and protection of unfinished forms. Admin saves now prevent conflicting changes; reports recover from interrupted preparation, and order details load when needed. Orders and invoices retain recovery references after reloads, and interrupted saves no longer leave the screen blocked.' },
    { date: '2026-09-16', text: 'Added a weekly finance PDF report with editable CC recipients, an IT-only test and optional Monday morning delivery.' },
    { date: '2026-09-15', text: 'Pending orders and orders needing sign-off now have a soft amber row highlight in light and dark mode, while retaining over-budget warning indicators.' },
    { date: '2026-09-15', text: 'Fixed blank or stale budget bars for departments with a zero budget allocation.' },
    { date: '2026-09-15', text: 'Improved order status display with compact one-line indicators, clickable sign-off status and clearer tooltips.' },
    { date: '2026-09-15', text: 'Non-Finance users now start on their first assigned department instead of All Departments.' },
    { date: '2026-09-15', text: 'Added a Recent changes page to the admin menu.' },
    { date: '2026-09-15', text: 'Added “Requested for” when ordering for a colleague in the same department.' },
    { date: '2026-09-14', text: 'Fixed duplicate order references that could cause updates to affect the wrong order.' },
    { date: '2026-09-09', text: 'Separated order-processing and invoice permissions.' },
    { date: '2026-09-09', text: 'Widened the New Request and Log Invoice forms for easier entry.' },
    { date: '2026-09-07', text: 'Improved readability, controls and dark-mode contrast.' },
    { date: '2026-09-07', text: 'Added consistent loading screens across the portal.' },
    { date: '2026-09-07', text: 'Improved loading, searching and refreshing performance.' },
    { date: '2026-09-07', text: 'Improved handling of temporary spreadsheet errors when submitting orders.' },
    { date: '2026-09-02', text: 'Added targeted Google Chat alerts for selected new order requests.' },
    { date: '2026-09-01', text: 'Added optional order-processing and invoice-logging permissions, with independent order sign-off.' }
  ];
}

function getRecentChangesView_() {
  const entries = getRecentChanges_();
  const visibleEntries = entries.slice(0, 10);
  const groups = [];
  visibleEntries.forEach(function(entry) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== entry.date) {
      group = { date: entry.date, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  });
  return { groups: groups, olderEntries: entries.slice(10) };
}

const PERF_TARGETS_ = {
  coldP95Ms: 2500,
  warmP95Ms: 1200
};
const PORTAL_ERROR_ALERT_EMAIL_ = "andy.clifton+error@claremontschool.co.uk";
const DEV_SPREADSHEET_PROPERTY_ = "DEV_SPREADSHEET_ID";
const DEV_ATTACHMENT_FOLDER_PROPERTY_ = "DEV_ATTACHMENT_FOLDER_ID";
const DEV_NOTIFICATION_EMAIL_PROPERTY_ = "DEV_NOTIFICATION_EMAIL";
const ORDER_CHAT_WEBHOOK_PROPERTY_ = "ORDER_CHAT_WEBHOOK_URL";
const ORDER_CHAT_WATCH_EMAIL_PROPERTY_ = "ORDER_CHAT_WATCH_EMAIL";
const LIVE_PORTAL_URL_ = "https://orders.gbclm.co.uk";

function getPortalPublicUrl_() {
  const value = PropertiesService.getScriptProperties().getProperty('PORTAL_PUBLIC_URL') || LIVE_PORTAL_URL_;
  if (!/^https:\/\/(?:orders\.gbclm\.co\.uk\/?|script\.google\.com\/(?:a\/macros\/claremontschool\.co\.uk\/s\/|macros\/s\/)[A-Za-z0-9_-]+\/exec)$/.test(value)) {
    throw new Error('The portal public address is invalid. Please contact IT.');
  }
  return value;
}

function getPurchaseDeepLink_(reference,review) {
  // The serving Apps Script address retains query parameters even when the public short URL redirects.
  const base=ScriptApp.getService().getUrl() || getPortalPublicUrl_();
  return base+(base.includes('?')?'&':'?')+(review?'approval':'order')+'='+encodeURIComponent(String(reference||''));
}

function getPortalErrorAlertEmail_() {
  const value = (PropertiesService.getScriptProperties().getProperty('PORTAL_ERROR_ALERT_EMAIL') || PORTAL_ERROR_ALERT_EMAIL_).trim();
  if (!isValidConfigurationEmail_(value)) throw new Error('The monitored error address is invalid.');
  return value;
}

function portalAssertExecutionAccount_() {
  if (isDevelopmentRuntime_()) return;
  const properties = PropertiesService.getScriptProperties();
  const expected = (properties.getProperty('PORTAL_EXECUTION_ACCOUNT') || '').trim().toLowerCase();
  // Existing installations remain compatible until explicitly configured. Once
  // recovery is prepared, losing this setting must fail closed.
  if (!expected && !properties.getProperty('PORTAL_RECOVERY_STATE')) return;
  const effective = (Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!expected || effective !== expected) {
    const error = createAuthError_('This deployment is no longer the active portal. Please use the current portal address.', 'recovery_execution_account_mismatch');
    error.portalRecoveryBlocked = true;
    throw error;
  }
}

function isDevelopmentRuntime_() {
  let url;
  try {
    url = (ScriptApp.getService().getUrl() || "").toString().toLowerCase();
  } catch (e) {
    throw new Error('The portal environment could not be verified. No data was accessed. Please contact IT.');
  }
  if (/\/dev(?:[?#].*)?$/.test(url)) return true;
  if (/\/exec(?:[?#].*)?$/.test(url)) return false;
  throw new Error('The portal environment is unknown. No data was accessed. Please contact IT.');
}

function getRequiredDevelopmentProperty_(name) {
  const value = (PropertiesService.getScriptProperties().getProperty(name) || "").toString().trim();
  if (!value) {
    throw new Error("Development environment is not configured. Missing " + name + ". Production data was not accessed.");
  }
  return value;
}

function getPortalSpreadsheet_() {
  portalAssertExecutionAccount_();
  if (portalTransaction_) return portalTransaction_.workbook;
  if (isDevelopmentRuntime_()) {
    const devId = getRequiredDevelopmentProperty_(DEV_SPREADSHEET_PROPERTY_);
    const live = SpreadsheetApp.getActiveSpreadsheet();
    if (!live || live.getId() === devId) throw new Error('Development data must be separate from the live spreadsheet. No records were accessed.');
    return SpreadsheetApp.openById(devId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getPortalAttachmentFolder_() {
  const id = isDevelopmentRuntime_()
    ? getRequiredDevelopmentProperty_(DEV_ATTACHMENT_FOLDER_PROPERTY_)
    : PropertiesService.getScriptProperties().getProperty('PORTAL_ATTACHMENT_FOLDER_ID');
  if (!id) throw new Error('The attachment folder is not configured. No replacement folder was created.');
  if (isDevelopmentRuntime_() && id === PropertiesService.getScriptProperties().getProperty("PORTAL_ATTACHMENT_FOLDER_ID")) throw new Error("Development attachments must be isolated.");
  const folder = Drive.Files.get(id, { supportsAllDrives: true, fields: 'id,mimeType,trashed,driveId,capabilities(canAddChildren)' });
  if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities || !folder.capabilities.canAddChildren) {
    throw new Error('The configured attachment folder is not writable.');
  }
  return folder;
}

function developmentChatAndErrorAlertsSuppressed_() {
  if (!isDevelopmentRuntime_()) return false;
  return true;
}

function getDevelopmentNotificationEmail_() {
  return isDevelopmentRuntime_()
    ? getRequiredDevelopmentProperty_(DEV_NOTIFICATION_EMAIL_PROPERTY_)
    : "";
}

function isValidOrderChatWebhookUrl_(value) {
  const candidate = (value || "").toString().trim();
  if (!/^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/?#\s]+\/messages\?/i.test(candidate)) return false;
  return /(?:\?|&)key=[^&#\s]+/i.test(candidate) && /(?:\?|&)token=[^&#\s]+/i.test(candidate);
}

function getOrderChatConfiguration_() {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = (properties.getProperty(portalStateKey_(ORDER_CHAT_WEBHOOK_PROPERTY_)) || "").toString().trim();
  const watchEmail = normalizeConfigurationKey_(properties.getProperty(ORDER_CHAT_WATCH_EMAIL_PROPERTY_));
  const watchEmailValid = isValidConfigurationEmail_(watchEmail) && watchEmail.endsWith("@claremontschool.co.uk");
  return {
    webhookUrl: webhookUrl,
    watchEmail: watchEmail,
    isValid: watchEmailValid && isValidOrderChatWebhookUrl_(webhookUrl)
  };
}

function getOrderChatActorEmail_(user, isDevelopment) {
  const source = isDevelopment && user && user.isSimulated
    ? user.email
    : (user && (user.realEmail || user.email));
  return normalizeConfigurationKey_(source);
}

function shouldSendOrderChatAlert_(user, isEdit, watchEmail, isDevelopment) {
  const normalizedWatchEmail = normalizeConfigurationKey_(watchEmail);
  if (isEdit || !normalizedWatchEmail) return false;
  return getOrderChatActorEmail_(user, isDevelopment) === normalizedWatchEmail;
}

function getOrderChatDisplayName_(email) {
  const localPart = normalizeConfigurationKey_(email).split("@")[0];
  if (!localPart) return "Watched requester";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Watched requester";
}

function sanitizeOrderChatValue_(value, maxLength) {
  const limit = Number(maxLength) > 0 ? Number(maxLength) : 500;
  return (value === null || value === undefined ? "" : String(value))
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function formatOrderChatMoney_(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? "£" + amount.toFixed(2) : "Not available";
}

function buildOrderChatMessage_(payload) {
  const order = payload && payload.order ? payload.order : {};
  const requesterEmail = normalizeConfigurationKey_(payload && payload.requesterEmail || order.requester);
  const headingPrefix = payload && payload.isDevelopment ? "[DEV TEST] " : "";
  return [
    headingPrefix + "📦 New order submitted by " + getOrderChatDisplayName_(order.submittedBy || requesterEmail),
    "Requester: " + sanitizeOrderChatValue_(requesterEmail, 160),
    "Order reference: " + sanitizeOrderChatValue_(order.id, 100),
    "Department: " + sanitizeOrderChatValue_(order.dept, 200),
    "Supplier: " + sanitizeOrderChatValue_(order.supplier, 200),
    "Description: " + sanitizeOrderChatValue_(order.desc, 500),
    "Estimated value: " + formatOrderChatMoney_(order.totalPrice),
    "Open portal: " + sanitizeOrderChatValue_(payload && payload.portalUrl, 500)
  ].join("\n");
}

function createOrderChatPayload_(user, isEdit, order) {
  const isDevelopment = isDevelopmentRuntime_();
  const configuration = getOrderChatConfiguration_();
  // Development never falls back to the live Chat destination.
  if (isDevelopment && !configuration.webhookUrl) return null;
  if (!shouldSendOrderChatAlert_(user, isEdit, configuration.watchEmail, isDevelopment)) return null;
  return {
    configuration: configuration,
    isDevelopment: isDevelopment,
    requesterEmail: order && order.requester,
    portalUrl: isDevelopment ? (ScriptApp.getService().getUrl() || "") : getPortalPublicUrl_(),
    order: order
  };
}

function sendOrderChatAlert_(payload) {
  if (developmentChatAndErrorAlertsSuppressed_()) return { success: true, skipped: true };
  if (!payload) return { success: true, skipped: true };
  if (!payload.configuration || !payload.configuration.isValid) {
    console.error("Order Chat notification configuration is missing or invalid.");
    return { success: false, error: "INVALID_CONFIGURATION" };
  }
  try {
    portalAssertExecutionAccount_();
    const response = UrlFetchApp.fetch(payload.configuration.webhookUrl, {
      method: "post",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      payload: JSON.stringify({ text: buildOrderChatMessage_(payload) }),
      muteHttpExceptions: true
    });
    const responseCode = Number(response.getResponseCode());
    if (responseCode < 200 || responseCode >= 300) {
      console.error("Order Chat notification failed with HTTP status " + responseCode + ".");
      return { success: false, error: "HTTP_" + responseCode };
    }
    return { success: true };
  } catch (e) {
    // Do not log the exception: fetch errors can include the secret webhook URL.
    console.error("Order Chat notification request failed.");
    return { success: false, error: "REQUEST_FAILED" };
  }
}

function trashOrphanedDevelopmentResources_() {
  const spreadsheetName = "Order Portal - Isolated Development Test Data";
  const folderName = "Order Portal - Isolated Development Attachments";
  const files = DriveApp.getFilesByName(spreadsheetName);
  while (files.hasNext()) {
    try { files.next().setTrashed(true); } catch (e) {}
  }
  const folders = DriveApp.getFoldersByName(folderName);
  while (folders.hasNext()) {
    try { folders.next().setTrashed(true); } catch (e) {}
  }
}

function bootstrapDevelopmentEnvironment_() {
  if (!isDevelopmentRuntime_()) throw new Error("This setup is available only from the Apps Script /dev URL.");
  const activeEmail = normalizeConfigurationKey_(Session.getActiveUser().getEmail());
  const effectiveEmail = normalizeConfigurationKey_(Session.getEffectiveUser().getEmail());
  const setupEmail = activeEmail.endsWith("@claremontschool.co.uk") ? activeEmail : effectiveEmail;
  if (!setupEmail || !setupEmail.endsWith("@claremontschool.co.uk")) {
    throw new Error("Sign in with an authorised school script-editor account.");
  }
  const properties = PropertiesService.getScriptProperties();
  const existing = [DEV_SPREADSHEET_PROPERTY_, DEV_ATTACHMENT_FOLDER_PROPERTY_, DEV_NOTIFICATION_EMAIL_PROPERTY_]
    .map(name => properties.getProperty(name) || "");
  if (existing.every(Boolean)) {
    return { spreadsheetId: existing[0], attachmentFolderId: existing[1], notificationEmail: existing[2], created: false };
  }
  if (existing.some(Boolean)) {
    throw new Error("Development properties are only partly configured. No resources were changed; review the three DEV_ script properties before retrying.");
  }

  const orderHeaders = [
    "ID", "Department", "Date of request", "Requester", "Supplier", "Website link", "Description", "Product code",
    "Quantity", "Unit Price", "Total Price (Est)", "Delivery location", "Date required by", "Date ordered",
    "Expected delivery date", "Updated total price", "Budget left to spend", "Comments", "Invoice Number", "Attachment URL",
    ORDER_RECORD_TYPE_HEADER_, ORDER_GL_CODE_HEADER_, ORDER_PROCESSED_BY_HEADER_, ORDER_APPROVAL_STATUS_HEADER_,
    ORDER_APPROVAL_REVISION_HEADER_, ORDER_APPROVED_BY_HEADER_, ORDER_APPROVED_AT_HEADER_
  ];
  const today = new Date();
  const testOrderRows = [
    ["DEV-1001", "Science", today, "processor.one@claremontschool.co.uk", "Test Supplier", "https://example.com/item", "Synthetic science supplies", "TEST-1", 2, 12.5, 25, "Senior", today, "", "", "", "", "", "", "", "Order", "SCI-DEV", "", APPROVAL_NOT_REQUIRED_, 0, "", ""],
    ["DEV-1002", "English", today, "ordinary.staff@claremontschool.co.uk", "Test Books", "", "Synthetic books", "TEST-2", 3, 8, 24, "Prep", today, "", "", "", "", "", "", "", "Order", "ENG-DEV", "", APPROVAL_NOT_REQUIRED_, 0, "", ""],
    ["DEV-1003", "Science", today, "processor.one@claremontschool.co.uk", "Test Supplier", "", "Synthetic completed self-purchase", "TEST-3", 1, 15, 15, "Senior", today, today, today, 15, "", "", "", "", "Order", "SCI-DEV", "processor.one@claremontschool.co.uk", APPROVAL_AWAITING_, 1, "", ""]
  ];
  testOrderRows.forEach((row, index) => {
    if (row.length !== orderHeaders.length) {
      throw new Error(`Development fixture row ${index + 1} has ${row.length} columns; expected ${orderHeaders.length}. No development resources were created.`);
    }
  });

  trashOrphanedDevelopmentResources_();
  const ss = SpreadsheetApp.create("Order Portal - Isolated Development Test Data");
  const orders = ss.getSheets()[0];
  orders.setName("Orders");
  const budgets = ss.insertSheet("Budgets");
  const users = ss.insertSheet("Users");
  const config = ss.insertSheet("Config");
  const configAudit = ss.insertSheet("Configuration Audit");
  const approvalAudit = ss.insertSheet(ORDER_APPROVAL_AUDIT_SHEET_);
  const changeAudit = ss.insertSheet("Order Change Audit");
  orders.getRange(1, 1, 1, orderHeaders.length).setValues([orderHeaders]);
  orders.getRange(2, 1, testOrderRows.length, orderHeaders.length).setValues(testOrderRows);
  orders.setFrozenRows(1);
  try { orders.hideColumns(21); orders.hideColumns(23, 5); } catch (e) {}

  budgets.getRange(1, 1, 1, 6).setValues([["Department", "TotalAllocation", "Spent", "Remaining", "GL Code", "Active"]]);
  budgets.getRange(2, 1, 3, 6).setValues([
    ["Science", 10000, 40, 9960, "SCI-DEV", true],
    ["English", 5000, 24, 4976, "ENG-DEV", true],
    ["Wipro", 0, 0, 0, "", true]
  ]);

  users.getRange(1, 1, 1, 8).setValues([["Email", "Department", "Role", "Default Site", "Simulation Email", "Active", "Can Process Orders", "Can Log Invoices"]]);
  users.getRange(2, 1, 1, 8).setValues([[setupEmail, "Science", ROLE_ADMIN_, "Senior", "", true, false, false]]);
  users.getRange(3, 1, 5, 8).setValues([
    ["processor.one@claremontschool.co.uk", "Science", ROLE_STAFF_, "Senior", "", true, true, false],
    ["processor.two@claremontschool.co.uk", "English", ROLE_STAFF_, "Prep", "", true, true, false],
    ["invoice.logger@claremontschool.co.uk", "Science", ROLE_STAFF_, "Senior", "", true, false, true],
    ["ordinary.staff@claremontschool.co.uk", "English", ROLE_STAFF_, "Prep", "", true, false, false],
    ["wipro.test@claremontschool.co.uk", "Wipro", ROLE_WIPRO_, "Senior", "", true, false, false]
  ]);
  config.getRange("A1:B3").setValues([["Setting", "Value"], ["Finance Email", setupEmail], ["Sender Alias", ""]]);
  configAudit.getRange(1, 1, 1, 5).setValues([["Timestamp", "User", "Action", "Target", "Details"]]);
  approvalAudit.getRange(1, 1, 1, 9).setValues([["Timestamp", "Order ID", "Revision", "Action", "Actor Email", "Requester Email", "Processor Email", "Private Note", "Order Snapshot"]]);
  changeAudit.getRange(1, 1, 1, 6).setValues([["Timestamp", "Order ID", "Actor Email", "Field", "Old Value", "New Value"]]);
  approvalAudit.appendRow([today, "DEV-1003", 1, "SIGNOFF_REQUIRED", "processor.one@claremontschool.co.uk", "processor.one@claremontschool.co.uk", "processor.one@claremontschool.co.uk", "", "Synthetic test order"]);
  try { approvalAudit.hideSheet(); changeAudit.hideSheet(); } catch (e) {}

  const folder = DriveApp.createFolder("Order Portal - Isolated Development Attachments");
  properties.setProperties({
    [DEV_SPREADSHEET_PROPERTY_]: ss.getId(),
    [DEV_ATTACHMENT_FOLDER_PROPERTY_]: folder.getId(),
    [DEV_NOTIFICATION_EMAIL_PROPERTY_]: setupEmail
  }, false);
  return { spreadsheetId: ss.getId(), attachmentFolderId: folder.getId(), notificationEmail: setupEmail, created: true };
}

function nowMs_() {
  return new Date().getTime();
}

function logPerfMetric_(name, startMs, extra) {
  const payload = extra || {};
  payload.ms = nowMs_() - startMs;
  console.log("[PERF] " + name + " " + JSON.stringify(payload));
}

function sanitizeDiagnosticValue_(value, maxLength) {
  const limit = Number(maxLength) > 0 ? Number(maxLength) : 80;
  return (value === null || value === undefined ? "" : String(value))
    .replace(/[^A-Za-z0-9_.:@\/-]/g, "-")
    .slice(0, limit);
}

function normalizePortalRequestContext_(rawContext, defaultSource) {
  const raw = rawContext && typeof rawContext === "object" ? rawContext : {};
  const attemptNumber = Number(raw.attempt);
  return {
    requestId: sanitizeDiagnosticValue_(raw.requestId, 64),
    source: sanitizeDiagnosticValue_(raw.source || defaultSource || "unknown", 32),
    attempt: Number.isFinite(attemptNumber) && attemptNumber > 0 ? Math.floor(attemptNumber) : 1
  };
}

function logPortalRequest_(eventName, context, extra) {
  const payload = Object.assign({}, context || {}, extra || {});
  console.log("[PORTAL_REQUEST] " + eventName + " " + JSON.stringify(payload));
}

// Financial changes are planned in memory, then committed in one atomic Sheets
// request. Audit entries and the durable receipt are part of the same commit.
let portalTransaction_ = null;
const PORTAL_ATOMIC_ACTIONS_ = ['submitOrder', 'logInvoice', 'createBudgetTransfer',
  'saveOrderReturn', 'updateInvoice', 'removeInvoiceRecord', 'voidDuplicateInvoice', 'processInvoice', 'saveOrderInvoiceEvidence', 'savePurchaseReportingSite', 'updateOrder', 'bulkFinalizeOrders', 'userCancelOrder', 'addNote',
  'reviewOrderApproval', 'resubmitOrderApproval', 'saveAdminBudgetConfiguration',
  'setAdminBudgetActive', 'saveAdminUserConfiguration', 'setAdminUserActive',
  'saveAdminSystemSettings', 'saveWeeklyFinanceSettings', 'seedOrderPortalUsabilityDevelopmentFixtures'];

function orderVersion_(row) {
  const canonical = Array.isArray(row) ? row.map((v, i) => i === 16 ? null : (v == null ? '' : v)) : row;
  if (Array.isArray(canonical)) while (canonical.length && canonical[canonical.length - 1] === '') canonical.pop();
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, JSON.stringify(canonical), Utilities.Charset.UTF_8));
}

function requireOrderVersion_(row, expectedVersion) {
  if (!expectedVersion || expectedVersion !== orderVersion_(row)) {
    throw createPortalValidationError_('This order has changed, or this page is out of date. Refresh the Order List and review it again before saving.', 'ORDER_CHANGED');
  }
}

function portalReceiptSheet_(ss) {
  let sheet = ss.getSheetByName('Portal Save Receipts');
  if (!sheet) {
    sheet = ss.insertSheet('Portal Save Receipts');
    sheet.getRange(1, 1, 1, 5).setValues([['Request', 'State', 'Fingerprint', 'Updated', 'Reference']]);
    try { sheet.hideSheet(); } catch (_) {}
  }
  return sheet;
}

function findPortalReceipt_(sheet, key) {
  if (!sheet || sheet.getLastRow() < 2) return null;
  const cell = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(key)
    .matchEntireCell(true).matchCase(true).useRegularExpression(false).findNext();
  return cell ? { row: cell.getRow(), values: sheet.getRange(cell.getRow(), 1, 1, 5).getValues()[0] } : null;
}

function getBudgetTransferStatus(clientRequestId) {
  const user = getAuthorizedUserContext_();
  requireCapability_(user, 'canUseBudgetTransfer', 'Access denied.', 'budget_transfer_not_allowed');
  const id = validateTextField_(clientRequestId, 'Request identifier', { required: true, maxLength: 120 });
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid request identifier.');
  const found = findPortalReceipt_(getPortalSpreadsheet_().getSheetByName('Portal Save Receipts'),
    'transfer|' + (user.realEmail || user.email) + '|' + id);
  return { state: found ? found.values[1] : 'NOT_FOUND' };
}

function portalCreateIdentity_(kind, requestId) {
  if (!['order', 'invoice'].includes(kind)) throw new Error('Invalid request type.');
  const user = getAuthorizedUserContext_();
  requireCapability_(user, kind === 'order' ? 'canCreateRequests' : 'canLogInvoice', 'Access denied. You do not have permission to submit or recover this request.');
  const id = validateTextField_(requestId, 'Request identifier', {required:true,maxLength:120});
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid request identifier.');
  return {user, key:kind + '|' + (user.realEmail || user.email) + '|' + id};
}

// Cancelling an unstarted attempt leaves a durable tombstone. An older request
// still uploading files must see that tombstone before it can commit an order.
function getPortalSaveStatus(kind, requestId, cancelUnstarted) {
  return withWriteLock_('getPortalSaveStatus', () => {
    const identity = portalCreateIdentity_(kind, requestId);
    const ss = getPortalSpreadsheet_();
    let sheet = ss.getSheetByName('Portal Save Receipts');
    const found = findPortalReceipt_(sheet, identity.key);
    if (cancelUnstarted === true && (!found || found.values[1] === 'FAILED')) {
      sheet = sheet || portalReceiptSheet_(ss);
      sheet.getRange(found ? found.row : sheet.getLastRow()+1,1,1,5)
        .setValues([[identity.key,'CANCELLED','',new Date(),'']]);
      SpreadsheetApp.flush();
      return {state:'CANCELLED'};
    }
    return {state:found ? found.values[1] : 'NOT_FOUND', reference:found ? String(found.values[4] || '') : ''};
  });
}

function portalRequestFingerprint_(input) {
  const copy = Object.assign({},input);
  delete copy.clientRequestId;
  delete copy.expectedConfigurationRevision;
  return orderVersion_(copy);
}

function portalCreatePreflight_(kind, input) {
  const identity = portalCreateIdentity_(kind,input && input.clientRequestId);
  const found = findPortalReceipt_(getPortalSpreadsheet_().getSheetByName('Portal Save Receipts'),identity.key);
  if (!found || found.values[1] === 'FAILED') return null;
  if (found.values[1] === 'CANCELLED') throw createPortalValidationError_('This earlier attempt was cancelled safely. Start a new request.');
  if (found.values[1] !== 'DONE') throw new Error('SAVE_STATUS_UNKNOWN: Check the original saved result before submitting another request.');
  if (found.values[2] !== portalRequestFingerprint_(input)) throw createPortalValidationError_('This request was already saved. Start a new request for different information.');
  return Object.assign(createWriteSuccess_('Already saved. No duplicate was created.'), {replayed:true,reference:String(found.values[4] || '')});
}

function beginPortalRequest_(kind, input, user) {
  const requestId = validateTextField_(input && input.clientRequestId, 'Request identifier', { required: true, maxLength: 120 });
  if (!/^[\w-]+$/.test(requestId)) throw createPortalValidationError_('Reload the page before submitting this request.');
  const tx = portalTransaction_;
  if (!tx) throw new Error('A save transaction is required.');
  const key = kind + '|' + (user.realEmail || user.email) + '|' + requestId;
  const fingerprint = portalRequestFingerprint_(input);
  const sheet = portalReceiptSheet_(tx.raw);
  const found = findPortalReceipt_(sheet, key);
  if (found) {
    const record = found.values;
    if (record[1] === 'CANCELLED') throw createPortalValidationError_('This earlier attempt was cancelled safely. Start a new request.');
    if (record[1] === 'DONE') {
      if (record[2] !== fingerprint) throw createPortalValidationError_('This request was already saved. Start a new request for different information.');
      return Object.assign(createWriteSuccess_('Already saved. No duplicate was created.'), { replayed: true, reference: String(record[4] || '') });
    }
    if (record[1] !== 'FAILED') throw new Error('SAVE_STATUS_UNKNOWN: This request may already have been saved. Check its status; do not submit it as a new request.');
  }
  const row = found ? found.row : sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 5).setValues([[key, 'PENDING', fingerprint, new Date(), '']]);
  SpreadsheetApp.flush();
  tx.receipt = { sheet, row, key, fingerprint };
  return null;
}

function portalCellData_(value, timeZone) {
  if (value === null || value === undefined || value === '') return {};
  if (value instanceof Date) {
    const local = Utilities.formatDate(value, timeZone, "yyyy-MM-dd'T'HH:mm:ss");
    return { userEnteredValue: { numberValue: Date.parse(local + 'Z') / 86400000 + 25569 } };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot save a non-finite amount.');
    return { userEnteredValue: { numberValue: value } };
  }
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  // Explicit stringValue prevents user input being interpreted as a formula.
  return { userEnteredValue: { stringValue: String(value) } };
}

function createPortalTransaction_(raw) {
  const tx = { raw, sheets: new Map(), patches: [], receipt: null, committing: false, committed: false, dataChanged: false, configurationChanged: false };
  const wrapSheet = sheet => {
    if (!sheet) return sheet;
    if (tx.sheets.has(sheet.getName())) return tx.sheets.get(sheet.getName());
    let lastRow = sheet.getLastRow();
    const range = (r, c, n, m) => {
      const native = () => sheet.getRange(r, c, n || 1, m || 1);
      const row = typeof r === 'number' ? r : native().getRow();
      const column = typeof c === 'number' ? c : native().getColumn();
      const height = n || 1, width = m || 1;
      return new Proxy({}, { get(target, property) {
        if (property === 'setFormula') return value => { tx.patches.push({ sheet, row, column, values: [[value]], formula: true }); lastRow = Math.max(lastRow, row); return range(row, column); };
        if (property === 'clearContent') return () => range(row, column, height, width).setValues(Array.from({length: height}, () => new Array(width).fill('')));
        if (property === 'setValue') return value => { tx.patches.push({ sheet, row, column, values: [[value]] }); lastRow = Math.max(lastRow, row); return range(row, column); };
        if (property === 'setValues') return values => {
          if (values.length !== height || values.some(v => v.length !== width)) throw new Error('Invalid save range.');
          tx.patches.push({ sheet, row, column, values }); lastRow = Math.max(lastRow, row + height - 1); return range(row, column, height, width);
        };
        if (property === 'getValues' || property === 'getValue') return () => {
          const values = Array.from({ length: height }, () => new Array(width).fill(''));
          const availableRows = Math.min(height, sheet.getMaxRows() - row + 1);
          const availableCols = Math.min(width, sheet.getMaxColumns() - column + 1);
          if (availableRows > 0 && availableCols > 0) sheet.getRange(row, column, availableRows, availableCols).getValues()
            .forEach((cells, i) => cells.forEach((value, j) => { values[i][j] = value; }));
          tx.patches.filter(p => p.sheet === sheet).forEach(p => p.values.forEach((cells, i) => cells.forEach((value, j) => {
            const y = p.row + i - row, x = p.column + j - column;
            if (y >= 0 && y < height && x >= 0 && x < width) values[y][x] = value;
          })));
          return property === 'getValue' ? values[0][0] : values;
        };
        const actual = native(), value = actual[property];
        return typeof value === 'function' ? value.bind(actual) : value;
      }});
    };
    const wrapped = new Proxy(sheet, { get(target, property) {
      if (property === 'getRange') return range;
      if (property === 'getLastRow') return () => lastRow;
      if (property === 'getLastColumn') return () => Math.max(sheet.getLastColumn(), ...tx.patches.filter(p => p.sheet === sheet).map(p => p.column + p.values[0].length - 1));
      if (property === 'getDataRange') return () => range(1, 1, Math.max(lastRow, 1), Math.max(sheet.getLastColumn(), 1));
      if (property === 'appendRow') return values => { range(lastRow + 1, 1, 1, values.length).setValues([values]); return wrapped; };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }});
    tx.sheets.set(sheet.getName(), wrapped);
    return wrapped;
  };
  tx.workbook = new Proxy(raw, { get(target, property) {
    if (property === 'getSheetByName') return name => wrapSheet(target.getSheetByName(name));
    if (property === 'insertSheet') return name => wrapSheet(target.insertSheet(name));
    const value = target[property];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  return tx;
}

function commitPortalTransaction_(tx) {
  if (!tx.patches.length) return;
  if (!tx.receipt) {
    const sheet = portalReceiptSheet_(tx.raw), row = sheet.getLastRow() + 1;
    const key = Utilities.getUuid();
    sheet.getRange(row, 1, 1, 5).setValues([[key, 'PENDING', '', new Date(), '']]);
    SpreadsheetApp.flush();
    tx.receipt = { sheet, row, key, fingerprint: '' };
  }
  tx.patches.push({ sheet: tx.receipt.sheet, row: tx.receipt.row, column: 2, values: [['DONE']] });
  const requests = [], sizes = new Map();
  const zone = tx.raw.getSpreadsheetTimeZone();
  tx.patches.forEach(p => {
    const id = p.sheet.getSheetId(), rows = p.row - 1 + p.values.length, cols = p.column - 1 + p.values[0].length;
    const size = sizes.get(id) || { sheet: p.sheet, rows: p.sheet.getMaxRows(), cols: p.sheet.getMaxColumns() };
    if (rows > size.rows) { requests.push({ appendDimension: { sheetId: id, dimension: 'ROWS', length: rows - size.rows } }); size.rows = rows; }
    if (cols > size.cols) { requests.push({ appendDimension: { sheetId: id, dimension: 'COLUMNS', length: cols - size.cols } }); size.cols = cols; }
    sizes.set(id, size);
    requests.push({ updateCells: { start: { sheetId: id, rowIndex: p.row - 1, columnIndex: p.column - 1 },
      rows: p.values.map(values => ({ values: values.map(v => p.formula ? { userEnteredValue: { formulaValue: v } } : portalCellData_(v, zone)) })), fields: 'userEnteredValue' } });
    p.values.forEach((values, i) => values.forEach((value, j) => {
      if (value instanceof Date) requests.push({ repeatCell: { range: { sheetId: id, startRowIndex: p.row - 1 + i, endRowIndex: p.row + i,
        startColumnIndex: p.column - 1 + j, endColumnIndex: p.column + j }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'dd/MM/yyyy HH:mm' } } }, fields: 'userEnteredFormat.numberFormat' } });
    }));
  });
  tx.committing = true;
  try {
    Sheets.Spreadsheets.batchUpdate({ requests }, tx.raw.getId());
    tx.committed = true;
  } catch (error) {
    // A lost response is not evidence that a write failed. The receipt was
    // included atomically, so DONE proves that every planned change was saved.
    try { tx.committed = tx.receipt.sheet.getRange(tx.receipt.row, 2).getValue() === 'DONE'; } catch (_) {}
    if (!tx.committed) {
      const uncertain = new Error('SAVE_STATUS_UNKNOWN: The save could not be confirmed. Check the Order List before trying again. Reference: ' + tx.receipt.key);
      uncertain.saveUncertain = true;
      throw uncertain;
    }
  }
}

function runPortalTransaction_(actionFn) {
  const tx = createPortalTransaction_(getPortalSpreadsheet_());
  portalTransaction_ = tx;
  try {
    const result = actionFn();
    if (result && result.replayed) return result;
    if (result && result.success === false) return result;
    commitPortalTransaction_(tx);
    return result;
  } catch (error) {
    if (tx.receipt && !tx.committing) {
      try { tx.receipt.sheet.getRange(tx.receipt.row, 2).setValue('FAILED'); SpreadsheetApp.flush(); } catch (_) {}
    }
    throw error;
  } finally {
    portalTransaction_ = null;
    if (tx.committed && tx.dataChanged) {
      // These are hints only: refresh hashes the current data. A bookkeeping
      // failure must not turn a committed save into a failure shown to the user.
      try { if (tx.configurationChanged) markConfigurationChanged_(); else markDataChanged_(); } catch (error) { console.warn('Saved; refresh-version update failed.'); }
    }
  }
}

function withWriteLock_(context, actionFn, onBusyFn) {
  const startMs = nowMs_();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    logPerfMetric_(context, startMs, { status: "lock_timeout" });
    if (typeof onBusyFn === "function") return onBusyFn();
    throw new Error("System busy. Please try again.");
  }

  try {
    portalAssertExecutionAccount_();
    const result = PORTAL_ATOMIC_ACTIONS_.includes(context) ? runPortalTransaction_(actionFn) : actionFn();
    logPerfMetric_(context, startMs, { status: "ok" });
    return result;
  } catch (e) {
    logPerfMetric_(context, startMs, { status: "error", error: e.toString() });
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function portalStateKey_(key) {
  return isDevelopmentRuntime_() ? "DEV_" + key : key;
}

function getDataVersion_() {
  return PropertiesService.getScriptProperties().getProperty(portalStateKey_("portal_data_version")) || "0";
}

function bumpDataVersion_() {
  const props = PropertiesService.getScriptProperties();
  const current = Number(props.getProperty(portalStateKey_("portal_data_version")) || 0);
  const next = (Number.isFinite(current) ? current : 0) + 1;
  props.setProperty(portalStateKey_("portal_data_version"), String(next));
  return String(next);
}

function nextOrderId_() {
  const props = PropertiesService.getScriptProperties();
  let current = Number(props.getProperty(portalStateKey_("order_id_counter")) || 0);
  if (!Number.isSafeInteger(current) || current < 100000) {
    current = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyMMdd")) * 100000;
  }
  // The counter can lag after a restore/import. Allocate above stored references
  // while the caller holds the write lock, rather than trusting the property alone.
  const prefix = isDevelopmentRuntime_() ? "DEV-" : "";
  const sheet = getPortalSpreadsheet_().getSheetByName("Orders");
  if (!sheet) throw new Error("Orders sheet not found.");
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(row => {
      const reference = String(row[0] == null ? "" : row[0]).trim();
      if (prefix && !reference.startsWith(prefix)) return;
      const digits = prefix ? reference.slice(prefix.length) : reference;
      if (!/^\d+$/.test(digits)) return;
      const value = Number(digits);
      if (Number.isSafeInteger(value)) current = Math.max(current, value);
    });
  }
  current += 1;
  if (!Number.isSafeInteger(current)) throw new Error("Cannot allocate a unique order reference. Contact IT.");
  props.setProperty(portalStateKey_("order_id_counter"), String(current));
  return prefix + current;
}

function assertUniqueOrderReference_(rows, id) {
  const reference = String(id).trim();
  let matches = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] == null ? "" : rows[i][0]).trim() === reference && ++matches > 1) {
      throw createPortalValidationError_(
        "Order reference " + reference + " is shared by more than one record. Nothing was changed. Contact IT to repair the duplicate references, then reload the Order List.",
        "DUPLICATE_ORDER_REFERENCE"
      );
    }
  }
}

function markDataChanged_() {
  if (portalTransaction_) { portalTransaction_.dataChanged = true; return ''; }
  clearBudgetCache_();
  return bumpDataVersion_();
}

function getConfigurationVersion_() {
  return PropertiesService.getScriptProperties().getProperty(portalStateKey_("configuration_data_version")) || "0";
}

function bumpConfigurationVersion_() {
  const props = PropertiesService.getScriptProperties();
  const current = Number(props.getProperty(portalStateKey_("configuration_data_version")) || 0);
  const next = (Number.isFinite(current) ? current : 0) + 1;
  props.setProperty(portalStateKey_("configuration_data_version"), String(next));
  return String(next);
}

function markConfigurationChanged_() {
  if (portalTransaction_) { portalTransaction_.configurationChanged = true; portalTransaction_.dataChanged = true; return getConfigurationVersion_(); }
  markDataChanged_();
  return bumpConfigurationVersion_();
}

function getConfigurationChangeVersion() {
  getAuthorizedUserContext_();
  return JSON.stringify({
    success: true,
    configurationVersion: getConfigurationVersion_()
  });
}

function getConfig_(spreadsheet) {
  const ss = spreadsheet || getPortalSpreadsheet_();
  const sheet = ss.getSheetByName("Config");
  if (!sheet) return { financeEmail: "it@claremontschool.co.uk", senderAlias: "service.orders@claremontschool.co.uk" };
  const values = sheet.getRange(2, 2, 2, 1).getValues();
  const email = values[0][0];
  let alias = values[1][0]; // Send-As Alias
  if (!alias || alias.toString().trim() === "") alias = "service.orders@claremontschool.co.uk";
  return { financeEmail: email, senderAlias: alias };
}

function createWriteResult_(success, saved, message, warning) {
  const result = {
    success: !!success,
    saved: !!saved,
    message: (message || "").toString()
  };
  if (warning && warning.code) {
    result.warningCode = warning.code;
    result.warningMessage = warning.message || "The change was saved, but its notification could not be sent.";
  }
  return result;
}

function createWriteSuccess_(message, warning) {
  return createWriteResult_(true, true, message, warning);
}

function createWriteFailure_(message) {
  return createWriteResult_(false, false, message || "The change could not be saved.");
}

function createPortalValidationError_(message, code) {
  const error = new Error((message || "Please check the information entered.").toString());
  error.isPortalValidationError = true;
  error.validationCode = (code || "INVALID_INPUT").toString();
  return error;
}

function isPortalValidationError_(error) {
  return !!(error && error.isPortalValidationError === true);
}

function validateTextField_(value, label, options) {
  const opts = options || {};
  const text = value === null || value === undefined ? "" : value.toString().trim();
  if (opts.required && !text) throw createPortalValidationError_(label + " is required.", "REQUIRED_FIELD");
  const maxLength = Number(opts.maxLength || 0);
  if (maxLength > 0 && text.length > maxLength) {
    throw createPortalValidationError_(label + " must be " + maxLength + " characters or fewer.", "FIELD_TOO_LONG");
  }
  return text;
}

function validateMoneyField_(value, label, options) {
  const opts = options || {};
  if ((value === "" || value === null || value === undefined) && opts.allowBlank) return null;
  const text = value === null || value === undefined ? "" : value.toString().trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) {
    throw createPortalValidationError_(label + " must be a valid amount with no more than two decimal places.", "INVALID_AMOUNT");
  }
  const amount = Number(text);
  if (!Number.isFinite(amount)) throw createPortalValidationError_(label + " must be a valid amount.", "INVALID_AMOUNT");
  if (opts.positive && amount <= 0) throw createPortalValidationError_(label + " must be greater than zero.", "INVALID_AMOUNT");
  if (opts.nonZero && amount === 0) throw createPortalValidationError_(label + " cannot be zero. Use a negative amount for a credit note.", "INVALID_AMOUNT");
  if (opts.nonNegative && amount < 0) throw createPortalValidationError_(label + " cannot be negative.", "INVALID_AMOUNT");
  if (Math.abs(amount) > 1000000000) throw createPortalValidationError_(label + " is outside the supported range.", "INVALID_AMOUNT");
  return Math.round(amount * 100) / 100;
}

function validateQuantityField_(value) {
  const text = value === null || value === undefined ? "" : value.toString().trim();
  if (!/^\d+$/.test(text)) throw createPortalValidationError_("Quantity must be a whole number greater than zero.", "INVALID_QUANTITY");
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) {
    throw createPortalValidationError_("Quantity must be a whole number between 1 and 100,000.", "INVALID_QUANTITY");
  }
  return quantity;
}

function parseOptionalDateField_(value, label) {
  if (value === "" || value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = value.toString().trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw createPortalValidationError_(label + " must be a valid date.", "INVALID_DATE");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    throw createPortalValidationError_(label + " must be a valid date.", "INVALID_DATE");
  }
  return date;
}

function normalizeHttpUrl_(value, label) {
  const fieldLabel = label || "Link";
  const text = validateTextField_(value, fieldLabel, { maxLength: 2000 });
  if (!text) return "";
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(text);
  if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) {
    throw createPortalValidationError_(fieldLabel + " must use http or https.", "INVALID_URL_SCHEME");
  }

  const candidate = schemeMatch ? text : "https://" + text;
  if (/\s/.test(candidate)) {
    throw createPortalValidationError_(fieldLabel + " must be a valid web address without spaces.", "INVALID_URL");
  }

  // Apps Script's server-side V8 runtime does not provide the browser URL API.
  // Validate the small set of URL properties the portal needs without fetching the address.
  const parsed = /^(https?):\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(candidate);
  if (!parsed) {
    throw createPortalValidationError_(fieldLabel + " must be a valid web address.", "INVALID_URL");
  }

  const authority = parsed[2];
  if (!authority || authority.indexOf("@") >= 0) {
    throw createPortalValidationError_(fieldLabel + " must be a valid web address.", "INVALID_URL");
  }

  let hostname = authority;
  let port = "";
  if (authority.charAt(0) === "[") {
    const ipv6Match = /^\[([0-9a-f:.]+)\](?::(\d+))?$/i.exec(authority);
    if (!ipv6Match || ipv6Match[1].indexOf(":") < 0) {
      throw createPortalValidationError_(fieldLabel + " must be a valid web address.", "INVALID_URL");
    }
    hostname = ipv6Match[1];
    port = ipv6Match[2] || "";
  } else {
    if ((authority.match(/:/g) || []).length > 1) {
      throw createPortalValidationError_(fieldLabel + " must be a valid web address.", "INVALID_URL");
    }
    const hostPortMatch = /^([^:]+)(?::(\d+))?$/.exec(authority);
    if (!hostPortMatch) {
      throw createPortalValidationError_(fieldLabel + " must be a valid web address.", "INVALID_URL");
    }
    hostname = hostPortMatch[1];
    port = hostPortMatch[2] || "";

    const isIpv4 = /^\d+(?:\.\d+){3}$/.test(hostname);
    if (isIpv4) {
      const octets = hostname.split(".");
      if (octets.some(part => Number(part) > 255)) {
        throw createPortalValidationError_(fieldLabel + " must be a valid web address.", "INVALID_URL");
      }
    } else {
      const labels = hostname.split(".");
      if (hostname.length > 253 || labels.length < 2 || labels.some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))) {
        throw createPortalValidationError_(fieldLabel + " must be a valid web address.", "INVALID_URL");
      }
    }
  }

  if (port && (Number(port) < 1 || Number(port) > 65535)) {
    throw createPortalValidationError_(fieldLabel + " must contain a valid port number.", "INVALID_URL");
  }
  return candidate;
}

function normalizeSupplierLinkValue_(value) {
  const text = validateTextField_(value, "Supplier link", { maxLength: 2000 });
  if (!text) return "";

  const hasHttpScheme = /^https?:\/\//i.test(text);
  const looksLikeBareDomain = /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#]\S*)?$/i.test(text);
  if (!hasHttpScheme && !looksLikeBareDomain) return text;

  try {
    return normalizeHttpUrl_(text, "Supplier link");
  } catch (e) {
    // This field deliberately supports references as well as URLs. If a value only
    // resembles a URL but is malformed, retain it safely as non-clickable text.
    return text;
  }
}

function buildNotificationWarning_(payloads) {
  const failures = (payloads || []).filter(Boolean).map(payload => {
    try { return sendEmailAlert_(payload.to, payload.subject, payload.body, payload.options); }
    catch (_) { return { success: false }; }
  }).filter(result => !result || !result.success);
  if (!failures.length) return null;
  return {
    code: "NOTIFICATION_FAILED",
    message: failures.length === 1
      ? "Saved successfully, but the notification email could not be sent."
      : "Saved successfully, but one or more notification emails could not be sent."
  };
}

function getConfigurationHeaderIndex_(headers, candidates, fallbackIndex) {
  const normalizedHeaders = (headers || []).map(header =>
    (header || "").toString().trim().toLowerCase().replace(/[\s_-]+/g, "")
  );
  for (let i = 0; i < candidates.length; i++) {
    const candidate = (candidates[i] || "").toString().trim().toLowerCase().replace(/[\s_-]+/g, "");
    const index = normalizedHeaders.indexOf(candidate);
    if (index >= 0) return index;
  }
  return Number.isInteger(fallbackIndex) && fallbackIndex >= 0 && fallbackIndex < normalizedHeaders.length
    ? fallbackIndex
    : -1;
}

function requireConfigurationColumn_(headers, candidates, fallbackIndex, sheetName) {
  const index = getConfigurationHeaderIndex_(headers, candidates, fallbackIndex);
  if (index < 0) {
    throw new Error("Required configuration column is missing from " + sheetName + ": " + candidates[0]);
  }
  return index;
}

function normalizeConfigurationKey_(value) {
  return (value || "").toString().trim().toLowerCase();
}

function isConfigurationActiveValue_(value) {
  if (value === false || value === 0) return false;
  const normalized = normalizeConfigurationKey_(value);
  if (!normalized) return true;
  return !["false", "no", "inactive", "disabled", "0"].includes(normalized);
}

function isConfigurationEnabledFlag_(value) {
  if (value === true || value === 1) return true;
  const normalized = normalizeConfigurationKey_(value);
  return ["true", "yes", "enabled", "1"].includes(normalized);
}

function ensureConfigurationColumn_(sheet, headers, headerName, defaultValue) {
  let index = getConfigurationHeaderIndex_(headers, [headerName], -1);
  if (index >= 0) return index;

  index = Math.max(sheet.getLastColumn(), headers.length);
  sheet.getRange(1, index + 1).setValue(headerName);
  headers[index] = headerName;

  const lastRow = sheet.getLastRow();
  if (lastRow > 1 && defaultValue !== undefined) {
    const existingKeys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const values = existingKeys.map(row => [row[0] ? defaultValue : ""]);
    sheet.getRange(2, index + 1, values.length, 1).setValues(values);
  }
  return index;
}

function getUserConfigurationSchema_(sheet, ensureWritableColumns, existingHeaders) {
  const headers = (existingHeaders || sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0])
    .map(value => (value || "").toString().trim());
  const schema = {
    headers: headers,
    emailIndex: requireConfigurationColumn_(headers, ["Email"], 0, "Users"),
    departmentIndex: requireConfigurationColumn_(headers, ["Department", "Departments"], 1, "Users"),
    roleIndex: requireConfigurationColumn_(headers, ["Role"], 2, "Users"),
    defaultSiteIndex: getConfigurationHeaderIndex_(headers, ["Default Site", "DefaultSite", "Site"], 3),
    simulationEmailIndex: getConfigurationHeaderIndex_(headers, ["Simulation Email", "SimulationEmail", "Simulated User"], 4),
    activeIndex: getConfigurationHeaderIndex_(headers, ["Active", "Is Active", "Status"], -1),
    canProcessOrdersIndex: getConfigurationHeaderIndex_(headers, ["Can Process Orders", "CanProcessOrders"], -1),
    processingDepartmentsIndex: getConfigurationHeaderIndex_(headers, ["Processing Departments"], -1),
    canLogInvoicesIndex: getConfigurationHeaderIndex_(headers, ["Can Log Invoices", "CanLogInvoices", "Can Log Invoice"], -1)
  };

  if (ensureWritableColumns) {
    if (schema.defaultSiteIndex < 0) {
      schema.defaultSiteIndex = ensureConfigurationColumn_(sheet, headers, "Default Site", "");
    }
    if (schema.simulationEmailIndex < 0) {
      schema.simulationEmailIndex = ensureConfigurationColumn_(sheet, headers, "Simulation Email", "");
    }
    if (schema.activeIndex < 0) {
      schema.activeIndex = ensureConfigurationColumn_(sheet, headers, "Active", true);
    }
    if (schema.canProcessOrdersIndex < 0) {
      schema.canProcessOrdersIndex = ensureConfigurationColumn_(sheet, headers, "Can Process Orders", false);
    }
    if (schema.processingDepartmentsIndex < 0) schema.processingDepartmentsIndex = ensureConfigurationColumn_(sheet, headers, "Processing Departments", "");
    if (schema.canLogInvoicesIndex < 0) {
      schema.canLogInvoicesIndex = ensureConfigurationColumn_(sheet, headers, "Can Log Invoices", false);
    }
  }
  return schema;
}

function getBudgetConfigurationSchema_(sheet, ensureWritableColumns, existingHeaders) {
  const headers = (existingHeaders || sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0])
    .map(value => (value || "").toString().trim());
  const schema = {
    headers: headers,
    departmentIndex: requireConfigurationColumn_(headers, ["Department"], 0, "Budgets"),
    totalIndex: requireConfigurationColumn_(headers, ["TotalAllocation", "Total Allocation"], 1, "Budgets"),
    spentIndex: requireConfigurationColumn_(headers, ["Spent"], 2, "Budgets"),
    remainingIndex: requireConfigurationColumn_(headers, ["Remaining"], 3, "Budgets"),
    glCodeIndex: getConfigurationHeaderIndex_(headers, ["GL Code", "GLCode"], 4),
    activeIndex: getConfigurationHeaderIndex_(headers, ["Active", "Is Active", "Status"], -1)
  };
  if (ensureWritableColumns) {
    if (schema.glCodeIndex < 0) {
      schema.glCodeIndex = ensureConfigurationColumn_(sheet, headers, "GL Code", "");
    }
    if (schema.activeIndex < 0) {
      schema.activeIndex = ensureConfigurationColumn_(sheet, headers, "Active", true);
    }
  }
  return schema;
}

function createConfigurationValidationError_(message) {
  const error = new Error(message);
  error.isConfigurationValidationError = true;
  error.userMessage = message;
  return error;
}

function requireLiveConfigurationAdmin_(user) {
  requireCapability_(
    user,
    "canManageConfiguration",
    "Access denied. Configuration is available to live Admin users only.",
    "configuration_write_not_admin"
  );
}

function configurationRevision_(ss) {
  const rows = ['Users', 'Budgets', 'Config'].map(name => {
    const sheet = ss.getSheetByName(name);
    const values = sheet ? sheet.getDataRange().getValues() : [];
    if (name === 'Budgets' && values.length) {
      const schema = getBudgetConfigurationSchema_(sheet, false, values[0]);
      return values.map((row, i) => i ? row.map((value, j) =>
        j === schema.spentIndex || j === schema.remainingIndex ? null : value) : row);
    }
    return values;
  });
  return orderVersion_({ configuration: rows });
}

function configurationWriteResponse_(context, actionFn, expectedRevision) {
  try {
    const result = withWriteLock_(context, () => {
      const user = getAuthorizedUserContext_();
      requireLiveConfigurationAdmin_(user);
      const ss = getPortalSpreadsheet_();
      if (!expectedRevision || expectedRevision !== configurationRevision_(ss)) {
        throw createConfigurationValidationError_('Configuration has changed, or this page is out of date. Reload and review the latest settings before saving.');
      }
      const outcome = actionFn(ss, user) || {};
      const changed = outcome.changed !== false;
      const configurationVersion = changed ? markConfigurationChanged_() : getConfigurationVersion_();
      SpreadsheetApp.flush();
      return Object.assign({
        success: true,
        changed: changed,
        configurationVersion: configurationVersion
      }, outcome);
    });
    return JSON.stringify(result);
  } catch (e) {
    const authDenied = isAuthError_(e);
    const validationError = !!(e && e.isConfigurationValidationError);
    if (!authDenied && !validationError) console.error("[CONFIGURATION_WRITE] " + context + " " + e.toString());
    return JSON.stringify({
      success: false,
      errorCode: authDenied
        ? AUTH_ERROR_CODE_
        : (validationError ? "CONFIGURATION_VALIDATION" : "CONFIGURATION_WRITE_FAILED"),
      error: authDenied || validationError
        ? (e.userMessage || "The configuration change was not allowed.")
        : (e.saveUncertain ? 'The save could not be confirmed. Reload and check the settings and audit history before trying again.' : 'The configuration change was not saved. Reload and try again.')
    });
  }
}

function ensureConfigurationAuditSheet_(ss) {
  let sheet = ss.getSheetByName("Configuration Audit");
  if (!sheet) {
    sheet = ss.insertSheet("Configuration Audit");
    const headers = ["Timestamp", "User", "Action", "Target", "Details"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d9e2f3");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendConfigurationAudit_(ss, user, action, target, details) {
  const sheet = ensureConfigurationAuditSheet_(ss);
  sheet.appendRow([
    new Date(),
    (user.realEmail || user.email || "").toString().trim().toLowerCase(),
    (action || "Configuration changed").toString().slice(0, 120),
    (target || "").toString().slice(0, 200),
    (details || "").toString().slice(0, 1000)
  ]);
}

function columnLetter_(columnNumber) {
  let number = Number(columnNumber);
  let result = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function findConfigurationRow_(data, valueIndex, value) {
  const key = normalizeConfigurationKey_(value);
  for (let i = 1; i < data.length; i++) {
    if (normalizeConfigurationKey_(data[i][valueIndex]) === key) return i;
  }
  return -1;
}

function getActiveBudgetNameMap_(budgetData, schema) {
  const result = {};
  for (let i = 1; i < budgetData.length; i++) {
    const department = (budgetData[i][schema.departmentIndex] || "").toString().trim();
    if (!department) continue;
    if (schema.activeIndex >= 0 && !isConfigurationActiveValue_(budgetData[i][schema.activeIndex])) continue;
    result[normalizeConfigurationKey_(department)] = department;
  }
  return result;
}

function isValidConfigurationEmail_(email) {
  const value = (email || "").toString().trim();
  return !value.startsWith("=") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getConfigurationAuditPreview_(ss) {
  const sheet = ss.getSheetByName("Configuration Audit");
  if (!sheet) {
    return {
      available: false,
      records: [],
      message: "No saved configuration changes have been recorded yet. The first successful change will start the audit log."
    };
  }

  const data = sheet.getDataRange().getValues();
  if (!data.length || data.length === 1) {
    return {
      available: true,
      records: [],
      message: "No saved configuration changes have been recorded yet."
    };
  }

  const headers = data[0].map(value => (value || "").toString().trim());
  const timestampIndex = getConfigurationHeaderIndex_(headers, ["Timestamp", "Date", "Date and Time"], -1);
  const actorIndex = getConfigurationHeaderIndex_(headers, ["User", "Actor", "Actor Email", "Email"], -1);
  const actionIndex = getConfigurationHeaderIndex_(headers, ["Action", "Change"], -1);
  const targetIndex = getConfigurationHeaderIndex_(headers, ["Target", "Target Name", "Item"], -1);
  const detailsIndex = getConfigurationHeaderIndex_(headers, ["Details", "Summary", "Description"], -1);

  if (timestampIndex < 0 || actorIndex < 0 || actionIndex < 0) {
    return {
      available: false,
      records: [],
      message: "The configuration audit log is unavailable because its required headers are incomplete."
    };
  }

  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const timestampValue = row[timestampIndex];
    const actorEmail = (row[actorIndex] || "").toString().trim();
    const action = (row[actionIndex] || "").toString().trim();
    if (!timestampValue || !actorEmail || !action) continue;
    records.push({
      timestamp: timestampValue instanceof Date ? timestampValue.toISOString() : timestampValue.toString(),
      actorEmail: actorEmail,
      action: action,
      target: targetIndex >= 0 ? (row[targetIndex] || "").toString().trim() : "",
      details: detailsIndex >= 0 ? (row[detailsIndex] || "").toString().trim() : ""
    });
  }

  records.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime() || 0;
    const bTime = new Date(b.timestamp).getTime() || 0;
    return bTime - aTime;
  });

  return {
    available: true,
    records: records.slice(0, 200),
    message: records.length > 200
      ? "Showing the 200 most recent saved configuration changes."
      : "Showing saved changes made through the Configuration workspace."
  };
}

function getAdminConfigurationPreview() {
  try {
    const ss = getPortalSpreadsheet_();
    const user = getAuthorizedUserContext_(ss);
    requireCapability_(
      user,
      "canManageConfiguration",
      "Access denied. Configuration is available to live Admin users only.",
      "configuration_preview_not_admin"
    );

    const budgetSheet = ss.getSheetByName("Budgets");
    const userSheet = ss.getSheetByName("Users");
    const orderSheet = ss.getSheetByName("Orders");
    const configSheet = ss.getSheetByName("Config");
    const missingSheets = [];
    if (!budgetSheet) missingSheets.push("Budgets");
    if (!userSheet) missingSheets.push("Users");
    if (!orderSheet) missingSheets.push("Orders");
    if (!configSheet) missingSheets.push("Config");
    if (missingSheets.length) {
      throw new Error("Required configuration data is unavailable: " + missingSheets.join(", "));
    }

    const budgetData = budgetSheet.getDataRange().getValues();
    const userData = userSheet.getDataRange().getValues();
    if (!budgetData.length || !userData.length) {
      throw new Error("Required configuration headers are unavailable.");
    }

    const budgetSchema = getBudgetConfigurationSchema_(budgetSheet, false, budgetData[0]);
    const userSchema = getUserConfigurationSchema_(userSheet, false, userData[0]);

    const orderLastColumn = Math.max(orderSheet.getLastColumn(), 2);
    const orderHeaders = orderSheet.getRange(1, 1, 1, orderLastColumn).getValues()[0]
      .map(value => (value || "").toString().trim());
    const orderDepartmentIndex = requireConfigurationColumn_(orderHeaders, ["Department"], 1, "Orders");

    const departmentUserCounts = {};
    const departmentOrderCounts = {};
    const departmentPendingOrderCounts = {};
    const users = [];
    let adminCount = 0;
    let activeUserCount = 0;
    const currentEmail = normalizeConfigurationKey_(user.realEmail || user.email);

    for (let i = 1; i < userData.length; i++) {
      const row = userData[i];
      const email = (row[userSchema.emailIndex] || "").toString().trim();
      if (!email) continue;
      const departments = parseDepartmentList_(row[userSchema.departmentIndex]);
      const role = (row[userSchema.roleIndex] || "").toString().trim();
      const defaultSite = userSchema.defaultSiteIndex >= 0 ? (row[userSchema.defaultSiteIndex] || "").toString().trim() : "";
      const isActive = userSchema.activeIndex < 0 || isConfigurationActiveValue_(row[userSchema.activeIndex]);
      const canUseAddOns = role === ROLE_STAFF_ || role === ROLE_HEAD_;
      const canProcessOrders = canUseAddOns && userSchema.canProcessOrdersIndex >= 0 && isConfigurationEnabledFlag_(row[userSchema.canProcessOrdersIndex]);
      const canLogInvoices = canUseAddOns && userSchema.canLogInvoicesIndex >= 0 && isConfigurationEnabledFlag_(row[userSchema.canLogInvoicesIndex]);
      if (isActive) {
        activeUserCount += 1;
        if (role === ROLE_ADMIN_) adminCount += 1;
        departments.forEach(department => {
          const key = normalizeConfigurationKey_(department);
          departmentUserCounts[key] = (departmentUserCounts[key] || 0) + 1;
        });
      }
      users.push({
        email: email,
        departments: departments,
        processingDepartments: userSchema.processingDepartmentsIndex >= 0 ? parseDepartmentList_(row[userSchema.processingDepartmentsIndex]) : [],
        role: role,
        defaultSite: defaultSite,
        canProcessOrders: canProcessOrders,
        canLogInvoices: canLogInvoices,
        status: isActive ? "Active" : "Inactive",
        isActive: isActive,
        isCurrentUser: normalizeConfigurationKey_(email) === currentEmail
      });
    }

    if (orderSheet.getLastRow() > 1) {
      const orderRows = orderSheet
        .getRange(2, 1, orderSheet.getLastRow() - 1, orderLastColumn)
        .getValues();
      orderRows.forEach(row => {
        const department = (row[orderDepartmentIndex] || "").toString().trim();
        if (!department) return;
        const key = normalizeConfigurationKey_(department);
        departmentOrderCounts[key] = (departmentOrderCounts[key] || 0) + 1;
        const description = (row[6] || "").toString().trim().toUpperCase();
        if (!isOrderCompleted_(row) && !isOrderCancelled_(row)) {
          departmentPendingOrderCounts[key] = (departmentPendingOrderCounts[key] || 0) + 1;
        }
      });
    }

    users.forEach(record => {
      const isLastAdmin = record.isActive && record.role === ROLE_ADMIN_ && adminCount <= 1;
      record.canDeactivate = record.isActive && !record.isCurrentUser && !isLastAdmin;
      record.canReactivate = !record.isActive;
      record.deactivationReason = !record.isActive
        ? "This account is already inactive."
        : (record.isCurrentUser
        ? "You cannot deactivate your own account."
        : (isLastAdmin ? "The final Admin account cannot be deactivated." : ""));
    });

    const budgets = [];
    for (let i = 1; i < budgetData.length; i++) {
      const row = budgetData[i];
      const department = (row[budgetSchema.departmentIndex] || "").toString().trim();
      if (!department) continue;
      const key = normalizeConfigurationKey_(department);
      const isActive = budgetSchema.activeIndex < 0 || isConfigurationActiveValue_(row[budgetSchema.activeIndex]);
      const rawTotal = row[budgetSchema.totalIndex];
      const rawSpent = row[budgetSchema.spentIndex];
      const rawRemaining = row[budgetSchema.remainingIndex];
      const hasCalculationError = [rawTotal, rawSpent, rawRemaining].some(value =>
        isConfigurationFormulaErrorDisplay_(value) || !Number.isFinite(Number(value))
      );
      budgets.push({
        department: department,
        totalAllocation: Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : 0,
        spent: Number.isFinite(Number(rawSpent)) ? Number(rawSpent) : 0,
        remaining: Number.isFinite(Number(rawRemaining)) ? Number(rawRemaining) : 0,
        hasCalculationError: hasCalculationError,
        calculationError: hasCalculationError ? "Budget calculation unavailable. Check the allocation, spent and remaining cells in the Budgets sheet." : "",
        glCode: budgetSchema.glCodeIndex >= 0 ? (row[budgetSchema.glCodeIndex] || "").toString().trim() : "",
        status: isActive ? "Active" : "Inactive",
        isActive: isActive,
        isSystemDepartment: isSystemBudgetDepartment_(department),
        dependencies: {
          userCount: departmentUserCounts[key] || 0,
          orderCount: departmentOrderCounts[key] || 0,
          pendingOrderCount: departmentPendingOrderCounts[key] || 0
        }
      });
    }

    const config = getConfig_(ss);
    return JSON.stringify({
      success: true,
      previewOnly: false,
      configurationVersion: getConfigurationVersion_(),
      configurationRevision: configurationRevision_(ss),
      user: {
        email: user.realEmail || user.email,
        role: user.realRole || user.role
      },
      budgets: budgets,
      users: users,
      systemSettings: {
        financeEmail: (config.financeEmail || "").toString().trim(),
        senderAlias: (config.senderAlias || "").toString().trim()
      },
      audit: getConfigurationAuditPreview_(ss),
      roles: [
        { value: ROLE_ADMIN_, label: "Admin", description: "Full portal and configuration access." },
        { value: ROLE_STAFF_, label: "Staff", description: "Normal ordering access for assigned departments." },
        { value: ROLE_HEAD_, label: "Head", description: "Department access plus a site-level overview." },
        { value: ROLE_WIPRO_, label: "Wipro", description: "Finance operations and order processing access." }
      ],
      sites: ["Prep", "Senior"],
      schoolDomain: "claremontschool.co.uk",
      summary: {
        departmentCount: budgets.filter(record => record.isActive && !record.isSystemDepartment).length,
        userCount: activeUserCount,
        adminCount: adminCount
      }
    });
  } catch (e) {
    const authDenied = isAuthError_(e);
    if (!authDenied) console.error("[CONFIGURATION_PREVIEW] " + e.toString());
    return JSON.stringify({
      success: false,
      previewOnly: false,
      errorCode: authDenied ? AUTH_ERROR_CODE_ : "CONFIGURATION_PREVIEW_UNAVAILABLE",
      error: authDenied
        ? (e.userMessage || "Access denied.")
        : "Configuration could not be loaded. Please check the Master Sheet structure or contact IT."
    });
  }
}

function normalizeDepartmentNameForWrite_(value) {
  return (value || "").toString().trim().replace(/\s+/g, " ");
}

function validateDepartmentNameForWrite_(value) {
  const department = normalizeDepartmentNameForWrite_(value);
  if (!department || department.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 &()'./-]{0,79}$/.test(department)) {
    throw createConfigurationValidationError_(
      "Enter a department name using letters, numbers, spaces, ampersands, brackets, apostrophes, full stops, slashes or hyphens."
    );
  }
  return department;
}

function validateGlCodeForWrite_(value) {
  const glCode = (value || "").toString().trim();
  if (glCode.length > 40 || (glCode && !/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,39}$/.test(glCode))) {
    throw createConfigurationValidationError_("Enter a valid GL code using letters, numbers, spaces, full stops, underscores, slashes or hyphens.");
  }
  return glCode;
}

function getDepartmentDependencies_(ss, department) {
  const key = normalizeConfigurationKey_(department);
  const result = { userCount: 0, orderCount: 0, pendingOrderCount: 0 };
  const userSheet = ss.getSheetByName("Users");
  if (userSheet && userSheet.getLastRow() > 1) {
    const schema = getUserConfigurationSchema_(userSheet, false);
    const rows = userSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const isActive = schema.activeIndex < 0 || isConfigurationActiveValue_(rows[i][schema.activeIndex]);
      if (!isActive) continue;
      const departments = parseDepartmentList_(rows[i][schema.departmentIndex]).concat(schema.processingDepartmentsIndex >= 0 ? parseDepartmentList_(rows[i][schema.processingDepartmentsIndex]) : []);
      if (departments.some(item => normalizeConfigurationKey_(item) === key)) result.userCount += 1;
    }
  }

  const orderSheet = ss.getSheetByName("Orders");
  if (orderSheet && orderSheet.getLastRow() > 1) {
    const lastColumn = Math.max(orderSheet.getLastColumn(), 7);
    const headers = orderSheet.getRange(1, 1, 1, lastColumn).getValues()[0]
      .map(value => (value || "").toString().trim());
    const departmentIndex = requireConfigurationColumn_(headers, ["Department"], 1, "Orders");
    const rows = orderSheet.getRange(2, 1, orderSheet.getLastRow() - 1, lastColumn).getValues();
    rows.forEach(row => {
      if (normalizeConfigurationKey_(row[departmentIndex]) !== key) return;
      result.orderCount += 1;
      const description = (row[6] || "").toString().trim().toUpperCase();
      if (!isOrderCompleted_(row) && !isOrderCancelled_(row)) result.pendingOrderCount += 1;
    });
  }
  return result;
}

function renameDepartmentReferences_(ss, oldName, newName) {
  const oldKey = normalizeConfigurationKey_(oldName);
  let userCount = 0;
  let orderCount = 0;
  const rollbackActions = [];

  const rollback = () => {
    for (let i = rollbackActions.length - 1; i >= 0; i--) rollbackActions[i]();
    SpreadsheetApp.flush();
  };

  try {
    const userSheet = ss.getSheetByName("Users");
    if (userSheet && userSheet.getLastRow() > 1) {
      const schema = getUserConfigurationSchema_(userSheet, false);
      if (schema.processingDepartmentsIndex >= 0) {
        const processingRange = userSheet.getRange(2, schema.processingDepartmentsIndex + 1, userSheet.getLastRow() - 1, 1);
        const originals = processingRange.getValues();
        const replacements = originals.map(row => [parseDepartmentList_(row[0]).map(name => normalizeConfigurationKey_(name) === oldKey ? newName : name).join(', ')]);
        rollbackActions.push(() => processingRange.setValues(originals));
        processingRange.setValues(replacements);
      }
      const range = userSheet.getRange(2, schema.departmentIndex + 1, userSheet.getLastRow() - 1, 1);
      const originalValues = range.getValues();
      const values = originalValues.map(row => row.slice());
      values.forEach(row => {
        const departments = parseDepartmentList_(row[0]);
        let changed = false;
        const seen = {};
        const updated = [];
        departments.forEach(department => {
          const replacement = normalizeConfigurationKey_(department) === oldKey ? newName : department;
          if (replacement !== department) changed = true;
          const key = normalizeConfigurationKey_(replacement);
          if (key && !seen[key]) {
            seen[key] = true;
            updated.push(replacement);
          }
        });
        if (changed) {
          row[0] = updated.join(", ");
          userCount += 1;
        }
      });
      rollbackActions.push(() => range.setValues(originalValues));
      range.setValues(values);
    }

    const orderSheet = ss.getSheetByName("Orders");
    if (orderSheet && orderSheet.getLastRow() > 1) {
      const lastColumn = Math.max(orderSheet.getLastColumn(), 2);
      const headers = orderSheet.getRange(1, 1, 1, lastColumn).getValues()[0]
        .map(value => (value || "").toString().trim());
      const departmentIndex = requireConfigurationColumn_(headers, ["Department"], 1, "Orders");
      const range = orderSheet.getRange(2, departmentIndex + 1, orderSheet.getLastRow() - 1, 1);
      const originalValues = range.getValues();
      const values = originalValues.map(row => row.slice());
      values.forEach(row => {
        if (normalizeConfigurationKey_(row[0]) === oldKey) {
          row[0] = newName;
          orderCount += 1;
        }
      });
      rollbackActions.push(() => range.setValues(originalValues));
      range.setValues(values);
    }
  } catch (e) {
    rollback();
    throw e;
  }
  return { userCount: userCount, orderCount: orderCount, rollback: rollback };
}

function buildNewBudgetFormulaStrings_(budgetDepartmentCell, totalCell, spentCell, orderDepartmentColumn, estimatedPriceColumn, finalPriceColumn) {
  const orderDepartmentRange = `Orders!$${orderDepartmentColumn}$2:$${orderDepartmentColumn}`;
  const estimatedPriceRange = `Orders!$${estimatedPriceColumn}$2:$${estimatedPriceColumn}`;
  const finalPriceRange = `Orders!$${finalPriceColumn}$2:$${finalPriceColumn}`;
  return {
    spent: `=SUMPRODUCT((${orderDepartmentRange}=${budgetDepartmentCell}) * (IF(${finalPriceRange}<>"", ${finalPriceRange}, ${estimatedPriceRange})))`,
    remaining: `=${totalCell}-${spentCell}`
  };
}

function isConfigurationFormulaErrorDisplay_(value) {
  return /^\s*#/.test((value || "").toString());
}

function setNewBudgetFormulas_(ss, budgetSheet, schema, rowNumber) {
  const orderSheet = ss.getSheetByName("Orders");
  if (!orderSheet) throw createConfigurationValidationError_("The Orders sheet is unavailable, so the department could not be added.");
  const orderLastColumn = Math.max(orderSheet.getLastColumn(), 16);
  const orderHeaders = orderSheet.getRange(1, 1, 1, orderLastColumn).getValues()[0]
    .map(value => (value || "").toString().trim());
  const orderDepartmentIndex = requireConfigurationColumn_(orderHeaders, ["Department"], 1, "Orders");
  const estimatedPriceIndex = requireConfigurationColumn_(orderHeaders, ["Total Price (Est)", "Total Price Est", "Estimated Total"], 10, "Orders");
  const finalPriceIndex = requireConfigurationColumn_(orderHeaders, ["Updated total price", "Updated Total Price", "Final Price"], 15, "Orders");

  const budgetDepartmentCell = columnLetter_(schema.departmentIndex + 1) + rowNumber;
  const orderDepartmentColumn = columnLetter_(orderDepartmentIndex + 1);
  const estimatedPriceColumn = columnLetter_(estimatedPriceIndex + 1);
  const finalPriceColumn = columnLetter_(finalPriceIndex + 1);
  const totalCell = columnLetter_(schema.totalIndex + 1) + rowNumber;
  const spentCell = columnLetter_(schema.spentIndex + 1) + rowNumber;
  const formulas = buildNewBudgetFormulaStrings_(
    budgetDepartmentCell,
    totalCell,
    spentCell,
    orderDepartmentColumn,
    estimatedPriceColumn,
    finalPriceColumn
  );
  const spentRange = budgetSheet.getRange(rowNumber, schema.spentIndex + 1);
  const remainingRange = budgetSheet.getRange(rowNumber, schema.remainingIndex + 1);

  spentRange.setFormula(formulas.spent);
  remainingRange.setFormula(formulas.remaining);
  if (portalTransaction_) return formulas; // Trusted formulas are committed with the department and audit.
  SpreadsheetApp.flush();

  const spentDisplay = spentRange.getDisplayValue();
  const remainingDisplay = remainingRange.getDisplayValue();
  if (isConfigurationFormulaErrorDisplay_(spentDisplay) || isConfigurationFormulaErrorDisplay_(remainingDisplay)) {
    throw createConfigurationValidationError_(
      "The department calculations could not be created safely, so nothing was saved. Please contact IT."
    );
  }
  return formulas;
}

function saveAdminBudgetConfiguration(payload) {
  return configurationWriteResponse_("saveAdminBudgetConfiguration", (ss, user) => {
    const input = payload && typeof payload === "object" ? payload : {};
    const originalName = normalizeDepartmentNameForWrite_(input.originalName);
    const department = validateDepartmentNameForWrite_(input.department);
    const allocation = Number(input.totalAllocation);
    if (!Number.isFinite(allocation) || allocation < 0) {
      throw createConfigurationValidationError_("Allocation must be a non-negative number.");
    }
    const glCode = validateGlCodeForWrite_(input.glCode);

    const budgetSheet = ss.getSheetByName("Budgets");
    if (!budgetSheet) throw createConfigurationValidationError_("The Budgets sheet is unavailable.");
    ensureConfigurationAuditSheet_(ss);
    const schema = getBudgetConfigurationSchema_(budgetSheet, true);
    const data = budgetSheet.getDataRange().getValues();
    const originalRowIndex = originalName ? findConfigurationRow_(data, schema.departmentIndex, originalName) : -1;
    if (originalName && originalRowIndex < 1) {
      throw createConfigurationValidationError_("This department no longer exists. Reload the page and try again.");
    }
    if (originalName && isSystemBudgetDepartment_(originalName)) {
      throw createConfigurationValidationError_("The Wipro system department cannot be edited here.");
    }

    const duplicateIndex = findConfigurationRow_(data, schema.departmentIndex, department);
    if (duplicateIndex >= 1 && duplicateIndex !== originalRowIndex) {
      throw createConfigurationValidationError_("A department with that name already exists, including inactive departments.");
    }

    if (originalRowIndex < 1) {
      if (isSystemBudgetDepartment_(department)) {
        throw createConfigurationValidationError_("The Wipro system department cannot be created or replaced here.");
      }
      const rowNumber = budgetSheet.getLastRow() + 1;
      const rowValues = new Array(Math.max(budgetSheet.getLastColumn(), schema.activeIndex + 1)).fill("");
      rowValues[schema.departmentIndex] = department;
      rowValues[schema.totalIndex] = allocation;
      rowValues[schema.glCodeIndex] = glCode;
      rowValues[schema.activeIndex] = true;
      budgetSheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
      try {
        setNewBudgetFormulas_(ss, budgetSheet, schema, rowNumber);
      } catch (formulaError) {
        budgetSheet.getRange(rowNumber, 1, 1, rowValues.length).clearContent();
        SpreadsheetApp.flush();
        throw formulaError;
      }
      appendConfigurationAudit_(
        ss,
        user,
        "Department added",
        department,
        `Allocation £${allocation.toFixed(2)} · GL code ${glCode || "not set"}`
      );
      return { message: `${department} was added.` };
    }

    const rowNumber = originalRowIndex + 1;
    const existingRow = data[originalRowIndex];
    const existingName = (existingRow[schema.departmentIndex] || "").toString().trim();
    const existingAllocation = Number(existingRow[schema.totalIndex]) || 0;
    const existingGlCode = schema.glCodeIndex >= 0 ? (existingRow[schema.glCodeIndex] || "").toString().trim() : "";
    const details = [];
    let renamedDependencies = { userCount: 0, orderCount: 0, rollback: () => {} };

    if (normalizeConfigurationKey_(existingName) !== normalizeConfigurationKey_(department) || existingName !== department) {
      renamedDependencies = renameDepartmentReferences_(ss, existingName, department);
      details.push(
        `Renamed from ${existingName}; updated ${renamedDependencies.userCount} user assignment(s) and ${renamedDependencies.orderCount} order record(s)`
      );
    }
    if (existingAllocation !== allocation) {
      details.push(`Allocation changed from £${existingAllocation.toFixed(2)} to £${allocation.toFixed(2)}`);
    }
    if (existingGlCode !== glCode) {
      details.push(`GL code changed from ${existingGlCode || "not set"} to ${glCode || "not set"}`);
    }
    if (!details.length) {
      return { changed: false, message: "No department changes were needed." };
    }

    try {
      budgetSheet.getRange(rowNumber, schema.departmentIndex + 1).setValue(department);
      budgetSheet.getRange(rowNumber, schema.totalIndex + 1).setValue(allocation);
      budgetSheet.getRange(rowNumber, schema.glCodeIndex + 1).setValue(glCode);
      SpreadsheetApp.flush();
      appendConfigurationAudit_(ss, user, "Department edited", department, details.join(" · "));
    } catch (e) {
      budgetSheet.getRange(rowNumber, schema.departmentIndex + 1).setValue(existingName);
      budgetSheet.getRange(rowNumber, schema.totalIndex + 1).setValue(existingRow[schema.totalIndex]);
      budgetSheet.getRange(rowNumber, schema.glCodeIndex + 1).setValue(existingRow[schema.glCodeIndex]);
      renamedDependencies.rollback();
      SpreadsheetApp.flush();
      throw e;
    }
    return { message: `${department} was updated.` };
  }, payload && payload.expectedConfigurationRevision);
}

function setAdminBudgetActive(departmentName, shouldBeActive, expectedRevision) {
  return configurationWriteResponse_("setAdminBudgetActive", (ss, user) => {
    const department = normalizeDepartmentNameForWrite_(departmentName);
    if (!department) throw createConfigurationValidationError_("Choose a department.");
    if (isSystemBudgetDepartment_(department)) {
      throw createConfigurationValidationError_("The Wipro system department cannot be deactivated.");
    }

    const budgetSheet = ss.getSheetByName("Budgets");
    if (!budgetSheet) throw createConfigurationValidationError_("The Budgets sheet is unavailable.");
    ensureConfigurationAuditSheet_(ss);
    const schema = getBudgetConfigurationSchema_(budgetSheet, true);
    const data = budgetSheet.getDataRange().getValues();
    const rowIndex = findConfigurationRow_(data, schema.departmentIndex, department);
    if (rowIndex < 1) throw createConfigurationValidationError_("This department no longer exists.");

    const currentActive = isConfigurationActiveValue_(data[rowIndex][schema.activeIndex]);
    const nextActive = !!shouldBeActive;
    if (currentActive === nextActive) {
      return { changed: false, message: `${department} is already ${nextActive ? "active" : "inactive"}.` };
    }

    const dependencies = getDepartmentDependencies_(ss, department);
    if (!nextActive && dependencies.userCount > 0) {
      throw createConfigurationValidationError_(
        `${department} cannot be deactivated while ${dependencies.userCount} active user${dependencies.userCount === 1 ? " is" : "s are"} assigned to it.`
      );
    }
    if (!nextActive && dependencies.pendingOrderCount > 0) {
      throw createConfigurationValidationError_(
        `${department} cannot be deactivated while it has ${dependencies.pendingOrderCount} pending order${dependencies.pendingOrderCount === 1 ? "" : "s"}.`
      );
    }

    budgetSheet.getRange(rowIndex + 1, schema.activeIndex + 1).setValue(nextActive);
    const action = nextActive ? "Department reactivated" : "Department deactivated";
    const detail = nextActive
      ? "Department restored to user and ordering choices."
      : `${dependencies.orderCount} historical order record${dependencies.orderCount === 1 ? "" : "s"} retained.`;
    appendConfigurationAudit_(ss, user, action, department, detail);
    return { message: `${department} was ${nextActive ? "reactivated" : "deactivated"}.` };
  }, expectedRevision);
}

function normalizeUserConfigurationPayload_(ss, input) {
  const email = normalizeConfigurationKey_(input.email);
  if (!isValidConfigurationEmail_(email) || !email.endsWith("@claremontschool.co.uk")) {
    throw createConfigurationValidationError_("Use a valid @claremontschool.co.uk email address.");
  }

  const role = (input.role || "").toString().trim();
  if (![ROLE_ADMIN_, ROLE_STAFF_, ROLE_HEAD_, ROLE_WIPRO_].includes(role)) {
    throw createConfigurationValidationError_("Choose a valid role.");
  }

  const defaultSite = (input.defaultSite || "").toString().trim();
  if (!["Prep", "Senior"].includes(defaultSite)) {
    throw createConfigurationValidationError_("Choose a valid default site.");
  }

  const budgetSheet = ss.getSheetByName("Budgets");
  if (!budgetSheet) throw createConfigurationValidationError_("The Budgets sheet is unavailable.");
  const budgetSchema = getBudgetConfigurationSchema_(budgetSheet, true);
  const budgetData = budgetSheet.getDataRange().getValues();
  const activeDepartments = getActiveBudgetNameMap_(budgetData, budgetSchema);
  const submittedDepartments = Array.isArray(input.departments) ? input.departments : [];
  const departments = [];
  const seen = {};
  submittedDepartments.forEach(value => {
    const key = normalizeConfigurationKey_(value);
    if (key && !seen[key]) {
      seen[key] = true;
      if (!activeDepartments[key]) {
        throw createConfigurationValidationError_(`${value} is not an active department.`);
      }
      departments.push(activeDepartments[key]);
    }
  });

  const systemDepartment = Object.keys(activeDepartments)
    .map(key => activeDepartments[key])
    .find(name => isSystemBudgetDepartment_(name));
  if (role === ROLE_WIPRO_) {
    if (!systemDepartment) throw createConfigurationValidationError_("The Wipro system department is unavailable.");
    departments.length = 0;
    departments.push(systemDepartment);
  } else {
    const nonSystemDepartments = departments.filter(name => !isSystemBudgetDepartment_(name));
    departments.length = 0;
    nonSystemDepartments.forEach(name => departments.push(name));
  }

  if (!departments.length) throw createConfigurationValidationError_("Choose at least one active department.");
  const canUseAddOns = role === ROLE_STAFF_ || role === ROLE_HEAD_;
  if (canUseAddOns && input.canProcessOrders === true && input.canLogInvoices === true) {
    throw createConfigurationValidationError_("Choose either order processing or invoice logging, not both.");
  }
  return {
    processingDepartments: role === ROLE_WIPRO_ ? [] : [...new Set((input.processingDepartments || []).map(value => {
      const name = activeDepartments[normalizeConfigurationKey_(value)];
      if (!name || isSystemBudgetDepartment_(name)) throw createConfigurationValidationError_("Choose active processing budgets.");
      return name;
    }))],
    email: email,
    role: role,
    defaultSite: defaultSite,
    departments: departments,
    canProcessOrders: canUseAddOns && input.canProcessOrders === true,
    canLogInvoices: canUseAddOns && input.canLogInvoices === true
  };
}

function saveAdminUserConfiguration(payload) {
  return configurationWriteResponse_("saveAdminUserConfiguration", (ss, user) => {
    const input = payload && typeof payload === "object" ? payload : {};
    const normalized = normalizeUserConfigurationPayload_(ss, input);
    const originalEmail = normalizeConfigurationKey_(input.originalEmail);
    const userSheet = ss.getSheetByName("Users");
    if (!userSheet) throw createConfigurationValidationError_("The Users sheet is unavailable.");
    ensureConfigurationAuditSheet_(ss);
    const schema = getUserConfigurationSchema_(userSheet, true);
    const data = userSheet.getDataRange().getValues();
    const originalRowIndex = originalEmail ? findConfigurationRow_(data, schema.emailIndex, originalEmail) : -1;
    if (originalEmail && originalRowIndex < 1) {
      throw createConfigurationValidationError_("This user no longer exists. Reload the page and try again.");
    }
    const duplicateIndex = findConfigurationRow_(data, schema.emailIndex, normalized.email);
    if (duplicateIndex >= 1 && duplicateIndex !== originalRowIndex) {
      throw createConfigurationValidationError_("That user already exists, including inactive accounts.");
    }
    if (originalEmail && originalEmail !== normalized.email) {
      throw createConfigurationValidationError_("Existing email addresses cannot be renamed. Deactivate the old account and add the new address.");
    }

    if (originalRowIndex < 1) {
      const rowValues = new Array(Math.max(userSheet.getLastColumn(), schema.activeIndex + 1)).fill("");
      rowValues[schema.emailIndex] = normalized.email;
      rowValues[schema.departmentIndex] = normalized.departments.join(", ");
      rowValues[schema.roleIndex] = normalized.role;
      rowValues[schema.defaultSiteIndex] = normalized.defaultSite;
      rowValues[schema.simulationEmailIndex] = "";
      rowValues[schema.activeIndex] = true;
      rowValues[schema.canProcessOrdersIndex] = normalized.canProcessOrders;
      rowValues[schema.canLogInvoicesIndex] = normalized.canLogInvoices;
      rowValues[schema.processingDepartmentsIndex] = normalized.processingDepartments.join(", ");
      userSheet.getRange(userSheet.getLastRow() + 1, 1, 1, rowValues.length).setValues([rowValues]);
      appendConfigurationAudit_(
        ss,
        user,
        "User added",
        normalized.email,
        `${normalized.role} · ${normalized.departments.join(", ")} · ${normalized.defaultSite} · Process orders: ${normalized.canProcessOrders ? "Yes" : "No"} · Log invoices: ${normalized.canLogInvoices ? "Yes" : "No"}`
      );
      return { message: `${normalized.email} was added.` };
    }

    const existing = data[originalRowIndex];
    const existingRole = (existing[schema.roleIndex] || "").toString().trim();
    const existingSite = schema.defaultSiteIndex >= 0 ? (existing[schema.defaultSiteIndex] || "").toString().trim() : "";
    const existingDepartments = parseDepartmentList_(existing[schema.departmentIndex]);
    const existingCanProcessOrders = schema.canProcessOrdersIndex >= 0 && isConfigurationEnabledFlag_(existing[schema.canProcessOrdersIndex]);
    const existingCanLogInvoices = schema.canLogInvoicesIndex >= 0 && isConfigurationEnabledFlag_(existing[schema.canLogInvoicesIndex]);
    const isActive = schema.activeIndex < 0 || isConfigurationActiveValue_(existing[schema.activeIndex]);
    const actingEmail = normalizeConfigurationKey_(user.realEmail || user.email);
    if (normalized.email === actingEmail && normalized.role !== existingRole) {
      throw createConfigurationValidationError_("You cannot change the role of your own account.");
    }

    if (isActive && existingRole === ROLE_ADMIN_ && normalized.role !== ROLE_ADMIN_) {
      let activeAdminCount = 0;
      for (let i = 1; i < data.length; i++) {
        const rowActive = schema.activeIndex < 0 || isConfigurationActiveValue_(data[i][schema.activeIndex]);
        const rowEmail = normalizeConfigurationKey_(data[i][schema.emailIndex]);
        if (rowEmail && rowActive && (data[i][schema.roleIndex] || "").toString().trim() === ROLE_ADMIN_) activeAdminCount += 1;
      }
      if (activeAdminCount <= 1) {
        throw createConfigurationValidationError_("The final active Admin account cannot be changed to another role.");
      }
    }

    const oldKeys = {};
    const newKeys = {};
    existingDepartments.forEach(name => { oldKeys[normalizeConfigurationKey_(name)] = name; });
    normalized.departments.forEach(name => { newKeys[normalizeConfigurationKey_(name)] = name; });
    const added = normalized.departments.filter(name => !oldKeys[normalizeConfigurationKey_(name)]);
    const removed = existingDepartments.filter(name => !newKeys[normalizeConfigurationKey_(name)]);
    const auditEvents = [];
    if (existingRole !== normalized.role) {
      auditEvents.push(["User role changed", `${existingRole || "not set"} to ${normalized.role}`]);
    }
    if (existingSite !== normalized.defaultSite) {
      auditEvents.push(["User site changed", `${existingSite || "not set"} to ${normalized.defaultSite}`]);
    }
    if (added.length) auditEvents.push(["Department added to user", added.join(", ")]);
    if (removed.length) auditEvents.push(["Department removed from user", removed.join(", ")]);
    if (JSON.stringify(parseDepartmentList_(existing[schema.processingDepartmentsIndex])) !== JSON.stringify(normalized.processingDepartments)) {
      auditEvents.push(["Processing budgets changed", normalized.processingDepartments.join(", ") || "None"]);
    }
    if (existingCanProcessOrders !== normalized.canProcessOrders) {
      auditEvents.push(["Order processing permission changed", `${existingCanProcessOrders ? "Enabled" : "Disabled"} to ${normalized.canProcessOrders ? "Enabled" : "Disabled"}`]);
    }
    if (existingCanLogInvoices !== normalized.canLogInvoices) {
      auditEvents.push(["Invoice logging permission changed", `${existingCanLogInvoices ? "Enabled" : "Disabled"} to ${normalized.canLogInvoices ? "Enabled" : "Disabled"}`]);
    }
    if (!auditEvents.length) {
      return { changed: false, message: "No user changes were needed." };
    }

    const rowNumber = originalRowIndex + 1;
    userSheet.getRange(rowNumber, schema.departmentIndex + 1).setValue(normalized.departments.join(", "));
    userSheet.getRange(rowNumber, schema.roleIndex + 1).setValue(normalized.role);
    userSheet.getRange(rowNumber, schema.defaultSiteIndex + 1).setValue(normalized.defaultSite);
    userSheet.getRange(rowNumber, schema.canProcessOrdersIndex + 1).setValue(normalized.canProcessOrders);
    userSheet.getRange(rowNumber, schema.canLogInvoicesIndex + 1).setValue(normalized.canLogInvoices);
    userSheet.getRange(rowNumber, schema.processingDepartmentsIndex + 1).setValue(normalized.processingDepartments.join(", "));
    auditEvents.forEach(event => appendConfigurationAudit_(ss, user, event[0], normalized.email, event[1]));
    return { message: `${normalized.email} was updated.` };
  }, payload && payload.expectedConfigurationRevision);
}

function validateStoredUserForReactivation_(ss, row, schema) {
  return normalizeUserConfigurationPayload_(ss, {
    email: row[schema.emailIndex],
    role: row[schema.roleIndex],
    defaultSite: schema.defaultSiteIndex >= 0 ? row[schema.defaultSiteIndex] : "",
    departments: parseDepartmentList_(row[schema.departmentIndex])
  });
}

function setAdminUserActive(emailValue, shouldBeActive, expectedRevision) {
  return configurationWriteResponse_("setAdminUserActive", (ss, user) => {
    const email = normalizeConfigurationKey_(emailValue);
    if (!email) throw createConfigurationValidationError_("Choose a user.");
    const userSheet = ss.getSheetByName("Users");
    if (!userSheet) throw createConfigurationValidationError_("The Users sheet is unavailable.");
    ensureConfigurationAuditSheet_(ss);
    const schema = getUserConfigurationSchema_(userSheet, true);
    const data = userSheet.getDataRange().getValues();
    const rowIndex = findConfigurationRow_(data, schema.emailIndex, email);
    if (rowIndex < 1) throw createConfigurationValidationError_("This user no longer exists.");

    const currentActive = isConfigurationActiveValue_(data[rowIndex][schema.activeIndex]);
    const nextActive = !!shouldBeActive;
    if (currentActive === nextActive) {
      return { changed: false, message: `${email} is already ${nextActive ? "active" : "inactive"}.` };
    }
    const actingEmail = normalizeConfigurationKey_(user.realEmail || user.email);
    if (!nextActive && email === actingEmail) {
      throw createConfigurationValidationError_("You cannot deactivate your own account.");
    }

    const role = (data[rowIndex][schema.roleIndex] || "").toString().trim();
    if (!nextActive && role === ROLE_ADMIN_) {
      let activeAdminCount = 0;
      for (let i = 1; i < data.length; i++) {
        const rowActive = isConfigurationActiveValue_(data[i][schema.activeIndex]);
        const rowEmail = normalizeConfigurationKey_(data[i][schema.emailIndex]);
        if (rowEmail && rowActive && (data[i][schema.roleIndex] || "").toString().trim() === ROLE_ADMIN_) activeAdminCount += 1;
      }
      if (activeAdminCount <= 1) {
        throw createConfigurationValidationError_("The final active Admin account cannot be deactivated.");
      }
    }

    if (nextActive) validateStoredUserForReactivation_(ss, data[rowIndex], schema);
    userSheet.getRange(rowIndex + 1, schema.activeIndex + 1).setValue(nextActive);

    let clearedSimulationCount = 0;
    if (!nextActive && schema.simulationEmailIndex >= 0 && userSheet.getLastRow() > 1) {
      const simulationValues = userSheet
        .getRange(2, schema.simulationEmailIndex + 1, userSheet.getLastRow() - 1, 1)
        .getValues();
      simulationValues.forEach(row => {
        if (normalizeConfigurationKey_(row[0]) === email) {
          row[0] = "";
          clearedSimulationCount += 1;
        }
      });
      userSheet
        .getRange(2, schema.simulationEmailIndex + 1, simulationValues.length, 1)
        .setValues(simulationValues);
    }

    const action = nextActive ? "User reactivated" : "User deactivated";
    const details = nextActive
      ? "Portal access restored."
      : `Portal access removed.${clearedSimulationCount ? ` Cleared ${clearedSimulationCount} simulation assignment(s).` : ""}`;
    appendConfigurationAudit_(ss, user, action, email, details);
    return { message: `${email} was ${nextActive ? "reactivated" : "deactivated"}.` };
  }, expectedRevision);
}

function saveAdminSystemSettings(payload) {
  return configurationWriteResponse_("saveAdminSystemSettings", (ss, user) => {
    const input = payload && typeof payload === "object" ? payload : {};
    const financeEmail = (input.financeEmail || "").toString().trim().toLowerCase();
    if (!isValidConfigurationEmail_(financeEmail)) {
      throw createConfigurationValidationError_("Enter a valid finance notification email address.");
    }
    const configSheet = ss.getSheetByName("Config");
    if (!configSheet) throw createConfigurationValidationError_("The Config sheet is unavailable.");
    ensureConfigurationAuditSheet_(ss);
    const current = (configSheet.getRange("B2").getValue() || "").toString().trim().toLowerCase();
    if (current === financeEmail) {
      return { changed: false, message: "No system setting changes were needed." };
    }
    configSheet.getRange("B2").setValue(financeEmail.startsWith("=") ? "'" + financeEmail : financeEmail);
    appendConfigurationAudit_(
      ss,
      user,
      "Finance email changed",
      "Finance notification email",
      `${current || "not set"} to ${financeEmail}`
    );
    return { message: "Finance notification email was updated." };
  }, payload && payload.expectedConfigurationRevision);
}

function getBudgetSnapshot_(ss) {
  const startMs = nowMs_();
  const budgets = {};
  const budgetSheet = ss.getSheetByName("Budgets");
  if (budgetSheet) {
    const bData = budgetSheet.getDataRange().getValues();
    if (!bData.length) return budgets;
    const schema = getBudgetConfigurationSchema_(budgetSheet, false, bData[0]);
    for (let i = 1; i < bData.length; i++) {
      const department = (bData[i][schema.departmentIndex] || "").toString().trim();
      const isActive = schema.activeIndex < 0 || isConfigurationActiveValue_(bData[i][schema.activeIndex]);
      if (department && isActive) {
        const rawTotal = bData[i][schema.totalIndex];
        const rawSpent = bData[i][schema.spentIndex];
        const rawRemaining = bData[i][schema.remainingIndex];
        const calculationError = [rawTotal, rawSpent, rawRemaining].some(value =>
          isConfigurationFormulaErrorDisplay_(value) || !Number.isFinite(Number(value))
        );
        budgets[department] = {
          total: Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : 0,
          spent: Number.isFinite(Number(rawSpent)) ? Number(rawSpent) : 0,
          remaining: Number.isFinite(Number(rawRemaining)) ? Number(rawRemaining) : 0,
          hasCalculationError: calculationError,
          calculationError: calculationError ? "The budget calculation contains an invalid value in allocation, spent or remaining." : "",
          glCode: schema.glCodeIndex >= 0 ? (bData[i][schema.glCodeIndex] || "").toString().trim() : ""
        };
      }
    }
  }
  logPerfMetric_("getBudgetSnapshot", startMs, { rows: Object.keys(budgets).length });
  return budgets;
}

function clearBudgetCache_() {
  CacheService.getScriptCache().remove(portalStateKey_("budgets_data"));
}

function getBudgetGlCode_(budgets, dept) {
  if (!budgets || !dept || !budgets[dept]) return "";
  return (budgets[dept].glCode || "").toString().trim();
}

const ORDER_FIXED_COLUMN_COUNT_ = 20;
const ORDER_RECORD_TYPE_HEADER_ = "Record Type";
const ORDER_GL_CODE_HEADER_ = "GL Code";
const ORDER_INVOICE_NUMBER_HEADER_ = "Invoice Number";
const ORDER_PROCESSED_BY_HEADER_ = "Processed By";
const ORDER_FINANCE_PROCESSED_BY_HEADER_ = "Finance Processed By";
const ORDER_REPORTING_SITE_HEADER_ = "Reporting Site";
const ORDER_PAYMENT_METHOD_HEADER_ = "Payment Method";
const ORDER_CANCELLATION_HEADER_ = "Cancellation Details";

function getInvoiceVoidDetails_(row, columns) {
  const value = columns && columns.cancellationIndex >= 0 && row[columns.cancellationIndex];
  if (!value) return null;
  try {
    const details = JSON.parse(value);
    return ['Voided','Removed'].includes(details?.status) ? details : null;
  } catch (_) {
    return null;
  }
}

function isOrderCancelled_(row, columns) {
  const index = columns && columns.cancellationIndex;
  if (Number.isInteger(index) && index >= 0 && row[index]) return true;
  // Historical cancellations used this exact prefix and zeroed the final cost.
  return /^\s*CANCELLED\s+-\s+/i.test(String(row[6] || '')) && row[15] !== '' && row[15] != null && Number(row[15]) === 0;
}

function validateOrderPaymentMethod_(value, required) {
  const method = value == null ? '' : String(value).trim();
  if (!method && !required) return '';
  if (!['Credit card', 'Invoice / on account'].includes(method)) {
    throw createPortalValidationError_('Choose a payment method: Credit card or Invoice / on account.');
  }
  return method;
}

function getOrderPaymentMethod_(row, columns) {
  return columns.paymentMethodIndex >= 0 ? String(row[columns.paymentMethodIndex] || '') : '';
}
const ORDER_APPROVAL_STATUS_HEADER_ = "Approval Status";
const ORDER_APPROVAL_REVISION_HEADER_ = "Approval Revision";
const ORDER_APPROVED_BY_HEADER_ = "Approved By";
const ORDER_APPROVED_AT_HEADER_ = "Approved At";
const ORDER_SUBMITTED_BY_HEADER_ = "Submitted By";
const APPROVAL_NOT_REQUIRED_ = "NOT_REQUIRED";
const APPROVAL_AWAITING_ = "AWAITING_SIGNOFF";
const APPROVAL_APPROVED_ = "APPROVED";
const APPROVAL_QUERY_ = "QUERY_RAISED";
const ORDER_APPROVAL_AUDIT_SHEET_ = "Order Approval Audit";

// Retry reads only: replaying a submission or a column insertion could duplicate data.
function readOrdersHeaders_(sheet) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const lastColumn = Math.max(sheet.getLastColumn(), ORDER_FIXED_COLUMN_COUNT_);
      return { lastColumn: lastColumn, headers: sheet.getRange(1, 1, 1, lastColumn).getValues()[0] };
    } catch (error) {
      const message = String(error && error.message || error);
      if (attempt === 2 || !/Service Spreadsheets (?:failed|timed out) while accessing document/i.test(message)) throw error;
      Utilities.sleep(250 * Math.pow(2, attempt));
    }
  }
}

function ensureOrdersColumn_(sheet, headerName, options) {
  const opts = options || {};
  const { lastColumn, headers } = readOrdersHeaders_(sheet);
  let column = headers.indexOf(headerName) + 1;

  if (!column) {
    if (portalTransaction_) {
      column = lastColumn + 1;
      sheet.getRange(1, column).setValue(headerName);
      return column;
    }
    sheet.insertColumnAfter(lastColumn);
    column = lastColumn + 1;
    sheet.getRange(1, column)
      .setValue(headerName)
      .setFontWeight("bold")
      .setBackground(opts.background || "#f4cccc");
  }

  if (opts.hidden) {
    sheet.hideColumns(column);
  } else {
    try { sheet.showColumns(column); } catch (e) {}
  }

  return column;
}

function ensureOrdersMetadataColumns_(sheet) {
  let { lastColumn, headers } = readOrdersHeaders_(sheet);
  const metadataHeaders = {
    recordType: ORDER_RECORD_TYPE_HEADER_, glCode: ORDER_GL_CODE_HEADER_,
    invoiceNumber: ORDER_INVOICE_NUMBER_HEADER_, processedBy: ORDER_PROCESSED_BY_HEADER_, paymentMethod: ORDER_PAYMENT_METHOD_HEADER_,
    approvalStatus: ORDER_APPROVAL_STATUS_HEADER_, approvalRevision: ORDER_APPROVAL_REVISION_HEADER_,
    approvedBy: ORDER_APPROVED_BY_HEADER_, approvedAt: ORDER_APPROVED_AT_HEADER_,
    submittedBy: ORDER_SUBMITTED_BY_HEADER_
  };
  const existingColumns = { lastColumn: lastColumn };
  const complete = Object.keys(metadataHeaders).every(key => {
    const index = headers.indexOf(metadataHeaders[key]);
    existingColumns[key + "Index"] = index;
    existingColumns[key + "Column"] = index + 1;
    return index >= 0;
  });
  // Existing workbooks need only one header read; layout changes belong to migration.
  existingColumns.cancellationIndex = headers.indexOf(ORDER_CANCELLATION_HEADER_);
  existingColumns.returnIndex = headers.indexOf('Return and refund history');
  existingColumns.financeProcessedByIndex = headers.indexOf(ORDER_FINANCE_PROCESSED_BY_HEADER_);
  existingColumns.reportingSiteIndex = headers.indexOf(ORDER_REPORTING_SITE_HEADER_);
  existingColumns.financeProcessedByColumn = existingColumns.financeProcessedByIndex + 1;
  existingColumns.reportingSiteColumn = existingColumns.reportingSiteIndex + 1;
  if (complete) return existingColumns;
  let recordTypeColumn = headers.indexOf(ORDER_RECORD_TYPE_HEADER_) + 1;
  let glCodeColumn = headers.indexOf(ORDER_GL_CODE_HEADER_) + 1;

  if (!recordTypeColumn) {
    if (glCodeColumn && glCodeColumn > ORDER_FIXED_COLUMN_COUNT_) {
      sheet.insertColumnBefore(glCodeColumn);
      recordTypeColumn = glCodeColumn;
      glCodeColumn += 1;
    } else {
      sheet.insertColumnAfter(lastColumn);
      recordTypeColumn = lastColumn + 1;
    }
    sheet.getRange(1, recordTypeColumn)
      .setValue(ORDER_RECORD_TYPE_HEADER_)
      .setFontWeight("bold")
      .setBackground("#f4cccc");
  }

  sheet.hideColumns(recordTypeColumn);

  lastColumn = Math.max(sheet.getLastColumn(), recordTypeColumn);
  headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  glCodeColumn = headers.indexOf(ORDER_GL_CODE_HEADER_) + 1;

  if (!glCodeColumn) {
    sheet.insertColumnAfter(lastColumn);
    glCodeColumn = lastColumn + 1;
    sheet.getRange(1, glCodeColumn)
      .setValue(ORDER_GL_CODE_HEADER_)
      .setFontWeight("bold")
      .setBackground("#d9ead3");
  }

  try { sheet.showColumns(glCodeColumn); } catch (e) {}

  lastColumn = Math.max(sheet.getLastColumn(), recordTypeColumn, glCodeColumn);
  headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  let invoiceNumberColumn = headers.indexOf(ORDER_INVOICE_NUMBER_HEADER_) + 1;

  if (!invoiceNumberColumn) {
    sheet.insertColumnAfter(lastColumn);
    invoiceNumberColumn = lastColumn + 1;
    sheet.getRange(1, invoiceNumberColumn)
      .setValue(ORDER_INVOICE_NUMBER_HEADER_)
      .setFontWeight("bold")
      .setBackground("#fff2cc");
  }

  try { sheet.showColumns(invoiceNumberColumn); } catch (e) {}

  const processedByColumn = ensureOrdersColumn_(sheet, ORDER_PROCESSED_BY_HEADER_, { hidden: true });
  const approvalStatusColumn = ensureOrdersColumn_(sheet, ORDER_APPROVAL_STATUS_HEADER_, { hidden: true });
  const approvalRevisionColumn = ensureOrdersColumn_(sheet, ORDER_APPROVAL_REVISION_HEADER_, { hidden: true });
  const approvedByColumn = ensureOrdersColumn_(sheet, ORDER_APPROVED_BY_HEADER_, { hidden: true });
  const approvedAtColumn = ensureOrdersColumn_(sheet, ORDER_APPROVED_AT_HEADER_, { hidden: true });
  const submittedByColumn = ensureOrdersColumn_(sheet, ORDER_SUBMITTED_BY_HEADER_, { hidden: true });
  const paymentMethodColumn = ensureOrdersColumn_(sheet, ORDER_PAYMENT_METHOD_HEADER_, { hidden: true });

  return {
    recordTypeColumn: recordTypeColumn,
    recordTypeIndex: recordTypeColumn - 1,
    glCodeColumn: glCodeColumn,
    glCodeIndex: glCodeColumn - 1,
    invoiceNumberColumn: invoiceNumberColumn,
    invoiceNumberIndex: invoiceNumberColumn - 1,
    processedByColumn: processedByColumn,
    processedByIndex: processedByColumn - 1,
    approvalStatusColumn: approvalStatusColumn,
    approvalStatusIndex: approvalStatusColumn - 1,
    approvalRevisionColumn: approvalRevisionColumn,
    approvalRevisionIndex: approvalRevisionColumn - 1,
    approvedByColumn: approvedByColumn,
    approvedByIndex: approvedByColumn - 1,
    approvedAtColumn: approvedAtColumn,
    approvedAtIndex: approvedAtColumn - 1,
    submittedByColumn: submittedByColumn,
    submittedByIndex: submittedByColumn - 1,
    paymentMethodColumn: paymentMethodColumn,
    paymentMethodIndex: paymentMethodColumn - 1,
    returnIndex: headers.indexOf('Return and refund history'),
    cancellationIndex: headers.indexOf(ORDER_CANCELLATION_HEADER_),
    financeProcessedByIndex: existingColumns.financeProcessedByIndex,
    reportingSiteIndex: existingColumns.reportingSiteIndex,
    financeProcessedByColumn: existingColumns.financeProcessedByColumn,
    reportingSiteColumn: existingColumns.reportingSiteColumn,
    lastColumn: Math.max(sheet.getLastColumn(), recordTypeColumn, glCodeColumn, invoiceNumberColumn, processedByColumn, approvalStatusColumn, approvalRevisionColumn, approvedByColumn, approvedAtColumn, submittedByColumn, paymentMethodColumn)
  };
}

function ensureOrdersRecordTypeColumn_(sheet) {
  return ensureOrdersMetadataColumns_(sheet).recordTypeColumn;
}

function getOrdersMetadataColumnsForRead_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), ORDER_FIXED_COLUMN_COUNT_);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const recordTypeIndex = headers.indexOf(ORDER_RECORD_TYPE_HEADER_);
  const glCodeIndex = headers.indexOf(ORDER_GL_CODE_HEADER_);
  const invoiceNumberIndex = headers.indexOf(ORDER_INVOICE_NUMBER_HEADER_);
  const processedByIndex = headers.indexOf(ORDER_PROCESSED_BY_HEADER_);
  const approvalStatusIndex = headers.indexOf(ORDER_APPROVAL_STATUS_HEADER_);
  const approvalRevisionIndex = headers.indexOf(ORDER_APPROVAL_REVISION_HEADER_);
  const approvedByIndex = headers.indexOf(ORDER_APPROVED_BY_HEADER_);
  const approvedAtIndex = headers.indexOf(ORDER_APPROVED_AT_HEADER_);
  const submittedByIndex = headers.indexOf(ORDER_SUBMITTED_BY_HEADER_);
  return {
    recordTypeIndex: recordTypeIndex >= 0 ? recordTypeIndex : ORDER_FIXED_COLUMN_COUNT_,
    glCodeIndex: glCodeIndex >= 0 ? glCodeIndex : -1,
    invoiceNumberIndex: invoiceNumberIndex >= 0 ? invoiceNumberIndex : -1,
    processedByIndex: processedByIndex >= 0 ? processedByIndex : -1,
    approvalStatusIndex: approvalStatusIndex >= 0 ? approvalStatusIndex : -1,
    approvalRevisionIndex: approvalRevisionIndex >= 0 ? approvalRevisionIndex : -1,
    approvedByIndex: approvedByIndex >= 0 ? approvedByIndex : -1,
    approvedAtIndex: approvedAtIndex >= 0 ? approvedAtIndex : -1,
    submittedByIndex: submittedByIndex,
    paymentMethodIndex: headers.indexOf(ORDER_PAYMENT_METHOD_HEADER_),
    financeProcessedByIndex: headers.indexOf(ORDER_FINANCE_PROCESSED_BY_HEADER_),
    reportingSiteIndex: headers.indexOf(ORDER_REPORTING_SITE_HEADER_),
    returnIndex: headers.indexOf('Return and refund history'),
    cancellationIndex: headers.indexOf(ORDER_CANCELLATION_HEADER_),
    lastColumn: lastColumn
  };
}

function appendOrderRow_(sheet, rowValues, recordType, glCode, invoiceNumber, submittedBy, paymentMethod, reportingSite) {
  const columns = ensureOrdersMetadataColumns_(sheet);
  const site = normalizeOrderReportingSite_(reportingSite);
  if (site && !columns.reportingSiteColumn) {
    columns.reportingSiteColumn = ensureOrdersColumn_(sheet, ORDER_REPORTING_SITE_HEADER_, {hidden:true});
    columns.reportingSiteIndex = columns.reportingSiteColumn - 1;
    columns.lastColumn = Math.max(columns.lastColumn, columns.reportingSiteColumn);
  }
  const finalRow = rowValues.slice();
  while (finalRow.length < columns.lastColumn) finalRow.push("");
  finalRow[columns.recordTypeIndex] = recordType || "Order";
  finalRow[columns.glCodeIndex] = glCode || "";
  finalRow[columns.invoiceNumberIndex] = invoiceNumber || "";
  finalRow[columns.processedByIndex] = "";
  finalRow[columns.approvalStatusIndex] = APPROVAL_NOT_REQUIRED_;
  finalRow[columns.approvalRevisionIndex] = 0;
  finalRow[columns.approvedByIndex] = "";
  finalRow[columns.approvedAtIndex] = "";
  finalRow[columns.submittedByIndex] = submittedBy || rowValues[3] || "";
  finalRow[columns.paymentMethodIndex] = paymentMethod || "";
  if (site) finalRow[columns.reportingSiteIndex] = site;
  sheet.appendRow(finalRow);
  return { row: finalRow, rowNumber: sheet.getLastRow(), columns: columns };
}

function normalizeOrderReportingSite_(value) {
  const site = String(value || '').trim().toLowerCase();
  return ['Prep','Senior','Whole school','Unassigned'].find(option => option.toLowerCase() === site) || '';
}

function getOrderReportingSite_(row, columns) {
  const stored = normalizeOrderReportingSite_(row[columns.reportingSiteIndex]);
  const legacyLocation = normalizeOrderReportingSite_(row[11]);
  return stored || (['Prep','Senior'].includes(legacyLocation) ? legacyLocation : '');
}

function validateOrderReportingSite_(value) {
  const site = normalizeOrderReportingSite_(value);
  if (!site) throw createPortalValidationError_('Choose Prep, Senior, Whole school or Unassigned for the reporting site.', 'INVALID_REPORTING_SITE');
  return site;
}

function getOrderSubmittedBy_(row, columns) {
  const index = columns && Number.isInteger(columns.submittedByIndex) ? columns.submittedByIndex : -1;
  return (index >= 0 && row[index]) || row[3] || "";
}

function getOrderRecordType_(row, recordTypeIndex) {
  const idx = Number.isInteger(recordTypeIndex) ? recordTypeIndex : 20;
  return row[idx] || "Order";
}

function getOrderInvoiceNumber_(row, recordType, invoiceNumberIndex) {
  const storedValue = Number.isInteger(invoiceNumberIndex) && invoiceNumberIndex >= 0
    ? row[invoiceNumberIndex]
    : "";
  if (storedValue !== "" && storedValue != null) return storedValue;
  return recordType === "Invoice" ? (row[7] || "") : "";
}

function getOrderApprovalStatus_(row, columns) {
  const index = columns && Number.isInteger(columns.approvalStatusIndex) ? columns.approvalStatusIndex : -1;
  const stored = index >= 0 ? (row[index] || "").toString().trim() : "";
  return [APPROVAL_AWAITING_, APPROVAL_APPROVED_, APPROVAL_QUERY_].includes(stored)
    ? stored
    : APPROVAL_NOT_REQUIRED_;
}

function canEditPendingRequest_(user, row, columns) {
  if (user.isPreview || getOrderRecordType_(row, columns.recordTypeIndex) !== 'Order' || isOrderCompleted_(row) || isOrderCancelled_(row, columns)) return false;
  if (canProcessOrderRecord_(user, row[1], 'Order')) return true;
  const actor = normalizeConfigurationKey_(user.email);
  return isStaffLikeRole_(user.role) && hasDepartmentAccess_(user, row[1]) &&
    [row[3],getOrderSubmittedBy_(row, columns)].some(value => normalizeConfigurationKey_(value) === actor);
}

function canCancelPurchase_(user, row, columns) {
  return !user.isPreview && !!user.capabilities.canCancelOrders &&
    (user.capabilities.canViewAllFinanceData || (user.depts || []).includes(row[1])) &&
    canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex)) &&
    getOrderRecordType_(row,columns.recordTypeIndex) !== 'Transfer' && !isOrderCompleted_(row) && !isOrderCancelled_(row,columns);
}

function canRemoveInvoiceRecord_(user, row, columns, returnInfo) {
  const admin = user.role === ROLE_ADMIN_ && user.realRole === ROLE_ADMIN_;
  return !user.isPreview && !user.isSimulated &&
    getOrderRecordType_(row, columns.recordTypeIndex) === 'Invoice' &&
    !isOrderCancelled_(row, columns) && !isSystemBudgetDepartment_(row[1]) &&
    Number.isFinite(invoiceRecordedAmount_(row)) &&
    (admin || canCancelPurchase_(user, row, columns)) &&
    !returnInfo.pending && !returnInfo.parentId && !returnInfo.refunds.length;
}

function canVoidDuplicateInvoice_(user, row, columns, returnInfo) {
  return user.role === ROLE_ADMIN_ && user.realRole === ROLE_ADMIN_ && !user.isPreview && !user.isSimulated &&
    isProcessedInvoiceForDuplicateCheck_(row, columns) &&
    !!normalizeConfigurationKey_(getOrderInvoiceNumber_(row, 'Invoice', columns.invoiceNumberIndex)) &&
    !returnInfo.pending && !returnInfo.parentId && !returnInfo.refunds.length;
}

function isProcessedInvoiceForDuplicateCheck_(row, columns) {
  return getOrderRecordType_(row, columns.recordTypeIndex) === 'Invoice' &&
    isOrderCompleted_(row) && !isOrderCancelled_(row, columns) &&
    !isSystemBudgetDepartment_(row[1]) && Number.isFinite(invoiceRecordedAmount_(row)) && invoiceRecordedAmount_(row) > 0;
}

function invoiceRecordedAmount_(row) {
  return Number(row[15] === '' || row[15] == null ? row[10] : row[15]);
}

function canAddPurchaseNote_(user,row,columns) {
  return !user.isPreview && !!user.capabilities.canAddNotes && hasDepartmentAccess_(user,row[1]) &&
    canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex));
}

function canAddOrderEvidence_(user,row,columns) {
  return !user.isPreview && getOrderRecordType_(row,columns.recordTypeIndex) === 'Order' &&
    !isOrderCancelled_(row,columns) && canProcessOrderRecord_(user,row[1],'Order');
}

function canEditPurchaseReportingSite_(user,row,columns,returnInfo) {
  if (user.isPreview || !user.capabilities.canViewAllFinanceData || isOrderCancelled_(row,columns)) return false;
  const type = getOrderRecordType_(row,columns.recordTypeIndex);
  return (type === 'Invoice' || (type === 'Order' && isOrderCompleted_(row))) &&
    !(returnInfo || getOrderReturnInfo_(row,columns)).parentId;
}

function getOrderRecordActions_(user, row, columns) {
  const recordType = getOrderRecordType_(row, columns.recordTypeIndex);
  const returnInfo = getOrderReturnInfo_(row, columns);
  const refundLocked = !!(returnInfo.parentId || (returnInfo.refunds || []).length);
  const returnActions = getOrderReturnActions_(user, row, columns);
  const pending = !isOrderCompleted_(row) && !isOrderCancelled_(row, columns);
  const canProcess = pending && canProcessOrderRecord_(user, row[1], recordType);
  const status = getOrderApprovalStatus_(row, columns);
  const actor = normalizeConfigurationKey_(user.isSimulated && isDevelopmentRuntime_()
    ? user.email
    : (user.realEmail || user.email));
  const requester = normalizeConfigurationKey_(row[3]);
  const processor = columns.processedByIndex >= 0 ? normalizeConfigurationKey_(row[columns.processedByIndex]) : "";
  const canApprove = !isOrderCancelled_(row, columns) && ["Order", "Invoice"].includes(recordType) && canReviewPurchaseDepartment_(user, row[1], recordType) && [APPROVAL_AWAITING_, APPROVAL_QUERY_].includes(status) &&
    !!user.capabilities.canApproveOrders && actor && (user.role === ROLE_ADMIN_ ||
      (actor !== requester && actor !== processor && actor !== normalizeConfigurationKey_(getOrderSubmittedBy_(row, columns)))) &&
    (!user.isSimulated || isDevelopmentRuntime_());
  const actions = {
    canMarkReturn: returnActions.canMarkReturn,
    canRefund: returnActions.canRefund,
    canReverseRefund: !!returnActions.canReverseRefund,
    canCancel: canCancelPurchase_(user,row,columns),
    canRemoveInvoiceRecord: canRemoveInvoiceRecord_(user, row, columns, returnInfo),
    canVoidDuplicateInvoice: canVoidDuplicateInvoice_(user, row, columns, returnInfo),
    canAddNote: canAddPurchaseNote_(user,row,columns),
    canAddEvidence: canAddOrderEvidence_(user,row,columns),
    canEditReportingSite: canEditPurchaseReportingSite_(user,row,columns,returnInfo),
    canEditInvoice: !refundLocked && user.role === ROLE_ADMIN_ && recordType === 'Invoice' && !isOrderCancelled_(row, columns),
    canEdit: canEditPendingRequest_(user,row,columns),
    canMoveDepartment: canEditPendingRequest_(user,row,columns),
    canProcess: canProcess,
    canCorrect: !refundLocked && !isOrderCancelled_(row, columns) && ((!pending && recordType === "Order" && canProcessOrderRecord_(user, row[1], recordType)) ||
      (!user.capabilities.canViewAllFinanceData && canCorrectInvoice_(user, row, columns))),
    canViewApprovalHistory: canViewOrderApprovalHistory_(user,row,columns),
    canApprove: canApprove,
    canRaiseQuery: canApprove,
    canResubmit: !isOrderCancelled_(row, columns) && ["Order", "Invoice"].includes(recordType) && status === APPROVAL_QUERY_ &&
      canReviewPurchaseDepartment_(user, row[1], recordType) && (actor === processor || user.role === ROLE_ADMIN_)
  };
  if (user.isPreview) Object.keys(actions).forEach(key => { if (key !== 'canViewApprovalHistory') actions[key] = false; });
  return actions;
}

function isOrderCompleted_(row) {
  return !!(row[15] || row[13] || row[14]);
}

function getOrderStatusLabel_(row, recordType, columns) {
  if (isOrderCancelled_(row, columns)) return getInvoiceVoidDetails_(row, columns)?.status || 'Cancelled';
  if (!isOrderCompleted_(row)) return "Pending";
  return (recordType || getOrderRecordType_(row)) === "Invoice" ? "Processed" : "Ordered";
}

function isInactiveOrderStatus_(status) {
  return ['Cancelled','Voided','Removed'].includes(status);
}

const AUTH_ERROR_CODE_ = "AUTH_UNAUTHORIZED";
const ROLE_ADMIN_ = "Admin";
const ROLE_STAFF_ = "Staff";
const ROLE_WIPRO_ = "Wipro";
const ROLE_HEAD_ = "Head";
const SIMULATABLE_ROLES_ = [ROLE_STAFF_, ROLE_WIPRO_, ROLE_HEAD_];
const SYSTEM_BUDGET_DEPARTMENTS_ = [ROLE_WIPRO_];

function normalizeRoleText_(value) {
  return (value || "").toString().trim().toLowerCase();
}

function isWiproMarker_(value) {
  return normalizeRoleText_(value).includes("wipro");
}

function isStaffRole_(role) {
  return normalizeRoleText_(role) === ROLE_STAFF_.toLowerCase();
}

function isHeadRole_(role) {
  return normalizeRoleText_(role) === ROLE_HEAD_.toLowerCase();
}

function isStaffLikeRole_(role) {
  return isStaffRole_(role) || isHeadRole_(role);
}

function isSimulatableUserRow_(row, schema) {
  const userSchema = schema || { emailIndex: 0, departmentIndex: 1, roleIndex: 2, activeIndex: -1 };
  if (userSchema.activeIndex >= 0 && !isConfigurationActiveValue_(row[userSchema.activeIndex])) return false;
  const email = row && row[userSchema.emailIndex] ? row[userSchema.emailIndex].toString() : "";
  const dept = row && row[userSchema.departmentIndex] ? row[userSchema.departmentIndex].toString() : "";
  const role = row && row[userSchema.roleIndex] ? row[userSchema.roleIndex].toString() : "";
  return (role === ROLE_ADMIN_ && isDevelopmentRuntime_()) || isStaffLikeRole_(role) || isWiproMarker_(role) || isWiproMarker_(dept) || isWiproMarker_(email);
}

function isSystemBudgetDepartment_(dept) {
  return isWiproMarker_(dept) || SYSTEM_BUDGET_DEPARTMENTS_.some(d => d.toLowerCase() === normalizeRoleText_(dept));
}

function filterVisibleBudgets_(budgets) {
  const visible = {};
  Object.keys(budgets || {}).forEach(dept => {
    if (!isSystemBudgetDepartment_(dept)) visible[dept] = budgets[dept];
  });
  return visible;
}

function getUserCapabilities_(user) {
  const role = (user && user.role ? user.role : "").toString().trim();
  const realRole = (user && user.realRole ? user.realRole : "").toString().trim();
  const isSimulated = !!(user && user.isSimulated);
  const isAdmin = role === ROLE_ADMIN_;
  const isStaff = role === ROLE_STAFF_;
  const isWipro = role === ROLE_WIPRO_;
  const isHead = role === ROLE_HEAD_;
  const isStaffLike = isStaff || isHead;
  const isFinanceOperator = isAdmin || isWipro;
  const hasOrderProcessingPermission = isStaffLike && !!(user && user.canProcessOrders);
  const hasInvoiceLoggingPermission = isStaffLike && !hasOrderProcessingPermission && !!(user && user.canLogInvoices);
  const hasDepartmentProcessingPermission = !isWipro && (user.processingDepartments || []).length > 0;
  const isKnownRole = isAdmin || isStaff || isWipro || isHead;
  const isRealAdminLive = realRole === ROLE_ADMIN_ && !isSimulated;

  return {
    isKnownRole: isKnownRole,
    canViewAllFinanceData: isFinanceOperator,
    canViewAllOrderData: isFinanceOperator || hasOrderProcessingPermission,
    canViewDepartmentData: isStaffLike || isFinanceOperator,
    canUseAllDepartmentView: isFinanceOperator,
    canAccessFinanceDashboard: isFinanceOperator || isHead,
    canManageOrders: isFinanceOperator || hasOrderProcessingPermission || hasDepartmentProcessingPermission,
    canEditExistingOrders: isFinanceOperator || isStaffLike || hasOrderProcessingPermission || hasDepartmentProcessingPermission,
    canBulkUpdateOrders: isFinanceOperator || hasOrderProcessingPermission || hasDepartmentProcessingPermission,
    canLogInvoice: isFinanceOperator || hasInvoiceLoggingPermission || hasDepartmentProcessingPermission,
    canApproveOrders: isAdmin || hasOrderProcessingPermission || hasDepartmentProcessingPermission,
    hasDepartmentProcessingPermission: hasDepartmentProcessingPermission,
    processingDepartments: isWipro ? [] : (user.processingDepartments || []).slice(),
    hasExplicitOrderProcessingPermission: hasOrderProcessingPermission,
    hasExplicitInvoiceLoggingPermission: hasInvoiceLoggingPermission,
    canAddNotes: isKnownRole,
    canAddFinanceNotes: isFinanceOperator,
    canCreateRequests: isAdmin || isStaffLike,
    canDuplicateRequests: isAdmin || isStaffLike,
    canCancelOrders: isAdmin || isStaffLike,
    canExportCurrentView: isKnownRole,
    canExportFullReport: isRealAdminLive,
    canUseBudgetTransfer: isRealAdminLive,
    canOpenMasterSheet: isRealAdminLive,
    canManageConfiguration: isRealAdminLive,
    canUseSimulation: isRealAdminLive,
    canAutoRefreshFinance: isFinanceOperator && !isSimulated
  };
}

function attachCapabilities_(user) {
  user.capabilities = getUserCapabilities_(user);
  if (user.isPreview) {
    // Form visibility is separate from permission to submit an order or invoice.
    const { canCreateRequests, canLogInvoice, canManageOrders } = user.capabilities;
    user.previewEntryForms = { canCreateRequests, canLogInvoice, canManageOrders };
    ['canManageOrders','canEditExistingOrders','canBulkUpdateOrders','canLogInvoice','canApproveOrders','canAddNotes','canAddFinanceNotes','canCreateRequests','canDuplicateRequests','canCancelOrders','canUseBudgetTransfer','canOpenMasterSheet','canManageConfiguration','canAutoRefreshFinance'].forEach(key => user.capabilities[key] = false);
  }
  return user;
}

function hasDepartmentAccess_(user, dept) {
  const capabilities = user.capabilities || getUserCapabilities_(user);
  if (capabilities.canViewAllFinanceData) return true;
  return !!(capabilities.canViewDepartmentData && (user.depts || []).includes(dept));
}

function hasProcessingDepartment_(user, dept) {
  return user.role !== ROLE_WIPRO_ && (user.processingDepartments || []).includes(dept);
}

function canLogInvoiceDepartment_(user, dept) {
  return !!(user.capabilities.canViewAllFinanceData || hasProcessingDepartment_(user, dept) ||
    (user.capabilities.hasExplicitInvoiceLoggingPermission && (user.depts || []).includes(dept)));
}

function canReviewPurchaseDepartment_(user, dept, type) {
  return !!(user.role === ROLE_ADMIN_ || hasProcessingDepartment_(user, dept) ||
    (type === "Order" && user.capabilities.hasExplicitOrderProcessingPermission));
}

function canAccessPrivateReviewHistory_(user) {
  const capabilities = user.isPreview ? getUserCapabilities_(user) : user.capabilities;
  return !!(capabilities.canApproveOrders || capabilities.hasExplicitOrderProcessingPermission);
}

function canViewOrderApprovalHistory_(user,row,columns) {
  return !!row && canAccessPrivateReviewHistory_(user) &&
    canReviewPurchaseDepartment_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex));
}

function canCorrectInvoice_(user, row, columns) {
  return getOrderRecordType_(row, columns.recordTypeIndex) === "Invoice" &&
    getOrderApprovalStatus_(row, columns) !== APPROVAL_NOT_REQUIRED_ && hasProcessingDepartment_(user, row[1]);
}

function canViewOrderRecord_(user, dept, recordType) {
  const type = (recordType || "Order").toString();
  const capabilities = user.capabilities || getUserCapabilities_(user);
  if (capabilities.canViewAllFinanceData) return true;
  if (["Order", "Invoice"].includes(type) && hasProcessingDepartment_(user, dept)) return true;
  if (type === "Invoice" && capabilities.hasExplicitOrderProcessingPermission) return false;
  if (type === "Order" && capabilities.canViewAllOrderData) return true;
  return hasDepartmentAccess_(user, dept);
}

function canProcessOrderRecord_(user, dept, recordType) {
  const type = (recordType || "Order").toString();
  if (type !== "Order") return !!(user.capabilities && user.capabilities.canViewAllFinanceData);
  if (!user.capabilities || !user.capabilities.canManageOrders) return false;
  if (user.capabilities.canViewAllFinanceData) return true;
  return !!user.capabilities.hasExplicitOrderProcessingPermission || hasProcessingDepartment_(user, dept);
}

function requireCapability_(user, capability, message, reason) {
  const capabilities = user.capabilities || getUserCapabilities_(user);
  if (!capabilities[capability]) {
    throw createAuthError_(
      message || "Access denied. You do not have permission to perform this action.",
      reason || ("missing_capability_" + capability),
      { realEmail: user.realEmail || "", role: user.role || "", isSimulated: !!user.isSimulated }
    );
  }
}

function getIdentityMarkers_() {
  let activeEmail = "";
  let effectiveEmail = "";
  try { activeEmail = (Session.getActiveUser().getEmail() || "").toString().trim().toLowerCase(); } catch (e) {}
  try { effectiveEmail = (Session.getEffectiveUser().getEmail() || "").toString().trim().toLowerCase(); } catch (e) {}
  return {
    timestamp: new Date().toISOString(),
    activeEmail: activeEmail,
    effectiveEmail: effectiveEmail
  };
}

function logAuthDenial_(reason, extra) {
  const payload = extra || {};
  payload.reason = reason || "unknown";
  const markers = getIdentityMarkers_();
  payload.timestamp = markers.timestamp;
  payload.activeEmail = markers.activeEmail;
  payload.effectiveEmail = markers.effectiveEmail;
  console.warn("[AUTH_DENY] " + JSON.stringify(payload));
}

function createAuthError_(message, reason, extra) {
  logAuthDenial_(reason, extra);
  const err = new Error(message);
  err.isAuthError = true;
  err.authCode = AUTH_ERROR_CODE_;
  err.userMessage = message;
  return err;
}

function isAuthError_(e) {
  return !!(e && (e.isAuthError || e.authCode === AUTH_ERROR_CODE_));
}

function parseDepartmentList_(rawDept) {
  const raw = rawDept === null || rawDept === undefined ? "" : rawDept.toString();
  if (!raw.trim()) return [];

  let values;
  try {
    const rows = Utilities.parseCsv(raw);
    values = [];
    rows.forEach(row => row.forEach(value => values.push(value)));
  } catch (e) {
    values = raw.split(",");
  }

  const seen = {};
  const departments = [];
  values.forEach(value => {
    const dept = (value || "").toString().trim();
    if (dept && !seen[dept]) {
      seen[dept] = true;
      departments.push(dept);
    }
  });
  return departments;
}

function getAuthorizedUserContext_(spreadsheet) {
  portalAssertExecutionAccount_();
  const markers = getIdentityMarkers_();
  const realEmail = markers.activeEmail;

  if (!realEmail) {
    throw createAuthError_(
      "Access denied. Your account could not be identified. Please contact IT.",
      "active_user_email_blank",
      { effectiveEmail: markers.effectiveEmail }
    );
  }

  const ss = spreadsheet || getPortalSpreadsheet_();
  const userSheet = ss.getSheetByName("Users");
  if (!userSheet) {
    throw createAuthError_(
      "Access denied. User access list is unavailable. Please contact IT.",
      "users_sheet_missing",
      { realEmail: realEmail }
    );
  }

  const data = userSheet.getDataRange().getValues();
  const schema = getUserConfigurationSchema_(userSheet, false, data[0]);
  let matchedRow = null;
  for (let i = 1; i < data.length; i++) {
    const listedEmail = data[i][schema.emailIndex] ? data[i][schema.emailIndex].toString().trim().toLowerCase() : "";
    if (listedEmail && listedEmail === realEmail) {
      matchedRow = data[i];
      break;
    }
  }

  if (!matchedRow) {
    throw createAuthError_(
      "Access denied. Your account is not authorized for this portal. Please contact IT.",
      "user_not_mapped",
      { realEmail: realEmail }
    );
  }

  if (schema.activeIndex >= 0 && !isConfigurationActiveValue_(matchedRow[schema.activeIndex])) {
    throw createAuthError_(
      "Access denied. Your portal account is inactive. Please contact IT.",
      "user_inactive",
      { realEmail: realEmail }
    );
  }

  const rawDept = (matchedRow[schema.departmentIndex] || "").toString();
  const depts = parseDepartmentList_(rawDept);
  if (!depts.length) {
    throw createAuthError_(
      "Access denied. Your account has no department mapping. Please contact IT.",
      "user_no_departments",
      { realEmail: realEmail }
    );
  }

  const role = (matchedRow[schema.roleIndex] || "").toString().trim();
  if (!role || role === "None") {
    throw createAuthError_(
      "Access denied. Your account role is not configured. Please contact IT.",
      "user_role_missing",
      { realEmail: realEmail }
    );
  }

  const user = {
    realEmail: realEmail,
    email: realEmail,
    dept: depts[0],
    depts: depts,
    role: role,
    realRole: role,
    defaultSite: schema.defaultSiteIndex >= 0 ? (matchedRow[schema.defaultSiteIndex] || "").toString() : "",
    processingDepartments: schema.processingDepartmentsIndex >= 0 ? parseDepartmentList_(matchedRow[schema.processingDepartmentsIndex]) : [],
    canProcessOrders: schema.canProcessOrdersIndex >= 0 && isConfigurationEnabledFlag_(matchedRow[schema.canProcessOrdersIndex]),
    canLogInvoices: schema.canLogInvoicesIndex >= 0 && isConfigurationEnabledFlag_(matchedRow[schema.canLogInvoicesIndex]),
    isSimulated: false
  };

  const viewContext = portalViewContext_;
  const simulationEmail = viewContext ? String(viewContext.email || '').trim().toLowerCase() : '';
  if (simulationEmail) {
    if (user.realRole !== ROLE_ADMIN_) throw createAuthError_('Only an administrator may preview another account.','preview_not_admin');
    if (!['preview','test'].includes(viewContext.mode)) throw createAuthError_('The view context is invalid. Exit preview and reload.','invalid_view_context');
    if (viewContext.mode === 'test' && (!isDevelopmentRuntime_() || !simulationEmail.startsWith('dev-ux-'))) throw createAuthError_('DEV test actors are available only for synthetic DEV accounts.','invalid_test_actor');
    for (let i = 1; i < data.length; i++) {
      const listedEmail = data[i][schema.emailIndex] ? data[i][schema.emailIndex].toString().trim().toLowerCase() : "";
      if (listedEmail === simulationEmail && isSimulatableUserRow_(data[i], schema)) {
        const simulatedDepts = parseDepartmentList_(data[i][schema.departmentIndex]);
        if (!simulatedDepts.length) break;
        user.email = simulationEmail;
        user.depts = simulatedDepts;
        user.dept = simulatedDepts[0];
        user.role = (data[i][schema.roleIndex] || "None").toString().trim();
        user.defaultSite = schema.defaultSiteIndex >= 0 ? (data[i][schema.defaultSiteIndex] || "").toString() : "";
        user.processingDepartments = schema.processingDepartmentsIndex >= 0 ? parseDepartmentList_(data[i][schema.processingDepartmentsIndex]) : [];
        user.canProcessOrders = schema.canProcessOrdersIndex >= 0 && isConfigurationEnabledFlag_(data[i][schema.canProcessOrdersIndex]);
        user.canLogInvoices = schema.canLogInvoicesIndex >= 0 && isConfigurationEnabledFlag_(data[i][schema.canLogInvoicesIndex]);
        user.isSimulated = true;
        user.isPreview = viewContext.mode === 'preview';
        user.isDevTest = viewContext.mode === 'test';
        break;
      }
    }
    if (!user.isSimulated) throw createAuthError_('This preview account is no longer available. Exit preview and reload.','preview_target_unavailable');
  }

  attachCapabilities_(user);
  // Reuse the Users rows already read for authentication; no extra spreadsheet call.
  user.requesterChoices = buildRequesterChoices_(user, data, schema);
  return user;
}

function buildRequesterChoices_(user, rows, schema) {
  const choices = {};
  if (!(user.previewEntryForms || user.capabilities).canCreateRequests) return choices;
  const ownEmail = normalizeConfigurationKey_(user.email);
  const ownDepartments = new Set((user.depts || []).map(normalizeConfigurationKey_));
  const seen = new Set();
  rows.slice(1).forEach(row => {
    const email = normalizeConfigurationKey_(row[schema.emailIndex]);
    if (!email || email === ownEmail || seen.has(email)) return;
    seen.add(email);
    if (schema.activeIndex >= 0 && !isConfigurationActiveValue_(row[schema.activeIndex])) return;
    const role = String(row[schema.roleIndex] || "").trim();
    if (!getUserCapabilities_({ role: role }).canCreateRequests) return;
    const colleague = {
      email: email,
      name: getOrderChatDisplayName_(email),
      defaultSite: schema.defaultSiteIndex >= 0 ? String(row[schema.defaultSiteIndex] || "").trim() : ""
    };
    parseDepartmentList_(row[schema.departmentIndex]).forEach(dept => {
      if (isSystemBudgetDepartment_(dept)) return;
      const key = normalizeConfigurationKey_(dept);
      if (!user.capabilities.canUseAllDepartmentView && !ownDepartments.has(key)) return;
      if (!choices[key]) choices[key] = [];
      choices[key].push(colleague);
    });
  });
  Object.keys(choices).forEach(key => choices[key].sort((a, b) => a.name.localeCompare(b.name)));
  return choices;
}

function resolveOrderRequester_(user, department, requestedEmail) {
  const email = normalizeConfigurationKey_(requestedEmail || user.email);
  if (email === normalizeConfigurationKey_(user.email)) return user.email;
  const choices = (user.requesterChoices || {})[normalizeConfigurationKey_(department)] || [];
  if (!choices.some(person => person.email === email)) {
    throw createPortalValidationError_("That person is no longer available for this department. Refresh the page and choose who the order is for.", "INVALID_REQUESTER");
  }
  return email;
}

function isActiveOrderRequesterForDepartment_(ss, email, department) {
  const key = normalizeConfigurationKey_(email), deptKey = normalizeConfigurationKey_(department);
  if (!key || !deptKey) return false;
  const users = ss.getSheetByName('Users');
  if (!users) return false;
  const rows = users.getDataRange().getValues();
  const schema = getUserConfigurationSchema_(users,false,rows[0]);
  const matching = rows.slice(1).filter(row=>normalizeConfigurationKey_(row[schema.emailIndex])===key);
  if (matching.length !== 1) return false;
  const row = matching[0];
  const role = String(row[schema.roleIndex] || '').trim();
  return (schema.activeIndex < 0 || isConfigurationActiveValue_(row[schema.activeIndex])) &&
    getUserCapabilities_({role}).canCreateRequests &&
    parseDepartmentList_(row[schema.departmentIndex]).some(dept=>normalizeConfigurationKey_(dept)===deptKey);
}

function createPortalErrorEmailData_(e, context, primaryRecipient, markers, options) {
  const opts = options || {};
  const identity = markers || {};
  const recipient = (primaryRecipient || getPortalErrorAlertEmail_()).toString().trim();
  const isTest = opts.test === true;
  const bodyPrefix = isTest
    ? "TEST ONLY - This message confirms that portal error alerts reach the monitored inbox. No portal fault occurred.\n\n"
    : "";
  const emailData = {
    to: recipient,
    subject: isTest ? "[TEST] Portal Error Notification" : "🚨 Portal Error: " + context,
    body: bodyPrefix + "Error Details:\n" + (e && e.stack ? e.stack : e) + "\n\nActive: " + (identity.activeEmail || "") + "\nEffective: " + (identity.effectiveEmail || "")
  };
  if (opts.requestContext) {
    const diagnostic = normalizePortalRequestContext_(opts.requestContext, 'dashboard');
    emailData.body += '\n\nRequest: ' + diagnostic.requestId + '\nSource: ' + diagnostic.source +
      '\nBrowser attempt: ' + diagnostic.attempt + '\nRead attempts: ' + (Number(opts.requestContext.readAttempt) || 1);
  }
  return emailData;
}

function createPortalErrorDeliveryPlan_(e, context, primaryRecipient, markers, options) {
  // Technical alerts have one destination. Finance and the active/effective
  // user must never become fallback recipients.
  return [createPortalErrorEmailData_(e, context, getPortalErrorAlertEmail_(), markers, options)];
}

function sendPortalErrorNotification_(e, context, options) {
  portalAssertExecutionAccount_();
  if (developmentChatAndErrorAlertsSuppressed_() && !(options && options.test === true)) return { success: true, skipped: true };
  const markers = getIdentityMarkers_();
  const deliveryPlan = createPortalErrorDeliveryPlan_(e, context, null, markers, options);
  if (isDevelopmentRuntime_()) {
    const developmentRecipient = 'andy.clifton@claremontschool.co.uk';
    deliveryPlan.forEach(emailData => {
      const intendedRecipient = emailData.to;
      emailData.to = developmentRecipient;
      emailData.subject = "[DEV TEST] " + emailData.subject;
      emailData.body = "Development test only. Intended recipient: " + intendedRecipient + "\n\n" + (emailData.body || "");
    });
  }
  // Development notifications retain their isolated test recipient.
  deliveryPlan.forEach(emailData => { portalAssertExecutionAccount_(); sendPortalServiceEmail_(emailData); });
  return {
    success: true,
    itDirectCopySent: deliveryPlan[0].to.toLowerCase() === getPortalErrorAlertEmail_().toLowerCase()
  };
}

function logError_(e, context, options) {
  console.error("Error in " + context + ": " + e.toString());
  if (isAuthError_(e)) return;
  try {
    sendPortalErrorNotification_(e, context, options);
  } catch (err) {
    // Do not call logError_ here: an email failure must not create a reporting loop.
    console.log("Failed to email error");
  }
}

function clampEmailSubject_(subject) {
  const maxLength = 180;
  const normalized = (String(subject || "").replace(/\s+/g, " ").trim()) || "Portal Notification";

  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 3).trimEnd() + "...";
}

function emailMoney_(value) {
  if (value == null || String(value).trim() === '' || !isFinite(Number(value))) return 'Not recorded';
  const n = Number(value);
  return (n < 0 ? '−' : '') + '£' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function emailDate_(value) {
  if (!value) return '';
  return value instanceof Date ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(value);
}

function emailDetailRow_(label, value, html) {
  if (value == null || value === '') return '';
  return '<tr><th scope="row" class="email-label" style="width:34%;vertical-align:top;text-align:left;padding:10px 12px;border-bottom:1px solid #dde3eb;color:#526079;font-size:13px;font-weight:normal;">' + escapeEmailHtml_(label) + '</th><td class="email-value" style="vertical-align:top;padding:10px 12px;border-bottom:1px solid #dde3eb;color:#25334d;overflow-wrap:anywhere;word-break:break-word;">' + (html ? value : escapeEmailHtml_(value)) + '</td></tr>';
}

function emailAction_(url, label) {
  return '<p style="margin:22px 0;"><a class="email-action" href="'+escapeEmailHtml_(url)+'" style="display:inline-block;background:#2f3886;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:3px;">'+escapeEmailHtml_(label)+'</a></p>';
}

function emailPlainText_(html) {
  return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(?:p|div|tr|h[1-6]|table)>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:th|td)>/gi, ': ').replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|pound|rarr);/g, x => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' ','&pound;':'£','&rarr;':'→'}[x]))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function wrapNotificationEmail_(body, portalUrl, banner) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>' +
    ':root{color-scheme:light dark;} .email-content a:not(.email-action){color:#2f3886;} .email-content h2,.email-content h3{font-size:22px;line-height:1.3;margin:0 0 16px;} ' +
    '@media(max-width:480px){.email-outer{padding:12px 8px!important}.email-content,.email-header{padding:20px 16px!important}} ' +
    '@media(prefers-color-scheme:dark){.email-bg{background:#101722!important}.email-content,.email-details{background:#1b2535!important;color:#e6edf8!important}.email-label{color:#b8c5d9!important}.email-value{color:#e6edf8!important}.email-content,.email-label,.email-value{border-color:#3b4960!important}.email-muted{color:#b8c5d9!important}.email-content a:not(.email-action){color:#a9bdff!important}.email-panel{background:#243248!important;color:#e6edf8!important}}' +
    '</style></head><body class="email-bg" style="margin:0;padding:0;background:#f2f4f7;color:#25334d;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-bg" style="background:#f2f4f7"><tr><td align="center" class="email-outer" style="padding:24px 16px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;table-layout:fixed">' +
    (banner ? '<tr><td style="padding:0 0 12px">'+banner+'</td></tr>' : '') +
    '<tr><td class="email-header" style="padding:28px;background:#2f3886;color:#ffffff"><div style="font-size:12px;letter-spacing:1.2px;font-weight:bold">CLAREMONT SCHOOL</div><div style="font-size:26px;line-height:32px;margin-top:10px;font-weight:bold">Orders Portal</div></td></tr><tr><td class="email-content" style="padding:28px;background:#ffffff;border:1px solid #dde3eb;border-top:0;font-size:15px;line-height:24px;overflow-wrap:anywhere;word-break:break-word">' + body +
    '<p class="email-muted" style="border-top:1px solid #dde3eb;padding-top:18px;margin:24px 0 0;color:#526079;font-size:13px;line-height:20px">Please use Notes in the <a href="'+escapeEmailHtml_(portalUrl)+'">Orders Portal</a> to respond. Replies to this automated email are not monitored.</p></td></tr></table></td></tr></table></body></html>';
}

function sendEmailAlert_(to, subject, body, options) {
  portalAssertExecutionAccount_();
  try {
    const development = isDevelopmentRuntime_();
    const intendedRecipient = (to || "").toString().trim();
    const developmentRecipient = development ? 'andy.clifton@claremontschool.co.uk' : '';
    const actualRecipient = developmentRecipient || intendedRecipient;
    const developmentPrefix = developmentRecipient ? "[DEV TEST] " : "";
    const portalUrl = developmentRecipient ? (ScriptApp.getService().getUrl() || "") : getPortalPublicUrl_();
    const developmentBanner = developmentRecipient
      ? `<div style="background:#dbeafe;color:#1e3a8a;padding:10px;margin-bottom:12px;"><strong>Development test only.</strong><br>Intended recipient: ${escapeEmailHtml_(intendedRecipient || "Not supplied")}</div>`
      : "";
    const emailData = {
      to: actualRecipient,
      subject: developmentPrefix + subject + " | Orders Portal",
      htmlBody: wrapNotificationEmail_(body, portalUrl, developmentBanner),
      body: (developmentRecipient ? 'DEV TEST — intended recipient: ' + intendedRecipient + '\n\n' : '') + 'CLAREMONT SCHOOL — Orders Portal\n\n' + emailPlainText_(body) + '\n\nPlease use Notes in the Orders Portal to respond: ' + portalUrl + '\nReplies to this automated email are not monitored.'
    };

    emailData.subject = clampEmailSubject_(emailData.subject);

    // Force Reply-To to noreply to discourage email responses
    emailData.replyTo = "noreply@claremontschool.co.uk";

    // Force Sender Name to be professional
    emailData.name = "Claremont Order Portal";

    portalAssertExecutionAccount_();
    if (development) sendDevelopmentServiceEmail_(emailData);
    else sendPortalServiceEmail_(emailData);
    return { success: true };
  } catch (e) {
    console.error("Notification email failed: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

function uploadFileToDrive_(data, filename, type) {
  portalAssertExecutionAccount_();
  return uploadFileToPortalFolder_(getPortalAttachmentFolder_(), data, filename, type);
}

// The read-only recovery context supplies the same validated folder directly,
// so its limited service test exercises the actual upload implementation.
function uploadFileToPortalFolder_(folder, data, filename, type) {
  const safeName = validateTextField_(filename, "Attachment filename", { required: true, maxLength: 180 });
  const safeType = validateTextField_(type || "application/octet-stream", "Attachment type", { maxLength: 120 }) || "application/octet-stream";
  try {
    const bytes = Utilities.base64Decode(data);
    if (bytes.length > 5 * 1024 * 1024) throw new Error('File exceeds 5 MB.');
    const blob = Utilities.newBlob(bytes, safeType, safeName);
    const file = Drive.Files.create({ name: safeName, mimeType: safeType, parents: [folder.id] }, blob,
      { supportsAllDrives: true, fields: 'id,webViewLink' });
    return { url: file.webViewLink || 'https://drive.google.com/file/d/' + file.id + '/view', fileId: file.id, filename: safeName };
  } catch (e) {
    console.error("Attachment upload failed for " + safeName + ": " + e.toString());
    throw new Error("The attachment \"" + safeName + "\" could not be uploaded. Remove it or try again.");
  }
}

function trashUploadedFiles_(fileIds) {
  (fileIds || []).forEach(fileId => {
    try { Drive.Files.update({ trashed: true }, fileId, null, { supportsAllDrives: true }); } catch (e) { console.error("Failed to clean up uploaded file " + fileId + ": " + e.toString()); }
  });
}

// --- USER CONTEXT ---
function getUserContext() {
  return getAuthorizedUserContext_();
}

// --- SIMULATION TARGETS ---
function getSimulationTargets() {
  const user = getAuthorizedUserContext_();
  if (user.realRole !== ROLE_ADMIN_) {
    throw createAuthError_('Only an administrator may preview another account.','simulation_targets_not_admin');
  }

  const ss = getPortalSpreadsheet_();
  const userSheet = ss.getSheetByName("Users");
  if (!userSheet) return [];
  const data = userSheet.getDataRange().getValues();
  const schema = getUserConfigurationSchema_(userSheet, false);
  const targets = [];
  const currentUserEmail = (user.realEmail || "").toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const email = data[i][schema.emailIndex] ? data[i][schema.emailIndex].toString().trim() : "";
    if (email && email.toLowerCase() !== currentUserEmail && isSimulatableUserRow_(data[i], schema)) {
      targets.push(email);
    }
  }
  return targets;
}

function setSimulation(targetEmail, mode) {
  const saved = portalViewContext_;
  try {
    portalViewContext_ = null;
    const user = getAuthorizedUserContext_();
    if (user.realRole !== ROLE_ADMIN_) throw createAuthError_('Admin access is required to change preview.','preview_not_admin');
    if (!targetEmail) return {success:true,context:null};
    const context = {email:validateTextField_(targetEmail,'Preview account',{required:true,maxLength:254}).toLowerCase(),mode:mode === 'test' ? 'test' : 'preview'};
    portalViewContext_ = context;
    getAuthorizedUserContext_();
    return {success:true,context:context};
  } finally { portalViewContext_ = saved; }
}

// --- DATA FETCHING ---
function portalOrderFromRow_(row, columns, budgets, user, formatDate, includeActions) {
  const recordType=getOrderRecordType_(row,columns.recordTypeIndex),deptName=row[1];
  const glCode=(columns.glCodeIndex>=0?row[columns.glCodeIndex]:'') || (budgets[deptName] && budgets[deptName].glCode) || '';
  const returnInfo = getOrderReturnInfo_(row,columns);
  if (returnInfo.refunds.length || returnInfo.parentId) returnInfo.canOpenCredits = canViewOrderRecord_(user,deptName,'Invoice');
  const canSeeApprovalHistory = canViewOrderApprovalHistory_(user,row,columns);
  return {
              id: row[0],
              version: includeActions ? orderVersion_(row) : undefined,
              dept: deptName,
              glCode: glCode,
              dateReq: formatDate(row[2]),
              requester: row[3],
              submittedBy: getOrderSubmittedBy_(row, columns),
              supplier: row[4],
              link: row[5],
              desc: row[6],
              code: row[7],
              qty: row[8],
              unitPrice: row[9],
              totalPrice: row[10],
              location: row[11],
              dateNeeded: formatDate(row[12]),
              dateOrdered: formatDate(row[13]),
              expectedDate: formatDate(row[14]),
              finalPrice: row[15],
              notes: row[17] || "",
              invoiceNumber: getOrderInvoiceNumber_(row, recordType, columns.invoiceNumberIndex),
              attachment: row[19] || "",
              recordType: recordType,
              isCompleted: isOrderCompleted_(row),
              status: getOrderStatusLabel_(row, recordType, columns),
              processedBy: columns.processedByIndex >= 0 ? (row[columns.processedByIndex] || "") : "",
              financeProcessedBy: columns.financeProcessedByIndex >= 0 ? (row[columns.financeProcessedByIndex] || "") : "",
              reportingSite: getOrderReportingSite_(row,columns) || 'Unassigned',
              reportingDate: formatDate(isOrderCompleted_(row) ? row[13] || row[2] : row[2]),
              noteRecipient: normalizeConfigurationKey_(user.email) === normalizeConfigurationKey_(row[3]) ? (user.noteFinanceEmail || 'Finance') : (String(row[3] || '').includes('@') ? row[3] : 'Finance'),
              noteVisibility: 'Visible to people who can access this purchase. Private review notes remain separate.',
              paymentMethod: getOrderPaymentMethod_(row, columns),
              approvalStatus: getOrderApprovalStatus_(row, columns),
              approvalRevision: columns.approvalRevisionIndex >= 0 ? Number(row[columns.approvalRevisionIndex] || 0) : 0,
              approvedBy: canSeeApprovalHistory && columns.approvedByIndex >= 0 ? (row[columns.approvedByIndex] || "") : "",
              approvedAt: canSeeApprovalHistory && columns.approvedAtIndex >= 0 ? formatDate(row[columns.approvedAtIndex]) : "",
              returnInfo,
              actions: includeActions ? getOrderRecordActions_(user, row, columns) : undefined
            };
}

// Order history is filtered and summarised on the server. Normal page responses
// contain at most 50 records; full exports use revision-checked 500-row chunks.
function normalizeOrderQuery_(input, user) {
  const raw = input || {}, fields = ['dateReq','dept','glCode','requester','desc','qty','supplier','location','totalPrice','status','dateNeeded','dateOrdered'];
  const depts = [...new Set([...(user.depts || []), ...(user.processingDepartments || [])])].filter(d => d && !isSystemBudgetDepartment_(d));
  const finance = user.capabilities.canUseAllDepartmentView && (String(user.role).toLowerCase() === 'wipro' || depts.some(d => String(d).toLowerCase() === 'finance'));
  const query = {
    department: raw.department == null || raw.department === '' ? (finance ? 'All' : depts[0] || 'All') : String(raw.department).slice(0,200),
    search: String(raw.search || '').trim().toLowerCase().slice(0,500),
    recordView: raw.recordView === 'removed' ? 'removed' : 'active',
    returnsOnly: raw.returnsOnly === true,
    ownership: ['requester','submitter'].includes(raw.ownership) ? raw.ownership : 'all',
    reviewScope: ['mine','awaiting','queries'].includes(raw.reviewScope) ? raw.reviewScope : '',
    actorEmail: normalizeConfigurationKey_(user.email),
    pendingOnly: raw.pendingOnly === true, excludeInvoices: raw.excludeInvoices === true, approvalOnly: raw.approvalOnly === true,
    paymentMethod: ['Credit card','Invoice / on account','unrecorded'].includes(raw.paymentMethod) ? raw.paymentMethod : '',
    dateField: raw.dateField === 'dateOrdered' ? 'dateOrdered' : 'dateReq',
    from: String(raw.from || ''), to: String(raw.to || ''),
    sortField: fields.includes(raw.sortField) ? raw.sortField : 'dateReq', sortDirection: raw.sortDirection === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Math.floor(Number(raw.page) || 1)), pageSize: [10,25,50].includes(Number(raw.pageSize)) ? Number(raw.pageSize) : 10
  };
  if (query.recordView === 'removed') { query.pendingOnly=false; query.excludeInvoices=false; query.approvalOnly=false; query.returnsOnly=false; query.reviewScope=''; }
  // Each workflow queue is independent of unrelated pending/invoice switches.
  if (query.reviewScope || query.returnsOnly) { query.pendingOnly=false; query.excludeInvoices=false; query.approvalOnly=false; }
  if (query.reviewScope) query.returnsOnly=false;
  for (const name of ['from','to']) if (query[name] && (!/^\d{4}-\d{2}-\d{2}$/.test(query[name]) || !Number.isFinite(Date.parse(query[name])) || new Date(query[name]).toISOString().slice(0,10) !== query[name])) throw new Error('Please enter a valid filter date.');
  if (query.from && query.to && query.from > query.to) throw new Error('The end date must be on or after the start date.');
  return query;
}

function portalDateFormatter_(timeZone) {
  const dates = new Map();
  return value => {
    if (!value) return '';
    if (!(value instanceof Date)) return String(value);
    const key = value.getTime();
    if (!dates.has(key)) dates.set(key, Utilities.formatDate(value,timeZone,'dd/MM/yyyy'));
    return dates.get(key);
  };
}

function orderQueryDate_(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value || ''));
  if(!match)return '';
  const date=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
  return Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date ? date : '';
}

function orderQueryAmount_(order) {
  return Number(order.finalPrice !== '' && order.finalPrice != null ? order.finalPrice : order.totalPrice) || 0;
}

function isOrderReviewPending_(order) {
  return !isInactiveOrderStatus_(order.status) && ['Order','Invoice'].includes(order.recordType) && ['AWAITING_SIGNOFF','QUERY_RAISED'].includes(order.approvalStatus);
}

function matchesOrderQuery_(order, query) {
  const removedInvoice = order.recordType === 'Invoice' && isInactiveOrderStatus_(order.status);
  if (query.recordView === 'removed' ? !removedInvoice : removedInvoice) return false;
  if (query.department !== 'All' && order.dept !== query.department) return false;
  if (query.ownership === 'requester' && normalizeConfigurationKey_(order.requester) !== query.actorEmail) return false;
  if (query.ownership === 'submitter' && normalizeConfigurationKey_(order.submittedBy) !== query.actorEmail) return false;
  if (query.reviewScope && !(order.reviewFlags || {})[query.reviewScope]) return false;
  if (query.pendingOnly && (order.isCompleted || isInactiveOrderStatus_(order.status))) return false;
  if (query.returnsOnly && !order.returnInfo?.pending) return false;
  if (query.excludeInvoices && order.recordType === 'Invoice') return false;
  if (query.approvalOnly && !isOrderReviewPending_(order)) return false;
  if (query.paymentMethod && (!['Order','Invoice'].includes(order.recordType) || (query.paymentMethod === 'unrecorded' ? !!order.paymentMethod : order.paymentMethod !== query.paymentMethod))) return false;
  if (query.search && !Object.values(order).some(v => v != null && typeof v !== 'object' && String(v).toLowerCase().includes(query.search))) return false;
  if (query.from || query.to) {
    const date = orderQueryDate_(order[query.dateField]);
    if (!date || (query.from && date < query.from) || (query.to && date > query.to)) return false;
  }
  return true;
}

function sortOrderEntries_(entries, query) {
  const value = order => query.sortField === 'totalPrice' ? orderQueryAmount_(order) : query.sortField === 'qty' ? Number(order.qty) || 0 :
    ['dateReq','dateNeeded','dateOrdered'].includes(query.sortField) ? orderQueryDate_(order[query.sortField]) : order[query.sortField] || '';
  return entries.sort((a,b) => { const av=value(a.order),bv=value(b.order);return (av<bv?-1:av>bv?1:0)*(query.sortDirection==='asc'?1:-1) || b.index-a.index; });
}

function readOrderHistory_(ss, user, budgets, prepared) {
  const sheet=prepared ? prepared.sheet : ss.getSheetByName('Orders'),columns=prepared ? prepared.columns : (sheet ? getOrdersMetadataColumnsForRead_(sheet) : {}),timeZone=Session.getScriptTimeZone();
  const allRows=sheet && sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,columns.lastColumn).getValues().filter(row => row[0] || row[2]) : [];
  const rows=allRows.filter(row=>canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex)));
  const formatDate=portalDateFormatter_(timeZone);
  user.noteFinanceEmail=getConfig_(ss).financeEmail;
  const ledger=authoritativeBudgetLedger_(budgets,allRows,columns),warnings=stableOrderBudgetWarnings_(allRows,columns,ledger);
  const actor=normalizeConfigurationKey_(user.email);
  // Preview shows the target's workload while the returned record actions remain read-only.
  const reviewUser=user.isPreview ? attachCapabilities_({...user,realEmail:user.email,realRole:user.role,isSimulated:false,isPreview:false}) : user;
  const entries=rows.map((row,index)=>{
    const order=portalOrderFromRow_(row,columns,budgets,user,formatDate,false),actions=getOrderRecordActions_(reviewUser,row,columns);
    order.overBudget=!!warnings[String(row[0])];
    order.reviewFlags={mine:!!actions.canApprove,awaiting:isOrderReviewPending_(order) && [order.requester,order.submittedBy,order.processedBy].some(value=>normalizeConfigurationKey_(value)===actor),queries:!!actions.canResubmit};
    return {row,index,order};
  });
  const warningIds = entries.filter(entry=>entry.order.overBudget).map(entry=>entry.order.id);
  const revision = orderVersion_([dashboardRevision_(user,budgets,columns,rows,timeZone),ledger,warningIds]);
  return {sheet,columns,rows,entries,ledger,formatDate,revision};
}

function authoritativeBudgetLedger_(budgets,rows,columns) {
  const ledger={};
  Object.keys(budgets).forEach(dept=>{const b=budgets[dept];ledger[dept]={allocation:Number(b.total)||0,used:Number(b.spent)||0,remaining:Number(b.remaining)||0,spent:Number(b.spent)||0,committed:0,hasCalculationError:!!b.hasCalculationError};});
  (rows||[]).forEach(row=>{if(ledger[row[1]] && !isOrderCompleted_(row) && !isOrderCancelled_(row,columns))ledger[row[1]].committed+=Number(row[15]!==''&&row[15]!=null?row[15]:row[10])||0;});
  Object.values(ledger).forEach(value=>{value.committed=Math.round(value.committed*100)/100;value.spent=Math.round((value.used-value.committed)*100)/100;});
  return ledger;
}

function stableOrderBudgetWarnings_(rows,columns,ledger) {
  const remaining={},warnings={};
  Object.keys(ledger).forEach(dept=>remaining[dept]=ledger[dept].remaining+ledger[dept].committed);
  rows.filter(row=>ledger[row[1]]&&!isOrderCompleted_(row)&&!isOrderCancelled_(row,columns))
    .slice().sort((a,b)=>(new Date(a[2]).getTime()||0)-(new Date(b[2]).getTime()||0)||String(a[0]).localeCompare(String(b[0])))
    .forEach(row=>{remaining[row[1]]-=Number(row[15]!==''&&row[15]!=null?row[15]:row[10])||0;warnings[String(row[0])]=ledger[row[1]].hasCalculationError||remaining[row[1]] < -0.005;});
  return warnings;
}

function summarizeOrderHistory_(entries, budgets, ledger) {
  const deptSummary={},completedSpend={},allDepartments=new Set(Object.keys(budgets)),suppliers=new Set();let approvalCount=0;
  // Most recent suppliers are a small initial hint; typed suggestions query the
  // complete authorised history separately.
  for (let i=entries.length-1;i>=0;i--) {
    const order=entries[i].order;
    if (order.supplier && suppliers.size<100) suppliers.add(String(order.supplier));
    if (order.dept && !isSystemBudgetDepartment_(order.dept)) allDepartments.add(order.dept);
    if (isOrderReviewPending_(order)) approvalCount++;
    if (!order.dept || isInactiveOrderStatus_(order.status)) continue;
    if (!deptSummary[order.dept]) deptSummary[order.dept]={spent:0,committed:0};
    if (order.isCompleted) {const cost=orderQueryAmount_(order);deptSummary[order.dept].spent+=cost;completedSpend[order.dept]=(completedSpend[order.dept]||0)+cost;}
    else if (order.status==='Pending') deptSummary[order.dept].committed+=Number(order.totalPrice)||0;
  }
  const reviewCounts={mine:0,awaiting:0,queries:0};
  entries.forEach(({order})=>Object.keys(reviewCounts).forEach(key=>{if((order.reviewFlags||{})[key])reviewCounts[key]++;}));
  return {deptSummary,completedSpend,ledger:ledger||{},reviewCounts,allDepartments:[...allDepartments].filter(Boolean).sort(),suppliers:[...suppliers].sort(),approvalCount:reviewCounts.mine};
}

function getPagedDashboardData_(ss,user,budgets,context,requestContext) {
  const query=normalizeOrderQuery_(context.query,user),sheet=ss.getSheetByName('Orders'),columns=sheet ? getOrdersMetadataColumnsForRead_(sheet) : {};
  const hintContext=Object.assign({},context,{lazyDetails:true,query});
  const hint=sheet && dashboardReadHint_(ss,user,budgets,sheet,columns,hintContext);
  if(hint && hint.revision && context.knownRevision===hint.revision) return {success:true,notModified:true,meta:dashboardResponseMeta_(hint.revision,requestContext)};
  const history=readOrderHistory_(ss,user,budgets,{sheet,columns}),revision=orderVersion_([history.revision,query]);
  if(hint){try{hint.cache.put(hint.key,JSON.stringify({revision,at:Date.now()}),60);}catch(_){}}
  if(context.knownRevision===revision)return {success:true,notModified:true,meta:dashboardResponseMeta_(revision,requestContext)};
  const matching=sortOrderEntries_(history.entries.filter(entry=>matchesOrderQuery_(entry.order,query)),query);
  const page=Math.min(query.page,Math.max(1,Math.ceil(matching.length/query.pageSize))),offset=(page-1)*query.pageSize;
  const orders=matching.slice(offset,offset+query.pageSize).map(entry=>Object.assign(portalOrderFromRow_(entry.row,history.columns,budgets,user,history.formatDate,true),{overBudget:entry.order.overBudget,reviewFlags:entry.order.reviewFlags}));
  orders.forEach(order=>{order.hasNotes=!!order.notes;order.detailsDeferred=true;delete order.notes;delete order.attachment;});
  return {success:true,user,budgets,orders,summary:summarizeOrderHistory_(history.entries,budgets,history.ledger),paging:{page,pageSize:query.pageSize,total:matching.length,query:Object.assign({},query,{page})},
    budgetErrors:Object.keys(budgets).filter(d=>budgets[d].hasCalculationError).map(d=>({department:d,message:budgets[d].calculationError})),meta:dashboardResponseMeta_(revision,requestContext)};
}

function getOrderExportPage(request) {
  const input=request || {},ss=getPortalSpreadsheet_(),user=getAuthorizedUserContext_(ss);
  const master=input.mode==='master';
  requireCapability_(user,master?'canExportFullReport':'canExportCurrentView','Access denied.','export_not_allowed');
  const budgets=filterVisibleBudgets_(getBudgetSnapshot_(ss)),history=readOrderHistory_(ss,user,budgets);
  const query=normalizeOrderQuery_(master?{department:'All',sortField:'dateReq',sortDirection:'desc'}:input.query,user);
  const revision=orderVersion_([history.revision,query,master]);
  if(input.revision && input.revision!==revision)throw new Error('Orders or permissions changed while the export was being prepared. Please export again.');
  const matching=sortOrderEntries_(history.entries.filter(entry=>matchesOrderQuery_(entry.order,query) && (!master || (entry.order.isCompleted && !isInactiveOrderStatus_(entry.order.status)))),query);
  const offset=Math.max(0,Math.floor(Number(input.offset)||0)),selected=matching.slice(offset,offset+500);
  // Only fields used by the workbook travel in the export response.
  const fields=['id','dateReq','dateOrdered','dept','glCode','desc','qty','totalPrice','finalPrice','supplier','invoiceNumber','paymentMethod','processedBy','financeProcessedBy','reportingSite','reportingDate','recordType','status','approvalStatus'];
  return {revision,total:matching.length,nextOffset:offset+selected.length,orders:selected.map(({order})=>({
    ...Object.fromEntries(fields.map(key=>[key,order[key]])), returnInfo:orderReturnExportInfo_(order.returnInfo)
  }))};
}

function orderReturnExportInfo_(info) {
  if (!info || (!info.status && !info.parentId)) return null;
  const {parentId,creditId,adjustmentKind,status,original,refunded,remaining,refunds} = info;
  return {parentId,creditId,adjustmentKind,status,original,refunded,remaining,
    refunds:refunds.map(({id,reversalId})=>({id,reversalId:reversalId || ''}))};
}

function getOrderRecord(id) {
  const ss=getPortalSpreadsheet_(),user=getAuthorizedUserContext_(ss),sheet=ss.getSheetByName('Orders'),columns=getOrdersMetadataColumnsForRead_(sheet);
  const reference=validateTextField_(id,'Order reference',{required:true,maxLength:100});
  const matches=sheet.getRange(2,1,Math.max(1,sheet.getLastRow()-1),1).createTextFinder(reference).matchEntireCell(true).matchCase(true).useRegularExpression(false).findAll();
  if(matches.length!==1)throw new Error('The order is unavailable or has a duplicate reference. Refresh and contact IT if this continues.');
  const row=sheet.getRange(matches[0].getRow(),1,1,columns.lastColumn).getValues()[0];
  if(!canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex)))throw new Error('Access denied.');
  return portalOrderFromRow_(row,columns,getBudgetSnapshot_(ss),user,portalDateFormatter_(Session.getScriptTimeZone()),true);
}

function getOrderSupplierSuggestions(search) {
  const ss=getPortalSpreadsheet_(),user=getAuthorizedUserContext_(ss),sheet=ss.getSheetByName('Orders');
  if(!sheet || sheet.getLastRow()<2)return [];
  const columns=getOrdersMetadataColumnsForRead_(sheet),text=String(search||'').toLowerCase().slice(0,200),names=new Set();
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,columns.lastColumn).getValues();
  for(let i=rows.length-1;i>=0&&names.size<100;i--){const row=rows[i],name=String(row[4]||'');if(name && name.toLowerCase().includes(text)&&canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex)))names.add(name);}
  return [...names].sort();
}


function dashboardRevision_(user, budgets, columns, rows, timeZone) {
  const source = JSON.stringify(["dashboard-v1", user, budgets, columns, rows, timeZone]);
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source, Utilities.Charset.UTF_8));
}

function dashboardResponseMeta_(revision, requestContext) {
  return { environment: isDevelopmentRuntime_() ? 'dev' : 'live', revision: revision, dataVersion: getDataVersion_(), configurationVersion: getConfigurationVersion_(),
    generatedAt: new Date().toISOString(), perfTargets: PERF_TARGETS_, requestId: requestContext.requestId };
}

// Only unchanged background refreshes may use this short-lived hint. Explicit
// refreshes bypass it. Permissions and budgets are read fresh on every request.
function dashboardReadHint_(ss, user, budgets, sheet, columns, context) {
  if (!context || !context.backgroundCache || context.forceRead) return null;
  const key = portalStateKey_('dashboard_hint_') + orderVersion_({user, budgets,
    dataVersion:getDataVersion_(), workbook:ss.getId(), rows:sheet.getLastRow(), columns,
    lazyDetails:!!context.lazyDetails, query:context.paged ? context.query : null});
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(key), hint = raw ? JSON.parse(raw) : null;
    return {key, cache, revision:hint && Date.now()-hint.at < 60000 ? hint.revision : null};
  } catch (_) { return null; }
}

function getOrderDetails(id, expectedVersion) {
  const ss = getPortalSpreadsheet_(), user = getAuthorizedUserContext_(ss);
  const sheet = ss.getSheetByName('Orders');
  const columns = getOrdersMetadataColumnsForRead_(sheet);
  const reference = validateTextField_(id, 'Order reference', {required:true,maxLength:100});
  const matches = sheet.getRange(2,1,Math.max(1,sheet.getLastRow()-1),1).createTextFinder(reference)
    .matchEntireCell(true).matchCase(true).useRegularExpression(false).findAll();
  if (matches.length !== 1) throw new Error('The order is unavailable or has a duplicate reference. Refresh and contact IT if this continues.');
  const row = sheet.getRange(matches[0].getRow(),1,1,columns.lastColumn).getValues()[0];
  if (!canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex))) throw new Error('Access denied.');
  requireOrderVersion_(row,expectedVersion);
  return {notes:row[17] || '',attachment:row[19] || '',detailsDeferred:false};
}

// Only the read-only dashboard uses this retry policy. Never replay writes here.
function isTransientDashboardReadError_(error) {
  if (isAuthError_(error)) return false;
  const message = String(error && error.message || error || '');
  return /Service Spreadsheets (?:failed while accessing document|timed out)|Service unavailable:\s*Spreadsheets|We're sorry, a server error occurred|Server error occurred, please try again/i.test(message);
}

function readDashboardDataOnce_(loadContext, requestContext, startMs) {
    const ss = getPortalSpreadsheet_();
    const user = getAuthorizedUserContext_(ss);
    requestContext.email = (user.realEmail || user.email || requestContext.email || "").toString().trim().toLowerCase();
    const budgets = getBudgetSnapshot_(ss);

    const visibleBudgets = {};
    const filteredBudgets = filterVisibleBudgets_(budgets);
    if (user.capabilities.canViewAllFinanceData || user.capabilities.hasExplicitOrderProcessingPermission) {
      Object.assign(visibleBudgets, filteredBudgets);
    } else {
      [...new Set([...(user.depts || []), ...(user.processingDepartments || [])])].forEach(dept => {
        if (!isSystemBudgetDepartment_(dept) && filteredBudgets[dept]) visibleBudgets[dept] = filteredBudgets[dept];
      });
    }

    if (loadContext && loadContext.paged) return getPagedDashboardData_(ss,user,visibleBudgets,loadContext,requestContext);

    const timeZone = Session.getScriptTimeZone();
    let revisionRows = [];
    let computedRevision = null;
    let revisionColumns = null;
    const orderSheet = ss.getSheetByName("Orders");
    const visibleOrders = [];
    if (orderSheet) {
      const orderColumns = getOrdersMetadataColumnsForRead_(orderSheet);
      revisionColumns = orderColumns;
      const hint = dashboardReadHint_(ss,user,visibleBudgets,orderSheet,orderColumns,loadContext);
      if (hint && hint.revision && loadContext.knownRevision === hint.revision) {
        return {success:true,notModified:true,meta:dashboardResponseMeta_(hint.revision,requestContext)};
      }
      const lastRow = orderSheet.getLastRow();
      if (lastRow > 1) {
        const allOrders = orderSheet.getRange(2, 1, lastRow - 1, orderColumns.lastColumn).getValues()
          .filter(row => (row[0] || row[2]) && canViewOrderRecord_(user, row[1], row[orderColumns.recordTypeIndex] || "Order"));
        revisionRows = allOrders;
        const revision = computedRevision = dashboardRevision_(user, visibleBudgets, revisionColumns, revisionRows, timeZone);
        if (hint) { try { hint.cache.put(hint.key,JSON.stringify({revision,at:Date.now()}),60); } catch (_) {} }
        if (loadContext && loadContext.knownRevision === revision) {
          logPerfMetric_("getDashboardData", startMs, { status: "not_modified", orders: allOrders.length });
          return { success: true, notModified: true, meta: dashboardResponseMeta_(revision, requestContext) };
        }

        const formattedDates = new Map();
        const parseUKDate = (d) => {
          if (!d) return "";
          if (!(d instanceof Date)) return d.toString();
          const key = d.getTime();
          if (!formattedDates.has(key)) formattedDates.set(key, Utilities.formatDate(d, timeZone, "dd/MM/yyyy"));
          return formattedDates.get(key);
        };

        for (let i = 0; i < allOrders.length; i++) {
          const row = allOrders[i];
          if (!row[0] && !row[2]) continue;

          const recordType = row[orderColumns.recordTypeIndex] || "Order";
          const hasAccess = canViewOrderRecord_(user, row[1], recordType);

          if (hasAccess) {
            const deptName = row[1];
            const storedGlCode = orderColumns.glCodeIndex >= 0 ? (row[orderColumns.glCodeIndex] || "") : "";
            const glCode = storedGlCode || (budgets[deptName] ? budgets[deptName].glCode || "" : "");
            visibleOrders.push(portalOrderFromRow_(row,orderColumns,budgets,user,parseUKDate,true));
          }
        }
      }
    }

    if (loadContext && loadContext.lazyDetails) visibleOrders.forEach(order => {
      order.hasNotes = !!order.notes;
      order.detailsDeferred = true;
      delete order.notes;
      delete order.attachment;
    });
    visibleOrders.reverse();

    const response = {
      success: true,
      user: user,
      orders: visibleOrders,
      budgets: visibleBudgets,
      budgetErrors: Object.keys(visibleBudgets)
        .filter(department => visibleBudgets[department] && visibleBudgets[department].hasCalculationError)
        .map(department => ({ department: department, message: visibleBudgets[department].calculationError })),
      meta: dashboardResponseMeta_(computedRevision || dashboardRevision_(user, visibleBudgets, revisionColumns, revisionRows, timeZone), requestContext)
    };
    if (loadContext && loadContext.knownRevision === response.meta.revision) {
      return { success: true, notModified: true, meta: response.meta };
    }
    const successMeta = {
      requestId: requestContext.requestId,
      source: requestContext.source,
      attempt: requestContext.attempt,
      email: requestContext.email,
      status: "success",
      orders: visibleOrders.length
    };
    logPortalRequest_("dashboard_complete", requestContext, { status: "success", orders: visibleOrders.length, ms: nowMs_() - startMs });
    logPerfMetric_("getDashboardData", startMs, successMeta);
    if (loadContext && loadContext.compact && visibleOrders.length) {
      response.orderFields = Object.keys(visibleOrders[0]);
      response.orderRows = visibleOrders.map(order => response.orderFields.map(key => order[key]));
      delete response.orders;
    }
    return response;

}

function getDashboardData(loadContext) {
  const startMs = nowMs_();
  const requestContext = normalizePortalRequestContext_(loadContext, "dashboard");
  const identityMarkers = getIdentityMarkers_();
  requestContext.email = identityMarkers.activeEmail || "";
  logPortalRequest_("dashboard_start", requestContext);
  try {
    // A bounded server-side retry also protects refreshes. Re-authorize and
    // rebuild the entire response each time; never return partial data.
    for (let readAttempt = 1; readAttempt <= 3; readAttempt++) {
      requestContext.readAttempt = readAttempt;
      try {
        const response = readDashboardDataOnce_(loadContext, requestContext, startMs);
        if (readAttempt > 1) logPortalRequest_("dashboard_recovered", requestContext, { ms: nowMs_() - startMs });
        return response;
      } catch (error) {
        if (!isTransientDashboardReadError_(error) || readAttempt === 3) throw error;
        const delayMs = 500 * Math.pow(2, readAttempt - 1) + Math.floor(Math.random() * 250);
        logPortalRequest_("dashboard_read_retry", requestContext, { error: String(error), delayMs });
        Utilities.sleep(delayMs);
      }
    }
  } catch (e) {
    if (isAuthError_(e)) {
      logPortalRequest_("dashboard_complete", requestContext, { status: "auth_denied", error: e.toString(), ms: nowMs_() - startMs });
      logPerfMetric_("getDashboardData", startMs, {
        requestId: requestContext.requestId,
        source: requestContext.source,
        attempt: requestContext.attempt,
        email: requestContext.email,
        status: "auth_denied",
        reason: e.toString()
      });
      return {
        success: false,
        error: e.userMessage || "Access denied. Please contact IT.",
        errorCode: AUTH_ERROR_CODE_,
        meta: { requestId: requestContext.requestId }
      };
    }
    logError_(e, "getDashboardData", { requestContext: requestContext });
    logPortalRequest_("dashboard_complete", requestContext, { status: "error", error: e.toString(), ms: nowMs_() - startMs });
    logPerfMetric_("getDashboardData", startMs, {
      requestId: requestContext.requestId,
      source: requestContext.source,
      attempt: requestContext.attempt,
      email: requestContext.email,
      status: "error",
      error: e.toString()
    });
    return { success: false, error: "We couldn’t load the latest orders and budgets. Please try again. If this continues, contact IT and quote the reference.", errorCode: "SERVER_ERROR", retryable: !isTransientDashboardReadError_(e), meta: { requestId: requestContext.requestId } };
  }
}

function auditDepartmentNameIssues() {
  const user = getAuthorizedUserContext_();
  requireCapability_(
    user,
    "canOpenMasterSheet",
    "Access denied. You do not have permission to audit department names.",
    "department_audit_not_allowed"
  );

  const ss = getPortalSpreadsheet_();
  const budgets = getBudgetSnapshot_(ss);
  const budgetNames = {};
  Object.keys(budgets).forEach(dept => {
    budgetNames[dept] = true;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    budgetDepartmentCount: Object.keys(budgetNames).length,
    userIssues: [],
    orderIssues: [],
    summary: {}
  };

  const userSheet = ss.getSheetByName("Users");
  if (!userSheet) {
    report.userIssues.push({ type: "sheet_missing", sheet: "Users" });
  } else {
    const userData = userSheet.getDataRange().getValues();
    const userSchema = getUserConfigurationSchema_(userSheet, false);
    for (let i = 1; i < userData.length; i++) {
      const isActive = userSchema.activeIndex < 0 || isConfigurationActiveValue_(userData[i][userSchema.activeIndex]);
      if (!isActive) continue;
      const email = (userData[i][userSchema.emailIndex] || "").toString().trim();
      const rawDept = (userData[i][userSchema.departmentIndex] || "").toString();
      if (!email && !rawDept.trim()) continue;

      parseDepartmentList_(rawDept).forEach(dept => {
        if (!budgetNames[dept]) {
          report.userIssues.push({
            type: "budget_not_found",
            row: i + 1,
            email: email,
            rawDepartment: rawDept,
            parsedDepartment: dept
          });
        }
      });
    }
  }

  const orderSheet = ss.getSheetByName("Orders");
  if (!orderSheet) {
    report.orderIssues.push({ type: "sheet_missing", sheet: "Orders" });
  } else {
    const orderColumns = getOrdersMetadataColumnsForRead_(orderSheet);
    const lastRow = orderSheet.getLastRow();
    if (lastRow > 1) {
      const orders = orderSheet.getRange(2, 1, lastRow - 1, orderColumns.lastColumn).getValues();
      for (let i = 0; i < orders.length; i++) {
        const row = orders[i];
        const rawDept = (row[1] || "").toString();
        const dept = rawDept.trim();
        if (!dept) continue;

        const reasons = [];
        if (dept.length >= 2 && dept.charAt(0) === '"' && dept.charAt(dept.length - 1) === '"') {
          reasons.push("literal_wrapping_quotes");
        }
        if (!budgetNames[dept]) {
          reasons.push("budget_not_found");
        }

        if (reasons.length) {
          report.orderIssues.push({
            row: i + 2,
            id: row[0],
            department: rawDept,
            reasons: reasons
          });
        }
      }
    }
  }

  report.summary = {
    userIssueCount: report.userIssues.length,
    orderIssueCount: report.orderIssues.length
  };
  console.log("[DEPARTMENT_AUDIT] " + JSON.stringify(report));
  return report;
}

function overviewCompleted_(order) {
  return !isInactiveOrderStatus_(order.status) && order.recordType !== 'Transfer' && !!(order.isCompleted || ['Ordered','Processed'].includes(order.status));
}

function overviewReportDate_(order) {
  return orderQueryDate_(overviewCompleted_(order) ? order.dateOrdered || order.dateReq : order.dateReq);
}

function overviewScope_(data, input) {
  const options=input || {},today=portalDateFormatter_('Europe/London')(new Date()),todayParts=today.split('/');
  const currentYear=Number(todayParts[2])-(Number(todayParts[1])<9?1:0),years=new Set([currentYear]);
  data.orders.forEach(order=>{const date=overviewReportDate_(order);if(date)years.add(Number(date.slice(0,4))-(Number(date.slice(5,7))<9?1:0));});
  const period=options.period==='All'?'All':years.has(Number(options.period))?String(Number(options.period)):String(currentYear);
  const departments=[...new Set([...Object.keys(data.budgets),...data.orders.map(o=>o.dept)])].filter(d=>d&&!isSystemBudgetDepartment_(d)).sort();
  const department=departments.includes(options.department)?options.department:'All';
  const orders=data.orders.filter(order=>{if(isInactiveOrderStatus_(order.status)||isSystemBudgetDepartment_(order.dept)||(department!=='All'&&order.dept!==department))return false;
    const date=overviewReportDate_(order);return period==='All'||(date && date>=period+'-09-01' && date<(Number(period)+1)+'-09-01');});
  return {orders,period,department,departments,periods:[...years].sort((a,b)=>b-a),budgetComparable:period===String(currentYear)&&!String(data.meta.dashboardScope).startsWith('site:')};
}

function summarizeOverview_(data, input) {
  const scope=overviewScope_(data,input),monthly=new Map(),departmentSpend=new Map(),suppliers=new Map();
  if(scope.period!=='All')for(let i=0;i<12;i++)monthly.set(new Date(Date.UTC(Number(scope.period),8+i,1)).toISOString().slice(0,7),0);
  let actualSpend=0,pendingValue=0,pendingCount=0,netTransferOut=0;
  scope.orders.forEach(order=>{const cost=orderQueryAmount_(order);
    if(order.recordType==='Transfer'){netTransferOut+=cost;return;}
    if(overviewCompleted_(order)){actualSpend+=cost;const date=overviewReportDate_(order);if(date){const key=date.slice(0,7);monthly.set(key,(monthly.get(key)||0)+cost);}departmentSpend.set(order.dept,(departmentSpend.get(order.dept)||0)+cost);const supplier=order.supplier||'Unknown';suppliers.set(supplier,(suppliers.get(supplier)||0)+cost);}
    else if(order.status==='Pending'){pendingCount++;pendingValue+=cost;}
  });
  const carryOver={count:0,value:0};
  if(scope.period!=='All')data.orders.forEach(order=>{
    if(order.status!=='Pending' || order.recordType==='Transfer' || (scope.department!=='All' && scope.department!==order.dept)) return;
    const date=overviewReportDate_(order);
    if(date && date<scope.period+'-09-01') {carryOver.count++;carryOver.value+=orderQueryAmount_(order);}
  });
  let ledger=null;
  if(scope.budgetComparable) {
    ledger={allocation:0,used:0,remaining:0,spent:0,committed:0,hasCalculationError:false};
    Object.keys(data.ledgerByDepartment||{}).filter(dept=>scope.department==='All'||scope.department===dept).forEach(dept=>{
      const value=data.ledgerByDepartment[dept];['allocation','used','remaining','spent','committed'].forEach(key=>ledger[key]+=value[key]);ledger.hasCalculationError=ledger.hasCalculationError||value.hasCalculationError;
    });
  }
  return Object.assign({},data,{
    orders:scope.orders.filter(o=>overviewCompleted_(o)&&orderQueryAmount_(o)>=500).sort((a,b)=>overviewReportDate_(b).localeCompare(overviewReportDate_(a))).slice(0,5),
    overview:{period:scope.period,periods:scope.periods,department:scope.department,departments:scope.departments,budgetComparable:scope.budgetComparable,
      ledger,carryOver,siteExclusionsNote:String(data.meta.dashboardScope).startsWith('site:')?'This report includes purchases explicitly attributed to '+data.user.defaultSite+'. Whole-school and unassigned legacy purchases are excluded. Finance can reconcile their reporting site. Department budget balances cover all sites and are not apportioned here.':'',
      actualSpend,pendingValue,pendingCount,netTransferOut,monthly:[...monthly].sort((a,b)=>a[0].localeCompare(b[0])),departmentSpend:[...departmentSpend].sort((a,b)=>b[1]-a[1]),
      suppliers:[...suppliers].filter(([,value])=>value!==0).sort((a,b)=>b[1]-a[1]).slice(0,5)}
  });
}

function getOverviewExportPage(request) {
  const input=request||{},data=getOverviewDashboardData();
  if(!data.success)throw new Error(data.error||'Access denied.');
  const scope=overviewScope_(data,input),revision=orderVersion_([data.user,data.budgets,data.orders,scope.period,scope.department]);
  if(input.revision && revision!==input.revision)throw new Error('Finance data or permissions changed while exporting. Please export again.');
  const offset=Math.max(0,Math.floor(Number(input.offset)||0));
  return {revision,total:scope.orders.length,nextOffset:Math.min(offset+500,scope.orders.length),orders:scope.orders.slice(offset,offset+500)};
}

function getOverviewDashboardData(options) {
  const startMs = nowMs_();
  const requestContext = normalizePortalRequestContext_(options, 'overview');
  try {
    const ss = getPortalSpreadsheet_();
    const user = getAuthorizedUserContext_(ss);
    requireCapability_(
      user,
      "canAccessFinanceDashboard",
      "Access denied. You do not have permission to access the overview dashboard.",
      "overview_dashboard_not_allowed"
    );

    const isHead = user.role === ROLE_HEAD_;
    const headSite = (user.defaultSite || "").toString().trim().toLowerCase();
    const budgets = getBudgetSnapshot_(ss);
    const filteredBudgets = filterVisibleBudgets_(budgets);
    const orderSheet = ss.getSheetByName("Orders");
    const visibleOrders = [];
    let ledgerByDepartment = isHead ? {} : authoritativeBudgetLedger_(filteredBudgets,[],{});
    const timeZone = Session.getScriptTimeZone();

    if (orderSheet) {
      const orderColumns = getOrdersMetadataColumnsForRead_(orderSheet);
      const lastRow = orderSheet.getLastRow();
      if (lastRow > 1) {
        const allOrders = orderSheet.getRange(2, 1, lastRow - 1, orderColumns.lastColumn).getValues();
        if(!isHead)ledgerByDepartment=authoritativeBudgetLedger_(filteredBudgets,allOrders,orderColumns);
        user.noteFinanceEmail=getConfig_(ss).financeEmail;
        const formattedDates = new Map();
        const parseUKDate = (d) => {
          if (!d) return "";
          if (!(d instanceof Date)) return d.toString();
          const key = d.getTime();
          if (!formattedDates.has(key)) formattedDates.set(key, Utilities.formatDate(d, timeZone, "dd/MM/yyyy"));
          return formattedDates.get(key);
        };

        for (let i = 0; i < allOrders.length; i++) {
          const row = allOrders[i];
          if (!row[0] && !row[2]) continue;

          const location = (row[11] || "").toString().trim();
          if (isHead && (!headSite || getOrderReportingSite_(row,orderColumns).toLowerCase() !== headSite)) continue;
          if (!isHead && !user.capabilities.canViewAllFinanceData) continue;

          const recordType = row[orderColumns.recordTypeIndex] || "Order";
          if (recordType === "Invoice" && user.capabilities.hasExplicitOrderProcessingPermission && !hasProcessingDepartment_(user,row[1]) && !user.capabilities.canViewAllFinanceData) continue;
          const deptName = row[1];
          if (isSystemBudgetDepartment_(deptName)) continue;
          const storedGlCode = orderColumns.glCodeIndex >= 0 ? (row[orderColumns.glCodeIndex] || "") : "";
          const glCode = storedGlCode || (budgets[deptName] ? budgets[deptName].glCode || "" : "");
          visibleOrders.push(portalOrderFromRow_(row,orderColumns,budgets,user,parseUKDate,false));
        }
      }
    }

    visibleOrders.reverse();
    const visibleBudgets = {};
    if (isHead) {
      const headDepts = {};
      visibleOrders.forEach(order => {
        if (order.dept) headDepts[order.dept] = true;
      });
      Object.keys(headDepts).forEach(dept => {
        if (filteredBudgets[dept]) visibleBudgets[dept] = filteredBudgets[dept];
      });
    } else {
      Object.assign(visibleBudgets, filteredBudgets);
    }

    const response = {
      success: true,
      user: user,
      orders: visibleOrders,
      budgets: visibleBudgets,
      ledgerByDepartment: ledgerByDepartment,
      meta: {
        dataVersion: getDataVersion_(),
        generatedAt: new Date().toISOString(),
        perfTargets: PERF_TARGETS_,
        dashboardScope: isHead ? "site:" + (user.defaultSite || "") : "all"
      }
    };
    logPerfMetric_("getOverviewDashboardData", startMs, { orders: visibleOrders.length, scope: response.meta.dashboardScope });
    return options && options.summaryOnly ? summarizeOverview_(response,options) : response;
  } catch (e) {
    if (isAuthError_(e)) {
      logPerfMetric_("getOverviewDashboardData", startMs, { status: "auth_denied", reason: e.toString() });
      return {
        success: false,
        error: e.userMessage || "Access denied. Please contact IT.",
        errorCode: AUTH_ERROR_CODE_
      };
    }
    logError_(e, "getOverviewDashboardData", { requestContext: requestContext });
    logPerfMetric_("getOverviewDashboardData", startMs, { status: "error", error: e.toString() });
    return { success: false, error: "We couldn’t load the dashboard. Please try again. If this continues, contact IT and quote reference " + requestContext.requestId + ".", errorCode: "SERVER_ERROR", meta: { requestId: requestContext.requestId } };
  }
}

// --- EMAIL HELPERS ---
function extractOrderData_(row, orderColumns) {
  const formatDate = (d) => {
    if (!d) return "";
    try {
      return (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy") : d.toString();
    } catch (e) { return d; }
  };

  const columns = orderColumns || {};
  const recordType = getOrderRecordType_(row, columns.recordTypeIndex);
  return {
    id: row[0],
    dept: row[1],
    date: formatDate(row[2]),
    requester: row[3],
    submittedBy: getOrderSubmittedBy_(row, columns),
    processedBy: columns.processedByIndex >= 0 ? String(row[columns.processedByIndex] || '').trim() : '',
    paymentMethod: getOrderPaymentMethod_(row, columns),
    supplier: row[4],
    link: row[5],
    desc: row[6],
    code: row[7],
    qty: row[8],
    unitPrice: row[9],
    totalPrice: row[10],
    location: row[11],
    dateNeeded: formatDate(row[12]),
    dateExpected: formatDate(row[14]),
    finalPrice: row[15],
    isCompleted: isOrderCompleted_(row),
    status: getOrderStatusLabel_(row, recordType, columns),
    notes: row[17],
    invoiceNumber: getOrderInvoiceNumber_(row, recordType, columns.invoiceNumberIndex),
    attachment: row[19],
    recordType: recordType
  };
}

function ensureOrderApprovalAuditSheet_(ss) {
  let sheet = ss.getSheetByName(ORDER_APPROVAL_AUDIT_SHEET_);
  if (!sheet) sheet = ss.insertSheet(ORDER_APPROVAL_AUDIT_SHEET_);
  const headers = ["Timestamp", "Order ID", "Revision", "Action", "Actor Email", "Requester Email", "Processor Email", "Private Note", "Order Snapshot"];
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  try { sheet.hideSheet(); } catch (e) {}
  return sheet;
}

function buildOrderApprovalSnapshot_(row, columns) {
  const order = extractOrderData_(row, columns);
  return JSON.stringify({
    id: order.id,
    department: order.dept,
    supplier: order.supplier,
    description: order.desc,
    quantity: order.qty,
    unitPrice: order.unitPrice,
    requestedTotal: order.totalPrice,
    paymentMethod: order.paymentMethod,
    finalPrice: order.finalPrice,
    expectedDate: row[14] || "",
    requester: order.requester,
    submittedBy: order.submittedBy,
    processedBy: columns.processedByIndex >= 0 ? row[columns.processedByIndex] || "" : ""
  });
}

function appendOrderApprovalAudit_(ss, row, columns, action, actorEmail, privateNote) {
  const revision = columns.approvalRevisionIndex >= 0 ? Number(row[columns.approvalRevisionIndex] || 0) : 0;
  ensureOrderApprovalAuditSheet_(ss).appendRow([
    new Date(), row[0], revision, action, actorEmail || "", row[3] || "",
    columns.processedByIndex >= 0 ? row[columns.processedByIndex] || "" : "",
    privateNote || "", buildOrderApprovalSnapshot_(row, columns)
  ]);
}

// Explicit budget assignments identify the local processing team. Broad Admin,
// Finance and school-wide access alone must not subscribe everyone to every budget.
function getBudgetRequestNotificationRecipients_(ss, department, submittedBy, existingRecipients) {
  const sheet = ss.getSheetByName('Users');
  if (!sheet) throw new Error('User access list is unavailable.');
  const data = sheet.getDataRange().getValues();
  const schema = getUserConfigurationSchema_(sheet, false, data[0]);
  if (schema.processingDepartmentsIndex < 0) return [];
  const excluded = new Set([submittedBy].concat(existingRecipients || [])
    .flatMap(value => String(value || '').split(/[,;]/))
    .map(value => value.trim().toLowerCase()).filter(Boolean));
  const seen = new Set();
  return data.slice(1).filter(row => {
    const email = String(row[schema.emailIndex] || '').trim().toLowerCase();
    // Match authentication's first-row rule when legacy duplicate user rows exist.
    if (!email || seen.has(email)) return false;
    seen.add(email);
    if (excluded.has(email) || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return false;
    if (schema.activeIndex >= 0 && !isConfigurationActiveValue_(row[schema.activeIndex])) return false;
    const role = String(row[schema.roleIndex] || '').trim();
    if (![ROLE_ADMIN_, ROLE_HEAD_, ROLE_STAFF_].includes(role)) return false;
    if (!parseDepartmentList_(row[schema.departmentIndex]).length) return false;
    return parseDepartmentList_(row[schema.processingDepartmentsIndex]).includes(department);
  }).map(row => String(row[schema.emailIndex]).trim().toLowerCase());
}

function getApprovalNotificationRecipients_() {
  const centralAddress = (getConfig_().financeEmail || "").toString().trim();
  return centralAddress ? [centralAddress] : [];
}

function buildApprovalRequiredEmailPayloads_(ss, row, columns) {
  const processor = columns.processedByIndex >= 0 ? row[columns.processedByIndex] || "" : "";
  const recipients = getApprovalNotificationRecipients_();
  const order = extractOrderData_(row, columns);
  return recipients.map(to => ({
    to: to,
    subject: "Independent sign-off required: " + order.recordType + " " + order.id,
    body: formatEmailBody_(
      "Independent Sign-off Required",
      `A purchase recorded by <strong>${escapeEmailHtml_(processor)}</strong> requires independent review because they also requested or submitted this purchase.`,
      order
    )
  }));
}

function shouldRequireIndependentSignoff_(user, row, columns) {
  if (user.role === ROLE_ADMIN_) return false;
  const actor = normalizeConfigurationKey_(user.isSimulated && isDevelopmentRuntime_()
    ? user.email
    : (user.realEmail || user.email));
  const requester = normalizeConfigurationKey_(row && row[3]);
  const submitter = normalizeConfigurationKey_(getOrderSubmittedBy_(row, columns));
  return !!(user.capabilities && (user.capabilities.hasExplicitOrderProcessingPermission || hasProcessingDepartment_(user, row[1])) && actor && (actor === requester || actor === submitter));
}

function getAdminSignoffCleanupCandidates_(ss, rows, columns) {
  const users = ss.getSheetByName('Users');
  const data = users.getDataRange().getValues();
  const schema = getUserConfigurationSchema_(users, false, data[0]);
  const admins = new Set(data.slice(1).filter(r => r[schema.roleIndex] === ROLE_ADMIN_)
    .map(r => normalizeConfigurationKey_(r[schema.emailIndex])));
  return rows.slice(1).filter(row => {
    const processor = normalizeConfigurationKey_(row[columns.processedByIndex]);
    return !isOrderCancelled_(row, columns) &&
      [APPROVAL_AWAITING_, APPROVAL_QUERY_].includes(getOrderApprovalStatus_(row, columns)) &&
      admins.has(processor) && processor === normalizeConfigurationKey_(row[3]) &&
      processor === normalizeConfigurationKey_(getOrderSubmittedBy_(row, columns));
  }).map(row => ({id:String(row[0]), actor:String(row[columns.processedByIndex]), description:String(row[6]), version:orderVersion_(row)}));
}

function getAdminSignoffCleanupPreview() {
  const user = getUserContext();
  if (user.role !== ROLE_ADMIN_ || user.isSimulated) throw createAuthError_('Admin required.');
  const ss = getPortalSpreadsheet_(), sheet = ss.getSheetByName('Orders');
  return getAdminSignoffCleanupCandidates_(ss, sheet.getDataRange().getValues(), getOrdersMetadataColumnsForRead_(sheet));
}

function clearAdminPurchaseSignoffs(items) {
  return withWriteLock_('clearAdminPurchaseSignoffs', () => {
    const user = getUserContext();
    if (user.role !== ROLE_ADMIN_ || user.isSimulated) throw createAuthError_('Admin required.');
    if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Choose the Admin purchases to clear.');
    const ss = getPortalSpreadsheet_(), sheet = ss.getSheetByName('Orders');
    const columns = ensureOrdersMetadataColumns_(sheet), rows = sheet.getDataRange().getValues();
    const eligible = new Map(getAdminSignoffCleanupCandidates_(ss, rows, columns).map(item => [item.id,item]));
    const ids = new Set();
    const selected = items.map(item => {
      const id = String(item.id || '');
      if (ids.has(id) || !eligible.has(id)) throw new Error('A selected record is no longer an Admin purchase awaiting sign-off. Reload before retrying.');
      ids.add(id); assertUniqueOrderReference_(rows,id);
      const index = rows.findIndex(row => String(row[0]) === id);
      requireOrderVersion_(rows[index],item.version);
      return {index,row:rows[index]};
    });
    selected.forEach(({index,row}) => {
      writeAdjacentOrderCells_(sheet,index+1,[[columns.approvalStatusColumn,APPROVAL_NOT_REQUIRED_],[columns.approvedByColumn,''],[columns.approvedAtColumn,'']]);
      row[columns.approvalStatusIndex]=APPROVAL_NOT_REQUIRED_;
      row[columns.approvedByIndex]='';row[columns.approvedAtIndex]='';
      appendOrderApprovalAudit_(ss,row,columns,'ADMIN_SIGNOFF_NOT_REQUIRED',user.email,'Admin exemption restored; obsolete sign-off requirement cleared.');
    });
    markDataChanged_();
    return {success:true,cleared:selected.length,ids:Array.from(ids)};
  });
}

function adminSignoffCleanupPage_() {
  const items = getAdminSignoffCleanupPreview();
  const list = items.map(item => `<li>${escapeEmailHtml_(item.id)} — ${escapeEmailHtml_(item.actor)} — ${escapeEmailHtml_(item.description)}</li>`).join('');
  const payload = JSON.stringify(items.map(item => ({id:item.id,version:item.version}))).replace(/</g,'\\u003c');
  return HtmlService.createHtmlOutput(`<h1>Admin sign-off cleanup</h1><p>${items.length} Admin purchases have an obsolete sign-off requirement. Purchase details and invoice processing status are preserved.</p><ul>${list}</ul><button ${items.length?'':'disabled'} onclick="this.disabled=true;google.script.run.withSuccessHandler(r=>{document.getElementById('result').textContent=JSON.stringify(r);}).withFailureHandler(e=>{document.getElementById('result').textContent=e.message;}).clearAdminPurchaseSignoffs(${escapeEmailHtml_(payload)})">Clear listed Admin sign-offs</button><pre id="result"></pre>`).setTitle('Admin sign-off cleanup');
}

function writeAdjacentOrderCells_(sheet, rowNumber, cells) {
  const sorted = cells.slice().sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < sorted.length;) {
    const column = sorted[i][0];
    const values = [sorted[i++][1]];
    while (i < sorted.length && sorted[i][0] === column + values.length) values.push(sorted[i++][1]);
    sheet.getRange(rowNumber, column, 1, values.length).setValues([values]);
  }
}

function applyOrderProcessingApproval_(ss, sheet, rowNumber, row, columns, user) {
  const actor = normalizeConfigurationKey_(user.isSimulated && isDevelopmentRuntime_()
    ? user.email
    : (user.realEmail || user.email));
  const requiresSignoff = shouldRequireIndependentSignoff_(user, row, columns);
  const revision = requiresSignoff ? Number(row[columns.approvalRevisionIndex] || 0) + 1 : Number(row[columns.approvalRevisionIndex] || 0);
  const status = requiresSignoff ? APPROVAL_AWAITING_ : APPROVAL_NOT_REQUIRED_;
  writeAdjacentOrderCells_(sheet, rowNumber, [
    [columns.processedByColumn, actor], [columns.approvalStatusColumn, status],
    [columns.approvalRevisionColumn, revision], [columns.approvedByColumn, ""], [columns.approvedAtColumn, ""]
  ]);
  row[columns.processedByIndex] = actor;
  row[columns.approvalStatusIndex] = status;
  row[columns.approvalRevisionIndex] = revision;
  row[columns.approvedByIndex] = "";
  row[columns.approvedAtIndex] = "";
  appendOrderApprovalAudit_(ss, row, columns, requiresSignoff ? "SIGNOFF_REQUIRED" : "PROCESSED_NO_SIGNOFF_REQUIRED", actor, "");
  return requiresSignoff ? buildApprovalRequiredEmailPayloads_(ss, row, columns) : [];
}

function ensureOrderChangeAuditSheet_(ss) {
  const sheetName = "Order Change Audit";
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const headers = ["Timestamp", "Order ID", "Actor Email", "Field", "Old Value", "New Value"];
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  try { sheet.hideSheet(); } catch (e) {}
  return sheet;
}

function appendOrderFieldChanges_(ss, orderId, actorEmail, changes) {
  if (!changes || !changes.length) return;
  const now = new Date();
  const rows = changes.map(change => [
    now,
    orderId,
    actorEmail || "",
    change.field,
    change.oldValue == null ? "" : change.oldValue,
    change.newValue == null ? "" : change.newValue
  ]);
  const sheet = ensureOrderChangeAuditSheet_(ss);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
}

function collectOrderFieldChanges_(oldRow, replacements) {
  const changes = [];
  (replacements || []).forEach(item => {
    const oldValue = oldRow[item.index];
    const oldComparable = oldValue instanceof Date ? oldValue.getTime() : String(oldValue == null ? "" : oldValue);
    const newComparable = item.value instanceof Date ? item.value.getTime() : String(item.value == null ? "" : item.value);
    if (oldComparable !== newComparable) changes.push({ field: item.field, oldValue: oldValue, newValue: item.value });
  });
  return changes;
}

function appendPurchaseNoteText_(existing, entry) {
  const current = String(existing ?? '');
  if (!entry) return current;
  return current + (current && !/[\r\n]$/.test(current) ? '\n' : '') + entry;
}

function resetOrderApprovalAfterMaterialChange_(ss, sheet, rowNumber, row, columns, actorEmail, privateNote) {
  const requester = normalizeConfigurationKey_(row[3]);
  const processor = normalizeConfigurationKey_(row[columns.processedByIndex]);
  const submitter = normalizeConfigurationKey_(getOrderSubmittedBy_(row, columns));
  if (getOrderApprovalStatus_(row, columns) === APPROVAL_NOT_REQUIRED_) return [];
  const revision = Number(row[columns.approvalRevisionIndex] || 0) + 1;
  sheet.getRange(rowNumber, columns.approvalStatusColumn).setValue(APPROVAL_AWAITING_);
  sheet.getRange(rowNumber, columns.approvalRevisionColumn).setValue(revision);
  sheet.getRange(rowNumber, columns.approvedByColumn).setValue("");
  sheet.getRange(rowNumber, columns.approvedAtColumn).setValue("");
  row[columns.approvalStatusIndex] = APPROVAL_AWAITING_;
  row[columns.approvalRevisionIndex] = revision;
  row[columns.approvedByIndex] = "";
  row[columns.approvedAtIndex] = "";
  appendOrderApprovalAudit_(ss, row, columns, "MATERIAL_CHANGE_RESUBMITTED", actorEmail, privateNote || "");
  return buildApprovalRequiredEmailPayloads_(ss, row, columns);
}

function reviewOrderApproval(orderId, decision, privateNote, expectedVersion) {
  let emailPayloads = [];
  try {
    const result = withWriteLock_("reviewOrderApproval", () => {
      const user = getUserContext();
      if (!user.capabilities.canApproveOrders) return { success: false, error: "Unauthorized" };
      if (user.isSimulated && !isDevelopmentRuntime_()) return { success: false, error: "Approval decisions cannot be made in simulation mode." };
      const id = validateTextField_(orderId, "Order reference", { required: true, maxLength: 100 });
      const action = (decision || "").toString().trim().toUpperCase();
      if (!["APPROVE", "QUERY"].includes(action)) return { success: false, error: "Choose Approve or Raise query." };
      const note = validateTextField_(privateNote, "Private review note", { required: action === "QUERY", maxLength: 1000 });
      const ss = getPortalSpreadsheet_();
      const sheet = ss.getSheetByName("Orders");
      const columns = ensureOrdersMetadataColumns_(sheet);
      const rows = sheet.getRange(1, 1, sheet.getLastRow(), columns.lastColumn).getValues();
      assertUniqueOrderReference_(rows, id);
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || "") !== id) continue;
        const row = rows[i];
        requireOrderVersion_(row, expectedVersion);
        if (!getOrderRecordActions_(user, row, columns).canApprove) return { success: false, error: "You are not authorised to review this purchase." };
        const status = getOrderApprovalStatus_(row, columns);
        if (![APPROVAL_AWAITING_, APPROVAL_QUERY_].includes(status)) return { success: false, error: "This order is not awaiting a review decision." };
        const actor = normalizeConfigurationKey_(user.isSimulated && isDevelopmentRuntime_()
          ? user.email
          : (user.realEmail || user.email));
        const requester = normalizeConfigurationKey_(row[3]);
        const processor = normalizeConfigurationKey_(row[columns.processedByIndex]);
        if (!actor || (user.role !== ROLE_ADMIN_ && (actor === requester || actor === processor || actor === normalizeConfigurationKey_(getOrderSubmittedBy_(row, columns))))) return { success: false, error: "You cannot review your own purchase." };
        const nextStatus = action === "APPROVE" ? APPROVAL_APPROVED_ : APPROVAL_QUERY_;
        sheet.getRange(i + 1, columns.approvalStatusColumn).setValue(nextStatus);
        sheet.getRange(i + 1, columns.approvedByColumn).setValue(action === "APPROVE" ? actor : "");
        sheet.getRange(i + 1, columns.approvedAtColumn).setValue(action === "APPROVE" ? new Date() : "");
        row[columns.approvalStatusIndex] = nextStatus;
        row[columns.approvedByIndex] = action === "APPROVE" ? actor : "";
        row[columns.approvedAtIndex] = action === "APPROVE" ? new Date() : "";
        appendOrderApprovalAudit_(ss, row, columns, action === "APPROVE" ? "APPROVED" : "QUERY_RAISED", actor, note);
        emailPayloads = [{
          to: getConfig_().financeEmail,
          subject: `${action === "APPROVE" ? "Sign-off approved" : "Review query raised"}: ${getOrderRecordType_(row, columns.recordTypeIndex)} ${id}`,
          body: formatEmailBody_(action === "APPROVE" ? "Purchase sign-off approved" : "Purchase review query", `${escapeEmailHtml_(actor)} ${action === "APPROVE" ? "approved the recorded purchase" : "raised a review query"} for ${escapeEmailHtml_(processor)}.${note ? `<br><br><strong>Private review note:</strong> ${escapeEmailHtml_(note)}` : ""}`, extractOrderData_(row, columns))
        }];
        markDataChanged_();
        return { success: true, saved: true, message: action === "APPROVE" ? "Order sign-off approved." : "Review query raised." };
      }
      return { success: false, error: "Order not found." };
    }, () => ({ success: false, error: "System busy. Please try again." }));
    if (result && result.success) {
      const warning = buildNotificationWarning_(emailPayloads);
      if (warning) result.warningMessage = warning.message;
    }
    return result;
  } catch (e) {
    if (isPortalValidationError_(e)) return { success: false, error: e.message };
    logError_(e, "reviewOrderApproval");
    throw e;
  }
}

function resubmitOrderApproval(orderId, privateNote, expectedVersion) {
  let emailPayloads = [];
  try {
    const result = withWriteLock_("resubmitOrderApproval", () => {
      const user = getUserContext();
      if (user.isSimulated && !isDevelopmentRuntime_()) return { success: false, error: "Approval actions cannot be made in simulation mode." };
      const id = validateTextField_(orderId, "Order reference", { required: true, maxLength: 100 });
      const note = validateTextField_(privateNote, "Private response", { maxLength: 1000 });
      const ss = getPortalSpreadsheet_();
      const sheet = ss.getSheetByName("Orders");
      const columns = ensureOrdersMetadataColumns_(sheet);
      const rows = sheet.getRange(1, 1, sheet.getLastRow(), columns.lastColumn).getValues();
      assertUniqueOrderReference_(rows, id);
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || "") !== id) continue;
        const row = rows[i];
        requireOrderVersion_(row, expectedVersion);
        const actor = normalizeConfigurationKey_(user.email || user.realEmail);
        const processor = normalizeConfigurationKey_(row[columns.processedByIndex]);
        if (!getOrderRecordActions_(user, row, columns).canResubmit) return { success: false, error: "Only an authorised processor or Admin can resubmit this review." };
        if (getOrderApprovalStatus_(row, columns) !== APPROVAL_QUERY_) return { success: false, error: "This order does not have an open review query." };
        const revision = Number(row[columns.approvalRevisionIndex] || 0) + 1;
        sheet.getRange(i + 1, columns.approvalStatusColumn).setValue(APPROVAL_AWAITING_);
        sheet.getRange(i + 1, columns.approvalRevisionColumn).setValue(revision);
        row[columns.approvalStatusIndex] = APPROVAL_AWAITING_;
        row[columns.approvalRevisionIndex] = revision;
        appendOrderApprovalAudit_(ss, row, columns, "RESUBMITTED", actor, note);
        emailPayloads = buildApprovalRequiredEmailPayloads_(ss, row, columns);
        markDataChanged_();
        return { success: true, saved: true, message: "Order resubmitted for independent sign-off." };
      }
      return { success: false, error: "Order not found." };
    }, () => ({ success: false, error: "System busy. Please try again." }));
    if (result && result.success) {
      const warning = buildNotificationWarning_(emailPayloads);
      if (warning) result.warningMessage = warning.message;
    }
    return result;
  } catch (e) {
    if (isPortalValidationError_(e)) return { success: false, error: e.message };
    logError_(e, "resubmitOrderApproval");
    throw e;
  }
}

function getOrderApprovalHistory(orderId) {
  const user = getUserContext();
  if (!canAccessPrivateReviewHistory_(user)) {
    throw createAuthError_("Access denied.", "approval_history_not_allowed", { realEmail: user.realEmail || "" });
  }
  const id = validateTextField_(orderId, "Order reference", { required: true, maxLength: 100 });
  const ss = getPortalSpreadsheet_();
  const orders = ss.getSheetByName("Orders");
  const columns = getOrdersMetadataColumnsForRead_(orders);
  const orderData = orders.getDataRange().getValues();
  const row = orderData.slice(1).find(record => String(record[0]) === id && canViewOrderApprovalHistory_(user,record,columns));
  if (!row) throw createAuthError_("Access denied.", "approval_history_budget_denied");
  assertUniqueOrderReference_(orderData,id);
  const sheet = ss.getSheetByName(ORDER_APPROVAL_AUDIT_SHEET_);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues()
    .filter(row => String(row[1] || "") === id)
    .map(row => ({
      timestamp: row[0] instanceof Date ? row[0].toISOString() : String(row[0] || ""),
      revision: row[2],
      action: row[3],
      actor: row[4],
      note: row[7] || ""
    }));
}

function escapeEmailHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseBulkExpectedDate_(value) {
  const raw = String(value || "").trim();
  if (!raw) return { valid: true, value: "", display: "-" };
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { valid: false, value: "", display: "" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid
    ? { valid: true, value: date, display: Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy") }
    : { valid: false, value: "", display: "" };
}

function canEditBulkRange_(range) {
  try {
    return !!(range && range.canEdit());
  } catch (e) {
    console.log("[ACCESS] Bulk range edit check failed: " + e.toString());
    return false;
  }
}

function formatBulkCompletionEmail_(items) {
  const invoices = items.some(item => item.recordType === 'Invoice');
  const orders = items.some(item => item.recordType !== 'Invoice');
  const title = invoices ? (orders ? 'Orders and invoices updated' : 'Invoices processed') : 'Orders confirmed';
  const cards = items.map(item => '<table class="email-details" width="100%" style="table-layout:fixed;border-collapse:collapse;margin:18px 0;background:#ffffff">' +
    emailDetailRow_('Reference', '<a href="'+escapeEmailHtml_(getPurchaseDeepLink_(item.id,false))+'">'+escapeEmailHtml_(item.id)+'</a>', true) +
    emailDetailRow_('Item', item.desc) + emailDetailRow_('Status', item.recordType === 'Invoice' ? 'Invoice processed' : 'Order marked as ordered') +
    emailDetailRow_('Quantity',item.qty) + emailDetailRow_('Actual total',emailMoney_(item.finalPrice)) +
    emailDetailRow_('Expected delivery',item.expectedDateDisplay === '-' ? '' : item.expectedDateDisplay) +
    emailDetailRow_('Processed by',item.processedBy ? getOrderChatDisplayName_(item.processedBy) : 'Not recorded') +
    emailDetailRow_('Cost note',item.costNote) + '</table>').join('');
  const subtotal = items.reduce((sum,item)=>sum+Number(item.finalPrice || 0),0);
  return '<h2>'+title+'</h2><p>The following purchases were updated in the portal. Select a reference to see its details.</p>'+cards+'<p><strong>Subtotal: '+emailMoney_(subtotal)+'</strong></p>';
}

function formatEmailBody_(title, introMsg, order) {
  const hasFinal = order.finalPrice !== '' && order.finalPrice != null;
  const invoice = order.recordType === 'Invoice';
  const final = hasFinal || invoice;
  let link = '';
  try { const url = normalizeHttpUrl_(order.link,'Supplier link'); if(url) link='<a href="'+escapeEmailHtml_(url)+'">View product</a>'; } catch(e) {}
  const attachments = parseOrderAttachmentUrls_(order.attachment).map((url,i)=>'<a href="'+escapeEmailHtml_(url)+'">View file '+(i+1)+'</a>').join('<br>');
  const review = /review|sign-off/i.test(title);
  const identity = value => value ? getOrderChatDisplayName_(value) + ' (' + value + ')' : '';
  const rows = emailDetailRow_('Reference',order.id) + emailDetailRow_('Purchasing status',order.status) +
    emailDetailRow_('Item',order.desc) + emailDetailRow_(final ? 'Actual total' : 'Estimated total',emailMoney_(hasFinal ? order.finalPrice : order.totalPrice)) +
    emailDetailRow_('Quantity',invoice ? '' : order.qty) + emailDetailRow_('Product code',invoice ? '' : order.code) + emailDetailRow_('Supplier',order.supplier) +
    emailDetailRow_('Invoice number',order.invoiceNumber) + emailDetailRow_('Payment method',order.paymentMethod) +
    emailDetailRow_('Department',order.dept) + emailDetailRow_('Delivery site',invoice ? '' : order.location) +
    emailDetailRow_('Requester',identity(order.requester)) +
    emailDetailRow_('Submitted by',order.submittedBy && order.submittedBy !== order.requester ? identity(order.submittedBy) : '') +
    emailDetailRow_('Processed by',order.processedBy ? identity(order.processedBy) : (order.recordType === 'Order' && order.isCompleted ? 'Not recorded' : '')) +
    emailDetailRow_(invoice ? 'Logged date' : 'Request date',emailDate_(order.date)) + emailDetailRow_('Required by',invoice ? '' : emailDate_(order.dateNeeded)) +
    emailDetailRow_('Expected delivery',emailDate_(order.dateExpected)) + emailDetailRow_('Product link',link,true) + emailDetailRow_('Attachments',attachments,true);
  return '<h2>'+escapeEmailHtml_(title)+'</h2><div style="margin-bottom:18px">'+String(introMsg || '').replace(/\n/g,'<br>')+'</div>' +
    (order.id ? emailAction_(getPurchaseDeepLink_(order.id,review),review ? 'Review purchase' : 'View purchase') : '') +
    '<table class="email-details" width="100%" style="table-layout:fixed;border-collapse:collapse;background:#ffffff">'+rows+'</table>' +
    (order.notes ? '<div class="email-panel" style="margin-top:20px;background:#f2f4f7;padding:16px;border-left:3px solid #2f3886;font-size:13px;line-height:21px"><strong>Conversation history</strong><br>'+escapeEmailHtml_(order.notes).replace(/\n/g,'<br>')+'</div>' : '');
}

// --- WRITE ENDPOINT OVERRIDES (LOCKED + VERSIONED + POST-LOCK EMAILS) ---

function parseOrderAttachmentUrls_(value) {
  const seen = {};
  return (value || "").toString()
    .split(/\s*,\s*/)
    .map(url => url.trim())
    .filter(url => {
      if (!/^https?:\/\//i.test(url) || seen[url]) return false;
      seen[url] = true;
      return true;
    });
}

function getOrderUploadFiles_(form) {
  let files = Array.isArray(form && form.files) ? form.files.slice() : [];
  if (!files.length && form && form.fileData && form.fileName) {
    files = [{
      data: form.fileData,
      name: form.fileName,
      type: form.mimeType
    }];
  }
  if (files.length > 5) throw new Error("You can add up to 5 new files to one order.");

  return files.map(file => {
    const data = (file && file.data || "").toString();
    const name = validateTextField_(file && file.name, "Attachment filename", { required: true, maxLength: 180 });
    const type = validateTextField_(file && file.type || "application/octet-stream", "Attachment type", { maxLength: 120 }) || "application/octet-stream";
    if (!data || !name) throw new Error("One of the selected attachments is incomplete. Remove it and choose the file again.");
    if (data.length > 7 * 1024 * 1024) throw new Error(`${name} is larger than the 5 MB attachment limit.`);
    return { data: data, name: name, type: type };
  });
}

function preparePortalUploads_(form, invoice, uploadedFileIds) {
  const files = getOrderUploadFiles_(form);
  if (invoice && !canLogInvoiceDepartment_(getUserContext(), form.dept)) throw createPortalValidationError_("Unauthorized department.");
  if (!files.length) return [];
  const user = getUserContext();
  requireCapability_(user, invoice ? 'canLogInvoice' : (form.id ? 'canEditExistingOrders' : 'canCreateRequests'));
  if (form.id) {
    const sheet = getPortalSpreadsheet_().getSheetByName('Orders');
    const columns = getOrdersMetadataColumnsForRead_(sheet);
    const rows = sheet.getDataRange().getValues();
    assertUniqueOrderReference_(rows, form.id);
    const row = rows.slice(1).find(r => String(r[0]) === String(form.id));
    const canEdit = row && (invoice
      ? canProcessOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex))
      : canEditPendingRequest_(user,row,columns));
    if (!canEdit) throw createPortalValidationError_('This order is not available for editing.');
    requireOrderVersion_(row, form.expectedVersion);
  }
  return files.map(file => {
    const uploaded = uploadFileToDrive_(file.data, file.name, file.type);
    uploadedFileIds.push(uploaded.fileId);
    return uploaded.url;
  });
}

function submitOrder(form) {
  let approvalEmails = [];
  let budgetRequestEmails = [];
  let emailPayload = null;
  let orderChatPayload = null;
  const uploadedFileIds = [];
  let orderRowSaved = false;
  let wasEdit = false;
  let savedOrderReference = "";
  let editChanges = [];
  const submitStartedMs = nowMs_();
  const requestContext = normalizePortalRequestContext_({
    requestId: form && form.clientRequestId,
    source: "submit_order",
    attempt: 1
  }, "submit_order");
  const identityMarkers = getIdentityMarkers_();
  requestContext.email = identityMarkers.activeEmail || "";
  logPortalRequest_("submit_start", requestContext);
  try {
    if (!form.id) { const replay = portalCreatePreflight_('order',form); if (replay) return replay; }
    const uploadedAttachmentUrls = preparePortalUploads_(form, false, uploadedFileIds);
    const result = withWriteLock_("submitOrder", () => {
      const user = getUserContext();
      requestContext.email = (user.realEmail || user.email || requestContext.email || "").toString().trim().toLowerCase();
      const config = getConfig_();
      const ss = getPortalSpreadsheet_();
      const sheet = ss.getSheetByName("Orders");
      const orderColumns = ensureOrdersMetadataColumns_(sheet);
      const input = form && typeof form === "object" ? form : {};
      const supplier = validateTextField_(input.supplier, "Supplier", { required: true, maxLength: 200 });
      const description = validateTextField_(input.desc, "Description", { required: true, maxLength: 500 });
      const code = validateTextField_(input.code, "Product code", { maxLength: 100 });
      const location = validateTextField_(input.location, "Location", { maxLength: 100 });
      const userNote = validateTextField_(input.userNote, "Note", { maxLength: 1000 });
      const link = normalizeSupplierLinkValue_(input.link);
      const quantity = validateQuantityField_(input.qty);
      const alreadyOrdered = input.alreadyOrdered === true;
      const parsedUnitPrice = validateMoneyField_(input.unitPrice, "Unit price", { nonNegative: true, allowBlank: alreadyOrdered });
      const unitPrice = parsedUnitPrice === null ? "" : parsedUnitPrice;
      const calculatedTotal = unitPrice === "" ? "" : Math.round(quantity * unitPrice * 100) / 100;
      if (calculatedTotal !== "" && (!Number.isFinite(calculatedTotal) || calculatedTotal > 1000000000)) throw createPortalValidationError_("Order total is outside the supported range.");
      if (!alreadyOrdered && calculatedTotal <= 0) throw createPortalValidationError_("Enter a unit price greater than zero. The total is calculated from the quantity.");
      const dateNeeded = parseOptionalDateField_(input.dateNeeded, "Date needed");
      const requestedId = validateTextField_(input.id, "Order reference", { maxLength: 100 });
      const id = requestedId || nextOrderId_();
      savedOrderReference = id;
      const isEdit = !!input.id;
      wasEdit = isEdit;
      if (isEdit) {
        requireCapability_(
          user,
          "canEditExistingOrders",
          "Access denied. You do not have permission to edit existing orders.",
          "submit_order_edit_not_allowed"
        );
      } else {
        requireCapability_(
          user,
          "canCreateRequests",
          "Access denied. You do not have permission to create new requests.",
          "submit_order_create_not_allowed"
        );
      }
      let deptToLog = validateTextField_(input.selectedDept, "Department", { required: true, maxLength: 200 });
      const mayChooseAnyDepartmentForEdit = isEdit && (user.capabilities.hasExplicitOrderProcessingPermission || hasProcessingDepartment_(user, deptToLog));
      if (!user.capabilities.canUseAllDepartmentView && !mayChooseAnyDepartmentForEdit && !user.depts.includes(deptToLog)) {
        throw createPortalValidationError_("You no longer have access to the selected department. Your draft has not been saved. Choose an authorised department explicitly.");
      }

      if (alreadyOrdered && (isEdit || input.selectedDept !== deptToLog || !canProcessOrderRecord_(user, deptToLog, "Order"))) {
        throw createPortalValidationError_("You do not have ordering permission for this department.");
      }
      const orderedCost = alreadyOrdered ? validateActualOrderTotal_(input.finalCost,input.noChargeConfirmed,input.noChargeReason) : null;
      const orderedDelivery = alreadyOrdered ? parseOptionalDateField_(input.deliveryDate, "Expected delivery date") : "";
      const orderedPayment = alreadyOrdered ? validateOrderPaymentMethod_(input.paymentMethod, orderedCost !== 0) : "";
      const supplierReference = alreadyOrdered ? validateTextField_(input.supplierOrderReference, "Supplier order reference", {maxLength:100}) : "";

      let isOverBudget = false;
      let remainingBudget = 0;
      const budgets = getBudgetSnapshot_(ss);
      if (!deptToLog || !budgets[deptToLog] || isSystemBudgetDepartment_(deptToLog)) {
        throw new Error("Please choose an active department with a live budget.");
      }
      if (budgets[deptToLog].hasCalculationError) {
        throw new Error("This department's budget calculation is unavailable. Please contact Finance before saving an order against it.");
      }
      const orderGlCode = getBudgetGlCode_(budgets, deptToLog);
      if (budgets[deptToLog]) remainingBudget = budgets[deptToLog].remaining;
      if ((alreadyOrdered ? orderedCost : calculatedTotal) > remainingBudget) isOverBudget = true;

      if (!isEdit) {
        const replay = beginPortalRequest_('order', input, user);
        if (replay) return replay;
        portalTransaction_.patches.push({ sheet: portalTransaction_.receipt.sheet, row: portalTransaction_.receipt.row, column: 5, values: [[id]] });
      }
      let orderRequester = isEdit ? user.email : resolveOrderRequester_(user, deptToLog, input.requesterEmail);
      let orderSubmitter = user.isDevTest ? user.email : (user.realEmail || user.email);

      let finalAttachmentString = uploadedAttachmentUrls.join(", ");
      let orderRequestDate = new Date();

      let initialNote = "";
      if (userNote) {
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
        const senderName = user.email.split('@')[0];
        initialNote = `[${timestamp} ${senderName}]: ${userNote}\n`;
      }

      if (supplierReference) initialNote += "Supplier order reference: " + supplierReference + "\n";

      if (isEdit) {
        const data = sheet.getRange(1, 1, sheet.getLastRow(), orderColumns.lastColumn).getValues();
      assertUniqueOrderReference_(data, id);
        let orderFound = false;
        for (let i = 1; i < data.length; i++) {
          if (data[i][0].toString() == id.toString()) {
            orderFound = true;
            requireOrderVersion_(data[i], input.expectedVersion);
            const currentRecordType = getOrderRecordType_(data[i], orderColumns.recordTypeIndex);
            const currentDescription = (data[i][6] || "").toString().trim().toUpperCase();
            if (!canEditPendingRequest_(user, data[i], orderColumns)) {
              throw new Error("Access denied. Only authorised normal orders can be edited.");
            }
            if (isOrderCompleted_(data[i]) || isOrderCancelled_(data[i], orderColumns)) {
              throw new Error("This order can no longer be edited. Reload the Order List to see its current status.");
            }
            const row = i + 1;
            const currentAttachments = parseOrderAttachmentUrls_(data[i][19]);
            const currentAttachmentMap = {};
            currentAttachments.forEach(url => { currentAttachmentMap[url] = true; });
            const requestedRemovals = Array.isArray(form.removedAttachments) ? form.removedAttachments : [];
            const removalMap = {};
            requestedRemovals.forEach(url => {
              const normalized = (url || "").toString().trim();
              if (currentAttachmentMap[normalized]) removalMap[normalized] = true;
            });
            finalAttachmentString = currentAttachments
              .filter(url => !removalMap[url])
              .concat(uploadedAttachmentUrls)
              .filter((url, index, all) => all.indexOf(url) === index)
              .join(", ");
            orderRequester = (data[i][3] || user.email).toString();
            orderSubmitter = getOrderSubmittedBy_(data[i], orderColumns);
            orderRequestDate = data[i][2] || orderRequestDate;
            if (deptToLog !== data[i][1] && !isActiveOrderRequesterForDepartment_(ss,orderRequester,deptToLog)) {
              throw createPortalValidationError_("The original requester is not eligible for that department. Choose a department they can use; their identity cannot be changed by editing.");
            }

            editChanges = collectOrderFieldChanges_(data[i], [
              { field: "Department", index: 1, value: deptToLog },
              { field: "Supplier", index: 4, value: supplier },
              { field: "Supplier Link", index: 5, value: link },
              { field: "Description", index: 6, value: description },
              { field: "Product Code", index: 7, value: code },
              { field: "Quantity", index: 8, value: quantity },
              { field: "Unit Price", index: 9, value: unitPrice },
              { field: "Total", index: 10, value: calculatedTotal },
              { field: "Delivery Location", index: 11, value: location },
              { field: "Required Date", index: 12, value: dateNeeded },
              { field: "Attachments", index: 19, value: finalAttachmentString },
              { field: "GL Code", index: orderColumns.glCodeIndex, value: orderGlCode }
            ]);

            sheet.getRange(row, 2).setValue(deptToLog);
            sheet.getRange(row, 5, 1, 9).setValues([[supplier, link, description, code, quantity, unitPrice, calculatedTotal, location, dateNeeded]]);
            sheet.getRange(row, 20).setValue(finalAttachmentString);
            sheet.getRange(row, orderColumns.glCodeColumn).setValue(orderGlCode);
            if (orderColumns.reportingSiteColumn) sheet.getRange(row, orderColumns.reportingSiteColumn).setValue(normalizeOrderReportingSite_(location) || 'Unassigned');
            if (initialNote) {
              const currentNotes = data[i][17] || "";
              sheet.getRange(row, 18).setValue(appendPurchaseNoteText_(currentNotes,initialNote));
            }
            appendOrderFieldChanges_(
              ss,
              id,
              normalizeConfigurationKey_(user.isSimulated && isDevelopmentRuntime_() ? user.email : (user.realEmail || user.email)),
              editChanges
            );
            break;
          }
        }
        if (!orderFound) throw new Error("This order could not be found. Reload the Order List and try again.");
      } else {
        const savedRequest = appendOrderRow_(sheet, [
          id, deptToLog, new Date(), orderRequester,
          supplier, link, description, code,
          quantity, unitPrice, calculatedTotal,
          location, dateNeeded,
          alreadyOrdered ? new Date() : "", orderedDelivery, alreadyOrdered ? orderedCost : "", "", initialNote,
          "", finalAttachmentString
        ], "Order", orderGlCode, "", orderSubmitter, orderedPayment, normalizeOrderReportingSite_(location) || 'Unassigned');
        if (alreadyOrdered) {
          approvalEmails = applyOrderProcessingApproval_(ss,sheet,savedRequest.rowNumber,savedRequest.row,savedRequest.columns,user);
          if (orderedCost === 0) appendOrderFieldChanges_(ss,id,financeMutationActor_(user),[
            {field:'No-charge reason',oldValue:'',newValue:String(input.noChargeReason).trim()}
          ]);
        }
      }

      SpreadsheetApp.flush();
      // The transaction sets saved only after the atomic commit returns.
      markDataChanged_();

      const orderObj = {
        id: id,
        dept: deptToLog,
        date: Utilities.formatDate(new Date(orderRequestDate), Session.getScriptTimeZone(), "dd/MM/yyyy"),
        requester: orderRequester,
        submittedBy: orderSubmitter,
        supplier: supplier,
        link: link,
        desc: description,
        totalPrice: calculatedTotal,
        finalPrice: alreadyOrdered ? orderedCost : "",
        status: alreadyOrdered ? "Ordered" : "Pending",
        paymentMethod: orderedPayment,
        notes: initialNote,
        dateNeeded: dateNeeded,
        qty: quantity,
        code: code,
        location: location,
        dateExpected: orderedDelivery,
        attachment: finalAttachmentString
      };
      if (isEdit) {
        const changedSummary = editChanges.length
          ? "<ul>" + editChanges.map(change => `<li><strong>${escapeEmailHtml_(change.field)}:</strong> ${escapeEmailHtml_(change.oldValue)} &rarr; ${escapeEmailHtml_(change.newValue)}</li>`).join("") + "</ul>"
          : "<p>No material request fields changed.</p>";
        emailPayload = {
          to: orderRequester,
          subject: "Order request updated: " + description,
          body: formatEmailBody_("Order Request Updated", `${escapeEmailHtml_(getOrderChatDisplayName_(user.email))} updated this pending request.${changedSummary}`, orderObj)
        };
      } else if (alreadyOrdered) {
        emailPayload = {
          to: orderRequester,
          subject: "Order recorded: " + description,
          body: formatEmailBody_("Order Recorded", "Your purchase has been recorded as ordered.", orderObj)
        };
      } else {
        const subject = (isOverBudget ? "[OVER BUDGET] " : "") + "Order Request: " + description;
        const bodyArgs = isOverBudget ? "<strong style='color:red;'>Over budget warning</strong><br>A new order request has been submitted." : "A new order request has been submitted.";
        emailPayload = {
          to: config.financeEmail,
          subject: subject,
          body: formatEmailBody_("New Order Request", bodyArgs, orderObj),
          options: {
            replyTo: orderRequester,
            name: user.email.split('@')[0] + " (via Portal)"
          }
        };
        budgetRequestEmails = getBudgetRequestNotificationRecipients_(ss, deptToLog, orderSubmitter, [config.financeEmail])
          .map(to => ({
            to: to,
            subject: (isOverBudget ? '[OVER BUDGET] ' : '') + 'New request: ' + id + ' — ' + deptToLog,
            body: formatEmailBody_('New request in your budget', bodyArgs +
              '<br><br>You received this because you have processing rights for this budget. Open the request in the portal to view it or add a note.', orderObj)
          }));
      }
      orderChatPayload = createOrderChatPayload_(user, isEdit, orderObj);
      return "Success";
    }, () => "Error: System busy. Please try again.");

    if (result && result.replayed) { trashUploadedFiles_(uploadedFileIds); return result; }
    orderRowSaved = result === "Success";
    if (result !== "Success") {
      trashUploadedFiles_(uploadedFileIds);
      logPortalRequest_("submit_complete", requestContext, { status: "rejected", result: sanitizeDiagnosticValue_(result, 120), ms: nowMs_() - submitStartedMs });
      return createWriteFailure_(result);
    }
    let warning = buildNotificationWarning_((emailPayload ? [emailPayload] : []).concat(approvalEmails, budgetRequestEmails));
    const orderChatResult = sendOrderChatAlert_(orderChatPayload);
    if (!orderChatResult.success && !warning) {
      warning = {
        code: "NOTIFICATION_FAILED",
        message: "Saved successfully, but one or more notifications could not be sent."
      };
    }
    logPortalRequest_("submit_complete", requestContext, { status: "success", ms: nowMs_() - submitStartedMs });
    return Object.assign(createWriteSuccess_(wasEdit ? "Order updated successfully." : "Order submitted successfully.", warning), {reference:savedOrderReference});
  } catch (e) {
    if (!orderRowSaved && !e.saveUncertain) trashUploadedFiles_(uploadedFileIds);
    if (isPortalValidationError_(e)) {
      logPortalRequest_("submit_complete", requestContext, { status: "validation_error", error: e.message, ms: nowMs_() - submitStartedMs });
      return createWriteFailure_(e.message);
    }
    logPortalRequest_("submit_complete", requestContext, { status: "error", error: e.toString(), ms: nowMs_() - submitStartedMs });
    logError_(e, "submitOrder");
    throw e;
  }
}

function createBudgetTransfer(form) {
  let emailPayload = null;
  try {
    const result = withWriteLock_("createBudgetTransfer", () => {
      const user = getUserContext();
      requireCapability_(
        user,
        "canUseBudgetTransfer",
        "Access denied. You do not have permission to perform budget transfers.",
        "budget_transfer_not_allowed"
      );

      const ss = getPortalSpreadsheet_();
      const config = getConfig_();
      const sheet = ss.getSheetByName("Orders");
      ensureOrdersRecordTypeColumn_(sheet);

      const sanitize = (str) => str ? str.toString().replace(/[<>]/g, "").trim() : "";
      const fromDept = sanitize(form.fromDept);
      const toDept = sanitize(form.toDept);
      const amount = validateMoneyField_(form.amount, "Transfer amount", { positive: true });

      if (!fromDept || !toDept) throw new Error("Please choose both departments.");
      if (fromDept === toDept) throw new Error("Transfer departments must be different.");
      if (!amount || amount <= 0) throw new Error("Transfer amount must be greater than zero.");
      if (isSystemBudgetDepartment_(fromDept) || isSystemBudgetDepartment_(toDept)) {
        throw new Error("Only departments with live budgets can be used for transfers.");
      }

      const replay = beginPortalRequest_("transfer", form, user);
      if (replay) return replay;
      const budgets = getBudgetSnapshot_(ss);
      if (!budgets[fromDept] || !budgets[toDept]) throw new Error("Only departments with live budgets can be used for transfers.");
      if (budgets[fromDept].hasCalculationError || budgets[toDept].hasCalculationError) {
        throw new Error("This transfer cannot be applied because one of the selected budget calculations is unavailable.");
      }
      if (amount > (Number(budgets[fromDept].remaining) || 0)) {
        throw new Error("Transfer amount exceeds the available remaining budget for the source department.");
      }
      const fromGlCode = getBudgetGlCode_(budgets, fromDept);
      const toGlCode = getBudgetGlCode_(budgets, toDept);

      const fromRemainingBefore = Number(budgets[fromDept].remaining) || 0;
      const toRemainingBefore = Number(budgets[toDept].remaining) || 0;
      const fromRemainingAfter = fromRemainingBefore - amount;
      const toRemainingAfter = toRemainingBefore + amount;

      const now = new Date();
      const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      const actor = user.email.split("@")[0];
      const note = `[${timestamp} ${actor}]: Budget transfer of GBP ${amount.toFixed(2)} from ${fromDept} to ${toDept}.`;
      const debitId = nextOrderId_();
      const creditId = nextOrderId_();

      appendOrderRow_(sheet, [
        debitId, fromDept, now, user.email,
        "Budget Transfer", "", `Budget Transfer to ${toDept}`, "TRANSFER",
        1, amount, amount,
        "Budget Transfer", now,
        now, "", amount, "", note,
        "Budget Transfer", ""
      ], "Transfer", fromGlCode);

      appendOrderRow_(sheet, [
        creditId, toDept, now, user.email,
        "Budget Transfer", "", `Budget Transfer from ${fromDept}`, "TRANSFER",
        1, -amount, -amount,
        "Budget Transfer", now,
        now, "", -amount, "", note,
        "Budget Transfer", ""
      ], "Transfer", toGlCode);

      SpreadsheetApp.flush();
      markDataChanged_();

      emailPayload = {
        to: config.financeEmail,
        subject: `Budget Transfer: ${fromDept} to ${toDept}`,
        body: `
          <h2>Budget transfer completed</h2><p>A budget transfer has been applied in the portal.</p>
          <table class="email-details" width="100%" style="table-layout:fixed;border-collapse:collapse;background:#ffffff">
          ${emailDetailRow_('Transferred by', actor)}
          ${emailDetailRow_('Transfer date', timestamp)}
          ${emailDetailRow_('Amount', emailMoney_(amount))}
          ${emailDetailRow_('From department', fromDept + ' (remaining: ' + emailMoney_(fromRemainingAfter) + ')')}
          ${emailDetailRow_('To department', toDept + ' (remaining: ' + emailMoney_(toRemainingAfter) + ')')}
          </table>`
      };
      return `Budget transfer completed: ${fromDept} to ${toDept} (GBP ${amount.toFixed(2)}).`;
    });

    if (result && result.replayed) return result;
    const warning = buildNotificationWarning_(emailPayload ? [emailPayload] : []);
    return createWriteSuccess_(result, warning);
  } catch (e) {
    logError_(e, "createBudgetTransfer");
    if (!e.saveUncertain && !String(e.message).includes("SAVE_STATUS_UNKNOWN")) return createWriteFailure_(e.message);
    throw e;
  }
}

function requireUniqueInvoice_(rows, columns, supplier, invoiceNumber, excludeId, targetType, user, reversedCreditIds) {
  if (!invoiceNumber) return;
  const type = targetType || 'Invoice';
  const matches = rows.slice(1).filter(row => {
    const recordType = getOrderRecordType_(row, columns.recordTypeIndex);
    return String(row[0]) !== String(excludeId) && !reversedCreditIds?.has(String(row[0])) && ['Order','Invoice'].includes(recordType) &&
      !isOrderCancelled_(row, columns) &&
      normalizeConfigurationKey_(row[4]) === normalizeConfigurationKey_(supplier) &&
      normalizeConfigurationKey_(getOrderInvoiceNumber_(row, recordType, columns.invoiceNumberIndex)) === normalizeConfigurationKey_(invoiceNumber);
  });
  if (!matches.length) return;
  const crossType = matches.filter(row=>getOrderRecordType_(row,columns.recordTypeIndex)!==type);
  const code = crossType.length ? 'DUPLICATE_ORDER_INVOICE' : 'DUPLICATE_INVOICE';
  const error = createPortalValidationError_('This supplier and invoice reference are already recorded. Check the existing purchase before continuing.', code);
  const visible = row => canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex));
  const match = user && (crossType.find(visible) || matches.find(visible));
  if (match) error.matchingOrderId = String(match[0]);
  throw error;
}

function invoiceWriteFailure_(error) {
  return Object.assign(createWriteFailure_(error.message), {
    code:error.validationCode || 'INVALID_INPUT',
    ...(error.matchingOrderId ? {matchingOrderId:error.matchingOrderId} : {}),
    ...(error.duplicateConfirmation ? {duplicateConfirmation:error.duplicateConfirmation} : {}),
    ...(error.recordId ? {recordId:error.recordId} : {})
  });
}

function possibleInvoiceDuplicate_(rows, columns, input, user) {
  if (String(input.invoiceNumber || input.invoiceRef || '').trim()) return null;
  const cutoff = Date.now() - 30 * 86400000;
  const matches = rows.slice(1).filter(row =>
    String(row[1]) === String(input.dept) && getOrderRecordType_(row, columns.recordTypeIndex) === 'Invoice' &&
    !isOrderCancelled_(row, columns) && normalizeConfigurationKey_(row[4]) === normalizeConfigurationKey_(input.supplier) &&
    Number(row[15] !== '' && row[15] != null ? row[15] : row[10]) === Number(input.cost) &&
    row[2] instanceof Date && row[2].getTime() >= cutoff);
  if (!matches.length) return null;
  const token = orderVersion_([input.dept, normalizeConfigurationKey_(input.supplier), String(input.desc || ''), Number(input.cost), input.paymentMethod,
    matches.map(row => [String(row[0]),orderVersion_(row)]).sort((a,b)=>a[0].localeCompare(b[0]))]);
  const references = matches.filter(row=>canViewOrderRecord_(user,row[1],'Invoice')).map(row=>String(row[0])).slice(0,5);
  return {token,references};
}


// Invoice corrections are separate from Finance processing and commit with their audit.
function invoiceAmountWarning_(cost, invoiceNumber) {
  const ref = String(invoiceNumber || '').trim();
  if (/^\d+$/.test(ref) && Number(ref) === Math.abs(Number(cost))) return 'The amount matches the invoice number. Check that you have entered the price.';
  if (Math.abs(Number(cost)) >= 100000) return 'This amount is £100,000 or more. Check the invoice total carefully.';
  return '';
}

function requireInvoiceAmountConfirmation_(cost, invoiceNumber, confirmed) {
  const warning = invoiceAmountWarning_(cost, invoiceNumber);
  if (warning && confirmed !== true) {
    const error = createPortalValidationError_(warning, 'INVOICE_AMOUNT_WARNING');
    error.invoiceAmountWarning = true;
    throw error;
  }
}

function getInvoiceProcessingAmount_(row, columns, amountConfirmed) {
  const amount = validateMoneyField_(row[10], 'Logged invoice amount', {nonZero:true});
  const invoiceNumber = getOrderInvoiceNumber_(row, 'Invoice', columns.invoiceNumberIndex);
  requireInvoiceAmountConfirmation_(amount, invoiceNumber, amountConfirmed);
  return amount;
}

function validateActualOrderTotal_(value, noChargeConfirmed, noChargeReason) {
  const amount = validateMoneyField_(value, 'Actual order total', {nonNegative:true});
  if (amount === 0 && noChargeConfirmed !== true) {
    throw createPortalValidationError_('Confirm that this was a no-charge order before saving £0.00.', 'NO_CHARGE_CONFIRMATION');
  }
  if (amount === 0) validateTextField_(noChargeReason,'Reason for no charge',{required:true,maxLength:300});
  return amount;
}

function financeMutationActor_(user) {
  return normalizeConfigurationKey_(user.isSimulated && isDevelopmentRuntime_() ? user.email : (user.realEmail || user.email));
}

function readFinanceMutationTarget_(form,user) {
  const id = validateTextField_(form.id, 'Order reference', {required:true,maxLength:100});
  const ss = getPortalSpreadsheet_(), sheet = ss.getSheetByName('Orders');
  const columns = getOrdersMetadataColumnsForRead_(sheet), rows = sheet.getDataRange().getValues();
  const matching = rows.flatMap((row,i)=>i > 0 && String(row[0]) === id ? [i] : []);
  const index = matching[0], row = rows[index];
  if (matching.length !== 1 || !canViewOrderRecord_(user,row[1],getOrderRecordType_(row,columns.recordTypeIndex))) {
    throw createPortalValidationError_('This purchase is unavailable. Refresh the Order List and check your access.','PURCHASE_UNAVAILABLE');
  }
  requireOrderVersion_(row,form.expectedVersion);
  return {id,ss,sheet,columns,rows,row,rowNumber:index + 1};
}

function uploadFinanceEvidence_(files, uploadedFileIds) {
  return files.map(file => {
    const uploaded = uploadFileToDrive_(file.data, file.name, file.type);
    uploadedFileIds.push(uploaded.fileId);
    return uploaded.url;
  });
}

function writeProcessedInvoice_(ss, sheet, rowNumber, row, columns, amount, actor, now, financeColumn) {
  sheet.getRange(rowNumber,9).setValue(1);
  sheet.getRange(rowNumber,14).setValue(now);
  sheet.getRange(rowNumber,16).setValue(amount);
  sheet.getRange(rowNumber,financeColumn).setValue(actor);
  appendOrderFieldChanges_(ss,String(row[0]),actor,[
    {field:'Status',oldValue:'Pending',newValue:'Processed'},
    {field:'Finance Processed By',oldValue:row[columns.financeProcessedByIndex] || '',newValue:actor}
  ]);
  row[8] = 1;
  row[13] = now;
  row[15] = amount;
  row[financeColumn - 1] = actor;
}

function processInvoice(input) {
  const form = input || {}, uploadedFileIds = [];
  let saved = false, notification = null;
  const authorize = (user, target) => {
    const {row,columns,ss} = target;
    if (!user.capabilities.canViewAllFinanceData || getOrderRecordType_(row,columns.recordTypeIndex) !== 'Invoice' ||
        isOrderCancelled_(row,columns) || isOrderCompleted_(row)) {
      throw createPortalValidationError_('This invoice is no longer available for Finance processing.');
    }
    requireRefundFinancialIntegrity_(row,columns);
    const budget = getBudgetSnapshot_(ss)[row[1]];
    if (!budget || isSystemBudgetDepartment_(row[1]) || budget.hasCalculationError) {
      throw createPortalValidationError_('This invoice needs an active department with an available budget calculation.');
    }
    return getInvoiceProcessingAmount_(row,columns,form.amountConfirmed);
  };
  try {
    const user = getAuthorizedUserContext_();
    requireCapability_(user,'canViewAllFinanceData','Only Finance can process invoices.');
    authorize(user,readFinanceMutationTarget_(form,user));
    const attachments = uploadFinanceEvidence_(getOrderUploadFiles_(form),uploadedFileIds);
    const result = withWriteLock_('processInvoice', () => {
      const user = getAuthorizedUserContext_(), target = readFinanceMutationTarget_(form,user);
      const amount = authorize(user,target), actor = financeMutationActor_(user);
      const {ss,sheet,row,rowNumber,columns} = target;
      const financeColumn = ensureOrdersColumn_(sheet, ORDER_FINANCE_PROCESSED_BY_HEADER_, {hidden:true});
      writeProcessedInvoice_(ss,sheet,rowNumber,row,columns,amount,actor,new Date(),financeColumn);
      const message = validateTextField_(form.message,'Message',{maxLength:1000});
      if (message) {
        const timestamp = Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'dd/MM HH:mm');
        row[17] = appendPurchaseNoteText_(row[17],`[${timestamp} Finance]: ${message}\n`);
        sheet.getRange(rowNumber,18).setValue(row[17]);
      }
      if (attachments.length) {
        row[19] = parseOrderAttachmentUrls_(row[19]).concat(attachments).join(', ');
        sheet.getRange(rowNumber,20).setValue(row[19]);
      }
      const requester = String(row[3] || '');
      if (requester && !requester.includes('Finance (Direct)')) {
        const order = extractOrderData_(row,columns);
        order.processedBy = actor;
        const intro = 'Finance processed your invoice.' + (message ? '<br><strong>Message from Finance:</strong> ' + escapeEmailHtml_(message) : '');
        notification = {to:requester,subject:'Invoice processed: ' + row[6],body:formatEmailBody_('Invoice processed',intro,order)};
      }
      markDataChanged_();
      return createWriteSuccess_('Invoice processed.');
    });
    saved = result.saved;
    return saved ? createWriteSuccess_(result.message,buildNotificationWarning_(notification ? [notification] : [])) : result;
  } catch (error) {
    if (isPortalValidationError_(error)) return invoiceWriteFailure_(error);
    if (error.saveUncertain) saved = true;
    logError_(error,'processInvoice');
    throw error;
  } finally {
    if (!saved) trashUploadedFiles_(uploadedFileIds);
  }
}

function saveOrderInvoiceEvidence(input) {
  const form = input || {}, uploadedFileIds = [];
  let saved = false;
  const authorize = (user, {row,columns}) => {
    if (!canAddOrderEvidence_(user,row,columns)) {
      throw createPortalValidationError_('This purchase is not available for adding invoice evidence.');
    }
  };
  try {
    const invoiceNumber = validateTextField_(form.invoiceNumber,'Invoice number',{required:true,maxLength:100});
    const user = getAuthorizedUserContext_();
    authorize(user,readFinanceMutationTarget_(form,user));
    const attachments = uploadFinanceEvidence_(getOrderUploadFiles_(form),uploadedFileIds);
    const result = withWriteLock_('saveOrderInvoiceEvidence', () => {
      const user = getAuthorizedUserContext_(), target = readFinanceMutationTarget_(form,user);
      authorize(user,target);
      const {id,ss,sheet,columns,rows,row,rowNumber} = target;
      const previous = getOrderInvoiceNumber_(row,'Order',columns.invoiceNumberIndex);
      if (normalizeConfigurationKey_(invoiceNumber) !== normalizeConfigurationKey_(previous)) {
        requireUniqueInvoice_(rows,columns,row[4],invoiceNumber,id,'Order',user);
      }
      const changes = [];
      if (String(previous) !== invoiceNumber) {
        requireRefundFinancialIntegrity_(row,columns);
        const column = columns.invoiceNumberIndex >= 0 ? columns.invoiceNumberIndex + 1 : ensureOrdersColumn_(sheet,ORDER_INVOICE_NUMBER_HEADER_);
        sheet.getRange(rowNumber,column).setValue(invoiceNumber);
        changes.push({field:'Invoice number',oldValue:previous,newValue:invoiceNumber});
      }
      if (attachments.length) {
        const current = parseOrderAttachmentUrls_(row[19]);
        sheet.getRange(rowNumber,20).setValue(current.concat(attachments).join(', '));
        changes.push({field:'Invoice evidence files',oldValue:current.length,newValue:current.length + attachments.length});
      }
      appendOrderFieldChanges_(ss,id,financeMutationActor_(user),changes);
      if (changes.length) markDataChanged_();
      return createWriteSuccess_(changes.length ? 'Invoice evidence saved to the purchase.' : 'The invoice reference is already recorded.');
    });
    saved = result.saved;
    return result;
  } catch (error) {
    if (isPortalValidationError_(error)) return invoiceWriteFailure_(error);
    if (error.saveUncertain) saved = true;
    logError_(error,'saveOrderInvoiceEvidence');
    throw error;
  } finally {
    if (!saved) trashUploadedFiles_(uploadedFileIds);
  }
}

function savePurchaseReportingSite(input) {
  const form = input || {};
  try {
    return withWriteLock_('savePurchaseReportingSite',() => {
      const user = getAuthorizedUserContext_();
      if (user.isPreview || !user.capabilities.canViewAllFinanceData) {
        throw createPortalValidationError_('Only Finance or an Admin can change the reporting site.');
      }
      const target = readFinanceMutationTarget_(form,user);
      const {id,ss,sheet,row,rows,rowNumber,columns} = target;
      const returnInfo = getOrderReturnInfo_(row,columns);
      if (!canEditPurchaseReportingSite_(user,row,columns,returnInfo)) {
        throw createPortalValidationError_('Change the reporting site on the original purchase.');
      }
      const site = validateOrderReportingSite_(form.reportingSite);
      const reason = validateTextField_(form.reason,'Reason for the reporting site change',{required:true,maxLength:500});
      const linkedIds = new Set(returnInfo.refunds.flatMap(refund=>[refund.id,refund.reversalId]).filter(Boolean).map(String));
      const linked = rows.flatMap((related,index)=>index > 0 && linkedIds.has(String(related[0])) ? [{row:related,rowNumber:index+1}] : []);
      if (linked.length !== linkedIds.size || new Set(linked.map(entry=>String(entry.row[0]))).size !== linkedIds.size ||
          linked.some(entry=>getOrderReturnInfo_(entry.row,columns).parentId !== id)) {
        throw createPortalValidationError_('A linked refund could not be verified. Contact IT before changing the site.');
      }
      const changes = [{row,rowNumber},...linked].filter(entry=>normalizeOrderReportingSite_(entry.row[columns.reportingSiteIndex])!==site);
      if (!changes.length) return createWriteSuccess_('The reporting site is already set.');
      const siteColumn = ensureOrdersColumn_(sheet,ORDER_REPORTING_SITE_HEADER_,{hidden:true});
      const actor = financeMutationActor_(user);
      changes.forEach(entry => {
        sheet.getRange(entry.rowNumber,siteColumn).setValue(site);
        appendOrderFieldChanges_(ss,String(entry.row[0]),actor,[
          {field:'Reporting site',oldValue:entry.row[columns.reportingSiteIndex] || '',newValue:site},
          {field:'Reporting site change reason',oldValue:'',newValue:reason}
        ]);
      });
      markDataChanged_();
      return createWriteSuccess_(linked.length ? 'Reporting site updated for the purchase and its linked refund records.' : 'Reporting site updated.');
    });
  } catch (error) {
    if (isPortalValidationError_(error)) return invoiceWriteFailure_(error);
    logError_(error,'savePurchaseReportingSite');
    throw error;
  }
}

function removeInvoiceRecord(form) {
  const input = form || {};
  try {
    return withWriteLock_('removeInvoiceRecord', () => {
      const user = getAuthorizedUserContext_();
      const {id, ss, sheet, columns, row, rowNumber} = readFinanceMutationTarget_(input, user);
      if (!canRemoveInvoiceRecord_(user, row, columns, getOrderReturnInfo_(row, columns))) {
        throw createPortalValidationError_('This invoice cannot be removed. Check your access and any linked returns or refunds.');
      }
      const reason = validateTextField_(input.reason, 'Reason for removal', {required:true,maxLength:40});
      if (!['Duplicate','Entered in error','Other'].includes(reason)) throw createPortalValidationError_('Choose a reason for removal.');
      const explanation = validateTextField_(input.explanation, 'Details', {required:reason === 'Other',maxLength:500});
      const fullReason = reason + (explanation ? ': ' + explanation : '');
      const amount = invoiceRecordedAmount_(row), actor = financeMutationActor_(user), now = new Date();
      const previousStatus = getOrderStatusLabel_(row, 'Invoice', columns);
      const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      const cancellationColumn = ensureOrdersColumn_(sheet, ORDER_CANCELLATION_HEADER_, {hidden:true});
      const details = {status:'Removed', reason:fullReason, by:actor, at:now.toISOString(), amount, previousStatus};
      appendOrderFieldChanges_(ss, id, actor, [
        {field:'Status', oldValue:previousStatus, newValue:'Removed'},
        {field:'Final Cost', oldValue:row[15], newValue:0},
        {field:'Amount removed from budget', oldValue:'', newValue:amount},
        {field:'Removal reason', oldValue:'', newValue:fullReason}
      ]);
      sheet.getRange(rowNumber, cancellationColumn).setValue(JSON.stringify(details));
      sheet.getRange(rowNumber, 16).setValue(0);
      sheet.getRange(rowNumber, 18).setValue(appendPurchaseNoteText_(row[17],
        '[' + stamp + ' ' + actor + '] Invoice record removed. Previous status: ' + previousStatus +
        '. Amount removed from budget: £' + amount.toFixed(2) + '. Reason: ' + fullReason + '\n'));
      markDataChanged_();
      return createWriteSuccess_('Invoice record removed. Its attachments and audit history are available in Removed records.');
    });
  } catch (error) {
    if (isPortalValidationError_(error)) return invoiceWriteFailure_(error);
    logError_(error, 'removeInvoiceRecord');
    throw error;
  }
}

function voidDuplicateInvoice(form) {
  const input = form || {};
  try {
    return withWriteLock_('voidDuplicateInvoice', () => {
      const user = getAuthorizedUserContext_();
      if (user.role !== ROLE_ADMIN_ || user.realRole !== ROLE_ADMIN_ || user.isPreview || user.isSimulated) {
        throw createPortalValidationError_('Only a signed-in Admin can void a duplicate invoice.');
      }
      const {id, ss, sheet, columns, rows, row, rowNumber} = readFinanceMutationTarget_(input, user);
      if (!canVoidDuplicateInvoice_(user, row, columns, getOrderReturnInfo_(row, columns))) {
        throw createPortalValidationError_('This invoice cannot be voided as a duplicate.');
      }
      const retainedId = validateTextField_(input.retainedId, 'Reference of the original invoice to keep', {required:true,maxLength:100});
      const reason = validateTextField_(input.reason, 'Reason for voiding the duplicate', {required:true,maxLength:500});
      const originals = rows.slice(1).filter(candidate => String(candidate[0]) === retainedId);
      const original = originals[0];
      const invoiceNumber = normalizeConfigurationKey_(getOrderInvoiceNumber_(row, 'Invoice', columns.invoiceNumberIndex));
      const amount = invoiceRecordedAmount_(row);
      if (retainedId === id || originals.length !== 1 || !isProcessedInvoiceForDuplicateCheck_(original, columns) ||
          getOrderReturnInfo_(original, columns).parentId || invoiceRecordedAmount_(original) !== amount ||
          normalizeConfigurationKey_(getOrderInvoiceNumber_(original, 'Invoice', columns.invoiceNumberIndex)) !== invoiceNumber) {
        throw createPortalValidationError_('Choose a different, processed original invoice with the same invoice number and recorded amount.');
      }
      requireOrderVersion_(original, input.retainedVersion);

      const actor = financeMutationActor_(user);
      const now = new Date();
      const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      const cancellationColumn = ensureOrdersColumn_(sheet, ORDER_CANCELLATION_HEADER_, {hidden:true});
      const details = {status:'Voided', reason, by:actor, at:now.toISOString(), retainedId, amount};
      const note = '[' + stamp + ' ' + actor + '] Voided as a duplicate. Original kept: ' + retainedId +
        '. Amount removed from spend: £' + amount.toFixed(2) + '. Reason: ' + reason + '\n';
      appendOrderFieldChanges_(ss, id, actor, [
        {field:'Status', oldValue:'Processed', newValue:'Voided'},
        {field:'Final Cost', oldValue:row[15], newValue:0},
        {field:'Amount removed from spend', oldValue:'', newValue:amount},
        {field:'Original invoice kept', oldValue:'', newValue:retainedId},
        {field:'Void reason', oldValue:'', newValue:reason}
      ]);
      sheet.getRange(rowNumber, cancellationColumn).setValue(JSON.stringify(details));
      sheet.getRange(rowNumber, 16).setValue(0);
      sheet.getRange(rowNumber, 18).setValue(appendPurchaseNoteText_(row[17], note));
      markDataChanged_();
      return createWriteSuccess_('Duplicate ' + id + ' voided. Original ' + retainedId + ' kept.');
    });
  } catch (error) {
    if (isPortalValidationError_(error)) return invoiceWriteFailure_(error);
    logError_(error, 'voidDuplicateInvoice');
    throw error;
  }
}

function updateInvoice(form) {
  const uploadedFileIds = [];
  let saved = false;
  try {
    const input = form && typeof form === 'object' ? form : {};
    const authorize = () => {
      const user = getAuthorizedUserContext_();
      if (user.role !== ROLE_ADMIN_) throw createPortalValidationError_('Only Admins can edit invoices.');
      return user;
    };
    authorize();
    // Upload helper checks record version before creating files; authorization is checked again under the lock.
    const urls = preparePortalUploads_(input, true, uploadedFileIds);
    const result = withWriteLock_('updateInvoice', () => {
      const user = authorize();
      const id = validateTextField_(input.id, 'Invoice reference', {required:true,maxLength:100});
      const dept = validateTextField_(input.dept, 'Department', {required:true,maxLength:200});
      const supplier = validateTextField_(input.supplier, 'Supplier', {required:true,maxLength:200});
      const desc = validateTextField_(input.desc, 'Description', {required:true,maxLength:500});
      const invoiceNumber = validateTextField_(input.invoiceNumber, 'Invoice number', {maxLength:100});
      const cost = validateMoneyField_(input.cost, 'Total amount', {nonZero:true});
      const reason = validateTextField_(input.reason, 'Reason for correction', {required:true,maxLength:1000});
      const payment = validateOrderPaymentMethod_(input.paymentMethod, false);
      requireInvoiceAmountConfirmation_(cost, invoiceNumber, input.amountConfirmed);
      const ss = getPortalSpreadsheet_(), sheet = ss.getSheetByName('Orders');
      const columns = ensureOrdersMetadataColumns_(sheet), rows = sheet.getDataRange().getValues();
      assertUniqueOrderReference_(rows,id);
      const index = rows.findIndex((row,i) => i > 0 && String(row[0]) === id);
      if (index < 1) throw createPortalValidationError_('Invoice not found. Refresh the Order List.');
      const old = rows[index];
      if (getOrderRecordType_(old, columns.recordTypeIndex) !== 'Invoice' || isOrderCancelled_(old,columns)) throw createPortalValidationError_('This record is not available for invoice editing.');
      requireOrderVersion_(old,input.expectedVersion);
      requireRefundFinancialIntegrity_(old, columns);
      if (!payment && getOrderPaymentMethod_(old,columns)) throw createPortalValidationError_('Choose a payment method.');
      const budgets = getBudgetSnapshot_(ss);
      if (!budgets[dept] || isSystemBudgetDepartment_(dept) || budgets[dept].hasCalculationError) throw createPortalValidationError_('Choose an active department with an available budget calculation.');
      const reportingSite = input.reportingSite == null ? '' : validateOrderReportingSite_(input.reportingSite);
      if (normalizeConfigurationKey_(old[4]) !== normalizeConfigurationKey_(supplier) ||
          normalizeConfigurationKey_(getOrderInvoiceNumber_(old,'Invoice',columns.invoiceNumberIndex)) !== normalizeConfigurationKey_(invoiceNumber)) {
        requireUniqueInvoice_(rows,columns,supplier,invoiceNumber,id,'Invoice',user);
      }
      const replacements = [
        {field:'Department',index:1,value:dept}, {field:'Supplier',index:4,value:supplier},
        {field:'Description',index:6,value:desc}, {field:'Quantity',index:8,value:1},
        {field:'Unit Price',index:9,value:cost}, {field:'Total',index:10,value:cost},
        {field:'GL Code',index:columns.glCodeIndex,value:getBudgetGlCode_(budgets,dept)},
        {field:'Invoice Number',index:columns.invoiceNumberIndex,value:invoiceNumber},
        {field:'Payment Method',index:columns.paymentMethodIndex,value:payment}
      ];
      // Blank final cost is part of the pending state. Never fill it as an editing side effect.
      if (isOrderCompleted_(old)) replacements.push({field:'Final Cost',index:15,value:cost});
      if (reportingSite && reportingSite !== normalizeOrderReportingSite_(old[columns.reportingSiteIndex])) {
        const siteColumn = columns.reportingSiteColumn || ensureOrdersColumn_(sheet, ORDER_REPORTING_SITE_HEADER_, {hidden:true});
        replacements.push({field:'Reporting site',index:siteColumn - 1,value:reportingSite});
      }
      if (urls.length) replacements.push({field:'Attachments',index:19,value:parseOrderAttachmentUrls_(old[19]).concat(urls).join(', ')});
      // Older invoices also stored their reference in Product code; keep that fallback consistent.
      if (old[7]) replacements.push({field:'Legacy Invoice Number',index:7,value:invoiceNumber});
      const changes = collectOrderFieldChanges_(old,replacements);
      if (!changes.length) return createWriteSuccess_('No invoice details changed.');
      const actor = user.isSimulated && isDevelopmentRuntime_() ? user.email : (user.realEmail || user.email);
      appendOrderFieldChanges_(ss,id,actor,changes.concat([{field:'Correction reason',oldValue:'',newValue:reason}]));
      replacements.forEach(item => sheet.getRange(index+1,item.index+1).setValue(item.value));
      markDataChanged_();
      return createWriteSuccess_('Invoice changes saved.');
    });
    saved = !!result.saved;
    return result;
  } catch (error) {
    if (isPortalValidationError_(error)) return invoiceWriteFailure_(error);
    if (error.saveUncertain) saved = true; // Preserve files until the committed result can be checked.
    logError_(error,'updateInvoice');
    throw error;
  } finally {
    if (!saved) trashUploadedFiles_(uploadedFileIds);
  }
}

function logInvoice(form) {
  let emailPayload = null;
  const uploadedFileIds = [];
  let invoiceRowSaved = false;
  try {
    const existing = portalCreatePreflight_('invoice',form);
    if (existing) return existing;
    const attachmentUrls = preparePortalUploads_(form, true, uploadedFileIds);
    const result = withWriteLock_("logInvoice", () => {
      const user = getUserContext();
      const config = getConfig_();
      const input = form && typeof form === "object" ? form : {};
      const dept = validateTextField_(input.dept, "Department", { required: true, maxLength: 200 });
      const supplier = validateTextField_(input.supplier, "Supplier", { required: true, maxLength: 200 });
      const description = validateTextField_(input.desc, "Description", { required: true, maxLength: 500 });
      const invoiceNumber = validateTextField_(input.invoiceNumber || input.invoiceRef, "Invoice number", { maxLength: 100 });
      const cost = validateMoneyField_(input.cost, "Cost", { nonZero: true });
      requireInvoiceAmountConfirmation_(cost, invoiceNumber, input.amountConfirmed);
      requireCapability_(
        user,
        "canLogInvoice",
        "Access denied. You do not have permission to log invoices.",
        "log_invoice_not_allowed"
      );
      const canUseDept = canLogInvoiceDepartment_(user, dept);

      if (!canUseDept || isSystemBudgetDepartment_(dept)) throw new Error("Unauthorized");
      const reportingSite = validateOrderReportingSite_(input.reportingSite);
      const paymentMethod = validateOrderPaymentMethod_(input.paymentMethod, true);
      const ss = getPortalSpreadsheet_();
      const sheet = ss.getSheetByName("Orders");
      ensureOrdersRecordTypeColumn_(sheet);
      const budgets = getBudgetSnapshot_(ss);
      if (!budgets[dept] || isSystemBudgetDepartment_(dept)) {
        throw new Error("Please choose an active department with a live budget.");
      }
      if (budgets[dept] && budgets[dept].hasCalculationError) {
        throw new Error("This department's budget calculation is unavailable. Please contact Finance before logging an invoice against it.");
      }
      const invoiceGlCode = getBudgetGlCode_(budgets, dept);
      const replay = beginPortalRequest_('invoice', input, user);
      if (replay) return replay;
      const invoiceRows = sheet.getDataRange().getValues(), invoiceColumns = getOrdersMetadataColumnsForRead_(sheet);
      requireUniqueInvoice_(invoiceRows, invoiceColumns, supplier, invoiceNumber, '', 'Invoice', user);
      const duplicate = possibleInvoiceDuplicate_(invoiceRows,invoiceColumns,input,user);
      if (duplicate && input.duplicateConfirmation !== duplicate.token) {
        const references = duplicate.references.length ? ' Check ' + duplicate.references.join(', ') + '.' : '';
        const error = createPortalValidationError_('An invoice from this supplier for the same amount was recorded in this department in the last 30 days.' + references + ' Save another only if this is a separate purchase.', 'POSSIBLE_DUPLICATE_INVOICE');
        error.duplicateConfirmation = duplicate.token;
        if (duplicate.references.length) error.matchingOrderId = duplicate.references[0];
        throw error;
      }
      const id = nextOrderId_();
      portalTransaction_.patches.push({ sheet: portalTransaction_.receipt.sheet, row: portalTransaction_.receipt.row, column: 5, values: [[id]] });
      const now = new Date();

      const finalAttachmentString = attachmentUrls.join(", ");

      const savedInvoice = appendOrderRow_(sheet, [
        id, dept, now, user.email,
        supplier, "", description, "",
        1, cost, cost, "Finance", "", "", "", "", "", "", "", finalAttachmentString
      ], "Invoice", invoiceGlCode, invoiceNumber, user.email, paymentMethod, reportingSite);
      if (user.role === ROLE_ADMIN_ || hasProcessingDepartment_(user, dept)) {
        applyOrderProcessingApproval_(ss, sheet, savedInvoice.rowNumber, savedInvoice.row, savedInvoice.columns, user);
      }

      SpreadsheetApp.flush();
      // Saved is confirmed after the atomic commit.
      markDataChanged_();

      const orderObj = {
        id: id,
        dept: dept,
        date: Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy"),
        requester: user.email,
        supplier: supplier,
        link: "",
        desc: description,
        totalPrice: cost,
        finalPrice: "",
        invoiceNumber: invoiceNumber,
        status: "Pending",
        notes: "",
        dateNeeded: "",
        attachment: finalAttachmentString,
        recordType: "Invoice",
        paymentMethod: paymentMethod
      };
      emailPayload = {
        to: config.financeEmail,
        subject: (cost < 0 ? "New Credit Note Logged: " : "New Invoice Logged: ") + description,
        body: formatEmailBody_(
          cost < 0 ? "New Credit Note Logged" : "New Invoice Logged",
          `A new ${cost < 0 ? 'credit note' : 'invoice'} has been logged by <strong>${escapeEmailHtml_(user.email)}</strong> and is ready for finance processing.${getOrderApprovalStatus_(savedInvoice.row, savedInvoice.columns) === APPROVAL_AWAITING_ ? ' Independent purchase review is required; the expenditure is already incurred. Portal review does not hold or release an Amazon order.' : ''}`,
          orderObj
        )
      };
      return "Invoice Logged";
    });

    if (result && result.replayed) { trashUploadedFiles_(uploadedFileIds); return result; }
    invoiceRowSaved = result === "Invoice Logged";
    const warning = buildNotificationWarning_(emailPayload ? [emailPayload] : []);
    return result === "Invoice Logged"
      ? createWriteSuccess_("Invoice logged successfully.", warning)
      : createWriteFailure_(result);
  } catch (e) {
    if (!invoiceRowSaved && !e.saveUncertain) trashUploadedFiles_(uploadedFileIds);
    if (isPortalValidationError_(e)) return invoiceWriteFailure_(e);
    logError_(e, "logInvoice");
    throw e;
  }
}

function bulkFinalizeOrders(items) {
  let emailPayloads = [];
  try {
    const result = withWriteLock_("bulkFinalizeOrders", () => {
      const user = getUserContext();
      if (!user.capabilities.canBulkUpdateOrders) return { success: false, error: "Unauthorized" };
      if (!Array.isArray(items) || items.length === 0) {
        return { success: false, error: "No orders were supplied." };
      }
      if (items.length > 200) {
        return { success: false, error: "Too many orders were selected. Please process a smaller batch." };
      }

      const ss = getPortalSpreadsheet_();
      const sheet = ss.getSheetByName("Orders");
      if (!sheet) return { success: false, error: "Orders sheet not found." };
      const orderColumns = ensureOrdersMetadataColumns_(sheet);
      const data = sheet.getRange(1, 1, sheet.getLastRow(), orderColumns.lastColumn).getValues();
      const budgets = getBudgetSnapshot_(ss);
      const rowsById = {};
      for (let i = 1; i < data.length; i++) {
        const rowId = String(data[i][0] || "").trim();
        if (rowId) rowsById[rowId] = { rowNumber: i + 1, values: data[i] };
      }

      const seenIds = {};
      const normalizedItems = [];
      for (let i = 0; i < items.length; i++) {
        const submitted = items[i] || {};
        const id = String(submitted.id || "").trim();
        if (!id || seenIds[id]) return { success: false, error: "The selected orders contain a missing or duplicate reference." };
        seenIds[id] = true;

        assertUniqueOrderReference_(data, id);
        const matched = rowsById[id];
        if (!matched) return { success: false, error: `Order ${id} could not be found. Refresh and review the selection again.` };
        const row = matched.values;
        requireOrderVersion_(row, submitted.expectedVersion);
        const recordType = getOrderRecordType_(row, orderColumns.recordTypeIndex);
        if (!canProcessOrderRecord_(user, row[1], recordType)) {
          return { success: false, error: `You are not authorised to process order ${id}. Nothing was changed.` };
        }
        const department = String(row[1] || "").trim();
        if (!department || !budgets[department] || isSystemBudgetDepartment_(department) || budgets[department].hasCalculationError) {
          return { success: false, error: `Order ${id} is not assigned to an active department. Nothing was changed.` };
        }
        const isCancelled = isOrderCancelled_(row, orderColumns);
        const isTransfer = recordType === "Transfer";
        if (isOrderCompleted_(row) || isCancelled || isTransfer) {
          return { success: false, error: `Order ${id} is no longer pending. Refresh and review the selection again.` };
        }

        const invoice = recordType === 'Invoice';
        const quantity = invoice ? 1 : validateQuantityField_(submitted.quantity);
        let finalPrice;
        try {
          finalPrice = invoice ? getInvoiceProcessingAmount_(row,orderColumns,submitted.amountConfirmed)
            : validateActualOrderTotal_(submitted.finalPrice,submitted.noChargeConfirmed,submitted.noChargeReason || submitted.costNote);
        } catch (error) {
          if (isPortalValidationError_(error)) error.recordId = id;
          throw error;
        }
        const expectedDate = parseBulkExpectedDate_(invoice ? '' : submitted.expectedDate);
        if (!expectedDate.valid) return { success: false, error: `Order ${id} has an invalid delivery date.` };

        const rawCostNote = String(submitted.costNote || "").trim();
        if (rawCostNote.length > 300) return { success: false, error: `Order ${id} has a cost note longer than 300 characters.` };
        const costNote = rawCostNote.replace(/[<>]/g, "");

        normalizedItems.push({
          paymentMethod: recordType === 'Order' ? validateOrderPaymentMethod_(submitted.paymentMethod, finalPrice !== 0) : '',
          id: id,
          rowNumber: matched.rowNumber,
          row: row,
          recordType: recordType,
          quantity: quantity,
          finalPrice: finalPrice,
          expectedDate: expectedDate.value,
          expectedDateDisplay: expectedDate.display,
          costNote: costNote,
          noChargeReason: !invoice && finalPrice === 0 ? String(submitted.noChargeReason || submitted.costNote).trim() : ''
        });
      }

      const financeColumn = normalizedItems.some(item => item.recordType === 'Invoice')
        ? ensureOrdersColumn_(sheet,ORDER_FINANCE_PROCESSED_BY_HEADER_,{hidden:true}) : 0;
      for (let i = 0; i < normalizedItems.length; i++) {
        const item = normalizedItems[i];
        const requiredRanges = item.recordType === 'Invoice' ? [
          sheet.getRange(item.rowNumber,9), sheet.getRange(item.rowNumber,14),
          sheet.getRange(item.rowNumber,16), sheet.getRange(item.rowNumber,financeColumn)
        ] : [
          sheet.getRange(item.rowNumber, orderColumns.paymentMethodColumn),
          sheet.getRange(item.rowNumber, 9),
          sheet.getRange(item.rowNumber, 14, 1, 3),
          sheet.getRange(item.rowNumber, orderColumns.processedByColumn, 1, 5)
        ];
        if (item.costNote) requiredRanges.push(sheet.getRange(item.rowNumber, 18));

        for (let j = 0; j < requiredRanges.length; j++) {
          if (!canEditBulkRange_(requiredRanges[j])) {
            return {
              success: false,
              error: `The signed-in Google account cannot edit the fields required for order ${item.id}. Sign in with an authorised school account or contact IT. Nothing was changed.`
            };
          }
        }
      }

      const now = new Date();
      const actor = financeMutationActor_(user);
      const emailGroups = {};
      let approvalPayloads = [];
      normalizedItems.forEach(item => {
        if (item.recordType === 'Invoice') {
          writeProcessedInvoice_(ss,sheet,item.rowNumber,item.row,orderColumns,item.finalPrice,actor,now,financeColumn);
        } else {
          sheet.getRange(item.rowNumber,9).setValue(item.quantity);
          sheet.getRange(item.rowNumber,14,1,3).setValues([[now,item.expectedDate,item.finalPrice]]);
          item.row[8] = item.quantity;
          item.row[13] = now;
          item.row[14] = item.expectedDate;
          item.row[15] = item.finalPrice;
        }
        if (item.costNote) {
          const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM HH:mm");
          const currentNotes = String(item.row[17] || "");
          const teamLabel = user.capabilities.hasExplicitOrderProcessingPermission ? "Ordering Team" : "Finance";
          const noteEntry = `[${timestamp} ${teamLabel}]: Cost note: ${item.costNote}\n`;
          item.row[17] = appendPurchaseNoteText_(currentNotes,noteEntry);
          sheet.getRange(item.rowNumber,18).setValue(item.row[17]);
        }

        if (item.recordType === "Order") {
          if (item.noChargeReason) appendOrderFieldChanges_(ss,item.id,actor,[{field:'No-charge reason',oldValue:'',newValue:item.noChargeReason}]);
          sheet.getRange(item.rowNumber, orderColumns.paymentMethodColumn).setValue(item.paymentMethod);
          item.row[orderColumns.paymentMethodIndex] = item.paymentMethod;
          approvalPayloads = approvalPayloads.concat(
            applyOrderProcessingApproval_(ss, sheet, item.rowNumber, item.row, orderColumns, user)
          );
        }

        const requester = String(item.row[3] || "").trim();
        if (!requester || requester.includes("Finance (Direct)")) return;
        const requesterKey = requester.toLowerCase();
        if (!emailGroups[requesterKey]) emailGroups[requesterKey] = { to: requester, items: [] };
        emailGroups[requesterKey].items.push({
          id: item.id,
          desc: item.row[6] || "",
          qty: item.row[8] === "" || item.row[8] == null ? "-" : item.row[8],
          finalPrice: item.finalPrice,
          expectedDateDisplay: item.expectedDateDisplay,
          recordType:item.recordType,
          processedBy: item.recordType === 'Invoice' ? actor : String(item.row[orderColumns.processedByIndex] || '').trim(),
          costNote: item.costNote
        });
      });

      emailPayloads = Object.keys(emailGroups).map(key => {
        const group = emailGroups[key];
        const count = group.items.length;
        const invoices = group.items.filter(item => item.recordType === 'Invoice').length;
        const subject = invoices ? (invoices === count ? 'Invoices processed' : 'Orders and invoices updated') : 'Orders Confirmed';
        return {
          to: group.to,
          subject: `${subject}: ${count} ${count === 1 ? "item" : "items"}`,
          body: formatBulkCompletionEmail_(group.items)
        };
      }).concat(approvalPayloads);

      SpreadsheetApp.flush();
      markDataChanged_();
      const count = normalizedItems.length;
      const invoiceCount = normalizedItems.filter(item => item.recordType === 'Invoice').length;
      const orderCount = count - invoiceCount;
      const emailCount = emailPayloads.length;
      return {
        success: true,
        updatedCount: count,
        emailGroupCount: emailCount,
        message: [orderCount ? `Marked ${orderCount} ${orderCount === 1 ? 'order' : 'orders'} as ordered.` : '',
          invoiceCount ? `Processed ${invoiceCount} ${invoiceCount === 1 ? 'invoice' : 'invoices'}.` : ''].filter(Boolean).join(' ')
      };
    }, () => ({ success: false, error: "System busy. Please try again." }));

    if (result && result.success) {
      const warning = buildNotificationWarning_(emailPayloads);
      result.saved = true;
      if (warning) {
        result.warningCode = warning.code;
        result.warningMessage = warning.message;
      }
    } else if (result) {
      result.saved = false;
    }
    return result;
  } catch (e) {
    if (isPortalValidationError_(e)) return {...invoiceWriteFailure_(e),error:e.message};
    logError_(e, "bulkFinalizeOrders");
    throw e;
  }
}

function updateOrder(id, deliveryDate, finalPrice, message, invoiceNumber, correction, expectedVersion, attachmentFiles, attachmentOnly, paymentMethod, options) {
  let emailPayloads = [];
  const uploadedFileIds = [];
  let saved = false;
  try {
    const files = getOrderUploadFiles_({ files: attachmentFiles });
    const uploadUser = getUserContext();
    if (files.length && !uploadUser.capabilities.canManageOrders) return createWriteFailure_("Unauthorized");
    if (files.length) {
      const sheet = getPortalSpreadsheet_().getSheetByName("Orders"), columns = getOrdersMetadataColumnsForRead_(sheet);
      const rows = sheet.getDataRange().getValues();
      assertUniqueOrderReference_(rows, id);
      const row = rows.slice(1).find(r => String(r[0]) === String(id));
      if (!row || (!canProcessOrderRecord_(uploadUser, row[1], getOrderRecordType_(row, columns.recordTypeIndex)) && !canCorrectInvoice_(uploadUser, row, columns))) return createWriteFailure_("Unauthorized");
      requireOrderVersion_(row, expectedVersion);
    }
    const newAttachmentUrls = files.map(file => {
      const uploaded = uploadFileToDrive_(file.data, file.name, file.type);
      uploadedFileIds.push(uploaded.fileId);
      return uploaded.url;
    });
    const result = withWriteLock_("updateOrder", () => {
      const user = getUserContext();
      if (!user.capabilities.canManageOrders) return "Unauthorized";
      const cleanId = validateTextField_(id, "Order reference", { required: true, maxLength: 100 });
      const cleanDeliveryDate = parseOptionalDateField_(deliveryDate, "Estimated delivery date");
      const cleanFinalPrice = validateMoneyField_(finalPrice, "Final cost", { allowBlank: true });
      const cleanMessage = validateTextField_(message, "Message", { maxLength: 1000 });
      const cleanInvoiceNumber = validateTextField_(invoiceNumber, "Invoice number", { maxLength: 100 });
      const input = options || {};
      const ss = getPortalSpreadsheet_();
      const sheet = ss.getSheetByName("Orders");
      if (!sheet) return "Orders sheet not found.";
      const orderColumns = ensureOrdersMetadataColumns_(sheet);
      const data = sheet.getRange(1, 1, sheet.getLastRow(), orderColumns.lastColumn).getValues();
      assertUniqueOrderReference_(data, cleanId);
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString() === cleanId) {
          requireOrderVersion_(data[i], expectedVersion);
          if (!attachmentOnly) requireRefundFinancialIntegrity_(data[i], orderColumns);
          const recordType = getOrderRecordType_(data[i], orderColumns.recordTypeIndex);
          if (cleanFinalPrice < 0 && recordType !== 'Invoice') throw createPortalValidationError_("Final cost cannot be negative for an order.", "INVALID_AMOUNT");
          if (recordType === "Transfer") return "Budget transfer records cannot be managed as orders.";
          if (isOrderCancelled_(data[i], orderColumns)) return "Cancelled orders cannot be updated.";
          if (!canProcessOrderRecord_(user, data[i][1], recordType) && !canCorrectInvoice_(user, data[i], orderColumns)) return "Unauthorized";
          const invoiceCorrection = recordType === "Invoice" && !user.capabilities.canViewAllFinanceData;
          const wasCompleted = isOrderCompleted_(data[i]);
          const previousInvoiceNumber = getOrderInvoiceNumber_(data[i],recordType,orderColumns.invoiceNumberIndex);
          let invoiceCorrectionReason = '', noChargeReason = '';
          if (!attachmentOnly && recordType === 'Invoice') {
            if (!invoiceCorrection) throw createPortalValidationError_(wasCompleted ? 'Use Edit invoice to correct this record.' : 'Use Process invoice to complete this record.', 'USE_INVOICE_ACTION');
            invoiceCorrectionReason = validateTextField_(input.correctionReason,'Reason for correction',{required:true,maxLength:1000});
            const cost = validateMoneyField_(cleanFinalPrice, 'Invoice amount', {nonZero:true});
            requireInvoiceAmountConfirmation_(cost,previousInvoiceNumber,input.amountConfirmed);
          } else if (!attachmentOnly && (!wasCompleted || (cleanFinalPrice === 0 && data[i][15] !== 0))) {
            validateActualOrderTotal_(finalPrice,input.noChargeConfirmed,input.noChargeReason);
            if (cleanFinalPrice === 0) noChargeReason = String(input.noChargeReason).trim();
            if (!wasCompleted) {
              const budget = getBudgetSnapshot_(ss)[data[i][1]];
              if (!budget || isSystemBudgetDepartment_(data[i][1]) || budget.hasCalculationError) {
                throw createPortalValidationError_('Choose an active department with an available budget calculation.');
              }
            }
          }
          const previousPaymentMethod = getOrderPaymentMethod_(data[i], orderColumns);
          const previousCost = data[i][15];
          const currentCost = cleanFinalPrice === null ? previousCost : cleanFinalPrice;
          const noCharge = currentCost === 0;
          const requiresPayment = !noCharge && (!wasCompleted || !!previousPaymentMethod || previousCost === 0);
          const selectedPaymentMethod = !attachmentOnly && recordType === 'Order'
            ? validateOrderPaymentMethod_(paymentMethod == null && wasCompleted ? previousPaymentMethod : paymentMethod, requiresPayment)
            : previousPaymentMethod;
          const row = i + 1;
          let correctionValues = null;
          if (!attachmentOnly && ((wasCompleted && recordType === "Order") || canCorrectInvoice_(user, data[i], orderColumns)) && correction && typeof correction === "object") {
            const department = validateTextField_(correction.department, "Department", { required: true, maxLength: 200 });
            const supplier = validateTextField_(correction.supplier, "Supplier", { required: true, maxLength: 200 });
            const link = normalizeSupplierLinkValue_(correction.link);
            const description = validateTextField_(correction.description, "Description", { required: true, maxLength: 500 });
            const code = recordType === 'Invoice' ? data[i][7] : validateTextField_(correction.code, "Product code", { maxLength: 100 });
            const quantity = recordType === 'Invoice' ? 1 : validateQuantityField_(correction.quantity);
            const missingEstimate = recordType === 'Order' && (data[i][10] === '' || data[i][10] == null);
            const unitPrice = validateMoneyField_(recordType === 'Invoice' ? cleanFinalPrice : correction.unitPrice, "Unit price",
              recordType === 'Invoice' ? {nonZero:true} : {nonNegative:true,allowBlank:missingEstimate});
            const totalPrice = unitPrice === null ? '' : Math.round(quantity * unitPrice * 100) / 100;
            if (recordType !== 'Invoice' && totalPrice !== '' && totalPrice <= 0) throw createPortalValidationError_("Estimate must be greater than zero, or left blank if none was recorded.", "INVALID_AMOUNT");
            const dateNeeded = parseOptionalDateField_(correction.dateNeeded, "Required date");
            const location = validateTextField_(correction.location, "Delivery location", { maxLength: 100 });
            const budgets = getBudgetSnapshot_(ss);
            if (!budgets[department] || isSystemBudgetDepartment_(department) || budgets[department].hasCalculationError) {
              throw createPortalValidationError_("Choose an active department with an available budget calculation.", "INVALID_DEPARTMENT");
            }
            if (!canProcessOrderRecord_(user, department, recordType) && !(recordType === 'Invoice' && hasProcessingDepartment_(user, department))) return "Unauthorized destination department";
            correctionValues = {
              department: department,
              supplier: supplier,
              link: link,
              description: description,
              code: code,
              quantity: quantity,
              unitPrice: unitPrice === null ? '' : unitPrice,
              totalPrice: totalPrice,
              location: location,
              dateNeeded: dateNeeded || "",
              glCode: getBudgetGlCode_(budgets, department)
            };
          }
          const canSetInvoiceNumber = !attachmentOnly && recordType === 'Order' &&
            (!user.capabilities.hasExplicitOrderProcessingPermission || user.capabilities.canViewAllFinanceData);
          const selectedInvoiceNumber = canSetInvoiceNumber && invoiceNumber != null ? cleanInvoiceNumber : previousInvoiceNumber;
          const selectedSupplier = correctionValues ? correctionValues.supplier : data[i][4];
          if (!attachmentOnly && (normalizeConfigurationKey_(selectedSupplier) !== normalizeConfigurationKey_(data[i][4]) ||
              normalizeConfigurationKey_(selectedInvoiceNumber) !== normalizeConfigurationKey_(previousInvoiceNumber))) {
            requireUniqueInvoice_(data,orderColumns,selectedSupplier,selectedInvoiceNumber,cleanId,recordType,user);
          }
          const now = new Date();
          if (!attachmentOnly && !wasCompleted && !invoiceCorrection) sheet.getRange(row, 14).setValue(now);
          if (!attachmentOnly && cleanDeliveryDate && !invoiceCorrection) sheet.getRange(row, 15).setValue(cleanDeliveryDate);
          if (!attachmentOnly && cleanFinalPrice !== null) {
            if (invoiceCorrection && !wasCompleted) {
              sheet.getRange(row, 10, 1, 2).setValues([[cleanFinalPrice, cleanFinalPrice]]);
            } else sheet.getRange(row, 16).setValue(cleanFinalPrice);
          }
          if (canSetInvoiceNumber) sheet.getRange(row, orderColumns.invoiceNumberColumn).setValue(selectedInvoiceNumber);

          const updatedRow = data[i].slice();
          if (!attachmentOnly && recordType === 'Order') {
            sheet.getRange(row, orderColumns.paymentMethodColumn).setValue(selectedPaymentMethod);
            updatedRow[orderColumns.paymentMethodIndex] = selectedPaymentMethod;
          }
          if (!attachmentOnly && !wasCompleted && !invoiceCorrection) updatedRow[13] = now;
          if (!attachmentOnly && cleanDeliveryDate && !invoiceCorrection) updatedRow[14] = cleanDeliveryDate;
          if (!attachmentOnly && cleanFinalPrice !== null) {
            if (invoiceCorrection && !wasCompleted) { updatedRow[9] = cleanFinalPrice; updatedRow[10] = cleanFinalPrice; }
            else updatedRow[15] = cleanFinalPrice;
          }
          if (canSetInvoiceNumber) updatedRow[orderColumns.invoiceNumberIndex] = selectedInvoiceNumber;
          if (correctionValues) {
            const values = correctionValues;
            if (recordType === 'Order' && wasCompleted && values.location !== data[i][11] &&
                !normalizeOrderReportingSite_(data[i][orderColumns.reportingSiteIndex])) {
              // A delivery-location correction must not silently move historic spend between sites.
              const siteColumn = orderColumns.reportingSiteColumn || ensureOrdersColumn_(sheet,ORDER_REPORTING_SITE_HEADER_,{hidden:true});
              const originalSite = getOrderReportingSite_(data[i],orderColumns) || 'Unassigned';
              sheet.getRange(row,siteColumn).setValue(originalSite);
              updatedRow[siteColumn - 1] = originalSite;
            }
            sheet.getRange(row, 2).setValue(values.department);
            sheet.getRange(row, 5, 1, 9).setValues([[values.supplier, values.link, values.description, values.code, values.quantity, values.unitPrice, values.totalPrice, values.location, values.dateNeeded]]);
            sheet.getRange(row, orderColumns.glCodeColumn).setValue(values.glCode);
            updatedRow[1] = values.department;
            updatedRow[4] = values.supplier;
            updatedRow[5] = values.link;
            updatedRow[6] = values.description;
            updatedRow[7] = values.code;
            updatedRow[8] = values.quantity;
            updatedRow[9] = values.unitPrice;
            updatedRow[10] = values.totalPrice;
            updatedRow[11] = values.location;
            updatedRow[12] = values.dateNeeded;
            updatedRow[orderColumns.glCodeIndex] = values.glCode;
          }

          if (!attachmentOnly && cleanMessage) {
            const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
            const teamLabel = user.capabilities.hasExplicitOrderProcessingPermission ? "Ordering Team" : "Finance";
            const newNoteStr = `[${timestamp} ${teamLabel}]: ${cleanMessage}\n`;
            const currentNotes = sheet.getRange(row, 18).getValue();
            const mergedNotes = appendPurchaseNoteText_(currentNotes,newNoteStr);
            sheet.getRange(row, 18).setValue(mergedNotes);
            updatedRow[17] = mergedNotes;
          }

          if (newAttachmentUrls.length) {
            const existingAttachmentUrls = parseOrderAttachmentUrls_(data[i][19]);
            const finalAttachmentString = existingAttachmentUrls.concat(newAttachmentUrls).join(", ");
            sheet.getRange(row, 20).setValue(finalAttachmentString);
            updatedRow[19] = finalAttachmentString;
          }

          const actor = normalizeConfigurationKey_(user.isSimulated && isDevelopmentRuntime_()
            ? user.email
            : (user.realEmail || user.email));
          if (noChargeReason) appendOrderFieldChanges_(ss,cleanId,actor,[{field:'No-charge reason',oldValue:'',newValue:noChargeReason}]);
          if (!attachmentOnly && !wasCompleted && recordType === "Order") {
            emailPayloads = emailPayloads.concat(
              applyOrderProcessingApproval_(ss, sheet, row, updatedRow, orderColumns, user)
            );
          } else if (!attachmentOnly && ((wasCompleted && recordType === "Order") || recordType === "Invoice")) {
            const materialChanges = collectOrderFieldChanges_(data[i], [
              { field: "Department", index: 1, value: updatedRow[1] },
              { field: "Supplier", index: 4, value: updatedRow[4] },
              { field: "Supplier Link", index: 5, value: updatedRow[5] },
              { field: "Description", index: 6, value: updatedRow[6] },
              { field: "Product Code", index: 7, value: updatedRow[7] },
              { field: "Quantity", index: 8, value: updatedRow[8] },
              { field: "Unit Price", index: 9, value: updatedRow[9] },
              { field: "Total", index: 10, value: updatedRow[10] },
              { field: "Delivery Location", index: 11, value: updatedRow[11] },
              { field: "Required Date", index: 12, value: updatedRow[12] },
              { field: "Expected Delivery Date", index: 14, value: updatedRow[14] },
              { field: "Final Cost", index: 15, value: updatedRow[15] },
              { field: "Invoice number", index: orderColumns.invoiceNumberIndex, value: updatedRow[orderColumns.invoiceNumberIndex] },
              { field: "Payment Method", index: orderColumns.paymentMethodIndex, value: updatedRow[orderColumns.paymentMethodIndex] },
              { field: "GL Code", index: orderColumns.glCodeIndex, value: updatedRow[orderColumns.glCodeIndex] }
            ]);
            appendOrderFieldChanges_(ss, cleanId, actor, materialChanges.length && invoiceCorrectionReason
              ? materialChanges.concat([{field:'Correction reason',oldValue:'',newValue:invoiceCorrectionReason}]) : materialChanges);
            if (materialChanges.length && getOrderApprovalStatus_(data[i], orderColumns) !== APPROVAL_NOT_REQUIRED_) {
              emailPayloads = emailPayloads.concat(
                resetOrderApprovalAfterMaterialChange_(ss, sheet, row, updatedRow, orderColumns, actor, cleanMessage)
              );
            }
          }

          SpreadsheetApp.flush();
          markDataChanged_();

          const requester = data[i][3];
          if (!attachmentOnly && requester && !requester.includes("Finance (Direct)")) {
            const orderObj = extractOrderData_(updatedRow, orderColumns);
            const itemLabel = orderObj.recordType === "Invoice" ? "invoice" : "order";
            const senderLabel = user.capabilities.hasExplicitOrderProcessingPermission ? "Ordering Team" : "Finance";
            const emailMsg = cleanMessage ? `The status of your ${itemLabel} has been updated.<br><strong>Message from ${senderLabel}:</strong> "${escapeEmailHtml_(cleanMessage)}"` : `The status of your ${itemLabel} has been updated.`;
            emailPayloads.push({
              to: requester,
              subject: `${orderObj.recordType === "Invoice" ? "Invoice" : "Order"} Update: ` + orderObj.desc,
              body: formatEmailBody_(orderObj.recordType === "Invoice" ? "Invoice Updated" : "Order Updated", emailMsg, orderObj)
            });
          }
          return "Updated";
        }
      }
      return "Order Not Found";
    }, () => "Error: System busy. Please try again.");

    if (result !== "Updated") return createWriteFailure_(result);
    saved = true;
    const warning = buildNotificationWarning_(emailPayloads);
    return createWriteSuccess_("Order updated successfully.", warning);
  } catch (e) {
    if (isPortalValidationError_(e)) return invoiceWriteFailure_(e);
    if (e.saveUncertain) saved = true;
    logError_(e, "updateOrder");
    throw e;
  } finally {
    if (!saved && uploadedFileIds.length) trashUploadedFiles_(uploadedFileIds);
  }
}

function userCancelOrder(id, reason, expectedVersion) {
  const emailPayloads = [];
  try {
    const result = withWriteLock_("userCancelOrder", () => {
      const user = getUserContext();
      const cleanId = validateTextField_(id, "Order reference", { required: true, maxLength: 100 });
      const cleanReason = validateTextField_(reason, "Cancellation reason", { required: true, maxLength: 500 });
      const sheet = getPortalSpreadsheet_().getSheetByName("Orders");
      if (!sheet) return "Error: Orders sheet not found";
      const orderColumns = getOrdersMetadataColumnsForRead_(sheet);
      const data = sheet.getDataRange().getValues();

      assertUniqueOrderReference_(data, cleanId);
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString() === cleanId) {
          requireOrderVersion_(data[i], expectedVersion);
          const orderDept = data[i][1];
          const hasAccess = user.depts.includes(orderDept);
          if (!canCancelPurchase_(user,data[i],orderColumns)) return "Error: You cannot cancel this purchase. Refresh to check its current status and your access.";
          const recordType = getOrderRecordType_(data[i], orderColumns.recordTypeIndex);
          if (!canViewOrderRecord_(user, orderDept, recordType)) return "Error: Unauthorized";
          const currentDescription = (data[i][6] || "").toString().trim().toUpperCase();
          if (recordType === "Transfer" || isOrderCompleted_(data[i]) || isOrderCancelled_(data[i], orderColumns)) {
            return "Error: This order is no longer pending and cannot be cancelled.";
          }

          const cancellationColumn = ensureOrdersColumn_(sheet, ORDER_CANCELLATION_HEADER_, { hidden: true });
          sheet.getRange(i + 1, cancellationColumn).setValue(JSON.stringify({status:'Cancelled',reason:cleanReason,by:user.realEmail || user.email,at:new Date().toISOString()}));
          sheet.getRange(i + 1, 7).setValue("CANCELLED - " + data[i][6]);
          sheet.getRange(i + 1, 16).setValue(0);

          if (cleanReason) {
            const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
            const cancelNote = `[${timestamp} ${user.email.split('@')[0]}]: Cancelled. Reason: ${cleanReason}\n`;
            const currentNotes = sheet.getRange(i + 1, 18).getValue();
            sheet.getRange(i + 1, 18).setValue(appendPurchaseNoteText_(currentNotes,cancelNote));
          }

          SpreadsheetApp.flush();
          markDataChanged_();
          const orderObj = extractOrderData_(data[i],orderColumns);
          orderObj.status = 'Cancelled';
          const recipients = [...new Set([data[i][3],getConfig_().financeEmail].filter(value => value && String(value).includes('@')))];
          recipients.forEach(to => emailPayloads.push({to,subject:'Cancelled: '+cleanId+' — '+orderObj.desc,
            body:formatEmailBody_('Request cancelled','Cancelled by '+escapeEmailHtml_(user.email)+'.<br><strong>Reason:</strong> '+escapeEmailHtml_(cleanReason),orderObj)}));
          return "Success";
        }
      }
      return "Error: Order not found";
    }, () => "Error: System busy. Please try again.");
    return result === "Success" ? createWriteSuccess_("Request "+id+" cancelled successfully.",buildNotificationWarning_(emailPayloads)) : createWriteFailure_(result);
  } catch (e) {
    if (isPortalValidationError_(e)) return createWriteFailure_(e.message);
    logError_(e, "userCancelOrder");
    throw e;
  }
}

function addNote(id, noteText, expectedVersion) {
  let emailPayload = null;
  try {
    const result = withWriteLock_("addNote", () => {
      const user = getUserContext();
      const config = getConfig_();
      const cleanId = validateTextField_(id, "Order reference", { required: true, maxLength: 100 });
      const cleanNote = validateTextField_(noteText, "Note", { required: true, maxLength: 1000 });
      const ss = getPortalSpreadsheet_();
      const sheet = ss.getSheetByName("Orders");
      const orderColumns = getOrdersMetadataColumnsForRead_(sheet);
      const data = sheet.getRange(1, 1, sheet.getLastRow(), orderColumns.lastColumn).getValues();
      assertUniqueOrderReference_(data, cleanId);
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString() === cleanId) {
          if (!canAddPurchaseNote_(user,data[i],orderColumns)) return "Unauthorized";
          requireOrderVersion_(data[i], expectedVersion);
          const row = i + 1;
          const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
          const senderName = user.capabilities.canAddFinanceNotes ? "Finance" : user.email.split('@')[0];
          const newEntry = `[${timestamp} ${senderName}]: ${cleanNote}\n`;
          const currentNotes = sheet.getRange(row, 18).getValue();
          const mergedNotes = appendPurchaseNoteText_(currentNotes,newEntry);
          sheet.getRange(row, 18).setValue(mergedNotes);
          data[i][17] = mergedNotes;

          SpreadsheetApp.flush();
          markDataChanged_();

          const orderRequester = data[i][3].toString();
          const isRequester = user.email.toLowerCase() === orderRequester.toLowerCase();
          const target = isRequester ? config.financeEmail : orderRequester;
          if (!target.includes("Finance (Direct)")) {
            const orderObj = extractOrderData_(data[i], orderColumns);
            const msg = `New note added by <strong>${escapeEmailHtml_(senderName)}</strong>:<br>"${escapeEmailHtml_(cleanNote)}"`;
            emailPayload = {
              to: target,
              subject: "New Note: " + orderObj.desc,
              body: formatEmailBody_("New Note Added", msg, orderObj)
            };
          }
          return "Note Added";
        }
      }
      return "Order Not Found";
    }, () => "Error: System busy. Please try again.");

    if (result !== "Note Added") return createWriteFailure_(result);
    const warning = buildNotificationWarning_(emailPayload ? [emailPayload] : []);
    return createWriteSuccess_("Note added successfully.", warning);
  } catch (e) {
    if (isPortalValidationError_(e)) return createWriteFailure_(e.message);
    logError_(e, "addNote");
    throw e;
  }
}

function reportMissingBudget(deptName) {
  const user = getUserContext();
  const config = getConfig_();
  const department = validateTextField_(deptName, "Department", { required: true, maxLength: 200 });
  const cacheKey = portalStateKey_("missing_budget_") + Utilities.base64EncodeWebSafe((user.realEmail || user.email) + "|" + department).slice(0, 180);
  const cache = CacheService.getScriptCache();
  if (cache.get(cacheKey)) return { success: true, rateLimited: true };
  cache.put(cacheKey, "1", 3600);
  const emailResult = sendEmailAlert_(config.financeEmail, "Config Error", `User ${escapeEmailHtml_(user.email)} tried accessing department "${escapeEmailHtml_(department)}" which has no budget set.`);
  return { success: emailResult.success, rateLimited: false };
}

// Return metadata lives on the purchase and its immutable linked credits.
// Original purchase amounts remain intact; only completed credits affect spend.
function getOrderReturnInfo_(row, columns) {
  const index = columns && Number.isInteger(columns.returnIndex) ? columns.returnIndex : -1;
  let state = {};
  if (index >= 0 && row[index]) {
    try { state = JSON.parse(row[index]); }
    catch (_) { throw new Error('Return history could not be read. Contact IT before changing this purchase.'); }
  }
  const refunds = Array.isArray(state.refunds) ? state.refunds : [];
  const refundedCents = refunds.reduce((sum, item) => item.reversalId ? sum : sum + Math.round(Number(item.amount) * 100), 0);
  const original = Number(row[15] !== '' && row[15] != null ? row[15] : row[10]) || 0;
  const remainingCents = Math.round(original * 100) - refundedCents;
  return {parentId:state.parentId || '', adjustmentKind:state.adjustmentKind || (state.parentId ? 'refund' : ''),
    creditId:state.creditId || '', pending:state.pending === true, refunds,
    refunded:refundedCents / 100, original, remaining:remainingCents / 100,
    status:state.pending ? 'Return pending' : refundedCents > 0 ? (remainingCents === 0 ? 'Refunded' : 'Partially refunded') : refunds.length ? 'Refund reversed' : '',
    history:Array.isArray(state.history) ? state.history : []};
}

function getOrderReturnActions_(user, row, columns) {
  const info = getOrderReturnInfo_(row, columns);
  const eligible = ['Order','Invoice'].includes(getOrderRecordType_(row, columns.recordTypeIndex)) &&
    isOrderCompleted_(row) && !isOrderCancelled_(row, columns) && !info.parentId && info.original > 0 && !isSystemBudgetDepartment_(row[1]);
  const finance = !!user.capabilities.canViewAllFinanceData;
  const ordering = hasProcessingDepartment_(user, row[1]) ||
    (!!user.capabilities.hasExplicitOrderProcessingPermission && (user.depts || []).includes(row[1]));
  const administrator = user.role === ROLE_ADMIN_ && user.realRole === ROLE_ADMIN_ && (!user.isSimulated || isDevelopmentRuntime_());
  return {canMarkReturn:eligible && (finance || ordering || hasDepartmentAccess_(user, row[1])),
    canRefund:eligible && (finance || ordering),
    canReverseRefund:eligible && administrator && info.refunds.some(refund => !refund.reversalId)};
}

function requireRefundFinancialIntegrity_(row, columns) {
  const info = getOrderReturnInfo_(row, columns);
  if (info.parentId || info.refunds.length) throw createPortalValidationError_(
    'This purchase has a linked refund. Its financial details are protected. Use notes or attachments for extra information. An Admin can reverse an incorrect refund on the original purchase.');
}

function requireReturnAction_(user, target, action) {
  const permissions = getOrderReturnActions_(user,target.row,target.columns);
  const allowed = action === 'refund' ? permissions.canRefund : action === 'reverse' ? permissions.canReverseRefund : permissions.canMarkReturn;
  if (!allowed) throw createPortalValidationError_('You do not have permission for this return action, or it is no longer available.');
}

function requireRefundEvidenceMatch_(target, user, form, amount, date, refundReference) {
  const {id,row,columns,rows} = target;
  const purchase = getOrderReturnInfo_(row,columns);
  if (refundReference) {
    const reversedCreditIds = new Set(purchase.refunds.filter(refund=>refund.reversalId).map(refund=>String(refund.id)));
    requireUniqueInvoice_(rows,columns,row[4],refundReference,'','Invoice',user,reversedCreditIds);
    return;
  }
  const cutoff = new Date(date).getTime() - 30 * 86400000;
  const latest = new Date(date).getTime() + 30 * 86400000;
  const matches = rows.slice(1).filter(candidate => {
    if (getOrderRecordType_(candidate,columns.recordTypeIndex) !== 'Invoice' || isOrderCancelled_(candidate,columns) ||
        candidate[1] !== row[1] || normalizeConfigurationKey_(candidate[4]) !== normalizeConfigurationKey_(row[4]) ||
        Number(candidate[15] === '' || candidate[15] == null ? candidate[10] : candidate[15]) !== -amount) return false;
    const recorded = candidate[13] instanceof Date ? candidate[13] : candidate[2];
    if (!(recorded instanceof Date) || recorded.getTime() < cutoff || recorded.getTime() > latest) return false;
    const related = getOrderReturnInfo_(candidate,columns);
    return !related.parentId || (related.parentId === id && purchase.refunds.some(refund => String(refund.id) === String(candidate[0]) && !refund.reversalId));
  });
  if (!matches.length) return;
  const token = orderVersion_([id,amount,String(form.date),matches.map(match => orderVersion_(match))]);
  if (form.duplicateConfirmation === token) return;
  const error = createPortalValidationError_('A similar credit is already recorded. Check it before confirming this is a different refund.', 'POSSIBLE_DUPLICATE_REFUND');
  const visible = matches.find(match=>canViewOrderRecord_(user,match[1],'Invoice'));
  if (visible) error.matchingOrderId = String(visible[0]);
  error.duplicateConfirmation = token;
  throw error;
}

function saveOrderReturn(input) {
  const form = input || {}, uploadedFileIds = [];
  let saved = false;
  try {
    const action = form.action;
    if (!['mark','cancel','refund','reverse'].includes(action)) throw createPortalValidationError_('Choose a return action.');
    const files = action === 'refund' ? getOrderUploadFiles_(form) : [];
    if (files.length) {
      const user = getAuthorizedUserContext_();
      requireReturnAction_(user,readFinanceMutationTarget_(form,user),action);
    }
    const evidence = uploadFinanceEvidence_(files,uploadedFileIds);
    const result = withWriteLock_('saveOrderReturn', () => {
      const user = getAuthorizedUserContext_(), target = readFinanceMutationTarget_(form,user);
      const {id,ss,sheet,columns,rows,row,rowNumber} = target;
      requireReturnAction_(user,target,action);
      const info = getOrderReturnInfo_(row,columns);
      const note = validateTextField_(form.note,action === 'reverse' ? 'Reason for reversal' : 'Note',{required:action === 'mark' || action === 'reverse',maxLength:1000});
      const actor = financeMutationActor_(user);
      const now = new Date(), entry = {action,by:actor,at:now.toISOString(),note};
      const state = {pending:info.pending,refunds:info.refunds.slice(),history:info.history.slice()};
      let message, creditId = '', reversalId = '', noteText;
      const metaColumn = ensureOrdersColumn_(sheet,'Return and refund history',{hidden:true});
      const appendAdjustment = (adjustmentId, cost, date, description, adjustmentNote, invoiceNumber, attachments, meta) => {
        const adjustment = appendOrderRow_(sheet,[adjustmentId,row[1],now,row[3],row[4],'',
          description,'',1,cost,cost,row[11],'',date,'',cost,'',adjustmentNote,'',attachments.join(', ')],
          'Invoice',columns.glCodeIndex >= 0 ? row[columns.glCodeIndex] : '',invoiceNumber,actor,getOrderPaymentMethod_(row,columns),getOrderReportingSite_(row,columns));
        sheet.getRange(adjustment.rowNumber,adjustment.columns.processedByColumn).setValue(actor);
        sheet.getRange(adjustment.rowNumber,metaColumn).setValue(JSON.stringify(meta));
      };
      if (action === 'mark') {
        if (info.pending || info.remaining <= 0) throw createPortalValidationError_('This purchase is already awaiting a refund or fully refunded. Refresh the Order List.');
        state.pending = true;
        noteText = 'Return pending';
        message = 'Return marked. The budget is unchanged until a refund is confirmed.';
      } else if (action === 'cancel') {
        if (!info.pending) throw createPortalValidationError_('There is no pending return to cancel.');
        state.pending = false;
        noteText = 'Return cancelled';
        message = 'Return cancelled. Any refunds already recorded have been kept.';
      } else if (action === 'reverse') {
        creditId = validateTextField_(form.creditId,'Credit reference',{required:true,maxLength:100});
        const refundIndex = state.refunds.findIndex(item => item.id === creditId && !item.reversalId);
        const refund = state.refunds[refundIndex];
        const credits = rows.slice(1).filter(candidate => String(candidate[0]) === creditId);
        const credit = credits[0];
        if (!refund || credits.length !== 1 || getOrderRecordType_(credit,columns.recordTypeIndex) !== 'Invoice' ||
            isOrderCancelled_(credit,columns) || getOrderReturnInfo_(credit,columns).parentId !== id ||
            credit[1] !== row[1] || Number(credit[15]) !== -Number(refund.amount)) {
          throw createPortalValidationError_('This credit is no longer available to reverse. Refresh the Order List and check the refund history.');
        }
        const amount = validateMoneyField_(refund.amount,'Refund amount',{positive:true});
        reversalId = nextOrderId_();
        appendAdjustment(reversalId,amount,now,'Refund reversal for '+creditId+' — '+row[6],
          'Refund reversed by '+actor+'. Original purchase: '+id+'. Original credit: '+creditId+'\n'+note,
          '',[],{parentId:id,creditId,adjustmentKind:'reversal'});
        state.pending = state.pending || form.reopenReturn === true;
        state.refunds[refundIndex] = {...refund,reversalId,reversedBy:actor,reversedAt:now.toISOString(),reversalReason:note};
        Object.assign(entry,{amount,creditId,reversalId,reopened:form.reopenReturn === true});
        noteText = 'Refund reversed: £'+amount.toFixed(2)+'; credit '+creditId+'; adjustment '+reversalId;
        message = 'Refund reversed. £'+amount.toFixed(2)+' was added back to spending for '+row[1]+'.';
      } else {
        if (form.confirmed !== true) throw createPortalValidationError_('Confirm that the refund has been received and has not already been recorded.');
        const refundReference = validateTextField_(form.refundReference,'Supplier refund reference',{maxLength:100});
        if (!refundReference && !evidence.length) throw createPortalValidationError_('Enter a supplier refund reference or attach evidence of the refund.','REFUND_EVIDENCE_REQUIRED');
        const amount = validateMoneyField_(form.amount,'Amount refunded',{positive:true});
        if (Math.round(amount*100) > Math.round(info.remaining*100)) throw createPortalValidationError_('Enter an amount no more than the remaining purchase cost.');
        const date = parseOptionalDateField_(form.date,'Refund date');
        if (!date || date.getTime() > now.getTime()) throw createPortalValidationError_('Enter the date the refund was received, up to today.');
        const purchaseDate = row[13] instanceof Date ? row[13] : row[2] instanceof Date ? row[2] : null;
        if (purchaseDate) {
          const earliest = new Date(purchaseDate.getFullYear(),purchaseDate.getMonth(),purchaseDate.getDate());
          if (date < earliest) throw createPortalValidationError_('Refund date cannot be before the purchase date.');
        }
        requireRefundEvidenceMatch_(target,user,form,amount,date,refundReference);
        state.pending = Math.round(amount*100) < Math.round(info.remaining*100) && form.keepPending === true;
        creditId = nextOrderId_();
        appendAdjustment(creditId,-amount,date,'Refund for '+id+' — '+row[6],
          'Refund confirmed by '+actor+'. Original purchase: '+id+(note?'\n'+note:''),
          refundReference,evidence,{parentId:id,adjustmentKind:'refund'});
        state.refunds.push({id:creditId,amount,date:form.date,by:actor,at:now.toISOString(),note,reference:refundReference});
        Object.assign(entry,{amount,creditId,date:form.date,reference:refundReference,evidenceCount:evidence.length});
        noteText = 'Refund received: £'+amount.toFixed(2)+'; linked credit '+creditId;
        message = 'Refund recorded. £'+amount.toFixed(2)+' has been credited to '+row[1]+'.';
      }
      state.history.push(entry);
      const historyJson = JSON.stringify(state);
      if (historyJson.length > 45000) throw createPortalValidationError_('This purchase has too much return history. Contact IT.');
      sheet.getRange(rowNumber,metaColumn).setValue(historyJson);
      const noteEntry = '['+now.toISOString().slice(0,10)+' '+actor+']: '+noteText+(note ? '. '+note : '')+'\n';
      sheet.getRange(rowNumber,18).setValue(appendPurchaseNoteText_(row[17],noteEntry));
      appendOrderFieldChanges_(ss,id,actor,[{field:'Return / refund',oldValue:info.status,newValue:JSON.stringify(entry)}]);
      markDataChanged_();
      return Object.assign(createWriteSuccess_(message),{creditId,reversalId});
    });
    saved = result.saved;
    return result;
  } catch (error) {
    if (isPortalValidationError_(error)) return invoiceWriteFailure_(error);
    if (error.saveUncertain) saved = true;
    logError_(error,'saveOrderReturn');
    throw error;
  } finally {
    if (!saved) trashUploadedFiles_(uploadedFileIds);
  }
}

