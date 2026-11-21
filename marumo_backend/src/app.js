import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { createAuthRouter } from './auth.js';
import { createCatalogRouter } from './catalog.js';
import { HttpError } from './validation.js';
import { createSessionTokens } from './jwt.js';

const DEFAULTS = {
  readyProbe: null,
  requestIdHeader: 'X-Request-Id',
};

function errorBody(error, requestId) {
  return { code: error.code ?? 'INTERNAL', message: error.message ?? 'Unexpected error.', requestId };
}

export async function createApp(options) {
  const { repository, readyProbe: injectedProbe, requestIdHeader } = { ...DEFAULTS, ...options };
  const logger = options.logger ?? console;
  const probe = injectedProbe ?? (() => repository.ping());
  const authOptions = { ...options, sessionTokens: createSessionTokens(options.session) };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet());
  app.use((req, res, next) => {
    res.setHeader(requestIdHeader, randomUUID());
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/auth', createAuthRouter(repository, authOptions));
  app.use('/admin', createCatalogRouter(repository, authOptions));
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
    res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found.', requestId: res.getHeader(requestIdHeader) });
  });
  app.use((error, _req, res, _next) => {
    const requestId = res.getHeader(requestIdHeader);
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large' || error.type === 'charset.unsupported') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'The request body is not valid JSON.', requestId });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json(errorBody(error, requestId));
      return;
    }
    logger.error('Unhandled request failure', { reason: error.message });
    res.status(500).json({ code: 'INTERNAL', message: 'Unexpected error.', requestId });
  });
  return app;
}
