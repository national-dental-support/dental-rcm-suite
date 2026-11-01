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
 * GET /insightflow/cycle-time
 * Claim submission-to-payment cycle time analysis.
 * Uses recon_report: earliest Charge date = submission, earliest Payment date = receipt.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tf = tenantFilter(req);
    const r = pool.request();
    tf.bind(r);

    const result = await r.query(`
      -- 1. Overall summary + distribution
      WITH ClaimCycles AS (
        SELECT
          rr.ClaimID,
          ISNULL(rr.InsuranceName, 'Self-Pay')                        AS payer,
          MIN(CASE WHEN rr.TrxType = 'Charge'   THEN rr.DateOfService END) AS submittedDate,
          MIN(CASE WHEN rr.TrxType = 'Payment'  THEN COALESCE(rr.PaymentPostDate, rr.DateOfService) END) AS paidDate
        FROM dbo.recon_report rr
        WHERE rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.ClaimID, rr.InsuranceName
      ),
      WithDays AS (
        SELECT
          ClaimID,
          payer,
          submittedDate,
          paidDate,
          DATEDIFF(DAY, submittedDate, paidDate) AS cycleDays
        FROM ClaimCycles
        WHERE submittedDate IS NOT NULL AND paidDate IS NOT NULL
          AND paidDate >= submittedDate
      )
      SELECT
        AVG(cycleDays * 1.0)                                          AS avgCycleDays,
        COUNT(*)                                                       AS totalClaims,
        SUM(CASE WHEN cycleDays <=  30 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS pctWithin30,
        SUM(CASE WHEN cycleDays <=  60 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS pctWithin60,
        SUM(CASE WHEN cycleDays <=  90 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS pctWithin90,
        SUM(CASE WHEN cycleDays <= 120 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS pctWithin120
      FROM WithDays;

      -- 2. Monthly trend: avg cycle time last 12 months
      WITH ClaimCycles AS (
        SELECT
          rr.ClaimID,
          MIN(CASE WHEN rr.TrxType = 'Charge'  THEN rr.DateOfService END) AS submittedDate,
          MIN(CASE WHEN rr.TrxType = 'Payment' THEN COALESCE(rr.PaymentPostDate, rr.DateOfService) END) AS paidDate
        FROM dbo.recon_report rr
        WHERE rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.ClaimID
      ),
      WithDays AS (
        SELECT
          ClaimID,
          submittedDate,
          paidDate,
          DATEDIFF(DAY, submittedDate, paidDate) AS cycleDays
        FROM ClaimCycles
        WHERE submittedDate IS NOT NULL AND paidDate IS NOT NULL
          AND paidDate >= submittedDate
          AND submittedDate >= DATEADD(MONTH, -12, GETDATE())
      )
      SELECT
        FORMAT(submittedDate, 'yyyy-MM')      AS month,
        AVG(cycleDays * 1.0)                  AS avgCycleDays,
        COUNT(*)                              AS claimCount
      FROM WithDays
      GROUP BY FORMAT(submittedDate, 'yyyy-MM')
      ORDER BY month ASC;

      -- 3. Top 10 slowest payers
      WITH ClaimCycles AS (
        SELECT
          rr.ClaimID,
          ISNULL(rr.InsuranceName, 'Self-Pay')                        AS payer,
          MIN(CASE WHEN rr.TrxType = 'Charge'  THEN rr.DateOfService END) AS submittedDate,
          MIN(CASE WHEN rr.TrxType = 'Payment' THEN COALESCE(rr.PaymentPostDate, rr.DateOfService) END) AS paidDate
        FROM dbo.recon_report rr
        WHERE rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.ClaimID, rr.InsuranceName
      ),
      WithDays AS (
        SELECT
          ClaimID,
          payer,
          DATEDIFF(DAY, submittedDate, paidDate) AS cycleDays
        FROM ClaimCycles
        WHERE submittedDate IS NOT NULL AND paidDate IS NOT NULL
          AND paidDate >= submittedDate
      )
      SELECT TOP 10
        payer,
        AVG(cycleDays * 1.0)                  AS avgDays,
        COUNT(*)                              AS claimCount,
        SUM(CASE WHEN cycleDays <= 30 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS pctOnTime
      FROM WithDays
      GROUP BY payer
      HAVING COUNT(*) >= 5
      ORDER BY avgDays DESC;
    `);

    const rs = result.recordsets as any[][];
    const s = rs[0]?.[0] ?? {};
    res.json({
      summary: {
        avgCycleDays: parseFloat((s.avgCycleDays ?? 0).toFixed(1)),
        totalClaims: s.totalClaims ?? 0,
        pctWithin30:  parseFloat((s.pctWithin30  ?? 0).toFixed(1)),
        pctWithin60:  parseFloat((s.pctWithin60  ?? 0).toFixed(1)),
        pctWithin90:  parseFloat((s.pctWithin90  ?? 0).toFixed(1)),
        pctWithin120: parseFloat((s.pctWithin120 ?? 0).toFixed(1)),
      },
      monthlyTrend: rs[1] ?? [],
      slowestPayers: rs[2] ?? [],
    });
  } catch (e: any) {
    console.error('cycle-time error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
