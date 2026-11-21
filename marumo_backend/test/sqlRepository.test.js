import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { test } from 'node:test';
import sql from 'mssql';
import { createSqlRepository } from '../src/repository.js';
import { parseMovieInput } from '../src/catalogValidation.js';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/tokens.js';

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

test('movies retain metadata and dates across pool restart and patch only supplied columns', async () => {
  const repository = createSqlRepository(pool);
  const movie = parseMovieInput({
    movieCode: 'SQL-MOVIE', title: 'Phim SQL', slug: 'phim-sql', durationMinutes: 135,
    originalTitle: 'Original', synopsis: 'Nội dung tiếng Việt', productionCompany: 'Hãng phim',
    directorDisplay: 'Đạo diễn', originalLanguageCode: 'vi', productionYear: 2026,
    releaseDate: '2026-12-01', endDate: '2026-12-31', status: 'COMING_SOON', isFeatured: true,
  });
  const created = await repository.createMovie(movie, at());
  assert.deepEqual(Object.fromEntries(Object.keys(movie).map((key) => [key, created[key]])), movie);
  assert.match(created.createdAt, /Z$/);
  assert.match(created.updatedAt, /Z$/);
  await pool.close();
  pool = await new sql.ConnectionPool({ ...masterConfig, database }).connect();
  const restarted = createSqlRepository(pool);
  assert.deepEqual(await restarted.findMovie(created.id), created);
  await Promise.all([
    restarted.updateMovie(created.id, parseMovieInput({ title: 'Đổi tên' }, { partial: true }), at()),
    restarted.updateMovie(created.id, parseMovieInput({ durationMinutes: 140 }, { partial: true }), at()),
  ]);
  const changed = await restarted.findMovie(created.id);
  assert.equal(changed.title, 'Đổi tên');
  assert.equal(changed.durationMinutes, 140);
  assert.equal(changed.releaseDate, movie.releaseDate);
  assert.equal(changed.synopsis, movie.synopsis);
  await assert.rejects(() => restarted.updateMovie(created.id, { endDate: '2026-11-30' }, at()), (error) => error.status === 400 && error.code === 'INVALID_INPUT');
  assert.equal((await restarted.findMovie(created.id)).endDate, '2026-12-31');
  const cleared = await restarted.updateMovie(created.id, { releaseDate: null, endDate: null, synopsis: null }, at());
  assert.equal(cleared.releaseDate, null);
  assert.equal(cleared.endDate, null);
  assert.equal(cleared.synopsis, null);
  assert.equal(await restarted.findMovie('9223372036854775807'), null);
  assert.equal(await restarted.updateMovie('9223372036854775807', { title: 'Missing' }, at()), null);
});

