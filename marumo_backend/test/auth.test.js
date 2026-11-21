import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repository.js';

const credentials = { email: 'customer@example.com', password: 'test-passphrase-123' };
const root = '/auth';

async function fixture(t, { sendVerification } = {}) {
  let now = 10_000;
  const repository = createMemoryRepository('test');
  const deliveries = [];
  const messages = [];
  const errors = [];
  const app = await createApp({
    repository, bcryptRounds: 4, tokenTtlMs: 120_000, resendCooldownMs: 60_000,
    now: () => now,
    sendVerification: async (message) => {
      deliveries.push(message);
      await sendVerification?.(message);
      messages.push(message);
    },
    logger: { error: (message) => errors.push(message) },
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body) {
    const options = body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    };
    const res = await fetch(base + path, options);
    return { status: res.status, body: await res.json(), headers: res.headers };
  }
  async function waitUntil(check) {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      await setTimeout(5);
    }
    assert.fail('Background verification delivery did not settle');
  }
  async function latestToken(count = 1) {
    const digest = (token) => createHash('sha256').update(token).digest('hex');
    await waitUntil(async () => messages.length >= count
      && (await repository.findCustomer(credentials.email)).verification?.tokenHash
      === digest(messages[count - 1].token));
    return messages[count - 1].token;
  }
  return {
    request, repository, deliveries, errors, waitUntil, latestToken,
    advance(ms) { now += ms; },
  };
}

test('health and registration: normalize email, hash password, store only token hash', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.request('/health')).body, { status: 'ok' });
  const registration = await f.request(root + '/register', {
    ...credentials, email: ' CUSTOMER@example.com ', name: 'Marumo Customer',
  });
  assert.equal(registration.status, 202);
  const token = await f.latestToken();
  const customer = await f.repository.findCustomer(credentials.email);
  assert.equal(customer.name, 'Marumo Customer');
  assert.equal(customer.emailVerifiedAt, null);
  assert.ok(await bcrypt.compare(credentials.password, customer.passwordHash));
  assert.match(customer.passwordHash, /^\$2[aby]\$/);
  assert.equal(customer.verification.tokenHash, createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(customer).includes(token));
  const duplicate = await f.request(root + '/register', { ...credentials, password: 'different-password' });
  assert.equal(duplicate.status, registration.status);
  assert.deepEqual(duplicate.body, registration.body);
  assert.equal((await f.repository.findCustomer(credentials.email)).passwordHash, customer.passwordHash);
  assert.equal(f.deliveries.length, 1);
});

test('tokens expire at the boundary; only one concurrent verification succeeds', async (t) => {
  const f = await fixture(t);
  await f.request(root + '/register', credentials);
  const token = await f.latestToken();
  f.advance(120_000);
  assert.equal((await f.request(root + '/verify-email', { token })).status, 400);
  await f.request(root + '/resend-verification', { email: credentials.email });
  const replacement = await f.latestToken(2);
  assert.notEqual(replacement, token);
  const results = await Promise.all([
    f.request(root + '/verify-email', { token: replacement }),
    f.request(root + '/verify-email', { token: replacement }),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 400]);
  assert.equal((await f.request(root + '/verify-email', { token })).status, 400);
});

test('login gates correct credentials on verification and never returns a hash', async (t) => {
  const f = await fixture(t);
  await f.request(root + '/register', credentials);
  const token = await f.latestToken();
  assert.equal((await f.request(root + '/login', credentials)).status, 403);
  const wrong = await f.request(root + '/login', { ...credentials, password: 'wrong-password' });
  const missing = await f.request(root + '/login', { ...credentials, email: 'unknown@example.com' });
  assert.equal(wrong.status, 401);
  assert.deepEqual({ code: wrong.body.code, message: wrong.body.message }, { code: missing.body.code, message: missing.body.message });
  assert.equal(wrong.body.requestId, wrong.headers.get('x-request-id'));
  assert.equal(missing.body.requestId, missing.headers.get('x-request-id'));
  await f.request(root + '/verify-email', { token });
  const login = await f.request(root + '/login', credentials);
  assert.equal(login.status, 200);
  assert.deepEqual(Object.keys(login.body.customer).sort(), ['email', 'id', 'name']);
});

test('failed initial delivery is throttled and can be retried with a generic response', async (t) => {
  let attempt = 0;
  const f = await fixture(t, { sendVerification: () => {
    if (++attempt === 1) throw new Error('fixture SMTP failure');
  } });
  const { email } = credentials;
  const resend = (address) => f.request(root + '/resend-verification', { email: address });
  assert.equal((await f.request(root + '/register', credentials)).status, 202);
  await f.waitUntil(() => f.errors.length === 1);
  assert.equal((await f.repository.findCustomer(email)).verification, null);
  assert.equal((await f.request(root + '/login', credentials)).status, 403);
  const unknown = await resend('unknown@example.com');
  const throttled = await resend(email.toUpperCase());
  assert.equal(throttled.status, 202);
  assert.deepEqual(throttled.body, unknown.body);
  assert.equal(attempt, 1);
  f.advance(60_000);
  const retried = await resend(email);
  assert.equal(retried.status, unknown.status);
  assert.deepEqual(retried.body, unknown.body);
  const token = await f.latestToken();
  assert.equal((await f.request(root + '/verify-email', { token })).status, 200);
  assert.deepEqual((await resend(email)).body, unknown.body);
  assert.equal(attempt, 2);
});

test('failed replacement preserves the previous token and coalesces concurrent sends', async (t) => {
  let failDelivery;
  const failure = new Promise((resolve) => { failDelivery = resolve; });
  let attempt = 0;
  const f = await fixture(t, { sendVerification: async () => {
    if (++attempt === 2) {
      await failure;
      throw new Error('fixture SMTP failure');
    }
  } });
  t.after(failDelivery);
  await f.request(root + '/register', credentials);
  const token = await f.latestToken();
  f.advance(60_000);
  const resend = () => f.request(root + '/resend-verification', { email: credentials.email });
  const requests = await Promise.all([resend(), resend()]);
  assert.ok(requests.every(({ status }) => status === 202));
  await f.waitUntil(() => attempt === 2);
  failDelivery();
  await f.waitUntil(() => f.errors.length === 1);
  assert.equal(attempt, 2);
  assert.equal((await f.request(root + '/verify-email', { token })).status, 200);
});

test('rejects invalid inputs and applies a per-IP login rate limit', async (t) => {
  const f = await fixture(t);
  for (const body of [
    { ...credentials, email: 'x\r\n@example.com' },
    { ...credentials, password: 'é'.repeat(37) },
    { ...credentials, password: 'short' },
    { ...credentials, role: 'admin' },
  ]) assert.equal((await f.request(root + '/register', body)).status, 400);
  for (let i = 0; i < 10; i++) {
    assert.equal((await f.request(root + '/login', credentials)).status, 401);
  }
  const limited = await f.request(root + '/login', credentials);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});
