const fs=require('fs'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'reliability-browser.cjs'),'utf8');
const prefix=source.slice(0,source.indexOf(' try {\n const c=await context();'));
if(!prefix.endsWith('\n'))throw Error('Harness boundary not found');
const tests=String.raw`
 try {
 const evidence={};
 for(const kind of ['order','invoice']){
  const c=await context();const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/after/Index.html?count=100&role=Admin');await p.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
  let originalId,interrupted=false,creates=0;
  await p.route('**/rpc?**',async route=>{const body=route.request().postDataJSON();
   if(body.name===(kind==='order'?'submitOrder':'logInvoice')){creates++;originalId=body.args[0].clientRequestId;
    if(!interrupted){interrupted=true;await route.fetch();await route.abort('failed');return;}}
   await route.continue();
  });
  await p.evaluate(kind=>{if(kind==='order'){resetOrderForm_();document.getElementById('formSupplier').value='Browser recovery';document.getElementById('formDesc').value='Lost reply';document.getElementById('formQty').value='1';document.getElementById('formUnit').value='5';calcTotal();sendOrder();}
   else{document.getElementById('invDept').value='Science';document.getElementById('invSupplier').value='Browser recovery';document.getElementById('invDesc').value='Lost invoice reply';document.getElementById('invCost').value='5';document.getElementById('invInvoiceNumber').value='';saveLogInvoice(true);}},kind);
  await p.waitForFunction(kind=>kind==='order'?!orderSubmitBusy:!invoiceSubmitBusy,kind);
  assert(interrupted);assert(originalId);
  await p.reload();await p.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
  assert.equal(await p.evaluate(kind=>pendingCreate_(kind)?.id,kind),originalId);
  assert.equal(await p.locator('#saveRecoveryNotice').isVisible(),true);
  await p.evaluate(kind=>kind==='order'?sendOrder():saveLogInvoice(true),kind);
  await p.waitForFunction(kind=>!pendingCreate_(kind),kind);
  assert.equal(creates,1,'Recovery must not create a replacement');
  assert.match(await p.locator('#msgModal').innerText(),/Save confirmed|original/);
  assert.deepEqual(errors,[]);evidence[kind]={reloadRecovered:true,createCalls:creates};await c.close();
 }
 const c=await context();const p=await c.newPage();await p.clock.install();
 await p.goto(base+'/after/Index.html?count=100&role=Admin');await p.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
 await p.evaluate(()=>{window.__calls=[];window.google={script:{get run(){let ok,fail;const proxy=new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>{ok=f;return proxy;};if(k==='withFailureHandler')return f=>{fail=f;return proxy;};return(...args)=>window.__calls.push({name:k,args,ok,fail});}});return proxy;}}};
  openFinance(globalData.orders.find(o=>o.status==='Pending').id);saveFinance();saveFinance();});
 await p.clock.fastForward(46000);
 assert.equal(await p.locator('#overlay').evaluate(e=>e.style.display),'none');
 assert.equal(await p.evaluate(()=>window.__calls.filter(c=>c.name==='updateOrder').length),1);
 const financeLateIgnored=await p.evaluate(()=>{let applied=0;window.showSavedResult_=()=>applied++;window.__calls.find(c=>c.name==='updateOrder').ok({success:true,saved:true});return applied===0;});assert(financeLateIgnored);
 await p.evaluate(()=>{const o=globalData.orders.find(o=>o.status==='Pending');o.detailsDeferred=false;openNotes(o.id);document.getElementById('newNoteText').value='Timeout note';sendNote();});
 await p.clock.fastForward(46000);assert.equal(await p.locator('#btnSendNote').isEnabled(),true);
 assert(await p.evaluate(()=>window.__calls.find(c=>c.name==='addNote').args[2]));
 evidence.financeAndNotes={releasedAfter45Seconds:true,lateReplyIgnored:financeLateIgnored};await c.close();
 const d=await context();const q=await d.newPage();await q.clock.install();
 await q.goto(base+'/after/configuration.html?count=100&role=Admin');await q.waitForFunction(()=>document.getElementById('workspace').style.display==='block');
 await q.evaluate(()=>{window.__calls=[];window.google={script:{get run(){let ok;const proxy=new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>{ok=f;return proxy;};if(k==='withFailureHandler')return()=>proxy;return(...args)=>window.__calls.push({name:k,args,ok});}});return proxy;}}};openUserDraft('staff@claremontschool.co.uk');document.getElementById('userDefaultSite').value='Prep';executeUserSave();});
 await q.clock.fastForward(46000);assert.equal(await q.evaluate(()=>configState.saving),false);assert.equal(await q.locator('#saveUserButton').isEnabled(),true);
 assert.match(await q.locator('#configurationToastMessage').innerText(),/unknown.*Reload/);
 await q.evaluate(()=>window.__calls.find(c=>c.name==='saveAdminUserConfiguration').ok(JSON.stringify({success:true,message:'LATE CALLBACK MUST BE IGNORED'})));
 assert.doesNotMatch(await q.locator('#configurationToastMessage').innerText(),/LATE CALLBACK/);
 evidence.admin={releasedAfter45Seconds:true,lateReplyIgnored:true};await d.close();
 fs.writeFileSync(path.join(output,'recovery-browser-results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
 } finally {await browser.close();await assetRequest.dispose();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
`;
fs.writeFileSync(path.join(__dirname,'create-recovery-browser.cjs'),prefix+tests);
