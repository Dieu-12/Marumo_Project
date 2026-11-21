const EMAIL_PATTERN = /^[a-z0-9._'%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const BCRYPT_MAX_BYTES = 72;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalidInput(message) {
  return new HttpError(400, 'INVALID_INPUT', message);
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw invalidInput('Email is required.');
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) throw invalidInput('Email is invalid.');
  const local = email.split('@')[0];
  if (!local || local.length > 64 || !EMAIL_PATTERN.test(email)) throw invalidInput('Email is invalid.');
  return email;
}

function requireObject(body, requiredKeys, optionalKeys = []) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidInput('Request body must be a JSON object.');
  }
  const actual = Object.keys(body);
  const required = [...requiredKeys].sort();
  const allowed = [...requiredKeys, ...optionalKeys].sort();
  const missing = required.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !allowed.includes(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw invalidInput('Request body fields are invalid.');
  }
}

function requireString(body, key, minLength, maxLength) {
  const value = body[key];
  if (typeof value !== 'string') throw invalidInput(`${key} is required.`);
  if (value.length < minLength || value.length > maxLength) {
    throw invalidInput(`${key} must be between ${minLength} and ${maxLength} characters.`);
  }
  return value;
}

export function parseRegistration(body) {
  requireObject(body, ['email', 'password'], ['name']);
  const email = normalizeEmail(body.email);
  let name;
  if (body.name === undefined) {
    name = email.split('@')[0].slice(0, 150);
  } else {
    name = requireString(body, 'name', 1, 200).trim();
    if (name.length < 1 || name.length > 150) throw invalidInput('Name must be between 1 and 150 characters.');
  }
  const password = requireString(body, 'password', 12, 200);
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
    throw invalidInput('Password is too long.');
  }
  return { name, email, password };
}

export function parseLogin(body) {
  requireObject(body, ['email', 'password']);
  const email = normalizeEmail(body.email);
  const password = requireString(body, 'password', 1, 200);
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) throw invalidInput('Password is too long.');
  return { email, password };
}

export function parseVerificationToken(body) {
  requireObject(body, ['token']);
  return { token: requireString(body, 'token', 1, 256) };
}

export function parseEmailOnly(body) {
  requireObject(body, ['email']);
  return { email: normalizeEmail(body.email) };
}
