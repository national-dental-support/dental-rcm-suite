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
 * GET /api/insightflow/cpt-denial/risk-matrix
 * Returns denial rates by procedure code x payer from recon_report.
 */
router.get('/risk-matrix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        ISNULL(rr.CPT, 'Unknown') AS cptCode,
        ISNULL(rr.InsuranceName, 'Unknown')     AS payer,
        COUNT(DISTINCT rr.ClaimID)           AS totalClaims,
        SUM(CAST(rr.IsClaimDenied AS INT))   AS deniedClaims
      FROM dbo.recon_report rr
      WHERE ${cid != null ? 'rr.customer_id = @custId' : '1=1'}
        AND rr.TrxType = 'Charge'
        AND rr.CPT IS NOT NULL
        AND rr.DateOfService >= DATEADD(day, -365, GETDATE())
      GROUP BY rr.CPT, rr.InsuranceName
      HAVING COUNT(DISTINCT rr.ClaimID) >= 2
      ORDER BY SUM(CAST(rr.IsClaimDenied AS INT)) * 1.0 / COUNT(DISTINCT rr.ClaimID) DESC
    `);

    // Pivot into cptCodes[], payers[], matrix format expected by frontend
    const rows = result.recordset;
    const cptSet   = [...new Set(rows.map((r2: any) => r2.cptCode as string))];
    const payerSet = [...new Set(rows.map((r2: any) => r2.payer   as string))];

    const matrix = cptSet.map(cpt => {
      return payerSet.map(payer => {
        const row = rows.find((r2: any) => r2.cptCode === cpt && r2.payer === payer);
        if (!row || row.totalClaims === 0) return 0;
        return Math.round((row.deniedClaims / row.totalClaims) * 100);
      });
    });

    res.json({ cptCodes: cptSet, payers: payerSet, matrix });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/cpt-denial/high-risk
 * Returns high-risk CPT x payer combinations (>= 40% denial rate).
 */
router.get('/high-risk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT TOP 20
        ISNULL(rr.CPT, 'Unknown')  AS cptCode,
        ISNULL(rr.InsuranceName, 'Unknown')      AS payer,
        COUNT(DISTINCT rr.ClaimID)            AS sampleSize,
        ROUND(100.0 * SUM(CAST(rr.IsClaimDenied AS INT)) / COUNT(DISTINCT rr.ClaimID), 0) AS denialRate,
        'stable'                              AS trend,
        'Review clinical documentation before submission' AS mitigation
      FROM dbo.recon_report rr
      WHERE ${cid != null ? 'rr.customer_id = @custId' : '1=1'}
        AND rr.TrxType = 'Charge'
        AND rr.CPT IS NOT NULL
        AND rr.DateOfService >= DATEADD(day, -365, GETDATE())
      GROUP BY rr.CPT, rr.InsuranceName
      HAVING COUNT(DISTINCT rr.ClaimID) >= 3
        AND 100.0 * SUM(CAST(rr.IsClaimDenied AS INT)) / COUNT(DISTINCT rr.ClaimID) >= 40
      ORDER BY SUM(CAST(rr.IsClaimDenied AS INT)) * 1.0 / COUNT(DISTINCT rr.ClaimID) DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/cpt-denial/by-cpt
 * Returns denial stats aggregated by procedure code only.
 */
router.get('/by-cpt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT TOP 30
        ISNULL(rr.CPT, 'Unknown')                                     AS cptCode,
        ROUND(100.0 * SUM(CAST(rr.IsClaimDenied AS INT)) / COUNT(DISTINCT rr.ClaimID), 0) AS avgDenialRate,
        MAX(rr.InsuranceName)                                                        AS worstPayer
      FROM dbo.recon_report rr
      WHERE ${cid != null ? 'rr.customer_id = @custId' : '1=1'}
        AND rr.TrxType = 'Charge'
        AND rr.CPT IS NOT NULL
        AND rr.DateOfService >= DATEADD(day, -365, GETDATE())
      GROUP BY rr.CPT
      HAVING COUNT(DISTINCT rr.ClaimID) >= 2
      ORDER BY avgDenialRate DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/cpt-denial/stats
 * Returns summary stats for CPT denial dashboard.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      WITH combos AS (
        SELECT
          rr.CPT,
          rr.InsuranceName,
          ROUND(100.0 * SUM(CAST(rr.IsClaimDenied AS INT)) / COUNT(DISTINCT rr.ClaimID), 0) AS pct,
          -- 30-day windows for month-over-month improvement tracking
          COUNT(DISTINCT CASE WHEN rr.DateOfService >= DATEADD(day, -30, GETDATE())
                              THEN rr.ClaimID END)                               AS nCur,
          SUM(CASE WHEN rr.DateOfService >= DATEADD(day, -30, GETDATE())
                   THEN CAST(rr.IsClaimDenied AS INT) ELSE 0 END)               AS dCur,
          COUNT(DISTINCT CASE WHEN rr.DateOfService >= DATEADD(day, -60, GETDATE())
                                AND rr.DateOfService <  DATEADD(day, -30, GETDATE())
                              THEN rr.ClaimID END)                               AS nPrev,
          SUM(CASE WHEN rr.DateOfService >= DATEADD(day, -60, GETDATE())
                     AND rr.DateOfService <  DATEADD(day, -30, GETDATE())
                   THEN CAST(rr.IsClaimDenied AS INT) ELSE 0 END)               AS dPrev,
          MAX(ROUND(100.0 * SUM(CAST(rr.IsClaimDenied AS INT)) / COUNT(DISTINCT rr.ClaimID), 0))
            OVER ()                                                              AS maxPct
        FROM dbo.recon_report rr
        WHERE ${cid != null ? 'rr.customer_id = @custId' : '1=1'}
          AND rr.TrxType = 'Charge'
          AND rr.CPT IS NOT NULL
          AND rr.DateOfService >= DATEADD(day, -365, GETDATE())
        GROUP BY rr.CPT, rr.InsuranceName
        HAVING COUNT(DISTINCT rr.ClaimID) >= 3
      )
      SELECT
        SUM(CASE WHEN pct >= 40 THEN 1 ELSE 0 END)                             AS highRiskCombos,
        AVG(pct)                                                                 AS avgDenialRateCovered,
        SUM(CASE WHEN nCur >= 2 AND nPrev >= 2
                  AND 1.0 * dCur / nCur < 1.0 * dPrev / nPrev
                  AND dPrev > 0
                 THEN 1 ELSE 0 END)                                             AS improvedLastMonth,
        MAX(CASE WHEN pct = maxPct THEN CPT ELSE NULL END)                      AS topRiskCpt
      FROM combos
    `);

    const row = result.recordset[0] ?? {};
    res.json({
      highRiskCombos:        row.highRiskCombos        ?? 0,
      avgDenialRateCovered:  Math.round(row.avgDenialRateCovered ?? 0),
      improvedLastMonth:     row.improvedLastMonth      ?? 0,
      topRiskCpt:            row.topRiskCpt             ?? 'N/A',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
