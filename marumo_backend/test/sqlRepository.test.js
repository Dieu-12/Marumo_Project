import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import sql from 'mssql';
import { createSqlRepository } from '../src/repository.js';

const user = process.env.SQL_TEST_USER;
const password = process.env.SQL_TEST_PASSWORD;
if (!user || !password) throw new Error('SQL_TEST_USER and SQL_TEST_PASSWORD are required for SQL repository tests.');
const server = process.env.SQL_TEST_SERVER || 'localhost';
const port = Number(process.env.SQL_TEST_PORT || 1433);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SQL_TEST_PORT.');
const database = 'MarumoAuthTest_' + randomBytes(16).toString('hex');
if (!/^MarumoAuthTest_[a-f0-9]{32}$/.test(database)) throw new Error('Unsafe test database name.');

const masterConfig = {
  server, port, user, password, database: 'master',
  connectionTimeout: 15000, requestTimeout: 120000,
  pool: { min: 0, max: 2, idleTimeoutMillis: 300000 },
  options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
};

function batches(text) {
  return text.replace(/^\uFEFF/, '').replace(/^:ON ERROR EXIT\s*$/gmi, '').split(/^GO\s*\r?$/gmi).filter((part) => part.trim());
}

async function execute(connection, text) {
  for (const batch of batches(text)) {
    if (/^\s*(?:USE\s|(?:CREATE|ALTER|DROP)\s+DATABASE\b)/im.test(batch)) throw new Error('Unexpected database-control statement in test batch.');
    await connection.request().batch(batch);
  }
}

const master = await new sql.ConnectionPool(masterConfig).connect();
let pool;
try {
  await master.request().batch(`CREATE DATABASE [${database}] COLLATE Vietnamese_CI_AS;`);
  pool = await new sql.ConnectionPool({ ...masterConfig, database }).connect();
  const schema = await readFile(new URL('../../SQL/MarumoDB.sql', import.meta.url), 'utf8');
  const install = batches(schema);
  if (!/^SET ANSI_NULLS ON;\s*SET QUOTED_IDENTIFIER ON;\s*$/i.test(install[0].trim()) || !/^IF DB_ID\(N'MarumoDB'\) IS NULL\s+CREATE DATABASE MarumoDB COLLATE Vietnamese_CI_AS;\s*$/i.test(install[1].trim()) || !/^USE MarumoDB;\s*$/i.test(install[2].trim())) {
    throw new Error('Unexpected schema database preamble; refusing to execute.');
  }
  for (const batch of [install[0], ...install.slice(3)]) await execute(pool, batch);
} catch (error) {
  await pool?.close().catch(() => {});
  await master.request().batch(`IF DB_ID(N'${database}') IS NOT NULL BEGIN ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]; END;`).catch(() => {});
  await master.close().catch(() => {});
  throw error;
}

test.after(async () => {
  await pool?.close().catch(() => {});
  await master.request().batch(`IF DB_ID(N'${database}') IS NOT NULL BEGIN ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]; END;`);
  await master.close();
});

const at = () => Date.now();

test('customers persist with hashed passwords and normalized emails', async () => {
  const repository = createSqlRepository(pool);
  const created = await repository.createCustomer({ name: 'Marumo Customer', email: 'persist@example.com', passwordHash: '$2a$04$examplehashvalueformarumotestaccount01234567890123456789012' }, at());
  assert.ok(created.id);
  assert.equal(created.status, 'PENDING');
  const found = await repository.findCustomer('persist@example.com');
  assert.equal(found.id, created.id);
  assert.equal(found.name, 'Marumo Customer');
  assert.equal(found.status, 'PENDING');
  assert.equal(found.emailVerifiedAt, null);
  assert.equal(found.verification, null);
  await assert.rejects(
    () => repository.createCustomer({ name: 'Other', email: 'persist@example.com', passwordHash: 'x' }, at()),
    (error) => error.number === 2627 || error.number === 2601 || error.code === 'DUPLICATE_EMAIL',
  );
});

test('verification lifecycle stages, activates and consumes exactly once', async () => {
  const repository = createSqlRepository(pool);
  const customer = await repository.createCustomer({ name: 'Verify Customer', email: 'verify@example.com', passwordHash: '$2a$04$examplehashvalueformarumotestaccount01234567890123456789012' }, at());
  assert.equal(await repository.lastVerificationAt(customer.id), null);
  const tokenHash = 'a'.repeat(64);
  const expiresAt = at() + 30 * 60_000;
  const staged = await repository.stageVerification({ userId: customer.id, email: customer.email, tokenHash, expiresAt }, at());
  assert.equal(staged.tokenHash, tokenHash);
  assert.equal((await repository.findCustomer(customer.email)).verification, null);
  assert.ok(await repository.lastVerificationAt(customer.id) !== null);
  await repository.activateVerification({ userId: customer.id, tokenHash }, at());
  const activated = (await repository.findCustomer(customer.email)).verification;
  assert.equal(activated.tokenHash, tokenHash);
  const consumed = await repository.consumeVerification(tokenHash, at());
  assert.deepEqual(consumed, { userId: customer.id, email: 'verify@example.com' });
  const verified = await repository.findCustomer(customer.email);
  assert.equal(verified.status, 'ACTIVE');
  assert.ok(verified.emailVerifiedAt !== null);
  assert.equal(await repository.consumeVerification(tokenHash, at()), null);
  const replacementHash = 'b'.repeat(64);
  await repository.stageVerification({ userId: customer.id, email: customer.email, tokenHash: replacementHash, expiresAt }, at());
  assert.equal(await repository.consumeVerification(replacementHash, at()), null);
});

