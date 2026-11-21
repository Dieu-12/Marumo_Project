import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repository.js';
import { testSession } from './support/sessionOptions.js';

const MOVIE = { movieCode: 'MRM-001', title: 'Một bộ phim', slug: 'mot-bo-phim', durationMinutes: 120 };
const PUBLIC_MOVIE_KEYS = [
  'id', 'title', 'originalTitle', 'slug', 'synopsis', 'durationMinutes',
  'releaseDate', 'endDate', 'productionYear', 'productionCompany', 'directorDisplay',
  'originalLanguageCode', 'status', 'isFeatured', 'ratingCode', 'genres', 'formats',
].sort();
const PUBLIC_SHOWTIME_KEYS = [
  'id', 'showtimeCode', 'movieId', 'movieVersionId', 'branchId', 'branchName',
  'branchAddress', 'branchCity', 'auditoriumId', 'auditoriumName', 'formatCode',
  'formatName', 'startAt', 'endAt', 'baseTicketPrice', 'status',
].sort();

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

test('movie versions persist per movie with unique codes and checked references', async (t) => {
  const f = await fixture(t);
  const movie = (await f.create()).body.movie;
  const VERSION = { versionCode: 'SUB_VIE', versionName: 'Phụ đề tiếng Việt', audioLanguageId: 2, subtitleLanguageId: 1, formatId: 1 };

  const created = await f.request(`/admin/movies/${movie.id}/versions`, { method: 'POST', body: VERSION, headers: f.writeHeaders });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), `/admin/movies/${movie.id}/versions/${created.body.version.id}`);
  assert.equal(created.body.version.movieId, movie.id);
  assert.equal(created.body.version.versionCode, 'SUB_VIE');
  assert.equal(created.body.version.subtitleLanguageId, 1);
  assert.equal(created.body.version.isOriginalAudio, false);
  assert.equal(created.body.version.isActive, true);

  const duplicate = await f.request(`/admin/movies/${movie.id}/versions`, { method: 'POST', body: { ...VERSION, versionCode: 'sub_vie' }, headers: f.writeHeaders });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'MOVIE_VERSION_CONFLICT');
  assert.equal((await f.request('/admin/movies/999/versions', { method: 'POST', body: VERSION, headers: f.writeHeaders })).status, 404);
  for (const body of [
    { ...VERSION, versionCode: 'HAS SPACE' },
    { ...VERSION, versionName: '' },
    { ...VERSION, audioLanguageId: 0 },
    { ...VERSION, formatId: 1.5 },
    { ...VERSION, subtitleLanguageId: 0 },
    { versionCode: 'X', versionName: 'Thiếu format', audioLanguageId: 2 },
    { ...VERSION, unknown: true },
  ]) {
    assert.equal((await f.request(`/admin/movies/${movie.id}/versions`, { method: 'POST', body, headers: f.writeHeaders })).status, 400, JSON.stringify(body));
  }
});

