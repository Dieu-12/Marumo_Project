import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { createAuthRouter } from './auth.js';
import { HttpError } from './validation.js';

const DEFAULTS = {
  readyProbe: null,
  requestIdHeader: 'X-Request-Id',
};

function errorBody(error) {
  return { code: error.code ?? 'INTERNAL', message: error.message ?? 'Unexpected error.' };
}

export async function createApp(options) {
  const { repository, readyProbe: injectedProbe, requestIdHeader } = { ...DEFAULTS, ...options };
  const logger = options.logger ?? console;
  const probe = injectedProbe ?? (() => repository.ping());
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet());
  app.use((req, res, next) => {
    res.setHeader(requestIdHeader, randomUUID());
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/auth', createAuthRouter(repository, options));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    try {
      const ready = await probe();
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
    } catch (error) {
      logger.error('Readiness probe failed', { reason: error.message });
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use((_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found.' });
  });
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large' || error.type === 'charset.unsupported') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'The request body is not valid JSON.' });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json(errorBody(error));
      return;
    }
    logger.error('Unhandled request failure', { reason: error.message });
    res.status(500).json({ code: 'INTERNAL', message: 'Unexpected error.' });
  });
  return app;
}
