/** Manual account recovery. Normal portal requests never activate these steps. */
const PORTAL_RECOVERY_IT_ = 'it@claremontschool.co.uk';
const PORTAL_RECOVERY_CONFIRMATION_ = 'ACTIVATE IT RECOVERY';

function portalRecoveryContext_(itOnly) {
  const p = PropertiesService.getScriptProperties();
  const expectedId = p.getProperty('PORTAL_RECOVERY_SPREADSHEET_ID');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!expectedId || !ss || ss.getId() !== expectedId) throw new Error('Recovery stopped: the bound spreadsheet does not match the configured recovery spreadsheet.');
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  const owner = String(p.getProperty('PORTAL_EXECUTION_ACCOUNT') || '').trim().toLowerCase();
  if (!active || active !== effective || (itOnly ? active !== PORTAL_RECOVERY_IT_ : ![owner, PORTAL_RECOVERY_IT_].includes(active))) {
    throw new Error('Recovery stopped: run this function directly while signed into ' + (itOnly ? PORTAL_RECOVERY_IT_ : 'the operating account or the IT account') + '.');
  }
  const sheet = ss.getSheetByName('Users');
  if (!sheet) throw new Error('Recovery stopped: Users is missing.');
  const rows = sheet.getDataRange().getValues();
  const schema = getUserConfigurationSchema_(sheet, false, rows[0]);
  const row = rows.slice(1).find(r => String(r[schema.emailIndex] || '').trim().toLowerCase() === active);
  if (!row || String(row[schema.roleIndex] || '').trim() !== 'Admin' ||
      (schema.activeIndex >= 0 && !isConfigurationActiveValue_(row[schema.activeIndex])) ||
      (schema.simulationEmailIndex >= 0 && String(row[schema.simulationEmailIndex] || '').trim())) {
    throw new Error('Recovery stopped: this account must be an active, unsimulated portal Admin.');
  }
  return { p, ss, email: active, user: { realEmail: active, email: active, role: 'Admin', isSimulated: false } };
}

function portalRecoveryFolder_(p) {
  const id = p.getProperty('PORTAL_ATTACHMENT_FOLDER_ID');
  if (!id) throw new Error('Recovery stopped: PORTAL_ATTACHMENT_FOLDER_ID is missing.');
  const folder = Drive.Files.get(id, { supportsAllDrives: true,
    fields: 'id,name,mimeType,trashed,driveId,capabilities(canAddChildren)' });
  if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') throw new Error('Recovery stopped: the configured attachment folder is unavailable.');
  return folder;
}

function portalRecoveryOwnTriggers_() {
  return ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'weeklyFinanceSchedule')
    .map(t => ({ id: t.getUniqueId(), handler: t.getHandlerFunction(), event: String(t.getEventType()) }));
}

function portalRecoveryLog_(result) {
  console.log(JSON.stringify(result));
  return result;
}

function checkItRecoveryReadiness() {
  const c = portalRecoveryContext_(true);
  const folder = portalRecoveryFolder_(c.p);
  const data = Drive.Files.get(c.ss.getId(), { supportsAllDrives: true, fields: 'id,driveId' });
  const stored = reportStoredSettings_(c.ss);
  const triggers = portalRecoveryOwnTriggers_();
  const required = ['PORTAL_EXECUTION_ACCOUNT', 'PORTAL_PUBLIC_URL', 'PORTAL_ERROR_ALERT_EMAIL'];
  const missing = required.filter(k => !c.p.getProperty(k));
  getPortalPublicUrl_(); getPortalErrorAlertEmail_();
  return portalRecoveryLog_({ ready: !!data.driveId && !!folder.driveId && !!folder.capabilities?.canAddChildren && !missing.length,
    effectiveAccount: c.email, spreadsheetId: c.ss.getId(), sharedDriveId: data.driveId || '',
    attachmentFolderId: folder.id, attachmentSharedDriveId: folder.driveId || '',
    attachmentWritable: !!folder.capabilities?.canAddChildren, missingSettings: missing,
    operatingAccount: c.p.getProperty('PORTAL_EXECUTION_ACCOUNT'),
    reportingOwner: stored ? stored.owner : c.p.getProperty('WEEKLY_FINANCE_OWNER'),
    reportingEnabled: stored ? stored.enabled : c.p.getProperty('WEEKLY_FINANCE_ENABLED') === 'true',
    recoveryState: c.p.getProperty('PORTAL_RECOVERY_STATE') || 'NOT_PREPARED', ownFinanceTriggers: triggers,
    chatConfigured: !!c.p.getProperty('ORDER_CHAT_WEBHOOK_URL'), mailQuota: MailApp.getRemainingDailyQuota() });
}

