const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
const ORDER_HEADERS=['ID','Department','Date of request','Requester','Supplier','Website link','Description','Product code','Quantity','Unit Price','Total Price (Est)','Delivery location','Date required by','Date ordered','Expected delivery date','Updated total price','Budget left to spend','Comments','Invoice Number','Attachment URL','Record Type','GL Code','Processed By','Approval Status','Approval Revision','Approved By','Approved At','Submitted By'];
function createRuntime(sourceFile,count=100,options={}) {
 const calls={reads:0,writes:[],timezones:0};
 class Range {
  constructor(sheet,r,c,n=1,m=1){Object.assign(this,{sheet,r,c,n,m});}
  getValues(){calls.reads++;return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>this.sheet.rows[this.r-1+i]?.[this.c-1+j]??''));}
  getValue(){return this.getValues()[0][0];}
  getRow(){return this.r;} getColumn(){return this.c;}
  createTextFinder(text){const range=this;return {matchEntireCell(){return this;},matchCase(){return this;},useRegularExpression(){return this;},findAll(){calls.finders=(calls.finders||0)+1;const matches=[];for(let i=0;i<range.n;i++)if(String(range.sheet.rows[range.r-1+i]?.[range.c-1]??'')===text)matches.push(new Range(range.sheet,range.r+i,range.c));return matches;},findNext(){return this.findAll()[0]||null;}};}
  setValues(values){calls.writes.push([this.sheet.name,this.r,this.c,this.n,this.m]);for(let i=0;i<this.n;i++)for(let j=0;j<this.m;j++){this.sheet.rows[this.r-1+i]??=[];this.sheet.rows[this.r-1+i][this.c-1+j]=values[i][j];}return this;}
  setValue(v){return this.setValues([[v]]);}
  canEdit(){return true;}
  getFormulas(){return this.getValues().map(row=>row.map(v=>typeof v==='string'&&v.startsWith('=')?v:''));}
  setNumberFormat(){return this;} setFontWeight(){return this;} setBackground(){return this;}
 }
 class Sheet {
  constructor(name,rows){this.name=name;this.rows=rows;}
  getName(){return this.name;} getSheetId(){return this.name;} getMaxRows(){return Math.max(1000,this.rows.length);} getMaxColumns(){return Math.max(30,this.getLastColumn());} hideSheet(){}
  getLastRow(){return this.rows.length;} getLastColumn(){return Math.max(...this.rows.map(r=>r.length),1);}
  getDataRange(){return new Range(this,1,1,this.getLastRow(),this.getLastColumn());}
  getRange(r,c,n,m){if(typeof r==='string'){const match=r.match(/^([A-Z]+)(\d+)$/);c=match[1].split('').reduce((v,k)=>v*26+k.charCodeAt(0)-64,0);r=+match[2];}return new Range(this,r,c,n,m);}
  appendRow(row){this.rows.push([...row]);return this;} hideColumns(){} setFrozenRows(){}
 }
 const rows=Array.from({length:count},(_,i)=>[
  'PERF-'+i,i%2?'English':'Science',new Date(Date.UTC(2026,0,1+i%200,12)), 'staff@claremontschool.co.uk', 'Supplier '+i%30,'https://example.com','Synthetic order '+i,'SKU-'+i,2,12.5,25,i%2?'Prep':'Senior','',i%3?'':new Date('2026-07-01T12:00:00Z'),'',i%3?'':24,'=FORMULA_PRESERVE','Test note '+i,'','https://example.com/attachment','Order','TEST-GL','','NOT_REQUIRED',0,'',''
 ]);
 const sheets={
  Orders:new Sheet('Orders',[ORDER_HEADERS,...rows]),
  Users:new Sheet('Users',[['Email','Department','Role','Default Site','Simulation Email','Active','Can Process Orders','Can Log Invoices'],['admin@claremontschool.co.uk','Science, English','Admin','Senior','',true,false,false],['staff@claremontschool.co.uk','Science','Staff','Senior','',true,false,false],['head@claremontschool.co.uk','Science','Head','Senior','',true,false,false],['finance@claremontschool.co.uk','Science, English','Wipro','Senior','',true,false,false]]),
  Budgets:new Sheet('Budgets',[['Department','TotalAllocation','Spent','Remaining','GL Code','Active'],['Science',100000,1000,99000,'SCI',true],['English',100000,500,99500,'ENG',true]]),
  Config:new Sheet('Config',[['Setting','Value'],['Finance Email','test@example.com'],['Alias','test@example.com']])
 };
 const workbook={getSheetByName:n=>sheets[n]||null,getId:()=> 'synthetic-dev',getSpreadsheetTimeZone:()=> 'Europe/London',insertSheet:n=>sheets[n]=new Sheet(n,[])};
 const properties={DEV_SPREADSHEET_ID:'synthetic-dev',DEV_ATTACHMENT_FOLDER_ID:'synthetic-folder',DEV_NOTIFICATION_EMAIL:'admin@claremontschool.co.uk'};
 let actor='admin@claremontschool.co.uk', development=true;
 const context={Date,JSON,Math,Number,String,Object,Array,RegExp,Error,Set,Map,console:{log(){},warn(){},error(){}},
  ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/test/'+(development?'dev':'exec')})},
  Session:{getActiveUser:()=>({getEmail:()=>actor}),getEffectiveUser:()=>({getEmail:()=>actor}),getScriptTimeZone:()=>{calls.timezones++;return 'Europe/London';}},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]??null,setProperty:(k,v)=>properties[k]=v})},
  SpreadsheetApp:{openById:id=>{if(id!=='synthetic-dev')throw Error('Unexpected workbook');return workbook;},getActiveSpreadsheet:()=>development?{getId:()=>'synthetic-live'}:workbook,flush(){}},
  CacheService:{getScriptCache:()=>({remove(){},get(){return null;},put(){}})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>Array.from(crypto.createHash('sha256').update(value).digest()),base64EncodeWebSafe:value=>Buffer.from(typeof value==='string'?value:Uint8Array.from(value)).toString('base64url'),parseCsv:v=>[String(v).split(',')],formatDate:(date,tz,pattern)=>{const d=new Date(date);if(pattern==='yyMMdd')return '260907';if(pattern==='dd/MM/yyyy')return new Intl.DateTimeFormat('en-GB',{timeZone:tz}).format(d);return '07/09 12:00';}}
 };
 vm.createContext(context);vm.runInContext(fs.readFileSync(sourceFile,'utf8'),context);
 context.Utilities.getUuid=()=>crypto.randomUUID();
 const originalFormatDate=context.Utilities.formatDate;
 context.Utilities.formatDate=(date,tz,pattern)=>pattern==="yyyy-MM-dd'T'HH:mm:ss" ? new Date(date).toISOString().slice(0,19) : originalFormatDate(date,tz,pattern);
 context.Sheets={Spreadsheets:{batchUpdate({requests},id){
  if(id!==workbook.getId())throw Error('Wrong spreadsheet');
  calls.batches=(calls.batches||0)+1;
  if(options.failBeforeCommit)throw Error('Synthetic atomic request rejection');
  const staged=Object.fromEntries(Object.entries(sheets).map(([name,sheet])=>[name,sheet.rows.map(r=>r.slice())]));
  for(const request of requests){
   const update=request.updateCells;if(!update)continue;
   const {sheetId,rowIndex,columnIndex}=update.start;
   if(!staged[sheetId])throw Error('Missing sheet');
   calls.writes.push([sheetId,rowIndex+1,columnIndex+1,update.rows.length,update.rows[0].values.length]);
   update.rows.forEach((row,i)=>row.values.forEach((cell,j)=>{
    staged[sheetId][rowIndex+i]??=[];
    const value=cell.userEnteredValue||{};
    staged[sheetId][rowIndex+i][columnIndex+j]=value.stringValue??value.numberValue??value.boolValue??value.formulaValue??'';
   }));
  }
  for(const request of requests){const format=request.repeatCell;if(!format)continue;const r=format.range;
   const value=staged[r.sheetId][r.startRowIndex][r.startColumnIndex];
   staged[r.sheetId][r.startRowIndex][r.startColumnIndex]=new Date(Math.round((value-25569)*86400000));
  }
  Object.entries(staged).forEach(([name,rows])=>{sheets[name].rows=rows;});
  if(options.loseCommitResponse)throw Error('Synthetic lost response after commit');
  return {};
 }}};
 // Existing regression callers get the current protocol fields. New fault and
 // concurrency tests use strictInputs to exercise missing/stale inputs directly.
 if(!options.strictInputs && context.orderVersion_){
  const version=id=>{const row=sheets.Orders.rows.find(r=>String(r[0])===String(id));return row?context.orderVersion_(row):'missing';};
  for(const name of ['submitOrder','logInvoice','createBudgetTransfer']){const fn=context[name];context[name]=input=>fn({...input,clientRequestId:input.clientRequestId||crypto.randomUUID(),expectedVersion:input.expectedVersion||(input.id?version(input.id):undefined)});}
  for(const [name,index] of [['updateOrder',6],['reviewOrderApproval',3],['resubmitOrderApproval',2],['userCancelOrder',2],['addNote',2]]){const fn=context[name];context[name]=(...args)=>{args[index]??=version(args[0]);return fn(...args);};}
  const bulk=context.bulkFinalizeOrders;context.bulkFinalizeOrders=items=>bulk(items.map(item=>({...item,expectedVersion:item.expectedVersion||version(item.id)})));
 }
 // No network or external notifications exist in this synthetic runtime.
 context.buildNotificationWarning_=()=>null;
 context.sendEmailAlert_=()=>({success:true});
 context.appendOrderFieldChanges_=()=>{};
 return {api:context,sheets,properties,calls,setActor:v=>actor=v,setDevelopment:v=>development=v,resetCalls(){calls.reads=0;calls.writes=[];calls.timezones=0;}};
}
module.exports={createRuntime};
