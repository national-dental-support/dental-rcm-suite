/**
 * SSO Validation - public endpoint called by the web app's SsoLandingComponent.
 *
 * GET /api/sso/validate?token=...
 *   Validates a short-lived cross-app token issued by the practice-management system-server.
 *   Returns { email, oid, redirect } on success.
 *   Returns 401 if the token is expired/invalid, 403 if the user is disabled.
 *
 * This route is registered BEFORE the JWT middleware so it does not require an
 * Azure AD Bearer token - the SsoLandingComponent calls it before the user has
 * authenticated in the web app.
 *
 * Security: the CROSS_APP_SSO_SECRET shared secret (must match the practice-management system-server's
 * .env) prevents forged tokens. Tokens expire after 5 minutes.
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';

const router = Router();

router.get('/validate', async (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };

  if (!token) {
    return res.status(400).json({ error: 'token required' });
  }

  const secret = process.env.CROSS_APP_SSO_SECRET;
  if (!secret) {
    logger.error('[SSO Validate] CROSS_APP_SSO_SECRET not configured');
    return res.status(500).json({ error: 'SSO not configured' });
  }

  try {
    const payload = jwt.verify(token, secret) as any;

    const pool: sql.ConnectionPool = Database.getInstance().getPool();
    const r = await pool.request()
      .input('email', sql.NVarChar(200), payload.email?.toLowerCase())
      .query(`
        SELECT TOP 1 Email, azure_oid, disabled, archived
        FROM dbo.Users
        WHERE LOWER(Email) = @email
      `);

    const user = r.recordset[0];
    if (!user) {
      return res.status(403).json({ error: 'user_not_found' });
    }
    if (user.disabled || user.archived) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.json({
      email: user.Email,
      oid: user.azure_oid ?? payload.oid ?? null,
      redirect: payload.redirect ?? '/app/home',
    });
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired' });
    }
    logger.error(`[SSO Validate] error: ${err?.message}`);
    return res.status(401).json({ error: 'invalid_token' });
  }
});

export default router;
