/**
 * Claim Approval Gate Controller
 *
 * Specialists submit a resubmission for manager review.
 * Managers approve or reject with comments.
 * Only approved resubmissions may proceed to transmission.
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class ClaimApprovalController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/denial-iq/approvals?status=pending_review&claimId=  (managers see their queue) */
  list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId = extractCustomerId(req);
      const status = (req.query.status as string) || null;
      const claimId = (req.query.claimId as string) || null;

      const conditions: string[] = ['1=1'];
      const r = this.pool.request();
      if (custId != null) { r.input('_custId', sql.Int, custId); conditions.push('ca.customer_id = @_custId'); }
      if (status) { r.input('_status', sql.NVarChar(30), status); conditions.push('ca.status = @_status'); }
      if (claimId) { r.input('_claimId', sql.NVarChar(50), claimId); conditions.push('ca.claim_id = @_claimId'); }

      const result = await r.query(`
        SELECT
          ca.id, ca.claim_id, ca.appeal_id, ca.submitted_by, ca.submitted_at,
          ca.reviewer_email, ca.reviewed_at, ca.status, ca.reviewer_notes,
          ca.created_at, ca.updated_at,
          LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))) AS PatientName,
          COALESCE(rr.InsuranceName, '') AS PayerName,
          COALESCE(rr.ChargeAmt, 0) AS ChargeAmt,
          ch.CARCCode AS DenialCode
        FROM dbo.ClaimApproval ca
        LEFT JOIN dbo.claims c ON c.ClaimID = ca.claim_id
        LEFT JOIN dbo.patient pt ON pt.PatientID = c.PatientID
        LEFT JOIN dbo.recon_report rr ON rr.ClaimID = ca.claim_id AND rr.TrxType = 'Charge'
        LEFT JOIN (
          SELECT ClaimID, CARCCode,
                 ROW_NUMBER() OVER (PARTITION BY ClaimID ORDER BY ClaimModifiedDate DESC) AS rn
          FROM dbo.claimhistory
        ) ch ON ch.ClaimID = ca.claim_id AND ch.rn = 1
        WHERE ${conditions.join(' AND ')}
        ORDER BY ca.submitted_at DESC
      `);

      return res.json({ data: result.recordset });
    } catch (err: any) {
      logger.error('[ClaimApproval] list error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/denial-iq/approvals/:id */
  get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      if (custId != null) r.input('_custId', sql.Int, custId);

      const result = await r.query(`
        SELECT * FROM dbo.ClaimApproval
        WHERE id = @Id${custId != null ? ' AND customer_id = @_custId' : ''}
      `);

      if (!result.recordset.length) return res.status(404).json({ message: 'Not found' });
      return res.json({ data: result.recordset[0] });
    } catch (err: any) {
      logger.error('[ClaimApproval] get error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/approvals  - specialist submits a claim for manager review */
  submit = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claim_id, appeal_id, package_snapshot } = req.body as {
        claim_id: string;
        appeal_id?: number;
        package_snapshot?: Record<string, unknown>;
      };

      if (!claim_id) return res.status(400).json({ message: 'claim_id is required' });

      const custId = extractCustomerId(req);
      const actorEmail = (req.headers['x-actor-email'] as string) || 'unknown';

      // Prevent duplicate pending submissions
      const dupCheck = this.pool.request();
      dupCheck.input('ClaimId', sql.NVarChar(50), claim_id);
      if (custId != null) dupCheck.input('_custId', sql.Int, custId);
      const dup = await dupCheck.query(`
        SELECT TOP 1 id FROM dbo.ClaimApproval
        WHERE claim_id = @ClaimId AND status = 'pending_review'
        ${custId != null ? 'AND customer_id = @_custId' : ''}
      `);
      if (dup.recordset.length) {
        return res.status(409).json({ message: 'This claim already has a pending review submission.' });
      }

      const r = this.pool.request();
      r.input('ClaimId', sql.NVarChar(50), claim_id);
      r.input('AppealId', sql.Int, appeal_id ?? null);
      r.input('SubmittedBy', sql.NVarChar(255), actorEmail);
      r.input('Snapshot', sql.NVarChar(sql.MAX), package_snapshot ? JSON.stringify(package_snapshot) : null);
      r.input('CustId', sql.Int, custId);

      const result = await r.query(`
        INSERT INTO dbo.ClaimApproval
          (customer_id, claim_id, appeal_id, submitted_by, package_snapshot)
        OUTPUT INSERTED.*
        VALUES (@CustId, @ClaimId, @AppealId, @SubmittedBy, @Snapshot)
      `);

      return res.status(201).json({ data: result.recordset[0] });
    } catch (err: any) {
      logger.error('[ClaimApproval] submit error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PATCH /api/denial-iq/approvals/:id  - manager approves or rejects */
  review = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status, reviewer_notes } = req.body as { status: string; reviewer_notes?: string };

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'status must be "approved" or "rejected"' });
      }

      const custId = extractCustomerId(req);
      const actorEmail = (req.headers['x-actor-email'] as string) || 'unknown';
      const actorId: number | null = (req as any).actor?.user_id ?? null;

      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      r.input('Status', sql.NVarChar(30), status);
      r.input('ReviewerEmail', sql.NVarChar(255), actorEmail);
      r.input('ReviewerId', sql.Int, actorId);
      r.input('Notes', sql.NVarChar(sql.MAX), reviewer_notes ?? null);
      r.input('Now', sql.DateTime2, new Date());
      if (custId != null) r.input('_custId', sql.Int, custId);

      await r.query(`
        UPDATE dbo.ClaimApproval
        SET status = @Status,
            reviewer_email = @ReviewerEmail,
            reviewer_id = @ReviewerId,
            reviewer_notes = @Notes,
            reviewed_at = @Now,
            updated_at = @Now
        WHERE id = @Id${custId != null ? ' AND customer_id = @_custId' : ''}
      `);

      return res.json({ ok: true, status });
    } catch (err: any) {
      logger.error('[ClaimApproval] review error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/denial-iq/approvals/:id  - specialist recalls a pending submission */
  recall = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      if (custId != null) r.input('_custId', sql.Int, custId);

      await r.query(`
        UPDATE dbo.ClaimApproval
        SET status = 'recalled', updated_at = GETUTCDATE()
        WHERE id = @Id AND status = 'pending_review'
        ${custId != null ? 'AND customer_id = @_custId' : ''}
      `);

      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('[ClaimApproval] recall error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
