const assert = require('node:assert/strict');
const path = require('node:path');
const {createRuntime} = require('./performance-fixtures.cjs');

const source = path.resolve(__dirname,'../Code.js');
const runtime = (count=0, options={}) => createRuntime(source,count,{strictInputs:true,...options});
const email = name => name + '@claremontschool.co.uk';
const date = day => new Date(day+'T12:00:00Z');
const plain = value => JSON.parse(JSON.stringify(value));
const record = (r,id) => r.api.getOrderRecord(id);
const row = (r,id) => r.sheets.Orders.getDataRange().getValues().find(value=>String(value[0])===String(id));
const latestId = r => String(r.sheets.Orders.rows.at(-1)[0]);
const page = (r, query={}, extra={}) => r.api.getDashboardData({paged:true,query:{department:'All',pageSize:10,...query},...extra});
const ids = data => Array.from(data.orders,order=>order.id);
const draft = (suffix, changes={}) => ({
  clientRequestId:'requester-usability-'+suffix,selectedDept:'Science',supplier:'Synthetic supplier',desc:'Test request',
  qty:2,unitPrice:'10.00',location:'Prep',files:[],...changes
});
const edit = (r,id,changes={}) => r.api.submitOrder(draft('edit',{id,expectedVersion:r.api.orderVersion_(row(r,id)),...changes}));
const addUser = (r,name,dept) => r.sheets.Users.rows.push([email(name),dept,'Staff','Senior','',true,false,false]);

function addRecord(r, id, fields={}) {
  const headers = r.sheets.Orders.rows[0];
  const values = Array(headers.length).fill('');
  const raw = {...{
    ID:id,Department:'Science','Date of request':date('2026-10-01'),Requester:email('staff'),
    Supplier:'Synthetic supplier',Description:'Synthetic purchase '+id,Quantity:1,'Unit Price':10,
    'Total Price (Est)':10,'Delivery location':'Senior','Record Type':'Order',
    'Submitted By':email('staff'),'Approval Status':'NOT_REQUIRED'
  },...fields};
  for (const [key,value] of Object.entries(raw)) {
    let index = headers.indexOf(key);
    if (index < 0) {
      r.sheets.Orders.rows[0] = [...r.sheets.Orders.rows[0],key];
      index = r.sheets.Orders.rows[0].length-1;
    }
    values[index] = value;
  }
  r.sheets.Orders.rows.push(values);
  return values;
}

{
  const r = runtime();
  addUser(r,'colleague','Science, English');
  addUser(r,'unrelated','Science');
  r.setActor(email('staff'));
  const bad = r.api.submitOrder(draft('unauthorised',{selectedDept:'English'}));
  assert(!bad.saved);
  assert.match(bad.message,/selected department/i);
  assert.equal(r.sheets.Orders.rows.length,1,'Denied department cannot silently charge the first available budget');
  assert(r.api.submitOrder(draft('own')).saved);
  const own=latestId(r);
  assert(record(r,own).actions.canEdit);
  const files=[{name:'synthetic.pdf',type:'application/pdf',data:'dGVzdA=='}];
  let uploads=0;
  r.api.uploadFileToDrive_=()=>{uploads++;return {fileId:'synthetic-id',url:'https://example.com/synthetic-evidence'};};
  assert(edit(r,own,{desc:'Edited by requester',files}).saved);
  assert.equal(uploads,1);
  assert.match(record(r,own).attachment,/synthetic-evidence/);
  const original=r.sheets.Orders.rows.find(item=>item[0]===own);
  original[17]='Legacy note without a trailing newline.';
  assert(edit(r,own,{userNote:'Edit note'}).saved);
  assert.match(record(r,own).notes,/Legacy note without a trailing newline\.\n\[[^\n]+\]: Edit note\n$/);
  assert(r.api.addNote(own,'Follow-up note',record(r,own).version).saved);
  assert.match(record(r,own).notes,/Edit note\n\[[^\n]+\]: Follow-up note\n$/);
  assert(r.api.submitOrder(draft('on-behalf',{requesterEmail:email('colleague')})).saved);
  const submitted=latestId(r);
  assert(record(r,submitted).actions.canEdit);
  assert(edit(r,submitted,{desc:'Edited by submitter',requesterEmail:email('unrelated')}).saved);
  assert.equal(record(r,submitted).requester,email('colleague'));
  assert.equal(record(r,submitted).submittedBy,email('staff'));
  assert.deepEqual(ids(page(r,{ownership:'requester'})),[own]);
  assert.deepEqual(ids(page(r,{ownership:'submitter'})).sort(),[own,submitted].sort());
  r.setActor(email('unrelated'));
  assert.equal(record(r,submitted).actions.canEdit,false);
  assert(!edit(r,submitted,{files}).saved);
  assert.equal(uploads,1,'An unrelated colleague never starts an attachment upload');
  r.setActor(email('admin'));
  const declined=edit(r,own,{selectedDept:'English'});
  assert(!declined.saved);
  assert.match(declined.message,/original requester/i);
  assert.equal(record(r,own).dept,'Science');
  assert(edit(r,submitted,{selectedDept:'English'}).saved,'An eligible requester can move with the existing purchase');
  assert.equal(record(r,submitted).requester,email('colleague'));
  assert.equal(record(r,submitted).submittedBy,email('staff'));
  r.sheets.Users.rows[2][1]='Science, English';
  r.setActor(email('staff'));
  assert(edit(r,own,{selectedDept:'English'}).saved,'A requester can move their own request even though the directory dropdown omits self');
  assert.equal(record(r,own).dept,'English');
  assert.equal(record(r,own).requester,email('staff'));
}

