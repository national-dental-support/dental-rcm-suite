import { Router, Request, Response } from 'express';
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import logger from '../../utils/logger';
import Database from '../../modules/db';
import { runAsSystem } from '../../modules/rls-context';
import verifyToken, { signSession } from '../../middleware/jwt';

/**
 * Local credential authentication.
 *
 * The suite authenticates against its own dbo.Users table. A fresh install is
 * seeded with one superadmin whose `must_change_password` flag is set; the
 * token verifier refuses every other route until that password is replaced.
 *
 * Single sign-on, when configured, bypasses these routes entirely - the token
 * verifier accepts the provider's token instead.
 */

const router = Router();

/** Consecutive failures before an account is locked. */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 12;

interface AuthUserRow {
  userID: number;
  Email: string;
  FirstName: string | null;
  LastName: string | null;
  Role: string;
  disabled: boolean;
  archived: boolean;
  locked_until: Date | null;
  failed_login_count: number;
  password_hash: string | null;
  must_change_password: boolean;
}

function pool() {
  return Database.getInstance().getPool();
}

async function loadUser(email: string): Promise<AuthUserRow | null> {
  const r = await pool()
    .request()
    .input('email', sql.NVarChar(255), email)
    .query<AuthUserRow>(`
      SELECT TOP 1
        userID, Email, FirstName, LastName, Role, disabled, archived,
        locked_until, failed_login_count, password_hash, must_change_password
      FROM dbo.Users
      WHERE LOWER(Email) = @email
    `);
  return r.recordset[0] ?? null;
}

async function recordFailure(userId: number, failures: number): Promise<void> {
  const next = failures + 1;
  const lock = next >= MAX_FAILED_LOGINS;
  await pool()
    .request()
    .input('id', sql.Int, userId)
    .input('count', sql.Int, next)
    .input('lock', sql.Bit, lock ? 1 : 0)
    .input('minutes', sql.Int, LOCKOUT_MINUTES)
    .query(`
      UPDATE dbo.Users
      SET failed_login_count = @count,
          locked_until = CASE WHEN @lock = 1 THEN DATEADD(MINUTE, @minutes, SYSUTCDATETIME()) ELSE locked_until END
      WHERE userID = @id
    `);
}

async function recordSuccess(userId: number): Promise<void> {
  await pool()
    .request()
    .input('id', sql.Int, userId)
    .query(`
      UPDATE dbo.Users
      SET failed_login_count = 0,
          locked_until = NULL,
          last_login_at = SYSUTCDATETIME(),
          last_activity_at = SYSUTCDATETIME()
      WHERE userID = @id
    `);
}

function identityOf(user: AuthUserRow) {
  return {
    email: user.Email,
    firstName: user.FirstName ?? undefined,
    lastName: user.LastName ?? undefined,
    role: user.Role,
    mustChangePassword: !!user.must_change_password,
  };
}

/**
 * POST /api/auth/login
 *
 * Mounted before the token verifier. Responds 401 for every failure mode
 * without distinguishing between them, so the endpoint cannot be used to
 * enumerate accounts.
 */
router.post('/login', async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await runAsSystem(() => loadUser(email));

    // Same response for unknown account, no credential set, disabled, archived
    // or wrong password.
    const unusable =
      !user ||
      user.disabled ||
      user.archived ||
      !user.password_hash ||
      (user.locked_until && new Date(user.locked_until) > new Date());

    if (unusable) {
      logger.warn('[Auth] login rejected', { emailDomain: email.split('@')[1] ?? 'unknown' });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user!.password_hash as string);
    if (!ok) {
      await runAsSystem(() => recordFailure(user!.userID, user!.failed_login_count ?? 0));
      logger.warn('[Auth] login failed - bad password', { userId: user!.userID });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await runAsSystem(() => recordSuccess(user!.userID));

    const identity = identityOf(user!);
    const token = signSession({ email: identity.email, mustChangePassword: identity.mustChangePassword });

    logger.info('[Auth] login succeeded', {
      userId: user!.userID,
      role: user!.Role,
      mustChangePassword: identity.mustChangePassword,
    });

    return res.status(200).json({ token, identity });
  } catch (err) {
    logger.error('[Auth] login error', {
      error: err instanceof Error ? err.message : String(err),
      alert: 'AUTH_LOGIN_FAILED',
    });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/auth/change-password
 *
 * Reachable while `must_change_password` is set, which is how the bootstrap
 * account is retired. Requires the current password, so a stolen session token
 * alone cannot take the account over.
 */
// verifyToken is applied here, at the route, rather than relied on from the
// global gate. This router is mounted in front of that gate so that /login is
// reachable without a token, which also meant these two routes never saw the
// x-actor-email the gate sets - so the account that is required to change its
// password could not reach the endpoint that changes it.
router.post('/change-password', verifyToken, async (req: Request, res: Response) => {
  const email = String(req.headers['x-actor-email'] ?? '').trim().toLowerCase();
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');

  if (!email) return res.status(401).json({ message: 'Authentication required' });
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: 'New password must differ from the current one' });
  }

  try {
    const user = await runAsSystem(() => loadUser(email));
    if (!user || !user.password_hash || user.disabled || user.archived) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
      logger.warn('[Auth] password change rejected - bad current password', { userId: user.userID });
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await runAsSystem(() =>
      pool()
        .request()
        .input('id', sql.Int, user.userID)
        .input('hash', sql.NVarChar(255), hash)
        .query(`
          UPDATE dbo.Users
          SET password_hash = @hash,
              password_algo = 'bcrypt',
              must_change_password = 0,
              failed_login_count = 0,
              locked_until = NULL
          WHERE userID = @id
        `),
    );

    logger.info('[Auth] password changed', { userId: user.userID });

    // Issue a fresh token so the must-change flag is cleared for this session.
    const identity = { ...identityOf(user), mustChangePassword: false };
    const token = signSession({ email: identity.email, mustChangePassword: false });

    return res.status(200).json({ token, identity });
  } catch (err) {
    logger.error('[Auth] password change error', {
      error: err instanceof Error ? err.message : String(err),
      alert: 'AUTH_PASSWORD_CHANGE_FAILED',
    });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 *
 * Session tokens are stateless, so there is nothing server-side to revoke; the
 * client discards the token. The endpoint exists so logout is auditable.
 */
router.post('/logout', verifyToken, (req: Request, res: Response) => {
  const email = String(req.headers['x-actor-email'] ?? '');
  if (email) logger.info('[Auth] logout', { emailDomain: email.split('@')[1] ?? 'unknown' });
  return res.status(204).send();
});

export default router;
