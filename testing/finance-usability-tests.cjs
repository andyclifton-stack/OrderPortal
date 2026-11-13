const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRuntime} = require('./performance-fixtures.cjs');

const runtime = options => createRuntime(path.resolve(__dirname,'../Code.js'),7,{strictInputs:true,...options});
const account = name => name + '@claremontschool.co.uk';
const row = (r,id) => r.sheets.Orders.getDataRange().getValues().find(item=>String(item[0])===String(id));
const version = (r,id) => r.api.orderVersion_(row(r,id));
const cols = r => r.api.getOrdersMetadataColumnsForRead_(r.sheets.Orders);
const resultRow = r => r.sheets.Orders.rows.at(-1)[0];
const makeInvoice = (suffix, overrides={}) => ({
  dept:'Science',supplier:'Synthetic Finance',desc:'Test purchase',cost:'12.34',
  invoiceNumber:'INV-'+suffix,paymentMethod:'Credit card',reportingSite:'Prep',
  clientRequestId:'finance-usability-'+suffix,files:[],...overrides
});
const log = (r,suffix,overrides) => {
  assert(r.api.logInvoice(makeInvoice(suffix,overrides)).saved);
  return resultRow(r);
};
const update = (r,id,price,options,method='Credit card') => r.api.updateOrder(id,'',price,'',null,null,version(r,id),[],false,method,options);
const process = (r,id,options={}) => r.api.processInvoice({id,expectedVersion:version(r,id),...options});
const returnSave = (r,id,action,options={}) => r.api.saveOrderReturn({id,expectedVersion:version(r,id),action,...options});
const refund = {amount:'10.00',date:'2026-11-04',confirmed:true,refundReference:'CREDIT-DEV-01'};
const recordInfo = (r,id) => r.api.getOrderReturnInfo_(row(r,id),cols(r));

function formatExport(orders) {
  const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
  const context=vm.createContext({getOrderCost_:order=>order.finalPrice !== '' && order.finalPrice != null ? order.finalPrice : order.totalPrice});
  vm.runInContext(html.slice(html.indexOf('function isInvoiceOrder('),html.indexOf('function parseOrderMoney(')),context);
  vm.runInContext(html.slice(html.indexOf('function formatForExcel('),html.indexOf('let simulationTargets_')),context);
  return Array.from(context.formatForExcel(orders));
}

{
  const r=runtime(), audit=[];
  r.api.appendOrderFieldChanges_=(ss,id,actor,changes)=>audit.push(...changes);
  const id=log(r,'processed');
  assert.equal(row(r,id)[cols(r).reportingSiteIndex],'Prep');
  assert.equal(r.api.logInvoice(makeInvoice('missing-site',{reportingSite:''})).code,'INVALID_REPORTING_SITE');
  assert.equal(r.api.logInvoice(makeInvoice('bad-site',{reportingSite:'constructor'})).code,'INVALID_REPORTING_SITE');
  r.setActor(account('staff'));
  assert.throws(()=>process(r,id),/finance/i);
  r.setActor(account('finance'));
  const before=JSON.stringify(row(r,id));
  for (const cost of ['',0,-13,100000]) assert.equal(update(r,id,cost).code,'USE_INVOICE_ACTION');
  assert.equal(JSON.stringify(row(r,id)),before);
  const originalProcessor=row(r,id)[cols(r).processedByIndex];
  assert(process(r,id,{cost:-99,paymentMethod:'Invoice / on account'}).saved,'unrecognised fields cannot change logged financial details');
  assert.equal(row(r,id)[15],12.34);
  assert.equal(row(r,id)[cols(r).paymentMethodIndex],'Credit card');
  assert.equal(row(r,id)[cols(r).processedByIndex],originalProcessor);
  assert.equal(row(r,id)[cols(r).financeProcessedByIndex],account('finance'));
  assert(audit.some(item=>item.field==='Finance Processed By' && item.newValue===account('finance')));
  assert.equal(process(r,id).saved,false);

  const legacy=log(r,'legacy',{cost:'100000',amountConfirmed:true,reportingSite:'Unassigned'});
  assert.equal(process(r,legacy).code,'INVOICE_AMOUNT_WARNING');
  assert(process(r,legacy,{amountConfirmed:true}).saved);
  const credit=log(r,'bulk-credit',{cost:'-2.50'});
  const batch=r.api.bulkFinalizeOrders([
    {id:'PERF-1',expectedVersion:version(r,'PERF-1'),quantity:1,finalPrice:15,paymentMethod:'Credit card'},
    {id:credit,expectedVersion:version(r,credit),quantity:99,finalPrice:200}
  ]);
  assert(batch.saved,batch.error);
  assert.equal(row(r,credit)[8],1);
  assert.equal(row(r,credit)[15],-2.50);
  assert.match(batch.message,/Marked 1 order as ordered.*Processed 1 invoice/);

  assert.equal(update(r,'PERF-2','').saved,false);
  assert.equal(update(r,'PERF-2',0).code,'NO_CHARGE_CONFIRMATION');
  assert.equal(update(r,'PERF-2',0,{noChargeConfirmed:true}).saved,false);
  assert(update(r,'PERF-2',0,{noChargeConfirmed:true,noChargeReason:'Replacement under warranty'},'').saved);
  assert(audit.some(item=>item.field==='No-charge reason' && item.newValue==='Replacement under warranty'));
  assert.equal(row(r,'PERF-2')[15],0);
  assert.equal(row(r,'PERF-2')[cols(r).paymentMethodIndex],'');
  assert.equal(update(r,'PERF-2',10,{},'').saved,false,'A free purchase converted to a paid one requires a method');
  const bulkFree={id:'PERF-4',expectedVersion:version(r,'PERF-4'),quantity:1,finalPrice:0,
    noChargeConfirmed:true,noChargeReason:'Supplier replacement',paymentMethod:''};
  assert(r.api.bulkFinalizeOrders([bulkFree]).saved);
  assert.equal(row(r,'PERF-4')[cols(r).paymentMethodIndex],'');
}

