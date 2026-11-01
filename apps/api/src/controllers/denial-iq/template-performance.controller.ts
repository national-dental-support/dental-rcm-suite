/**
 * Template Performance / Continuous Learning Controller
 *
 * Records appeal outcomes (won/lost) and updates TemplatePerformance
 * win-rate statistics so the best templates surface automatically.
 *
 * GET  /api/denial-iq/template-performance          - ranked template leaderboard
 * POST /api/denial-iq/template-performance/outcome  - record a won/lost outcome
 * POST /api/denial-iq/template-performance/refresh  - recalculate all win rates from AppealOutcomeLog
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class TemplatePerformanceController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/denial-iq/template-performance */
  leaderboard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId = extractCustomerId(req);
      const payerName = (req.query.payer as string) || null;
      const denialReason = (req.query.denial_reason as string) || null;

      const conditions: string[] = ['tp.total_used > 0'];
      const r = this.pool.request();
      if (custId != null) { r.input('_custId', sql.Int, custId); conditions.push('tp.customer_id = @_custId'); }
      if (payerName) { r.input('_payer', sql.NVarChar(255), payerName); conditions.push('tp.payer_name = @_payer'); }
      if (denialReason) { r.input('_denial', sql.NVarChar(20), denialReason); conditions.push('tp.denial_reason = @_denial'); }

      const result = await r.query(`
        SELECT
          tp.id, tp.template_id, t.template_name,
          tp.payer_name, tp.denial_reason,
          tp.total_used, tp.total_won, tp.total_lost,
          tp.win_rate, tp.avg_days_to_win, tp.last_outcome_at,
          RANK() OVER (PARTITION BY tp.payer_name, tp.denial_reason ORDER BY tp.win_rate DESC, tp.total_used DESC) AS rank_in_segment
        FROM dbo.TemplatePerformance tp
        LEFT JOIN dbo.AppealLetterTemplate t ON t.id = tp.template_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY tp.win_rate DESC, tp.total_used DESC
      `);

      return res.json({ data: result.recordset });
    } catch (err: any) {
      logger.error('[TemplatePerformance] leaderboard error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/template-performance/outcome - record a single appeal outcome */
  recordOutcome = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { appeal_id, outcome, days_to_close } = req.body as {
        appeal_id: number;
        outcome: 'won' | 'lost';
        days_to_close?: number;
      };

      if (!appeal_id || !['won', 'lost'].includes(outcome)) {
        return res.status(400).json({ message: 'appeal_id and outcome (won|lost) are required' });
      }

      const custId = extractCustomerId(req);

      // Load the appeal to get template_id, claim_id, denial_reason
      const appealReq = this.pool.request();
      appealReq.input('AppealId', sql.Int, appeal_id);
      if (custId != null) appealReq.input('_custId', sql.Int, custId);
      const appealResult = await appealReq.query(`
        SELECT a.id, a.claim_id, a.template_id, a.denial_reason,
               COALESCE(rr.InsuranceName,'') AS payer_name
        FROM dbo.DenialAppeal a
        LEFT JOIN dbo.recon_report rr ON rr.ClaimID = a.claim_id AND rr.TrxType = 'Charge'
        WHERE a.id = @AppealId${custId != null ? ' AND a.customer_id = @_custId' : ''}
      `);

      if (!appealResult.recordset.length) return res.status(404).json({ message: 'Appeal not found' });
      const appeal = appealResult.recordset[0];

      // Log outcome
      const logReq = this.pool.request();
      logReq.input('CustId', sql.Int, custId);
      logReq.input('AppealId', sql.Int, appeal_id);
      logReq.input('TemplateId', sql.Int, appeal.template_id ?? null);
      logReq.input('ClaimId', sql.NVarChar(50), appeal.claim_id);
      logReq.input('PayerName', sql.NVarChar(255), appeal.payer_name);
      logReq.input('DenialReason', sql.NVarChar(20), appeal.denial_reason ?? null);
      logReq.input('Outcome', sql.NVarChar(10), outcome);
      logReq.input('DaysToClose', sql.Int, days_to_close ?? null);
      await logReq.query(`
        INSERT INTO dbo.AppealOutcomeLog (customer_id, appeal_id, template_id, claim_id, payer_name, denial_reason, outcome, days_to_close)
        VALUES (@CustId, @AppealId, @TemplateId, @ClaimId, @PayerName, @DenialReason, @Outcome, @DaysToClose)
      `);

      // Update DenialAppeal status
      await this.pool.request()
        .input('AppealId', sql.Int, appeal_id)
        .input('Status', sql.NVarChar(20), outcome)
        .query(`UPDATE dbo.DenialAppeal SET status = @Status, updated_at = GETUTCDATE() WHERE id = @AppealId`);

      // Upsert TemplatePerformance if a template was used
      if (appeal.template_id) {
        const perfReq = this.pool.request();
        perfReq.input('CustId', sql.Int, custId);
        perfReq.input('TemplateId', sql.Int, appeal.template_id);
        perfReq.input('PayerName', sql.NVarChar(255), appeal.payer_name || null);
        perfReq.input('DenialReason', sql.NVarChar(20), appeal.denial_reason || null);
        perfReq.input('Won', sql.Int, outcome === 'won' ? 1 : 0);
        perfReq.input('Lost', sql.Int, outcome === 'lost' ? 1 : 0);
        perfReq.input('AvgDays', sql.Decimal(7, 1), days_to_close ?? null);

        await perfReq.query(`
          MERGE dbo.TemplatePerformance AS target
          USING (SELECT @CustId AS cid, @TemplateId AS tid, @PayerName AS pn, @DenialReason AS dr) AS src
          ON target.template_id = src.tid
            AND ISNULL(target.payer_name,'') = ISNULL(src.pn,'')
            AND ISNULL(target.denial_reason,'') = ISNULL(src.dr,'')
            AND target.customer_id = src.cid
          WHEN MATCHED THEN UPDATE SET
            total_used = total_used + 1,
            total_won  = total_won + @Won,
            total_lost = total_lost + @Lost,
            avg_days_to_win = CASE WHEN @Won = 1 AND @AvgDays IS NOT NULL
              THEN (ISNULL(avg_days_to_win, @AvgDays) + @AvgDays) / 2.0 ELSE avg_days_to_win END,
            last_outcome_at = GETUTCDATE(),
            updated_at = GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT
            (customer_id, template_id, payer_name, denial_reason, total_used, total_won, total_lost, avg_days_to_win, last_outcome_at)
            VALUES (@CustId, @TemplateId, @PayerName, @DenialReason, 1, @Won, @Lost, CASE WHEN @Won=1 THEN @AvgDays ELSE NULL END, GETUTCDATE());
        `);
      }

      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('[TemplatePerformance] recordOutcome error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/template-performance/refresh - full recalculation from outcome log */
  refresh = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      if (custId != null) r.input('_custId', sql.Int, custId);

      await r.query(`
        MERGE dbo.TemplatePerformance AS target
        USING (
          SELECT
            ${custId != null ? '@_custId' : 'customer_id'} AS customer_id,
            template_id,
            payer_name,
            denial_reason,
            COUNT(*) AS total_used,
            SUM(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) AS total_won,
            SUM(CASE WHEN outcome = 'lost' THEN 1 ELSE 0 END) AS total_lost,
            AVG(CASE WHEN outcome = 'won' AND days_to_close IS NOT NULL THEN CAST(days_to_close AS FLOAT) ELSE NULL END) AS avg_days_to_win,
            MAX(recorded_at) AS last_outcome_at
          FROM dbo.AppealOutcomeLog
          WHERE template_id IS NOT NULL
            ${custId != null ? 'AND customer_id = @_custId' : ''}
          GROUP BY template_id, payer_name, denial_reason${custId != null ? '' : ', customer_id'}
        ) AS src (customer_id, template_id, payer_name, denial_reason, total_used, total_won, total_lost, avg_days_to_win, last_outcome_at)
        ON target.template_id = src.template_id
          AND ISNULL(target.payer_name,'') = ISNULL(src.payer_name,'')
          AND ISNULL(target.denial_reason,'') = ISNULL(src.denial_reason,'')
          AND target.customer_id = src.customer_id
        WHEN MATCHED THEN UPDATE SET
          total_used = src.total_used, total_won = src.total_won, total_lost = src.total_lost,
          avg_days_to_win = src.avg_days_to_win, last_outcome_at = src.last_outcome_at, updated_at = GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT
          (customer_id, template_id, payer_name, denial_reason, total_used, total_won, total_lost, avg_days_to_win, last_outcome_at)
          VALUES (src.customer_id, src.template_id, src.payer_name, src.denial_reason, src.total_used, src.total_won, src.total_lost, src.avg_days_to_win, src.last_outcome_at);
      `);

      return res.json({ ok: true, message: 'TemplatePerformance recalculated from AppealOutcomeLog.' });
    } catch (err: any) {
      logger.error('[TemplatePerformance] refresh error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
