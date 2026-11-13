// Run explicitly when updating verified test assets, never during a test run.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assets = {
  'bootstrap.bundle.min.js':'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'bootstrap.min.css':'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'bootstrap-icons.css':'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
  'bootstrap-icons.woff2':'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/fonts/bootstrap-icons.woff2',
  'chart.umd.min.js':'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js',
  'xlsx.full.min.js':'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
};
(async()=>{
  const manifest = {};
  for (const [name,url] of Object.entries(assets)) {
    const response = await fetch(url);
    if (!response.ok) throw Error(`${url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(__dirname,'vendor',name),bytes);
    manifest[name] = {url, integrity:'sha384-'+crypto.createHash('sha384').update(bytes).digest('base64'), crossOrigin:response.headers.get('access-control-allow-origin')};
  }
  fs.writeFileSync(path.join(__dirname,'vendor/assets.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('Verified and saved '+Object.keys(manifest).length+' assets.');
})().catch(error=>{console.error(error);process.exitCode=1;});
