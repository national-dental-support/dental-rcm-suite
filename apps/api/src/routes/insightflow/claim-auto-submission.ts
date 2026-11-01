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
 * GET /api/insightflow/claim-auto-submission/rules
 * Returns auto-submission workflow rules from dbo.WorkflowRule (real DB).
 */
router.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        id,
        trigger_event               AS name,
        action_type                 AS description,
        conditions,
        action_config               AS actions,
        is_active                   AS enabled,
        trigger_event               AS trigger_type,
        0                           AS claimsProcessedLast30d
      FROM dbo.WorkflowRule
      WHERE ${cid != null ? 'customer_id = @custId' : '1=1'}
      ORDER BY id
    `);

    // Parse JSON conditions/actions stored as strings
    const rows = result.recordset.map(row => ({
      ...row,
      conditions: (() => {
        try { return JSON.parse(row.conditions ?? '[]'); } catch { return []; }
      })(),
      actions: (() => {
        try { return JSON.parse(row.actions ?? '[]'); } catch { return []; }
      })(),
    }));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/claim-auto-submission/queue
 * Returns pending submission records from dbo.SubmissionRecord + recon_report.
 */
router.get('/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT TOP 50
        sr.claim_id                                                              AS claimId,
        ISNULL(sr.patient_name, 'Unknown')                                       AS patientName,
        ISNULL(sr.charge_amount, 0)                                              AS amount,
        ISNULL(sr.payer_name, 'Unknown')                                         AS payer,
        ISNULL(rr.CPT, 'N/A')                                                    AS procedureCode,
        sr.resubmitted_at                                                        AS submissionTime,
        'Auto-Submission'                                                        AS ruleApplied,
        95                                                                       AS confidence
      FROM dbo.SubmissionRecord sr
      LEFT JOIN dbo.recon_report rr
        ON rr.ClaimID = sr.claim_id AND rr.customer_id = sr.customer_id AND rr.TrxType = 'Charge'
      WHERE ${cid != null ? 'sr.customer_id = @custId' : '1=1'} AND sr.submission_status = 'pending'
      ORDER BY sr.id DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/claim-auto-submission/stats
 * Returns aggregate auto-submission stats from SubmissionBatch.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        SUM(CASE WHEN CAST(submitted_at AS DATE) = CAST(GETUTCDATE() AS DATE)
              THEN accepted ELSE 0 END)         AS autoSubmittedToday,
        SUM(accepted)                           AS autoSubmittedMonth,
        SUM(rejected)                           AS manualOverrideCount,
        CASE WHEN SUM(total_claims) > 0
          THEN ROUND(100.0 * SUM(accepted) / SUM(total_claims), 1)
          ELSE 0 END                            AS cleanClaimRate
      FROM dbo.SubmissionBatch
      WHERE ${cid != null ? 'customer_id = @custId' : '1=1'}
        AND submitted_at >= DATEADD(month, -1, GETUTCDATE())
    `);

    const row = result.recordset[0] ?? {};
    res.json({
      autoSubmittedToday:  row.autoSubmittedToday  ?? 0,
      autoSubmittedMonth:  row.autoSubmittedMonth  ?? 0,
      manualOverrideCount: row.manualOverrideCount ?? 0,
      cleanClaimRate:      row.cleanClaimRate      ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/insightflow/claim-auto-submission/rules/:id/toggle
 * Toggles a WorkflowRule's is_active flag in the DB.
 */
router.put('/rules/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid rule id' });

    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);
    r.input('id', sql.Int, id);

    const result = await r.query(`
      UPDATE dbo.WorkflowRule
        SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
      OUTPUT INSERTED.id, INSERTED.is_active AS enabled
      WHERE id = @id AND ${cid != null ? 'customer_id = @custId' : '1=1'}
    `);

    if (!result.recordset.length) return res.status(404).json({ error: 'Rule not found' });
    return res.json({ success: true, ...result.recordset[0] });
  } catch (err) {
    return next(err);
  }
});

export default router;
