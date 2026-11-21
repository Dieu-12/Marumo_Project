import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

test('sign-in publishes server roles immediately and keeps JWT and credentials out of browser storage', async (t) => {
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  const writes = [];
  globalThis.document = { cookie: 'marumo_csrf=proof-from-cookie' };
  globalThis.localStorage = { setItem: (...args) => writes.push(args), getItem: () => null };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });
  const authorization = {
    roles: [{ code: 'MANAGER', scopeType: 'BRANCH' }],
    permissions: ['showtime.create'],
    branchAssignments: [{ assignmentId: '7', branchId: '3', roleCode: 'MANAGER' }],
  };
  const customer = { id: '15', name: 'Manager', email: 'manager@example.com' };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url === '/auth/session') return new Response(JSON.stringify({ code: 'SESSION_INVALID' }), { status: 401 });
    if (url === '/auth/login') return new Response(JSON.stringify({ customer, ...authorization }), { status: 200 });
    if (url === '/auth/logout') return new Response(null, { status: 204 });
    throw new Error('Unexpected auth request');
  });
  const { authStore } = await import('./authStore.js');
  await setImmediate();
  assert.equal(authStore.getSnapshot().user, null);
  let notifications = 0;
  const unsubscribe = authStore.subscribe(() => { notifications += 1; });
  assert.deepEqual(await authStore.signIn({ email: customer.email, password: 'test-passphrase-123' }), { ok: true });
  const signedIn = authStore.getSnapshot();
  assert.equal(signedIn.user.id, customer.id);
  assert.deepEqual(signedIn.roles, authorization.roles);
  assert.deepEqual(signedIn.permissions, authorization.permissions);
  assert.deepEqual(signedIn.branchAssignments, authorization.branchAssignments);
  assert.equal(notifications, 1);
  assert.equal(JSON.stringify(signedIn).includes('test-passphrase-123'), false);
  assert.equal('token' in signedIn, false);
  assert.deepEqual(writes, []);
  assert.equal(calls.find((call) => call.url === '/auth/login').options.credentials, 'same-origin');
  assert.deepEqual(await authStore.signOut(), { ok: true });
  assert.equal(authStore.getSnapshot().user, null);
  assert.deepEqual(authStore.getSnapshot().roles, []);
  assert.equal(calls.find((call) => call.url === '/auth/logout').options.headers['X-CSRF-Token'], 'proof-from-cookie');
  unsubscribe();
  authStore.awardPoints(1);
  assert.equal(notifications, 2);
  assert.deepEqual(writes, []);
});
