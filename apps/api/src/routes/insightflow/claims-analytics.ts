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

function dateFilter(req: Request, alias = 'rr'): { filter: string; bind: (r: sql.Request) => void } {
  const start = String(req.query['startDate'] || '');
  const end   = String(req.query['endDate']   || '');
  if (!start || !end) return { filter: '', bind: () => {} };
  return {
    filter: `AND ${alias}.DateOfService BETWEEN @_dsStart AND @_dsEnd`,
    bind: (r: sql.Request) => {
      r.input('_dsStart', sql.Date, new Date(start));
      r.input('_dsEnd',   sql.Date, new Date(end));
    },
  };
}

/**
 * GET /insightflow/claims-analytics?startDate=&endDate=
 * Advanced dental claims analytics.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tf = tenantFilter(req);
    const df = dateFilter(req);
    const r = pool.request();
    tf.bind(r);
    df.bind(r);

    const result = await r.query(`
      -- 1. Summary metrics
      SELECT
        COUNT(DISTINCT rr.ClaimID)                                   AS totalClaims,
        SUM(CASE WHEN rr.TrxType = 'Charge'   THEN rr.TrxAmt ELSE 0 END) AS totalBilled,
        SUM(CASE WHEN rr.TrxType = 'Payment'  THEN ABS(rr.TrxAmt) ELSE 0 END) AS totalPaid,
        CASE WHEN COUNT(DISTINCT rr.ClaimID) > 0
          THEN SUM(CASE WHEN rr.TrxType='Charge' THEN rr.TrxAmt ELSE 0 END)
               / COUNT(DISTINCT rr.ClaimID)
          ELSE 0 END                                                  AS avgPerClaim
      FROM dbo.recon_report rr
      WHERE rr.TrxAmt IS NOT NULL
        ${tf.filter}
        ${df.filter};

      -- 2. Top 20 procedure codes by revenue
      --
      -- The column is CPT. rr.ProcedureCode does not exist on recon_report and
      -- never has - no migration creates it - so this query returned
      -- "Invalid column name 'ProcedureCode'" and the endpoint answered 500 on
      -- every call. Thirteen other queries in this directory already used CPT;
      -- these three files were the outliers.
      SELECT TOP 20
        ISNULL(rr.CPT, 'Unknown')                          AS procedureCode,
        ISNULL(rr.ProcedureDescription, '')                          AS procedureDescription,
        COUNT(DISTINCT rr.ClaimID)                                   AS claimCount,
        AVG(CASE WHEN rr.TrxType='Charge' THEN rr.TrxAmt END)       AS avgFee,
        SUM(CASE WHEN rr.TrxType='Charge' THEN rr.TrxAmt ELSE 0 END) AS totalRevenue
      FROM dbo.recon_report rr
      WHERE rr.TrxAmt IS NOT NULL
        ${tf.filter}
        ${df.filter}
      GROUP BY rr.CPT, rr.ProcedureDescription
      ORDER BY totalRevenue DESC;

      -- 3. Revenue by payer mix (for pie chart)
      SELECT TOP 10
        ISNULL(rr.InsuranceName, 'Self-Pay')                         AS payer,
        SUM(CASE WHEN rr.TrxType='Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS totalPaid,
        COUNT(DISTINCT rr.ClaimID)                                   AS claimCount
      FROM dbo.recon_report rr
      WHERE rr.TrxAmt IS NOT NULL
        ${tf.filter}
        ${df.filter}
      GROUP BY rr.InsuranceName
      ORDER BY totalPaid DESC;

      -- 4. Monthly submitted vs paid trend (last 12 months)
      SELECT TOP 12
        FORMAT(rr.DateOfService, 'yyyy-MM')                          AS month,
        SUM(CASE WHEN rr.TrxType='Charge'  THEN rr.TrxAmt ELSE 0 END) AS totalBilled,
        SUM(CASE WHEN rr.TrxType='Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS totalPaid
      FROM dbo.recon_report rr
      WHERE rr.TrxAmt IS NOT NULL
        AND rr.DateOfService >= DATEADD(MONTH, -12, GETDATE())
        ${tf.filter}
      GROUP BY FORMAT(rr.DateOfService, 'yyyy-MM')
      ORDER BY month ASC;
    `);

    const rs = result.recordsets as any[][];
    const s = rs[0]?.[0] ?? {};
    res.json({
      summary: {
        totalClaims:  s.totalClaims  ?? 0,
        totalBilled:  s.totalBilled  ?? 0,
        totalPaid:    s.totalPaid    ?? 0,
        avgPerClaim:  parseFloat((s.avgPerClaim ?? 0).toFixed(2)),
      },
      topProcedures: rs[1] ?? [],
      payerMix:      rs[2] ?? [],
      monthlyTrend:  rs[3] ?? [],
    });
  } catch (e: any) {
    console.error('claims-analytics error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
