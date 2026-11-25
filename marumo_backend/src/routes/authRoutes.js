import express from 'express';
import rateLimit from 'express-rate-limit';
import { createSessionMiddleware } from '../middlewares/session.js';
import { createAuthService } from '../services/authService.js';
import { createAuthController } from '../controllers/authController.js';

const ROUTE_DEFAULTS = {
  now: Date.now,
  rateWindowMs: 15 * 60_000,
  loginRateLimit: 10,
  registerRateLimit: 20,
  resendRateLimit: 20,
  verifyRateLimit: 30,
  allowedOrigins: [],
};

function rateLimitFor({ limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).set('Retry-After', String(Math.ceil(windowMs / 1000))).json({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again later.',
      });
    },
  });
}

export function createAuthRouter(repository, options) {
  const config = { ...ROUTE_DEFAULTS, ...options };
  const service = createAuthService(repository, options);
  const controller = createAuthController(service, config);
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, options.sessionTokens, config.now);
  const limiter = (limit) => rateLimitFor({ limit, windowMs: config.rateWindowMs });

  router.post('/register', limiter(config.registerRateLimit), controller.register);
  router.post('/verify-email', limiter(config.verifyRateLimit), controller.verifyEmail);
  router.post('/resend-verification', limiter(config.resendRateLimit), controller.resendVerification);
  router.post('/login', limiter(config.loginRateLimit), controller.login);
  router.get('/session', requireSession, controller.currentSession);
  router.post('/logout', requireSession, controller.logout);
  return router;
}