{
  const r=runtime();
  r.setActor(email('staff'));
  const details={alreadyOrdered:true,unitPrice:'',finalCost:'21.75',paymentMethod:'Credit card'};
  assert(!r.api.submitOrder(draft('unallowed-ordered',details)).saved);
  r.setActor(email('admin'));
  assert(r.api.submitOrder(draft('already-ordered',details)).saved);
  const id=latestId(r), saved=row(r,id);
  assert.equal(saved[9],'');
  assert.equal(saved[10],'');
  assert.equal(saved[15],21.75);
  assert.equal(record(r,id).status,'Ordered');
  assert.equal(record(r,id).reportingSite,'Prep');
  assert(!record(r,id).actions.canEdit);
  const free={...details,finalCost:'0.00',paymentMethod:''};
  assert(!r.api.submitOrder(draft('free-unconfirmed',free)).saved);
  assert(!r.api.submitOrder(draft('free-no-reason',{...free,noChargeConfirmed:true})).saved);
  const audit=[];
  r.api.appendOrderFieldChanges_=(ss,reference,actor,changes)=>audit.push(...changes);
  assert(r.api.submitOrder(draft('free-confirmed',{...free,noChargeConfirmed:true,noChargeReason:'Free warranty item'})).saved);
  const freeOrder=record(r,latestId(r));
  assert.equal(freeOrder.status,'Ordered');
  assert.equal(freeOrder.finalPrice,0);
  assert.equal(freeOrder.totalPrice,'');
  assert.equal(freeOrder.paymentMethod,'');
  assert(audit.some(change=>change.field==='No-charge reason' && change.newValue==='Free warranty item'));
}

{
  const r=runtime(3), id='PERF-2';
  const messages=[];
  r.setActor(email('staff'));
  r.api.buildNotificationWarning_=payloads=>{
    assert.equal(record(r,id).status,'Cancelled','Notifications run after the cancellation is committed');
    messages.push(...payloads);
    return null;
  };
  assert(!r.api.userCancelOrder(id,'   ',record(r,id).version).saved);
  assert.equal(messages.length,0);
  assert(r.api.userCancelOrder(id,'Ordered elsewhere',record(r,id).version).saved);
  assert.deepEqual(messages.map(message=>message.to).sort(),[email('staff'),'test@example.com'].sort());
  assert(messages.every(message=>message.body.includes('Ordered elsewhere') && message.subject.includes(id)));
  assert.equal(row(r,id)[15],0);
  const cancellation = JSON.parse(row(r,id)[r.api.getOrdersMetadataColumnsForRead_(r.sheets.Orders).cancellationIndex]);
  assert.equal(cancellation.reason,'Ordered elsewhere');
  const failure=runtime(3,{failBeforeCommit:true});
  let sent=false;
  failure.api.buildNotificationWarning_=()=>{sent=true;};
  assert.throws(()=>failure.api.userCancelOrder(id,'Synthetic fault',record(failure,id).version));
  assert.equal(sent,false);
  assert.equal(record(failure,id).status,'Pending');
}

