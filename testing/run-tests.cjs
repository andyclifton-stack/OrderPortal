const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const suite = require('./offline-suite.json');
const output = path.join(root, 'output', 'offline-tests');
fs.mkdirSync(output, {recursive:true});
let failures = 0;
for (const file of suite) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {cwd:root, encoding:'utf8'});
  fs.writeFileSync(path.join(output, file + '.log'), (result.stdout || '') + (result.stderr || ''));
  const passed = result.status === 0;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${file}`);
  if (!passed) failures++;
}
const mutation = spawnSync(process.execPath, [path.join(__dirname, 'reliability-security-tests.js')], {
  cwd:root, encoding:'utf8', env:{...process.env, PORTAL_TEST_UNEXPECTED_ACTION:'1'}
});
if (mutation.status === 0 || !mutation.stderr.includes('reviewed allow-list')) {
  console.error('FAIL unexpected public action was not caught by the allow-list');
  failures++;
}
console.log(`${suite.length} tests, ${failures} failures; logs in output/offline-tests`);
process.exitCode = failures ? 1 : 0;
