// Local synthetic UI checks only. This file and local-mock.js are excluded from deployment.
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const name=url.pathname==='/'?'Index.html':url.pathname.slice(1);
  if(!['Index.html','local-mock.js'].includes(name)){res.writeHead(404);res.end();return;}
  let source=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='Index.html')source=source.replace(/<\?!= includePortalStyles_\('(SharedPolish|SharedDropdowns)'\); \?>/g,
    (_,part)=>fs.readFileSync(path.join(root,part+'.html'),'utf8'));
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
  res.end(source);
}).listen(8766,'127.0.0.1',()=>console.log('Synthetic portal UI: http://127.0.0.1:8766/'));
