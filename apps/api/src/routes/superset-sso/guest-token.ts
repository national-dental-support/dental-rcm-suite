import { Router, Request, Response } from 'express';
import axios from 'axios';
import logger from '../../utils/logger';

const router = Router();

// IPv4 literal, not "localhost": that resolves to ::1 first on Windows.
const SUPERSET_URL = process.env.SUPERSET_URL || 'http://127.0.0.1:8099';

// No defaults. These used to fall back to admin/admin, which is a real
// credential on a stock Superset install - so an unconfigured deployment would
// have tried to log into whatever answered on SUPERSET_URL with the password
// everyone already knows. Unset means this route is off, not that it guesses.
const SUPERSET_ADMIN_USER = process.env.SUPERSET_ADMIN_USER ?? '';
const SUPERSET_ADMIN_PASS = process.env.SUPERSET_ADMIN_PASS ?? '';

function supersetConfigured(): boolean {
  return Boolean(SUPERSET_ADMIN_USER && SUPERSET_ADMIN_PASS);
}

/**
 * GET /superToken/token/:dashboardId
 *
 * Fetches a Superset guest token for the given embedded dashboard.
 * The frontend Superset SDK calls this to authenticate the iframe.
 *
 * Flow:
 *  1. Login to Superset as admin -> get access_token + csrf_token
 *  2. Call POST /api/v1/security/guest_token with the dashboard UUID
 *  3. Return { token } to the frontend
 */
router.get('/token/:dashboardId', async (req: Request, res: Response) => {
  const { dashboardId } = req.params;

  if (!dashboardId) {
    return res.status(400).json({ error: 'dashboardId is required' });
  }

  if (!supersetConfigured()) {
    logger.warn('Superset embedding requested but SUPERSET_ADMIN_USER/PASS are not set', {
      alert: 'SUPERSET_NOT_CONFIGURED',
    });
    return res.status(503).json({ error: 'Superset embedding is not configured' });
  }

  try {
    // 1. Login to get access token
    const loginRes = await axios.post(`${SUPERSET_URL}/api/v1/security/login`, {
      username: SUPERSET_ADMIN_USER,
      password: SUPERSET_ADMIN_PASS,
      provider: 'db',
      refresh: true,
    }, { timeout: 10_000 });

    const accessToken = loginRes.data?.access_token;
    if (!accessToken) {
      logger.error('Superset login failed: no access_token returned');
      return res.status(502).json({ error: 'Superset authentication failed' });
    }

    // 2. Get CSRF token
    const csrfRes = await axios.get(`${SUPERSET_URL}/api/v1/security/csrf_token/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10_000,
    });
    const csrfToken = csrfRes.data?.result;

    // 3. Request guest token for the embedded dashboard
    const guestRes = await axios.post(
      `${SUPERSET_URL}/api/v1/security/guest_token/`,
      {
        resources: [{ type: 'dashboard', id: dashboardId }],
        rls: [],
        user: {
          username: 'guest',
          first_name: 'Guest',
          last_name: 'User',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        },
        timeout: 10_000,
      }
    );

    const token = guestRes.data?.token;
    if (!token) {
      logger.error('Superset guest_token response missing token');
      return res.status(502).json({ error: 'Failed to get guest token from Superset' });
    }

    res.json({ token });
  } catch (err: any) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.message || err?.message || 'Unknown error';
    logger.error(`Superset guest token error (status=${status}): ${msg}`);
    res.status(502).json({ error: 'Unable to connect to the reporting server' });
  }
});

export default router;
