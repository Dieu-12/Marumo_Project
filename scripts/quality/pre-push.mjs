import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const windows = process.platform === 'win32';
const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (windows && !existsSync(npm)) throw new Error('npm CLI was not found beside Node.js. Install Node.js with npm, then retry push.');
const result = windows
  ? spawnSync(process.execPath, [npm, 'run', 'handoff:ci'], { stdio: 'inherit' })
  : spawnSync('npm', ['run', 'handoff:ci'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
