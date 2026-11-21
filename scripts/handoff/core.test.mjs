import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, captureSnapshot, changedFiles } from './snapshot.mjs';
import { executeVerification, validateHandoff, renderHandoff, recoverVerification, validateReportScope } from './core.mjs';

function fixture(run) {
  const ciBase = process.env.HANDOFF_BASE_REF;
  delete process.env.HANDOFF_BASE_REF;
  const cwd = mkdtempSync(join(tmpdir(), 'marumo-handoff-'));
  const write = (path, value) => writeFileSync(join(cwd, path), value);
  try {
    git(cwd, ['init']);
    git(cwd, ['config', 'user.name', 'Fixture']);
    git(cwd, ['config', 'user.email', 'fixture@example.test']);
    git(cwd, ['config', 'core.autocrlf', 'false']);
    git(cwd, ['config', 'core.filemode', 'false']);
    mkdirSync(join(cwd, 'docs'));
    mkdirSync(join(cwd, 'handoff'));
    write('.gitignore', '.quality/\n');
    write('docs/TASKS.md', '| QG-006 | active | - | feature | npm test | - |\n');
    write('source.js', 'export const value=1;\n');
    git(cwd, ['add', '.']);
    git(cwd, ['commit', '-m', 'fixture']);
    write('source.js', 'export const value=2;\n');
    const request = { version: 1, baseCommit: git(cwd, ['rev-parse', 'HEAD']).trim(), taskIds: ['QG-006'], outcome: 'completed', goal: 'Verify executable handoff', mainFiles: ['source.js'], risks: [], limitations: ['No deployment performed.'] };
    write('handoff/request.json', JSON.stringify(request));
    const commands = { quality: [process.execPath, '-e', 'process.stdout.write("actual check passed")'] };
    run({ cwd, write, request, commands, execute: () => executeVerification({ cwd, commands }), validate: (options = {}) => validateHandoff({ cwd, commands, ...options }) });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    if (ciBase !== undefined) process.env.HANDOFF_BASE_REF = ciBase;
  }
}

