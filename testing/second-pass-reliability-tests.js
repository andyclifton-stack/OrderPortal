const assert=require('assert'),path=require('path'),fs=require('fs'),vm=require('vm');
const {createRuntime}=require('./performance-fixtures.cjs');
const root=path.resolve(__dirname,'..');
const make=(options={})=>{const r=createRuntime(path.join(root,'Code.js'),3,{strictInputs:true,...options});r.api.logError_=()=>{};return r;};
const revision=r=>JSON.parse(r.api.getAdminConfigurationPreview()).configurationRevision;
const editUser=(r,extra={})=>({expectedConfigurationRevision:revision(r),email:'staff@claremontschool.co.uk',originalEmail:'staff@claremontschool.co.uk',role:'Staff',defaultSite:'Senior',departments:['Science'],canProcessOrders:false,canLogInvoices:false,...extra});
const version=(r,id)=>r.api.getDashboardData().orders.find(o=>String(o.id)===String(id)).version;
{
 const r=make({loseCommitResponse:true});const form={clientRequestId:'uncertain-transfer',fromDept:'Science',toDept:'English',amount:25};
 // Commit succeeds but both the response and the recovery read fail.
 const batch=r.api.Sheets.Spreadsheets.batchUpdate;
 r.api.Sheets.Spreadsheets.batchUpdate=(...args)=>{try{return batch(...args);}finally{const sheet=r.sheets['Portal Save Receipts'],original=sheet.getRange.bind(sheet);sheet.getRange=(row,col,...rest)=>{if(col===2)throw Error('Receipt temporarily unreadable');return original(row,col,...rest);};}};
 assert.throws(()=>r.api.createBudgetTransfer(form),/SAVE_STATUS_UNKNOWN/);
 assert.equal(r.api.getBudgetTransferStatus(form.clientRequestId).state,'DONE');
 r.sheets.Budgets.rows[1][3]=0;
 assert(r.api.createBudgetTransfer(form).replayed,'Completed transfer replays even if balance subsequently changes');
 assert.equal(r.sheets.Orders.rows.length,6);
 r.sheets.Users.rows[4][2]='Admin';r.setActor('finance@claremontschool.co.uk');assert.equal(r.api.getBudgetTransferStatus(form.clientRequestId).state,'NOT_FOUND','Receipts are scoped to the real actor');
 r.setActor('staff@claremontschool.co.uk');assert.throws(()=>r.api.getBudgetTransferStatus(form.clientRequestId),/Access denied/);
}
{
 const r=make();const form={dept:'Science',supplier:' Acme ',desc:'Invoice',cost:5,paymentMethod:'Invoice / on account',reportingSite:'Unassigned',files:[],invoiceNumber:' CHECK-01 ',clientRequestId:'invoice-one'};
 assert(r.api.logInvoice(form).saved);
 const second={...form,invoiceNumber:'',clientRequestId:'invoice-two'};
 const warning=r.api.logInvoice(second);assert.equal(warning.code,'POSSIBLE_DUPLICATE_INVOICE');
 assert(r.api.logInvoice({...second,duplicateConfirmation:warning.duplicateConfirmation}).saved);
 const id=r.sheets.Orders.rows.at(-1)[0];const before=JSON.stringify(r.sheets.Orders.rows);
 const correct=invoiceNumber=>r.api.updateInvoice({...form,id,invoiceNumber,expectedVersion:version(r,id),reason:'Verified supplier reference'});
 const duplicate=correct('check-01');
 assert.equal(duplicate.saved,false);assert.match(duplicate.message,/already recorded/);assert.equal(JSON.stringify(r.sheets.Orders.rows),before);
 assert(correct('UNIQUE').saved);
 assert(correct('UNIQUE').saved,'Current invoice is excluded from duplicate check');
}
{
 const r=make();r.sheets.Users.rows[2][7]=true;
 const before=JSON.stringify(r.sheets.Users.rows),input=editUser(r,{canProcessOrders:true});
 r.api.appendConfigurationAudit_=()=>{throw Error('Audit unavailable');};
 const result=JSON.parse(r.api.saveAdminUserConfiguration(input));
 assert.equal(result.success,false);assert.equal(JSON.stringify(r.sheets.Users.rows),before,'No partial field writes when audit fails');
}
for(const lost of [false,true]){
 const r=make(lost?{loseCommitResponse:true}:{failBeforeCommit:true});const before=JSON.stringify(r.sheets.Users.rows);
 const result=JSON.parse(r.api.saveAdminUserConfiguration(editUser(r,{canProcessOrders:true})));
 assert.equal(result.success,lost);
 if(lost){assert(r.sheets.Users.rows[2][6]);assert(r.sheets['Configuration Audit'].rows.length>1);}
 else {assert.match(result.error,/could not be confirmed/);assert.equal(JSON.stringify(r.sheets.Users.rows),before);assert.equal(r.sheets['Configuration Audit'].rows.length,0);}
}
{
 const r=make();r.sheets.Users.rows[2][6]=true;const stale=editUser(r,{canProcessOrders:true,defaultSite:'Prep'});
 assert(JSON.parse(r.api.saveAdminUserConfiguration(editUser(r))).success);
 const result=JSON.parse(r.api.saveAdminUserConfiguration(stale));assert.equal(result.success,false);assert.match(result.error,/changed/);assert.equal(r.sheets.Users.rows[2][6],false);
 const direct=editUser(r);r.sheets.Users.rows[2][3]='Prep';assert.equal(JSON.parse(r.api.saveAdminUserConfiguration(direct)).success,false,'Direct sheet configuration edits invalidate forms');
}
{
 const r=make();const rev=revision(r);const before=r.sheets.Budgets.rows.length;
 assert(JSON.parse(r.api.saveAdminBudgetConfiguration({expectedConfigurationRevision:rev,department:'New test department',totalAllocation:1000,glCode:'TEST'})).success);
 assert.equal(r.sheets.Budgets.rows.length,before+1);assert.match(r.sheets.Budgets.rows.at(-1)[2],/^=/);assert.match(r.sheets.Budgets.rows.at(-1)[3],/^=/);
 assert.equal(r.calls.batches,1,'Budget values, formulas and audit share a batch');
 assert.equal(JSON.parse(r.api.setAdminBudgetActive('Science',false,rev)).success,false);
}
{
 const r=make();vm.runInContext(fs.readFileSync(path.join(root,'WeeklyFinance.js'),'utf8'),r.api);
 const propsBefore=JSON.stringify(r.properties);const input={cc:['test@example.org'],enabled:false,expectedConfigurationRevision:revision(r)};
 assert(JSON.parse(r.api.saveWeeklyFinanceSettings(input)).success);
 assert.deepEqual(Array.from(r.api.reportSettings_().cc),['test@example.org']);
 assert.equal(r.properties.DEV_WEEKLY_FINANCE_CC,undefined,'Weekly settings saved in same workbook batch as audit');
 assert.equal(JSON.parse(r.api.saveWeeklyFinanceSettings(input)).success,false,'Stale weekly form blocked');
}
{
 const r=make();const store=new Map();r.api.CacheService.getScriptCache=()=>({get:k=>store.get(k)||null,put:(k,v)=>store.set(k,v),remove:k=>store.delete(k)});
 let orderCells=0;const native=r.sheets.Orders.getRange.bind(r.sheets.Orders);
 r.sheets.Orders.getRange=(row,col,n=1,m=1)=>{const range=native(row,col,n,m),read=range.getValues.bind(range);range.getValues=()=>{orderCells+=n*m;return read();};return range;};
 const first=r.api.getDashboardData({backgroundCache:true,lazyDetails:true});orderCells=0;
 const next=r.api.getDashboardData({backgroundCache:true,lazyDetails:true,knownRevision:first.meta.revision});
 assert(next.notModified);assert.equal(orderCells,28,'Only order headers read for unchanged recent refresh');
 const order=first.orders[0];assert.equal(order.notes,undefined);assert(order.detailsDeferred);assert(order.hasNotes);
 assert.equal(r.api.getOrderDetails(String(order.id),order.version).notes,'Test note 2');
 r.sheets.Orders.rows[3][17]='Direct change';
 assert.throws(()=>r.api.getOrderDetails(String(order.id),order.version),/changed/);
 const fresh=r.api.getDashboardData({backgroundCache:true,lazyDetails:true,forceRead:true,knownRevision:first.meta.revision});assert(!fresh.notModified);
 // Even a cache that fails to evict cannot extend the freshness bound.
 for(const [key,value] of store){const hint=JSON.parse(value);hint.at-=61000;store.set(key,JSON.stringify(hint));}
 assert(!r.api.getDashboardData({backgroundCache:true,lazyDetails:true,knownRevision:first.meta.revision}).notModified);
 r.setActor('staff@claremontschool.co.uk');assert.throws(()=>r.api.getOrderDetails('PERF-1',version(r,'PERF-0')),/Access denied/);
 r.sheets.Users.rows[2][5]=false;assert.equal(r.api.getDashboardData({backgroundCache:true,knownRevision:first.meta.revision}).success,false);
}
console.log('Second-pass reliability: uncertain transfer recovery, replay after balance change, actor isolation, invoice update duplicates, atomic configuration, stale forms, formulas, weekly settings and bounded refresh/detail access passed.');
