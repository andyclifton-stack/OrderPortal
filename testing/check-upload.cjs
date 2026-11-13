const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'..');
const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;
const expected = ['AmazonDevelopment.js','Code.js','DevelopmentSender.js','Index.html','PortalClientContext.html','Recovery.js','SharedDropdowns.html','SharedPolish.html','WeeklyFinance.js','appsscript.json','changes.html','configuration.html','dashboard.html','setupSystem.js'].sort();
(async()=>{
  const {Files} = await import(pathToFileURL(path.join(root,'node_modules/@google/clasp/build/src/core/files.js')));
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot,'.clasp.json'),'utf8'));
  const files = new Files({project:config,configFilePath:path.join(projectRoot,'.clasp.json'),files:{
    projectRootDir:projectRoot,contentDir:projectRoot,ignorePatterns:fs.readFileSync(path.join(projectRoot,'.claspignore'),'utf8').split(/\r?\n/).filter(Boolean),
    fileExtensions:{SERVER_JS:config.scriptExtensions || ['.gs','.js'],HTML:config.htmlExtensions || ['.html'],JSON:config.jsonExtensions || ['.json']}
  }});
  const result = await files.collectLocalFiles();
  const selected = result.files.map(file=>path.relative(projectRoot,path.resolve(file.localPath)).replaceAll('\\','/')).sort();
  assert.deepEqual(selected,expected,'Unexpected Apps Script upload files');
  fs.mkdirSync(path.join(root,'output'),{recursive:true});
  fs.writeFileSync(path.join(root,'output/upload-files.json'),JSON.stringify(selected,null,2));
  console.log('Upload inventory verified: '+selected.length+' application files.');
})().catch(error=>{console.error(error);process.exitCode=1;});
