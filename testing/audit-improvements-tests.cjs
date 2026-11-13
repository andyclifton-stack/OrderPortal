const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {createRuntime}=require('./performance-fixtures.cjs');
const root=path.resolve(__dirname,'..'),server=fs.readFileSync(path.join(root,'Code.js'),'utf8'),portal=fs.readFileSync(path.join(root,'Index.html'),'utf8'),dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
const make=()=>createRuntime(path.join(root,'Code.js'),4,{strictInputs:true});
function fn(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);const tail=source.slice(start);const match=/\n\s*function \w+\(/.exec(tail);return match?tail.slice(0,match.index):tail;}
// Unknown environment cannot fall through to the production workbook.
for(const url of [null,'','https://unexpected.example/','throws']){
 const r=make();let accessed=false;
 r.api.ScriptApp.getService=()=>{if(url==='throws')throw Error('Unavailable');return {getUrl:()=>url};};
 r.api.SpreadsheetApp.getActiveSpreadsheet=()=>{accessed=true;throw Error('Production access');};
 assert.throws(()=>r.api.getPortalSpreadsheet_(),/environment/);assert(!accessed);
}
{const r=make();assert(r.api.isDevelopmentRuntime_());r.setDevelopment(false);assert(!r.api.isDevelopmentRuntime_());}
// A blank invoice number is permitted, but a likely duplicate needs a decision
// bound to both the current input and the current matching records.
{
 const r=make(),base={dept:'Science',supplier:' Audit Supplier ',desc:'Books',cost:17.25,paymentMethod:'Invoice / on account',reportingSite:'Unassigned',files:[]};
 assert(r.api.logInvoice({...base,clientRequestId:'first'}).saved);
 const input={...base,clientRequestId:'second'},before=JSON.stringify(r.sheets.Orders.rows);
 const warning=r.api.logInvoice(input);assert.equal(warning.code,'POSSIBLE_DUPLICATE_INVOICE');assert(!warning.saved);assert.equal(JSON.stringify(r.sheets.Orders.rows),before);
 const changed=r.api.logInvoice({...input,desc:'Changed',duplicateConfirmation:warning.duplicateConfirmation});assert.equal(changed.code,'POSSIBLE_DUPLICATE_INVOICE');assert.notEqual(changed.duplicateConfirmation,warning.duplicateConfirmation);
 const confirmed={...input,duplicateConfirmation:warning.duplicateConfirmation};assert(r.api.logInvoice(confirmed).saved);assert(r.api.logInvoice(confirmed).replayed);
 const third=r.api.logInvoice({...base,clientRequestId:'third',duplicateConfirmation:warning.duplicateConfirmation});assert.equal(third.code,'POSSIBLE_DUPLICATE_INVOICE');assert.notEqual(third.duplicateConfirmation,warning.duplicateConfirmation);
 assert(r.api.logInvoice({...base,cost:18,clientRequestId:'different-amount'}).saved);
 assert(r.api.logInvoice({...base,invoiceNumber:'INV-A',clientRequestId:'numbered'}).saved);
 assert(!r.api.logInvoice({...base,invoiceNumber:'inv-a',clientRequestId:'numbered-duplicate'}).saved);
}
// Cancellation uses explicit metadata and narrowly recognises the legacy format.
{
 const r=make(),row=r.sheets.Orders.rows[2];row[6]='Replacement for CANCELLED item';
 assert(!r.api.isOrderCancelled_(row));
 const result=r.api.userCancelOrder(row[0],'No longer needed',r.api.orderVersion_(row));assert(result.saved);
 const data=r.api.getDashboardData(),order=data.orders.find(o=>o.id===row[0]);assert.equal(order.status,'Cancelled');
 const cols=r.api.getOrdersMetadataColumnsForRead_(r.sheets.Orders),saved=r.sheets.Orders.rows[2];
 assert(saved[cols.cancellationIndex]);saved[6]='Edited description';assert(r.api.isOrderCancelled_(saved,cols));
 const actions=r.api.getOrderRecordActions_(data.user,saved,cols);assert(!actions.canCorrect);assert(!actions.canProcess);assert(!actions.canApprove);assert(!actions.canResubmit);
}
// Actual cost (including zero), academic boundaries and distinct year-months.
const elements={'period-filter':{value:'2026'},'chart-data':{innerHTML:''},'chart-warning':{hidden:false}};
const ctx={console,Date,Intl,Set,Map,Number,String,Math,document:{getElementById:id=>elements[id]||(elements[id]={innerHTML:'',style:{},dataset:{},classList:{toggle(){}}})},escapeHtml:v=>String(v),isSystemBudgetDepartment:()=>false,formatCurrency:n=>'£'+Number(n).toFixed(2),budgetChart:null,departmentChart:null};
vm.createContext(ctx);
for(const name of ['academicYear_','reportingDate_','displayReportingDate_','displayMonth_','scopedOrders_','parseDashboardAmount','getOrderBudgetAmount','isCompletedOrder','updateChartsWithData','csvCell_'])vm.runInContext(fn(dashboard,name),ctx);
assert.equal(ctx.academicYear_(new Date('2026-08-31T22:59:00Z')),2025);assert.equal(ctx.academicYear_(new Date('2026-08-31T23:00:00Z')),2026);
const order=(date,extra={})=>({id:date,dept:'Science',status:'Ordered',isCompleted:true,dateReq:date,dateOrdered:date,totalPrice:25,finalPrice:24,...extra});
const orders=[order('31/08/2026'),order('01/09/2026'),order('31/08/2027'),order('01/09/2027'),order('02/10/2026',{status:'Cancelled'})];
assert.deepEqual(Array.from(ctx.scopedOrders_({orders},'All'),o=>o.id),['01/09/2026','31/08/2027']);
assert.equal(ctx.getOrderBudgetAmount(order('01/09/2026')),24);assert.equal(ctx.getOrderBudgetAmount(order('01/09/2026',{finalPrice:0})),0);assert.equal(ctx.reportingDate_(order('31/02/2026')),null);
assert.equal(ctx.isCompletedOrder(order('01/09/2026',{recordType:'Transfer'})),false,'Budget transfers are not purchases');
vm.runInContext(fn(dashboard,'updateCards'),ctx);
ctx.updateCards({overview:{actualSpend:24,pendingValue:0,pendingCount:0,ledger:{allocation:100,used:34,remaining:66}},orders:[]});
assert.equal(elements['actual-spend'].textContent,'£24.00');assert.equal(elements['available-budget'].textContent,'£66.00');
ctx.updateCards({overview:{actualSpend:24,pendingValue:0,pendingCount:0,ledger:{allocation:100,used:14,remaining:86}},orders:[]});
assert.equal(elements['available-budget'].textContent,'£86.00');
elements['period-filter'].value='All';
ctx.updateChartsWithData({orders:[order('01/07/2025'),order('01/07/2026')],budgets:{Science:{total:100}}});
const table=Object.values(elements).map(e=>e.innerHTML||'').join('');assert(table.includes('Jul 2025'));assert(table.includes('Jul 2026'));assert.equal((table.match(/£24\.00/g)||[]).length,2);
assert.equal(ctx.csvCell_('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
let exported='';ctx.Blob=function(parts){exported=parts.join('');};ctx.URL={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};ctx.setTimeout=()=>{};
ctx.document.createElement=()=>({click(){},remove(){}});ctx.document.body={appendChild(){}};
elements['dept-filter']={value:'All'};ctx.globalData={orders:[
 order('01/07/2026',{id:'PURCHASE',approvalStatus:'AWAITING_SIGNOFF',returnInfo:{status:'Refund reversed',refunds:[{id:'CREDIT',reversalId:'REVERSAL'}]}}),
 order('01/07/2026',{recordType:'Transfer',finalPrice:10,status:'Transfer'}),
 order('01/07/2026',{id:'CREDIT',recordType:'Invoice',finalPrice:-10,status:'Processed',returnInfo:{parentId:'PURCHASE',adjustmentKind:'refund'}}),
 order('01/07/2026',{id:'REVERSAL',recordType:'Invoice',finalPrice:10,status:'Processed',returnInfo:{parentId:'PURCHASE',creditId:'CREDIT',adjustmentKind:'reversal'}})
]};
vm.runInContext(fn(dashboard,'downloadOverviewCsv_'),ctx);vm.runInContext(fn(dashboard,'exportReport'),ctx);ctx.exportReport();
const csv=exported.slice(1).split('\n').map(line=>line.split(',').map(v=>v.slice(1,-1)));
assert.equal(csv[1][csv[0].indexOf('Estimated cost')],'25');assert.equal(csv[1][csv[0].indexOf('Actual cost')],'24');assert.equal(csv[1][csv[0].indexOf('Reporting cost')],'24');
assert.equal(csv[2][csv[0].indexOf('Reporting cost')],'0');assert.equal(csv[2][csv[0].indexOf('Budget transfer (out positive)')],'10');
assert.equal(csv[1][csv[0].indexOf('Reporting date')],'01/07/2026');
assert.equal(csv[1][csv[0].indexOf('Review status')],'Sign-off needed');
assert.equal(csv[1][csv[0].indexOf('Linked refund references')],'CREDIT');
assert.equal(csv[1][csv[0].indexOf('Refund reversal references')],'REVERSAL');
assert.equal(csv[3][csv[0].indexOf('Reporting cost')],'-10');
assert.equal(csv[4][csv[0].indexOf('Reporting cost')],'10');
assert.equal(csv[4][csv[0].indexOf('Original refund')],'CREDIT');
// Workbook names remain legal and unique after Excel's 31-character truncation.
vm.runInContext(fn(portal,'uniqueSheetName_'),ctx);const used=new Set();
const names=['A'.repeat(40)+'one','A'.repeat(40)+'two','a'.repeat(40)+'three',"'[]?/Bad:'"].map(d=>ctx.uniqueSheetName_(d,used));
assert.equal(new Set(names.map(n=>n.toLowerCase())).size,4);assert(names.every(n=>n.length<=31&&!/[\[\]?:/\\*]/.test(n)));
// All three pages must parse after the accessibility/recovery changes.
for(const file of ['Index.html','dashboard.html','configuration.html'])for(const m of fs.readFileSync(path.join(root,file),'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1],{filename:file});
console.log('Audit improvements passed: environment isolation, duplicate decisions/replay, cancellation, academic boundaries, costs, chart years, CSV safety, workbook names and page syntax.');