{
  const r=runtime(), id='PERF-1';
  const supplier=row(r,id)[4], dept=row(r,id)[1], invoiceNumber='INV-CROSS';
  assert(r.api.saveOrderInvoiceEvidence({id,expectedVersion:version(r,id),invoiceNumber}).saved);
  assert.equal(row(r,id)[13],'','Evidence must not mark the purchase ordered');
  const duplicate=r.api.logInvoice(makeInvoice('dup',{supplier:' '+supplier.toUpperCase()+' ',dept,invoiceNumber:'inv-cross'}));
  assert.equal(duplicate.code,'DUPLICATE_ORDER_INVOICE');
  assert.equal(duplicate.matchingOrderId,id);
  const otherInvoice=log(r,'other',{supplier,dept});
  const conflict=r.api.saveOrderInvoiceEvidence({id,expectedVersion:version(r,id),invoiceNumber:'INV-other'});
  assert.equal(conflict.code,'DUPLICATE_ORDER_INVOICE');
  assert.equal(conflict.matchingOrderId,otherInvoice);
  assert.equal(row(r,id)[cols(r).invoiceNumberIndex],invoiceNumber);
  r.sheets.Users.rows[2][6]=true;
  r.setActor(account('staff'));
  const hiddenMatch=r.api.saveOrderInvoiceEvidence({id,expectedVersion:version(r,id),invoiceNumber:'INV-other'});
  assert.equal(hiddenMatch.code,'DUPLICATE_ORDER_INVOICE');
  assert.equal(hiddenMatch.matchingOrderId,undefined,'Duplicate protection never links to a hidden invoice');
}

{
  const r=runtime(), id='PERF-0', before=row(r,id);
  const correction={department:before[1],supplier:before[4],link:before[5],description:before[6],
    code:before[7],quantity:before[8],unitPrice:before[9],location:'Prep'};
  const saved=r.api.updateOrder(id,'',24,'',null,correction,version(r,id),[],false,'');
  assert(saved.saved,saved.message);
  assert.equal(row(r,id)[11],'Prep');
  assert.equal(row(r,id)[cols(r).reportingSiteIndex],'Senior','Changing the delivery location does not reclassify historic spend');
}

