import sql from 'mssql';
import { parseConfig } from './config.js';
import { createMemoryRepository, createSqlRepository } from './repository.js';
import { createApp } from './app.js';
import { createSmtpTransport, buildVerificationMessage } from './smtp.js';

function log(level, message, detail) {
  console.log(JSON.stringify({ level, message, ...detail }));
}

async function openDatabasePool(database) {
  const pool = new sql.ConnectionPool({
    server: database.server,
    port: database.port,
    database: database.name,
    user: database.user,
    password: database.password,
    connectionTimeout: 15000,
    requestTimeout: 30000,
    pool: { min: 0, max: 10, idleTimeoutMillis: 300000 },
    options: { trustServerCertificate: true, encrypt: database.encrypt, enableArithAbort: true },
  });
  return pool.connect();
}

const config = parseConfig(process.env);
const pool = config.repository === 'sql' ? await openDatabasePool(config.database) : null;
const repository = pool ? createSqlRepository(pool) : createMemoryRepository('runtime');
const transport = createSmtpTransport(config.smtp);
const logger = { error: (message, detail) => log('error', message, detail) };

const app = await createApp({
  repository,
  logger,
  sendVerification: ({ email, verificationUrl }) => transport.sendMail(
    buildVerificationMessage({ from: config.smtp.from, to: email, verificationUrl }),
  ),
  readyProbe: pool
    ? async () => {
      await pool.request().query('SELECT 1 AS ok;');
      return true;
    }
    : null,
  verificationUrl: config.verificationUrl,
  bcryptRounds: config.bcryptRounds,
  tokenTtlMs: config.tokenTtlMs,
  resendCooldownMs: config.resendCooldownMs,
  session: config.session,
  payment: config.payment,
  allowedOrigins: config.allowedOrigins,
  loginRateLimit: config.loginRateLimit,
});

const server = app.listen(config.port, '0.0.0.0', () => {
  log('info', 'Marumo backend listening', { port: config.port, repository: config.repository });
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  log('info', 'Shutting down', {});
  const stop = new Promise((resolve) => server.close(resolve));
  if (pool) await pool.close();
  await stop;
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
