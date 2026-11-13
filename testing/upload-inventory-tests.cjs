const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
const fixture = fs.mkdtempSync(path.join(root,'tmp','upload-inventory-'));
for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
  if(entry.isFile() && (/\.(js|html|json)$/.test(entry.name) || entry.name==='.claspignore')) fs.copyFileSync(path.join(root,entry.name),path.join(fixture,entry.name));
}
const probe = path.join(fixture,`.upload-inventory-probe-${process.pid}.gs`);
let created = false;
try {
  fs.writeFileSync(probe,'// Synthetic unexpected server file for inventory verification.\n',{flag:'wx'});
  created = true;
  const result = spawnSync(process.execPath,[path.join(__dirname,'check-upload.cjs'),fixture],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0,'Unexpected .gs file must fail the upload inventory');
  assert.match(result.stderr,/Unexpected Apps Script upload files/);
  assert(result.stderr.includes(path.basename(probe)), 'Failure must identify the unexpected .gs file');
  console.log('Upload inventory rejects an unexpected .gs file.');
} finally { if(created) fs.unlinkSync(probe); }
