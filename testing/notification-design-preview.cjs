// Offline design review: real server templates and workflows, synthetic data,
// mocked MailApp. This cannot send email or read a hosted spreadsheet.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const {createRuntime}=require('./performance-fixtures.cjs');
const source=path.resolve(__dirname,'../Code.js'),code=fs.readFileSync(source,'utf8');
const out=path.resolve(__dirname,'../output/email-polish-20261105/previews');fs.mkdirSync(out,{recursive:true});
const all=[];
function runtime(){
 const r=createRuntime(source,4);r.messages=[];
 for(const [start,end] of [['function buildNotificationWarning_(', 'function getConfigurationHeaderIndex_('],['function sendEmailAlert_(', 'function uploadFileToDrive_(']])vm.runInContext(code.slice(code.indexOf(start),code.indexOf(end,code.indexOf(start))),r.api);
 r.api.developmentNotificationsSuppressed_=()=>false;r.api.getDevelopmentNotificationEmail_=()=>'';
 r.api.MailApp={sendEmail:message=>r.messages.push(message)};
 r.sheets.Users.rows[0].push('Processing Departments');r.sheets.Users.rows[3][8]='Science';
 r.sheets.Orders.rows[1][6]='Laptop docking station for the shared teaching desk';
 return r;
}
function scenario(name,action){const r=runtime();action(r);assert(r.messages.length,name+' emitted no previews');r.messages.forEach((m,i)=>all.push({...m,name:name+(r.messages.length>1?' '+(i+1):'')}));}
const request={selectedDept:'Science',supplier:'Synthetic School Supplies',desc:'Replacement classroom display adapter',qty:2,unitPrice:12.5,location:'Senior',files:[]};
const invoice={dept:'Science',supplier:'Synthetic supplier',desc:'Classroom supplies paid by card',cost:12.5,invoiceNumber:'INV-DEMO-0123',paymentMethod:'Credit card',reportingSite:'Prep',files:[]};
scenario('New request - Finance and budget processor',r=>{r.setActor('staff@claremontschool.co.uk');assert(r.api.submitOrder(request).saved);});
scenario('Over-budget request',r=>{r.sheets.Budgets.rows[1][3]=1;r.setActor('staff@claremontschool.co.uk');assert(r.api.submitOrder(request).saved);});
scenario('Requester edits own pending request',r=>{r.setActor('staff@claremontschool.co.uk');assert(r.api.submitOrder({...request,id:'PERF-2',desc:'Updated classroom display adapter'}).saved);});
scenario('Already ordered',r=>{assert(r.api.submitOrder({...request,alreadyOrdered:true,finalCost:27.5,paymentMethod:'Credit card',deliveryDate:'2026-11-12'}).saved);});
scenario('Order marked as ordered',r=>{assert(r.api.updateOrder('PERF-1','2026-11-12',25,'','','',undefined,[],false,'Credit card').saved);});
scenario('Request cancelled',r=>{assert(r.api.userCancelOrder('PERF-2','No longer needed; a spare is available.').saved);});
scenario('Staff note to Finance',r=>{r.setActor('staff@claremontschool.co.uk');r.api.addNote('PERF-2','Please deliver to the Science office.\nThe room is locked after 4 pm.');});
scenario('Finance note to requester',r=>r.api.addNote('PERF-2','The supplier expects delivery on Thursday.\nPlease confirm that this still works.'));
scenario('Invoice logged',r=>{assert(r.api.logInvoice(invoice).saved);});
scenario('Credit note logged',r=>{assert(r.api.logInvoice({...invoice,cost:-12.5,invoiceNumber:'CREDIT-DEMO-1'}).saved);});
scenario('Invoice processed',r=>{assert(r.api.logInvoice(invoice).saved);r.messages=[];const row=r.sheets.Orders.rows.at(-1);assert(r.api.processInvoice({id:row[0],expectedVersion:r.api.orderVersion_(row)}).saved);});
scenario('Bulk order confirmation',r=>{assert(r.api.bulkFinalizeOrders(['PERF-1','PERF-2'].map(id=>({id,quantity:1,finalPrice:25,expectedDate:'2026-11-12',paymentMethod:'Credit card'}))).success);});
scenario('Invoice review query',r=>{r.setActor('head@claremontschool.co.uk');assert(r.api.logInvoice(invoice).saved);r.messages=[];r.setActor('admin@claremontschool.co.uk');assert(r.api.reviewOrderApproval(r.sheets.Orders.rows.at(-1)[0],'QUERY','Please attach the itemised invoice.').saved);});
scenario('Invoice review approval',r=>{r.setActor('head@claremontschool.co.uk');assert(r.api.logInvoice(invoice).saved);r.messages=[];r.setActor('admin@claremontschool.co.uk');assert(r.api.reviewOrderApproval(r.sheets.Orders.rows.at(-1)[0],'APPROVE','Checked against receipt.').saved);});
scenario('Independent review requested',r=>{r.setActor('head@claremontschool.co.uk');assert(r.api.submitOrder({...request,alreadyOrdered:true,finalCost:25,paymentMethod:'Credit card'}).saved);});
scenario('Missing legacy estimate',r=>{const data=r.api.extractOrderData_(r.sheets.Orders.rows[2],r.api.getOrdersMetadataColumnsForRead_(r.sheets.Orders));data.totalPrice='';data.finalPrice='';r.api.sendEmailAlert_('staff@example.com','New note: legacy request',r.api.formatEmailBody_('New Note Added','A note was added to this legacy request.',data));});
scenario('Budget transfer',r=>assert(r.api.createBudgetTransfer({fromDept:'Science',toDept:'English',amount:100}).saved));
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
all.forEach((m,i)=>{m.file=String(i+1).padStart(2,'0')+'.html';fs.writeFileSync(path.join(out,m.file),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(m.name)+'</title><div style="background:#e9eef6;padding:12px;font:14px Arial"><b>Offline synthetic preview</b><br>'+esc(m.name)+'<br><b>Subject:</b> '+esc(m.subject)+'<br><b>To:</b> '+esc(m.to)+'</div>'+m.htmlBody);});
// Explicit theme previews exercise the exact light/dark CSS branches without
// depending on the desktop's current preference. Production uses the media query.
all.forEach(m=>{
 const label='<div style="padding:12px;background:#e9eef6;color:#25334d;font:14px Arial"><b>DEV TEST — synthetic example; no real purchase</b><br>'+esc(m.name)+'</div>';
 const page=m.htmlBody.replace('<body ', '<body ').replace(/(<body[^>]*>)/, '$1'+label);
 fs.writeFileSync(path.join(out,m.file),page);
 fs.writeFileSync(path.join(out,m.file.replace('.html','-dark.html')),page.replace('@media(prefers-color-scheme:dark)','@media all'));
 fs.writeFileSync(path.join(out,m.file.replace('.html','-light.html')),page.replace('@media(prefers-color-scheme:dark)','@media not all'));
 fs.writeFileSync(path.join(out,m.file.replace('.html','.txt')),m.body);
});
assert(all.every(m=>m.body && m.htmlBody.includes('color-scheme')));
assert(all.find(m=>m.name==='Credit note logged').htmlBody.includes('−£12.50'));
assert(all.find(m=>m.name==='Missing legacy estimate').htmlBody.includes('Not recorded'));
assert(!all.find(m=>m.name==='Requester edits own pending request').htmlBody.includes('ordering team updated'));
assert(all.find(m=>m.name==='Invoice review query').subject.includes('Invoice'));
assert(all.find(m=>m.name==='Staff note to Finance').htmlBody.includes('office.<br>The room'));
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Notification design review</title><body style="font:16px/1.6 Arial;margin:24px"><h1>Notification design review</h1><p>Current DEV templates. Synthetic data; no emails sent.</p><ol>'+all.map(m=>'<li><a href="'+m.file+'">'+esc(m.name)+'</a></li>').join('')+'</ol></body>');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(all.map(({name,file,subject,to})=>({name,file,subject,to})),null,2));
console.log('Generated '+all.length+' offline previews from server workflows; no emails sent.');
