import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

interface UnmatchedPayment {
  BankDepositID: string;
  DepositAmount: number;
  DepositDate: string;
  PayerName: string | null;
  PracticeLocation: string | null;
}

interface UnmatchedEob {
  RemittanceFileID: string;
  Amount: number;
  FileDate: string;
  era_payer: string | null;
  PracticeLocation: string | null;
}

export class AutoMatcherController extends DatabaseConnectionController {
  constructor() { super(); }

  /** POST /api/recon-iq/matching/generate-suggestions */
  generateSuggestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';

      const custSql = xenCustId != null
        ? `AND rf.customer_id = @CustId`
        : '';
      const bdCustSql = xenCustId != null
        ? `AND bd.customer_id = @CustId`
        : '';

      const eobReq = this.pool.request();
      if (xenCustId != null) eobReq.input('CustId', sql.Int, xenCustId);
      const eobRes = await eobReq.query(`
        SELECT DISTINCT rf.RemittanceFileID, rf.Amount, rf.FileDate, rf.era_payer, rf.PracticeLocation
        FROM dbo.remittanceFile rf
        WHERE rf.RemittanceFileID NOT IN (
          SELECT RemittanceFileID FROM dbo.reconciliation WHERE MatchFlag IN ('true','1')
        )
        ${custSql}
      `);

      const bdReq = this.pool.request();
      if (xenCustId != null) bdReq.input('CustId', sql.Int, xenCustId);
      const bdRes = await bdReq.query(`
        SELECT DISTINCT bd.BankDepositID, bd.DepositAmount, bd.DepositDate,
          NULL AS PayerName, NULL AS PracticeLocation
        FROM dbo.bankDeposit bd
        WHERE bd.BankDepositID NOT IN (
          SELECT BankDepositID FROM dbo.reconciliation WHERE MatchFlag IN ('true','1')
        )
        ${bdCustSql}
      `);

      const eobs = eobRes.recordset as UnmatchedEob[];
      const payments = bdRes.recordset as UnmatchedPayment[];

      // Clear old pending suggestions for this customer
      const delR = this.pool.request();
      if (xenCustId != null) delR.input('CustId', sql.Int, xenCustId);
      await delR.query(`
        DELETE FROM dbo.MatchSuggestion
        WHERE status = 'pending'
          ${xenCustId != null ? 'AND customer_id = @CustId' : ''}
      `);

      const suggestions: Array<{
        bankDepositId: string;
        remittanceFileId: string;
        confidenceScore: number;
        matchReasons: string[];
      }> = [];

      for (const payment of payments) {
        for (const eob of eobs) {
          let score = 0;
          const reasons: string[] = [];

          // Exact amount match: +40
          if (Math.abs(payment.DepositAmount - Math.abs(eob.Amount)) < 0.01) {
            score += 40;
            reasons.push('amount_exact');
          } else if (Math.abs(payment.DepositAmount - Math.abs(eob.Amount)) / Math.max(Math.abs(payment.DepositAmount), 0.01) < 0.05) {
            score += 20;
            reasons.push('amount_close');
          }

          // Same payer/insurer: +25
          if (payment.PayerName && eob.era_payer &&
              payment.PayerName.toLowerCase().trim() === eob.era_payer.toLowerCase().trim()) {
            score += 25;
            reasons.push('same_payer');
          }

          // Date within 3 days: +20
          const depDate  = new Date(payment.DepositDate).getTime();
          const fileDate = new Date(eob.FileDate).getTime();
          const daysDiff = Math.abs(depDate - fileDate) / 86400000;
          if (daysDiff <= 3) { score += 20; reasons.push('date_within_3_days'); }
          else if (daysDiff <= 7) { score += 10; reasons.push('date_within_7_days'); }

          // Same location: +15
          if (payment.PracticeLocation && eob.PracticeLocation &&
              payment.PracticeLocation.toLowerCase().trim() === eob.PracticeLocation.toLowerCase().trim()) {
            score += 15;
            reasons.push('same_location');
          }

          if (score >= 20) {
            suggestions.push({
              bankDepositId:    payment.BankDepositID,
              remittanceFileId: eob.RemittanceFileID,
              confidenceScore:  Math.min(score, 100),
              matchReasons:     reasons,
            });
          }
        }
      }

