/**
 * Narrative Completeness Score Controller
 *
 * POST /api/denial-iq/narrative-score/:claimId  - triggers scoring, persists result
 * GET  /api/denial-iq/narrative-score/:claimId  - returns latest stored score
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import { scoreNarrative, persistScore } from '../../services/ai-agents/narrative-scorer-agent';

export class NarrativeScoreController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/denial-iq/narrative-score/:claimId */
  getLatest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('ClaimId', sql.NVarChar(50), claimId);
      if (custId != null) r.input('_custId', sql.Int, custId);

      const result = await r.query(`
        SELECT TOP 1 id, claim_id, score, missing_elements, recommendations, model_version, scored_at
        FROM dbo.NarrativeScore
        WHERE claim_id = @ClaimId${custId != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY scored_at DESC
      `);

      if (!result.recordset.length) return res.status(404).json({ message: 'No score available. POST to score this claim.' });

      const row = result.recordset[0];
      return res.json({
        data: {
          ...row,
          missing_elements: JSON.parse(row.missing_elements || '[]'),
          recommendations: JSON.parse(row.recommendations || '[]'),
        },
      });
    } catch (err: any) {
      logger.error('[NarrativeScore] getLatest error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/narrative-score/:claimId */
  score = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const custId = extractCustomerId(req);

      const result = await scoreNarrative(claimId, custId);
      if (!result) {
        return res.status(422).json({ message: 'Unable to score narrative. Claim not found or Ollama unavailable.' });
      }

      await persistScore(claimId, custId, result);

      return res.status(201).json({ data: result });
    } catch (err: any) {
      logger.error('[NarrativeScore] score error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
