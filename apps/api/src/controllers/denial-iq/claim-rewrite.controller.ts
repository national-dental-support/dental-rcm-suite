/**
 * Inline Narrative Rewrite Controller
 *
 * POST /api/denial-iq/claim-rewrite/:claimId  - generate and persist a rewrite
 * GET  /api/denial-iq/claim-rewrite/:claimId  - return the latest rewrite for a claim
 * PATCH /api/denial-iq/claim-rewrite/:id      - accept or reject a rewrite
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import { rewriteNarrative, persistRewrite } from '../../services/ai-agents/rewrite-agent';

export class ClaimRewriteController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/denial-iq/claim-rewrite/:claimId - latest rewrite */
  getLatest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('ClaimId', sql.NVarChar(50), claimId);
      if (custId != null) r.input('_custId', sql.Int, custId);

      const result = await r.query(`
        SELECT TOP 1
          id, claim_id, original_text, rewritten_text, diff_hunks,
          focus_areas, confidence, accepted, accepted_by, model_version, created_at
        FROM dbo.ClaimRewrite
        WHERE claim_id = @ClaimId${custId != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY created_at DESC
      `);

      if (!result.recordset.length) return res.status(404).json({ message: 'No rewrite available.' });
      const row = result.recordset[0];
      return res.json({
        data: {
          ...row,
          diff_hunks: JSON.parse(row.diff_hunks || '[]'),
          focus_areas: row.focus_areas ? row.focus_areas.split(',').map((s: string) => s.trim()) : [],
        },
      });
    } catch (err: any) {
      logger.error('[ClaimRewrite] getLatest error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/claim-rewrite/:claimId - generate a new rewrite */
  generate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const custId = extractCustomerId(req);
      const { narrative } = req.body as { narrative?: string };

      const result = await rewriteNarrative(claimId, custId, narrative);
      if (!result) {
        return res.status(422).json({ message: 'Rewrite unavailable. Claim not found or Ollama unavailable.' });
      }

      const id = await persistRewrite(claimId, custId, result);
      return res.status(201).json({ data: { id, ...result } });
    } catch (err: any) {
      logger.error('[ClaimRewrite] generate error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PATCH /api/denial-iq/claim-rewrite/:id - accept or reject, optionally saving edited text */
  updateAcceptance = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const { accepted, rewritten_text } = req.body as { accepted: boolean; rewritten_text?: string };
      const custId = extractCustomerId(req);
      const actorEmail = (req.headers['x-actor-email'] as string) || 'unknown';

      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      r.input('Accepted', sql.Bit, accepted ? 1 : 0);
      r.input('AcceptedBy', sql.NVarChar(255), actorEmail);
      if (custId != null) r.input('_custId', sql.Int, custId);

      if (rewritten_text !== undefined) {
        r.input('RewrittenText', sql.NVarChar(sql.MAX), rewritten_text);
      }

      await r.query(`
        UPDATE dbo.ClaimRewrite
        SET accepted = @Accepted,
            accepted_by = @AcceptedBy
            ${rewritten_text !== undefined ? ', rewritten_text = @RewrittenText' : ''}
        WHERE id = @Id${custId != null ? ' AND customer_id = @_custId' : ''}
      `);

      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('[ClaimRewrite] updateAcceptance error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