test('showtimes block overlap and duplicate codes and reference a real version', async (t) => {
  const f = await fixture(t);
  const movie = (await f.create()).body.movie;
  const version = (await f.request(`/admin/movies/${movie.id}/versions`, { method: 'POST', body: { versionCode: 'SUB_VIE', versionName: 'Phụ đề tiếng Việt', audioLanguageId: 2, formatId: 1 }, headers: f.writeHeaders })).body.version;
  const base = { showtimeCode: 'S-1', branchId: '1', auditoriumId: '1', movieVersionId: version.id, startAt: '2026-12-01T09:00:00', endAt: '2026-12-01T11:00:00', baseTicketPrice: 120000 };

  const denied = await f.request('/admin/showtimes', { method: 'POST', body: base, headers: f.writeHeaders });
  assert.equal(denied.status, 403);
  f.permissions.add('showtime.create');

  const created = await f.request('/admin/showtimes', { method: 'POST', body: base, headers: f.writeHeaders });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), `/admin/showtimes/${created.body.showtime.id}`);
  assert.equal(created.body.showtime.status, 'DRAFT');
  assert.equal(created.body.showtime.preparationMinutes, 15);
  assert.equal(created.body.showtime.cleanupMinutes, 15);
  assert.equal(created.body.showtime.startAt, '2026-12-01T09:00:00');
  assert.equal(created.body.showtime.salesOpenAt, null);
  assert.equal(typeof created.body.showtime.createdByUserId, 'string');

  const shifted = await f.request('/admin/showtimes', { method: 'POST', body: { ...base, showtimeCode: 'S-2', startAt: '2026-12-01T21:00:00+07:00', endAt: '2026-12-01T23:00:00+07:00' }, headers: f.writeHeaders });
  assert.equal(shifted.status, 201);
  assert.equal(shifted.body.showtime.startAt, '2026-12-01T14:00:00');

  for (const [code, startAt, endAt] of [['S-3', '2026-12-01T11:14:00', '2026-12-01T12:00:00'], ['S-4', '2026-12-01T08:30:00', '2026-12-01T09:05:00']]) {
    const clash = await f.request('/admin/showtimes', { method: 'POST', body: { ...base, showtimeCode: code, startAt, endAt }, headers: f.writeHeaders });
    assert.equal(clash.status, 409, code);
    assert.equal(clash.body.code, 'SHOWTIME_CONFLICT');
  }
  const adjacent = await f.request('/admin/showtimes', { method: 'POST', body: { ...base, showtimeCode: 'S-5', startAt: '2026-12-01T11:30:00', endAt: '2026-12-01T13:00:00' }, headers: f.writeHeaders });
  assert.equal(adjacent.status, 201);
  const otherRoom = await f.request('/admin/showtimes', { method: 'POST', body: { ...base, showtimeCode: 'S-6', auditoriumId: '2' }, headers: f.writeHeaders });
  assert.equal(otherRoom.status, 201);

  const takenCode = await f.request('/admin/showtimes', { method: 'POST', body: { ...base, showtimeCode: 's-1' }, headers: f.writeHeaders });
  assert.equal(takenCode.status, 409);
  assert.equal(takenCode.body.code, 'SHOWTIME_CODE_TAKEN');
  assert.equal((await f.request('/admin/showtimes', { method: 'POST', body: { ...base, showtimeCode: 'S-7', movieVersionId: '999' }, headers: f.writeHeaders })).status, 400);
  for (const body of [
    { ...base, showtimeCode: 'S-8', endAt: '2026-12-01T09:00:00' },
    { ...base, showtimeCode: 'S-8', branchId: 'abc' },
    { ...base, showtimeCode: 'S-8', baseTicketPrice: -1 },
    { ...base, showtimeCode: 'S-8', baseTicketPrice: 120000.123 },
    { ...base, showtimeCode: 'S-8', preparationMinutes: 181 },
    { ...base, showtimeCode: 'S-8', status: 'CANCELLED' },
    { ...base, showtimeCode: 'S-8', salesOpenAt: '2026-12-01T12:00:00', salesCloseAt: '2026-12-01T11:00:00' },
    { ...base, showtimeCode: 'S-8', startAt: '2026-12-01 09:00:00' },
    { ...base, unknown: true },
  ]) {
    assert.equal((await f.request('/admin/showtimes', { method: 'POST', body, headers: f.writeHeaders })).status, 400, JSON.stringify(body));
  }
});

