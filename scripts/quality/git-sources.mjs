import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function sources(staged, cwd = process.cwd()) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const args = staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
  return [...new Set(git(args).split('\0').filter(Boolean))].filter((path) => staged || existsSync(join(cwd, path))).map((path) => ({ path, read: () => staged ? git(['show', `:${path}`]) : readFileSync(join(cwd, path), 'utf8') }));
}
