import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { git, captureSnapshot } from './snapshot.mjs';
import { executeVerification, validateHandoff, renderHandoff, validateReportScope, recoverVerification } from './core.mjs';

const cwd = process.cwd();
const [command, ...args] = process.argv.slice(2);
const values = (name) => args.flatMap((value, index) => value === `--${name}` ? [args[index + 1]] : []);
try {
  if (command === 'init') {
    let base = values('base')[0];
    if (!base) {
      try { base = git(cwd, ['merge-base', 'HEAD', 'origin/main']).trim(); }
      catch { base = git(cwd, ['rev-parse', 'HEAD']).trim(); }
    }
    mkdirSync('handoff', { recursive: true });
    writeFileSync('handoff/request.json', JSON.stringify({ version: 1, baseCommit: git(cwd, ['rev-parse', `${base}^{commit}`]).trim(), taskIds: values('task'), outcome: 'completed', goal: values('goal')[0] || '', mainFiles: values('main'), risks: [], limitations: ['Workflow GitHub và triển khai chưa được thực hiện trong lượt này.'] }, null, 2) + '\n');
    console.log('Created handoff/request.json; review it before verification.');
  } else if (command === 'verify') {
    executeVerification({ cwd });
    validateHandoff({ cwd });
    console.log('PASS verified handoff');
  } else if (command === 'check' || command === 'render') {
    const mode = values('mode')[0] || 'worktree';
    const report = validateHandoff({ cwd, mode, allowIncomplete: command === 'render' });
    console.log(command === 'render' ? renderHandoff(report) : 'PASS handoff matches verified source');
  } else if (command === 'scope') {
    const report = validateReportScope({ cwd, mode: 'commit' });
    const db = report.checks.some(({ id }) => id === 'db');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `db=${db}\n`);
    console.log(JSON.stringify({ db, snapshot: report.snapshot }));
  } else if (command === 'recover') {
    recoverVerification(cwd);
    console.log('Invalidated crashed run; execute handoff:verify again.');
  } else if (command === 'ci') {
    const original = validateReportScope({ cwd, mode: 'commit' });
    if (captureSnapshot(cwd).hash !== original.snapshot) throw new Error('CI worktree differs from committed payload');
    executeVerification({ cwd, writeReport: false });
    validateHandoff({ cwd, mode: 'commit' });
    console.log('PASS independently recertified handoff');
  } else throw new Error('Use init, verify, check, render, scope, recover or ci.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
