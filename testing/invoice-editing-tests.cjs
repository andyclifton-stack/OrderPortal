const assert=require('assert'), fs=require('fs'), path=require('path'),vm=require('vm');
const {createRuntime}=require('./performance-fixtures.cjs');
const source=path.resolve(__dirname,'../Code.js');
function make(options={}) {
 const r=createRuntime(source,4,{strictInputs:true,...options});
 r.api.logError_=()=>{};
 // Restore the real audit implementation: failures must roll back invoice changes too.
 const audit=fs.readFileSync(source,'utf8');
 vm.runInContext(audit.slice(audit.indexOf('function appendOrderFieldChanges_('),audit.indexOf('function collectOrderFieldChanges_(')),r.api);
 assert(r.api.logInvoice({dept:'Science',supplier:'Alphabet',desc:'DEV synthetic',cost:95263246,invoiceNumber:'95263246',paymentMethod:'Credit card',reportingSite:'Unassigned',amountConfirmed:true,files:[],clientRequestId:'edit-test-create'}).saved);
 const id=r.sheets.Orders.rows.at(-1)[0];
 const get=()=>r.api.getDashboardData().orders.find(o=>o.id===id);
 const form=()=>({id,expectedVersion:get().version,dept:'Science',supplier:'Alphabet',desc:'Corrected invoice',cost:'2176.77',invoiceNumber:'95263246',paymentMethod:'Invoice / on account',reason:'Invoice number entered as amount',files:[]});
 return {...r,id,get,form};
}
for(const completed of [false,true]) {
 const r=make();const raw=r.sheets.Orders.rows.at(-1);
 if(completed){raw[13]=new Date('2026-10-19');raw[15]=95263246;raw[22]='finance@claremontschool.co.uk';}
 const preserved=[2,3,13,14,16,20,22,23,24,25,26,27].map(i=>raw[i]);
 const f=r.form(); assert.equal(r.get().actions.canEditInvoice,true);
 assert(r.api.updateInvoice(f).saved);
 const after=r.sheets.Orders.rows.at(-1);
 assert.deepEqual([2,3,13,14,16,20,22,23,24,25,26,27].map(i=>after[i]),preserved);
 assert.equal(after[9],2176.77);assert.equal(after[10],2176.77);assert.equal(after[15],completed?2176.77:'');
 assert.equal(r.get().paymentMethod,'Invoice / on account');
 const summary=r.api.getOverviewDashboardData({summaryOnly:true,period:'All'}).overview;
 assert(completed ? summary.actualSpend >= 2176.77 : summary.pendingValue >= 2176.77);
 const entries=r.sheets['Order Change Audit'].rows;
 assert(entries.some(row=>row[3]==='Total' && row[4]===95263246 && row[5]===2176.77));
 assert(entries.some(row=>row[3]==='Correction reason' && row[5]===f.reason && row[2]==='admin@claremontschool.co.uk'));
 assert.equal(r.api.updateInvoice(f).saved,false,'stale second save rejected');
 assert(r.api.updateInvoice({...r.form(),cost:'-13.45',dept:'English'}).saved);
 assert.equal(r.get().totalPrice,-13.45);assert.equal(r.get().glCode,'ENG');
}
for(const actor of ['staff@claremontschool.co.uk','finance@claremontschool.co.uk','head@claremontschool.co.uk']){
 const r=make(),f=r.form(),before=JSON.stringify(r.sheets.Orders.rows);r.setActor(actor);
 assert.equal(r.api.updateInvoice(f).saved,false);assert.equal(JSON.stringify(r.sheets.Orders.rows),before);
}
for(const bad of [{cost:'0'},{cost:'1.234'},{cost:'1e4'},{cost:'1000000001'},{reason:''},{dept:'Missing'},{paymentMethod:'Cash'},{expectedVersion:''}]){
 const r=make(),before=JSON.stringify(r.sheets.Orders.rows);
 assert.equal(r.api.updateInvoice({...r.form(),...bad}).saved,false,JSON.stringify(bad));assert.equal(JSON.stringify(r.sheets.Orders.rows),before);
}
{
 const r=make();let uploads=0,trashed=[];
 r.api.uploadFileToDrive_=()=>({fileId:'synthetic-file-'+(++uploads),url:'https://drive.google.com/file/d/test/view'});
 r.api.trashUploadedFiles_=ids=>trashed.push(...ids);
 const f={...r.form(),files:[{name:'test.txt',data:'dGVzdA==',type:'text/plain'}]};
 assert(r.api.updateInvoice(f).saved);
 assert(r.get().attachment.includes('https://drive.google.com/file/d/test/view'));
 assert.equal(trashed.length,0);
 assert.equal(r.api.updateInvoice(f).saved,false); // Stale before upload: no orphan.
 assert.equal(uploads,1);
 assert.equal(r.api.updateInvoice({...r.form(),reason:'',files:f.files}).saved,false);
 assert.deepEqual(trashed,['synthetic-file-2']);
}
{
 const r=make();assert.equal(r.api.updateInvoice({...r.form(),cost:'95263246'}).code,'INVOICE_AMOUNT_WARNING');
 assert(r.api.updateInvoice({...r.form(),cost:'95263246',amountConfirmed:true}).saved);
 assert.equal(r.api.updateInvoice({...r.form(),cost:'100000'}).code,'INVOICE_AMOUNT_WARNING');
 const old=r.sheets.Orders.rows.at(-1);old[20]='Order';assert.equal(r.api.updateInvoice(r.form()).saved,false);
 old[20]='Invoice';
 old[6]='CANCELLED - synthetic'; old[15]=0;
 assert.equal(r.get().actions.canEditInvoice,false);
 assert.equal(r.api.updateInvoice(r.form()).saved,false);
}
{
 const r=make();r.api.appendOrderFieldChanges_=()=>{throw Error('Audit unavailable');};
 const before=JSON.stringify(r.sheets.Orders.rows);assert.throws(()=>r.api.updateInvoice(r.form()),/Audit unavailable/);
 assert.equal(JSON.stringify(r.sheets.Orders.rows),before);
}
{
 const r=make();r.api.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('Failed atomic commit');};
 const before=JSON.stringify(r.sheets.Orders.rows);assert.throws(()=>r.api.updateInvoice(r.form()),/SAVE_STATUS_UNKNOWN/);
 assert.equal(JSON.stringify(r.sheets.Orders.rows),before);
}
{
 const r=make();const f={dept:'Science',supplier:'New supplier',desc:'Check warning',cost:123456,invoiceNumber:'123456',paymentMethod:'Credit card',reportingSite:'Unassigned',files:[],clientRequestId:'warn-create'};
 assert.equal(r.api.logInvoice(f).code,'INVOICE_AMOUNT_WARNING');assert(r.api.logInvoice({...f,amountConfirmed:true}).saved);
 assert.equal(r.api.updateInvoice({...r.form(),supplier:'New supplier',invoiceNumber:'123456'}).saved,false,'duplicate supplier/ref rejected');
}
const html=fs.readFileSync(path.resolve(__dirname,'../Index.html'),'utf8');
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(!script[1].includes('<?'))new vm.Script(script[1]);
assert(html.includes("item('Edit invoice', 'bi-pencil-fill', 'openInvoiceEditor')"));
assert(html.includes('id="detailsEditInvoice"'));
{
 const r=make();vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../AmazonDevelopment.js'),'utf8'),r.api);
 r.setDevelopment(false);assert.throws(()=>r.api.invoiceEditingDevEvidencePage_(),/DEV only/);
}
console.log('Invoice editor: pending/processed preservation, audited before/after values and reason, Admin-only permission, stale/missing versions, credit notes, department/GL, payment, duplicate references, warning confirmation, validation, atomic/audit failures and UI syntax passed.');