test('movie uniqueness and release windows are atomic across concurrent SQL writers', async () => {
  const one = await new sql.ConnectionPool({ ...masterConfig, database }).connect();
  const two = await new sql.ConnectionPool({ ...masterConfig, database }).connect();
  try {
    const first = createSqlRepository(one);
    const second = createSqlRepository(two);
    const movie = parseMovieInput({ movieCode: 'SQL-RACE', title: 'Race', slug: 'sql-race-one', durationMinutes: 100 });
    const results = await Promise.allSettled([
      first.createMovie(movie, at()),
      second.createMovie({ ...movie, slug: 'sql-race-two' }, at()),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
    const created = results.find((result) => result.status === 'fulfilled').value;
    await assert.rejects(() => first.createMovie({ ...movie, movieCode: 'SQL-OTHER', slug: created.slug }, at()), (error) => error.status === 409);
    await first.updateMovie(created.id, { releaseDate: '2026-06-01', endDate: '2026-06-30' }, at());
    const dates = await Promise.allSettled([
      first.updateMovie(created.id, { releaseDate: '2026-06-20' }, at()),
      second.updateMovie(created.id, { endDate: '2026-06-10' }, at()),
    ]);
    assert.equal(dates.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(dates.find((result) => result.status === 'rejected').reason.status, 400);
    const final = await first.findMovie(created.id);
    assert.ok(final.endDate >= final.releaseDate);
  } finally {
    await one.close();
    await two.close();
  }
});

test('global movie permissions belong to one active unrevoked GLOBAL role', async () => {
  const repository = createSqlRepository(pool);
  const actor = await repository.createCustomer({ name: 'Catalog manager', email: 'catalog-global@example.com', passwordHash: 'test' }, at());
  await pool.request().batch(`
    INSERT INTO dbo.roles (role_code, role_name, scope_type) VALUES ('CATALOG_GLOBAL_TEST', N'Global catalog test', 'GLOBAL'), ('CATALOG_BRANCH_TEST', N'Branch catalog test', 'BRANCH');
    INSERT INTO dbo.role_permissions (role_id, permission_id)
      SELECT r.role_id, p.permission_id FROM dbo.roles r CROSS JOIN dbo.permissions p
      WHERE r.role_code IN ('CATALOG_GLOBAL_TEST', 'CATALOG_BRANCH_TEST') AND p.permission_code IN ('movie.create', 'movie.update');
  `);
  await pool.request().input('userId', sql.BigInt, actor.id).query(`
    INSERT INTO dbo.user_roles (user_id, role_id)
    SELECT @userId, role_id FROM dbo.roles WHERE role_code IN ('CUSTOMER', 'CATALOG_BRANCH_TEST');
  `);
  assert.equal(await repository.hasGlobalPermission(actor.id, 'movie.create'), false);
  await pool.request().input('userId', sql.BigInt, actor.id).query(`
    INSERT INTO dbo.user_roles (user_id, role_id)
    SELECT @userId, role_id FROM dbo.roles WHERE role_code = 'CATALOG_GLOBAL_TEST';
  `);
  assert.equal(await repository.hasGlobalPermission(actor.id, 'movie.create'), true);
  assert.equal(await repository.hasGlobalPermission(actor.id, 'movie.update'), true);
  assert.equal(await repository.hasGlobalPermission(actor.id, 'not.granted'), false);
  await pool.request().query(`UPDATE dbo.roles SET is_active = 0 WHERE role_code = 'CATALOG_GLOBAL_TEST';`);
  assert.equal(await repository.hasGlobalPermission(actor.id, 'movie.create'), false);
  await pool.request().query(`UPDATE dbo.roles SET is_active = 1 WHERE role_code = 'CATALOG_GLOBAL_TEST';`);
  await pool.request().input('userId', sql.BigInt, actor.id).query(`UPDATE ur SET revoked_at = SYSUTCDATETIME() FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id = ur.role_id WHERE ur.user_id = @userId AND r.role_code = 'CATALOG_GLOBAL_TEST';`);
  assert.equal(await repository.hasGlobalPermission(actor.id, 'movie.create'), false);
});

test('SQL-backed HTTP catalog creates, updates, reads and observes permission revocation', async (t) => {
  const repository = createSqlRepository(pool);
  const actor = await repository.createCustomer({ name: 'HTTP catalog manager', email: 'catalog-http@example.com', passwordHash: 'test' }, at());
  const tokenHash = hashToken('sql-http-verification');
  await repository.stageVerification({ userId: actor.id, email: actor.email, tokenHash, expiresAt: at() + 60_000 }, at());
  await repository.activateVerification({ userId: actor.id, tokenHash }, at());
  assert.ok(await repository.consumeVerification(tokenHash, at()));
  await pool.request().input('userId', sql.BigInt, actor.id).query(`INSERT INTO dbo.user_roles (user_id, role_id) SELECT @userId, role_id FROM dbo.roles WHERE role_code = 'CATALOG_GLOBAL_TEST';`);
  const sessionToken = 'sql-http-catalog-session';
  await repository.createSession({ userId: actor.id, tokenHash: hashToken(sessionToken), expiresAt: at() + 60_000 }, at());
  const app = await createApp({ repository, bcryptRounds: 4, sendVerification: async () => {}, allowedOrigins: ['https://admin.example.com'], logger: { error: () => {} } });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: `marumo_session=${sessionToken}; marumo_csrf=sql-proof`, 'X-CSRF-Token': 'sql-proof', Origin: 'https://admin.example.com', 'Content-Type': 'application/json' };
  const create = await fetch(`${base}/admin/movies`, { method: 'POST', headers, body: JSON.stringify({ movieCode: 'SQL-HTTP', title: 'Phim qua HTTP', slug: 'sql-http', durationMinutes: 125, releaseDate: '2026-12-01', endDate: '2026-12-31' }) });
  assert.equal(create.status, 201);
  const { movie } = await create.json();
  const path = `${base}/admin/movies/${movie.id}`;
  const update = await fetch(path, { method: 'PATCH', headers, body: JSON.stringify({ title: 'Tên mới', status: 'COMING_SOON' }) });
  assert.equal(update.status, 200);
  const detail = await fetch(path, { headers });
  assert.equal(detail.status, 200);
  const stored = (await detail.json()).movie;
  assert.equal(stored.title, 'Tên mới');
  assert.equal(stored.durationMinutes, 125);
  assert.equal(stored.status, 'COMING_SOON');
  const invalid = await fetch(path, { method: 'PATCH', headers, body: JSON.stringify({ endDate: '2026-11-01' }) });
  assert.equal(invalid.status, 400);
  const error = await invalid.json();
  assert.equal(error.requestId, invalid.headers.get('x-request-id'));
  const list = await fetch(`${base}/admin/movies?status=COMING_SOON&limit=100`, { headers });
  assert.ok((await list.json()).movies.some((entry) => entry.id === movie.id && entry.title === 'Tên mới'));
  await pool.request().input('userId', sql.BigInt, actor.id).query(`UPDATE dbo.user_roles SET revoked_at = SYSUTCDATETIME() WHERE user_id = @userId;`);
  assert.equal((await fetch(path, { headers })).status, 403);
});

test('movie IDs preserve BIGINT precision in create, find, update and pagination', async () => {
  await pool.request().batch(`
    SET IDENTITY_INSERT dbo.movies ON;
    INSERT INTO dbo.movies (movie_id, movie_code, title, slug, duration_minutes)
      VALUES (9007199254740993, 'SQL-BIG-ID', N'Big ID', 'sql-big-id', 90);
    SET IDENTITY_INSERT dbo.movies OFF;
  `);
  const repository = createSqlRepository(pool);
  assert.equal((await repository.findMovie('9007199254740993')).id, '9007199254740993');
  const changed = await repository.updateMovie('9007199254740993', { title: 'Big ID changed' }, at());
  assert.equal(changed.id, '9007199254740993');
  assert.equal(changed.title, 'Big ID changed');
  const created = await repository.createMovie(parseMovieInput({ movieCode: 'SQL-BIG-NEXT', title: 'Next', slug: 'sql-big-next', durationMinutes: 91 }), at());
  assert.equal(created.id, '9007199254740994');
  const rows = await repository.listMovies({ after: '9007199254740992', limit: 1, status: null });
  assert.deepEqual(rows.map((row) => row.id), ['9007199254740993']);
  const next = await repository.listMovies({ after: rows[0].id, limit: 1, status: null });
  assert.deepEqual(next.map((row) => row.id), ['9007199254740994']);
});
