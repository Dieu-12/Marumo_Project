import sql from 'mssql';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const action = process.argv[2];
const run = process.env.GITHUB_RUN_ID;
const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
if (!/^\d+$/.test(run || '') || !/^\d+$/.test(attempt)) throw new Error('CI SQL helper requires GitHub run identity.');
const name = `marumo-handoff-sql-${run}-${attempt}`;
const statePath = '.quality/sql-container.json';
const docker = (args, env = process.env) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', env, timeout: 180000 });
  if (result.error || result.status !== 0) throw new Error('Docker SQL operation failed.');
  return result.stdout.trim();
};
if (action === 'stop') {
  let state;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') process.exit(0); throw error; }
  if (state.name !== name || !/^[a-f0-9]{64}$/.test(state.id)) throw new Error('SQL container identity mismatch.');
  if (!docker(['ps', '--all', '--quiet', '--no-trunc', '--filter', 'id=' + state.id])) {
    console.log('PASS ephemeral CI SQL container already absent');
    process.exit(0);
  }
  const actual = JSON.parse(docker(['inspect', state.id]))[0];
  if (actual.Name !== '/' + name || actual.Config.Labels['marumo.handoff.run'] !== run) throw new Error('SQL container ownership mismatch.');
  docker(['rm', '--force', state.id]);
  console.log('PASS ephemeral CI SQL container removed');
} else if (action === 'start') {
  const password = randomBytes(32).toString('base64') + 'aA1!';
  console.log('::add-mask::' + password);
  await mkdir('.quality', { recursive: true });
  const id = docker(['run', '--detach', '--name', name, '--label', 'marumo.handoff.run=' + run, '--env', 'ACCEPT_EULA=Y', '--env', 'MSSQL_SA_PASSWORD', '--publish', '127.0.0.1::1433', 'mcr.microsoft.com/mssql/server:2022-latest'], { ...process.env, MSSQL_SA_PASSWORD: password });
  await writeFile(statePath, JSON.stringify({ name, id }));
  const binding = docker(['port', id, '1433/tcp']);
  const port = Number(binding.match(/:(\d+)$/)?.[1]);
  if (!Number.isInteger(port)) throw new Error('Cannot determine ephemeral SQL port.');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    let connection;
    try {
      connection = await new sql.ConnectionPool({ server: '127.0.0.1', port, user: 'sa', password, database: 'master', connectionTimeout: 2000, options: { encrypt: false, trustServerCertificate: true } }).connect();
      await connection.request().query('SELECT 1');
      ready = true;
      break;
    } catch { await new Promise((resolve) => setTimeout(resolve, 2000)); }
    finally { if (connection) await connection.close(); }
  }
  if (!ready) throw new Error('Ephemeral SQL Server did not become ready.');
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required to export ephemeral SQL credentials.');
  await appendFile(process.env.GITHUB_ENV, `SQL_TEST_SERVER=127.0.0.1\nSQL_TEST_PORT=${port}\nSQL_TEST_USER=sa\nSQL_TEST_PASSWORD=${password}\n`);
  console.log('PASS ephemeral CI SQL Server ready');
} else throw new Error('Use ci-sql.mjs start or stop.');
