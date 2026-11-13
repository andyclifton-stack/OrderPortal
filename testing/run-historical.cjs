const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw Error(`Supply ${name} with an existing local baseline path.`);
  return path.resolve(process.argv[index + 1]);
}
const performance = path.join(argument('--performance-baseline'), 'Code.js');
const requester = argument('--requester-baseline');
for (const file of [performance, requester]) if (!fs.existsSync(file)) throw Error(`Historical baseline missing: ${file}`);
for (const file of ['performance-tests.js', 'requester-tests.js']) {
  const result = spawnSync(process.execPath, [path.join(__dirname,file)], {
    stdio:'inherit', env:{...process.env, PORTAL_PERFORMANCE_BASELINE:performance, PORTAL_REQUESTER_BASELINE:requester}
  });
  if (result.status !== 0) process.exitCode = 1;
}
