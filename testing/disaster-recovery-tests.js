const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const it = 'it@claremontschool.co.uk', andy = 'andy.clifton@claremontschool.co.uk';
let store, active, effective, dev, held, triggers, folder, mails, created, trashed, audit;
let financeRows, userRows, failMail, failPdf, boundId, failSettingsOnce, spreadsheetDriveId;
function range(rows,row=1,col=1,n=rows.length,m=rows[0]?.length || 1) {
  return { getValues:()=> Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[row-1+i]?.[col-1+j]??'')),
    setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>{rows[row-1+i] ||= [];rows[row-1+i][col-1+j]=v;}));return this;} };
}
const sheets = {
  Users:{getDataRange:()=>range(userRows)},
  Config:{getDataRange:()=>range(financeRows),getLastRow:()=>financeRows.length,getRange:(...a)=>range(financeRows,...a)},
  Orders:{getLastRow:()=>1},
  'Configuration Audit':{appendRow:r=>audit.push(r)}
};
const ss = { getId:()=>boundId,getSheetByName:n=>sheets[n]||null };
const props = {getProperty:k=>store[k]??null,setProperty:(k,v)=>store[k]=String(v),
  setProperties:values=>{if(failSettingsOnce){failSettingsOnce=false;throw Error('Settings interrupted');}return Object.assign(store,values);},deleteProperty:k=>delete store[k]};
