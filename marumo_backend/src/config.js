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

export function validateSessionOptions(options) {
  if (typeof options?.jwtSecret !== 'string' || options.jwtSecret.trim().length === 0 || Buffer.byteLength(options.jwtSecret, 'utf8') < 32) {
    throw new ConfigError('JWT_SECRET must contain at least 32 UTF-8 bytes.');
  }
  if (!Number.isSafeInteger(options.ttlSeconds) || options.ttlSeconds < 1 || options.ttlSeconds > 30 * 86400) {
    throw new ConfigError('JWT_EXPIRES_IN must be between 1 second and 30 days.');
  }
  if (options.cookie?.httpOnly !== true) throw new ConfigError('COOKIE_HTTP_ONLY must be true for authentication.');
  if (typeof options.cookie.secure !== 'boolean') throw new ConfigError('COOKIE_SECURE must be true or false.');
  if (!['Lax', 'Strict', 'None'].includes(options.cookie.sameSite)) throw new ConfigError('COOKIE_SAME_SITE must be lax, strict or none.');
  if (options.cookie.sameSite === 'None' && !options.cookie.secure) throw new ConfigError('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.');
  return options;
}

export function parseSessionConfig(env) {
  const duration = env.JWT_EXPIRES_IN ?? '1d';
  const match = /^([1-9][0-9]*)(s|m|h|d)$/.exec(duration);
  if (!match) throw new ConfigError('JWT_EXPIRES_IN must be a positive integer followed by s, m, h or d.');
  const sameSite = ({ lax: 'Lax', strict: 'Strict', none: 'None' })[String(env.COOKIE_SAME_SITE ?? 'lax').toLowerCase()];
  const session = validateSessionOptions({
    jwtSecret: env.JWT_SECRET,
    ttlSeconds: Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 })[match[2]],
    cookie: {
      httpOnly: parseBoolean(env.COOKIE_HTTP_ONLY, 'COOKIE_HTTP_ONLY', true),
      secure: parseBoolean(env.COOKIE_SECURE, 'COOKIE_SECURE', env.NODE_ENV === 'production'),
      sameSite,
    },
  });
  if (env.NODE_ENV === 'production' && !session.cookie.secure) throw new ConfigError('Production requires COOKIE_SECURE=true.');
  return session;
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
    session: parseSessionConfig(env),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
    loginRateLimit: parseInteger(env.LOGIN_RATE_LIMIT, 'LOGIN_RATE_LIMIT', 10, 1, 10_000),
  };
}
