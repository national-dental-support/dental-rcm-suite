import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class UnmatchController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/recon-iq/matching/reconciliation/:id - single match record */
  getOne = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const xenCustId = extractCustomerId(req);
      const custSql = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec JOIN dbo.claims c ON c.ClaimID = ec.ClaimID WHERE ec.RemittanceFileID = r.RemittanceFileID AND c.customer_id = @_custId)`
        : '';

      const req2 = this.pool.request().input('Id', sql.VarChar(50), id);
      if (xenCustId != null) req2.input('_custId', sql.Int, xenCustId);

      const result = await req2.query(`
        SELECT r.ReconciliationID, r.RemittanceFileID, r.BankDepositID,
               r.MatchFlag, r.MatchedBy, r.CreateDate,
               rf.FileDate, rf.Amount, rf.PracticeLocation,
               ISNULL(bd.deposit_amount, bd.DepositAmount) AS DepositAmount,
               ISNULL(bd.deposit_date,   bd.DepositDate)   AS DepositDate
        FROM dbo.reconciliation r
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.bankDeposit bd ON bd.bank_reference = r.BankDepositID
                                     OR bd.BankDepositID  = r.BankDepositID
        WHERE r.ReconciliationID = @Id AND r.MatchFlag = 'true'
          ${custSql}
      `);

      if (!result.recordset.length) {
        res.status(404).json({ message: 'Reconciliation record not found' });
        return;
      }
      const row = result.recordset[0];
      res.json({
        reconciliationId:  row.ReconciliationID,
        remittanceFileId:  row.RemittanceFileID,
        bankDepositId:     row.BankDepositID,
        matchedBy:         row.MatchedBy,
        matchedDate:       row.CreateDate,
        fileDate:          row.FileDate,
        amount:            row.Amount,
        location:          row.PracticeLocation,
        depositAmount:     row.DepositAmount,
        depositDate:       row.DepositDate,
      });
    } catch (err: any) {
      logger.error('[Unmatch] getOne error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/recon-iq/matching/matched-pairs - paginated list of matched pairs */
  getMatchedPairs = async (req: Request, res: Response): Promise<void> => {
    try {
      const page     = Math.max(parseInt(String(req.query.page))     || 1, 1);
      const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 20, 50);
      const offset   = (page - 1) * pageSize;
      const xenCustId = extractCustomerId(req);
      const custSql = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec JOIN dbo.claims c ON c.ClaimID = ec.ClaimID WHERE ec.RemittanceFileID = r.RemittanceFileID AND c.customer_id = @_custId)`
        : '';

      const r = this.pool.request();
      if (xenCustId != null) r.input('_custId', sql.Int, xenCustId);
      r.input('Offset',   sql.Int, offset);
      r.input('PageSize', sql.Int, pageSize);

      const result = await r.query(`
        SELECT
          r.ReconciliationID,
          r.RemittanceFileID,
          r.BankDepositID,
          r.MatchedBy,
          r.CreateDate AS matchedDate,
          FORMAT(rf.FileDate, 'yyyy-MM-dd') AS fileDate,
          rf.Amount    AS eobAmount,
          ISNULL(bd.deposit_amount, bd.DepositAmount)                    AS depositAmount,
          FORMAT(ISNULL(bd.deposit_date, bd.DepositDate), 'yyyy-MM-dd') AS depositDate,
          rf.PracticeLocation AS location
        FROM dbo.reconciliation r
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.bankDeposit bd ON bd.bank_reference = r.BankDepositID
                                     OR bd.BankDepositID  = r.BankDepositID
        WHERE r.MatchFlag = 'true'
          ${custSql}
        ORDER BY r.CreateDate DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);

      const rows = result.recordset.map((row: any) => ({
        reconciliationId: row.ReconciliationID,
        remittanceFileId: row.RemittanceFileID,
        bankDepositId:    row.BankDepositID,
        matchedBy:        row.MatchedBy ?? '',
        matchedDate:      row.matchedDate,
        fileDate:         row.fileDate,
        eobAmount:        Math.round(Math.abs(row.eobAmount ?? 0)),
        depositAmount:    Math.round(Math.abs(row.depositAmount ?? 0)),
        depositDate:      row.depositDate,
        location:         row.location ?? '',
      }));

      res.json({ rows });
    } catch (err: any) {
      logger.error('[Unmatch] getMatchedPairs error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/recon-iq/matching/reconciliation/:id - unmatch (Manager only) */
  unmatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';
      const xenCustId = extractCustomerId(req);

      const custSql = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec JOIN dbo.claims c ON c.ClaimID = ec.ClaimID WHERE ec.RemittanceFileID = r.RemittanceFileID AND c.customer_id = @_custId)`
        : '';

      // Verify it exists and is matched
      const checkReq = this.pool.request().input('Id', sql.VarChar(50), id);
      if (xenCustId != null) checkReq.input('_custId', sql.Int, xenCustId);

      const check = await checkReq.query(`
        SELECT r.ReconciliationID, r.RemittanceFileID, r.BankDepositID
        FROM dbo.reconciliation r
        WHERE r.ReconciliationID = @Id AND r.MatchFlag = 'true'
          ${custSql}
      `);

      if (!check.recordset.length) {
        res.status(404).json({ message: 'Matched reconciliation record not found' });
        return;
      }

      const updateReq = this.pool.request();
      updateReq.input('Id',           sql.VarChar(50),  id);
      updateReq.input('UnmatchedBy',  sql.NVarChar(100), actor);
      updateReq.input('UnmatchReason', sql.NVarChar(500), reason ?? '');

      await updateReq.query(`
        UPDATE dbo.reconciliation
        SET MatchFlag      = '0',
            UnmatchedBy    = @UnmatchedBy,
            UnmatchedDate  = CAST(GETDATE() AS DATE),
            UnmatchReason  = @UnmatchReason,
            ModifiedDate   = GETDATE()
        WHERE ReconciliationID = @Id
      `);

      const { RemittanceFileID, BankDepositID } = check.recordset[0];
      logger.info('[Unmatch] record unmatched', { id, actor, reason });
      res.json({ message: 'Unmatched successfully', remittanceFileId: RemittanceFileID, bankDepositId: BankDepositID });
    } catch (err: any) {
      logger.error('[Unmatch] unmatch error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
