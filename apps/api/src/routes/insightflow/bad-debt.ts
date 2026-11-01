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
 * GET /insightflow/bad-debt
 * Bad debt / write-off analysis
 * Returns: summary, byPayer (top 10), byAgeBucket, monthlyTrend (12 months)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tf = tenantFilter(req);
    const r = pool.request();
    tf.bind(r);

    const result = await r.query(`
      -- Write-offs use TrxType = 'Writeoff' (positive amounts).
      -- Contractual adjustments (Adjustment TrxType) are a separate concept.

      -- 1. Summary: total write-offs YTD, pct of revenue, avg per claim
      SELECT
        ISNULL(SUM(CASE WHEN rr.TrxType = 'Writeoff'
                             AND YEAR(rr.DateOfService) = YEAR(GETDATE())
                        THEN rr.TrxAmt ELSE 0 END), 0)              AS totalWriteOffsYTD,
        ISNULL(SUM(CASE WHEN rr.TrxType = 'Charge'
                             AND YEAR(rr.DateOfService) = YEAR(GETDATE())
                        THEN rr.TrxAmt ELSE 0 END), 1)              AS totalRevenueYTD,
        COUNT(DISTINCT CASE WHEN rr.TrxType = 'Writeoff'
                                 AND YEAR(rr.DateOfService) = YEAR(GETDATE())
                            THEN rr.ClaimID END)                    AS claimsWithWriteOff
      FROM dbo.recon_report rr
      WHERE rr.TrxAmt IS NOT NULL
        ${tf.filter};

      -- 2. Top 10 payers by write-off amount
      SELECT TOP 10
        ISNULL(rr.InsuranceName, 'Self-Pay')      AS payer,
        SUM(rr.TrxAmt)                            AS writeOffAmount,
        COUNT(DISTINCT rr.ClaimID)                AS claimCount
      FROM dbo.recon_report rr
      WHERE rr.TrxType = 'Writeoff'
        ${tf.filter}
      GROUP BY rr.InsuranceName
      ORDER BY writeOffAmount DESC;

      -- 3. Age bucket breakdown (days from DateOfService to today)
      SELECT
        CASE
          WHEN DATEDIFF(DAY, rr.DateOfService, GETDATE()) BETWEEN 0  AND 30  THEN '0-30'
          WHEN DATEDIFF(DAY, rr.DateOfService, GETDATE()) BETWEEN 31 AND 60  THEN '31-60'
          WHEN DATEDIFF(DAY, rr.DateOfService, GETDATE()) BETWEEN 61 AND 90  THEN '61-90'
          ELSE '90+'
        END                                       AS ageBucket,
        SUM(rr.TrxAmt)                            AS writeOffAmount,
        COUNT(DISTINCT rr.ClaimID)                AS claimCount
      FROM dbo.recon_report rr
      WHERE rr.TrxType = 'Writeoff'
        ${tf.filter}
      GROUP BY
        CASE
          WHEN DATEDIFF(DAY, rr.DateOfService, GETDATE()) BETWEEN 0  AND 30  THEN '0-30'
          WHEN DATEDIFF(DAY, rr.DateOfService, GETDATE()) BETWEEN 31 AND 60  THEN '31-60'
          WHEN DATEDIFF(DAY, rr.DateOfService, GETDATE()) BETWEEN 61 AND 90  THEN '61-90'
          ELSE '90+'
        END;

      -- 4. Monthly trend: last 12 months
      SELECT TOP 12
        FORMAT(rr.DateOfService, 'yyyy-MM') AS month,
        SUM(rr.TrxAmt)                      AS writeOffAmount,
        COUNT(DISTINCT rr.ClaimID)          AS claimCount
      FROM dbo.recon_report rr
      WHERE rr.TrxType = 'Writeoff'
        AND rr.DateOfService >= DATEADD(MONTH, -12, GETDATE())
        ${tf.filter}
      GROUP BY FORMAT(rr.DateOfService, 'yyyy-MM')
      ORDER BY month ASC;
    `);

    const rs = result.recordsets as any[][];
    const summary = rs[0]?.[0] ?? {};
    const totalWriteOffsYTD = summary.totalWriteOffsYTD ?? 0;
    const totalRevenueYTD = summary.totalRevenueYTD ?? 1;
    const pctOfRevenue = totalRevenueYTD > 0 ? (totalWriteOffsYTD / totalRevenueYTD) * 100 : 0;
    const claimsWithWriteOff = summary.claimsWithWriteOff ?? 1;
    const avgPerClaim = claimsWithWriteOff > 0 ? totalWriteOffsYTD / claimsWithWriteOff : 0;

    res.json({
      summary: {
        totalWriteOffsYTD,
        pctOfRevenue: parseFloat(pctOfRevenue.toFixed(2)),
        avgPerClaim: parseFloat(avgPerClaim.toFixed(2)),
        claimsWithWriteOff,
      },
      byPayer: rs[1] ?? [],
      byAgeBucket: rs[2] ?? [],
      monthlyTrend: rs[3] ?? [],
    });
  } catch (e: any) {
    console.error('bad-debt error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
