import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function generateToken() {
  return randomBytes(32).toString('base64url');
}

export function generateCsrfToken() {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newRequestId() {
  return randomUUID();
}
