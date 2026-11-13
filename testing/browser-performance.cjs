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
 const measurements=[];
 try {
 for (const theme of ['light','dark']) {
  const c=await context();const p=await c.newPage();
  await p.goto(base+'/after/configuration.html?count=100&role=Admin');
  await p.waitForFunction(()=>document.getElementById('workspace').offsetHeight>0);
  await p.evaluate(theme=>{document.documentElement.setAttribute('data-theme',theme);openUserDraft('staff@claremontschool.co.uk');},theme);
  const processing=p.locator('#userCanProcessOrders'), invoices=p.locator('#userCanLogInvoices');
  await processing.check();assert.equal(await invoices.isDisabled(),true);
  await processing.uncheck();await invoices.check();assert.equal(await processing.isDisabled(),true);
  await p.evaluate(()=>{document.getElementById('userCanProcessOrders').checked=true;validateUserDraft();});
  assert.equal(await processing.isEnabled(),true);assert.equal(await invoices.isEnabled(),true);
  assert.equal(await p.locator('#saveUserButton').isDisabled(),true);
  await invoices.uncheck();assert.equal(await p.locator('#saveUserButton').isEnabled(),true);
  await c.close();
 }
 console.log('Exclusive permission controls and legacy-conflict correction passed in light/dark mode.');
 if (!process.env.PORTAL_BROWSER_CHECKS_ONLY) for(const variant of ['before','after'])for(const count of [100,1000,5000]){
  const samples=[];
  for(let i=0;i<10;i++){
   const c=await context();const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base+'/'+variant+'/Index.html?count='+count,{waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>document.getElementById('mainApp').style.display==='block',{timeout:30000});
   const first=await p.evaluate(()=>({usable:performance.getEntriesByName('portal-load-duration').at(-1).duration,firstPaint:performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint')?.startTime||0,initialBytes:window.__lastResponseBytes,firstRpc:window.__lastRpcStarted}));
   const warm=await p.evaluate(async()=>{const t=performance.now();const ok=await loadData({initial:false,preserveState:true,force:true});return {ok,ms:performance.now()-t,bytes:window.__lastResponseBytes};});
   const interactive=await p.evaluate(()=>{stopAutoRefresh_();const t=performance.now();document.getElementById('searchText').value='Synthetic order 9';renderApp(true);const search=performance.now()-t;document.getElementById('searchText').value='';renderApp(true);const pg=performance.now();changePage(1);return {search,page:performance.now()-pg,rows:document.querySelectorAll('#tableBody tr').length};});
   assert.ok(warm.ok);assert.equal(errors.length,0,errors.join('\n'));samples.push({...first,...interactive,warm:warm.ms,warmBytes:warm.bytes});await c.close();
  }
  const report={variant,count,initial:summary(samples.map(s=>s.usable)),firstPaint:summary(samples.map(s=>s.firstPaint)),warm:summary(samples.map(s=>s.warm)),search:summary(samples.map(s=>s.search)),page:summary(samples.map(s=>s.page)),initialBytes:samples[0].initialBytes,warmBytes:samples[0].warmBytes,samples};measurements.push(report);console.log(JSON.stringify({...report,samples:undefined}));
 }
 // Functional browser checks use the same real server functions with synthetic Sheets.
 // Hold data back to inspect the real loading shell independently of server speed.
 for(const width of [1440,390])for(const theme of ['light','dark']){
  const lc=await context({viewport:{width,height:900},reducedMotion:'reduce'});
  await lc.addInitScript(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
  const lp=await lc.newPage();let release;const held=new Promise(r=>release=r);
  await lp.route('**/rpc?**',async route=>{await held;await route.continue();});
  await lp.goto(base+'/after/Index.html?count=100',{waitUntil:'domcontentloaded'});
  await lp.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
  assert.equal(await lp.locator('#skeletonScreen').isVisible(),true);
  assert.equal(await lp.locator('#skeletonScreen .brand-title').textContent(),'Claremont School');
  assert.equal(await lp.locator('#mainApp').isVisible(),false);
  assert.equal(await lp.locator('#skeletonScreen input').isDisabled(),true);
  await lp.keyboard.press('Tab');
  assert.equal(await lp.evaluate(()=>document.activeElement.closest('#skeletonScreen, #mainApp')!==null),false);
  assert.equal(await lp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await lp.screenshot({path:path.join(output,'loading-shell-'+width+'-'+theme+'.png')});
  release();await lp.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
  assert.equal(await lp.locator('#skeletonScreen').isVisible(),false);
  assert.equal(await lp.locator('#searchText').isEnabled(),true);
  await lc.close();
 }
 console.log('Loading shell desktop/mobile, light/dark, keyboard lock and ready transition passed.');
 for(const file of ['dashboard.html','configuration.html'])for(const width of [1440,390]){
  const lc=await context({viewport:{width,height:900},reducedMotion:'reduce'});const lp=await lc.newPage();
  let release;const held=new Promise(r=>release=r);
  await lp.route('**/rpc?**',async route=>{await held;await route.continue();});
  await lp.goto(base+'/after/'+file+'?count=100&role=Admin',{waitUntil:'domcontentloaded'});
  const loading=file==='dashboard.html'?'#dashboardLoading':'#loadingScreen';
  const workspace=file==='dashboard.html'?'#dashboardWorkspace':'#workspace';
  assert.equal(await lp.locator(loading).isVisible(),true);
  assert.equal(await lp.locator(workspace).isVisible(),false);
  await lp.keyboard.press('Tab');
  assert.equal(await lp.evaluate(()=>!!document.activeElement.closest('#workspace,#dashboardWorkspace')),false);
  for(const theme of ['light','dark']){
   await lp.evaluate(theme=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.setAttribute('data-theme',theme);},theme);
   await lp.screenshot({path:path.join(output,'loading-'+file+'-'+width+'-'+theme+'.png')});
  }
  assert.equal(await lp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  release();await lp.locator(workspace).waitFor({state:'visible'});
  assert.equal(await lp.locator(loading).isVisible(),false);await lc.close();
 }
 for(const file of ['dashboard.html','configuration.html']){
  const ec=await context();const ep=await ec.newPage();
  await ep.route('**/rpc?**',route=>route.fulfill({json:{fixtureError:'Synthetic connection failure'}}));
  await ep.goto(base+'/after/'+file+'?count=100&role=Admin');
  await ep.locator(file==='dashboard.html'?'#dashboardLoading [role="alert"]':'#errorScreen').waitFor({state:'visible'});
  assert.equal(await ep.locator(file==='dashboard.html'?'#dashboardWorkspace':'#workspace').isVisible(),false);
  await ec.close();
 }
 console.log('Configuration and Finance loading, responsive themes, keyboard lock, success and failure checks passed.');
 for(const file of ['dashboard.html','configuration.html']){
  const dc=await context();const dp=await dc.newPage();
  await dp.route(file==='dashboard.html'?/cdn.jsdelivr.net\/npm\/chart.js/:/bootstrap@.*bootstrap.bundle.min.js/,route=>route.abort());
  await dp.goto(base+'/after/'+file+'?count=100&role=Admin');
  await dp.locator(file==='dashboard.html'?'#dashboardLoading [role="alert"]':'#errorScreen').waitFor({state:'visible'});
  assert.equal(await dp.locator(file==='dashboard.html'?'#dashboardWorkspace':'#workspace').isVisible(),false);
  await dc.close();
 }
 console.log('Finance and Configuration failed dependency checks passed.');
 for(const file of ['Index.html','dashboard.html','configuration.html'])for(const width of [1440,390])for(const theme of ['light','dark']){
  const vc=await context({viewport:{width,height:1000}});const vp=await vc.newPage();
  await vp.goto(base+'/after/'+file+'?count=100&role=Admin');
  await vp.locator(file==='Index.html'?'#mainApp':file==='dashboard.html'?'#dashboardWorkspace':'#workspace').waitFor({state:'visible'});
  await vp.evaluate(theme=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.setAttribute('data-theme',theme);},theme);
  assert.ok((await vp.evaluate(()=>getComputedStyle(document.body).fontFamily)).includes('Open Sans'));
  await vp.screenshot({path:path.join(output,'polish-'+file+'-'+width+'-'+theme+'.png'),fullPage:true});
  if(file==='Index.html'){
   const all=await vp.evaluate(()=>filteredOrders.length);
   await vp.locator('#pendingFilter').check();
   assert.ok(await vp.evaluate(count=>filteredOrders.length<count,all));
   await vp.locator('.search-toolbar').screenshot({path:path.join(output,'toolbar-'+width+'-'+theme+'-on.png')});
   await vp.locator('#pendingFilter').press('Space');assert.equal(await vp.locator('#pendingFilter').isChecked(),false);
   assert.equal(await vp.evaluate(()=>filteredOrders.length),all);
   await vp.locator('.search-toolbar').screenshot({path:path.join(output,'toolbar-'+width+'-'+theme+'-off.png')});
   await vp.locator('#searchText').fill('no_matching_order_abcdefgh');await vp.locator('#searchText').press('Enter');
   await vp.locator('#zeroState').waitFor({state:'visible'});
   assert.equal(await vp.locator('#paginationBar').isVisible(),false);
   assert.ok((await vp.locator('#zeroState').innerText()).includes('No orders to show'));
   await vp.locator('#btnTabNew').click();
   await vp.locator('#formQty').fill('3');await vp.locator('#formUnit').fill('12.50');
   assert.equal(Number(await vp.locator('#formTotal').inputValue()),37.5);
   for(const target of ['tabNew','tabLogInvoice']){
    if(target==='tabLogInvoice')await vp.locator('[data-bs-target="#tabLogInvoice"]').click();
    const panel=vp.locator('#'+target);await panel.waitFor({state:'visible'});
    await vp.waitForFunction(id=>getComputedStyle(document.getElementById(id)).opacity==='1',target);
    const bounds=await panel.boundingBox(),card=await panel.locator('.portal-entry-card').boundingBox();
    assert.ok(card.width>=bounds.width*.95,'Form uses the available tab width');
    assert.equal(await vp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await vp.addScriptTag({path:path.resolve(root,'../implementation-backups/contrast-20260907/tooling/node_modules/axe-core/axe.min.js')});
    const contrast=await vp.evaluate(async id=>(await axe.run(document.getElementById(id),{runOnly:{type:'rule',values:['color-contrast']}})).violations.map(v=>v.nodes.map(n=>n.failureSummary)),target);
    assert.deepEqual(contrast,[],'Entry form contrast '+theme+' '+target+' '+JSON.stringify(contrast));
    await panel.locator('button').last().click({trial:true});
    await panel.screenshot({path:path.join(output,'full-width-'+target+'-'+width+'-'+theme+'.png')});
   }
  }
  await vc.close();
 }
 console.log('Polish typography, responsive screenshots and empty results passed.');
 const c=await context();const p=await c.newPage();
 for(const role of ['Admin','Staff','Head','Wipro']){
  await p.goto(base+'/after/Index.html?count=100&role='+role);await p.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
  assert.equal(await p.evaluate(()=>currentUser.role),role);
  assert.equal(await p.evaluate(()=>globalData.orders.length),['Staff','Head'].includes(role)?50:100);
  const before=await p.locator('#pageInfo').innerText();await p.locator('#searchText').fill('Synthetic order 98');await p.waitForTimeout(200);assert.ok((await p.locator('#tableBody').innerText()).includes('Synthetic order 98'));
  await p.locator('#searchText').fill('Synthetic order 96');await p.locator('#searchText').press('Enter');assert.ok((await p.locator('#tableBody').innerText()).includes('Synthetic order 96'));
  console.log('Browser role and search passed: '+role);
 }
 for(const variant of ['before','after'])for(const width of [1440,390])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:1000});await p.goto(base+'/'+variant+'/dashboard.html?count=100&role=Admin');await p.waitForFunction(()=>typeof budgetChart!=='undefined'&&!!budgetChart);
  await p.evaluate(theme=>{applyTheme(theme==='dark');},theme);await p.waitForTimeout(1100);
  const style=await p.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color,columns:getComputedStyle(document.querySelector('main > div.grid')).gridTemplateColumns}));
  const key=width+'-'+theme;
  if(variant==='before')assets.set(key,style);else assert.deepEqual(style,assets.get(key),'Dashboard styles remain identical at '+key);
  await p.screenshot({path:path.join(output,'dashboard-'+variant+'-'+width+'-'+theme+'.png'),fullPage:true});
 }
 // An unchanged refresh leaves the actual row nodes, selection and filters intact.
 await p.goto(base+'/after/Index.html?count=100&role=Admin');await p.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');
 assert.equal(await p.evaluate(async()=>{document.getElementById('searchText').value='Synthetic';renderApp(true);selectedOrderIds.add('PERF-1');const row=document.querySelector('#tableBody tr');const ok=await loadData({initial:false,preserveState:true,force:true});return ok&&row===document.querySelector('#tableBody tr')&&selectedOrderIds.has('PERF-1')&&document.getElementById('searchText').value==='Synthetic';}),true);
 // Exercise the real client request coordinator with controlled out-of-order responses.
 const coordination=await p.evaluate(async()=>{
  stopAutoRefresh_();const descriptor=Object.getOwnPropertyDescriptor(google.script,'run');const pending=[];
  Object.defineProperty(google.script,'run',{configurable:true,get(){let success,failure;const runner={withSuccessHandler(fn){success=fn;return runner;},withFailureHandler(fn){failure=fn;return runner;},getDashboardData(){pending.push({success,failure});}};return runner;}});
  const response=JSON.parse(JSON.stringify(globalData));response.meta.revision='test-newer';
  const old=loadData({initial:false,force:true});const newer=loadData({initial:false,force:true});
  pending[1].success(response);await newer;pending[0].failure({message:'Obsolete failed request'});const ignored=!(await old)&&lastDataRevision==='test-newer'&&document.getElementById('overlay').style.display!=='flex';
  pending.length=0;const retry=loadData({initial:true,force:true,timeoutMs:30});
  await new Promise(r=>setTimeout(r,1540));pending[1].success(response);const retried=await retry;
  pending[0].success({...response,meta:{...response.meta,revision:'obsolete'}});
  const protectedState=lastDataRevision==='test-newer';Object.defineProperty(google.script,'run',descriptor);
  return {ignored,retried,protectedState};
 });
 assert.deepEqual(coordination,{ignored:true,retried:true,protectedState:true});
 await p.locator('#btnTabNew').click();await p.locator('#formDesc').fill('Unsaved test request');
 assert.equal(await p.evaluate(()=>shouldSkipAutoRefresh_()),true);
 assert.equal(await p.evaluate(()=>refreshDataInPlace('test')),false);
 assert.equal(await p.locator('#formDesc').inputValue(),'Unsaved test request');
 // Export continues to contain the complete selected view.
 await p.evaluate(()=>{resetOrderForm_();document.getElementById('searchText').value='';renderApp(true);});
 const download=p.waitForEvent('download');await p.evaluate(()=>exportData());assert.ok((await download).suggestedFilename().endsWith('.xlsx'));
 // Defer component loading while allowing the data request to finish.
 const delayed=await context();const dp=await delayed.newPage();
 await dp.route(/bootstrap@.*bootstrap.bundle.min.js/,async route=>{await new Promise(r=>setTimeout(r,900));await route.fulfill(assets.get(route.request().url()));});
 await dp.goto(base+'/after/Index.html?count=100',{waitUntil:'domcontentloaded'});
 await dp.waitForFunction(()=>!!window.__lastRpcFinished);
 assert.equal(await dp.locator('#mainApp').isVisible(),false,'Data alone must not enable controls before Bootstrap');
 await dp.waitForFunction(()=>document.getElementById('mainApp').style.display==='block');await delayed.close();
 const broken=await context();const bp=await broken.newPage();await bp.route(/bootstrap@.*bootstrap.bundle.min.js/,route=>route.abort());
 await bp.goto(base+'/after/Index.html?count=100');await bp.locator('#errorBox').waitFor({state:'visible'});
 assert.equal(await bp.locator('#mainApp').isVisible(),false);await broken.close();
 console.log('Browser refresh preservation, delayed and failed component checks passed.');
 await c.close();
 if(measurements.length)fs.writeFileSync(path.join(output,'browser-measurements.json'),JSON.stringify(measurements,null,2));
 }finally{await browser.close();await assetRequest.dispose();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
