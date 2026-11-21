import express from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { hashToken, generateToken, generateCsrfToken } from './tokens.js';
import { HttpError, parseRegistration, parseLogin, parseVerificationToken, parseEmailOnly } from './validation.js';
import { sessionCookie, csrfCookie, clearedCookie } from './cookies.js';
import { isDuplicate } from './repository.js';
import { createSessionMiddleware, loadAuthorization, validateCsrfProof, SESSION_COOKIE, CSRF_COOKIE } from './session.js';

const VERIFICATION_PENDING = Object.freeze({
  code: 'VERIFICATION_PENDING',
  message: 'If the email address is eligible, a verification message has been sent.',
});

const DEFAULTS = {
  now: Date.now,
  logger: console,
  bcryptRounds: 12,
  tokenTtlMs: 30 * 60_000,
  resendCooldownMs: 60_000,
  loginLockoutThreshold: 10,
  loginLockoutMs: 15 * 60_000,
  rateWindowMs: 15 * 60_000,
  loginRateLimit: 10,
  registerRateLimit: 20,
  resendRateLimit: 20,
  verifyRateLimit: 30,
  allowedOrigins: [],
};

function publicCustomer(customer) {
  return { id: customer.id, name: customer.name, email: customer.email };
}

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
  const { now, sendVerification, logger, verificationUrl, session, sessionTokens, ...config } = { ...DEFAULTS, ...options };
  const router = express.Router();
  const deliveryQueues = new Map();
  const decoyHash = bcrypt.hashSync('marumo-credential-check-value', config.bcryptRounds);
  const limiter = (limit) => rateLimitFor({ limit, windowMs: config.rateWindowMs });

  function clientAddress(req) {
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }

  function queueVerification(email) {
    const pending = deliveryQueues.get(email);
    if (pending) return pending;
    const task = deliverVerification(email).finally(() => deliveryQueues.delete(email));
    deliveryQueues.set(email, task);
    task.catch((error) => logger.error('Verification delivery failed', { email, reason: error.message }));
    return task;
  }

  async function deliverVerification(email) {
    const at = now();
    const customer = await repository.findCustomer(email);
    if (!customer || customer.status !== 'PENDING') return;
    const lastSentAt = await repository.lastVerificationAt(customer.id);
    if (lastSentAt !== null && at - lastSentAt < config.resendCooldownMs) return;
    const token = generateToken();
    const record = {
      userId: customer.id,
      email,
      tokenHash: hashToken(token),
      expiresAt: at + config.tokenTtlMs,
    };
    await repository.stageVerification(record, at);
    try {
      await sendVerification({
        email,
        token,
        verificationUrl: verificationUrl ? appendToken(verificationUrl, token) : undefined,
      });
      await repository.activateVerification(record, now());
    } catch (error) {
      logger.error('Verification email delivery failed', { email, reason: error.message });
    }
  }

  function appendToken(url, token) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }

  async function register(req, res, next) {
    try {
      const { name, email, password } = parseRegistration(req.body);
      const existing = await repository.findCustomer(email);
      if (!existing) {
        const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
        try {
          const created = await repository.createCustomer({ name, email, passwordHash }, now());
          queueVerification(created.email);
        } catch (error) {
          if (!isDuplicate(error)) throw error;
        }
      }
      res.status(202).json(VERIFICATION_PENDING);
    } catch (error) {
      next(error);
    }
  }

  async function verifyEmail(req, res, next) {
    try {
      const { token } = parseVerificationToken(req.body);
      const result = await repository.consumeVerification(hashToken(token), now());
      if (!result) throw new HttpError(400, 'TOKEN_INVALID', 'The verification link is invalid or has expired.');
      res.status(200).json({ code: 'EMAIL_VERIFIED', message: 'The email address is verified. You can sign in now.' });
    } catch (error) {
      next(error);
    }
  }

  async function resendVerification(req, res, next) {
    try {
      const { email } = parseEmailOnly(req.body);
      queueVerification(email);
      res.status(202).json(VERIFICATION_PENDING);
    } catch (error) {
      next(error);
    }
  }

  async function login(req, res, next) {
    try {
      const { email, password } = parseLogin(req.body);
      const at = now();
      const ipAddress = clientAddress(req);
      const userAgent = req.headers['user-agent'] ?? null;
      const customer = await repository.findCustomer(email);
      if (!customer) {
        await bcrypt.compare(password, decoyHash);
        await repository.recordLoginResult({ userId: null, identifier: email, success: false, failureReason: 'UNKNOWN_EMAIL', ipAddress, userAgent }, at);
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      const matches = await bcrypt.compare(password, customer.passwordHash);
      if (!matches) {
        await repository.recordLoginFailure(customer.id, { threshold: config.loginLockoutThreshold, lockUntil: at + config.loginLockoutMs }, at);
        await repository.recordLoginResult({ userId: customer.id, identifier: email, success: false, failureReason: 'INVALID_PASSWORD', ipAddress, userAgent }, at);
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      if (customer.lockedUntil !== null && customer.lockedUntil > at) {
        await repository.recordLoginResult({ userId: customer.id, identifier: email, success: false, failureReason: 'ACCOUNT_LOCKED', ipAddress, userAgent }, at);
        throw new HttpError(403, 'ACCOUNT_LOCKED', 'The account is temporarily locked.');
      }
      if (customer.status === 'DISABLED') {
        await repository.recordLoginResult({ userId: customer.id, identifier: email, success: false, failureReason: 'ACCOUNT_DISABLED', ipAddress, userAgent }, at);
        throw new HttpError(403, 'ACCOUNT_DISABLED', 'The account is disabled.');
      }
      if (customer.status !== 'ACTIVE') {
        await repository.recordLoginResult({ userId: customer.id, identifier: email, success: false, failureReason: 'EMAIL_NOT_VERIFIED', ipAddress, userAgent }, at);
        throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Verify the email address before signing in.');
      }
      await repository.recordLoginSuccess(customer.id, at);
      await repository.recordLoginResult({ userId: customer.id, identifier: email, success: true, failureReason: null, ipAddress, userAgent }, at);
      const authorization = await loadAuthorization(repository, customer.id, at);
      const { token: sessionToken, expiresAt } = await sessionTokens.issue(customer.id, authorization.roles, now());
      await repository.createSession({
        userId: customer.id,
        tokenHash: hashToken(sessionToken),
        expiresAt,
        deviceName: null,
        ipAddress,
        userAgent,
      }, at);
      const maxAgeSeconds = session.ttlSeconds;
      res.append('Set-Cookie', sessionCookie({ name: SESSION_COOKIE, value: sessionToken, maxAgeSeconds, ...session.cookie }));
      res.append('Set-Cookie', csrfCookie({ name: CSRF_COOKIE, value: generateCsrfToken(), maxAgeSeconds, ...session.cookie }));
      res.status(200).json({ customer: publicCustomer(customer), ...authorization });
    } catch (error) {
      next(error);
    }
  }

  const requireSession = createSessionMiddleware(repository, sessionTokens, now);

  async function currentSession(req, res, next) {
    try {
      res.status(200).json({
        customer: publicCustomer(req.session.customer),
        roles: req.session.authorization.roles,
        permissions: req.session.authorization.permissions,
        branchAssignments: req.session.authorization.branchAssignments,
      });
    } catch (error) {
      next(error);
    }
  }

  async function logout(req, res, next) {
    try {
      const origin = req.headers.origin;
      if (origin && config.allowedOrigins.length > 0 && !config.allowedOrigins.includes(origin)) {
        throw new HttpError(403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
      }
      validateCsrfProof(req);
      await repository.revokeSession(req.sessionTokenHash, now());
      const clear = session.cookie;
      res.append('Set-Cookie', clearedCookie({ name: SESSION_COOKIE, ...clear }));
      res.append('Set-Cookie', clearedCookie({ name: CSRF_COOKIE, ...clear, httpOnly: false }));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }

  router.post('/register', limiter(config.registerRateLimit), register);
  router.post('/verify-email', limiter(config.verifyRateLimit), verifyEmail);
  router.post('/resend-verification', limiter(config.resendRateLimit), resendVerification);
  router.post('/login', limiter(config.loginRateLimit), login);
  router.get('/session', requireSession, currentSession);
  router.post('/logout', requireSession, logout);
  return router;
}
