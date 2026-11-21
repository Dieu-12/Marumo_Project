import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const result = (() => { try { return execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim(); } catch (error) { if (error.status === 1) return ''; throw error; } })();
if (result && result !== '.githooks') throw new Error(`Existing hooksPath ${result} was preserved. Integrate hooks explicitly.`);
if (!result) {
  const directory = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { encoding: 'utf8' }).trim();
  for (const name of ['pre-commit', 'pre-push']) if (existsSync(join(directory, name))) throw new Error(`Existing ${name} hook was preserved. Integrate hooks explicitly.`);
}
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks']);
for (const name of ['pre-commit', 'pre-push']) {
  const path = `.githooks/${name}`;
  writeFileSync(path, readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
  chmodSync(path, 0o755);
}
console.log('PASS Git hooks installed');
