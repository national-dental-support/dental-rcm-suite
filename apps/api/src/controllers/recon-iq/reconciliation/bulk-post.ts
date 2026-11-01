import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class BulkPostController extends DatabaseConnectionController {
  constructor() { super(); }

  /** POST /api/recon-iq/reconciliation/bulk-post
   *  Body: { remittanceFileIds: string[] }
   */
  bulkPost = async (req: Request, res: Response): Promise<void> => {
    try {
      const { remittanceFileIds, bankAccountId } = req.body as { remittanceFileIds?: string[]; bankAccountId?: number };
      if (!Array.isArray(remittanceFileIds) || !remittanceFileIds.length) {
        res.status(400).json({ message: 'remittanceFileIds array is required' });
        return;
      }

      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';
      const xenCustId = extractCustomerId(req);

      // Ownership filter on remittanceFile - checks rf.customer_id first, then EOBERAClaim path
      const ownerSql = xenCustId != null
        ? `AND (rf.customer_id = @_custId OR EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec JOIN dbo.claims c ON c.ClaimID = ec.ClaimID WHERE ec.RemittanceFileID = rf.RemittanceFileID AND c.customer_id = @_custId))`
        : '';

      let posted = 0;
      const failed: string[] = [];
      const skipped: string[] = [];

      for (const rfId of remittanceFileIds) {
        try {
          // Verify RF exists and belongs to this customer
          if (xenCustId != null) {
            const ownerReq = this.pool.request();
            ownerReq.input('RemittanceFileID', sql.VarChar(50), rfId);
            ownerReq.input('_custId', sql.Int, xenCustId);
            const ownerRes = await ownerReq.query(`
              SELECT 1 FROM dbo.remittanceFile rf
              WHERE rf.RemittanceFileID = @RemittanceFileID ${ownerSql}
            `);
            if (!ownerRes.recordset.length) {
              logger.warn('[BulkPost] RF not found or unauthorized', { rfId, xenCustId });
              failed.push(rfId);
              continue;
            }
          }

          // Check post status (claimPostHistory has no customer_id - ownership already verified above)
          const existReq = this.pool.request();
          existReq.input('RemittanceFileID', sql.VarChar(50), rfId);
          const existing = await existReq.query(`
            SELECT PostedFlag FROM dbo.claimPostHistory
            WHERE RemittanceFileID = @RemittanceFileID
          `);

          if (!existing.recordset.length) {
            // No row yet - insert
            const insertReq = this.pool.request();
            insertReq.input('RemittanceFileID', sql.VarChar(50), rfId);
            insertReq.input('PostedBy', sql.NVarChar(100), actor);
            await insertReq.query(`
              INSERT INTO dbo.claimPostHistory (RemittanceFileID, PostedFlag, PostedBy, PostedDate)
              VALUES (@RemittanceFileID, '1', @PostedBy, GETDATE())
            `);

            if (bankAccountId != null) {
              try {
                const bankReq = this.pool.request();
                bankReq.input('RemittanceFileID', sql.VarChar(50), rfId);
                bankReq.input('BankAccountId', sql.Int, bankAccountId);
                await bankReq.query(`UPDATE dbo.claimPostHistory SET bank_account_id = @BankAccountId WHERE RemittanceFileID = @RemittanceFileID`);
              } catch { /* column may not exist yet */ }
            }

            // Auto-queue claims with a secondary payer into SecondaryBillingQueue
            try {
              const sbqReq = this.pool.request();
              sbqReq.input('RfId', sql.VarChar(50), rfId);
              if (xenCustId != null) sbqReq.input('CustId', sql.Int, xenCustId);
              await sbqReq.query(`
                INSERT INTO dbo.SecondaryBillingQueue
                  (claim_id, primary_remittance_file_id, secondary_payer_id,
                   primary_paid_amt, primary_adjustment_amt, patient_resp_amt,
                   secondary_bill_amt, status, customer_id)
                SELECT
                  c.ClaimID,
                  @RfId,
                  c.secondary_payer_id,
                  ISNULL(rl.PaidAmt, 0),
                  ISNULL(rl.AdjustmentAmt, 0),
                  ISNULL(rl.PatientRespAmt, 0),
                  ISNULL(c.ChargeAmt, 0) - ISNULL(rl.PaidAmt, 0) - ISNULL(rl.AdjustmentAmt, 0),
                  'pending',
                  ${xenCustId != null ? '@CustId' : 'ISNULL(c.customer_id, 1)'}
                FROM dbo.EOBERAClaim ec
                JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
                LEFT JOIN dbo.remittanceLine rl
                  ON rl.ClaimID = c.ClaimID
                  AND rl.era_remittance_file_id = @RfId
                WHERE ec.RemittanceFileID = @RfId
                  AND c.secondary_payer_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM dbo.SecondaryBillingQueue
                    WHERE claim_id = c.ClaimID
                      AND primary_remittance_file_id = @RfId
                  )
              `);
            } catch { /* SecondaryBillingQueue may not exist in older deployments */ }

            posted++;
          } else if (existing.recordset[0]?.PostedFlag === '1') {
            skipped.push(rfId);
          } else {
            // Row exists but not posted - update it
            const updateReq = this.pool.request();
            updateReq.input('RemittanceFileID', sql.VarChar(50), rfId);
            updateReq.input('PostedBy', sql.NVarChar(100), actor);
            await updateReq.query(`
              UPDATE dbo.claimPostHistory
              SET PostedFlag = '1', PostedBy = @PostedBy, PostedDate = GETDATE()
              WHERE RemittanceFileID = @RemittanceFileID
            `);

            if (bankAccountId != null) {
              try {
                const bankReq = this.pool.request();
                bankReq.input('RemittanceFileID', sql.VarChar(50), rfId);
                bankReq.input('BankAccountId', sql.Int, bankAccountId);
                await bankReq.query(`UPDATE dbo.claimPostHistory SET bank_account_id = @BankAccountId WHERE RemittanceFileID = @RemittanceFileID`);
              } catch { /* column may not exist yet */ }
            }
            posted++;
          }
        } catch (rowErr: any) {
          logger.error('[BulkPost] row error', { rfId, err: rowErr.message });
          failed.push(rfId);
        }
      }

      logger.info('[BulkPost] complete', { posted, failed: failed.length, skipped: skipped.length, actor });
      res.json({ posted, failed, skipped });
    } catch (err: any) {
      logger.error('[BulkPost] error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