      // Insert suggestions
      for (const s of suggestions) {
        const ins = this.pool.request();
        ins.input('CustId',   sql.Int,          xenCustId ?? 0);
        ins.input('BdId',     sql.NVarChar(50),  s.bankDepositId);
        ins.input('RfId',     sql.NVarChar(50),  s.remittanceFileId);
        ins.input('Score',    sql.Decimal(5, 2), s.confidenceScore);
        ins.input('Reasons',  sql.NVarChar(500), JSON.stringify(s.matchReasons));
        await ins.query(`
          INSERT INTO dbo.MatchSuggestion (customer_id, bank_deposit_id, remittance_file_id, confidence_score, match_reasons)
          VALUES (@CustId, @BdId, @RfId, @Score, @Reasons)
        `);
      }

      logger.info('[AutoMatcher] generated suggestions', { count: suggestions.length, actor });
      res.json({ generated: suggestions.length });
    } catch (err: any) {
      logger.error('[AutoMatcher] generateSuggestions error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/recon-iq/matching/suggestions */
  getSuggestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const page     = Math.max(parseInt(String(req.query.page))     || 1, 1);
      const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 25, 100);
      const offset   = (page - 1) * pageSize;
      const minScore = parseFloat(String(req.query.minScore)) || 0;

      const custSql = xenCustId != null ? 'AND ms.customer_id = @CustId' : '';
      const r = this.pool.request();
      if (xenCustId != null) r.input('CustId',   sql.Int, xenCustId);
      r.input('MinScore', sql.Decimal(5, 2), minScore);
      r.input('Offset',   sql.Int, offset);
      r.input('PageSize', sql.Int, pageSize);

      const result = await r.query(`
        SELECT
          ms.id, ms.bank_deposit_id, ms.remittance_file_id, ms.confidence_score,
          ms.match_reasons, ms.status, ms.generated_at,
          bd.DepositAmount, FORMAT(bd.DepositDate,'yyyy-MM-dd') AS deposit_date,
          NULL AS PayerName, NULL AS deposit_location,
          rf.Amount AS eob_amount, FORMAT(rf.FileDate,'yyyy-MM-dd') AS file_date,
          rf.era_payer, rf.PracticeLocation AS eob_location
        FROM dbo.MatchSuggestion ms
        LEFT JOIN dbo.bankDeposit bd ON bd.BankDepositID = ms.bank_deposit_id
        LEFT JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = ms.remittance_file_id
        WHERE ms.status = 'pending'
          AND ms.confidence_score >= @MinScore
          ${custSql}
        ORDER BY ms.confidence_score DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);

      const rows = result.recordset.map((row: any) => ({
        id:                row.id,
        bankDepositId:     row.bank_deposit_id,
        remittanceFileId:  row.remittance_file_id,
        confidenceScore:   row.confidence_score,
        matchReasons:      (() => { try { return JSON.parse(row.match_reasons); } catch { return []; } })(),
        status:            row.status,
        generatedAt:       row.generated_at,
        depositAmount:     Math.round(Math.abs(row.DepositAmount ?? 0)),
        depositDate:       row.deposit_date,
        payerName:         row.PayerName,
        depositLocation:   row.deposit_location,
        eobAmount:         Math.round(Math.abs(row.eob_amount ?? 0)),
        fileDate:          row.file_date,
        insuranceName:     row.era_payer,
        eobLocation:       row.eob_location,
      }));

      res.json({ rows });
    } catch (err: any) {
      logger.error('[AutoMatcher] getSuggestions error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/recon-iq/matching/suggestions/:id/accept */
  acceptSuggestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';

      // Fetch the suggestion
      const fetchR = this.pool.request().input('Id', sql.Int, parseInt(id));
      const fetchRes = await fetchR.query(`
        SELECT bank_deposit_id, remittance_file_id, customer_id
        FROM dbo.MatchSuggestion WHERE id = @Id AND status = 'pending'
      `);
      if (!fetchRes.recordset.length) {
        res.status(404).json({ message: 'Pending suggestion not found' }); return;
      }
      const { bank_deposit_id, remittance_file_id } = fetchRes.recordset[0];

      // Apply match
      const matchR = this.pool.request();
      matchR.input('BdId', sql.NVarChar(50), bank_deposit_id);
      matchR.input('RfId', sql.NVarChar(50), remittance_file_id);
      matchR.input('Actor', sql.NVarChar(100), actor);

      const existsRes = await matchR.query(`
        SELECT ReconciliationID FROM dbo.reconciliation
        WHERE BankDepositID = @BdId AND RemittanceFileID = @RfId AND MatchFlag IN ('true','1')
      `);

      if (!existsRes.recordset.length) {
        await this.pool.request()
          .input('BdId',  sql.NVarChar(50),  bank_deposit_id)
          .input('RfId',  sql.NVarChar(50),  remittance_file_id)
          .input('Actor', sql.NVarChar(100), actor)
          .query(`
            INSERT INTO dbo.reconciliation (BankDepositID, RemittanceFileID, MatchFlag, MatchedBy, CreateDate)
            VALUES (@BdId, @RfId, 'true', @Actor, GETDATE())
          `);
      }

      // Mark suggestion accepted
      await this.pool.request()
        .input('Id',    sql.Int,           parseInt(id))
        .input('Actor', sql.NVarChar(100), actor)
        .query(`
          UPDATE dbo.MatchSuggestion
          SET status = 'accepted', reviewed_by = @Actor, reviewed_at = GETDATE()
          WHERE id = @Id
        `);

      res.json({ message: 'Accepted' });
    } catch (err: any) {
      logger.error('[AutoMatcher] acceptSuggestion error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/recon-iq/matching/suggestions/:id/reject */
  rejectSuggestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';

      await this.pool.request()
        .input('Id',    sql.Int,           parseInt(id))
        .input('Actor', sql.NVarChar(100), actor)
        .query(`
          UPDATE dbo.MatchSuggestion
          SET status = 'rejected', reviewed_by = @Actor, reviewed_at = GETDATE()
          WHERE id = @Id AND status = 'pending'
        `);

      res.json({ message: 'Rejected' });
    } catch (err: any) {
      logger.error('[AutoMatcher] rejectSuggestion error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/recon-iq/matching/auto-accept - bulk accept all above threshold */
  autoAccept = async (req: Request, res: Response): Promise<void> => {
    try {
      const { threshold = 80 } = req.body as { threshold?: number };
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';
      const xenCustId = extractCustomerId(req);
      const custSql = xenCustId != null ? 'AND customer_id = @CustId' : '';

      const r = this.pool.request();
      if (xenCustId != null) r.input('CustId',    sql.Int,          xenCustId);
      r.input('Threshold', sql.Decimal(5, 2), threshold);

      const pending = await r.query(`
        SELECT id, bank_deposit_id, remittance_file_id
        FROM dbo.MatchSuggestion
        WHERE status = 'pending' AND confidence_score >= @Threshold
          ${custSql}
      `);

      let accepted = 0;
      for (const row of pending.recordset) {
        const existsRes = await this.pool.request()
          .input('BdId', sql.NVarChar(50), row.bank_deposit_id)
          .input('RfId', sql.NVarChar(50), row.remittance_file_id)
          .query(`
            SELECT 1 FROM dbo.reconciliation
            WHERE BankDepositID = @BdId AND RemittanceFileID = @RfId AND MatchFlag IN ('true','1')
          `);

        if (!existsRes.recordset.length) {
          await this.pool.request()
            .input('BdId',  sql.NVarChar(50),  row.bank_deposit_id)
            .input('RfId',  sql.NVarChar(50),  row.remittance_file_id)
            .input('Actor', sql.NVarChar(100), actor)
            .query(`
              INSERT INTO dbo.reconciliation (BankDepositID, RemittanceFileID, MatchFlag, MatchedBy, CreateDate)
              VALUES (@BdId, @RfId, 'true', @Actor, GETDATE())
            `);
        }

        await this.pool.request()
          .input('Id',    sql.Int,           row.id)
          .input('Actor', sql.NVarChar(100), actor)
          .query(`
            UPDATE dbo.MatchSuggestion SET status = 'accepted', reviewed_by = @Actor, reviewed_at = GETDATE()
            WHERE id = @Id
          `);
        accepted++;
      }

      logger.info('[AutoMatcher] auto-accept', { accepted, threshold, actor });
      res.json({ accepted });
    } catch (err: any) {
      logger.error('[AutoMatcher] autoAccept error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