function testPortalRecoveryServices() {
  const c = portalRecoveryContext_(false);
  const folder = portalRecoveryFolder_(c.p);
  if (!folder.capabilities?.canAddChildren) throw new Error('Service test stopped: the attachment folder is not writable.');
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Service test stopped: no mail quota remains.');
  const name = 'OrderPortal-DR-TEST-' + Utilities.getUuid() + '.txt';
  let id = '', trashed = false;
  try {
    const file = uploadFileToPortalFolder_(folder,
      Utilities.base64Encode('Synthetic disaster recovery service check. No order data.'), name, 'text/plain');
    id = file.fileId;
    const pdf = Utilities.newBlob('<html><body><h1>OrderPortal recovery service test</h1><p>Synthetic test only. No live order or finance data.</p></body></html>', 'text/html', 'DR-test.html')
      .getAs(MimeType.PDF).setName('OrderPortal-DR-service-test.pdf');
    Drive.Files.update({ trashed: true }, id, null, { supportsAllDrives: true });
    trashed = true;
    MailApp.sendEmail({ to: PORTAL_RECOVERY_IT_, subject: '[TEST ONLY] OrderPortal disaster recovery services',
      body: 'Synthetic service test only. Executed as ' + c.email + '. Attachment creation, PDF conversion and reversible cleanup succeeded. No orders were written.',
      attachments: [pdf], name: 'Claremont Order Portal', replyTo: 'noreply@claremontschool.co.uk' });
    return portalRecoveryLog_({ success: true, effectiveAccount: c.email, testFileId: id, testFileTrashed: true,
      emailedTo: PORTAL_RECOVERY_IT_, pdfGenerated: true, uploadContractVerified: !!file.url && file.filename === name,
      liveOrdersWritten: false });
  } finally {
    if (id && !trashed) Drive.Files.update({ trashed: true }, id, null, { supportsAllDrives: true });
  }
}

function portalRecoverySaveFinance_(c, settings) {
  const sheet = c.ss.getSheetByName('Config');
  if (!sheet) throw new Error('Recovery stopped: Config is missing.');
  const rows = sheet.getDataRange().getValues();
  const index = rows.findIndex(r => r[0] === 'Weekly Finance Settings');
  sheet.getRange(index < 0 ? sheet.getLastRow() + 1 : index + 1, 1, 1, 2)
    .setValues([['Weekly Finance Settings', JSON.stringify(settings)]]);
  SpreadsheetApp.flush();
}

function portalRecoveryAudit_(c, action, details) {
  appendConfigurationAudit_(c.ss, c.user, action, 'OrderPortal disaster recovery', details);
  // Editor execution must not call web-runtime helpers or development setup.
  const version = Number(c.p.getProperty('configuration_data_version') || 0) + 1;
  c.p.setProperty('configuration_data_version', String(version));
  SpreadsheetApp.flush();
}

