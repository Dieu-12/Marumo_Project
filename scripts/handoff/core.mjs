import Ajv from 'ajv';
import { readFileSync, writeFileSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { captureSnapshot, changedFiles, readTarget, git, digest, safePath } from './snapshot.mjs';

export { captureSnapshot } from './snapshot.mjs';
const schema = (name) => JSON.parse(readFileSync(new URL(`./${name}.schema.json`, import.meta.url)));
const ajv = new Ajv({ allErrors: true });
const requestValid = ajv.compile(schema('request'));
const reportValid = ajv.compile(schema('report'));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
function parse(text, validator, label) {
  const value = JSON.parse(text);
  requireValue(validator(value), `${label}: ${ajv.errorsText(validator.errors)}`);
  return value;
}
function atomic(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, path);
}
export function requestAt(cwd, mode = 'worktree') {
  const request = parse(readTarget(cwd, 'handoff/request.json', mode), requestValid, 'request');
  for (const path of request.mainFiles) requireValue(safePath(path), 'Unsafe main file');
  git(cwd, ['merge-base', '--is-ancestor', request.baseCommit, 'HEAD']);
  if (process.env.HANDOFF_BASE_REF) requireValue(git(cwd, ['merge-base', 'HEAD', process.env.HANDOFF_BASE_REF]).trim() === request.baseCommit, 'CI base does not match report base');
  const tasks = readTarget(cwd, 'docs/TASKS.md', mode);
  for (const id of request.taskIds) requireValue(new RegExp(`^\\|\\s*${id}\\s*\\|`, 'm').test(tasks), `Unknown task ${id}`);
  return request;
}
export function requiredChecks(files) {
  return ['quality', ...(files.some(({ path }) => path.startsWith('SQL/') || /^scripts\/handoff\/(?:sql-check|sql-integration|ci-sql)\.mjs$/.test(path)) ? ['db'] : [])];
}
export function registry() {
  return {
    quality: [process.execPath, 'scripts/quality/run.mjs'],
    db: [process.execPath, 'scripts/handoff/sql-check.mjs'],
  };
}
function verifyReport(cwd, mode) {
  const request = requestAt(cwd, mode);
  const report = parse(readTarget(cwd, 'handoff/report.json', mode), reportValid, 'report');
  const snapshot = captureSnapshot(cwd, mode);
  const files = changedFiles(cwd, request.baseCommit, snapshot);
  requireValue(equal(request, report.request), 'Report request is stale');
  requireValue(report.snapshot === snapshot.hash, 'Source snapshot is stale');
  requireValue(equal(files, report.files), 'Changed-file scope does not match Git');
  for (const path of request.mainFiles) requireValue(files.some((entry) => entry.path === path && entry.change !== 'deleted'), `Main file is not changed: ${path}`);
  requireValue(equal(report.checks.map((check) => check.id), requiredChecks(files)), 'Required checks do not match scope');
  return report;
}
export function validateHandoff({ cwd = process.cwd(), mode = 'worktree', allowIncomplete = false, commands = registry() } = {}) {
  requireValue(!existsSync(join(cwd, '.quality/verify.lock')), 'Verification is running or requires handoff:recover after a crash');
  const report = verifyReport(cwd, mode);
  const receipt = JSON.parse(readFileSync(join(cwd, '.quality/receipt.json'), 'utf8'));
  requireValue(receipt.version === 1 && receipt.snapshot === report.snapshot && receipt.after === report.snapshot, 'Receipt snapshot is stale or incomplete');
  requireValue(receipt.state === 'finished' && Array.isArray(receipt.checks), 'Receipt run did not finish');
  requireValue(equal(receipt.checks.map((check) => check.id), report.checks.map((check) => check.id)), 'Receipt checks mismatch');
  for (let i = 0; i < receipt.checks.length; i++) {
    const check = receipt.checks[i];
    requireValue(equal(check.argv, commands[check.id]), 'Receipt command mismatch');
    requireValue(safePath(check.log) && check.log.startsWith('.quality/logs/'), 'Unsafe log path');
    requireValue(digest(readFileSync(join(cwd, check.log))) === check.logHash, 'Command log was edited');
    requireValue(Number.isInteger(check.exitCode), 'Check did not exit');
    requireValue(report.checks[i].status === (check.exitCode === 0 ? 'passed' : 'failed'), 'Claimed check result differs from execution');
  }
  if (!allowIncomplete || report.request.outcome === 'completed') requireValue(report.request.outcome === 'completed' && receipt.checks.every((check) => check.exitCode === 0), 'Handoff is not complete and passing');
  return report;
}
export function recoverVerification(cwd = process.cwd()) {
  const lockPath = join(cwd, '.quality/verify.lock');
  const raw = readFileSync(lockPath, 'utf8');
  const lock = JSON.parse(raw);
  requireValue(Number.isSafeInteger(lock.pid) && lock.pid > 0, 'Invalid verification lock; inspect it manually');
  try { process.kill(lock.pid, 0); throw new Error('Verification process is still alive'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  requireValue(readFileSync(lockPath, 'utf8') === raw, 'Verification lock changed during recovery');
  atomic(join(cwd, '.quality/receipt.json'), { version: 1, state: 'invalidated' });
  unlinkSync(lockPath);
}
export function executeVerification({ cwd = process.cwd(), commands = registry(), writeReport = true } = {}) {
  const request = requestAt(cwd);
  const before = captureSnapshot(cwd);
  const files = changedFiles(cwd, request.baseCommit, before);
  mkdirSync(join(cwd, '.quality/logs'), { recursive: true });
  const lockPath = join(cwd, '.quality/verify.lock');
  const lock = openSync(lockPath, 'wx');
  const receipt = { version: 1, runId: randomUUID(), state: 'running', snapshot: before.hash, after: null, checks: [] };
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid, runId: receipt.runId }));
    atomic(join(cwd, '.quality/receipt.json'), receipt);
    for (const id of requiredChecks(files)) {
      const argv = commands[id];
      requireValue(Array.isArray(argv) && argv.length > 0, `Missing fixed check ${id}`);
      const result = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
      const log = `.quality/logs/${receipt.runId}-${id}.log`;
      const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}`;
      writeFileSync(join(cwd, log), output);
      process.stdout.write(output);
      receipt.checks.push({ id, argv, exitCode: result.error ? -1 : result.status ?? -1, log, logHash: digest(output) });
    }
    receipt.after = captureSnapshot(cwd).hash;
    receipt.state = 'finished';
    atomic(join(cwd, '.quality/receipt.json'), receipt);
    const report = { version: 1, request, snapshot: before.hash, files, checks: receipt.checks.map(({ id, exitCode }) => ({ id, status: exitCode === 0 ? 'passed' : 'failed' })), deployment: 'not_performed' };
    if (writeReport) {
      mkdirSync(join(cwd, 'handoff'), { recursive: true });
      atomic(join(cwd, 'handoff/report.json'), report);
    }
    requireValue(receipt.after === receipt.snapshot, 'Source changed during verification');
    requireValue(receipt.checks.every(({ exitCode }) => exitCode === 0), 'A required check failed');
    return report;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
export function renderHandoff(report, cwd = process.cwd()) {
  const request = report.request;
  const link = (path) => `[${path.replaceAll('[', '\\[').replaceAll(']', '\\]')}](<${join(cwd, path).replaceAll('\\', '/').replaceAll('>', '%3E')}>)`;
  return [request.outcome === 'completed' ? 'Đã kiểm chứng bàn giao.' : 'Bàn giao chưa hoàn tất.', '', `Mục tiêu: ${request.goal}`, `Task: ${request.taskIds.join(', ')}`, `Phạm vi Git: ${report.files.length} tệp thay đổi.`, '', ...request.mainFiles.map((path) => `- ${link(path)}`), '', ...report.checks.map(({ id, status }) => `- ${id}: ${status === 'passed' ? 'PASS' : 'FAIL'}`), '', 'Giới hạn:', '', ...request.limitations.map((text) => `- ${text}`), ...request.risks.map((text) => `- Rủi ro: ${text}`), '', 'Chưa triển khai hoặc áp migration vào DB đang dùng.', `Báo cáo: ${link('handoff/report.json')}`, `Snapshot: ${report.snapshot.slice(0, 12)}`].join('\n');
}
export function validateReportScope({ cwd = process.cwd(), mode = 'commit' } = {}) { return verifyReport(cwd, mode); }
