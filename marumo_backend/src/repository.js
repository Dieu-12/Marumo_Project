import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { createMemoryMovieRepository, createSqlMovieRepository } from './catalogRepository.js';

function toMs(value) {
  return value === null || value === undefined ? null : new Date(value).getTime();
}

function duplicateKeyError(message) {
  return Object.assign(new Error(message), { code: 'DUPLICATE_EMAIL' });
}

function isDuplicate(error) {
  return error?.code === 'DUPLICATE_EMAIL' || error?.number === 2627 || error?.number === 2601;
}

export { isDuplicate };

export function createMemoryRepository(name) {
  const customersByEmail = new Map();
  const verificationsByToken = new Map();
  const sessionsByToken = new Map();
  const loginHistory = [];
  let nextUserId = 1;

  function verificationsOf(userId) {
    return [...verificationsByToken.values()].filter((row) => row.userId === userId);
  }

  function activeVerification(userId) {
    const rows = verificationsOf(userId).filter((row) => row.revokedAt === null && row.verifiedAt === null);
    const row = rows[rows.length - 1];
    if (!row) return null;
    return { tokenHash: row.tokenHash, createdAt: row.createdAt, expiresAt: row.expiresAt, usedAt: null };
  }

  function snapshot(row) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      status: row.status,
      emailVerifiedAt: row.emailVerifiedAt,
      failedLoginCount: row.failedLoginCount,
      lockedUntil: row.lockedUntil,
      lastLoginAt: row.lastLoginAt,
      verification: activeVerification(row.id),
    };
  }

  return {
    ...createMemoryMovieRepository(),
    name,
    async hasGlobalPermission(_userId, _permission) {
      return false;
    },
    async ping() {
      return true;
    },
    async findCustomer(email) {
      const row = customersByEmail.get(email);
      return row ? snapshot(row) : null;
    },
    async createCustomer({ name, email, passwordHash }, at) {
      if (customersByEmail.has(email)) throw duplicateKeyError('Email already registered.');
      const row = {
        id: String(nextUserId),
        name,
        email,
        passwordHash,
        status: 'PENDING',
        emailVerifiedAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: at,
      };
      customersByEmail.set(email, row);
      nextUserId += 1;
      return snapshot(row);
    },
    async lastVerificationAt(userId) {
      const rows = verificationsOf(userId);
      if (rows.length === 0) return null;
      return rows.reduce((latest, row) => Math.max(latest, row.createdAt), 0);
    },
    async stageVerification({ userId, email, tokenHash, expiresAt }, at) {
      const row = { userId, email, tokenHash, createdAt: at, expiresAt, verifiedAt: null, revokedAt: at };
      verificationsByToken.set(tokenHash, row);
      return { userId, email, tokenHash };
    },
    async activateVerification({ userId, tokenHash }, at) {
      const row = verificationsByToken.get(tokenHash);
      if (!row || row.userId !== userId || row.verifiedAt !== null) return;
      row.revokedAt = null;
      for (const other of verificationsOf(userId)) {
        if (other.tokenHash !== tokenHash && other.verifiedAt === null && other.revokedAt === null) {
          other.revokedAt = at;
        }
      }
    },
    async consumeVerification(tokenHash, at) {
      const row = verificationsByToken.get(tokenHash);
      if (!row || row.revokedAt !== null || row.verifiedAt !== null || row.expiresAt <= at) return null;
      const customer = customersByEmail.get(row.email);
      if (!customer || customer.status !== 'PENDING') return null;
      row.verifiedAt = at;
      row.revokedAt = null;
      customer.status = 'ACTIVE';
      customer.emailVerifiedAt = at;
      return { userId: customer.id, email: customer.email };
    },
    async findUserRoles(_userId) {
      return { roles: [], permissions: [] };
    },
    async findUserBranchAssignments(_userId, _at) {
      return [];
    },
    async createSession({ userId, tokenHash, expiresAt, deviceName, ipAddress, userAgent }, at) {
      const row = {
        sessionId: randomUUID(),
        userId,
        tokenHash,
        deviceName,
        ipAddress,
        userAgent,
        createdAt: at,
        lastActivityAt: at,
        expiresAt,
        revokedAt: null,
      };
      sessionsByToken.set(tokenHash, row);
      return { sessionId: row.sessionId };
    },
    async findSession(tokenHash, at) {
      const row = sessionsByToken.get(tokenHash);
      if (!row || row.revokedAt !== null || row.expiresAt <= at) return null;
      const customer = [...customersByEmail.values()].find((entry) => entry.id === row.userId);
      if (!customer) return null;
      return {
        sessionId: row.sessionId,
        userId: row.userId,
        expiresAt: row.expiresAt,
        customer: snapshot(customer),
      };
    },
    async touchSession(tokenHash, at) {
      const row = sessionsByToken.get(tokenHash);
      if (row) row.lastActivityAt = at;
    },
    async revokeSession(tokenHash, at) {
      const row = sessionsByToken.get(tokenHash);
      if (!row || row.revokedAt !== null) return false;
      row.revokedAt = at;
      return true;
    },
    async recordLoginResult({ userId, identifier, success, failureReason, ipAddress, userAgent }, at) {
      loginHistory.push({
        userId: userId ?? null,
        identifier,
        success,
        failureReason: failureReason ?? null,
        ipAddress,
        userAgent,
        attemptedAt: at,
      });
    },
    async recordLoginSuccess(userId, at) {
      const customer = [...customersByEmail.values()].find((entry) => entry.id === userId);
      if (!customer) return;
      customer.failedLoginCount = 0;
      customer.lockedUntil = null;
      customer.lastLoginAt = at;
    },
    async recordLoginFailure(userId, { threshold, lockUntil }, _at) {
      const customer = [...customersByEmail.values()].find((entry) => entry.id === userId);
      if (!customer) return;
      customer.failedLoginCount += 1;
      if (customer.failedLoginCount >= threshold) customer.lockedUntil = lockUntil;
    },
  };
}

