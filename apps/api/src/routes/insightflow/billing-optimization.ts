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
 * GET /api/insightflow/billing-optimization/recommendations
 * Finds underpayment gaps from recon_report: claims where Charge > Payment.
 */
router.get('/recommendations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT TOP 25
        ROW_NUMBER() OVER (ORDER BY gap DESC)    AS id,
        ISNULL(q.PayerName, 'Unknown')           AS payer,
        ISNULL(q.ProcedureCode, 'N/A')           AS procedureCode,
        q.billed,
        q.paid,
        q.gap                                    AS estimatedImpact,
        CASE
          WHEN q.gap > 1000 THEN 'Fee Schedule'
          WHEN q.gap > 400  THEN 'Procedure Coding'
          ELSE 'Modifier Missing'
        END                                      AS category,
        CONCAT(
          'Underpayment on ',
          ISNULL(q.ProcedureCode, 'claim'),
          ': billed $', CAST(CAST(q.billed AS INT) AS VARCHAR),
          ' vs paid $', CAST(CAST(q.paid AS INT) AS VARCHAR)
        )                                        AS description,
        CASE WHEN q.gap > 1000 THEN 'high' WHEN q.gap > 400 THEN 'medium' ELSE 'low' END AS priority,
        'new'                                    AS status
      FROM (
        SELECT
          rr.ClaimID,
          -- rr.InsuranceName: recon_report has no PayerName column and never
          -- has, so this endpoint returned 500 on every call. Same defect as
          -- the ProcedureCode/CPT one; executive-summary.ts already selects
          -- "InsuranceName AS PayerName" correctly.
          MAX(CASE WHEN rr.TrxType = 'Charge'  THEN rr.InsuranceName END)             AS PayerName,
          -- rr.CPT: recon_report has no ProcedureCode column and never has.
          MAX(CASE WHEN rr.TrxType = 'Charge'  THEN rr.CPT END)                       AS ProcedureCode,
          SUM(CASE WHEN rr.TrxType = 'Charge'  THEN rr.TrxAmt  ELSE 0 END)           AS billed,
          SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END)       AS paid,
          SUM(CASE WHEN rr.TrxType = 'Charge'  THEN rr.TrxAmt  ELSE 0 END)
            - SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END)   AS gap
        FROM dbo.recon_report rr
        WHERE ${cid != null ? 'rr.customer_id = @custId' : '1=1'}
          AND rr.IsClaimDenied = 0
          AND rr.TrxAmt IS NOT NULL
        GROUP BY rr.ClaimID
        HAVING
          SUM(CASE WHEN rr.TrxType = 'Charge'  THEN rr.TrxAmt  ELSE 0 END) > 0
          AND (
            SUM(CASE WHEN rr.TrxType = 'Charge'  THEN rr.TrxAmt  ELSE 0 END)
            - SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END)
          ) > 50
      ) q
      ORDER BY q.gap DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/billing-optimization/stats
 * Aggregate underpayment stats.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        COUNT(*)                                       AS totalOpportunities,
        SUM(gap)                                       AS estimatedRevenue,
        0                                              AS appliedThisMonth
      FROM (
        SELECT
          SUM(CASE WHEN rr.TrxType = 'Charge'  THEN rr.TrxAmt  ELSE 0 END)
            - SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS gap
        FROM dbo.recon_report rr
        WHERE rr.IsClaimDenied = 0
          AND ${cid != null ? 'rr.customer_id = @custId' : '1=1'}
        GROUP BY rr.ClaimID
        HAVING SUM(CASE WHEN rr.TrxType='Charge' THEN rr.TrxAmt ELSE 0 END) > 0
          AND (SUM(CASE WHEN rr.TrxType='Charge' THEN rr.TrxAmt ELSE 0 END)
               - SUM(CASE WHEN rr.TrxType='Payment' THEN ABS(rr.TrxAmt) ELSE 0 END)) > 50
      ) sub
    `);

    const row = result.recordset[0] ?? {};
    const total = row.totalOpportunities ?? 0;
    const rev   = row.estimatedRevenue   ?? 0;
    res.json({
      totalOpportunities: total,
      estimatedRevenue:   Math.round(rev),
      appliedThisMonth:   row.appliedThisMonth ?? 0,
      avgImpactPerRec:    total > 0 ? Math.round(rev / total) : 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/insightflow/billing-optimization/:id/status
 * Status updates are logged - no persistent table yet; returns 200 with ack.
 */
router.put('/:id/status', (req: Request, res: Response) => {
  const id     = parseInt(req.params['id'], 10);
  const status = req.body?.status ?? 'dismissed';
  res.json({ success: true, id, status });
});

export default router;
