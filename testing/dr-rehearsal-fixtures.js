/** REHEARSAL COPY ONLY. Must never be included in the production release. */
function sendRecoveryRehearsalMail_(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== '1H_RkPKQEQpeTiCHWjzMEDelLbigB0S6OqJhkXC5KsdM' || ss.getName() !== 'OrderPortal DR Rehearsal - synthetic data') throw new Error('Rehearsal mail refused: wrong container.');
  const safe = Object.assign({}, email, { to: 'it@claremontschool.co.uk', subject: '[DR REHEARSAL - SYNTHETIC] ' + email.subject });
  delete safe.cc; delete safe.bcc;
  MailApp.sendEmail(safe);
}

function seedRecoveryRehearsal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== '1H_RkPKQEQpeTiCHWjzMEDelLbigB0S6OqJhkXC5KsdM' || ss.getName() !== 'OrderPortal DR Rehearsal - synthetic data') throw new Error('Refusing to seed a production or unknown spreadsheet.');
  if (ss.getSheetByName('Orders')) throw new Error('Rehearsal already seeded; existing data will not be reset.');
  const drive = '1Sn-WRJYJG_R2T9oHfagspc7PlbZKRxZU';
  const folder = Drive.Files.create({name:'DR Rehearsal Attachments - synthetic only',mimeType:'application/vnd.google-apps.folder',parents:[drive]},null,{supportsAllDrives:true,fields:'id'});
  const put=(name,rows)=>{const sheet=ss.insertSheet(name);sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows);return sheet;};
  const headers=['ID','Department','Date of request','Requester','Supplier','Website link','Description','Product code','Quantity','Unit Price','Total Price (Est)','Delivery location','Date required by','Date ordered','Expected delivery date','Updated total price','Budget left to spend','Comments','Invoice Number','Attachment URL','Record Type','GL Code','Processed By','Approval Status','Approval Revision','Approved By','Approved At','Submitted By','Payment Method','Cancellation'];
  const row=Array(headers.length).fill('');
  Object.assign(row,{0:'DR-1001',1:'IT',2:new Date('2026-09-30T10:00:00Z'),3:'it@claremontschool.co.uk',4:'Synthetic Supplier',6:'Synthetic stationery',8:1,9:10,10:10,11:'Senior',20:'Order',21:'DR-IT',23:'NOT_REQUIRED',24:1,27:'it@claremontschool.co.uk'});
  put('Orders',[headers,row]).setFrozenRows(1);
  put('Budgets',[['Department','TotalAllocation','Spent','Remaining','GL Code','Active'],['IT',10000,10,9990,'DR-IT',true]]);
  put('Users',[['Email','Department','Role','Default Site','Simulation Email','Active','Can Process Orders','Can Log Invoices'],
    ['it@claremontschool.co.uk','IT','Admin','Senior','',true,true,true],['andy.clifton@claremontschool.co.uk','IT','Admin','Senior','',true,true,true],
    ['dr.staff@claremontschool.co.uk','IT','Staff','Senior','',true,false,false]]);
  put('Config',[['Setting','Value'],['Finance Email','it@claremontschool.co.uk'],['Sender Alias',''],
    ['Weekly Finance Settings',JSON.stringify({cc:[],enabled:true,owner:'andy.clifton@claremontschool.co.uk'})]]);
  put('Configuration Audit',[['Timestamp','User','Action','Target','Details']]);
  put('Order Approval Audit',[['Timestamp','Order ID','Revision','Action','Actor Email','Requester Email','Processor Email','Private Note','Order Snapshot']]);
  put('Order Change Audit',[['Timestamp','Order ID','Actor Email','Field','Old Value','New Value']]);
  const p=PropertiesService.getScriptProperties();
  p.setProperties({PORTAL_RECOVERY_SPREADSHEET_ID:ss.getId(),PORTAL_ATTACHMENT_FOLDER_ID:folder.id,
    PORTAL_EXECUTION_ACCOUNT:'andy.clifton@claremontschool.co.uk',PORTAL_PUBLIC_URL:'https://orders.gbclm.co.uk',
    PORTAL_ERROR_ALERT_EMAIL:'it@claremontschool.co.uk',PORTAL_RECOVERY_STATE:'READY',
    WEEKLY_FINANCE_OWNER:'andy.clifton@claremontschool.co.uk',WEEKLY_FINANCE_ENABLED:'true',WEEKLY_FINANCE_SPREADSHEET:ss.getId()});
  p.deleteProperty('ORDER_CHAT_WEBHOOK_URL');p.deleteProperty('ORDER_CHAT_WATCH_EMAIL');
  SpreadsheetApp.flush();
  console.log(JSON.stringify({seeded:true,synthetic:true,spreadsheetId:ss.getId(),attachmentFolderId:folder.id}));
}

function installDisposableRecoveryFinanceTrigger() {
  const c=portalRecoveryContext_(true);
  if(c.ss.getId()!=='1H_RkPKQEQpeTiCHWjzMEDelLbigB0S6OqJhkXC5KsdM')throw new Error('Disposable triggers are restricted to the rehearsal copy.');
  if(portalRecoveryOwnTriggers_().length)throw new Error('A rehearsal finance trigger already exists.');
  const trigger=ScriptApp.newTrigger('weeklyFinanceSchedule').timeBased().after(180000).create();
  console.log(JSON.stringify({disposableTriggerId:trigger.getUniqueId(),runsOnce:true}));
}

function verifyDisabledRehearsalOwner() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss || ss.getId()!=='1H_RkPKQEQpeTiCHWjzMEDelLbigB0S6OqJhkXC5KsdM' ||
      Session.getActiveUser().getEmail()!=='andy.clifton@claremontschool.co.uk' ||
      Session.getEffectiveUser().getEmail()!=='andy.clifton@claremontschool.co.uk') throw new Error('Run this rehearsal check directly as the previous operating account.');
  let blocked=false;
  try {getPortalSpreadsheet_();} catch(error) {if(!error.portalRecoveryBlocked) throw error;blocked=true;}
  if(!blocked)throw new Error('The previous account was not blocked.');
  const html=doGet({parameter:{}}).getContent();
  if(!html.includes('Portal address updated') || !html.includes(getPortalPublicUrl_())) throw new Error('The previous deployment did not provide the replacement link.');
  console.log(JSON.stringify({previousAccount:Session.getEffectiveUser().getEmail(),protectedDataAccessBlocked:true,replacementPageVerified:true,synthetic:true}));
}

function removeDisposableRecoveryFinanceTriggers() {
  const c=portalRecoveryContext_(true);
  if(c.ss.getId()!=='1H_RkPKQEQpeTiCHWjzMEDelLbigB0S6OqJhkXC5KsdM')throw new Error('Cleanup is restricted to the rehearsal copy.');
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='weeklyFinanceSchedule').forEach(t=>ScriptApp.deleteTrigger(t));
  console.log('Disposable rehearsal finance triggers removed.');
}
