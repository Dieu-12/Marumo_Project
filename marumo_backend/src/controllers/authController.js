import { HttpError } from '../utils/validation.js';
import { validateCsrfProof } from '../middlewares/session.js';
import { clearedCookie } from '../utils/cookies.js';
import { SESSION_COOKIE, CSRF_COOKIE } from '../constants/session.js';

function clientAddress(req) {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export function createAuthController(service, { allowedOrigins = [], session } = {}) {
  return {
    async register(req, res) {
      res.status(202).json(await service.register(req.body));
    },
    async verifyEmail(req, res) {
      res.status(200).json(await service.verifyEmail(req.body));
    },
    async resendVerification(req, res) {
      res.status(202).json(await service.resendVerification(req.body));
    },
    async login(req, res) {
      const result = await service.login({
        body: req.body,
        ipAddress: clientAddress(req),
        userAgent: req.headers['user-agent'] ?? null,
      });
      for (const cookie of result.cookies) res.append('Set-Cookie', cookie);
      res.status(200).json(result.body);
    },
    async currentSession(req, res) {
      res.status(200).json(service.sessionPayload(req.session));
    },
    async logout(req, res) {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
        throw new HttpError(403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
      }
      validateCsrfProof(req);
      await service.logout({ sessionTokenHash: req.sessionTokenHash });
      const clear = session.cookie;
      res.append('Set-Cookie', clearedCookie({ name: SESSION_COOKIE, ...clear }));
      res.append('Set-Cookie', clearedCookie({ name: CSRF_COOKIE, ...clear, httpOnly: false }));
      res.status(204).end();
    },
  };
}
