import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, readlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const git = (cwd, args, input) => execFileSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const owned = (path) => path !== 'handoff/report.json' && !/(?:^|\/)(?:\.git|\.quality|\.audit|\.agents|node_modules|dist|build|coverage|test-results|playwright-report)(?:\/|$)/.test(path);
export function safePath(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !/[:\\]/.test(path) && !Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) && path.split('/').every((part) => part && part !== '.' && part !== '..');
}
function treeEntries(text, index = false) {
  return text.split('\0').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('\t');
    if (separator < 0) throw new Error('Malformed Git entry');
    const meta = entry.slice(0, separator).split(' ');
    const path = entry.slice(separator + 1);
    if (index && meta[2] !== '0') throw new Error('Unmerged index');
    return { path, mode: meta[0], blob: meta[index ? 1 : 2] };
  }).filter(({ path }) => owned(path));
}
export function captureSnapshot(cwd, mode = 'worktree') {
  if (!['worktree', 'index', 'commit'].includes(mode)) throw new Error('Unknown snapshot mode');
  const entries = new Map();
  if (mode === 'commit') {
    for (const entry of treeEntries(git(cwd, ['ls-tree', '-r', '-z', 'HEAD']))) entries.set(entry.path, entry);
  } else if (mode === 'index') {
    for (const entry of treeEntries(git(cwd, ['ls-files', '--stage', '-z']), true)) entries.set(entry.path, entry);
  } else {
    const tracked = new Map(treeEntries(git(cwd, ['ls-files', '--stage', '-z']), true).map((entry) => [entry.path, entry]));
    const fileMode = git(cwd, ['config', '--bool', 'core.filemode']).trim() === 'true';
    for (const path of new Set(git(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))) {
      if (!owned(path)) continue;
      if (!safePath(path)) throw new Error('Unsafe source path');
      const fullPath = join(cwd, path);
      let stat;
      try { stat = lstatSync(fullPath); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const link = stat.isSymbolicLink();
      if (!link && !stat.isFile()) throw new Error('Unsupported source file type');
      const sourceMode = link ? '120000' : fileMode ? (stat.mode & 0o111 ? '100755' : '100644') : tracked.get(path)?.mode || '100644';
      const blob = git(cwd, ['hash-object', ...(link ? [] : ['--path', path]), '--stdin'], link ? readlinkSync(fullPath) : readFileSync(fullPath)).trim();
      entries.set(path, { path, mode: sourceMode, blob });
    }
  }
  const files = [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, entry]) => {
    if (!safePath(path)) throw new Error('Unsafe source path');
    if (!['100644', '100755', '120000'].includes(entry.mode)) throw new Error('Unsupported Git file mode');
    return entry;
  });
  return { hash: digest(JSON.stringify(files)), files };
}
export function readTarget(cwd, path, mode) {
  if (!safePath(path)) throw new Error('Unsafe target path');
  return mode === 'worktree' ? readFileSync(join(cwd, path), 'utf8') : git(cwd, ['show', mode === 'index' ? `:${path}` : `HEAD:${path}`]);
}
export function changedFiles(cwd, base, snapshot) {
  const before = new Map(treeEntries(git(cwd, ['ls-tree', '-r', '-z', base])).map((entry) => [entry.path, entry]));
  const after = new Map(snapshot.files.map((entry) => [entry.path, entry]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().filter((path) => before.get(path)?.blob !== after.get(path)?.blob || before.get(path)?.mode !== after.get(path)?.mode).map((path) => {
    if (!safePath(path)) throw new Error('Unsafe source path');
    return { path, change: !after.has(path) ? 'deleted' : !before.has(path) ? 'added' : 'modified', blob: after.get(path)?.blob ?? null, mode: after.get(path)?.mode ?? null };
  });
}
