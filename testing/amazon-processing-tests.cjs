const assert=require('assert'),path=require('path');
const {createRuntime}=require('./performance-fixtures.cjs');
const r=createRuntime(path.resolve(__dirname,'../Code.js'),0,{strictInputs:true}),a=r.api;
r.sheets.Users.rows[0].push('Processing Departments');
r.sheets.Users.rows[2][1]='Science, English'; r.sheets.Users.rows[2][8]='Science';
r.sheets.Users.rows[3][8]='Science';
const actor=email=>r.setActor(email+'@claremontschool.co.uk');
const row=id=>r.sheets.Orders.rows.find(r=>r[0]===id);
const version=id=>a.orderVersion_(row(id));
const invoice=(key,dept='Science',cost='123.45')=>({dept,supplier:'Amazon synthetic '+key,desc:'Full VAT and delivery charge '+key,cost,paymentMethod:'Credit card',reportingSite:'Senior',clientRequestId:key,files:[]});
const correctCost=(id,cost)=>a.updateOrder(id,'',cost,'','',null,version(id),[],false,null,{correctionReason:'Confirmed against supplier invoice'});
actor('staff');
let u=a.getUserContext();
assert(u.capabilities.hasDepartmentProcessingPermission);
assert(a.canProcessOrderRecord_(u,'Science','Order'));
assert(!a.canProcessOrderRecord_(u,'English','Order'),'viewing must not grant processing');
assert(!a.canProcessOrderRecord_(u,'Science','Invoice'),'review does not grant Finance reconciliation');
assert.equal(a.logInvoice(invoice('denied','English')).saved,false);
assert(a.logInvoice(invoice('inv-1')).saved);
let id=r.sheets.Orders.rows.at(-1)[0], cols=a.getOrdersMetadataColumnsForRead_(r.sheets.Orders);
assert.equal(row(id)[cols.recordTypeIndex],'Invoice');
assert.equal(row(id)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
assert.equal(row(id)[10],123.45);
assert(!a.reviewOrderApproval(id,'APPROVE','',version(id)).success);
assert(a.logInvoice(invoice('inv-1')).replayed);
assert.equal(r.sheets.Orders.rows.length,2);
actor('head');
assert(a.reviewOrderApproval(id,'QUERY','Please correct cost',version(id)).success);
actor('staff');
assert(!correctCost(id,'0').saved,'direct invoice correction cannot set zero');
assert.equal(row(id)[10],123.45);
assert(correctCost(id,'120').saved);
assert.equal(row(id)[10],120);assert.equal(row(id)[13],'','correction must not reconcile invoice');
assert.equal(row(id)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
const stale=version(id);
actor('head');assert(a.reviewOrderApproval(id,'APPROVE','',stale).success);
assert(!a.reviewOrderApproval(id,'QUERY','stale',stale).success);
assert(a.getOrderApprovalHistory(id).length>=4);
r.sheets.Orders.rows.push([...row(id)]);
assert.throws(()=>a.getOrderApprovalHistory(id),/duplicate|more than one/i);
r.sheets.Orders.rows.pop();
actor('staff');assert(correctCost(id,'121').saved);
assert.equal(row(id)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
actor('head');assert(a.reviewOrderApproval(id,'QUERY','Clarify',version(id)).success);
actor('staff');assert(a.resubmitOrderApproval(id,'Explained',version(id)).success);
r.sheets.Users.rows[3][8]='English';actor('head');
assert(!a.reviewOrderApproval(id,'APPROVE','',version(id)).success);
assert.throws(()=>a.getOrderApprovalHistory(id),/Access denied/);
actor('finance');assert(!a.getUserContext().capabilities.canApproveOrders);
assert(!a.reviewOrderApproval(id,'APPROVE','',version(id)).success);
assert(a.processInvoice({id,expectedVersion:version(id)}).saved,'Wipro Finance reconciliation preserved');
actor('admin');assert(a.reviewOrderApproval(id,'APPROVE','',version(id)).success);
actor('staff');
assert(a.logInvoice({...invoice('on-account'),paymentMethod:'Invoice / on account'}).saved);
const onAccountId=r.sheets.Orders.rows.at(-1)[0];
const accountRow=row(onAccountId);
assert.equal(accountRow[cols.approvalStatusIndex],'NOT_REQUIRED');
actor('admin');
const paymentCorrection=paymentMethod=>({id:onAccountId,expectedVersion:version(onAccountId),dept:'Science',
 supplier:accountRow[4],desc:accountRow[6],cost:accountRow[10],invoiceNumber:'',paymentMethod,reason:'Correct payment method',files:[]});
assert(!a.reviewOrderApproval(onAccountId,'APPROVE','',version(onAccountId)).success);
assert(a.updateInvoice(paymentCorrection('Credit card')).saved);
assert.equal(a.getOrderApprovalStatus_(row(onAccountId),cols),'AWAITING_SIGNOFF');
assert(a.updateInvoice(paymentCorrection('Invoice / on account')).saved);
assert.equal(a.getOrderApprovalStatus_(row(onAccountId),cols),'NOT_REQUIRED');
row(onAccountId)[cols.approvalStatusIndex]='QUERY_RAISED';
actor('staff');
assert(a.resubmitOrderApproval(onAccountId,'Response to existing query',version(onAccountId)).success);
assert.equal(a.getOrderApprovalStatus_(row(onAccountId),cols),'QUERY_RAISED');
actor('admin');
assert(!a.reviewOrderApproval(onAccountId,'APPROVE','',version(onAccountId)).success);
assert(a.reviewOrderApproval(onAccountId,'RESOLVE','Resolved',version(onAccountId)).success);
assert.equal(row(onAccountId)[cols.approvalStatusIndex],'NOT_REQUIRED');
assert.equal(row(onAccountId)[cols.approvedByIndex],'');
assert(r.sheets['Order Approval Audit'].rows.some(entry=>entry.includes(onAccountId) && entry.includes('QUERY_RESOLVED')));
assert(a.logInvoice(invoice('admin-own')).saved);
const adminId=r.sheets.Orders.rows.at(-1)[0];
assert.equal(row(adminId)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
assert(a.processInvoice({id:adminId,expectedVersion:version(adminId)}).saved,'Admin can complete own invoice');
assert.equal(row(adminId)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
assert(a.reviewOrderApproval(adminId,'APPROVE','Checked card receipt',version(adminId)).success);
assert.equal(row(adminId)[cols.approvalStatusIndex],'APPROVED');
assert.equal(row(adminId)[cols.approvedByIndex],'admin@claremontschool.co.uk');
assert(row(adminId)[cols.approvedAtIndex]);
assert(r.sheets['Order Approval Audit'].rows.some(entry=>entry.includes(adminId) && entry.includes('APPROVED') && entry.includes('Checked card receipt')));
assert(row(adminId)[13],'Admin invoice is completed');
// Legacy Admin purchases with no recorded payment method retain their existing cleanup path.
row(adminId)[cols.paymentMethodIndex]='';
row(adminId)[cols.approvalStatusIndex]='AWAITING_SIGNOFF';
assert(a.reviewOrderApproval(adminId,'APPROVE','Admin completing own purchase',version(adminId)).success);
assert.equal(row(adminId)[cols.approvalStatusIndex],'APPROVED');
row(adminId)[cols.approvalStatusIndex]='AWAITING_SIGNOFF';
const cleanup=a.getAdminSignoffCleanupPreview();
assert.equal(cleanup.length,1,'cleanup excludes department buyers');
const invoiceBefore=row(adminId).slice();
assert.throws(()=>a.clearAdminPurchaseSignoffs([{id:adminId,version:'stale'}]),/changed|stale|reload/i);
assert.equal(row(adminId)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
assert(a.clearAdminPurchaseSignoffs(cleanup).success);
assert.equal(row(adminId)[cols.approvalStatusIndex],'NOT_REQUIRED');
for(let c=0;c<invoiceBefore.length;c++)if(![cols.approvalStatusIndex,cols.approvedByIndex,cols.approvedAtIndex].includes(c))assert.deepEqual(row(adminId)[c],invoiceBefore[c],'cleanup preserves field '+c);
assert(r.sheets['Order Approval Audit'].rows.some(r=>r.includes('ADMIN_SIGNOFF_NOT_REQUIRED')));
assert.equal(a.getAdminSignoffCleanupPreview().length,0);
assert.throws(()=>a.clearAdminPurchaseSignoffs(cleanup),/no longer/,'replayed cleanup cannot repeat');
actor('staff');assert.throws(()=>a.getAdminSignoffCleanupPreview(),/Admin required/);
assert.throws(()=>a.clearAdminPurchaseSignoffs(cleanup),/Admin required/);
actor('admin');
// New own normal requests work through both individual and bulk processing.
for(const bulk of [false,true]){
 assert(a.submitOrder({selectedDept:'Science',supplier:'Admin test',desc:'Admin own request '+bulk,qty:1,unitPrice:10,clientRequestId:'admin-req-'+bulk,files:[]}).saved);
 const adminOrder=r.sheets.Orders.rows.at(-1)[0];
 assert(bulk?a.bulkFinalizeOrders([{id:adminOrder,quantity:1,finalPrice:10,expectedVersion:version(adminOrder),paymentMethod:'Credit card'}]).success:a.updateOrder(adminOrder,'','10','','',null,version(adminOrder),[],false,'Credit card').saved);
 assert.equal(row(adminOrder)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
 assert(a.reviewOrderApproval(adminOrder,'APPROVE','',version(adminOrder)).success);
 assert.equal(row(adminOrder)[cols.approvalStatusIndex],'APPROVED');
 assert(row(adminOrder)[13]);
}
r.sheets.Users.rows[3][8]='Science';
// Existing colleague request is processed in place; self requests queue review.
actor('head');assert(a.submitOrder({selectedDept:'Science',supplier:'Amazon test',desc:'Colleague request',qty:1,unitPrice:20,clientRequestId:'req-1',files:[]}).saved);
const orderId=r.sheets.Orders.rows.at(-1)[0], n=r.sheets.Orders.rows.length;
actor('staff');assert(a.updateOrder(orderId,'','22','Amazon reference X','',null,version(orderId),[],false,'Invoice / on account').saved);
assert.equal(r.sheets.Orders.rows.length,n);assert.equal(row(orderId)[cols.approvalStatusIndex],'NOT_REQUIRED');
assert(a.submitOrder({selectedDept:'English',supplier:'Test',desc:'Viewed but not processable',qty:1,unitPrice:10,clientRequestId:'req-2',files:[]}).saved);
const other=r.sheets.Orders.rows.at(-1)[0];
assert(!a.updateOrder(other,'','10','','',null,version(other),[],false,'Credit card').saved);
assert(!a.bulkFinalizeOrders([{id:other,quantity:1,finalPrice:10,expectedVersion:version(other),paymentMethod:'Credit card'}]).success);
assert(a.submitOrder({selectedDept:'Science',supplier:'Test',desc:'Own request',qty:1,unitPrice:10,clientRequestId:'req-3',files:[]}).saved);
const own=r.sheets.Orders.rows.at(-1)[0];
assert(a.bulkFinalizeOrders([{id:own,quantity:1,finalPrice:10,expectedVersion:version(own),paymentMethod:'Credit card'}]).success);
assert.equal(row(own)[cols.approvalStatusIndex],'AWAITING_SIGNOFF');
assert(!a.reviewOrderApproval(own,'APPROVE','',version(own)).success);
assert(a.developmentChatAndErrorAlertsSuppressed_());
// Upload authorisation happens before creating any file, even on direct RPC.
let uploads=0;
a.uploadFileToDrive_=()=>{uploads++;return {fileId:'synthetic-file',url:'https://example.com/synthetic-file'};};
a.trashUploadedFiles_=()=>{};
const file={name:'synthetic.txt',type:'text/plain',data:'VEVTVA=='};
assert(!a.updateOrder(other,'','','','',null,version(other),[file],true).saved);
assert.equal(uploads,0);
assert(a.updateOrder(own,'','','','',null,version(own),[file],true).saved);
assert.equal(uploads,1);assert(row(own)[19].includes('synthetic-file'));
const before=JSON.stringify(r.sheets.Orders.rows);
assert(!a.bulkFinalizeOrders([{id:other,quantity:1,finalPrice:10,expectedVersion:version(other),paymentMethod:'Credit card'},{id:own,quantity:1,finalPrice:10,expectedVersion:version(own),paymentMethod:'Credit card'}]).success);
assert.equal(JSON.stringify(r.sheets.Orders.rows),before,'bulk denial is atomic');
// Each proposed named grant is exact; a currently viewed extra budget grants nothing.
const people = [
 {email:'buyer-one@example.org',processingDepartments:['Science']},
 {email:'buyer-two@example.org',processingDepartments:['English','Science']}
];
for (const person of people) {
 const u={...person,realEmail:person.email,role:'Staff',realRole:'Staff',depts:[...person.processingDepartments,'VIEW ONLY']};
 a.attachCapabilities_(u);
 for(const budget of person.processingDepartments){assert(a.canProcessOrderRecord_(u,budget,'Order'));assert(a.canLogInvoiceDepartment_(u,budget));}
 assert(!a.canProcessOrderRecord_(u,'VIEW ONLY','Order'));
 assert(!a.canLogInvoiceDepartment_(u,'VIEW ONLY'));
 assert(a.canViewOrderRecord_(u,'VIEW ONLY','Order'));
 assert(!a.canViewOrderRecord_(u,'UNRELATED BUDGET','Order'));
 assert(!a.canViewOrderRecord_(u,'UNRELATED BUDGET','Invoice'));
}
// Configuration uses supported saving, persists grants, audits changes and rejects stale saves.
actor('admin');
const ss=a.getPortalSpreadsheet_();
const config={email:'head@claremontschool.co.uk',originalEmail:'head@claremontschool.co.uk',role:'Head',defaultSite:'Senior',departments:['Science'],processingDepartments:['English'],canProcessOrders:false,canLogInvoices:false,expectedConfigurationRevision:a.configurationRevision_(ss)};
assert(JSON.parse(a.saveAdminUserConfiguration(config)).success);
assert.equal(r.sheets.Users.rows[3][8],'English');
assert(!JSON.parse(a.saveAdminUserConfiguration({...config,processingDepartments:['Science']})).success);
assert(r.sheets['Configuration Audit'].rows.some(row=>row.includes('Processing budgets changed')));
// Finance reconciliation keeps approval and cannot change the logged amount.
actor('staff');assert(a.logInvoice(invoice('bulk-material')).saved);const bulkId=r.sheets.Orders.rows.at(-1)[0];
actor('admin');assert(a.reviewOrderApproval(bulkId,'APPROVE','',version(bulkId)).success);
actor('finance');assert(a.bulkFinalizeOrders([{id:bulkId,quantity:1,finalPrice:130,expectedVersion:version(bulkId)}]).success);
assert.equal(row(bulkId)[cols.approvalStatusIndex],'APPROVED');
assert.equal(row(bulkId)[15],123.45);
// All incurred values remain represented while queried/pending, including signed credits.
actor('staff');assert(a.logInvoice(invoice('signed-credit','Science','-3.45')).saved);
const creditId=r.sheets.Orders.rows.at(-1)[0];assert.equal(row(creditId)[cols.recordTypeIndex],'Invoice');
actor('admin');
const entries=a.readOrderHistory_(ss,a.getUserContext(),a.getBudgetSnapshot_(ss)).entries;
const totals=a.summarizeOrderHistory_(entries,{}).deptSummary;
const incurred=entries.filter(e=>e.order.dept==='Science'&&e.order.status!=='Cancelled').reduce((n,e)=>n+a.orderQueryAmount_(e.order),0);
assert(Math.abs(totals.Science.spent+totals.Science.committed-incurred)<0.000001);
// The temporary fixture helper must fail closed outside DEV and for non-Admins.
const guard=createRuntime(path.resolve(__dirname,'../Code.js'),0,{strictInputs:true});
require('vm').runInContext(require('fs').readFileSync(path.resolve(__dirname,'../AmazonDevelopment.js'),'utf8'),guard.api);
guard.setDevelopment(false);guard.setActor('admin@claremontschool.co.uk');
assert.throws(()=>guard.api.seedAmazonDevelopmentFixtures(),/DEV only/);
assert.throws(()=>guard.api.seedAdminSignoffDevelopmentFixture(),/DEV only/);
guard.setDevelopment(true);guard.setActor('staff@claremontschool.co.uk');
assert.throws(()=>guard.api.seedAmazonDevelopmentFixtures(),/Admin required/);
assert.throws(()=>guard.api.seedAdminSignoffDevelopmentFixture(),/Admin required/);
guard.setActor('admin@claremontschool.co.uk');
const guardedSheet=guard.api.getPortalSpreadsheet_();
guardedSheet.getId=()=> '1nUhtnywmnibXPmQNBM78aYVf03BHj3trw-pIHe3ZO34';
guard.api.getPortalSpreadsheet_=()=>guardedSheet;
guard.api.getPortalAttachmentFolder_=()=>({id:'synthetic-folder'});
assert.throws(()=>guard.api.seedAmazonDevelopmentFixtures(),/Live source prohibited/);
assert.throws(()=>guard.api.seedAdminSignoffDevelopmentFixture(),/Live source prohibited/);
console.log('Amazon processing: Admin own invoice and individual/bulk completion, existing Admin queue clearance, buyer self-review denial, scope, Invoice correction/review, Wipro, stale/replay, audit and DEV-only guards passed.');