{
  const r=runtime(), id='PERF-0';
  assert.equal(returnSave(r,id,'refund',{...refund,refundReference:''}).code,'REFUND_EVIDENCE_REQUIRED');
  const saved=returnSave(r,id,'refund',refund);
  assert(saved.saved,saved.message);
  assert.equal(row(r,saved.creditId)[15],-10);
  assert.equal(row(r,saved.creditId)[cols(r).invoiceNumberIndex],refund.refundReference);
  assert.equal(recordInfo(r,id).remaining,14);
  const actions = r.api.getOrderRecordActions_(r.api.getUserContext(),row(r,id),cols(r));
  assert.equal(actions.canAddEvidence,true,'Finance may add evidence to a refund-locked order');
  assert.equal(actions.canCorrect,false);
  assert.equal(r.api.getOrderRecordActions_({...r.api.getUserContext(),isPreview:true},row(r,id),cols(r)).canAddEvidence,false);
  assert.equal(r.api.getOrderRecord(id).returnInfo.canOpenCredits,true);
  r.sheets.Users.rows[2][6]=true;
  r.setActor(account('staff'));
  assert.equal(r.api.getOrderRecord(id).returnInfo.canOpenCredits,false,'An order processor cannot open the hidden Invoice credit');
  assert.throws(()=>r.api.getOrderRecord(saved.creditId),/access denied/i);
  const denied=returnSave(r,saved.creditId,'mark',{note:'An unavailable invoice'});
  assert.equal(denied.code,'PURCHASE_UNAVAILABLE');
  r.setActor(account('admin'));
  assert.equal(returnSave(r,id,'refund',refund).code,'DUPLICATE_INVOICE');

  const reverse={creditId:saved.creditId,note:'Correcting a wrongly recorded amount',reopenReturn:true};
  r.setActor(account('finance'));
  assert.equal(returnSave(r,id,'reverse',reverse).saved,false);
  r.setActor(account('admin'));
  assert.equal(returnSave(r,id,'reverse',{...reverse,note:''}).saved,false);
  const parentVersion=version(r,id);
  const reversed=returnSave(r,id,'reverse',reverse);
  assert(reversed.saved,reversed.message);
  assert.equal(row(r,saved.creditId)[15],-10);
  assert.equal(row(r,reversed.reversalId)[15],10);
  assert.equal(recordInfo(r,reversed.reversalId).adjustmentKind,'reversal');
  assert.equal(recordInfo(r,reversed.reversalId).creditId,saved.creditId);
  assert.equal(recordInfo(r,id).refunded,0);
  assert.equal(recordInfo(r,id).remaining,24);
  assert.equal(recordInfo(r,id).pending,true);
  assert.equal(r.api.saveOrderReturn({id,expectedVersion:parentVersion,action:'reverse',...reverse}).code,'ORDER_CHANGED');
  assert.equal(returnSave(r,id,'reverse',reverse).saved,false);
  assert.equal(update(r,id,99).saved,false,'Reversal does not unlock financial history');
  assert(returnSave(r,id,'refund',{...refund,amount:'7.50',keepPending:true}).saved,'The corrected refund can reuse the supplier reference on the original purchase');
  assert.equal(recordInfo(r,id).remaining,16.50);
  const exported=r.api.getOrderExportPage({query:{department:'Science',returnsOnly:true}}).orders.find(item=>item.id===id);
  assert.equal(exported.returnInfo.refunded,7.50);
  assert.equal(exported.returnInfo.refunds[0].reversalId,reversed.reversalId);
  assert.equal(exported.returnInfo.history,undefined);
  assert.equal(exported.returnInfo.refunds[0].reference,undefined);
  assert.equal(exported.approvalStatus,'NOT_REQUIRED');
  assert.equal(exported.reportingDate,'01/07/2026');
  const mapped=formatExport(r.api.getOrderExportPage({mode:'master'}).orders);
  const parentLine=mapped.find(item=>item['Order Reference']===id);
  const creditLine=mapped.find(item=>item['Order Reference']===saved.creditId);
  const reversalLine=mapped.find(item=>item['Order Reference']===reversed.reversalId);
  assert.equal(parentLine['Original Purchase Cost'],24);
  assert.equal(parentLine['Refunded Total'],7.50);
  assert.equal(parentLine['Net Purchase Cost'],16.50);
  assert.equal(parentLine['Reversals'],reversed.reversalId);
  assert.equal(creditLine['Original Purchase'],id);
  assert.equal(creditLine.Cost,-10);
  assert.equal(reversalLine['Record Type'],'Refund reversal');
  assert.equal(reversalLine['Reversed Credit'],saved.creditId);
  assert.equal(reversalLine.Cost,10);
  assert.equal(reversalLine['Original Purchase Cost'],'','Child adjustments have no duplicated parent balances');
  const siteForm = () => ({id,expectedVersion:version(r,id),reportingSite:'Prep',reason:'Supplier confirmed this purchase belongs to Prep'});
  r.setActor(account('staff'));
  assert.equal(r.api.savePurchaseReportingSite(siteForm()).saved,false);
  r.setActor(account('finance'));
  assert.equal(r.api.savePurchaseReportingSite({...siteForm(),reason:''}).saved,false);
  assert.equal(r.api.savePurchaseReportingSite({...siteForm(),id:saved.creditId,expectedVersion:version(r,saved.creditId)}).saved,false);
  const records = r.sheets.Orders.getDataRange().getValues();
  const linkedIds = [id,saved.creditId,reversed.reversalId,records.at(-1)[0]];
  const signed = linkedIds.map(reference=>row(r,reference)[15]);
  assert(r.api.savePurchaseReportingSite(siteForm()).saved);
  assert.deepEqual(linkedIds.map(reference=>row(r,reference)[15]),signed);
  assert(linkedIds.every(reference=>row(r,reference)[cols(r).reportingSiteIndex]==='Prep'));
  const invoice=log(r,'site-invoice',{reportingSite:'Unassigned'});
  const invoiceVersion=version(r,invoice);
  assert(r.api.savePurchaseReportingSite({id:invoice,expectedVersion:invoiceVersion,reportingSite:'Senior',reason:'Allocate legacy site'}).saved);
  assert.equal(row(r,invoice)[cols(r).reportingSiteIndex],'Senior');
  assert.equal(row(r,invoice)[13],'','Site correction does not process an invoice');
  assert.equal(r.api.savePurchaseReportingSite({id:invoice,expectedVersion:invoiceVersion,reportingSite:'Prep',reason:'Stale attempt'}).code,'ORDER_CHANGED');
}

