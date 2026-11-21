import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { decodeJwt, SignJWT } from 'jose';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repository.js';
import { hashToken } from '../src/tokens.js';
import { testSession } from './support/sessionOptions.js';

const credentials = { email: 'jwt@example.com', password: 'jwt-test-passphrase-123' };

async function fixture(t, { cookie, ttlSeconds = 60, at = 10000 } = {}) {
  let now = at;
  const repository = createMemoryRepository('jwt-test');
  const customer = await repository.createCustomer({ ...credentials, name: 'JWT customer', passwordHash: await bcrypt.hash(credentials.password, 4) }, now);
  await repository.stageVerification({ userId: customer.id, email: customer.email, tokenHash: 'verification', expiresAt: now + 60_000 }, now);
  await repository.activateVerification({ userId: customer.id, tokenHash: 'verification' }, now);
  await repository.consumeVerification('verification', now);
  const authorization = { roles: [{ code: 'ADMIN', scopeType: 'GLOBAL' }], permissions: ['movie.create', 'movie.update'] };
  repository.findUserRoles = async () => ({ roles: [...authorization.roles], permissions: [...authorization.permissions] });
  repository.hasGlobalPermission = async (_userId, permission) => authorization.permissions.includes(permission);
  const sessions = [];
  const createSession = repository.createSession;
  repository.createSession = async (value, at) => {
    sessions.push(value);
    return createSession(value, at);
  };
  const app = await createApp({
    repository, session: testSession(ttlSeconds, cookie), now: () => now, bcryptRounds: 4,
    allowedOrigins: ['https://admin.example.com'], logger: { error: () => {} },
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(base + path, {
      method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  }
  async function login() {
    const response = await request('/auth/login', { method: 'POST', body: credentials });
    assert.equal(response.status, 200);
    const jar = Object.fromEntries(response.headers.getSetCookie().map((value) => {
      const [pair] = value.split(';');
      const index = pair.indexOf('=');
      return [pair.slice(0, index), pair.slice(index + 1)];
    }));
    return { response, token: jar.marumo_session, jar, cookie: Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ') };
  }
  return { request, login, repository, authorization, customer, sessions, now: () => now, advance: (ms) => { now += ms; } };
}

test('JWT is held only in configured HttpOnly cookie and its hash/expiry bind the DB session', async (t) => {
  const f = await fixture(t, { cookie: { secure: true, sameSite: 'Strict' } });
  const signedIn = await f.login();
  assert.equal(signedIn.token.split('.').length, 3);
  const claims = decodeJwt(signedIn.token);
  assert.equal(claims.sub, f.customer.id);
  assert.deepEqual(claims.roles, ['ADMIN']);
  assert.equal(claims.iss, 'marumo-api');
  assert.equal(claims.aud, 'marumo-browser');
  assert.equal(claims.exp - claims.iat, 60);
  assert.deepEqual(signedIn.response.body.roles, f.authorization.roles);
  assert.deepEqual(signedIn.response.body.permissions, f.authorization.permissions);
  assert.deepEqual(signedIn.response.body.branchAssignments, []);
  assert.equal(JSON.stringify(signedIn.response.body).includes(signedIn.token), false);
  assert.equal(f.sessions[0].tokenHash, hashToken(signedIn.token));
  assert.equal(f.sessions[0].expiresAt, claims.exp * 1000);
  const cookies = signedIn.response.headers.getSetCookie();
  assert.match(cookies[0], /Max-Age=60; Path=\/; HttpOnly; SameSite=Strict; Secure/);
  assert.equal(/HttpOnly/i.test(cookies[1]), false);
  assert.match(cookies[1], /SameSite=Strict; Secure/);
  assert.equal((await f.request('/auth/session', { headers: { Cookie: signedIn.cookie } })).status, 200);
  f.advance(60_000);
  assert.equal((await f.request('/auth/session', { headers: { Cookie: signedIn.cookie } })).status, 401);
});

test('JWT verification rejects forged or invalid claims before any session lookup', async (t) => {
  const f = await fixture(t);
  const signedIn = await f.login();
  const claims = decodeJwt(signedIn.token);
  const key = new TextEncoder().encode(testSession().jwtSecret);
  const sign = (payload, header = { alg: 'HS256', typ: 'marumo-session+jwt' }, signingKey = key) => new SignJWT(payload).setProtectedHeader(header).sign(signingKey);
  const invalid = [
    'old-opaque-session-token',
    signedIn.token.slice(0, -10) + 'A'.repeat(10),
    `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'marumo-session+jwt' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`,
    await sign(claims, { alg: 'HS384', typ: 'marumo-session+jwt' }),
    await sign(claims, { alg: 'HS256', typ: 'JWT' }),
    await sign(claims, undefined, new TextEncoder().encode('other-test-only-signing-secret-01234567890123456789')),
  ];
  for (const patch of [
    { iss: 'another-api' }, { aud: 'another-browser' }, { sub: 1 }, { sub: '01' }, { sub: '9223372036854775808' },
    { jti: '' }, { roles: 'ADMIN' }, { roles: [1] }, { roles: [''] }, { iat: claims.iat + 1 },
    { iat: 1.5 }, { exp: claims.exp + 0.5 }, { exp: claims.iat },
  ]) invalid.push(await sign({ ...claims, ...patch }));
  for (const key of ['sub', 'jti', 'iat', 'exp', 'roles']) {
    const incomplete = { ...claims };
    delete incomplete[key];
    invalid.push(await sign(incomplete));
  }
  let lookups = 0;
  f.repository.findSession = async () => { lookups += 1; throw new Error('A rejected JWT must not reach SQL'); };
  for (const token of invalid) {
    const response = await f.request('/auth/session', { headers: { Cookie: `marumo_session=${token}` } });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'SESSION_INVALID');
  }
  assert.equal(lookups, 0);
});

test('one-second fractional issuance stays usable until exact JWT expiry and thirty-day tokens verify', async (t) => {
  const fractional = await fixture(t, { ttlSeconds: 1, at: 10050 });
  const signedIn = await fractional.login();
  const claims = decodeJwt(signedIn.token);
  assert.equal(claims.exp - claims.iat, 1);
  assert.ok(signedIn.response.headers.getSetCookie()[0].includes('Max-Age=1;'));
  fractional.advance(949);
  assert.equal((await fractional.request('/auth/session', { headers: { Cookie: signedIn.cookie } })).status, 200);
  fractional.advance(1);
  assert.equal((await fractional.request('/auth/session', { headers: { Cookie: signedIn.cookie } })).status, 401);
  const maximum = await fixture(t, { ttlSeconds: 30 * 86400 });
  const longest = await maximum.login();
  const longClaims = decodeJwt(longest.token);
  assert.equal(longClaims.exp - longClaims.iat, 30 * 86400);
  assert.equal((await maximum.request('/auth/session', { headers: { Cookie: longest.cookie } })).status, 200);
});

test('signed subject and expiry must match the persisted session and DB failure remains 500', async (t) => {
  const f = await fixture(t);
  const signedIn = await f.login();
  const findSession = f.repository.findSession;
  for (const patch of [{ userId: '2' }, { expiresAt: 100000 }]) {
    f.repository.findSession = async (...args) => ({ ...await findSession(...args), ...patch });
    assert.equal((await f.request('/auth/session', { headers: { Cookie: signedIn.cookie } })).status, 401);
  }
  f.repository.findSession = async () => { throw new Error('private database failure'); };
  const failed = await f.request('/auth/session', { headers: { Cookie: signedIn.cookie } });
  assert.equal(failed.status, 500);
  assert.equal(failed.body.code, 'INTERNAL');
  assert.equal(JSON.stringify(failed.body).includes('private database failure'), false);
});

test('live authorization replaces the JWT role snapshot and logout revokes only its own login', async (t) => {
  const f = await fixture(t);
  const [first, second] = await Promise.all([f.login(), f.login()]);
  assert.notEqual(first.token, second.token);
  assert.notEqual(decodeJwt(first.token).jti, decodeJwt(second.token).jti);
  assert.equal(f.sessions.length, 2);
  f.authorization.roles = [];
  f.authorization.permissions = [];
  const current = await f.request('/auth/session', { headers: { Cookie: first.cookie } });
  assert.equal(current.status, 200);
  assert.deepEqual(current.body.roles, []);
  assert.deepEqual(current.body.permissions, []);
  assert.deepEqual(decodeJwt(first.token).roles, ['ADMIN']);
  assert.equal((await f.request('/admin/movies', { headers: { Cookie: first.cookie } })).status, 403);
  const logoutHeaders = { Cookie: first.cookie, Origin: 'https://admin.example.com', 'X-CSRF-Token': first.jar.marumo_csrf };
  const logout = await f.request('/auth/logout', { method: 'POST', headers: logoutHeaders });
  assert.equal(logout.status, 204);
  assert.ok(logout.headers.getSetCookie().every((value) => value.includes('Max-Age=0') && value.includes('Path=/') && value.includes('SameSite=Lax')));
  assert.equal((await f.request('/auth/session', { headers: { Cookie: first.cookie } })).status, 401);
  assert.equal((await f.request('/auth/session', { headers: { Cookie: second.cookie } })).status, 200);
});
