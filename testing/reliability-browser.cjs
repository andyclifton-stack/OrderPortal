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
 const c=await context();const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/after/Index.html?count=100&role=Admin');
 await p.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
 const result=await p.evaluate(async()=>{
  const out={};const field=id=>document.getElementById(id);
  out.cleanStart=!hasUnsavedInput_();resetOrderForm_();out.cleanReset=!hasUnsavedInput_();
  field('formSupplier').value='Draft supplier';field('formDesc').value='Draft description';field('formQty').value='2';field('formUnit').value='5';
  prepareNewOrderForm();out.draft=field('formSupplier').value==='Draft supplier';
  field('invSupplier').value='Invoice draft';prepLogInvoiceTab();out.invoiceDraft=field('invSupplier').value==='Invoice draft';
  out.zero=getOrderCost_({finalPrice:0,totalPrice:99})===0;
  const dept=field('formDept').value;globalData.budgets[dept].remaining=0;calcTotal();
  out.budgetWarning=field('budgetWarning') ? field('budgetWarning').style.display === 'block' : document.body.innerText.includes('over budget');
  const calls=[];window.google={script:{get run(){let ok,fail;const proxy=new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>{ok=f;return proxy;};if(k==='withFailureHandler')return f=>{fail=f;return proxy;};return(...args)=>calls.push({name:k,args,ok,fail});}});return proxy;}}};
  sendOrder();sendOrder();field('formQty').value='9';
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const saves=calls.filter(v=>v.name==='submitOrder');out.single=saves.length===1;out.snapshot=saves[0]?.args[0].qty==='2';
  const key=saves[0]?.args[0].clientRequestId;out.key=!!key;
  saves[0]?.ok({success:false,saved:false,message:'Validation test'});
  sendOrder();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  out.retryKey=calls.filter(v=>v.name==='submitOrder').at(-1)?.args[0].clientRequestId===key;
  calls.filter(v=>v.name==='submitOrder').at(-1)?.ok({success:true,saved:true,message:'Saved'});
  out.cleared=field('formSupplier').value==='';
  field('invDept').value=dept;field('invSupplier').value='Invoice supplier';field('invDesc').value='Invoice description';field('invCost').value='5';
  saveLogInvoice(true);saveLogInvoice(true);await Promise.resolve();await Promise.resolve();await Promise.resolve();
  out.oneInvoice=calls.filter(v=>v.name==='logInvoice').length===1;
  calls.filter(v=>v.name==='logInvoice')[0]?.ok({success:true,saved:true,message:'Saved'});
  return out;
 });
 for(const [name,passed] of Object.entries(result))assert.equal(passed,true,name);
 assert.deepEqual(errors,[]);await c.close();
 console.log('Browser reliability: draft preservation, zero actual cost, zero-budget warning, double-click guards, immutable submission, stable retry identifier and successful form reset passed.');
 const d=await context();const page=await d.newPage();
 await page.goto(base+'/after/dashboard.html?count=100&role=Admin');
 await page.waitForFunction(()=>document.getElementById('dashboardWorkspace').style.display==='block');
 assert.equal(await page.evaluate(()=>csvCell_('=1+1')), String.fromCharCode(34,39)+'=1+1'+String.fromCharCode(34));
 assert.equal(await page.evaluate(()=>csvCell_(-50)), '"-50"');
 assert.equal(await page.evaluate(()=>csvCell_('Acme #1, ltd')), '"Acme #1, ltd"');
 await d.close();console.log('CSV formula and special-character handling passed.');
 const recovery=await context();const rp=await recovery.newPage();await rp.clock.install();
 await rp.goto(base+'/after/Index.html?count=100&role=Admin');
 await rp.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
 const target=await rp.evaluate(()=>String(globalData.orders.find(order=>order.actions.canEdit).id));
 await rp.evaluate(id=>openNotes(id),target);
 await rp.waitForFunction(()=>document.getElementById('chatHistory').innerText.includes('Test note'));
 const draft=await rp.evaluate(id=>{
  let confirm;window.showConfirm=(title,msg,callback)=>{confirm=callback;};
  resetOrderForm_();document.getElementById('formDesc').value='Keep my draft';
  duplicateOrder(id);const duplicateProtected=!!confirm&&document.getElementById('formDesc').value==='Keep my draft';
  confirm=null;editOrder(id);const editProtected=!!confirm&&document.getElementById('formDesc').value==='Keep my draft';
  confirm();return {duplicateProtected,editProtected,accepted:document.getElementById('formDesc').value!=='Keep my draft'};
 },target);assert.deepEqual(draft,{duplicateProtected:true,editProtected:true,accepted:true});
 await rp.evaluate(()=>{
  window.__transferCalls=[];window.google={script:{get run(){let ok,fail;const proxy=new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>{ok=f;return proxy;};if(k==='withFailureHandler')return f=>{fail=f;return proxy;};return(...args)=>window.__transferCalls.push({name:k,args,ok,fail});}});return proxy;}}};
  openBudgetTransfer();document.getElementById('transferFromDept').value='Science';document.getElementById('transferToDept').value='English';document.getElementById('transferAmount').value='1';saveBudgetTransfer();
 });
 await rp.clock.fastForward(46000);
 let status=await rp.evaluate(()=>({overlay:document.getElementById('overlay').style.display,apply:document.getElementById('applyBudgetTransferBtn').textContent,cancel:document.getElementById('cancelBudgetTransferBtn').disabled,pending:pendingTransfer_(),calls:window.__transferCalls.length}));
 assert.equal(status.overlay,'none');assert.equal(status.cancel,false);assert.match(status.apply,/Check/);assert.equal(status.calls,1);
 const requestId=status.pending.clientRequestId;
 await rp.evaluate(()=>{openBudgetTransfer();saveBudgetTransfer();});
 assert.equal(await rp.evaluate(()=>window.__transferCalls.at(-1).name),'getBudgetTransferStatus');
 assert.equal(await rp.evaluate(()=>pendingTransfer_().clientRequestId),requestId);
 await rp.reload();await rp.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
 assert.equal(await rp.evaluate(()=>pendingTransfer_().clientRequestId),requestId,'Uncertain transfer survives reload');
 await rp.evaluate(()=>openBudgetTransfer());assert.match(await rp.locator('#applyBudgetTransferBtn').textContent(),/Check/);
 await recovery.close();console.log('Browser second pass: lazy notes, draft replace confirmation, stalled transfer recovery, stable request identity and reload persistence passed.');
 for(const file of ['configuration.html','dashboard.html']){
  const e=await context();const page=await e.newPage();await page.clock.install();
  await page.route('**/rpc?**',()=>{});
  await page.goto(base+'/after/'+file+'?count=100&role=Admin');
  await page.clock.fastForward(46000);
  const text=await page.locator('body').innerText();assert.match(text,/taking too long/);
  await e.close();
 }
 console.log('Configuration and Finance stalled-load timeouts passed.');
 } finally {await browser.close();await assetRequest.dispose();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
