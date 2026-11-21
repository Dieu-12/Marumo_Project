import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repository.js';

const credentials = { email: 'customer@example.com', password: 'test-passphrase-123' };

async function fixture(t, { sessionTtlMs = 60_000, loginLockoutThreshold = 10, allowedOrigins = [] } = {}) {
  let now = 10_000;
  const repository = createMemoryRepository('test');
  const tokens = [];
  const app = await createApp({
    repository, bcryptRounds: 4, tokenTtlMs: 120_000, resendCooldownMs: 60_000,
    sessionTtlMs, loginLockoutThreshold, loginLockoutMs: 15 * 60_000, allowedOrigins,
    now: () => now,
    sendVerification: async (message) => { tokens.push(message.token); },
    logger: { error: () => {} },
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const options = { method, headers };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, options);
    return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
  }
  function cookieJar(res) {
    const jar = {};
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      jar[pair.slice(0, index).trim()] = { value: pair.slice(index + 1).trim(), attributes: cookie.slice(pair.length) };
    }
    return jar;
  }
  function cookieHeader(jar) {
    return Object.entries(jar).map(([name, { value }]) => `${name}=${value}`).join('; ');
  }
  async function verifiedCustomer() {
    await request('/auth/register', { method: 'POST', body: credentials });
    await request('/auth/verify-email', { method: 'POST', body: { token: tokens[0] } });
  }
  async function signIn() {
    return cookieJar(await request('/auth/login', { method: 'POST', body: credentials }));
  }
  return { request, cookieJar, cookieHeader, verifiedCustomer, signIn, advance: (ms) => { now += ms; } };
}

test('login issues HttpOnly session and readable CSRF cookies; session resolves the customer', async (t) => {
  const f = await fixture(t);
  await f.verifiedCustomer();
  assert.equal((await f.request('/auth/session')).status, 401);
  const jar = await f.signIn();
  assert.match(jar.marumo_session.attributes, /HttpOnly/i);
  assert.match(jar.marumo_session.attributes, /SameSite=Lax/i);
  assert.ok(!/HttpOnly/i.test(jar.marumo_csrf.attributes));
  const session = await f.request('/auth/session', { headers: { Cookie: f.cookieHeader(jar) } });
  assert.equal(session.status, 200);
  assert.deepEqual(Object.keys(session.body.customer).sort(), ['email', 'id', 'name']);
  assert.deepEqual(session.body.roles, []);
  assert.deepEqual(session.body.permissions, []);
  assert.deepEqual(session.body.branchAssignments, []);
  const second = await f.signIn();
  assert.notEqual(second.marumo_session.value, jar.marumo_session.value);
});

test('logout requires the CSRF proof and revokes the session server-side', async (t) => {
  const f = await fixture(t);
  await f.verifiedCustomer();
  const jar = await f.signIn();
  const cookie = f.cookieHeader(jar);
  assert.equal((await f.request('/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status, 403);
  assert.equal((await f.request('/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': 'wrong-proof' } })).status, 403);
  const logout = await f.request('/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': jar.marumo_csrf.value } });
  assert.equal(logout.status, 204);
  assert.equal((await f.request('/auth/session', { headers: { Cookie: cookie } })).status, 401);
  assert.equal((await f.request('/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': jar.marumo_csrf.value } })).status, 401);
});

test('logout rejects an origin outside the configured allowlist', async (t) => {
  const f = await fixture(t, { allowedOrigins: ['http://localhost:5173'] });
  await f.verifiedCustomer();
  const jar = await f.signIn();
  const headers = { Cookie: f.cookieHeader(jar), 'X-CSRF-Token': jar.marumo_csrf.value };
  assert.equal((await f.request('/auth/logout', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request('/auth/logout', { method: 'POST', headers: { ...headers, Origin: 'http://localhost:5173' } })).status, 204);
});

test('sessions expire at the configured boundary', async (t) => {
  const f = await fixture(t, { sessionTtlMs: 60_000 });
  await f.verifiedCustomer();
  const jar = await f.signIn();
  const cookie = f.cookieHeader(jar);
  assert.equal((await f.request('/auth/session', { headers: { Cookie: cookie } })).status, 200);
  f.advance(60_000);
  assert.equal((await f.request('/auth/session', { headers: { Cookie: cookie } })).status, 401);
});

test('repeated password failures lock the account before correct credentials are accepted', async (t) => {
  const f = await fixture(t, { loginLockoutThreshold: 3 });
  await f.verifiedCustomer();
  for (let i = 0; i < 3; i++) {
    assert.equal((await f.request('/auth/login', { method: 'POST', body: { ...credentials, password: 'wrong-passphrase' } })).status, 401);
  }
  const locked = await f.request('/auth/login', { method: 'POST', body: credentials });
  assert.equal(locked.status, 403);
  assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
});
