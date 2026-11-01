import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();

/**
 * POST /api/analytics/sessions/heartbeat
 * Upserts a session row and updates last_heartbeat.
 * Called every 60 seconds by the frontend.
 */
router.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const { sessionId, customerId } = req.body;
    // Use authenticated identity from header - do NOT trust client-provided email
    const email = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase().trim();
    if (!sessionId || !email) {
      return res.status(400).json({ message: 'sessionId required; x-actor-email header required' });
    }

    await pool.request()
      .input('sessionId', sql.NVarChar, sessionId)
      .input('email', sql.NVarChar, email.toLowerCase())
      .input('customerId', sql.Int, customerId || null)
      .query(`
        MERGE dbo.UserSessions AS target
        USING (SELECT @sessionId AS session_id) AS source
        ON target.session_id = source.session_id
        WHEN MATCHED THEN
          UPDATE SET last_heartbeat = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (session_id, user_email, customer_id)
          VALUES (@sessionId, @email, @customerId);
      `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /analytics/sessions/heartbeat error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/sessions/page-enter
 * Logs a page entry with product slug.
 */
router.post('/page-enter', async (req: Request, res: Response) => {
  try {
    const { sessionId, pagePath, productSlug } = req.body;
    // Use authenticated identity from header - do NOT trust client-provided email
    const email = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase().trim();
    if (!sessionId || !email || !pagePath) {
      return res.status(400).json({ message: 'sessionId and pagePath required; x-actor-email header required' });
    }

    const result = await pool.request()
      .input('sessionId', sql.NVarChar, sessionId)
      .input('email', sql.NVarChar, email.toLowerCase())
      .input('pagePath', sql.NVarChar, pagePath)
      .input('productSlug', sql.NVarChar, productSlug || null)
      .query(`
        INSERT INTO dbo.PageVisits (session_id, user_email, page_path, product_slug)
        OUTPUT INSERTED.id
        VALUES (@sessionId, @email, @pagePath, @productSlug);

        UPDATE dbo.UserSessions
        SET page_count = ISNULL(page_count, 0) + 1
        WHERE session_id = @sessionId;
      `);

    return res.json({ pageVisitId: result.recordset[0]?.id });
  } catch (err) {
    console.error('POST /analytics/sessions/page-enter error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/sessions/page-exit
 * Logs a page exit with the page visit ID.
 */
router.post('/page-exit', async (req: Request, res: Response) => {
  try {
    const { pageVisitId } = req.body;
    if (!pageVisitId) {
      return res.status(400).json({ message: 'pageVisitId is required' });
    }

    await pool.request()
      .input('id', sql.Int, pageVisitId)
      .query(`
        UPDATE dbo.PageVisits
        SET exited_at = GETUTCDATE()
        WHERE id = @id
      `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /analytics/sessions/page-exit error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/sessions/end
 * Marks a session as ended.
 */
router.post('/end', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    await pool.request()
      .input('sessionId', sql.NVarChar, sessionId)
      .query(`
        UPDATE dbo.UserSessions
        SET ended_at = GETUTCDATE(), last_heartbeat = GETUTCDATE()
        WHERE session_id = @sessionId AND ended_at IS NULL
      `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /analytics/sessions/end error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/sessions/summary
 * Aggregated usage data for managers.
 */
router.get('/summary', requireRole('Manager'), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const result = await pool.request()
      .input('days', sql.Int, days)
      .query(`
        -- Active users
        SELECT
          COUNT(DISTINCT user_email) AS activeUsers,
          COUNT(*) AS totalSessions,
          AVG(duration_seconds) AS avgSessionDurationSec,
          SUM(page_count) AS totalPageViews
        FROM dbo.UserSessions
        WHERE started_at >= DATEADD(DAY, -@days, GETUTCDATE());

        -- Product adoption (page visits by product)
        SELECT
          ISNULL(product_slug, 'unknown') AS product,
          COUNT(DISTINCT user_email) AS uniqueUsers,
          COUNT(*) AS visits,
          AVG(duration_seconds) AS avgPageDurationSec
        FROM dbo.PageVisits
        WHERE entered_at >= DATEADD(DAY, -@days, GETUTCDATE())
        GROUP BY product_slug
        ORDER BY visits DESC;

        -- Top pages
        SELECT TOP 20
          page_path,
          COUNT(*) AS visits,
          COUNT(DISTINCT user_email) AS uniqueUsers
        FROM dbo.PageVisits
        WHERE entered_at >= DATEADD(DAY, -@days, GETUTCDATE())
        GROUP BY page_path
        ORDER BY visits DESC;

        -- Daily active users trend
        SELECT
          CAST(started_at AS DATE) AS dt,
          COUNT(DISTINCT user_email) AS dau
        FROM dbo.UserSessions
        WHERE started_at >= DATEADD(DAY, -@days, GETUTCDATE())
        GROUP BY CAST(started_at AS DATE)
        ORDER BY dt;

        -- Per-user time on platform
        SELECT TOP 50
          user_email,
          COUNT(*) AS sessions,
          SUM(duration_seconds) AS totalSeconds,
          AVG(duration_seconds) AS avgSessionSec,
          MAX(started_at) AS lastActive
        FROM dbo.UserSessions
        WHERE started_at >= DATEADD(DAY, -@days, GETUTCDATE())
        GROUP BY user_email
        ORDER BY totalSeconds DESC;
      `);

    const sets = result.recordsets as any[];
    return res.json({
      overview: sets[0]?.[0] ?? {},
      productAdoption: sets[1] ?? [],
      topPages: sets[2] ?? [],
      dailyActiveUsers: sets[3] ?? [],
      userEngagement: sets[4] ?? [],
    });
  } catch (err) {
    console.error('GET /analytics/sessions/summary error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
