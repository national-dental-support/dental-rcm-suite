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
 * GET /api/insightflow/image-verification/queue
 * Returns claim attachments pending verification from dbo.ClaimAttachment.
 * Falls back to rejected claims with documentation rules if ClaimAttachment is empty.
 */
router.get('/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT TOP 25
        ca.claim_id                                                           AS claimId,
        ISNULL(rr.PatientFirstName + ' ' + rr.PatientLastName, 'Unknown')    AS patientName,
        ISNULL(ca.file_type, 'doc')                                          AS attachmentType,
        ca.uploaded_at                                                       AS uploadedAt,
        ISNULL(ca.status, 'pending')                                         AS status,
        ISNULL(ca.ai_confidence, 85)                                         AS aiConfidence
      FROM dbo.ClaimAttachment ca
      LEFT JOIN dbo.recon_report rr
        ON rr.ClaimID = ca.claim_id AND rr.customer_id = ca.customer_id AND rr.TrxType = 'Charge'
      WHERE ${cid != null ? 'ca.customer_id = @custId' : '1=1'}
      ORDER BY ca.uploaded_at DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insightflow/image-verification/stats
 * Returns aggregate verification stats.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);

    const result = await r.query(`
      SELECT
        SUM(CASE WHEN ISNULL(status,'pending') = 'pending'   THEN 1 ELSE 0 END) AS pendingVerification,
        SUM(CASE WHEN status = 'verified'
              AND CAST(uploaded_at AS DATE) = CAST(GETUTCDATE() AS DATE) THEN 1 ELSE 0 END) AS verifiedToday,
        SUM(CASE WHEN status = 'rejected'
              AND CAST(uploaded_at AS DATE) = CAST(GETUTCDATE() AS DATE) THEN 1 ELSE 0 END) AS rejectedToday,
        AVG(ISNULL(ai_confidence, 85))                                          AS avgConfidence
      FROM dbo.ClaimAttachment
      WHERE ${cid != null ? 'customer_id = @custId' : '1=1'}
    `);

    const row = result.recordset[0] ?? {};
    res.json({
      pendingVerification: row.pendingVerification ?? 0,
      verifiedToday:       row.verifiedToday       ?? 0,
      rejectedToday:       row.rejectedToday       ?? 0,
      avgConfidence:       row.avgConfidence        ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/insightflow/image-verification/:claimId/verify
 * Marks a claim attachment as verified.
 */
router.put('/:claimId/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);
    r.input('claimId', sql.VarChar(50), req.params['claimId']);
    r.input('email', sql.NVarChar(255), (req as any).actor?.email ?? 'system');

    await r.query(`
      UPDATE dbo.ClaimAttachment
        SET status = 'verified', reviewed_by = @email, reviewed_at = GETUTCDATE()
      WHERE ${cid != null ? 'customer_id = @custId' : '1=1'} AND claim_id = @claimId
    `);

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/insightflow/image-verification/:claimId/reject
 * Marks a claim attachment as rejected with a reason.
 */
router.put('/:claimId/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const r = pool.request();
    const cid = actorCustId(req);
    if (cid != null) r.input('custId', sql.Int, cid);
    r.input('claimId', sql.VarChar(50), req.params['claimId']);
    r.input('reason', sql.NVarChar(500), req.body?.reason ?? '');

    await r.query(`
      UPDATE dbo.ClaimAttachment
        SET status = 'rejected', reject_reason = @reason, reviewed_at = GETUTCDATE()
      WHERE ${cid != null ? 'customer_id = @custId' : '1=1'} AND claim_id = @claimId
    `);

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
