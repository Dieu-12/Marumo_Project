import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const normalize = (text) => text.replace(/\r\n/g, '\n').trim();
const digest = (text) => createHash('sha256').update(text).digest('hex');

async function reportDigest(cwd) {
  try { return digest(await readFile(join(cwd, 'handoff/report.json'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function handleHook(input, dependencies) {
  let cwd;
  let baseline;
  try {
    if (!input || typeof input !== 'object' || typeof input.cwd !== 'string' || typeof input.session_id !== 'string' || !input.session_id || typeof input.turn_id !== 'string' || !input.turn_id) throw new Error('Missing hook identity or working directory.');
    if (!['UserPromptSubmit', 'Stop'].includes(input.hook_event_name)) throw new Error('Unsupported hook event.');
    if (input.hook_event_name === 'UserPromptSubmit' && typeof input.prompt !== 'string') throw new Error('Missing user prompt.');
    if (input.hook_event_name === 'Stop' && (typeof input.stop_hook_active !== 'boolean' || (input.last_assistant_message !== null && typeof input.last_assistant_message !== 'string'))) throw new Error('Malformed Stop event.');
    cwd = dependencies.resolveRoot(input.cwd);
    const snapshot = await dependencies.captureSnapshot(cwd, 'worktree');
    const currentReport = await dependencies.reportDigest(cwd);
    baseline = await dependencies.loadBaseline(cwd, input.session_id);
    if (input.hook_event_name === 'UserPromptSubmit') {
      const pendingValidation = baseline?.pendingValidation === true || Boolean(baseline && baseline.awaitingStop !== false && (baseline.snapshot !== snapshot.hash || baseline.report !== currentReport));
      await dependencies.saveBaseline(cwd, input.session_id, { turnId: input.turn_id, snapshot: snapshot.hash, report: currentReport, pendingValidation, awaitingStop: true });
      return {};
    }
    if (baseline && !baseline.pendingValidation && baseline.turnId === input.turn_id && baseline.snapshot === snapshot.hash && baseline.report === currentReport) {
      await dependencies.saveBaseline(cwd, input.session_id, { ...baseline, awaitingStop: false });
      return {};
    }
    const report = await dependencies.validateHandoff({ cwd, mode: 'worktree', allowIncomplete: true });
    if (typeof input.last_assistant_message !== 'string' || normalize(input.last_assistant_message) !== normalize(dependencies.renderHandoff(report, cwd))) throw new Error('Final message does not match the validated handoff. Run npm run --silent handoff:render and use its exact output.');
    await dependencies.saveBaseline(cwd, input.session_id, { turnId: input.turn_id, snapshot: snapshot.hash, report: currentReport, pendingValidation: false, awaitingStop: false });
    return {};
  } catch (error) {
    if (cwd && input?.session_id) {
      try { await dependencies.saveBaseline(cwd, input.session_id, { ...baseline, pendingValidation: true }); }
      catch { return { decision: 'block', reason: 'Handoff validation failed. Unable to persist hook state.' }; }
    }
    return { decision: 'block', reason: `Handoff validation failed. ${error.message}` };
  }
}

export function filesystemDependencies(core, snapshot) {
  const baselinePath = (cwd, session) => join(cwd, '.quality/turns', `${digest(session)}.json`);
  return {
    ...core,
    captureSnapshot: snapshot.captureSnapshot,
    resolveRoot(cwd) { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); },
    reportDigest,
    async loadBaseline(cwd, session) {
      try { return JSON.parse(await readFile(baselinePath(cwd, session), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async saveBaseline(cwd, session, baseline) {
      const path = baselinePath(cwd, session);
      await mkdir(join(cwd, '.quality/turns'), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(baseline));
      await rename(temporary, path);
    },
  };
}

async function main() {
  try {
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    const input = JSON.parse(text);
    const [core, snapshot] = await Promise.all([import('./core.mjs'), import('./snapshot.mjs')]);
    process.stdout.write(JSON.stringify(await handleHook(input, filesystemDependencies(core, snapshot))));
  } catch (error) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `Handoff validation failed. ${error.message}` }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