test('public catalog reads public movies anonymously and hides non-public statuses', async (t) => {
  const f = await fixture(t);
  const draft = (await f.create({ ...MOVIE, movieCode: 'MRM-DRAFT', slug: 'draft-movie' })).body.movie;
  const nowShowing = (await f.create({ ...MOVIE, movieCode: 'MRM-NOW', slug: 'now-showing', status: 'NOW_SHOWING', releaseDate: '2026-11-20', isFeatured: true })).body.movie;
  const comingSoon = (await f.create({ ...MOVIE, movieCode: 'MRM-SOON', slug: 'coming-soon', status: 'COMING_SOON' })).body.movie;
  const published = (await f.create({ ...MOVIE, movieCode: 'MRM-PUB', slug: 'published-movie', status: 'PUBLISHED' })).body.movie;
  const ended = (await f.create({ ...MOVIE, movieCode: 'MRM-END', slug: 'ended-movie', status: 'ENDED' })).body.movie;

  const list = await f.request('/catalog/movies?limit=100');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.movies.map((movie) => movie.id), [nowShowing.id, comingSoon.id, published.id]);
  assert.equal(list.body.nextAfter, null);
  assert.ok(!list.body.movies.some((movie) => movie.id === draft.id || movie.id === ended.id));
  const [first] = list.body.movies;
  assert.deepEqual(Object.keys(first).sort(), PUBLIC_MOVIE_KEYS);
  assert.equal(first.title, nowShowing.title);
  assert.equal(first.slug, 'now-showing');
  assert.equal(first.status, 'NOW_SHOWING');
  assert.equal(first.isFeatured, true);
  assert.equal(first.releaseDate, '2026-11-20');
  assert.equal(first.endDate, null);
  assert.equal(first.ratingCode, null);
  assert.deepEqual(first.genres, []);
  assert.deepEqual(first.formats, []);
  assert.equal(first.movieCode, undefined);
  assert.equal(first.createdAt, undefined);
  assert.equal(first.updatedAt, undefined);

  const filtered = await f.request('/catalog/movies?status=NOW_SHOWING');
  assert.deepEqual(filtered.body.movies.map((movie) => movie.id), [nowShowing.id]);

  const detail = await f.request('/catalog/movies/now-showing');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.movie.id, nowShowing.id);
  assert.deepEqual(Object.keys(detail.body.movie).sort(), PUBLIC_MOVIE_KEYS);
  for (const slug of ['draft-movie', 'ended-movie', 'missing-movie']) {
    const missing = await f.request(`/catalog/movies/${slug}`);
    assert.equal(missing.status, 404, slug);
    assert.equal(missing.body.code, 'MOVIE_NOT_FOUND');
  }
  for (const slug of ['Now-Showing', 'bad_slug', 'bad--slug', 'x'.repeat(281)]) {
    const bad = await f.request(`/catalog/movies/${slug}`);
    assert.equal(bad.status, 400, slug);
    assert.equal(bad.body.code, 'INVALID_INPUT');
  }

  const firstPage = await f.request('/catalog/movies?limit=1');
  assert.deepEqual(firstPage.body.movies.map((movie) => movie.id), [nowShowing.id]);
  assert.equal(firstPage.body.nextAfter, nowShowing.id);
  const secondPage = await f.request(`/catalog/movies?limit=1&after=${firstPage.body.nextAfter}`);
  assert.deepEqual(secondPage.body.movies.map((movie) => movie.id), [comingSoon.id]);
  assert.equal(secondPage.body.nextAfter, comingSoon.id);
  const lastPage = await f.request('/catalog/movies?status=COMING_SOON&limit=1');
  assert.deepEqual(lastPage.body.movies.map((movie) => movie.id), [comingSoon.id]);
  assert.equal(lastPage.body.nextAfter, null);
  const beyond = await f.request(`/catalog/movies?after=${published.id}`);
  assert.deepEqual(beyond.body, { movies: [], nextAfter: null });
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=1&limit=2', 'after=0', 'after=-1', 'after=9223372036854775808', 'status=DRAFT', 'status=ENDED', 'extra=1']) {
    const bad = await f.request(`/catalog/movies?${query}`);
    assert.equal(bad.status, 400, query);
    assert.equal(bad.body.code, 'INVALID_INPUT');
  }
});

