import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, parseConfig, parseSessionConfig } from '../src/config.js';
import { testSession } from './support/sessionOptions.js';

const env = { JWT_SECRET: testSession().jwtSecret };

test('JWT expiry and cookie flags parse from environment with one lifetime source', () => {
  const session = parseSessionConfig({
    ...env, JWT_EXPIRES_IN: '1d', SESSION_TTL_MINUTES: '1',
    COOKIE_HTTP_ONLY: 'true', COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax',
  });
  assert.equal(session.jwtSecret, env.JWT_SECRET);
  assert.equal(session.ttlSeconds, 86400);
  assert.deepEqual(session.cookie, { httpOnly: true, secure: false, sameSite: 'Lax' });
  assert.equal(parseSessionConfig(env).ttlSeconds, 86400);
  for (const [duration, seconds] of [['1s', 1], ['15m', 900], ['2h', 7200], ['30d', 2592000]]) {
    assert.equal(parseSessionConfig({ ...env, JWT_EXPIRES_IN: duration }).ttlSeconds, seconds);
  }
  assert.deepEqual(parseSessionConfig({ ...env, COOKIE_SECURE: 'true', COOKIE_SAME_SITE: 'NONE' }).cookie,
    { httpOnly: true, secure: true, sameSite: 'None' });
  assert.equal(parseSessionConfig({ ...env, COOKIE_SAME_SITE: 'StRiCt' }).cookie.sameSite, 'Strict');
  assert.equal(parseSessionConfig({ ...env, NODE_ENV: 'production' }).cookie.secure, true);
});

test('invalid JWT and unsafe cookie configuration fail without exposing the signing secret', () => {
  const invalid = [
    { JWT_SECRET: undefined }, { JWT_SECRET: '' }, { JWT_SECRET: 'x'.repeat(31) }, { JWT_SECRET: ' '.repeat(32) },
    ...['0s', '-1h', '1.5h', '31d', '86400', '1year', '1h ', '999999999999999999999d'].map((JWT_EXPIRES_IN) => ({ JWT_EXPIRES_IN })),
    { COOKIE_HTTP_ONLY: 'false' }, { COOKIE_HTTP_ONLY: 'yes' }, { COOKIE_SECURE: 'yes' },
    { COOKIE_SAME_SITE: 'invalid' }, { COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' },
    { NODE_ENV: 'production', COOKIE_SECURE: 'false' },
  ];
  for (const patch of invalid) {
    assert.throws(() => parseSessionConfig({ ...env, ...patch }), (error) => error instanceof ConfigError && !error.message.includes(env.JWT_SECRET));
  }
});

test('application config passes the parsed JWT session to the server contract', () => {
  const config = parseConfig({
    ...env, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'cinema@example.com',
    EMAIL_VERIFICATION_URL: 'http://localhost:5175/xac-thuc-email', JWT_EXPIRES_IN: '2h',
  });
  assert.equal(config.session.ttlSeconds, 7200);
  assert.equal(config.session.cookie.httpOnly, true);
  assert.equal('sessionTtlMs' in config, false);
  assert.equal('cookieSecure' in config, false);
});