{
  const r=runtime(), id='PERF-0', before=JSON.stringify(row(r,id));
  const saved=returnSave(r,id,'refund',refund);
  assert(saved.saved);
  const rowsAfterCredit=JSON.stringify(r.sheets.Orders.rows);
  r.api.appendOrderFieldChanges_=()=>{throw Error('Synthetic audit failure');};
  assert.throws(()=>returnSave(r,id,'reverse',{creditId:saved.creditId,note:'Fault test'}),/Synthetic audit failure/);
  assert.equal(JSON.stringify(r.sheets.Orders.rows),rowsAfterCredit);
  assert.notEqual(JSON.stringify(row(r,id)),before);
}

{
  const r=runtime(), id='PERF-0', supplier=row(r,id)[4];
  const standalone=log(r,'standalone-credit',{supplier,cost:'-10.00',invoiceNumber:''});
  const repeated=r.api.logInvoice(makeInvoice('standalone-credit-repeat',{supplier,cost:'-10.00',invoiceNumber:''}));
  assert.equal(repeated.code,'POSSIBLE_DUPLICATE_INVOICE');
  assert.equal(repeated.matchingOrderId,standalone);
  const trashed=[];
  r.api.uploadFileToDrive_=()=>({fileId:'synthetic-evidence',url:'https://example.com/refund-evidence'});
  r.api.trashUploadedFiles_=ids=>trashed.push(...ids);
  const evidence={...refund,refundReference:'',files:[{name:'credit.pdf',type:'application/pdf',data:'dGVzdA=='}]};
  const warning=returnSave(r,id,'refund',evidence);
  assert.equal(warning.code,'POSSIBLE_DUPLICATE_REFUND');
  assert.equal(warning.matchingOrderId,standalone);
  assert(trashed.includes('synthetic-evidence'),'Definite refusal cleans up the staged upload');
  const accepted=returnSave(r,id,'refund',{...evidence,duplicateConfirmation:warning.duplicateConfirmation});
  assert(accepted.saved,accepted.message);
  assert.match(row(r,accepted.creditId)[19],/refund-evidence/);
}

console.log('Finance usability passed: explicit processing, signed and zero amounts, processor attribution, reporting site, exact duplicates, evidence-only append, refund evidence, Admin atomic reversal, and compact export.');
