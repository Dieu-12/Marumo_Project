import { parseCookieHeader } from '../utils/cookies.js';
import { hashToken } from '../utils/tokens.js';
import { HttpError } from '../utils/validation.js';
import { SESSION_COOKIE, CSRF_COOKIE } from '../constants/session.js';

export async function loadAuthorization(repository, userId, at) {
  const authorization = await repository.findUserRoles(userId);
  return { ...authorization, branchAssignments: await repository.findUserBranchAssignments(userId, at) };
}

export function createSessionMiddleware(repository, sessionTokens, now = Date.now) {
  return async (req, _res, next) => {
    try {
      const token = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE];
      if (!token) throw new HttpError(401, 'SESSION_INVALID', 'Sign in to continue.');
      const at = now();
      const identity = await sessionTokens.verify(token, at);
      const tokenHash = hashToken(token);
      const session = await repository.findSession(tokenHash, at);
      if (!session || session.userId !== identity.userId || session.expiresAt !== identity.expiresAt || session.customer.status !== 'ACTIVE' || (session.customer.lockedUntil !== null && session.customer.lockedUntil > at)) {
        throw new HttpError(401, 'SESSION_INVALID', 'The session is invalid or has expired.');
      }
      await repository.touchSession(tokenHash, at);
      const authorization = await loadAuthorization(repository, session.userId, at);
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

export function createWriteProof(allowedOrigins) {
  return (req, _res, next) => {
    try {
      if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
        throw new HttpError(403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
      }
      validateCsrfProof(req);
      next();
    } catch (error) {
      next(error);
    }
  };
}
