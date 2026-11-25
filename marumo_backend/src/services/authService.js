import bcrypt from 'bcryptjs';
import { hashToken, generateToken, generateCsrfToken } from '../utils/tokens.js';
import { HttpError, parseRegistration, parseLogin, parseVerificationToken, parseEmailOnly } from '../utils/validation.js';
import { isDuplicate } from '../repositories/repository.js';
import { loadAuthorization } from '../middlewares/session.js';
import { sessionCookie, csrfCookie } from '../utils/cookies.js';
import { SESSION_COOKIE, CSRF_COOKIE } from '../constants/session.js';

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
};

function publicCustomer(customer) {
  return { id: customer.id, name: customer.name, email: customer.email };
}

export function createAuthService(repository, options) {
  const { now, sendVerification, logger, verificationUrl, session, sessionTokens, ...config } = { ...DEFAULTS, ...options };
  const deliveryQueues = new Map();
  const decoyHash = bcrypt.hashSync('marumo-credential-check-value', config.bcryptRounds);

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

  async function issueSessionCookies(customer, ipAddress, userAgent) {
    const authorization = await loadAuthorization(repository, customer.id, now());
    const { token: sessionToken, expiresAt } = await sessionTokens.issue(customer.id, authorization.roles, now());
    await repository.createSession({
      userId: customer.id,
      tokenHash: hashToken(sessionToken),
      expiresAt,
      deviceName: null,
      ipAddress,
      userAgent,
    }, now());
    const maxAgeSeconds = session.ttlSeconds;
    return {
      body: { customer: publicCustomer(customer), ...authorization },
      cookies: [
        sessionCookie({ name: SESSION_COOKIE, value: sessionToken, maxAgeSeconds, ...session.cookie }),
        csrfCookie({ name: CSRF_COOKIE, value: generateCsrfToken(), maxAgeSeconds, ...session.cookie }),
      ],
    };
  }

  return {
    VERIFICATION_PENDING,
    async register(body) {
      const { name, email, password } = parseRegistration(body);
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
      return VERIFICATION_PENDING;
    },
    async verifyEmail(body) {
      const { token } = parseVerificationToken(body);
      const result = await repository.consumeVerification(hashToken(token), now());
      if (!result) throw new HttpError(400, 'TOKEN_INVALID', 'The verification link is invalid or has expired.');
      return { code: 'EMAIL_VERIFIED', message: 'The email address is verified. You can sign in now.' };
    },
    async resendVerification(body) {
      const { email } = parseEmailOnly(body);
      queueVerification(email);
      return VERIFICATION_PENDING;
    },
    async login({ body, ipAddress, userAgent }) {
      const { email, password } = parseLogin(body);
      const at = now();
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
      return issueSessionCookies(customer, ipAddress, userAgent);
    },
    sessionPayload(session) {
      return {
        customer: publicCustomer(session.customer),
        roles: session.authorization.roles,
        permissions: session.authorization.permissions,
        branchAssignments: session.authorization.branchAssignments,
      };
    },
    async logout({ sessionTokenHash }) {
      await repository.revokeSession(sessionTokenHash, now());
    },
  };
}
