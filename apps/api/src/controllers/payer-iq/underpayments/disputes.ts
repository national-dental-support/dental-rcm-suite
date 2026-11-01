import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';

export class UnderpaymentDisputesController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /payer-iq/underpayments/:claimNumber/dispute */
  get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimNumber } = req.params;
      const actor = (req as any).actor;
      const custId: number = actor?.customer_id ?? 0;

      const r = this.pool.request();
      r.input('ClaimNumber', sql.NVarChar(100), claimNumber);
      r.input('CustId', sql.Int, custId);
      const result = await r.query(`
        SELECT id, claim_number, cpt_code, payer_name, status, notes, created_by, created_at, updated_at
        FROM dbo.underpayment_disputes
        WHERE claim_number = @ClaimNumber AND customer_id = @CustId
        ORDER BY created_at DESC
      `);
      return res.json({ data: result.recordset });
    } catch (err) {
      logger.error('[UnderpaymentDisputes] get error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /payer-iq/underpayments/:claimNumber/dispute */
  create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimNumber } = req.params;
      const { cptCode, payerName, notes } = req.body;
      const actor = (req as any).actor;
      const custId: number = actor?.customer_id ?? 0;
      const createdBy: string = req.headers['x-actor-email'] as string || 'unknown';

      const r = this.pool.request();
      r.input('ClaimNumber', sql.NVarChar(100), claimNumber);
      r.input('CptCode',     sql.NVarChar(50),  cptCode ?? null);
      r.input('PayerName',   sql.NVarChar(200), payerName ?? null);
      r.input('CustId',      sql.Int,           custId);
      r.input('CreatedBy',   sql.NVarChar(200), createdBy);
      r.input('Notes',       sql.NVarChar(sql.MAX), notes ?? null);

      const result = await r.query(`
        INSERT INTO dbo.underpayment_disputes
          (claim_number, cpt_code, payer_name, customer_id, created_by, status, notes)
        OUTPUT INSERTED.id
        VALUES (@ClaimNumber, @CptCode, @PayerName, @CustId, @CreatedBy, 'open', @Notes)
      `);
      return res.status(201).json({ id: result.recordset[0].id, status: 'open' });
    } catch (err) {
      logger.error('[UnderpaymentDisputes] create error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PATCH /payer-iq/underpayments/:claimNumber/dispute/:id */
  update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const actor = (req as any).actor;
      const custId: number = actor?.customer_id ?? 0;

      const r = this.pool.request();
      r.input('Id',     sql.Int,            parseInt(id, 10));
      r.input('CustId', sql.Int,            custId);
      r.input('Status', sql.NVarChar(50),   status ?? null);
      r.input('Notes',  sql.NVarChar(sql.MAX), notes ?? null);

      await r.query(`
        UPDATE dbo.underpayment_disputes
        SET status     = COALESCE(@Status, status),
            notes      = COALESCE(@Notes, notes),
            updated_at = GETUTCDATE()
        WHERE id = @Id AND customer_id = @CustId
      `);
      return res.json({ message: 'Updated' });
    } catch (err) {
      logger.error('[UnderpaymentDisputes] update error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /payer-iq/underpayments/:claimNumber/review */
  review = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimNumber } = req.params;
      const { cptCode } = req.body;
      const actor = (req as any).actor;
      const custId: number = actor?.customer_id ?? 0;
      const reviewedBy: string = req.headers['x-actor-email'] as string || 'unknown';

      const r = this.pool.request();
      r.input('ClaimNumber', sql.NVarChar(100), claimNumber);
      r.input('CptCode',     sql.NVarChar(50),  cptCode ?? null);
      r.input('CustId',      sql.Int,           custId);
      r.input('ReviewedBy',  sql.NVarChar(200), reviewedBy);

      await r.query(`
        MERGE dbo.underpayment_reviews AS t
        USING (SELECT @ClaimNumber AS cn, @CptCode AS cc, @CustId AS cid) AS s
          ON t.claim_number = s.cn AND ISNULL(t.cpt_code,'') = ISNULL(s.cc,'') AND t.customer_id = s.cid
        WHEN MATCHED THEN
          UPDATE SET reviewed_by = @ReviewedBy, reviewed_at = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (claim_number, cpt_code, customer_id, reviewed_by) VALUES (@ClaimNumber, @CptCode, @CustId, @ReviewedBy);
      `);
      return res.json({ reviewed: true });
    } catch (err) {
      logger.error('[UnderpaymentDisputes] review error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
