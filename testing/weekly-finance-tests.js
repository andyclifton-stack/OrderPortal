const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root=path.resolve(__dirname,'..');
let dev=true, sent=[], store={}, fail=false, lockHeld=false;
const context={console,Date,Set,Number,String,Math,JSON,LIVE_PORTAL_URL_:'https://orders.gbclm.co.uk',
  Utilities:{getUuid:()=>require('crypto').randomUUID(),formatDate(d,tz,fmt){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
    if(fmt==='yyyy-MM-dd')return `${parts.year}-${parts.month}-${parts.day}`;
    if(fmt==='H')return parts.hour;
    if(fmt==='d MMMM yyyy')return new Intl.DateTimeFormat('en-GB',{timeZone:tz,day:'numeric',month:'long',year:'numeric'}).format(d);
    if(fmt==='EEEE d MMMM yyyy, HH:mm')return new Intl.DateTimeFormat('en-GB',{timeZone:tz,weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
    return d.toISOString();
  }},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]??null,setProperty:(k,v)=>store[k]=v})},
  portalStateKey_:k=>dev?'DEV_'+k:k,isDevelopmentRuntime_:()=>dev,
  portalAssertExecutionAccount_:()=>{},getPortalPublicUrl_:()=> 'https://orders.gbclm.co.uk',
  Session:{getEffectiveUser:()=>({getEmail:()=> 'andy.clifton@claremontschool.co.uk'})},
  isValidConfigurationEmail_:v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  getOrdersMetadataColumnsForRead_:()=>({recordTypeIndex:20,returnIndex:27}),
  getOrderRecordType_:(r)=>r[20]||'Order',getOrderApprovalStatus_:r=>r[23]||'',
  APPROVAL_AWAITING_:'AWAITING_SIGNOFF',APPROVAL_QUERY_:'QUERY_RAISED',
  isOrderCompleted_:r=>!!(r[13]||r[14]||r[15]),
  getBudgetSnapshot_:()=>({IT:{total:1000,spent:600,remaining:400},Bad:{total:100,spent:0,remaining:0,hasCalculationError:true}}),
  filterVisibleBudgets_:b=>b,escapeEmailHtml_:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  getConfig_:()=>({financeEmail:'finance@example.org'}),
  LockService:{getScriptLock:()=>({tryLock:()=>{if(lockHeld)return false;lockHeld=true;return true;},releaseLock(){lockHeld=false;}})},
  MailApp:{getRemainingDailyQuota:()=>100,sendEmail:e=>{if(fail)throw Error('Ambiguous transport');sent.push(e)}},
  sendPortalServiceEmail_:e=>{if(fail)throw Error('Ambiguous transport');sent.push(e)},
};
vm.createContext(context);
const code=fs.readFileSync(path.join(root,'Code.js'),'utf8');
vm.runInContext(code.slice(code.indexOf('function isOrderCancelled_('),code.indexOf('\nfunction ',code.indexOf('function isOrderCancelled_(')+10)),context);
vm.runInContext(code.slice(code.indexOf('function getOrderReturnInfo_('),code.indexOf('\nfunction ',code.indexOf('function getOrderReturnInfo_(')+10)),context);
vm.runInContext(fs.readFileSync(path.join(root,'WeeklyFinance.js'),'utf8'),context);
const run=s=>vm.runInContext(s,context);
context.reportStoredSettings_=()=>null;
assert.equal(run("reportPeriod_(new Date('2026-09-21T06:01:00Z')).start"),'2026-09-14');
assert.equal(run("reportPeriod_(new Date('2026-01-05T07:00:00Z')).start"),'2025-12-29');
assert.equal(run("reportPeriod_(new Date('2026-03-30T06:00:00Z')).end"),'2026-03-29');
assert.equal(run("reportPeriod_(new Date('2026-10-26T07:00:00Z')).start"),'2026-10-19');
assert.equal(run("weeklyFinanceDue_(new Date('2026-09-21T05:59:00Z'))"),false);
assert.equal(run("weeklyFinanceDue_(new Date('2026-09-21T06:00:00Z'))"),true);
assert.equal(run("weeklyFinanceDue_(new Date('2026-10-26T06:59:00Z'))"),false);
assert.equal(run("weeklyFinanceDue_(new Date('2026-10-26T07:00:00Z'))"),true);
assert.equal(run("weeklyFinanceDue_(new Date('2026-09-22T06:00:00Z'))"),false);
assert.equal(run("reportDay_('31/02/2026')"),'');
assert.equal(run("reportDay_('16/09/2026')"),'2026-09-16');
assert.equal(run("reportCc_(' A@example.org; a@example.org; B@example.org','a@example.org').join(',')"),'b@example.org');
assert.throws(()=>run("reportCc_('bad-address')"),/valid CC/);
function order(id,date,value,type='Order',extra={}){const r=Array(27).fill(''); Object.assign(r,{0:id,1:'IT',2:date,4:'Supplier <script>',6:'Test',10:value,20:type},extra);return r;}
const rows=[[],order('a','2026-09-14',10),order('b','2026-09-07',20),order('c','2026-08-31',30),order('d','2026-08-10',40),order('e','2026-09-21',50),order('f','bad',60),order('g','2026-09-15',500,'Transfer'),order('h','2026-09-15',700,'Invoice'),order('i','2026-09-15',100,'Order',{6:'CANCELLED - test',15:0}),order('j','2026-09-15',80,'Order',{13:'2026-09-17',23:'AWAITING_SIGNOFF'}),order('k','2026-09-15','#VALUE!')];
context.ss={getSheetByName:n=>n==='Orders'?{getDataRange:()=>({getValues:()=>rows})}: {}};
const data=run("buildWeeklyFinanceData_(ss,new Date('2026-09-21T06:05:00Z'))");
assert.equal(data.pending.length,7);assert.equal(data.pendingValue,210);
assert.equal(data.newOrders,3);assert.equal(data.ordered,1);assert.equal(data.invoices,1);
assert.equal(data.signoff.length,1);assert.equal(data.budgetErrors,1);assert.equal(data.invalidValues,1);
assert.deepEqual(Array.from(data.buckets,b=>b.count),[1,2,1,1,1,1]);
assert.equal(data.totals.spent,600);
context.sample=data;
const html=run('buildWeeklyFinanceHtml_(sample,true)');
assert.ok(html.includes('Supplier &lt;script&gt;'));assert.ok(html.includes('totals (incomplete)'));
// Mixed reviews and dated signed credits: logging date must not move a refund
// out of its effective reporting week or double-count its original purchase.
const originalRows=rows.slice();
rows.push(order('invoice-review','2026-09-15',40,'Invoice',{23:'AWAITING_SIGNOFF'}));
rows.push(order('invoice-query','2026-09-15',50,'Invoice',{23:'QUERY_RAISED',13:'2026-09-16'}));
rows.push(order('return-partial','2026-08-01',100,'Order',{13:'2026-08-02',15:100,27:JSON.stringify({pending:true,refunds:[{id:'old-credit',amount:20},{id:'reversed-credit',amount:30,reversalId:'reversal'}]})}));
rows.push(order('return-full','2026-08-01',100,'Order',{13:'2026-08-02',27:JSON.stringify({pending:false,refunds:[{id:'full',amount:100}]})}));
rows.push(order('credit','2026-09-21',-20,'Invoice',{13:'2026-09-16',15:-20,27:JSON.stringify({parentId:'return-partial'})}));
rows.push(order('reversal','2026-09-21',20,'Invoice',{13:'2026-09-17',15:20,27:JSON.stringify({parentId:'return-partial',creditId:'credit',adjustmentKind:'reversal'})}));
rows.push(order('unlinked-credit','2026-09-15',-5,'Invoice'));
rows.push(order('older-credit-logged-now','2026-09-15',-10,'Invoice',{13:'2026-09-01',15:-10,27:JSON.stringify({parentId:'return-partial'})}));
rows.push(order('future-credit','2026-09-15',-10,'Invoice',{13:'2026-09-30',15:-10,27:JSON.stringify({parentId:'return-partial'})}));
const mixed=run("buildWeeklyFinanceData_(ss,new Date('2026-09-21T06:05:00Z'))");
assert.equal(mixed.signoff.length,3);assert.equal(mixed.signoff.filter(r=>r.type==='Invoice').length,2);
assert.equal(mixed.returns.length,1);assert.equal(mixed.returnRemaining,80);assert.equal(mixed.returns[0].refunded,20);
assert.equal(mixed.invoices,3);assert.equal(mixed.invoiceValue,790);
assert.equal(mixed.credits,2);assert.equal(mixed.creditValue,-25);assert.equal(mixed.reversals,1);assert.equal(mixed.reversalValue,20);
assert.equal(mixed.adjustments.length,3);assert.equal(mixed.totals.spent,data.totals.spent,'Queue summaries never alter authoritative budget totals');
context.mixed=mixed;const mixedHtml=run('buildWeeklyFinanceHtml_(mixed,true)');
assert.equal((mixedHtml.match(/<section>/g)||[]).length,4);assert(mixedHtml.includes('invoice-query'));assert(mixedHtml.includes('Remaining purchase cost'));assert(!mixedHtml.includes('Budget committed'));
const output=path.join(root,'output/weekly-report-20261105');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'synthetic-report.html'),mixedHtml);
fs.writeFileSync(path.join(output,'synthetic-report-data.json'),JSON.stringify(mixed,null,2));
context.stress=JSON.parse(JSON.stringify(mixed));
for(const key of ['pending','signoff','returns','adjustments','budgets'])context.stress[key]=Array.from({length:12},(_,i)=>({...context.stress[key][0],id:'DEV-261105123456-'+i,dept:'Whole School Learning Support - Recharge',supplier:'Synthetic supplier with a long name',value:12345.67,remaining:12345.67}));
fs.writeFileSync(path.join(output,'stress-report.html'),run('buildWeeklyFinanceHtml_(stress,true)'));
rows.splice(1);const empty=run("buildWeeklyFinanceData_(ss,new Date('2026-09-21T06:05:00Z'))");
assert.equal(empty.returns.length,0);assert.equal(empty.creditValue,0);assert.equal(empty.signoff.length,0);
context.empty=empty;fs.writeFileSync(path.join(output,'empty-report.html'),run('buildWeeklyFinanceHtml_(empty,true)'));
rows.splice(0,rows.length,...originalRows);
context.weeklyFinancePdf_=()=>{assert.equal(lockHeld,false,'PDF generation must not block order saves');return {data,pdf:{},name:'report.pdf'};};
assert.equal(run("sendWeeklyFinance_(ss,'test')").success,true);
assert.equal(sent[0].to,'it@claremontschool.co.uk');assert(!sent[0].cc);
assert.equal(run("sendWeeklyFinance_(ss,'manual')").skipped,true);
assert.equal(run("sendWeeklyFinance_(ss,'scheduled')").skipped,true);
assert.equal(sent.length,1,'Only the explicit DEV test delivers to IT');
dev=false;store={WEEKLY_FINANCE_ENABLED:'true',WEEKLY_FINANCE_OWNER:'andy.clifton@claremontschool.co.uk'};sent=[];
run("sendWeeklyFinance_(ss,'scheduled')");run("sendWeeklyFinance_(ss,'scheduled')");assert.equal(sent.length,1);
assert.ok(sent[0].cc.includes('catherine.hayes@claremontschool.co.uk'));
run("sendWeeklyFinance_(ss,'manual')");assert.equal(sent.length,2);
assert.throws(()=>run("sendWeeklyFinance_(ss,'manual')"),/recently sent/);
store={WEEKLY_FINANCE_ENABLED:'true',WEEKLY_FINANCE_OWNER:'andy.clifton@claremontschool.co.uk'};sent=[];fail=true;
assert.throws(()=>run("sendWeeklyFinance_(ss,'scheduled')"),/could not be confirmed/);
fail=false;assert.throws(()=>run("sendWeeklyFinance_(ss,'scheduled')"),/unconfirmed/);assert.equal(sent.length,0);
assert.ok(Object.values(store).some(v=>v.startsWith('UNCERTAIN')));
// Abandoned preparation can recover, but an older worker cannot send after replacement.
store={WEEKLY_FINANCE_RECENT_MANUAL:'PREPARING 2026-01-01T00:00:00Z'};sent=[];
run("sendWeeklyFinance_(ss,'manual')");assert.equal(sent.length,1);
store={WEEKLY_FINANCE_RECENT_MANUAL:'PREPARING '+new Date().toISOString()};sent=[];
assert.throws(()=>run("sendWeeklyFinance_(ss,'manual')"),/being prepared/);assert.equal(sent.length,0);
store={};
context.weeklyFinancePdf_=()=>{store.WEEKLY_FINANCE_RECENT_MANUAL='PREPARING '+new Date().toISOString()+' replacement';return {data,pdf:{}};};
assert.throws(()=>run("sendWeeklyFinance_(ss,'manual')"),/newer report/);assert.equal(sent.length,0);
assert.ok(store.WEEKLY_FINANCE_RECENT_MANUAL.endsWith('replacement'),'Old worker cannot clear new reservation');
assert.equal(lockHeld,false);
context.getAuthorizedUserContext_=()=>({});
context.requireLiveConfigurationAdmin_=()=>{throw Error('Access denied');};
assert.throws(()=>run('getWeeklyFinancePreview()'),/Access denied/);
assert.throws(()=>run('sendWeeklyFinanceTest()'),/Access denied/);
assert.throws(()=>run('sendWeeklyFinanceNow()'),/Access denied/);
console.log('Weekly finance tests passed: calendar/DST, ageing, exclusions, amounts, escaping, IT-only delivery, duplicate suppression and uncertain-send protection.');