test('public showtimes list only allowed statuses inside the day window with branch and version identifiers', async (t) => {
  const f = await fixture(t);
  f.permissions.add('showtime.create');
  const at = (hours) => new Date(f.now() + hours * 3_600_000).toISOString().slice(0, 19);
  const movie = (await f.create({ ...MOVIE, movieCode: 'MRM-SHT', slug: 'showtime-movie', status: 'NOW_SHOWING' })).body.movie;
  const version = (await f.request(`/admin/movies/${movie.id}/versions`, { method: 'POST', body: { versionCode: 'V2D', versionName: '2D', audioLanguageId: 1, formatId: 1 }, headers: f.writeHeaders })).body.version;
  const createShowtime = (fields) => f.request('/admin/showtimes', {
    method: 'POST',
    headers: f.writeHeaders,
    body: { showtimeCode: 'S', branchId: '10', auditoriumId: '20', movieVersionId: version.id, startAt: at(1), endAt: at(2), baseTicketPrice: 120000, status: 'SCHEDULED', ...fields },
  });

  assert.equal((await createShowtime({ showtimeCode: 'S-DELAYED', auditoriumId: '22', startAt: at(8), endAt: at(9), status: 'DELAYED' })).status, 201);
  const scheduled = (await createShowtime({ showtimeCode: 'S-SCHEDULED', startAt: at(1), endAt: at(2) })).body.showtime;
  assert.equal((await createShowtime({ showtimeCode: 'S-DRAFT', startAt: at(5), endAt: at(6), status: 'DRAFT' })).status, 201);
  const open = (await createShowtime({ showtimeCode: 'S-OPEN', startAt: at(3), endAt: at(4), status: 'OPEN_FOR_BOOKING' })).body.showtime;
  assert.equal((await createShowtime({ showtimeCode: 'S-OUT-86', auditoriumId: '22', startAt: at(86), endAt: at(87) })).status, 201);
  assert.equal((await createShowtime({ showtimeCode: 'S-OUT-200', auditoriumId: '22', startAt: at(200), endAt: at(201) })).status, 201);
  assert.equal((await createShowtime({ showtimeCode: 'S-PAST', startAt: at(-3), endAt: at(-2) })).status, 201);
  const soldOut = await f.repository.createShowtime({
    showtimeCode: 'S-SOLD', branchId: '10', auditoriumId: '21', movieVersionId: version.id,
    startAt: at(4), endAt: at(5), baseTicketPrice: 90000, preparationMinutes: 15, cleanupMinutes: 15, status: 'SOLD_OUT',
  }, '1', f.now());
  const hiddenMovie = (await f.create({ ...MOVIE, movieCode: 'MRM-HID', slug: 'hidden-movie' })).body.movie;
  const hiddenVersion = (await f.request(`/admin/movies/${hiddenMovie.id}/versions`, { method: 'POST', body: { versionCode: 'V2D', versionName: '2D', audioLanguageId: 1, formatId: 1 }, headers: f.writeHeaders })).body.version;
  assert.equal((await createShowtime({ showtimeCode: 'S-HIDDEN', auditoriumId: '23', movieVersionId: hiddenVersion.id, startAt: at(4), endAt: at(5) })).status, 201);

  const showtimes = await f.request('/catalog/movies/showtime-movie/showtimes');
  assert.equal(showtimes.status, 200);
  assert.deepEqual(showtimes.body.showtimes.map((row) => row.id), [scheduled.id, open.id, soldOut.id]);
  assert.deepEqual(showtimes.body.showtimes.map((row) => row.status), ['SCHEDULED', 'OPEN_FOR_BOOKING', 'SOLD_OUT']);
  const [first] = showtimes.body.showtimes;
  assert.deepEqual(Object.keys(first).sort(), PUBLIC_SHOWTIME_KEYS);
  assert.equal(first.showtimeCode, 'S-SCHEDULED');
  assert.equal(first.movieId, movie.id);
  assert.equal(first.movieVersionId, version.id);
  assert.equal(first.branchId, '10');
  assert.equal(first.branchName, null);
  assert.equal(first.branchAddress, null);
  assert.equal(first.branchCity, null);
  assert.equal(first.auditoriumId, '20');
  assert.equal(first.auditoriumName, null);
  assert.equal(first.formatCode, null);
  assert.equal(first.formatName, '2D');
  assert.equal(first.startAt, new Date(`${at(1)}Z`).toISOString());
  assert.equal(first.endAt, new Date(`${at(2)}Z`).toISOString());
  assert.equal(first.baseTicketPrice, 120000);

  f.advance(2 * 3_600_000);
  const afterAdvance = await f.request('/catalog/movies/showtime-movie/showtimes');
  assert.deepEqual(afterAdvance.body.showtimes.map((row) => row.id), [open.id, soldOut.id]);
  const wide = await f.request('/catalog/movies/showtime-movie/showtimes?days=14');
  assert.deepEqual(wide.body.showtimes.map((row) => row.showtimeCode), ['S-OPEN', 'S-SOLD', 'S-OUT-86', 'S-OUT-200']);
  const narrow = await f.request('/catalog/movies/showtime-movie/showtimes?days=1');
  assert.deepEqual(narrow.body.showtimes.map((row) => row.id), [open.id, soldOut.id]);
  for (const query of ['days=0', 'days=15', 'days=1.5', 'days=abc', 'days=01', 'days=3&days=4', 'extra=1']) {
    const bad = await f.request(`/catalog/movies/showtime-movie/showtimes?${query}`);
    assert.equal(bad.status, 400, query);
    assert.equal(bad.body.code, 'INVALID_INPUT');
  }

  const hidden = await f.request('/catalog/movies/hidden-movie/showtimes');
  assert.equal(hidden.status, 404);
  assert.equal(hidden.body.code, 'MOVIE_NOT_FOUND');
  assert.equal((await f.request('/catalog/movies/unknown-movie/showtimes')).status, 404);
  assert.equal((await f.request('/catalog/movies/Bad_Movie/showtimes')).status, 400);
});
