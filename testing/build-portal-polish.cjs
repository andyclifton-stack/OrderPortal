// Shared HTML partials are embedded by Apps Script, without another browser request.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
for(const name of ['SharedPolish','SharedDropdowns']) {
  if(!fs.readFileSync(path.join(root,name+'.html'),'utf8').includes('<style'))throw Error('Missing shared styles: '+name);
  for(const file of ['Index.html','configuration.html','dashboard.html']) {
    const html=fs.readFileSync(path.join(root,file),'utf8');
    if(html.split("<?!= includePortalStyles_('"+name+"'); ?>").length!==2)throw Error(file+' must include '+name+' exactly once');
  }
}
console.log('All three screens use the two canonical shared style partials.');
