import { parseCookieHeader } from './cookies.js';
import { hashToken } from './tokens.js';
import { HttpError } from './validation.js';

export const SESSION_COOKIE = 'marumo_session';
export const CSRF_COOKIE = 'marumo_csrf';

export function createSessionMiddleware(repository, now = Date.now) {
  return async (req, _res, next) => {
    try {
      const token = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE];
      if (!token) throw new HttpError(401, 'SESSION_INVALID', 'Sign in to continue.');
      const tokenHash = hashToken(token);
      const at = now();
      const session = await repository.findSession(tokenHash, at);
      if (!session || session.customer.status !== 'ACTIVE' || (session.customer.lockedUntil !== null && session.customer.lockedUntil > at)) {
        throw new HttpError(401, 'SESSION_INVALID', 'The session is invalid or has expired.');
      }
      await repository.touchSession(tokenHash, at);
      const authorization = await repository.findUserRoles(session.userId);
      authorization.branchAssignments = await repository.findUserBranchAssignments(session.userId, at);
      req.session = { ...session, authorization };
      req.sessionTokenHash = tokenHash;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateCsrfProof(req) {
  const jar = parseCookieHeader(req.headers.cookie);
  const proof = req.headers['x-csrf-token'];
  if (typeof proof !== 'string' || proof.length === 0 || proof !== jar[CSRF_COOKIE]) {
    throw new HttpError(403, 'CSRF_INVALID', 'The CSRF token is missing or invalid.');
  }
}
