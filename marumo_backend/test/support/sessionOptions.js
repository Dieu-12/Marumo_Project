export function testSession(ttlSeconds = 60, cookie = {}) {
  return {
    jwtSecret: 'test-only-signing-secret-for-marumo-auth-0123456789',
    ttlSeconds,
    cookie: { httpOnly: true, secure: false, sameSite: 'Lax', ...cookie },
  };
}
