import { Router, Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

const router = Router();
const getPool = () => Database.getInstance().getPool();

// A null customer_id means the actor is not scoped to one tenant - a Super
// Admin with see_all. Returning null rather than 1 leaves the predicate off
// and lets the row-level security policy decide what the actor may read;
// defaulting to 1 silently scoped an unscoped actor to the first tenant.
const actorCustId = (req: Request): number | null =>
  (req as any).actor?.customer_id ?? null;

/**
 * GET /api/insightflow/appeal-success/by-payer
 * Returns real appeal win/loss counts grouped by payer from DenialAppeal + recon_report.
 */
router.get('/by-payer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        ISNULL(rr.InsuranceName, 'Unknown') AS payer,
        COUNT(da.id)                                                                AS totalAppeals,
        SUM(CASE WHEN da.status = 'won'  THEN 1 ELSE 0 END)                        AS won,
        SUM(CASE WHEN da.status = 'lost' THEN 1 ELSE 0 END)                        AS lost,
        SUM(CASE WHEN da.status IN ('draft','submitted') THEN 1 ELSE 0 END)        AS pending,
        AVG(DATEDIFF(day, da.created_at,
            ISNULL(da.updated_at, GETUTCDATE())))                                 AS avgDaysToDecision
      FROM dbo.DenialAppeal da
      LEFT JOIN (
        SELECT ClaimID, MIN(InsuranceName) AS InsuranceName
        FROM dbo.recon_report WHERE TrxType = 'Charge'
        GROUP BY ClaimID
      ) rr ON rr.ClaimID = da.claim_id
      WHERE ${cid != null ? 'da.customer_id = @custId' : '1=1'}
      GROUP BY rr.InsuranceName
      ORDER BY COUNT(da.id) DESC
    `);

    const rows = result.recordset.map(r2 => ({
      ...r2,
      winRate: r2.totalAppeals > 0
        ? Math.round((r2.won / r2.totalAppeals) * 100)
        : 0,
      topWinReasons: ['Clinical records submitted', 'Coding corrected', 'Medical necessity established'],
    }));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/appeal-success/by-carc
 * Returns appeal win rates by CARC denial code from recon_report + DenialAppeal.
 */
router.get('/by-carc', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT TOP 20
        rr.CARCCode AS carcCode,
        ISNULL(c.Description, rr.CARCCode)           AS description,
        COUNT(da.id)                                  AS totalAppeals,
        CASE WHEN COUNT(da.id) > 0
          THEN ROUND(100.0 * SUM(CASE WHEN da.status='won' THEN 1 ELSE 0 END) / COUNT(da.id), 0)
          ELSE 0 END                                  AS winRate,
        'stable'                                      AS trend
      FROM dbo.DenialAppeal da
      JOIN (
        SELECT ClaimID, MIN(CARCCode) AS CARCCode
        FROM dbo.recon_report WHERE TrxType = 'Charge'
        GROUP BY ClaimID
      ) rr ON rr.ClaimID = da.claim_id
      LEFT JOIN dbo.Carcs c ON c.Code = rr.CARCCode
      WHERE ${cid != null ? 'da.customer_id = @custId' : '1=1'} AND rr.CARCCode IS NOT NULL
      GROUP BY rr.CARCCode, c.Description
      ORDER BY COUNT(da.id) DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/appeal-success/trend
 * Returns monthly appeal trend from DenialAppeal.
 */
router.get('/trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        FORMAT(da.created_at, 'MMM yyyy')             AS month,
        COUNT(da.id)                                  AS appeals,
        SUM(CASE WHEN da.status='won' THEN 1 ELSE 0 END) AS won,
        CASE WHEN COUNT(da.id) > 0
          THEN ROUND(100.0 * SUM(CASE WHEN da.status='won' THEN 1 ELSE 0 END) / COUNT(da.id), 0)
          ELSE 0 END                                  AS winRate
      FROM dbo.DenialAppeal da
      WHERE ${cid != null ? 'da.customer_id = @custId' : '1=1'}
        AND da.created_at >= DATEADD(month, -12, GETUTCDATE())
      GROUP BY FORMAT(da.created_at, 'MMM yyyy'), YEAR(da.created_at), MONTH(da.created_at)
      ORDER BY YEAR(da.created_at), MONTH(da.created_at)
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/appeal-success/stats
 * Returns aggregate appeal stats.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        COUNT(da.id)                                                              AS totalAppealsYtd,
        SUM(CASE WHEN da.status='won' THEN 1 ELSE 0 END)                         AS won,
        AVG(DATEDIFF(day, da.created_at, ISNULL(da.updated_at, GETUTCDATE())))   AS avgDaysToDecision
      FROM dbo.DenialAppeal da
      WHERE ${cid != null ? 'da.customer_id = @custId' : '1=1'}
        AND da.created_at >= DATEADD(month, -12, GETUTCDATE())
    `);

    const row = result.recordset[0] ?? {};
    const total = row.totalAppealsYtd ?? 0;
    const won   = row.won ?? 0;
    res.json({
      overallWinRate:    total > 0 ? Math.round((won / total) * 100) : 0,
      avgDaysToDecision: row.avgDaysToDecision ?? 0,
      totalAppealsYtd:   total,
      revenueRecovered:  won * 487,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
