import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const git = process.platform === 'win32' ? execFileSync('where.exe', ['git'], { encoding: 'utf8' }).trim().split(/\r?\n/).at(-1) : 'git';
for (const exitCode of [0, 7]) test(`pre-push runs npm without bash and preserves exit ${exitCode}`, () => {
  const cwd = mkdtempSync(join(tmpdir(), 'marumo-push-'));
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^GIT_/.test(key)) delete env[key];
    execFileSync(git, ['init'], { cwd, env, stdio: 'pipe' });
    mkdirSync(join(cwd, '.githooks'));
    mkdirSync(join(cwd, 'scripts/quality'), { recursive: true });
    copyFileSync(resolve('.githooks/pre-push'), join(cwd, '.githooks/pre-push'));
    chmodSync(join(cwd, '.githooks/pre-push'), 0o755);
    copyFileSync(resolve('scripts/quality/pre-push.mjs'), join(cwd, 'scripts/quality/pre-push.mjs'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { 'handoff:ci': 'node probe.cjs' } }));
    writeFileSync(join(cwd, 'probe.cjs'), `console.log('ACTUAL_NPM_CHECK');process.exit(${exitCode});`);
    execFileSync(git, ['config', 'core.hooksPath', '.githooks'], { cwd, env });
    const result = spawnSync(git, ['hook', 'run', 'pre-push'], { cwd, env, encoding: 'utf8' });
    assert.match(result.stdout + result.stderr, /ACTUAL_NPM_CHECK/);
    assert.equal(result.status === 0, exitCode === 0, result.stderr);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
