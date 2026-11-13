// DEV delivery remains restricted while live notifications retain their intended recipients.
function sendDevelopmentServiceEmail_(emailData) {
  if (!isDevelopmentRuntime_()) throw new Error('Service sender testing requires the DEV portal.');
  const owner = 'andy.clifton@claremontschool.co.uk';
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== owner) throw new Error('Unexpected test execution account.');
  if (emailData.to !== owner || emailData.cc || emailData.bcc) throw new Error('Test delivery is restricted to Andy.');
  return sendPortalServiceEmail_(emailData);
}

function sendPortalServiceEmail_(emailData) {
  portalAssertExecutionAccount_();
  // Error reporting must work even when the configuration spreadsheet cannot be read.
  const sender = 'service.orders@claremontschool.co.uk';
  const recipient = String(emailData.to || '').trim();
  if (!recipient || /[\r\n]/.test(recipient)) throw new Error('Invalid notification recipient.');
  const replyTo = String(emailData.replyTo || Session.getEffectiveUser().getEmail()).trim();
  if (/[\r\n]/.test(replyTo)) throw new Error('Invalid reply address.');
  const boundary = 'portal_' + Utilities.getUuid();
  const alternative = boundary + '_alternative';
  const textPart = (type, value) => ['Content-Type: ' + type + '; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', serviceEmailBase64_(String(value || ''))].join('\r\n');
  let content = textPart('text/plain', emailData.body);
  if (emailData.htmlBody) {
    content = ['Content-Type: multipart/alternative; boundary="' + alternative + '"', '',
      '--' + alternative, content, '--' + alternative, textPart('text/html', emailData.htmlBody),
      '--' + alternative + '--', ''].join('\r\n');
  }
  if (emailData.attachments && emailData.attachments.length) {
    const parts = ['Content-Type: multipart/mixed; boundary="' + boundary + '"', '', '--' + boundary, content];
    emailData.attachments.forEach(attachment => {
      const blob = attachment.getBlob ? attachment.getBlob() : attachment;
      const type = String(blob.getContentType() || 'application/octet-stream');
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(type)) throw new Error('Invalid attachment content type.');
      const name = String(blob.getName() || 'attachment').replace(/[\r\n\x00]/g, '');
      const fallbackName = name.replace(/[^a-zA-Z0-9._ -]/g, '_');
      const encodedName = encodeURIComponent(name).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16));
      parts.push('--' + boundary, 'Content-Type: ' + type,
        'Content-Disposition: attachment; filename="' + fallbackName + '"; filename*=UTF-8\'\'' + encodedName,
        'Content-Transfer-Encoding: base64', '', serviceEmailBase64_(blob.getBytes()));
    });
    parts.push('--' + boundary + '--', '');
    content = parts.join('\r\n');
  }
  const message = [
    'From: Claremont Order Portal <' + sender + '>',
    'To: ' + recipient,
    'Reply-To: ' + replyTo,
    'Subject: ' + serviceEmailSubject_(emailData.subject),
    'MIME-Version: 1.0'
  ];
  for (const field of ['cc', 'bcc']) {
    if (!emailData[field]) continue;
    const addresses = String(emailData[field]).trim();
    if (/[\r\n]/.test(addresses)) throw new Error('Invalid copy recipient.');
    message.push((field === 'cc' ? 'Cc: ' : 'Bcc: ') + addresses);
  }
  message.push(content);
  return Gmail.Users.Messages.send({raw:Utilities.base64EncodeWebSafe(message.join('\r\n'), Utilities.Charset.UTF_8)}, 'me');
}

function serviceEmailBase64_(value) {
  const encoded = typeof value === 'string' ? Utilities.base64Encode(value, Utilities.Charset.UTF_8) : Utilities.base64Encode(value);
  return (encoded.match(/.{1,76}/g) || []).join('\r\n');
}

function serviceEmailSubject_(subject) {
  const characters = Array.from(String(subject || 'Portal Notification'));
  const words = [];
  for (let index = 0; index < characters.length; index += 12) {
    words.push('=?UTF-8?B?' + Utilities.base64Encode(characters.slice(index, index + 12).join(''), Utilities.Charset.UTF_8) + '?=');
  }
  return words.join('\r\n ');
}