const context = {console:{log(){},warn(){},error(){}},Date,Set,Map,Object,String,Number,Math,JSON,Array,RegExp,
  PropertiesService:{getScriptProperties:()=>props},
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  ScriptApp:{getService:()=>({getUrl:()=>dev?'https://script.google.com/macros/s/test/dev':'https://script.google.com/macros/s/test/exec'}),
    getProjectTriggers:()=>triggers.map(id=>({getHandlerFunction:()=> 'weeklyFinanceSchedule',getUniqueId:()=>id,getEventType:()=> 'CLOCK'}))},
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}},
  LockService:{getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;},tryLock(){if(held)return false;held=true;return true;},releaseLock(){held=false;}})},
  Drive:{Files:{get(id,options){assert.equal(options.supportsAllDrives,true);return id===boundId?{id,driveId:spreadsheetDriveId}:folder;},
    create(metadata,blob,options){assert.equal(options.supportsAllDrives,true);created.push(metadata);return {id:'test-file',webViewLink:'https://drive.google.com/file/d/test-file/view'};},
    update(metadata,id,blob,options){assert.equal(options.supportsAllDrives,true);assert.equal(metadata.trashed,true);trashed.push(id);}}},
  Utilities:{getUuid:()=> 'unique',base64Encode:value=>Buffer.from(value).toString('base64'),base64Decode:()=> [1,2,3],newBlob:()=>({getAs(){if(failPdf)throw Error('PDF failed');return this;},setName(){return this;}}),
    formatDate(d,tz,fmt){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));return fmt==='yyyy-MM-dd'?`${parts.year}-${parts.month}-${parts.day}`:fmt==='H'?parts.hour:d.toISOString();}},
  MimeType:{PDF:'application/pdf'},
  MailApp:{getRemainingDailyQuota:()=>100,sendEmail:email=>{if(failMail)throw Error('Mail failed');mails.push(email);}}
};
vm.createContext(context);
for(const name of ['Code.js','WeeklyFinance.js','Recovery.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name});
const run=s=>vm.runInContext(s,context);
// Schema lookup is separately covered by configuration-live-tests.
context.getUserConfigurationSchema_=()=>({emailIndex:0,roleIndex:2,simulationEmailIndex:4,activeIndex:5});
context.getConfig_=()=>({financeEmail:'purchases@claremontschool.co.uk'});
function reset(){
  store={PORTAL_RECOVERY_SPREADSHEET_ID:'synthetic-sheet',PORTAL_ATTACHMENT_FOLDER_ID:'folder',PORTAL_EXECUTION_ACCOUNT:andy,
    PORTAL_PUBLIC_URL:'https://orders.gbclm.co.uk',PORTAL_ERROR_ALERT_EMAIL:'andy.clifton+error@claremontschool.co.uk',PORTAL_RECOVERY_STATE:'READY',
    WEEKLY_FINANCE_OWNER:andy,WEEKLY_FINANCE_ENABLED:'true',WEEKLY_FINANCE_SPREADSHEET:'synthetic-sheet',
    WEEKLY_FINANCE_DELIVERY_2026_OLD:'SENT retained',order_id_counter:'496',ORDER_CHAT_WEBHOOK_URL:'secret-must-not-be-exported'};
  active=effective=it;dev=false;held=false;triggers=[];boundId='synthetic-sheet';spreadsheetDriveId='school-drive';mails=[];created=[];trashed=[];audit=[];failMail=failPdf=failSettingsOnce=false;
  folder={id:'folder',mimeType:'application/vnd.google-apps.folder',driveId:'school-drive',capabilities:{canAddChildren:true}};
  financeRows=[['Setting','Value'],['Weekly Finance Settings',JSON.stringify({enabled:true,owner:andy,cc:['catherine.hayes@claremontschool.co.uk']})]];
  userRows=[['Email','Department','Role','Default Site','Simulation Email','Active'],[it,'IT','Admin','Senior','',true],[andy,'IT','Admin','Senior','',true]];
}
reset();
const before=JSON.stringify(store);
assert.equal(run('checkItRecoveryReadiness()').ready,true);assert.equal(JSON.stringify(store),before,'readiness must not mutate');
assert.ok(!JSON.stringify(run('checkItRecoveryReadiness()')).includes('secret-must-not-be-exported'));
boundId='wrong';assert.throws(()=>run('stageItRecovery()'),/spreadsheet/);boundId='synthetic-sheet';
active=andy;assert.throws(()=>run('stageItRecovery()'),/signed into/);active=it;
effective=andy;assert.throws(()=>run('stageItRecovery()'),/signed into/);effective=it;
userRows[1][2]='Staff';assert.throws(()=>run('stageItRecovery()'),/Admin/);userRows[1][2]='Admin';
userRows[1][5]=false;assert.throws(()=>run('stageItRecovery()'),/Admin/);userRows[1][5]=true;
userRows[1][4]='other@example.org';assert.throws(()=>run('stageItRecovery()'),/unsimulated/);userRows[1][4]='';
assert.throws(()=>run('stageItRecovery()'),/confirmation/i);
store.PORTAL_RECOVERY_CONFIRMATION='ACTIVATE IT RECOVERY';store.PORTAL_RECOVERY_NEW_URL='https://evil.example/exec';
assert.throws(()=>run('stageItRecovery()'),/new IT deployment/);
store.PORTAL_RECOVERY_NEW_URL='https://script.google.com/a/macros/claremontschool.co.uk/s/new-it-deployment/exec';
folder.driveId='';assert.throws(()=>run('stageItRecovery()'),/school-owned/);folder.driveId='school-drive';
spreadsheetDriveId='';assert.throws(()=>run('stageItRecovery()'),/spreadsheet must be school-owned/);spreadsheetDriveId='school-drive';
assert.equal(run('stageItRecovery()').reportingEnabled,false);
assert.equal(store.PORTAL_EXECUTION_ACCOUNT,it);assert.equal(store.WEEKLY_FINANCE_ENABLED,'false');assert.equal(store.order_id_counter,'496');
assert.equal(store.WEEKLY_FINANCE_DELIVERY_2026_OLD,'SENT retained');
assert.ok(!store.PORTAL_RECOVERY_SNAPSHOT.includes('secret-must-not-be-exported'));
const snapshot=store.PORTAL_RECOVERY_SNAPSHOT;assert.equal(run('stageItRecovery()').alreadyStaged,true);assert.equal(store.PORTAL_RECOVERY_SNAPSHOT,snapshot);
effective=andy;assert.throws(()=>run('portalAssertExecutionAccount_()'),/no longer/);assert.throws(()=>run('getPortalSpreadsheet_()'),/no longer/);
effective=it;assert.doesNotThrow(()=>run('portalAssertExecutionAccount_()'));
assert.throws(()=>run('enableItRecoveryReporting()'),/exactly one/);triggers=['one','two'];assert.throws(()=>run('enableItRecoveryReporting()'),/exactly one/);
triggers=['one'];const currentKey='WEEKLY_FINANCE_DELIVERY_'+run('reportPeriod_(new Date()).weekKey');store[currentKey]='UNCERTAIN keep';
assert.throws(()=>run('enableItRecoveryReporting()'),/investigate/);assert.equal(store[currentKey],'UNCERTAIN keep');delete store[currentKey];
assert.equal(run('enableItRecoveryReporting()').reportingEnabled,true);assert.deepEqual(JSON.parse(financeRows[1][1]).cc,['catherine.hayes@claremontschool.co.uk']);
assert.equal(store.PORTAL_RECOVERY_SNAPSHOT,snapshot);assert.equal(triggers.length,1);assert.equal(run('enableItRecoveryReporting()').reportingEnabled,true);
const enabledAuditCount=audit.length;assert.equal(run('enableItRecoveryReporting()').alreadyEnabled,true);assert.equal(audit.length,enabledAuditCount);
reset();run('testPortalRecoveryServices()');assert.equal(mails.length,1);assert.equal(mails[0].to,it);assert.ok(!mails[0].cc&&!mails[0].bcc);assert.deepEqual(trashed,['test-file']);
assert.equal(store.order_id_counter,'496');assert.equal(store.PORTAL_EXECUTION_ACCOUNT,andy);
reset();failPdf=true;assert.throws(()=>run('testPortalRecoveryServices()'),/PDF failed/);assert.deepEqual(trashed,['test-file']);assert.equal(mails.length,0);
reset();failMail=true;assert.throws(()=>run('testPortalRecoveryServices()'),/Mail failed/);assert.deepEqual(trashed,['test-file']);
reset();active=effective=andy;const upload=run("uploadFileToDrive_('AQID','sample.txt','text/plain')");assert.equal(upload.fileId,'test-file');assert.equal(created[0].parents[0],'folder');
delete store.PORTAL_ATTACHMENT_FOLDER_ID;assert.throws(()=>run('getPortalAttachmentFolder_()'),/not configured/);assert.equal(created.length,1,'must not create a replacement folder');
reset();active=effective=andy;store.PORTAL_RECOVERY_STATE='STAGED';delete store.PORTAL_EXECUTION_ACCOUNT;assert.throws(()=>run('portalAssertExecutionAccount_()'),/no longer/);
reset();active=effective=it;store.PORTAL_RECOVERY_CONFIRMATION='ACTIVATE IT RECOVERY';store.PORTAL_RECOVERY_NEW_URL='https://script.google.com/macros/s/it/exec';
financeRows[1][1]=JSON.stringify({enabled:false,owner:andy,cc:[]});run('stageItRecovery()');triggers=['one'];assert.equal(run('enableItRecoveryReporting()').reportingEnabled,false);
reset();store.PORTAL_RECOVERY_CONFIRMATION='ACTIVATE IT RECOVERY';store.PORTAL_RECOVERY_NEW_URL='https://script.google.com/macros/s/it/exec';failSettingsOnce=true;
assert.throws(()=>run('stageItRecovery()'),/Settings interrupted/);const interruptedSnapshot=store.PORTAL_RECOVERY_SNAPSHOT;
assert.equal(JSON.parse(financeRows[1][1]).enabled,false);run('stageItRecovery()');assert.equal(store.PORTAL_RECOVERY_SNAPSHOT,interruptedSnapshot);
assert.equal(JSON.parse(interruptedSnapshot).finance.enabled,true,'a retry must retain the original enabled state');
const reportFixture={pdf:{},data:{period:{label:'Synthetic week',generated:'Synthetic time'},pending:[],pendingValue:0}};
reset();active=effective=andy;
context.weeklyFinancePdf_=()=>{assert.equal(held,false);store.PORTAL_EXECUTION_ACCOUNT=it;return reportFixture;};
assert.throws(()=>run("sendWeeklyFinance_(SpreadsheetApp.getActiveSpreadsheet(),'scheduled')"),/no longer the active portal/);
assert.equal(mails.length,0,'takeover during PDF preparation must prevent sending');assert.equal(store.WEEKLY_FINANCE_DELIVERY_2026_OLD,'SENT retained');
reset();active=effective=andy;
context.weeklyFinancePdf_=()=>{financeRows[1][1]=JSON.stringify({enabled:false,owner:it,cc:[]});return reportFixture;};
assert.throws(()=>run("sendWeeklyFinance_(SpreadsheetApp.getActiveSpreadsheet(),'scheduled')"),/Reporting was disabled/);assert.equal(mails.length,0);
reset();active=effective=andy;context.weeklyFinancePdf_=()=>{assert.equal(held,false);return reportFixture;};
context.MailApp.sendEmail=email=>{assert.equal(held,true,'report delivery must hold the takeover lock');mails.push(email);};
context.sendPortalServiceEmail_=context.MailApp.sendEmail;
run("sendWeeklyFinance_(SpreadsheetApp.getActiveSpreadsheet(),'scheduled')");run("sendWeeklyFinance_(SpreadsheetApp.getActiveSpreadsheet(),'scheduled')");
assert.equal(mails.length,1,'scheduled retries must not send the same reporting week twice');
assert.equal(held,false);
console.log('Disaster recovery tests passed: identities, roles, container, read-only checks, shared-drive uploads/cleanup, staged/idempotent takeover, previous-account blocking, trigger count, report history, recipients and failure cleanup.');
