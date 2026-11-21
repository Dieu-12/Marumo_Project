import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inspect, extensions, isHook } from './policy.mjs';
import { ESLint } from 'eslint';
import { inspectTasks } from './tasks.mjs';
import { sources } from './git-sources.mjs';

const staged = process.argv.includes('--staged');
const errors = [];
const eslint = new ESLint();
const tasks = staged ? execFileSync('git', ['show', ':docs/TASKS.md'], { encoding: 'utf8' }) : readFileSync('docs/TASKS.md', 'utf8');
errors.push(...inspectTasks(tasks));
for (const { path, read } of sources(staged)) {
  if ((!extensions.test(path) && !isHook(path)) || /(?:^|\/)(?:node_modules|dist|build|coverage|\.agents|\.audit)\//.test(path) || /(?:package-lock\.json|bun\.lock)$/.test(path)) continue;
  const text = read();
  errors.push(...inspect(path, text));
  if (/\.(?:[cm]?js|jsx)$/.test(path)) {
    const results = await eslint.lintText(text, { filePath: path });
    for (const result of results) for (const message of result.messages) errors.push(`${path}:${message.line}: ${message.message}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS policy lint (${staged ? 'staged snapshot' : 'all owned source'})`);