{
  const r=runtime();
  r.sheets.Users.rows[2][6]=true;
  r.setActor(email('staff'));
  const review = (id,approval,fields={}) => addRecord(r,id,{
    'Approval Status':approval,'Date ordered':date('2026-10-02'),'Updated total price':10,
    Requester:email('head'),'Submitted By':email('head'),'Processed By':email('head'),...fields
  });
  review('OTHER-AWAITS','AWAITING_SIGNOFF');
  review('MY-SUBMISSION','AWAITING_SIGNOFF',{'Submitted By':email('staff'),'Processed By':email('staff')});
  review('MY-QUERY','QUERY_RAISED',{Requester:email('staff'),'Submitted By':email('staff'),'Processed By':email('staff')});
  review('OTHER-QUERY','QUERY_RAISED');
  review('HIDDEN-INVOICE','AWAITING_SIGNOFF',{'Record Type':'Invoice'});
  const data=page(r);
  assert(data.success,data.error);
  assert.deepEqual(plain(data.summary.reviewCounts),{mine:2,awaiting:2,queries:1});
  assert.deepEqual(ids(page(r,{reviewScope:'mine',pendingOnly:true,excludeInvoices:true})).sort(),['OTHER-AWAITS','OTHER-QUERY']);
  assert.deepEqual(ids(page(r,{reviewScope:'awaiting'})).sort(),['MY-QUERY','MY-SUBMISSION']);
  assert.deepEqual(ids(page(r,{reviewScope:'queries',returnsOnly:true})),['MY-QUERY']);
  assert(!ids(data).includes('HIDDEN-INVOICE'));
  r.setActor(email('admin'));
  const preview=r.api.portalRpc('getDashboardData',[{paged:true,query:{department:'All',reviewScope:'mine'}}],
    {mode:'preview',email:email('staff')});
  assert.deepEqual(plain(preview.summary.reviewCounts),{mine:2,awaiting:2,queries:1});
  assert.deepEqual(ids(preview).sort(),['OTHER-AWAITS','OTHER-QUERY']);
  assert(preview.orders.every(item=>item.actions.canViewApprovalHistory &&
    Object.entries(item.actions).every(([key,value])=>key==='canViewApprovalHistory' || value===false)));
}

{
  const r=runtime(), id='APPROVED-INVOICE';
  r.sheets.Users.rows[0].push('Processing Departments');
  r.sheets.Users.rows[2].push('Science');
  addRecord(r,id,{'Record Type':'Invoice','Approval Status':'APPROVED','Approval Revision':2,
    'Approved By':email('admin'),'Approved At':date('2026-10-05'),'Date ordered':date('2026-10-04'),'Updated total price':10});
  addRecord(r,'OTHER-DEPARTMENT-INVOICE',{'Record Type':'Invoice',Department:'English','Approval Status':'APPROVED'});
  const columns=r.api.getOrdersMetadataColumnsForRead_(r.sheets.Orders);
  const privateNote='Synthetic private approval note';
  r.api.appendOrderApprovalAudit_(r.api.getPortalSpreadsheet_(),row(r,id),columns,'APPROVED',email('admin'),privateNote);
  r.setActor(email('staff'));
  assert(record(r,id).actions.canViewApprovalHistory);
  assert.equal(record(r,id).actions.canApprove,false);
  assert.equal(r.api.getOrderApprovalHistory(id)[0].note,privateNote);
  assert.throws(()=>r.api.getOrderApprovalHistory('OTHER-DEPARTMENT-INVOICE'),/Access denied/);
  r.setActor(email('head'));
  const unprivileged=record(r,id);
  assert.equal(unprivileged.approvalStatus,'APPROVED');
  assert.equal(unprivileged.actions.canViewApprovalHistory,false);
  assert.equal(unprivileged.approvedBy,'');
  assert.equal(unprivileged.approvedAt,'');
  assert(!JSON.stringify(unprivileged).includes(privateNote));
  assert.throws(()=>r.api.getOrderApprovalHistory(id),/Access denied/);
  r.setActor(email('admin'));
  const context={mode:'preview',email:email('staff')};
  const readonly=r.api.portalRpc('getOrderRecord',[id],context);
  assert(readonly.actions.canViewApprovalHistory);
  assert(Object.entries(readonly.actions).every(([key,value])=>key==='canViewApprovalHistory' || value===false));
  assert.equal(r.api.portalRpc('getOrderApprovalHistory',[id],context)[0].note,privateNote);
  assert.throws(()=>r.api.portalRpc('getOrderApprovalHistory',['OTHER-DEPARTMENT-INVOICE'],context),/Access denied/);
  assert.throws(()=>r.api.portalRpc('getOrderApprovalHistory',[id],{mode:'preview',email:email('head')}),/Access denied/);
  assert.throws(()=>r.api.portalRpc('reviewOrderApproval',[id,'APPROVE','',readonly.version],context),/read-only/);
}