function stageItRecovery() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const c = portalRecoveryContext_(true);
    const folder = portalRecoveryFolder_(c.p);
    if (!folder.driveId || !folder.capabilities?.canAddChildren) throw new Error('Recovery stopped: attachments must be writable and school-owned in a shared drive.');
    const spreadsheet = Drive.Files.get(c.ss.getId(), { supportsAllDrives: true, fields: 'id,driveId' });
    if (!spreadsheet.driveId) throw new Error('Recovery stopped: the production spreadsheet must be school-owned in a shared drive.');
    const state = c.p.getProperty('PORTAL_RECOVERY_STATE');
    if (['STAGED', 'ACTIVE'].includes(state)) {
      if (c.p.getProperty('PORTAL_EXECUTION_ACCOUNT') !== PORTAL_RECOVERY_IT_ || !c.p.getProperty('PORTAL_RECOVERY_SNAPSHOT')) throw new Error('Recovery state is inconsistent. Ask an administrator to investigate.');
      return portalRecoveryLog_({ success: true, alreadyStaged: true, recoveryState: state, publicUrl: getPortalPublicUrl_() });
    }
    if (c.p.getProperty('PORTAL_RECOVERY_CONFIRMATION') !== PORTAL_RECOVERY_CONFIRMATION_) throw new Error('Recovery stopped: set PORTAL_RECOVERY_CONFIRMATION to ACTIVATE IT RECOVERY only when takeover is intended.');
    const url = c.p.getProperty('PORTAL_RECOVERY_NEW_URL') || '';
    if (!/^https:\/\/script\.google\.com\/(?:a\/macros\/claremontschool\.co\.uk\/s\/|macros\/s\/)[A-Za-z0-9_-]+\/exec$/.test(url)) throw new Error('Recovery stopped: PORTAL_RECOVERY_NEW_URL must be the new IT deployment /exec URL.');
    const stored = reportStoredSettings_(c.ss);
    const raw = c.p.getProperty('PORTAL_RECOVERY_SNAPSHOT');
    const snapshot = raw ? JSON.parse(raw) : {
      created: new Date().toISOString(), spreadsheetId: c.ss.getId(),
      operatingAccount: c.p.getProperty('PORTAL_EXECUTION_ACCOUNT'), publicUrl: getPortalPublicUrl_(),
      errorEmail: getPortalErrorAlertEmail_(),
      finance: stored || { cc: reportCc_(c.p.getProperty('WEEKLY_FINANCE_CC') ?? WEEKLY_REPORT_DEFAULT_CC_),
        enabled: c.p.getProperty('WEEKLY_FINANCE_ENABLED') === 'true', owner: c.p.getProperty('WEEKLY_FINANCE_OWNER') || '' }
    };
    if (snapshot.spreadsheetId !== c.ss.getId()) throw new Error('Recovery snapshot belongs to a different spreadsheet.');
    if (!raw) c.p.setProperty('PORTAL_RECOVERY_SNAPSHOT', JSON.stringify(snapshot));
    // Disable reporting before changing either owner. A retry completes a partial
    // stage using the original snapshot, never a snapshot of the disabled state.
    portalRecoverySaveFinance_(c, Object.assign({}, snapshot.finance, { enabled: false, owner: PORTAL_RECOVERY_IT_ }));
    c.p.setProperties({ WEEKLY_FINANCE_ENABLED: 'false', WEEKLY_FINANCE_OWNER: PORTAL_RECOVERY_IT_,
      WEEKLY_FINANCE_SPREADSHEET: c.ss.getId(), PORTAL_EXECUTION_ACCOUNT: PORTAL_RECOVERY_IT_,
      PORTAL_PUBLIC_URL: url, PORTAL_ERROR_ALERT_EMAIL: PORTAL_RECOVERY_IT_, PORTAL_RECOVERY_STATE: 'STAGED' });
    portalRecoveryAudit_(c, 'IT recovery staged', 'Execution moved to IT; scheduled reporting held for verification.');
    c.p.deleteProperty('PORTAL_RECOVERY_CONFIRMATION');
    return portalRecoveryLog_({ success: true, recoveryState: 'STAGED', operatingAccount: PORTAL_RECOVERY_IT_, publicUrl: url, reportingEnabled: false });
  } finally { lock.releaseLock(); }
}