test('concurrent consumption of one token succeeds exactly once', async () => {
  const repository = createSqlRepository(pool);
  const customer = await repository.createCustomer({ name: 'Race Customer', email: 'race@example.com', passwordHash: '$2a$04$examplehashvalueformarumotestaccount01234567890123456789012' }, at());
  const tokenHash = 'c'.repeat(64);
  await repository.stageVerification({ userId: customer.id, email: customer.email, tokenHash, expiresAt: at() + 30 * 60_000 }, at());
  await repository.activateVerification({ userId: customer.id, tokenHash }, at());
  const first = new sql.ConnectionPool({ ...masterConfig, database }).connect();
  const second = new sql.ConnectionPool({ ...masterConfig, database }).connect();
  try {
    const [one, two] = await Promise.all([first, second]);
    const results = await Promise.all([
      createSqlRepository(one).consumeVerification(tokenHash, at()),
      createSqlRepository(two).consumeVerification(tokenHash, at()),
    ]);
    const wins = results.filter((result) => result !== null);
    assert.equal(wins.length, 1);
    assert.deepEqual(wins[0], { userId: customer.id, email: 'race@example.com' });
  } finally {
    await (await first).close();
    await (await second).close();
  }
});

test('sessions persist across a connection restart and revoke once', async () => {
  const repository = createSqlRepository(pool);
  const customer = await repository.createCustomer({ name: 'Session Customer', email: 'session@example.com', passwordHash: '$2a$04$examplehashvalueformarumotestaccount01234567890123456789012' }, at());
  const tokenHash = 'd'.repeat(64);
  const expiresAt = at() + 60 * 60_000;
  await repository.createSession({ userId: customer.id, tokenHash, expiresAt, deviceName: 'test-device', ipAddress: '127.0.0.1', userAgent: 'marumo-test' }, at());
  const before = await repository.findSession(tokenHash, at());
  assert.equal(before.userId, customer.id);
  assert.equal(before.customer.email, 'session@example.com');
  await pool.close();
  pool = await new sql.ConnectionPool({ ...masterConfig, database }).connect();
  const repositoryAfterRestart = createSqlRepository(pool);
  const after = await repositoryAfterRestart.findSession(tokenHash, at());
  assert.ok(after);
  assert.equal(after.sessionId, before.sessionId);
  assert.equal(await repositoryAfterRestart.findSession(tokenHash, at() + 61 * 60_000), null);
  assert.equal(await repositoryAfterRestart.revokeSession(tokenHash, at()), true);
  assert.equal(await repositoryAfterRestart.findSession(tokenHash, at()), null);
  assert.equal(await repositoryAfterRestart.revokeSession(tokenHash, at()), false);
});

test('login history and failure lockout update the customer row', async () => {
  const repository = createSqlRepository(pool);
  const customer = await repository.createCustomer({ name: 'Lockout Customer', email: 'lockout@example.com', passwordHash: '$2a$04$examplehashvalueformarumotestaccount01234567890123456789012' }, at());
  await repository.recordLoginResult({ userId: null, identifier: 'lockout@example.com', success: false, failureReason: 'UNKNOWN_EMAIL', ipAddress: '127.0.0.1', userAgent: 'marumo-test' }, at());
  await repository.recordLoginFailure(customer.id, { threshold: 3, lockUntil: at() + 15 * 60_000 }, at());
  await repository.recordLoginFailure(customer.id, { threshold: 3, lockUntil: at() + 15 * 60_000 }, at());
  const before = await repository.findCustomer(customer.email);
  assert.equal(before.failedLoginCount, 2);
  assert.equal(before.lockedUntil, null);
  await repository.recordLoginFailure(customer.id, { threshold: 3, lockUntil: at() + 15 * 60_000 }, at());
  const locked = await repository.findCustomer(customer.email);
  assert.equal(locked.failedLoginCount, 3);
  assert.ok(locked.lockedUntil > at());
  await repository.recordLoginSuccess(customer.id, at());
  const recovered = await repository.findCustomer(customer.email);
  assert.equal(recovered.failedLoginCount, 0);
  assert.equal(recovered.lockedUntil, null);
  assert.ok(recovered.lastLoginAt !== null);
  const history = await pool.request().query(`SELECT COUNT(*) AS total FROM dbo.user_login_history WHERE login_identifier = 'lockout@example.com';`);
  assert.equal(history.recordset[0].total, 1);
});

