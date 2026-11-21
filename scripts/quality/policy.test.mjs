import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect, isHook } from './policy.mjs';
import { inspectTasks } from './tasks.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { sources } from './git-sources.mjs';
for (const [path, text] of [
  ['x.jsx', "import { useEffect as run } from 'react';"],
  ['x.jsx', "React['useEffect'](() => {});"],
  ['x.jsx', "import * as R from 'react'; R.useEffect(() => {});"],
  ['x.jsx', "const {useEffect: run} = React;"],
  ['x.jsx', "export {useEffect as run} from 'react';"],
  ['x.js', 'const x = 1; // forbidden'],
  ['x.css', 'a { /* forbidden */ color: red; }'],
  ['x.html', '<!-- forbidden -->'],
  ['x.html', '<template><!-- forbidden --></template>'],
  ['x.html', '<script>const x=1; // forbidden\n</script>'],
  ['x.html', '<style>a{/* forbidden */color:red}</style>'],
  ['x.sql', 'SELECT 1; -- forbidden'],
  ['x.ps1', '$x=1 # forbidden'],
  ['x.yaml', 'name: test # forbidden'],
]) test(`reject ${path}: ${text}`, () => assert.ok(inspect(path, text).length));
for (const [path, text] of [
  ['x.jsx', 'const url = "https://example.test"; const view = <p>{url}</p>;'],
  ['x.sql', "SELECT '-- literal', '/* literal */', [--identifier];"],
  ['x.css', 'a::before { content: "/* literal */"; }'],
  ['x.ps1', '$value="literal # text"'],
  ['x.ps1', '$value=@"\n"literal" # text\n"@'],
  ['x.js', 'const word="useEffect";'],
  ['x.ts', 'export const identity = <T>(value: T) => value;'],
]) test(`accept ${path}`, () => assert.deepEqual(inspect(path, text), []));
test('computed effect alias is rejected', () => assert.ok(inspect('x.js', "React['use' + 'Effect'](() => {});").length));
test('variable and namespace aliases cannot conceal effect hooks', () => {
  assert.ok(inspect('x.js', "import * as React from 'react'; const name='useEffect'; React[name](()=>{});").length);
  assert.ok(inspect('x.js', "const R=require('react'); const alias=R; const name='useEffect'; alias[name](()=>{});").length);
  assert.ok(inspect('x.js', "import * as R from 'react'; const key='useEffect'; const {[key]:run}=R;").length);
});
test('verified tasks require evidence', () => assert.ok(inspectTasks('| QG-001 | verified | - | files | npm test | - |').length));
test('valid task table passes', () => assert.deepEqual(inspectTasks('| QG-001 | planned | - | files | npm test | - |'), []));
test('task dependencies and verification evidence cannot be placeholders', () => {
  assert.ok(inspectTasks('| A-001 | planned | TYPO | feature | npm test | - |').length);
  assert.ok(inspectTasks('| A-001 | verified | - | feature | npm test | Chưa có |').length);
  assert.ok(inspectTasks('| A-001 | verified | - | feature | npm test | PASS |').length);
  assert.deepEqual(inspectTasks('| A-001 | verified | - | feature | npm test | npm run check PASS |'), []);
});
test('hook interpreter directives pass but shell comments fail', () => {
  assert.equal(isHook('.githooks/pre-commit'), true);
  assert.deepEqual(inspect('.githooks/pre-commit', '#!/bin/sh\nset -eu\nprintf "%s" "literal # text"\n'), []);
  assert.ok(inspect('.githooks/pre-commit', '#!/bin/sh\n# forbidden\nset -eu\n').length);
});
test('hook installation is repeatable and preserves an existing default hook', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'marumo-hooks-'));
  const installer = resolve('scripts/quality/install-hooks.mjs');
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init');
    mkdirSync(join(cwd, '.githooks'));
    for (const name of ['pre-commit', 'pre-push']) writeFileSync(join(cwd, '.githooks', name), '#!/bin/sh\nexit 0\n');
    writeFileSync(join(cwd, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 0\n');
    assert.throws(() => execFileSync(process.execPath, [installer], { cwd, stdio: 'pipe' }), /Command failed/);
    rmSync(join(cwd, '.git/hooks/pre-commit'));
    execFileSync(process.execPath, [installer], { cwd, stdio: 'pipe' });
    execFileSync(process.execPath, [installer], { cwd, stdio: 'pipe' });
    assert.equal(git('config', '--get', 'core.hooksPath').toString().trim(), '.githooks');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test('staged checks read the index rather than unstaged content', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'marumo-policy-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init');
    writeFileSync(join(cwd, 'x.js'), 'const value = 1; // forbidden');
    git('add', 'x.js');
    writeFileSync(join(cwd, 'x.js'), 'const value = 1;');
    assert.ok(inspect('x.js', sources(true, cwd)[0].read()).length);
    git('add', 'x.js');
    writeFileSync(join(cwd, 'x.js'), 'const value = 1; // forbidden');
    assert.deepEqual(inspect('x.js', sources(true, cwd)[0].read()), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('working tree deletions do not erase the staged lint target', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'marumo-deletion-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init');
    writeFileSync(join(cwd, 'x.js'), 'const value=1;');
    git('add', 'x.js');
    rmSync(join(cwd, 'x.js'));
    assert.deepEqual(sources(false, cwd), []);
    assert.equal(sources(true, cwd)[0].read().trim(), 'const value=1;');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
