import { SignJWT, jwtVerify, errors } from 'jose';
import { generateToken } from '../utils/tokens.js';
import { validateSessionOptions } from '../configs/config.js';
import { HttpError } from '../utils/validation.js';
import { MAX_BIGINT_ID as MAX_ID } from '../constants/ids.js';

const ISSUER = 'marumo-api';
const AUDIENCE = 'marumo-browser';
const TOKEN_TYPE = 'marumo-session+jwt';

function invalidSession() {
  return new HttpError(401, 'SESSION_INVALID', 'The session is invalid or has expired.');
}

function validSubject(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= MAX_ID;
}

export function createSessionTokens(options) {
  const { jwtSecret, ttlSeconds } = validateSessionOptions(options);
  const key = new TextEncoder().encode(jwtSecret);
  return {
    async issue(userId, roles, at) {
      const issuedAt = Math.floor(at / 1000);
      const expiresAt = issuedAt + ttlSeconds;
      const token = await new SignJWT({ roles: roles.map((role) => role.code) })
        .setProtectedHeader({ alg: 'HS256', typ: TOKEN_TYPE })
        .setSubject(userId)
        .setJti(generateToken())
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(key);
      return { token, expiresAt: expiresAt * 1000 };
    },
    async verify(token, at) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, typ: TOKEN_TYPE,
          requiredClaims: ['sub', 'jti', 'iat', 'exp', 'roles'], currentDate: new Date(at),
        }));
      } catch (error) {
        if (error instanceof errors.JOSEError) throw invalidSession();
        throw error;
      }
      if (!validSubject(payload.sub) || typeof payload.jti !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.jti)
        || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.iat > Math.floor(at / 1000) || payload.exp <= payload.iat || !Number.isSafeInteger(payload.exp * 1000)
        || payload.exp - payload.iat > 30 * 86400
        || !Array.isArray(payload.roles) || payload.roles.some((code) => typeof code !== 'string' || code.length < 1 || code.length > 30)) {
        throw invalidSession();
      }
      return { userId: payload.sub, expiresAt: payload.exp * 1000 };
    },
  };
}
