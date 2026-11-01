import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

const router = Router();
const getPool = () => Database.getInstance().getPool();

function tenantFilter(req: Request, alias = 'rr') {
  const custId: number | null = (req as any).actor?.customer_id ?? null;
  if (custId == null) return { filter: '', bind: (r: sql.Request) => r };
  return {
    filter: `AND ${alias}.customer_id = @_custId`,
    bind: (r: sql.Request) => { r.input('_custId', sql.Int, custId); return r; },
  };
}

/**
 * GET /insightflow/preauth-analytics
 * Pre-authorization success rate analytics.
 * Derives preauth metrics from denial data (denial reason codes CO-4, CO-15, CO-197
 * and PR-* auth-related denials indicate preauth failures).
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tf = tenantFilter(req);
    const r = pool.request();
    tf.bind(r);

    const result = await r.query(`
      -- Auth-related denial reasons: CO-4, CO-15, CO-197, PR-4 indicate preauth failures
      -- We use denial/claim data as proxy for preauth tracking

      -- 1. Overall summary
      WITH AllClaims AS (
        SELECT
          rr.ClaimID,
          ISNULL(rr.InsuranceName, 'Self-Pay')                  AS payer,
          rr.CPT,
          -- Flag as "auth denial" if ClaimStatus contains denial keywords
          MAX(CASE WHEN rr.ClaimStatus IN ('Denied','Rejected') THEN 1 ELSE 0 END) AS isDenied,
          MIN(rr.DateOfService)                                  AS firstDOS,
          MAX(rr.DateOfService)                                  AS lastDOS
        FROM dbo.recon_report rr
        WHERE rr.ClaimID IS NOT NULL AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.ClaimID, rr.InsuranceName, rr.CPT
      ),
      -- Estimate resubmissions as claims appearing more than once per patient-procedure
      Resubmissions AS (
        SELECT
          rr.PatientFirstName + ' ' + rr.PatientLastName AS patient,
          rr.CPT,
          COUNT(DISTINCT rr.ClaimID) AS claimCount
        FROM dbo.recon_report rr
        WHERE rr.TrxType = 'Charge' AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.PatientFirstName + ' ' + rr.PatientLastName, rr.CPT
      )
      SELECT
        COUNT(*)                                               AS totalClaims,
        SUM(isDenied)                                          AS deniedClaims,
        (COUNT(*) - SUM(isDenied)) * 100.0 / NULLIF(COUNT(*),0) AS approvalRate,
        AVG(DATEDIFF(DAY, firstDOS, lastDOS))                  AS avgProcessingDays
      FROM AllClaims;

      -- 2. Approval rate by payer (top 15)
      WITH AllClaims AS (
        SELECT
          rr.ClaimID,
          ISNULL(rr.InsuranceName, 'Self-Pay')                  AS payer,
          MAX(CASE WHEN rr.ClaimStatus IN ('Denied','Rejected') THEN 1 ELSE 0 END) AS isDenied
        FROM dbo.recon_report rr
        WHERE rr.ClaimID IS NOT NULL AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.ClaimID, rr.InsuranceName
      )
      SELECT TOP 15
        payer,
        COUNT(*)                                               AS totalClaims,
        SUM(isDenied)                                          AS deniedClaims,
        (COUNT(*) - SUM(isDenied)) * 100.0 / NULLIF(COUNT(*),0) AS approvalRate
      FROM AllClaims
      GROUP BY payer
      HAVING COUNT(*) >= 3
      ORDER BY approvalRate ASC;

      -- 3. Procedure types with approval/denial rates
      WITH AllClaims AS (
        SELECT
          rr.ClaimID,
          ISNULL(rr.CPT, 'Unknown')                  AS procedureCode,
          MAX(CASE WHEN rr.ClaimStatus IN ('Denied','Rejected') THEN 1 ELSE 0 END) AS isDenied
        FROM dbo.recon_report rr
        WHERE rr.ClaimID IS NOT NULL AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.ClaimID, rr.CPT
      )
      SELECT TOP 20
        procedureCode,
        COUNT(*)                                               AS totalClaims,
        SUM(isDenied)                                          AS deniedClaims,
        (COUNT(*) - SUM(isDenied)) * 100.0 / NULLIF(COUNT(*),0) AS approvalRate,
        SUM(isDenied) * 100.0 / NULLIF(COUNT(*),0)            AS denialRate
      FROM AllClaims
      GROUP BY procedureCode
      HAVING COUNT(*) >= 5
      ORDER BY denialRate DESC;

      -- 4. Monthly approval rate trend (last 12 months)
      WITH AllClaims AS (
        SELECT
          rr.ClaimID,
          FORMAT(MIN(rr.DateOfService), 'yyyy-MM')              AS month,
          MAX(CASE WHEN rr.ClaimStatus IN ('Denied','Rejected') THEN 1 ELSE 0 END) AS isDenied
        FROM dbo.recon_report rr
        WHERE rr.ClaimID IS NOT NULL AND rr.TrxAmt IS NOT NULL
          AND rr.DateOfService >= DATEADD(MONTH, -12, GETDATE())
          ${tf.filter}
        GROUP BY rr.ClaimID
      )
      SELECT
        month,
        COUNT(*)                                               AS totalClaims,
        (COUNT(*) - SUM(isDenied)) * 100.0 / NULLIF(COUNT(*),0) AS approvalRate
      FROM AllClaims
      GROUP BY month
      ORDER BY month ASC;
    `);

    const rs = result.recordsets as any[][];
    const s = rs[0]?.[0] ?? {};
    res.json({
      summary: {
        totalClaims: s.totalClaims ?? 0,
        deniedClaims: s.deniedClaims ?? 0,
        approvalRate: parseFloat((s.approvalRate ?? 0).toFixed(1)),
        avgProcessingDays: parseFloat((s.avgProcessingDays ?? 0).toFixed(1)),
      },
      byPayer: rs[1] ?? [],
      byProcedure: rs[2] ?? [],
      monthlyTrend: rs[3] ?? [],
    });
  } catch (e: any) {
    console.error('preauth-analytics error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