function mapCustomer(row, verification) {
  return {
    id: String(row.user_id),
    name: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    emailVerifiedAt: toMs(row.email_verified_at),
    failedLoginCount: row.failed_login_count,
    lockedUntil: toMs(row.locked_until),
    lastLoginAt: toMs(row.last_login_at),
    verification: verification ?? null,
  };
}

export function createSqlRepository(pool) {
  const readCustomer = async (userId) => {
    const request = pool.request();
    request.input('userId', sql.BigInt, userId);
    const result = await request.query(
      `SELECT verification_code_hash, created_at, expires_at, verified_at
       FROM dbo.user_verifications
       WHERE user_id = @userId AND verification_type = 'EMAIL'
         AND revoked_at IS NULL AND verified_at IS NULL;`,
    );
    const row = result.recordset[0];
    if (!row) return null;
    return { tokenHash: row.verification_code_hash, createdAt: toMs(row.created_at), expiresAt: toMs(row.expires_at), usedAt: toMs(row.verified_at) };
  };

  const selectCustomerByEmail = `SELECT user_id, full_name, email, password_hash, status, email_verified_at, failed_login_count, locked_until, last_login_at FROM dbo.users WHERE email = @email;`;

  return {
    ...createSqlMovieRepository(pool),
    async hasGlobalPermission(userId, permission) {
      const result = await pool.request()
        .input('userId', sql.BigInt, userId)
        .input('permission', sql.VarChar(100), permission)
        .query(`SELECT TOP (1) 1 AS allowed FROM dbo.user_roles ur
          JOIN dbo.roles r ON r.role_id = ur.role_id
          JOIN dbo.role_permissions rp ON rp.role_id = r.role_id
          JOIN dbo.permissions p ON p.permission_id = rp.permission_id
          WHERE ur.user_id = @userId AND ur.revoked_at IS NULL AND r.is_active = 1
            AND r.scope_type = 'GLOBAL' AND p.permission_code = @permission;`);
      return result.recordset.length > 0;
    },
    async ping() {
      await pool.request().query('SELECT 1 AS ok;');
      return true;
    },
    async findCustomer(email) {
      const request = pool.request();
      request.input('email', sql.NVarChar(255), email);
      const result = await request.query(selectCustomerByEmail);
      const row = result.recordset[0];
      if (!row) return null;
      return mapCustomer(row, await readCustomer(row.user_id));
    },
    async createCustomer({ name, email, passwordHash }, _at) {
      const request = pool.request();
      request.input('email', sql.NVarChar(255), email);
      request.input('passwordHash', sql.NVarChar(255), passwordHash);
      request.input('name', sql.NVarChar(150), name);
      const result = await request.query(
        `INSERT INTO dbo.users (email, password_hash, full_name, status)
         OUTPUT inserted.user_id AS user_id
         VALUES (@email, @passwordHash, @name, 'PENDING');`,
      );
      return mapCustomer({ ...result.recordset[0], email, full_name: name, password_hash: passwordHash, status: 'PENDING', email_verified_at: null, failed_login_count: 0, locked_until: null, last_login_at: null }, null);
    },
    async lastVerificationAt(userId) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      const result = await request.query(
        `SELECT MAX(created_at) AS last_sent_at FROM dbo.user_verifications WHERE user_id = @userId AND verification_type = 'EMAIL';`,
      );
      return toMs(result.recordset[0].last_sent_at);
    },
    async stageVerification({ userId, email, tokenHash, expiresAt }, at) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      request.input('email', sql.NVarChar(255), email);
      request.input('tokenHash', sql.VarChar(255), tokenHash);
      request.input('expiresAt', sql.DateTime2, new Date(expiresAt));
      request.input('at', sql.DateTime2, new Date(at));
      await request.query(
        `INSERT INTO dbo.user_verifications (user_id, verification_type, verification_target, verification_code_hash, created_at, expires_at, revoked_at)
         VALUES (@userId, 'EMAIL', @email, @tokenHash, @at, @expiresAt, @at);`,
      );
      return { userId, email, tokenHash };
    },
    async activateVerification({ userId, tokenHash }, at) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      request.input('tokenHash', sql.VarChar(255), tokenHash);
      request.input('at', sql.DateTime2, new Date(at));
      await request.query(
        `UPDATE dbo.user_verifications SET revoked_at = NULL
         WHERE user_id = @userId AND verification_code_hash = @tokenHash AND verified_at IS NULL;`,
      );
      await request.query(
        `UPDATE dbo.user_verifications SET revoked_at = @at
         WHERE user_id = @userId AND verified_at IS NULL AND revoked_at IS NULL
           AND verification_code_hash <> @tokenHash;`,
      );
    },
    async consumeVerification(tokenHash, at) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const request = new sql.Request(transaction);
        request.input('tokenHash', sql.VarChar(255), tokenHash);
        request.input('at', sql.DateTime2, new Date(at));
        const found = await request.query(
          `SELECT verification_id, user_id FROM dbo.user_verifications WITH (UPDLOCK, ROWLOCK)
           WHERE verification_code_hash = @tokenHash AND revoked_at IS NULL AND verified_at IS NULL AND expires_at > @at
           ORDER BY verification_id DESC;`,
        );
        const row = found.recordset[0];
        if (!row) {
          await transaction.rollback();
          return null;
        }
        request.input('verificationId', sql.BigInt, row.verification_id);
        request.input('userId', sql.BigInt, row.user_id);
        const consumed = await request.query(
          `UPDATE dbo.user_verifications SET verified_at = @at WHERE verification_id = @verificationId AND verified_at IS NULL;`,
        );
        const user = await request.query(`SELECT email, status FROM dbo.users WHERE user_id = @userId;`);
        const activated = await request.query(
          `UPDATE dbo.users SET status = 'ACTIVE', email_verified_at = @at WHERE user_id = @userId AND status = 'PENDING';`,
        );
        if (consumed.rowsAffected[0] !== 1 || user.recordset[0]?.status !== 'PENDING' || activated.rowsAffected[0] !== 1) {
          await transaction.rollback();
          return null;
        }
        await transaction.commit();
        return { userId: String(row.user_id), email: user.recordset[0].email };
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    },
    async findUserRoles(userId) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      const roles = await request.query(
        `SELECT r.role_code, r.scope_type FROM dbo.user_roles ur
         JOIN dbo.roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = @userId AND ur.revoked_at IS NULL AND r.is_active = 1
         ORDER BY r.role_code;`,
      );
      const permissions = await request.query(
        `SELECT DISTINCT p.permission_code FROM dbo.user_roles ur
         JOIN dbo.role_permissions rp ON rp.role_id = ur.role_id
         JOIN dbo.permissions p ON p.permission_id = rp.permission_id
         WHERE ur.user_id = @userId AND ur.revoked_at IS NULL
         ORDER BY p.permission_code;`,
      );
      return {
        roles: roles.recordset.map((row) => ({ code: row.role_code, scopeType: row.scope_type })),
        permissions: permissions.recordset.map((row) => row.permission_code),
      };
    },
    async findUserBranchAssignments(userId, at) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      request.input('at', sql.DateTime2, new Date(at));
      const result = await request.query(
        `SELECT a.assignment_id, a.branch_id, r.role_code, a.starts_at, a.ends_at
         FROM dbo.user_branch_assignments a
         JOIN dbo.roles r ON r.role_id = a.role_id
         WHERE a.user_id = @userId AND a.status = 'ACTIVE'
           AND a.starts_at <= @at AND (a.ends_at IS NULL OR a.ends_at > @at);`,
      );
      return result.recordset.map((row) => ({
        assignmentId: String(row.assignment_id),
        branchId: String(row.branch_id),
        roleCode: row.role_code,
        startsAt: toMs(row.starts_at),
        endsAt: toMs(row.ends_at),
      }));
    },
    async createSession({ userId, tokenHash, expiresAt, deviceName, ipAddress, userAgent }, _at) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      request.input('tokenHash', sql.VarChar(255), tokenHash);
      request.input('deviceName', sql.NVarChar(150), deviceName ?? null);
      request.input('ipAddress', sql.VarChar(45), ipAddress ?? null);
      request.input('userAgent', sql.NVarChar(500), userAgent ?? null);
      request.input('expiresAt', sql.DateTime2, new Date(expiresAt));
      const result = await request.query(
        `INSERT INTO dbo.user_sessions (user_id, session_token_hash, device_name, ip_address, user_agent, expires_at)
         OUTPUT inserted.session_id AS session_id
         VALUES (@userId, @tokenHash, @deviceName, @ipAddress, @userAgent, @expiresAt);`,
      );
      return { sessionId: result.recordset[0].session_id };
    },
    async findSession(tokenHash, at) {
      const request = pool.request();
      request.input('tokenHash', sql.VarChar(255), tokenHash);
      request.input('at', sql.DateTime2, new Date(at));
      const result = await request.query(
        `SELECT s.session_id, s.user_id, s.expires_at,
                u.full_name, u.email, u.password_hash, u.status, u.email_verified_at,
                u.failed_login_count, u.locked_until, u.last_login_at
         FROM dbo.user_sessions s
         JOIN dbo.users u ON u.user_id = s.user_id
         WHERE s.session_token_hash = @tokenHash AND s.revoked_at IS NULL AND s.expires_at > @at;`,
      );
      const row = result.recordset[0];
      if (!row) return null;
      return {
        sessionId: row.session_id,
        userId: String(row.user_id),
        expiresAt: toMs(row.expires_at),
        customer: mapCustomer(row, null),
      };
    },
    async touchSession(tokenHash, at) {
      const request = pool.request();
      request.input('tokenHash', sql.VarChar(255), tokenHash);
      request.input('at', sql.DateTime2, new Date(at));
      await request.query(
        `UPDATE dbo.user_sessions SET last_activity_at = @at
         WHERE session_token_hash = @tokenHash AND revoked_at IS NULL;`,
      );
    },
    async revokeSession(tokenHash, at) {
      const request = pool.request();
      request.input('tokenHash', sql.VarChar(255), tokenHash);
      request.input('at', sql.DateTime2, new Date(at));
      const result = await request.query(
        `UPDATE dbo.user_sessions SET revoked_at = @at
         WHERE session_token_hash = @tokenHash AND revoked_at IS NULL;`,
      );
      return result.rowsAffected[0] === 1;
    },
    async recordLoginResult({ userId, identifier, success, failureReason, ipAddress, userAgent }, at) {
      const request = pool.request();
      request.input('userId', sql.BigInt, userId ? Number(userId) : null);
      request.input('identifier', sql.NVarChar(255), identifier);
      request.input('status', sql.VarChar(20), success ? 'SUCCESS' : 'FAILED');
      request.input('failureReason', sql.VarChar(50), failureReason ?? null);
      request.input('ipAddress', sql.VarChar(45), ipAddress ?? null);
      request.input('userAgent', sql.NVarChar(500), userAgent ?? null);
      request.input('at', sql.DateTime2, new Date(at));
      await request.query(
        `INSERT INTO dbo.user_login_history (user_id, login_identifier, login_status, failure_reason, ip_address, user_agent, attempted_at)
         VALUES (@userId, @identifier, @status, @failureReason, @ipAddress, @userAgent, @at);`,
      );
    },
    async recordLoginSuccess(userId, at) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      request.input('at', sql.DateTime2, new Date(at));
      await request.query(
        `UPDATE dbo.users SET failed_login_count = 0, locked_until = NULL, last_login_at = @at WHERE user_id = @userId;`,
      );
    },
    async recordLoginFailure(userId, { threshold, lockUntil }, _at) {
      const request = pool.request();
      request.input('userId', sql.BigInt, Number(userId));
      request.input('threshold', sql.Int, threshold);
      request.input('lockUntil', sql.DateTime2, new Date(lockUntil));
      await request.query(
        `UPDATE dbo.users
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE WHEN failed_login_count + 1 >= @threshold THEN @lockUntil ELSE locked_until END
         WHERE user_id = @userId;`,
      );
    },
  };
}
