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
 * GET /api/insightflow/clean-claim/issues
 * Returns claim quality issues from dbo.rejectedclaims + dbo.rules (real DB data).
 */
router.get('/issues', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT TOP 50
        rc.ClaimID                                                            AS claimId,
        ISNULL(rr.PatientFirstName + ' ' + rr.PatientLastName, 'Unknown')    AS patientName,
        ISNULL(r.RuleName, 'Rule #' + CAST(rc.RuleID AS VARCHAR))            AS issueType,
        ISNULL(r.Description, 'Claim failed validation rule')                AS issueDescription,
        CASE r.RuleType
          WHEN 'Error'   THEN 'error'
          WHEN 'Warning' THEN 'warning'
          ELSE 'info'
        END                                                                   AS severity,
        CASE WHEN r.Category IN ('AutoFix','NPI','BillingNPI') THEN 1 ELSE 0 END AS autoFixable
      FROM dbo.rejectedclaims rc
      JOIN dbo.rules r ON r.RuleID = rc.RuleID
      LEFT JOIN dbo.recon_report rr
        ON rr.ClaimID = rc.ClaimID AND rr.customer_id = rc.customer_id AND rr.TrxType = 'Charge'
      WHERE ${cid != null ? 'rc.customer_id = @custId' : '1=1'}
      ORDER BY rc.CreateDate DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/clean-claim/stats
 * Returns aggregate clean-claim quality stats.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        COUNT(DISTINCT rc.ClaimID)                                            AS issuesFoundToday,
        SUM(CASE WHEN r.Category IN ('AutoFix','NPI','BillingNPI') THEN 1 ELSE 0 END) AS autoFixedToday,
        COUNT(DISTINCT rc.ClaimID)
          - SUM(CASE WHEN r.Category IN ('AutoFix','NPI','BillingNPI') THEN 1 ELSE 0 END) AS manualReviewNeeded,
        -- Total claims vs rejected claims for clean-claim rate
        (SELECT COUNT(DISTINCT ClaimID)
           FROM dbo.recon_report WHERE ${cid != null ? 'customer_id = @custId' : '1=1'} AND TrxType = 'Charge') AS totalClaims
      FROM dbo.rejectedclaims rc
      JOIN dbo.rules r ON r.RuleID = rc.RuleID
      WHERE ${cid != null ? 'rc.customer_id = @custId' : '1=1'}
        AND CAST(rc.CreateDate AS DATE) = CAST(GETUTCDATE() AS DATE)
    `);

    const row = result.recordset[0] ?? {};
    const total   = row.totalClaims   ?? 1;
    const issues  = row.issuesFoundToday ?? 0;
    res.json({
      cleanClaimRate:      total > 0 ? Math.round(((total - issues) / total) * 1000) / 10 : 100,
      issuesFoundToday:    issues,
      autoFixedToday:      row.autoFixedToday ?? 0,
      manualReviewNeeded:  row.manualReviewNeeded ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/insightflow/clean-claim/auto-fix
 * Marks auto-fixable rejected claims as resolved.
 * Real implementation: removes from rejectedclaims for eligible rule types.
 */
router.post('/auto-fix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { claimIds } = req.body as { claimIds: string[] };
    if (!Array.isArray(claimIds) || claimIds.length === 0) {
      return res.status(400).json({ error: 'claimIds array is required' });
    }

    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    // Build safe parameterised list - claimIds are strings like 'CL50xxx'
    const placeholders = claimIds.map((_, i) => `@cid${i}`).join(',');
    claimIds.forEach((id, i) => r.input(`cid${i}`, sql.VarChar(50), id));

    const result = await r.query(`
      DELETE rc
      FROM dbo.rejectedclaims rc
      JOIN dbo.rules r ON r.RuleID = rc.RuleID
      WHERE ${cid != null ? 'rc.customer_id = @custId' : '1=1'}
        AND rc.ClaimID IN (${placeholders})
        AND r.Category IN ('AutoFix','NPI','BillingNPI');
      SELECT @@ROWCOUNT AS fixed;
    `);

    const fixed = result.recordset[0]?.fixed ?? 0;
    return res.json({ fixed, failed: claimIds.length - fixed });
  } catch (err) {
    return next(err);
  }
});

export default router;