test('roles and permissions resolve through user_roles', async () => {
  const repository = createSqlRepository(pool);
  const customer = await repository.createCustomer({ name: 'Role Customer', email: 'roles@example.com', passwordHash: '$2a$04$examplehashvalueformarumotestaccount01234567890123456789012' }, at());
  const empty = await repository.findUserRoles(customer.id);
  assert.deepEqual(empty, { roles: [], permissions: [] });
  assert.deepEqual(await repository.findUserBranchAssignments(customer.id, at()), []);
  await pool.request().batch(`
    INSERT INTO dbo.roles (role_code, role_name, scope_type) VALUES ('BRANCH_MANAGER_TEST', N'Branch manager test', 'BRANCH');
    INSERT INTO dbo.permissions (permission_code, permission_name, resource, action) VALUES ('test.catalog.read', N'Read catalog test', 'catalog', 'read');
    INSERT INTO dbo.role_permissions (role_id, permission_id)
      SELECT r.role_id, p.permission_id
      FROM dbo.roles r CROSS JOIN dbo.permissions p
      WHERE r.role_code = 'BRANCH_MANAGER_TEST' AND p.permission_code = 'test.catalog.read';
    INSERT INTO dbo.branches (branch_code, branch_name, status) VALUES ('MRM-TST-01', N'Test branch', 'ACTIVE');
    INSERT INTO dbo.branches (branch_code, branch_name, status) VALUES ('MRM-TST-02', N'Second test branch', 'ACTIVE');
  `);
  const assignedRole = await pool.request().query(`SELECT role_id FROM dbo.roles WHERE role_code = 'BRANCH_MANAGER_TEST';`);
  await pool.request()
    .input('userId', sql.BigInt, Number(customer.id))
    .input('roleId', sql.Int, assignedRole.recordset[0].role_id)
    .query(`INSERT INTO dbo.user_roles (user_id, role_id) VALUES (@userId, @roleId);`);
  const assigned = await repository.findUserRoles(customer.id);
  assert.deepEqual(assigned.roles, [{ code: 'BRANCH_MANAGER_TEST', scopeType: 'BRANCH' }]);
  assert.deepEqual(assigned.permissions, ['test.catalog.read']);
});

test('branch assignments resolve only active rows inside their validity window', async () => {
  const repository = createSqlRepository(pool);
  const customer = await repository.createCustomer({ name: 'Branch Customer', email: 'branch@example.com', passwordHash: '$2a$04$examplehashvalueformarumotestaccount01234567890123456789012' }, at());
  const role = await pool.request().query(`SELECT role_id FROM dbo.roles WHERE role_code = 'MANAGER';`);
  const firstBranch = await pool.request().query(`SELECT branch_id FROM dbo.branches WHERE branch_code = 'MRM-TST-01';`);
  const roleId = role.recordset[0].role_id;
  const nowIso = new Date(at()).toISOString().slice(0, 19);
  const inserts = [
    ['MRM-TST-01', `'ACTIVE'`, `DATEADD(MINUTE, -10, '${nowIso}')`, 'NULL'],
    ['MRM-TST-02', `'SUSPENDED'`, `DATEADD(MINUTE, -10, '${nowIso}')`, 'NULL'],
  ];
  for (const [branchCode, status, startsAt, endsAt] of inserts) {
    await pool.request()
      .input('userId', sql.BigInt, Number(customer.id))
      .input('roleId', sql.Int, roleId)
      .input('branchCode', sql.VarChar(20), branchCode)
      .query(`INSERT INTO dbo.user_branch_assignments (user_id, branch_id, role_id, assigned_by, starts_at, ends_at, status)
        SELECT @userId, b.branch_id, @roleId, NULL, ${startsAt}, ${endsAt}, ${status}
        FROM dbo.branches b WHERE b.branch_code = @branchCode;`);
  }
  const nowAssignments = await repository.findUserBranchAssignments(customer.id, at());
  assert.equal(nowAssignments.length, 1, JSON.stringify(nowAssignments));
  assert.equal(nowAssignments[0].roleCode, 'MANAGER');
  const firstBranchId = String(firstBranch.recordset[0].branch_id);
  assert.equal(nowAssignments[0].branchId, firstBranchId);
  const ended = await pool.request()
    .input('userId', sql.BigInt, Number(customer.id))
    .query(`UPDATE dbo.user_branch_assignments SET ends_at = DATEADD(MINUTE, -5, '${nowIso}') WHERE user_id = @userId AND status = 'ACTIVE';`);
  assert.equal(ended.rowsAffected[0], 1);
  assert.deepEqual(await repository.findUserBranchAssignments(customer.id, at()), []);
});
