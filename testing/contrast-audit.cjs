const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const {createRuntime}=require('./performance-fixtures.cjs');
const {chromium,request}=require(process.env.PORTAL_PLAYWRIGHT || 'C:/Users/AndyClifton/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'), baseline=path.resolve(root,'../implementation-backups/performance-20260907/local');
const output=path.resolve(root,'../implementation-backups/performance-20260907/results');fs.mkdirSync(output,{recursive:true});
const runtimes=new Map();
const adapter=`window.google={script:{get run(){let ok,fail;const p=new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>{ok=f;return p;};if(k==='withFailureHandler')return f=>{fail=f;return p;};return(...args)=>{const q=new URLSearchParams(location.search);window.__lastRpcStarted=performance.now();fetch('/rpc?variant='+location.pathname.split('/')[1]+'&count='+(q.get('count')||100)+'&role='+(q.get('role')||'Admin'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:k,args})}).then(r=>r.json()).then(result=>{window.__lastRpcFinished=performance.now();window.__lastResponseBytes=JSON.stringify(result).length;if(result.fixtureError){if(fail)fail({message:result.fixtureError});}else if(ok)ok(result);}).catch(e=>fail&&fail(e));};}});return p;}}};`;
function runtime(variant,count,role){const key=[variant,count,role].join(':');if(!runtimes.has(key)){const rt=createRuntime(path.join(variant==='before'?baseline:root,'Code.js'),count);const email={Admin:'admin',Staff:'staff',Head:'head',Wipro:'finance'}[role]+'@claremontschool.co.uk';rt.setActor(email);runtimes.set(key,rt);}return runtimes.get(key);}
const server=http.createServer(async(req,res)=>{
 try{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/rpc'){let body='';for await(const chunk of req)body+=chunk;const {name,args}=JSON.parse(body);const rt=runtime(u.searchParams.get('variant'),+u.searchParams.get('count'),u.searchParams.get('role'));if(typeof rt.api[name]!=='function')throw Error('Unsupported fixture RPC '+name);const result=rt.api[name](...args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
 if(u.pathname.endsWith('/local-mock.js')){res.setHeader('Content-Type','text/javascript');res.end(adapter);return;}
 const [_,variant,file]=u.pathname.split('/');if(!['before','after'].includes(variant)||!['Index.html','dashboard.html','configuration.html'].includes(file)){res.statusCode=404;res.end();return;}
 let source=fs.readFileSync(path.join(variant==='before'?baseline:root,file),'utf8');
 if(file!=='Index.html')source=source.replace('<head>','<head><script>'+adapter+'</script>');
 res.setHeader('Content-Type','text/html');res.end(source);
 }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({fixtureError:e.message}));}
});
function summary(values){const sorted=[...values].sort((a,b)=>a-b);return {median:+((sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2).toFixed(1),slowest:+sorted.at(-1).toFixed(1)};}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});const assets=new Map();const ar=await request.newContext();
 const reports=[];const axePath=path.resolve(root,'../implementation-backups/contrast-20260907/tooling/node_modules/axe-core/axe.min.js');
 async function audit(p,state){
  await p.waitForTimeout(400);
  await p.addScriptTag({path:axePath});
  const result=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'rule',values:['color-contrast']}});return {violations:r.violations,incomplete:r.incomplete,passes:r.passes.reduce((n,x)=>n+x.nodes.length,0)};});
  const manual=await p.evaluate(()=>{
   const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
   const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   function bg(e){while(e){const s=getComputedStyle(e),v=s.backgroundColor;if(!v.endsWith(', 0)')&&v!=='transparent')return rgb(v);e=e.parentElement;}return [255,255,255];}
   return [...document.querySelectorAll('select, input:not([type=hidden]), textarea, .btn-action-icon, .btn-note')].filter(e=>e.getClientRects().length&&!e.disabled).map(e=>{
    const s=getComputedStyle(e),b=bg(e);const input=e.matches('input,select,textarea');
    const group=e.closest('.search-toolbar .input-group');const edgeElement=group||e;
    return {target:e.id||e.className,text:e.matches('select')?ratio(rgb(s.color),b):null,edge:input?ratio(rgb(getComputedStyle(edgeElement).borderTopColor),bg(edgeElement.parentElement)):null,icon:!input?ratio(rgb(s.color),b):null,foreground:s.color,background:b};
   });
  });
  const reviewed=[];
  for(const group of result.incomplete)for(const item of group.nodes){
   const element=p.locator(item.target[0]);
   if(await element.count()!==1)throw Error('Ambiguous contrast review '+item.target);
   const colors=await element.evaluate(e=>{let parent=e,bg;while(parent){const c=getComputedStyle(parent).backgroundColor;if(!c.endsWith(', 0)')&&c!=='transparent'){bg=c;break;}parent=parent.parentElement;}return {color:getComputedStyle(e).color,background:bg||'rgb(255, 255, 255)',opacity:getComputedStyle(e).opacity,text:e.textContent.slice(0,120)};});
   reviewed.push({target:item.target,...colors});
  }
  const charts=await p.evaluate(()=>typeof budgetChart==='undefined'||!budgetChart?null:{dark:document.documentElement.classList.contains('dark'),bar:budgetChart.data.datasets[0].backgroundColor,segments:departmentChart.data.datasets[0].backgroundColor,border:departmentChart.data.datasets[0].borderColor,ticks:budgetChart.options.scales.x.ticks.color,legend:departmentChart.options.plugins.legend.labels.color});
  reports.push({state,...result,manual,reviewed,charts});
  console.log(state+' violations='+result.violations.reduce((n,x)=>n+x.nodes.length,0)+' incomplete='+result.incomplete.reduce((n,x)=>n+x.nodes.length,0));
 }
 try{for(const width of [1440,390])for(const theme of ['light','dark'])for(const file of ['Index.html','dashboard.html','configuration.html']){
  const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await c.newPage();
  await c.route(/^https:\/\//,async route=>{const url=route.request().url();if(!assets.has(url)){const r=await ar.get(url);assets.set(url,{body:await r.body(),contentType:r.headers()['content-type']});}await route.fulfill(assets.get(url));});
  let release;const held=new Promise(r=>release=r);
  await p.route('**/rpc?**',async route=>{await held;await route.continue();});
  await p.goto(base+'/after/'+file+'?count=100&role=Admin',{waitUntil:'domcontentloaded'});
  await p.evaluate(theme=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.setAttribute('data-theme',theme);},theme);
  await audit(p,file+'-'+width+'-'+theme+'-loading');
  release();
  await p.locator(file==='Index.html'?'#mainApp':file==='dashboard.html'?'#dashboardWorkspace':'#workspace').waitFor({state:'visible'});
  await p.evaluate(theme=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.setAttribute('data-theme',theme);if(typeof applyTheme==='function')applyTheme(theme==='dark');},theme);
  const key=file+'-'+width+'-'+theme;
  await audit(p,key+'-ready');
  if(file==='Index.html'){
   await p.locator('#pendingFilter').check();await audit(p,key+'-pending-on');await p.locator('#pendingFilter').uncheck();
   await p.locator('#btnTabNew').click();await audit(p,key+'-request');
   await p.locator('#submitBtn').hover();await audit(p,key+'-primary-hover');
   await p.locator('#submitBtn').focus();await audit(p,key+'-primary-focus');
   await p.evaluate(()=>{getModal_('successModal').show();});await p.locator('#successModal').waitFor({state:'visible'});await audit(p,key+'-success');
   await p.evaluate(()=>getModal_('successModal').hide());await p.waitForTimeout(400);
   if(width===1440)for(const id of ['financeModal','bulkModal','approvalModal','budgetTransferModal','notesModal','simModal','msgModal','cancelReasonModal','confirmModal','quickStartModal']){
    await p.evaluate(id=>getModal_(id).show(),id);await audit(p,key+'-'+id);
    await p.evaluate(id=>getModal_(id).hide(),id);await p.waitForTimeout(400);
   }
  }
  if(file==='configuration.html'){
   await p.evaluate(()=>document.querySelectorAll('.collapse').forEach(e=>bootstrap.Collapse.getOrCreateInstance(e,{toggle:false}).show()));
   await p.waitForTimeout(400);await audit(p,key+'-expanded');
   await p.evaluate(()=>openBudgetDraft());await p.locator('#budgetModal').waitFor({state:'visible'});await audit(p,key+'-budget-form');
   await p.evaluate(()=>bootstrap.Modal.getInstance(document.getElementById('budgetModal')).hide());await p.waitForTimeout(400);
   await p.evaluate(()=>openUserDraft());await audit(p,key+'-user-form');
  }
  await p.route('**/rpc?**',route=>route.fulfill({json:{fixtureError:'Audit connection failure'}}));
  await p.goto(base+'/after/'+file+'?count=100&role=Admin');
  await p.evaluate(theme=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.setAttribute('data-theme',theme);},theme);
  await p.locator(file==='Index.html'?'#errorBox':file==='dashboard.html'?'#dashboardLoading [role="alert"]':'#errorScreen').waitFor({state:'visible'});
  await audit(p,key+'-connection-error');
  await c.close();
 }}finally{fs.writeFileSync(path.resolve(root,'../implementation-backups/contrast-20260907/results.json'),JSON.stringify(reports,null,2));await browser.close();await ar.dispose();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
