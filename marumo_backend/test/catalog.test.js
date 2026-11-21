import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repository.js';
import { testSession } from './support/sessionOptions.js';

const MOVIE = { movieCode: 'MRM-001', title: 'Một bộ phim', slug: 'mot-bo-phim', durationMinutes: 120 };

async function fixture(t, { allowedOrigins = ['https://admin.example.com'] } = {}) {
  let now = Date.UTC(2026, 10, 21);
  const repository = createMemoryRepository('catalog-test');
  const permissions = new Set(['movie.create', 'movie.update']);
  repository.hasGlobalPermission = async (_userId, code) => permissions.has(code);
  const verification = [];
  const app = await createApp({
    repository, now: () => now, bcryptRounds: 4, allowedOrigins, session: testSession(),
    sendVerification: async (message) => { verification.push(message.token); }, logger: { error: () => {} },
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const credentials = { email: 'catalog@example.com', password: 'catalog-passphrase-123' };
  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
  }
  assert.equal((await request('/auth/register', { method: 'POST', body: credentials })).status, 202);
  assert.equal((await request('/auth/verify-email', { method: 'POST', body: { token: verification[0] } })).status, 200);
  const login = await request('/auth/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie().map((value) => value.split(';')[0]);
  const cookie = cookies.join('; ');
  const csrf = cookies.find((value) => value.startsWith('marumo_csrf=')).slice('marumo_csrf='.length);
  const readHeaders = { Cookie: cookie };
  const writeHeaders = { ...readHeaders, 'X-CSRF-Token': csrf, Origin: 'https://admin.example.com' };
  return {
    request, repository, permissions, readHeaders, writeHeaders, credentials,
    advance: (ms) => { now += ms; }, now: () => now,
    create: (body = MOVIE) => request('/admin/movies', { method: 'POST', body, headers: writeHeaders }),
  };
}

test('movies persist through create, detail, paginated list and partial update HTTP routes', async (t) => {
  const f = await fixture(t);
  const created = await f.create({ ...MOVIE, movieCode: ' mrm-001 ', slug: ' Mot-Bo-Phim ', title: ' Một bộ phim ', releaseDate: '2026-12-01', endDate: '2026-12-31' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), `/admin/movies/${created.body.movie.id}`);
  assert.equal(created.body.movie.movieCode, 'MRM-001');
  assert.equal(created.body.movie.slug, 'mot-bo-phim');
  assert.equal(created.body.movie.title, 'Một bộ phim');
  assert.equal(created.body.movie.status, 'DRAFT');
  assert.equal(created.body.movie.isFeatured, false);
  assert.equal(created.body.movie.originalTitle, null);
  assert.match(created.body.movie.createdAt, /Z$/);
  assert.equal(typeof created.body.movie.id, 'string');
  const path = `/admin/movies/${created.body.movie.id}`;
  assert.deepEqual((await f.request(path, { headers: f.readHeaders })).body, created.body);
  f.advance(1000);
  const updated = await f.request(path, { method: 'PATCH', headers: f.writeHeaders, body: { synopsis: 'Nội dung', status: 'COMING_SOON', isFeatured: true } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.movie.title, created.body.movie.title);
  assert.equal(updated.body.movie.releaseDate, '2026-12-01');
  assert.equal(updated.body.movie.synopsis, 'Nội dung');
  assert.equal(updated.body.movie.status, 'COMING_SOON');
  assert.equal(updated.body.movie.isFeatured, true);
  assert.notEqual(updated.body.movie.updatedAt, created.body.movie.updatedAt);
  const second = await f.create({ ...MOVIE, movieCode: 'MRM-002', slug: 'second' });
  const firstPage = await f.request('/admin/movies?limit=1', { headers: f.readHeaders });
  assert.equal(firstPage.status, 200);
  assert.deepEqual(firstPage.body.movies, [updated.body.movie]);
  assert.equal(firstPage.body.nextAfter, created.body.movie.id);
  const secondPage = await f.request(`/admin/movies?limit=1&after=${firstPage.body.nextAfter}`, { headers: f.readHeaders });
  assert.deepEqual(secondPage.body.movies, [second.body.movie]);
  assert.equal(secondPage.body.nextAfter, null);
  const filtered = await f.request('/admin/movies?status=COMING_SOON', { headers: f.readHeaders });
  assert.deepEqual(filtered.body.movies, [updated.body.movie]);
});

test('catalog rejects anonymous, expired, revoked, disabled and temporarily locked sessions', async (t) => {
  const f = await fixture(t);
  for (const [path, method] of [['/admin/movies', 'GET'], ['/admin/movies', 'POST'], ['/admin/movies/1', 'GET'], ['/admin/movies/1', 'PATCH']]) {
    assert.equal((await f.request(path, { method, ...(method === 'GET' ? {} : { body: MOVIE }) })).status, 401);
  }
  const customer = await f.repository.findCustomer(f.credentials.email);
  await f.repository.recordLoginFailure(customer.id, { threshold: 1, lockUntil: f.now() + 10_000 }, f.now());
  assert.equal((await f.request('/admin/movies', { headers: f.readHeaders })).status, 401);
  await f.repository.recordLoginSuccess(customer.id, f.now());
  const findSession = f.repository.findSession;
  f.repository.findSession = async (...args) => {
    const session = await findSession(...args);
    return session ? { ...session, customer: { ...session.customer, status: 'DISABLED' } } : null;
  };
  assert.equal((await f.request('/admin/movies', { headers: f.readHeaders })).status, 401);
  f.repository.findSession = findSession;
  assert.equal((await f.request('/admin/movies', { headers: f.readHeaders })).status, 200);
  assert.equal((await f.request('/auth/logout', { method: 'POST', headers: f.writeHeaders })).status, 204);
  assert.equal((await f.request('/admin/movies', { headers: f.readHeaders })).status, 401);
  const expired = await fixture(t);
  expired.advance(60_000);
  assert.equal((await expired.request('/admin/movies', { headers: expired.readHeaders })).status, 401);
});

test('each operation checks its current globally scoped permission', async (t) => {
  const f = await fixture(t);
  f.permissions.clear();
  assert.equal((await f.request('/admin/movies', { headers: f.readHeaders })).status, 403);
  assert.equal((await f.create()).status, 403);
  assert.equal((await f.request('/admin/movies/1', { method: 'PATCH', headers: f.writeHeaders, body: { title: 'Changed' } })).status, 403);
  f.permissions.add('movie.create');
  const created = await f.create();
  assert.equal(created.status, 201);
  const path = `/admin/movies/${created.body.movie.id}`;
  assert.equal((await f.request(path, { headers: f.readHeaders })).status, 200);
  assert.equal((await f.request(path, { method: 'PATCH', headers: f.writeHeaders, body: { title: 'Changed' } })).status, 403);
  f.permissions.clear();
  f.permissions.add('movie.update');
  assert.equal((await f.request(path, { method: 'PATCH', headers: f.writeHeaders, body: { title: 'Changed' } })).status, 200);
  assert.equal((await f.create({ ...MOVIE, movieCode: 'MRM-2', slug: 'second' })).status, 403);
});

test('writes enforce CSRF and reject unconfigured origins before changing data', async (t) => {
  const f = await fixture(t);
  for (const headers of [f.readHeaders, { ...f.writeHeaders, 'X-CSRF-Token': 'wrong' }, { ...f.writeHeaders, Origin: 'https://evil.example.com' }]) {
    assert.equal((await f.request('/admin/movies', { method: 'POST', body: MOVIE, headers })).status, 403);
  }
  assert.deepEqual((await f.request('/admin/movies', { headers: f.readHeaders })).body.movies, []);
  const created = await f.create();
  assert.equal(created.status, 201);
  const path = `/admin/movies/${created.body.movie.id}`;
  assert.equal((await f.request(path, { method: 'PATCH', body: { title: 'Attacker' }, headers: f.readHeaders })).status, 403);
  assert.equal((await f.request(path, { headers: f.readHeaders })).body.movie.title, MOVIE.title);
  const unconfigured = await fixture(t, { allowedOrigins: [] });
  assert.equal((await unconfigured.create()).body.code, 'ORIGIN_INVALID');
  const { Origin: _origin, ...proof } = unconfigured.writeHeaders;
  assert.equal((await unconfigured.request('/admin/movies', { method: 'POST', body: MOVIE, headers: proof })).status, 201);
});

test('movie validation rejects bad fields and accepts exact boundaries and calendar dates', async (t) => {
  const f = await fixture(t);
  const invalidBodies = [
    null, [], {}, { ...MOVIE, id: '99' }, { ...MOVIE, role: 'ADMIN' }, { ...MOVIE, title: ' ' },
    { ...MOVIE, movieCode: 'x'.repeat(31) }, { ...MOVIE, movieCode: 'phim mới' }, { ...MOVIE, movieCode: 'ß'.repeat(30) },
    { ...MOVIE, slug: 'bad/slug' }, { ...MOVIE, slug: 'Kelvin' }, { ...MOVIE, title: 'x'.repeat(251) },
    ...[0, 601, 1.5, '120', null].map((durationMinutes) => ({ ...MOVIE, durationMinutes })),
    ...['2026-02-29', '2026-04-31', '2026-1-01', '0000-01-01', 123].map((releaseDate) => ({ ...MOVIE, releaseDate })),
    { ...MOVIE, releaseDate: '2026-12-31', endDate: '2026-12-01' },
    { ...MOVIE, productionYear: 1887 }, { ...MOVIE, productionYear: 2101 },
    { ...MOVIE, status: 'Upcoming' }, { ...MOVIE, isFeatured: 1 },
    { ...MOVIE, originalLanguageCode: 'Tiếng Việt' },
  ];
  for (const body of invalidBodies) {
    const result = await f.create(body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.code, 'INVALID_INPUT');
    assert.equal(result.body.requestId, result.headers.get('x-request-id'));
  }
  const valid = await f.create({ ...MOVIE, movieCode: 'A'.repeat(30), title: 'x'.repeat(250), durationMinutes: 600, releaseDate: '2028-02-29', endDate: '2028-02-29', productionYear: 1888 });
  assert.equal(valid.status, 201);
  const path = `/admin/movies/${valid.body.movie.id}`;
  assert.equal((await f.request(path, { method: 'PATCH', headers: f.writeHeaders, body: { durationMinutes: 1, productionYear: 2100, releaseDate: null, endDate: null } })).status, 200);
});

test('invalid query and movie identifiers fail at the API boundary', async (t) => {
  const f = await fixture(t);
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=1&limit=2', 'after=-1', 'after=0', 'after=9223372036854775808', 'status=BAD', 'role=ADMIN']) {
    assert.equal((await f.request(`/admin/movies?${query}`, { headers: f.readHeaders })).status, 400, query);
  }
  for (const id of ['0', '-1', '01', 'abc', '1.5', '9223372036854775808']) {
    assert.equal((await f.request(`/admin/movies/${id}`, { headers: f.readHeaders })).status, 400, id);
  }
  assert.equal((await f.request('/admin/movies/9223372036854775807', { headers: f.readHeaders })).status, 404);
  assert.equal((await f.request('/admin/movies/123', { method: 'PATCH', headers: f.writeHeaders, body: { title: 'Missing' } })).status, 404);
});

test('conflicts and invalid partial windows leave existing movies unchanged', async (t) => {
  const f = await fixture(t);
  const created = await f.create({ ...MOVIE, releaseDate: '2026-12-01', endDate: '2026-12-31' });
  const path = `/admin/movies/${created.body.movie.id}`;
  assert.equal((await f.create({ ...MOVIE, slug: 'different' })).status, 409);
  assert.equal((await f.create({ ...MOVIE, movieCode: 'MRM-002' })).status, 409);
  const second = await f.create({ ...MOVIE, movieCode: 'MRM-002', slug: 'second' });
  assert.equal((await f.request(`/admin/movies/${second.body.movie.id}`, { method: 'PATCH', headers: f.writeHeaders, body: { movieCode: MOVIE.movieCode } })).status, 409);
  for (const body of [{}, { unknown: 'field' }, { releaseDate: '2027-01-01' }, { endDate: '2026-11-30' }]) {
    assert.equal((await f.request(path, { method: 'PATCH', headers: f.writeHeaders, body })).status, 400);
  }
  assert.deepEqual((await f.request(path, { headers: f.readHeaders })).body, created.body);
  const responses = await Promise.all([
    f.create({ ...MOVIE, movieCode: 'RACE', slug: 'race-one' }),
    f.create({ ...MOVIE, movieCode: 'RACE', slug: 'race-two' }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
});

test('unexpected repository failure returns 500 without pretending a write succeeded', async (t) => {
  const f = await fixture(t);
  f.repository.createMovie = async () => { throw new Error('private SQL details'); };
  const response = await f.create();
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { code: 'INTERNAL', message: 'Unexpected error.', requestId: response.headers.get('x-request-id') });
});