test('generated report is verifiable and deterministic', () => fixture(({ execute, validate }) => {
  execute();
  const report = validate();
  assert.match(renderHandoff(report), /quality: PASS/);
}));
test('missing report and unknown task fail closed', () => fixture(({ cwd, request, write, commands, validate }) => {
  assert.throws(validate);
  request.taskIds = ['UNKNOWN-001'];
  write('handoff/request.json', JSON.stringify(request));
  assert.throws(() => executeVerification({ cwd, commands }), /Unknown task/);
}));
test('source edits and partial staging invalidate evidence', () => fixture(({ cwd, write, execute, validate }) => {
  execute();
  git(cwd, ['add', '.']);
  validate({ mode: 'index' });
  write('source.js', 'export const value=3;');
  assert.throws(validate, /snapshot/);
  validate({ mode: 'index' });
  git(cwd, ['add', 'source.js']);
  assert.throws(() => validate({ mode: 'index' }), /snapshot/);
}));
test('edited logs and invented result fields are rejected', () => fixture(({ cwd, write, execute, validate }) => {
  execute();
  const receipt = JSON.parse(readFileSync(join(cwd, '.quality/receipt.json')));
  write(receipt.checks[0].log, 'invented PASS');
  assert.throws(validate, /log was edited/);
  execute();
  const report = JSON.parse(readFileSync(join(cwd, 'handoff/report.json')));
  report.testsPassed = 999;
  write('handoff/report.json', JSON.stringify(report));
  assert.throws(validate, /report:/);
}));
test('failed commands do not inherit a previous green receipt', () => fixture(({ cwd, commands, execute, validate }) => {
  execute();
  commands.quality = [process.execPath, '-e', 'process.exit(7)'];
  assert.throws(() => executeVerification({ cwd, commands }), /required check failed/);
  assert.throws(validate, /not complete/);
}));
test('omitted scope and empty check arrays cannot pass', () => fixture(({ cwd, write, execute, validate }) => {
  execute();
  const report = JSON.parse(readFileSync(join(cwd, 'handoff/report.json')));
  report.files = report.files.filter((entry) => entry.path !== 'source.js');
  write('handoff/report.json', JSON.stringify(report));
  assert.throws(validate, /scope/);
  execute();
  report.checks = [];
  write('handoff/report.json', JSON.stringify(report));
  assert.throws(validate, /report:/);
}));
test('added and deleted files stay in exact reported scope', () => fixture(({ cwd, write, request, execute, validate }) => {
  unlinkSync(join(cwd, 'source.js'));
  write('new.js', 'export const added=true;');
  request.mainFiles = ['new.js'];
  write('handoff/request.json', JSON.stringify(request));
  execute();
  const report = validate();
  assert.deepEqual(report.files.find(({ path }) => path === 'source.js'), { path: 'source.js', change: 'deleted', blob: null, mode: null });
  assert.equal(report.files.find(({ path }) => path === 'new.js').change, 'added');
}));
test('mode-only changes invalidate evidence and remain in Git scope', () => fixture(({ cwd, execute, validate, request }) => {
  execute();
  git(cwd, ['add', '.']);
  validate({ mode: 'index' });
  git(cwd, ['update-index', '--chmod=+x', 'source.js']);
  assert.throws(() => validate({ mode: 'index' }), /snapshot/);
  const files = changedFiles(cwd, request.baseCommit, captureSnapshot(cwd, 'index'));
  assert.equal(files.find(({ path }) => path === 'source.js').mode, '100755');
}));
test('unsafe Git index names are rejected instead of truncated', () => fixture(({ cwd }) => {
  git(cwd, ['config', 'core.protectNTFS', 'false']);
  const blob = git(cwd, ['hash-object', '--stdin'], 'value').trim();
  git(cwd, ['update-index', '--add', '--cacheinfo', `100644,${blob},unsafe\tname.js`]);
  assert.throws(() => captureSnapshot(cwd, 'index'), /Unsafe/);
}));
test('invalid base and mismatched CI base fail before checks', () => fixture(({ cwd, write, request, commands }) => {
  const base = request.baseCommit;
  request.baseCommit = '0'.repeat(40);
  write('handoff/request.json', JSON.stringify(request));
  assert.throws(() => executeVerification({ cwd, commands }));
  request.baseCommit = git(cwd, ['commit-tree', git(cwd, ['write-tree']).trim(), '-m', 'unrelated history']).trim();
  write('handoff/request.json', JSON.stringify(request));
  assert.throws(() => executeVerification({ cwd, commands }));
  request.baseCommit = base;
  write('handoff/request.json', JSON.stringify(request));
  const previous = process.env.HANDOFF_BASE_REF;
  process.env.HANDOFF_BASE_REF = 'missing-base';
  try { assert.throws(() => executeVerification({ cwd, commands })); }
  finally { if (previous === undefined) delete process.env.HANDOFF_BASE_REF; else process.env.HANDOFF_BASE_REF = previous; }
}));
test('source mutation during a check invalidates its result', () => fixture(({ cwd, commands, validate }) => {
  commands.quality = [process.execPath, '-e', 'require("node:fs").appendFileSync("source.js", " ")'];
  assert.throws(() => executeVerification({ cwd, commands }), /Source changed/);
  assert.throws(validate, /snapshot/);
}));
test('SQL scope requires the real registered DB check and its result', () => fixture(({ cwd, write, commands, validate }) => {
  mkdirSync(join(cwd, 'SQL'));
  write('SQL/change.sql', 'SELECT 1;');
  commands.db = [process.execPath, '-e', 'process.exit(9)'];
  assert.throws(() => executeVerification({ cwd, commands }), /required check failed/);
  const report = JSON.parse(readFileSync(join(cwd, 'handoff/report.json')));
  assert.deepEqual(report.checks, [{ id: 'quality', status: 'passed' }, { id: 'db', status: 'failed' }]);
  report.checks.pop();
  write('handoff/report.json', JSON.stringify(report));
  assert.throws(validate, /Required checks/);
}));
test('active and crashed locks cannot reuse a green receipt', () => fixture(({ cwd, write, execute, validate }) => {
  execute();
  write('.quality/verify.lock', JSON.stringify({ pid: process.pid }));
  assert.throws(validate, /running/);
  assert.throws(execute, /EEXIST/);
  assert.throws(() => recoverVerification(cwd), /still alive/);
  const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  write('.quality/verify.lock', JSON.stringify({ pid: dead.pid }));
  recoverVerification(cwd);
  assert.throws(validate, /snapshot|incomplete/);
  execute();
  validate();
}));
test('partial failed handoff is renderable but cannot pass a publish gate', () => fixture(({ cwd, write, request, commands, validate }) => {
  request.outcome = 'blocked';
  write('handoff/request.json', JSON.stringify(request));
  commands.quality = [process.execPath, '-e', 'process.exit(2)'];
  assert.throws(() => executeVerification({ cwd, commands }));
  assert.throws(validate, /not complete/);
  const report = validate({ allowIncomplete: true });
  assert.match(renderHandoff(report), /chưa hoàn tất/);
  assert.match(renderHandoff(report), /quality: FAIL/);
}));
test('committed report is independently recertified without rewriting it', () => fixture(({ cwd, commands, execute }) => {
  execute();
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'verified payload']);
  const original = readFileSync(join(cwd, 'handoff/report.json'), 'utf8');
  validateReportScope({ cwd });
  const prior = JSON.parse(readFileSync(join(cwd, '.quality/receipt.json'))).runId;
  executeVerification({ cwd, commands, writeReport: false });
  validateHandoff({ cwd, mode: 'commit', commands });
  assert.notEqual(JSON.parse(readFileSync(join(cwd, '.quality/receipt.json'))).runId, prior);
  assert.equal(readFileSync(join(cwd, 'handoff/report.json'), 'utf8'), original);
}));