function requireDevelopmentSenderOwner_() {
  const user = getAuthorizedUserContext_();
  if (user.isSimulated || user.role !== ROLE_ADMIN_ || Session.getActiveUser().getEmail().toLowerCase() !== 'andy.clifton@claremontschool.co.uk') {
    throw new Error('Only Andy can run the sender verification.');
  }
}

function developmentSenderTestPage_() {
  requireDevelopmentSenderOwner_();
  const authorization = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/gmail.send']);
  if (authorization.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) {
    return HtmlService.createHtmlOutput('<h1>Portal sender permission</h1><p>Andy must authorize Gmail sending for this portal project.</p><a target="_blank" href="' + escapeEmailHtml_(authorization.getAuthorizationUrl()) + '">Review portal permissions</a>');
  }
  const environment = isDevelopmentRuntime_() ? 'DEV' : 'LIVE';
  // Read the current environment's resources without changing orders or attachments.
  getPortalSpreadsheet_().getSheets();
  getPortalAttachmentFolder_();
  return HtmlService.createHtmlOutput('<!doctype html><html><body style="font:16px Arial;padding:32px">' +
    '<h1>Portal ' + environment + ' sender verification</h1><p>Execution account: ' + escapeEmailHtml_(Session.getEffectiveUser().getEmail()) + '</p>' +
    '<p>' + environment + ' spreadsheet access verified. Attachment folder access and upload capability verified.</p>' +
    '<p>From service.orders@claremontschool.co.uk to andy.clifton@claremontschool.co.uk</p>' +
    '<p>This sends through the portal notification function using its HTML and plain-text templates.</p>' +
    '<button onclick="this.disabled=true;google.script.run.withSuccessHandler(r=>document.getElementById(\'result\').textContent=JSON.stringify(r)).withFailureHandler(e=>document.getElementById(\'result\').textContent=e.message).verifyDevelopmentServiceSender()">Send portal test</button><p id="result"></p>' +
    '<button onclick="this.disabled=true;google.script.run.withSuccessHandler(r=>document.getElementById(\'reportResult\').textContent=JSON.stringify(r)).withFailureHandler(e=>document.getElementById(\'reportResult\').textContent=e.message).sendWeeklyFinanceTest()">Send weekly report test to IT</button><p id="reportResult"></p>' +
    '<button onclick="this.disabled=true;google.script.run.withSuccessHandler(r=>document.getElementById(\'alertResult\').textContent=JSON.stringify(r)).withFailureHandler(e=>document.getElementById(\'alertResult\').textContent=e.message).verifyTechnicalServiceSender()">Send synthetic technical alert</button><p id="alertResult"></p></body></html>');
}

function verifyTechnicalServiceSender() {
  requireDevelopmentSenderOwner_();
  const key = portalStateKey_('TECHNICAL_SENDER_VERIFICATION_20261111');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const previous = properties.getProperty(key);
    if (previous) return JSON.parse(previous);
    properties.setProperty(key, JSON.stringify({status:'Sending; check the inbox before any retry.'}));
    const result = sendPortalErrorNotification_('Synthetic sender verification. No portal fault occurred.', 'service sender verification', {test:true});
    properties.setProperty(key, JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function verifyDevelopmentServiceSender() {
  requireDevelopmentSenderOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const environment = isDevelopmentRuntime_() ? 'DEV' : 'LIVE';
    const verificationKey = environment + '_SERVICE_SENDER_VERIFICATION_20261111';
    const previous = properties.getProperty(verificationKey);
    if (previous) {
      const result = JSON.parse(previous);
      // This specific rejection happens before Gmail accepts a message, so retry is safe after authorization.
      const authorizationRejected = result.success === false && String(result.error).includes('You do not have permission to call gmail.users.messages.send');
      if (!authorizationRejected) return result;
    }
    properties.setProperty(verificationKey, JSON.stringify({status:'Send started; check the inbox before retrying.'}));
    const result = sendEmailAlert_('andy.clifton@claremontschool.co.uk', '[' + environment + ' VERIFICATION] Service sender 11 November 2026',
      '<h2>Service sender verification</h2><p>This test was sent through the Order Portal ' + environment + ' notification function to Andy only.</p><p>Unicode and currency check: £70.00 · 1–31 October.</p>');
    properties.setProperty(verificationKey, JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}
