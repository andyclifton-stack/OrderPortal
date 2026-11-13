const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const assets = require('./vendor/assets.json');
const {createRuntime} = require('./performance-fixtures.cjs');
const pages = new Set(['Index.html','dashboard.html','configuration.html','changes.html']);
function createPreviewServer() {
  return http.createServer((req,res)=>{
    const url = new URL(req.url,'http://127.0.0.1');
    const name = url.pathname === '/' ? 'Index.html' : url.pathname.slice(1);
    let file;
    if (pages.has(name) || name === 'local-mock.js') file = path.join(root,name);
    else if (name.startsWith('assets/') && Object.hasOwn(assets,path.basename(name))) file = path.join(__dirname,'vendor',path.basename(name));
    else { res.writeHead(404);res.end();return; }
    const extension = path.extname(file);
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2'};
    res.setHeader('Content-Type',types[extension] || 'application/octet-stream');
    if (extension === '.woff2') {res.end(fs.readFileSync(file));return;}
    let source = fs.readFileSync(file,'utf8');
    if (pages.has(name)) {
      source = source.replace(/<\?!= includePortalStyles_\('(SharedPolish|SharedDropdowns|PortalClientContext)'\); \?>/g,
        (_,part)=>fs.readFileSync(path.join(root,part+'.html'),'utf8'));
      source = source.replace(/<\?= appUrl \?>/g,'/').replace(/<\?= initial(?:Order|Approval)Ref \?>/g,'');
      source = source.replace(/<script\b[^>]*src="https:\/\/static.cloudflareinsights.com[^>]*><\/script>/g,'');
      for (const [asset,meta] of Object.entries(assets)) source = source.replaceAll(meta.url,'/assets/'+asset);
      if (name !== 'Index.html') {
        const runtime = createRuntime(path.join(root,'Code.js'),12);
        const overview = runtime.api.getOverviewDashboardData({period:'All'});
        source = source.replace('<head>','<head><script>window.__mockOverview='+JSON.stringify(overview).replaceAll('<','\\u003c')+';</script><script src="/local-mock.js"></script>');
      }
    }
    if (name === 'local-mock.js') source += '\nwindow.portalRun = google.script.run;\n';
    res.end(source);
  });
}
module.exports = {createPreviewServer};
if (require.main === module) createPreviewServer().listen(8766,'127.0.0.1',()=>console.log('Synthetic preview http://127.0.0.1:8766/'));