function enableItRecoveryReporting() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const c = portalRecoveryContext_(true);
    if (!['STAGED', 'ACTIVE'].includes(c.p.getProperty('PORTAL_RECOVERY_STATE')) || c.p.getProperty('PORTAL_EXECUTION_ACCOUNT') !== PORTAL_RECOVERY_IT_) throw new Error('Stage IT recovery and verify the new portal first.');
    const snapshot = JSON.parse(c.p.getProperty('PORTAL_RECOVERY_SNAPSHOT') || 'null');
    if (!snapshot || snapshot.spreadsheetId !== c.ss.getId()) throw new Error('The original recovery snapshot is missing or mismatched.');
    const triggers = portalRecoveryOwnTriggers_();
    if (triggers.length !== 1 || triggers[0].event !== 'CLOCK') throw new Error('Create exactly one IT-owned weeklyFinanceSchedule time-driven trigger, using the IT deployment.');
    const key = 'WEEKLY_FINANCE_DELIVERY_' + reportPeriod_(new Date()).weekKey;
    const delivery = c.p.getProperty(key) || '';
    if (/^(SENDING|UNCERTAIN|PREPARING)/.test(delivery)) throw new Error('Reporting remains disabled: investigate the current report delivery and confirm receipt before changing its delivery record.');
    if (snapshot.finance.enabled && !isValidConfigurationEmail_(getConfig_(c.ss).financeEmail)) throw new Error('The existing Finance recipient is invalid; reporting remains disabled.');
    const current = reportStoredSettings_(c.ss);
    if (c.p.getProperty('PORTAL_RECOVERY_STATE') === 'ACTIVE' && current &&
        current.owner === PORTAL_RECOVERY_IT_ && !!current.enabled === !!snapshot.finance.enabled &&
        JSON.stringify(current.cc) === JSON.stringify(snapshot.finance.cc)) {
      return portalRecoveryLog_({ success: true, alreadyEnabled: true, recoveryState: 'ACTIVE', reportingEnabled: !!snapshot.finance.enabled, ownFinanceTriggers: triggers });
    }
    portalRecoverySaveFinance_(c, Object.assign({}, snapshot.finance, { owner: PORTAL_RECOVERY_IT_ }));
    c.p.setProperties({ WEEKLY_FINANCE_ENABLED: String(!!snapshot.finance.enabled), WEEKLY_FINANCE_OWNER: PORTAL_RECOVERY_IT_,
      WEEKLY_FINANCE_SPREADSHEET: c.ss.getId(), PORTAL_RECOVERY_STATE: 'ACTIVE' });
    portalRecoveryAudit_(c, 'IT recovery verified', 'Original reporting enabled state and CC list retained; no delivery history cleared.');
    return portalRecoveryLog_({ success: true, recoveryState: 'ACTIVE', reportingEnabled: !!snapshot.finance.enabled, ownFinanceTriggers: triggers });
  } finally { lock.releaseLock(); }
}

/** Read-only preparation inventory, including attachments outside the folder. */
function inspectPortalRecoveryResources() {
  const c = portalRecoveryContext_(false);
  const folderId = c.p.getProperty('PORTAL_ATTACHMENT_FOLDER_ID');
  const fields = 'id,name,mimeType,driveId,parents,owners(emailAddress),permissions(id,type,role,emailAddress,domain),size,md5Checksum,shortcutDetails(targetId)';
  const files = [], seen = new Set(), queue = [folderId];
  while (queue.length) {
    const parent = queue.shift();
    let token;
    do {
      const page = Drive.Files.list({ q: "'" + parent + "' in parents and trashed = false", supportsAllDrives: true, includeItemsFromAllDrives: true,
        pageSize: 1000, pageToken: token, fields: 'nextPageToken,files(' + fields + ')' });
      (page.files || []).forEach(file => { if (seen.has(file.id)) return; seen.add(file.id); files.push(file); if (file.mimeType === 'application/vnd.google-apps.folder') queue.push(file.id); });
      token = page.nextPageToken;
    } while (token);
  }
  const sheet = c.ss.getSheetByName('Orders');
  const referenced = new Set();
  if (sheet && sheet.getLastRow() > 1) sheet.getRange(2, 20, sheet.getLastRow() - 1, 1).getValues().forEach(row => {
    const value = String(row[0] || '');
    for (const match of value.matchAll(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{15,})/g)) referenced.add(match[1]);
  });
  const outside = [...referenced].filter(id => !seen.has(id)).map(id => {
    try { return Drive.Files.get(id, { supportsAllDrives: true, fields }); }
    catch (_) { return { id, unavailable: true }; }
  });
  const result = { captured: new Date().toISOString(), spreadsheetId: c.ss.getId(),
    folder: Drive.Files.get(folderId, { supportsAllDrives: true, fields }), files, referencedIds: [...referenced], outsideFolder: outside };
  return portalRecoveryLog_(result);
}
