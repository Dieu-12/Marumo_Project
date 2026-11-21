import { URL } from 'node:url';

export class ConfigError extends Error {}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError(`${label} must be an integer between 1 and 65535.`);
  return port;
}

function requireValue(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new ConfigError(`${label} is required.`);
  return value.trim();
}

function parseBoolean(value, label, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigError(`${label} must be true or false.`);
}

function parseInteger(value, label, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function parseConfig(env) {
  const repository = env.REPOSITORY ?? 'sql';
  if (repository !== 'sql' && repository !== 'memory') {
    throw new ConfigError('REPOSITORY must be sql or memory.');
  }
  if (repository === 'memory' && env.NODE_ENV === 'production') {
    throw new ConfigError('The memory repository is not allowed in production.');
  }
  const port = parsePort(env.PORT ?? '3000', 'PORT');
  const smtp = {
    host: env.SMTP_HOST,
    port: parsePort(env.SMTP_PORT ?? '587', 'SMTP_PORT'),
    secure: parseBoolean(env.SMTP_SECURE, 'SMTP_SECURE', false),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: requireValue(env.SMTP_FROM, 'SMTP_FROM'),
  };
  if (!smtp.host) throw new ConfigError('SMTP_HOST is required.');
  const verificationUrlRaw = requireValue(env.EMAIL_VERIFICATION_URL, 'EMAIL_VERIFICATION_URL');
  const verificationUrl = new URL(verificationUrlRaw).toString();
  return {
    repository,
    port,
    smtp,
    verificationUrl,
    database: {
      server: env.DATABASE_SERVER ?? 'localhost',
      port: parsePort(env.DATABASE_PORT ?? '1433', 'DATABASE_PORT'),
      name: env.DATABASE_NAME ?? 'MarumoDB',
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      encrypt: parseBoolean(env.DATABASE_ENCRYPT, 'DATABASE_ENCRYPT', false),
    },
    bcryptRounds: parseInteger(env.BCRYPT_ROUNDS, 'BCRYPT_ROUNDS', 12, 4, 15),
    tokenTtlMs: parseInteger(env.TOKEN_TTL_MINUTES, 'TOKEN_TTL_MINUTES', 30, 1, 24 * 60) * 60_000,
    resendCooldownMs: parseInteger(env.RESEND_COOLDOWN_SECONDS, 'RESEND_COOLDOWN_SECONDS', 60, 0, 3600) * 1000,
    sessionTtlMs: parseInteger(env.SESSION_TTL_MINUTES, 'SESSION_TTL_MINUTES', 7 * 24 * 60, 1, 30 * 24 * 60) * 60_000,
    cookieSecure: parseBoolean(env.COOKIE_SECURE, 'COOKIE_SECURE', env.NODE_ENV === 'production'),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
    loginRateLimit: parseInteger(env.LOGIN_RATE_LIMIT, 'LOGIN_RATE_LIMIT', 10, 1, 10_000),
  };
}
