import { spawnSync } from 'node:child_process';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this gate with npm run quality or npm run handoff:verify.');
const commands = [
  [process.execPath, ['scripts/quality/lint.mjs']],
  [process.execPath, [npm, 'test']],
  [process.execPath, [npm, '--prefix', 'marumo_web', 'run', 'build']],
  [process.execPath, [npm, '--prefix', 'marumo_admin', 'run', 'build']],
  [process.execPath, [npm, 'run', 'test:ui']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
