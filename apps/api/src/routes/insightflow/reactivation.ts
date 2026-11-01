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
 * GET /insightflow/reactivation
 * Patient reactivation engine - identifies lapsed and at-risk patients.
 * Lapsed = no claim in 12+ months. At-risk = no claim in 6-12 months.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tf = tenantFilter(req);
    const r = pool.request();
    tf.bind(r);

    const minDays = parseInt(String(req.query['minDays'] || '365'), 10);
    const maxDays = parseInt(String(req.query['maxDays'] || '99999'), 10);
    const page    = Math.max(1, parseInt(String(req.query['page'] || '1'), 10));
    const limit   = Math.min(100, Math.max(10, parseInt(String(req.query['limit'] || '50'), 10)));
    const offset  = (page - 1) * limit;

    r.input('_minDays', sql.Int, minDays);
    r.input('_maxDays', sql.Int, maxDays);
    r.input('_offset',  sql.Int, offset);
    r.input('_limit',   sql.Int, limit);

    const result = await r.query(`
      -- Patient last visit derived from recon_report
      WITH PatientLastVisit AS (
        SELECT
          rr.PatientFirstName + ' ' + rr.PatientLastName            AS patientName,
          ISNULL(rr.InsuranceName, 'Self-Pay')                       AS insurance,
          MAX(rr.DateOfService)                                       AS lastVisit,
          MIN(rr.DateOfService)                                       AS firstVisit,
          COUNT(DISTINCT rr.ClaimID)                                  AS totalClaims,
          SUM(CASE WHEN rr.TrxType='Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS totalCollected
        FROM dbo.recon_report rr
        WHERE rr.PatientFirstName IS NOT NULL AND rr.PatientLastName IS NOT NULL
          AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.PatientFirstName + ' ' + rr.PatientLastName, rr.InsuranceName
      ),
      PatientStatus AS (
        SELECT
          patientName,
          insurance,
          lastVisit,
          firstVisit,
          totalClaims,
          totalCollected,
          DATEDIFF(DAY, lastVisit, GETDATE())                        AS daysSinceVisit
        FROM PatientLastVisit
      )

      -- 1. Summary counts
      SELECT
        COUNT(CASE WHEN daysSinceVisit >= 365                     THEN 1 END)   AS lapsedCount,
        COUNT(CASE WHEN daysSinceVisit BETWEEN 180 AND 364         THEN 1 END)   AS atRiskCount,
        COUNT(CASE WHEN daysSinceVisit < 180                       THEN 1 END)   AS activeCount,
        COUNT(*)                                                                  AS totalPatients,
        -- Reactivated: patients who were lapsed (>365 days gap) but had a recent visit
        COUNT(CASE WHEN daysSinceVisit < 90
                        AND totalClaims > 1
                        AND DATEDIFF(DAY, firstVisit, lastVisit) > 365 THEN 1 END) AS reactivatedLast90
      FROM PatientStatus;

      -- 2. Lapsed patient list filtered by day range (paginated)
      WITH PatientLastVisit AS (
        SELECT
          rr.PatientFirstName + ' ' + rr.PatientLastName            AS patientName,
          ISNULL(rr.InsuranceName, 'Self-Pay')                       AS insurance,
          MAX(rr.DateOfService)                                       AS lastVisit,
          COUNT(DISTINCT rr.ClaimID)                                  AS totalClaims,
          SUM(CASE WHEN rr.TrxType='Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS totalCollected
        FROM dbo.recon_report rr
        WHERE rr.PatientFirstName IS NOT NULL AND rr.PatientLastName IS NOT NULL
          AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.PatientFirstName + ' ' + rr.PatientLastName, rr.InsuranceName
      ),
      Filtered AS (
        SELECT
          patientName,
          insurance,
          lastVisit,
          totalClaims,
          totalCollected,
          DATEDIFF(DAY, lastVisit, GETDATE())                        AS daysSinceVisit,
          COUNT(*) OVER ()                                            AS totalCount
        FROM PatientLastVisit
        WHERE DATEDIFF(DAY, lastVisit, GETDATE()) BETWEEN @_minDays AND @_maxDays
      )
      SELECT *
      FROM Filtered
      ORDER BY daysSinceVisit DESC
      OFFSET @_offset ROWS FETCH NEXT @_limit ROWS ONLY;
    `);

    const rs = result.recordsets as any[][];
    const s = rs[0]?.[0] ?? {};
    const rows = rs[1] ?? [];
    const totalCount = rows[0]?.totalCount ?? 0;

    res.json({
      summary: {
        lapsedCount:        s.lapsedCount ?? 0,
        atRiskCount:        s.atRiskCount ?? 0,
        activeCount:        s.activeCount ?? 0,
        totalPatients:      s.totalPatients ?? 0,
        reactivatedLast90:  s.reactivatedLast90 ?? 0,
      },
      patients: rows.map(({ totalCount: _tc, ...rest }: any) => rest),
      total: totalCount,
      page,
      limit,
    });
  } catch (e: any) {
    console.error('reactivation error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
