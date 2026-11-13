// Build once locally; only the prepared HTML is uploaded by the deployment manager.
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const tooling=process.env.PORTAL_CSS_TOOLING || path.resolve(root,'../implementation-backups/performance-20260907/tooling/node_modules');
const postcss=require(path.join(tooling,'postcss'));
const tailwind=require(path.join(tooling,'tailwindcss'));
const original=fs.readFileSync(path.join(root,'dashboard.html'),'utf8').replace(/<style id="dashboard-utilities">[\s\S]*?<\/style>/,'');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'dashboard-tailwind.config.json'),'utf8'));
config.content=[{raw: original, extension:'html'}];
config.plugins=[require(path.join(tooling,'@tailwindcss/forms')),require(path.join(tooling,'@tailwindcss/typography'))];
(async()=>{
 const css=(await postcss([tailwind(config)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', {from:undefined})).css;
 const html=fs.readFileSync(path.join(root,'dashboard.html'),'utf8').replace(/<style id="dashboard-utilities">[\s\S]*?<\/style>/,'<style id="dashboard-utilities">\n'+css+'\n    </style>');
 fs.writeFileSync(path.join(root,'dashboard.html'),html);
 console.log('Prepared dashboard CSS: '+Buffer.byteLength(css)+' bytes');
})();