{
  const r=runtime();
  r.sheets.Users.rows[2][6]=true;
  r.setActor(email('staff'));
  r.sheets.Budgets.rows[1].splice(1,3,100,180,-80);
  const invoice=addRecord(r,'HIDDEN-INVOICE',{'Record Type':'Invoice','Date of request':date('2026-10-01'),'Total Price (Est)':60});
  for (let i=1;i<=12;i++) addRecord(r,'REQ-'+String(i).padStart(2,'0'),{'Date of request':date('2026-10-'+String(i+1).padStart(2,'0'))});
  const first=page(r,{department:'Science',sortDirection:'asc'});
  const second=page(r,{department:'Science',sortDirection:'asc',page:2});
  const reverse=page(r,{department:'Science',sortDirection:'desc'});
  const filtered=page(r,{department:'Science',search:'REQ-03',excludeInvoices:true,pendingOnly:true});
  const all=Array.from(first.orders).concat(Array.from(second.orders));
  assert.equal(all.length,12);
  assert.deepEqual(all.filter(item=>!item.overBudget).map(item=>item.id),['REQ-01','REQ-02','REQ-03','REQ-04']);
  assert(reverse.orders.find(item=>item.id==='REQ-04').overBudget===false);
  assert(filtered.orders[0].overBudget===false);
  assert.deepEqual(plain(filtered.summary.ledger.Science),{
    allocation:100,used:180,remaining:-80,spent:0,committed:180,hasCalculationError:false
  });
  invoice[13]=date('2026-10-04');
  invoice[15]=60;
  const reloaded=page(r,{department:'Science',sortDirection:'asc'},{knownRevision:first.meta.revision});
  assert(!reloaded.notModified,'A hidden invoice processing changes the authoritative spent/committed split');
  assert.equal(reloaded.summary.ledger.Science.spent,60);
  assert.equal(reloaded.summary.ledger.Science.committed,120);
  assert.equal(reloaded.summary.ledger.Science.remaining,-80);
}

{
  const r=runtime();
  const empty=r.api.getOverviewDashboardData({summaryOnly:true,period:'2026',department:'Science'});
  assert.equal(empty.overview.ledger.allocation,100000,'Empty history retains authoritative allocation');
  const completed=(id,ordered,amount,extra={})=>addRecord(r,id,{
    'Date of request':date('2026-08-20'),'Date ordered':date(ordered),'Updated total price':amount,...extra
  });
  completed('CURRENT','2026-09-02',55);
  completed('PRIOR','2026-08-29',99);
  completed('SENIOR-EXPLICIT','2026-09-12',11,{Department:'English','Reporting Site':'Senior','Delivery location':'Clyde'});
  completed('WHOLE','2026-09-12',20,{'Record Type':'Invoice','Reporting Site':'Whole school','Delivery location':'Finance'});
  completed('UNASSIGNED','2026-09-12',30,{'Record Type':'Invoice','Delivery location':'Finance'});
  completed('PREP','2026-09-12',25,{'Record Type':'Invoice','Reporting Site':'Prep','Delivery location':'Finance'});
  addRecord(r,'PENDING-CURRENT',{'Total Price (Est)':13});
  addRecord(r,'PENDING-CARRY',{'Date of request':date('2026-08-31')});
  addRecord(r,'PENDING-UNDATED',{'Date of request':'','Total Price (Est)':70});
  const overview = (period='2026',department='All')=>r.api.getOverviewDashboardData({summaryOnly:true,period,department}).overview;
  const current=overview();
  assert.equal(current.actualSpend,141);
  assert.equal(current.pendingCount,1);
  assert.deepEqual(plain(current.carryOver),{count:1,value:10});
  assert.equal(current.ledger.allocation,200000);
  assert.equal(current.ledger.remaining,198500);
  assert.equal(overview('2025').ledger,null);
  const exported=r.api.getOverviewExportPage({period:'2026'}).orders;
  assert.equal(exported.find(item=>item.id==='CURRENT').reportingDate,'02/09/2026');
  assert(!exported.some(item=>item.id==='PRIOR'));

  r.setActor(email('head'));
  const site=overview();
  assert.equal(site.actualSpend,66);
  assert.equal(site.ledger,null,'Site totals must not expose an all-site ledger');
  assert.match(site.siteExclusionsNote,/Whole-school and unassigned/);
  const siteIds=ids(r.api.getOverviewExportPage({period:'All'}));
  assert(siteIds.includes('SENIOR-EXPLICIT'),'The lead can view reporting activity for their site across departments');
  assert(!siteIds.some(id=>['WHOLE','UNASSIGNED','PREP'].includes(id)));
  r.setActor(email('staff'));
  assert(!r.api.getOverviewDashboardData({summaryOnly:true}).success);
}

console.log('Requester and reporting usability passed: owner/submitter edits, attachments and department validation, blank estimates, postcommit cancellation notices, reviewer queues, stable warnings, budget ledger, date/site exports and carry-over.');
