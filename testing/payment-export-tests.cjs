const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'Index.html'),'utf8');
  const ctx={console,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'vendor/xlsx.full.min.js'),'utf8'),ctx);
  assert.equal(ctx.XLSX.version,'0.20.1');
  fs.mkdirSync(path.join(root,'output'),{recursive:true});
  const card={id:'PAYMENT-DEV-CARD',dateReq:'01/09/2026',dateOrdered:'25/09/2026',reportingDate:'25/09/2026',reportingSite:'Prep',dept:'Science',glCode:'SCI-DEV',desc:'Card export verification',qty:2,finalPrice:25,supplier:'Test Supplier',paymentMethod:'Credit card',processedBy:'processor@example.com',recordType:'Order',status:'Ordered',approvalStatus:'APPROVED',
    returnInfo:{status:'Refund reversed',original:25,refunded:0,remaining:25,refunds:[{id:'DEV-CREDIT',reversalId:'DEV-REVERSAL'}]}};
  const adjustment={recordType:'Invoice',status:'Processed',financeProcessedBy:'finance@example.com',reportingSite:'Prep',returnInfo:{parentId:card.id}};
  const fixtures=[card,
    {...adjustment,id:'DEV-CREDIT',finalPrice:-10,returnInfo:{...adjustment.returnInfo,adjustmentKind:'refund'}},
    {...adjustment,id:'DEV-REVERSAL',finalPrice:10,returnInfo:{...adjustment.returnInfo,adjustmentKind:'reversal',creditId:'DEV-CREDIT'}}];
  ctx.filteredOrders=fixtures;ctx.globalData={paging:{}};ctx.fetchExportOrders_=async()=>fixtures;ctx.canDo=()=>true;ctx.ensureXlsxLoaded_=()=>Promise.resolve();ctx.getOrderCost_=o=>o.finalPrice;
  ctx.showMsg=(title,msg)=>{throw Error(title+': '+msg);};
  let bytes, filename;
  ctx.XLSX.writeFile=(book,name)=>{filename=name;bytes=ctx.XLSX.write(book,{type:'array',bookType:'xlsx'});};
  vm.runInContext(html.slice(html.indexOf('function isInvoiceOrder('),html.indexOf('function parseOrderMoney(')),ctx);
  vm.runInContext(html.slice(html.indexOf('function formatForExcel('),html.indexOf('let simulationTargets_')),ctx);
  vm.runInContext(html.slice(html.indexOf('async function exportData()'),html.indexOf('function sendNote()',html.indexOf('async function exportData()'))),ctx);
  await ctx.exportData();assert.equal(filename,'Orders_Export.xlsx');
  const book=ctx.XLSX.read(bytes,{type:'array'});const rows=ctx.XLSX.utils.sheet_to_json(book.Sheets.Orders);
  assert.equal(rows.length,3);assert.equal(rows[0]['Payment Method'],'Credit card');assert.equal(rows[0]['GL Code'],'SCI-DEV');assert.equal(rows[0]['Date Ordered'],'25/09/2026');assert.equal(rows[0]['Cost'],25);assert.equal(rows[0]['Processed By'],'processor@example.com');
  assert.equal(rows[0]['Independent Review'],'Approved');assert.equal(rows[0]['Reporting Site'],'Prep');
  assert.equal(rows[0]['Linked Credits'],'DEV-CREDIT');assert.equal(rows[0]['Reversals'],'DEV-REVERSAL');
  assert.equal(rows[1]['Original Purchase'],card.id);assert.equal(rows[1]['Finance Processed By'],'finance@example.com');
  assert.equal(rows[2]['Record Type'],'Refund reversal');assert.equal(rows[2]['Reversed Credit'],'DEV-CREDIT');
  assert.equal(rows.reduce((total,row)=>total+row.Cost,0),25,'Signed refund and reversal cancel without double-counting the net field');
  fs.writeFileSync(process.argv[2] || path.join(root,'output/payment-method-export-example.xlsx'),Buffer.from(bytes));
  console.log('Actual export function and SheetJS workbook round-trip passed, including payment, reporting, review status and signed linked refund/reversal rows.');
})().catch(err=>{console.error(err);process.exitCode=1;});
