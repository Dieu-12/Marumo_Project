import { spawnSync } from 'node:child_process';

const node = Boolean(process.env.SQL_TEST_USER);
if (!node && process.platform !== 'win32') throw new Error('SQL verification requires SQL_TEST_USER and SQL_TEST_PASSWORD on this platform.');
const result = node
  ? spawnSync(process.execPath, ['scripts/handoff/sql-integration.mjs'], { stdio: 'inherit', timeout: 300000 })
  : spawnSync('pwsh.exe', ['-NoProfile', '-File', 'SQL/tests/Invoke-DbIntegrityTests.ps1'], { stdio: 'inherit', timeout: 300000 });
if (result.error) throw new Error('SQL verification could not execute.');
process.exitCode = result.status ?? 1;
