const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const {createRuntime}=require('./performance-fixtures.cjs');
const {chromium,request}=require('playwright');
const root=path.resolve(__dirname,'..'), baseline=process.env.PORTAL_PERFORMANCE_BASELINE_DIR || root;
const output=process.env.PORTAL_TEST_OUTPUT || path.resolve(root,'output/browser');fs.mkdirSync(output,{recursive:true});
const runtimes=new Map();
const adapter=`window.google={script:{get run(){let ok,fail;const p=new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>{ok=f;return p;};if(k==='withFailureHandler')return f=>{fail=f;return p;};return(...args)=>{const q=new URLSearchParams(location.search);window.__lastRpcStarted=performance.now();fetch('/rpc?variant='+location.pathname.split('/')[1]+'&count='+(q.get('count')||100)+'&role='+(q.get('role')||'Admin'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:k,args})}).then(r=>r.json()).then(result=>{window.__lastRpcFinished=performance.now();window.__lastResponseBytes=JSON.stringify(result).length;if(result.fixtureError){if(fail)fail({message:result.fixtureError});}else if(ok)ok(result);}).catch(e=>fail&&fail(e));};}});return p;}}};`;
function runtime(variant,count,role){const key=[variant,count,role].join(':');if(!runtimes.has(key)){const rt=createRuntime(path.join(variant==='before'?baseline:root,'Code.js'),count);const email={Admin:'admin',Staff:'staff',Head:'head',Wipro:'finance'}[role]+'@claremontschool.co.uk';rt.setActor(email);runtimes.set(key,rt);}return runtimes.get(key);}
const server=http.createServer(async(req,res)=>{
 try{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/rpc'){let body='';for await(const chunk of req)body+=chunk;const {name,args}=JSON.parse(body);const rt=runtime(u.searchParams.get('variant'),+u.searchParams.get('count'),u.searchParams.get('role'));if(typeof rt.api[name]!=='function')throw Error('Unsupported fixture RPC '+name);const result=rt.api[name](...args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
 if(u.pathname.endsWith('/local-mock.js')){res.setHeader('Content-Type','text/javascript');res.end(adapter);return;}
 const [_,variant,file]=u.pathname.split('/');if(!['before','after'].includes(variant)||!['Index.html','dashboard.html','configuration.html'].includes(file)){res.statusCode=404;res.end();return;}
 let source=fs.readFileSync(path.join(variant==='before'?baseline:root,file),'utf8');
 source=source.replace(/<\?!= includePortalStyles_\('(SharedPolish|SharedDropdowns|PortalClientContext)'\); \?>/g,(_,name)=>fs.readFileSync(path.join(variant==='before'?baseline:root,name+'.html'),'utf8'));
 if(file!=='Index.html')source=source.replace('<head>','<head><script>'+adapter+'</script>');
 res.setHeader('Content-Type','text/html');res.end(source);
 }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({fixtureError:e.message}));}
});
function summary(values){const sorted=[...values].sort((a,b)=>a-b);return {median:+((sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2).toFixed(1),slowest:+sorted.at(-1).toFixed(1)};}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const assets=new Map();
 const assetRequest=await request.newContext();
 async function context(options={}){const c=await browser.newContext({viewport:{width:1440,height:1000},...options});
  await c.route(/^https:\/\//,async route=>{try {const url=route.request().url();if(url.includes('cloudflareinsights.com')){await route.abort();return;}if(!assets.has(url)){const response=await assetRequest.get(url);assets.set(url,{body:await response.body(),contentType:response.headers()['content-type']});}await route.fulfill(assets.get(url));}catch(e){if(!c.pages().length)return;await route.abort().catch(()=>{});}});return c;}


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
