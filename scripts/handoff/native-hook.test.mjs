import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleHook, filesystemDependencies } from './native-hook.mjs';

function fixture() {
  const state = { hash: 'initial', report: null, baseline: null, valid: false, calls: 0 };
  const input = { cwd: '/repo/subdir', session_id: 'session', turn_id: 'turn', hook_event_name: 'UserPromptSubmit', prompt: 'Review current work' };
  const dependencies = {
    resolveRoot: () => '/repo',
    captureSnapshot: async () => ({ hash: state.hash, files: [] }),
    reportDigest: async () => state.report,
    loadBaseline: async () => state.baseline,
    saveBaseline: async (_, session, baseline) => { assert.equal(session, 'session'); state.baseline = baseline; },
    validateHandoff: async (options) => {
      state.calls += 1;
      assert.deepEqual(options, { cwd: '/repo', mode: 'worktree', allowIncomplete: true });
      if (!state.valid) throw new Error('Missing current report or receipt.');
      return { rendered: 'Verified output' };
    },
    renderHandoff: (report) => report.rendered,
  };
  const prompt = (changes = {}) => handleHook({ ...input, ...changes }, dependencies);
  const stop = (changes = {}) => prompt({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Verified output', ...changes });
  return { state, dependencies, prompt, stop };
}

test('read-only event allows without requiring a report', async () => {
  const { prompt, stop, state } = fixture();
  assert.deepEqual(await prompt(), {});
  assert.deepEqual(await stop(), {});
  assert.equal(state.calls, 0);
});

test('changed source without report blocks and keeps blocking active stop', async () => {
  const { prompt, stop, state } = fixture();
  await prompt();
  state.hash = 'changed';
  assert.equal((await stop()).decision, 'block');
  assert.equal((await stop({ stop_hook_active: true })).decision, 'block');
  await prompt({ turn_id: 'continuation' });
  assert.equal((await stop({ turn_id: 'continuation', stop_hook_active: true })).decision, 'block');
  assert.equal(state.calls, 3);
});

test('changed source and exact valid rendered report allows', async () => {
  const { prompt, stop, state } = fixture();
  await prompt();
  state.hash = 'changed';
  state.valid = true;
  assert.deepEqual(await stop({ last_assistant_message: '\r\nVerified output\r\n' }), {});
});

test('interrupted edits remain pending across a new prompt before Stop', async () => {
  const { prompt, stop, state } = fixture();
  await prompt();
  state.hash = 'changed-before-interruption';
  await prompt({ turn_id: 'steered-turn' });
  assert.equal((await stop({ turn_id: 'steered-turn' })).decision, 'block');
  assert.equal(state.baseline.pendingValidation, true);
  state.valid = true;
  assert.deepEqual(await stop({ turn_id: 'steered-turn' }), {});
  assert.equal(state.baseline.pendingValidation, false);
});

test('external edits after a settled turn do not block a new read-only review', async () => {
  const { prompt, stop, state } = fixture();
  await prompt();
  assert.deepEqual(await stop(), {});
  state.hash = 'human-edit-between-turns';
  await prompt({ turn_id: 'review-turn' });
  assert.deepEqual(await stop({ turn_id: 'review-turn', last_assistant_message: 'Review findings only' }), {});
  assert.equal(state.calls, 0);
});

test('report-only changes cannot use the read-only exemption', async () => {
  const { prompt, stop, state } = fixture();
  await prompt();
  state.report = 'edited-metadata';
  assert.equal((await stop()).decision, 'block');
  assert.equal(state.calls, 1);
});

test('extra PASS and whitespace changes inside final output block', async () => {
  const { prompt, stop, state } = fixture();
  await prompt();
  state.hash = 'changed';
  state.valid = true;
  assert.equal((await stop({ last_assistant_message: 'Verified output\nPASS' })).decision, 'block');
  assert.equal((await stop({ last_assistant_message: 'Verified  output' })).decision, 'block');
});

test('missing baseline requires valid report and exact output', async () => {
  const { stop, state } = fixture();
  assert.equal((await stop()).decision, 'block');
  state.valid = true;
  assert.deepEqual(await stop(), {});
});

test('valid incomplete report may be rendered truthfully', async () => {
  const { stop, state, dependencies } = fixture();
  state.valid = true;
  dependencies.renderHandoff = () => 'Blocked. Quality check failed. Deployment not performed.';
  assert.deepEqual(await stop({ last_assistant_message: 'Blocked. Quality check failed. Deployment not performed.' }), {});
});

test('unknown events and malformed identity fail closed', async () => {
  const { prompt, dependencies } = fixture();
  assert.equal((await prompt({ hook_event_name: 'Other' })).decision, 'block');
  assert.equal((await prompt({ turn_id: null })).decision, 'block');
  assert.equal((await prompt({ prompt: null })).decision, 'block');
  assert.equal((await handleHook(null, dependencies)).decision, 'block');
});

test('native CLI returns only blocking JSON for invalid stdin', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./native-hook.mjs', import.meta.url))], { input: 'not json', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).decision, 'block');
});

test('filesystem baseline stores hashed session identity atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'handoff-state-'));
  try {
    const dependencies = filesystemDependencies({}, {});
    const session = '../untrusted/session';
    const baseline = { turnId: 'turn', snapshot: 'hash', report: null };
    assert.equal(await dependencies.loadBaseline(root, session), null);
    await dependencies.saveBaseline(root, session, baseline);
    assert.deepEqual(await dependencies.loadBaseline(root, session), baseline);
    await dependencies.saveBaseline(root, session, { ...baseline, pendingValidation: true });
    assert.equal((await dependencies.loadBaseline(root, session)).pendingValidation, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('configured Windows command resolves spaced Git root from subdirectory with JSON stdin', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'handoff root with spaces '));
  try {
    const directory = join(root, 'scripts/handoff');
    const subdirectory = join(root, 'nested directory');
    await mkdir(directory, { recursive: true });
    await mkdir(subdirectory);
    assert.equal(spawnSync('git', ['init', '--quiet', root]).status, 0);
    await copyFile(fileURLToPath(new URL('./native-hook.mjs', import.meta.url)), join(directory, 'native-hook.mjs'));
    await writeFile(join(directory, 'snapshot.mjs'), "export async function captureSnapshot() { return { hash: 'unchanged', files: [] }; }\n");
    await writeFile(join(directory, 'core.mjs'), "export async function validateHandoff() { throw new Error('Unexpected validation on read-only turn.'); }\nexport function renderHandoff() { throw new Error('Unexpected rendering.'); }\n");
    const config = JSON.parse(await readFile(new URL('../../.codex/hooks.json', import.meta.url), 'utf8'));
    const command = config.hooks.UserPromptSubmit[0].hooks[0].commandWindows;
    const input = { cwd: subdirectory, session_id: 'session', turn_id: 'turn', hook_event_name: 'UserPromptSubmit', prompt: 'Review', stop_hook_active: false };
    const run = (payload) => spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { cwd: subdirectory, input: JSON.stringify(payload), encoding: 'utf8' });
    const prompt = run(input);
    assert.equal(prompt.status, 0, prompt.stderr);
    assert.deepEqual(JSON.parse(prompt.stdout), {});
    const stop = run({ ...input, hook_event_name: 'Stop', last_assistant_message: 'Read only' });
    assert.equal(stop.status, 0, stop.stderr);
    assert.deepEqual(JSON.parse(stop.stdout), {});
    const commandPrompt = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], { cwd: subdirectory, input: JSON.stringify({ ...input, hook_event_name: 'Stop', last_assistant_message: 'Read only' }), encoding: 'utf8', windowsVerbatimArguments: true });
    assert.equal(commandPrompt.status, 0, commandPrompt.stderr);
    assert.deepEqual(JSON.parse(commandPrompt.stdout), {});
  } finally { await rm(root, { recursive: true, force: true }); }
});
