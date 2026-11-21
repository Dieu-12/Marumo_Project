import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const password = process.env.SQL_TEST_PASSWORD;
if (!process.env.SQL_TEST_USER || !password) throw new Error('SQL_TEST_USER and SQL_TEST_PASSWORD are required.');
const port = Number(process.env.SQL_TEST_PORT || 1433);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SQL_TEST_PORT.');
const config = {
  server: process.env.SQL_TEST_SERVER || 'localhost', port,
  user: process.env.SQL_TEST_USER, password,
  database: 'master', connectionTimeout: 15000, requestTimeout: 60000,
  pool: { min: 0, max: 1, idleTimeoutMillis: 300000 },
  options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
};
const database = 'MarumoIntegrityTest_' + randomUUID().replaceAll('-', '');
const master = await new sql.ConnectionPool(config).connect();
let pool;
const batches = (text) => text.replace(/^\uFEFF/, '').replace(/^:ON ERROR EXIT\s*$/gmi, '').split(/^GO\s*\r?$/gmi).filter((part) => part.trim());
const source = await readFile('SQL/MarumoDB.sql', 'utf8');
const install = batches(source);
if (!/^SET ANSI_NULLS ON;\s*SET QUOTED_IDENTIFIER ON;\s*$/i.test(install[0].trim()) || !/^IF DB_ID\(N'MarumoDB'\) IS NULL\s+CREATE DATABASE MarumoDB COLLATE Vietnamese_CI_AS;\s*$/i.test(install[1].trim()) || !/^USE MarumoDB;\s*$/i.test(install[2].trim())) {
  await master.close();
  throw new Error('Unexpected schema database preamble; refusing to execute.');
}
async function execute(text, connection = pool) {
  for (const batch of batches(text)) {
    if (/^\s*(?:USE\s|(?:CREATE|ALTER|DROP)\s+DATABASE\b)/im.test(batch)) throw new Error('Unexpected database-control statement in test batch.');
    await connection.request().batch(batch);
  }
}
async function file(name) { await execute(await readFile('SQL/tests/' + name, 'utf8')); }
async function concurrent(first, second) {
  const one = await new sql.ConnectionPool({ ...config, database }).connect();
  const two = await new sql.ConnectionPool({ ...config, database }).connect();
  try { await Promise.all([one.request().batch(first), two.request().batch(second)]); }
  finally { await Promise.all([one.close(), two.close()]); }
}
try {
  if (!/^MarumoIntegrityTest_[a-f0-9]{32}$/.test(database)) throw new Error('Unsafe test database name.');
  await master.request().batch(`CREATE DATABASE [${database}] COLLATE Vietnamese_CI_AS;`);
  pool = await new sql.ConnectionPool({ ...config, database }).connect();
  for (const batch of [install[0], ...install.slice(3)]) await execute(batch);
  console.log('PASS isolated SQL schema installation');
  const migration = await readFile('SQL/migrations/20261121_db_integrity.sql', 'utf8');
  await execute(migration);
  await execute(migration);
  await file('db_integrity.sql');
  await file('db_migration_setup.sql');
  await execute(migration);
  await file('db_migration_assert.sql');
  await file('db_concurrency_setup.sql');
  const powershell = await readFile('SQL/tests/Invoke-DbIntegrityTests.ps1', 'utf8');
  const webhook = powershell.match(/\$webhook = @'\r?\n([\s\S]*?)\r?\n'@/)?.[1];
  const allocation = powershell.match(/\$allocation = @'\r?\n([\s\S]*?)\r?\n'@/)?.[1];
  if (!webhook || !allocation) throw new Error('Concurrency fixtures are missing.');
  await concurrent(`BEGIN TRANSACTION;\n${webhook}\nWAITFOR DELAY '00:00:01'; COMMIT TRANSACTION;`, webhook);
  await concurrent(allocation.replaceAll('{BOOKING}', 'REVIEW_RACE_ONE'), allocation.replaceAll('{BOOKING}', 'REVIEW_RACE_TWO'));
  await file('db_concurrency_assert.sql');
  const normalize = (text) => text.replace(/^[\s\S]*?(?=CREATE\s+(?:OR ALTER\s+)?(?:PROCEDURE|TRIGGER)\s+dbo\.)/i, '').replace(/^CREATE OR ALTER /, 'CREATE ').replace(/\s+/g, ' ').trim();
  for (const match of source.matchAll(/^CREATE (?:PROCEDURE|TRIGGER) dbo\.(\w+)\b[\s\S]*?(?=^GO\r?$)/gm)) {
    const result = await pool.request().input('name', sql.NVarChar, 'dbo.' + match[1]).query('SELECT OBJECT_DEFINITION(OBJECT_ID(@name)) AS definition;');
    if (normalize(result.recordset[0]?.definition || '') !== normalize(match[0])) throw new Error('Migrated module differs: ' + match[1]);
  }
  console.log('PASS SQL migration reruns, functional and concurrency regressions, module parity');
} finally {
  if (pool) await pool.close();
  try { await master.request().batch(`IF DB_ID(N'${database}') IS NOT NULL BEGIN ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]; END;`); }
  finally { await master.close(); }
}
