import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class ApplyMatch extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public post = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { bankDepositId, remittanceFileId } = req.body;

      if (!bankDepositId || !remittanceFileId) {
        return res.status(400).json({
          message: 'bankDepositId and remittanceFileId are required',
        });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) ?? 'system';

      logger.info('ApplyMatch.post \u2192 creating reconciliation record', {
        bankDepositId,
        remittanceFileId,
        actorEmail,
      });

      const pool = this.pool;

      // Enterprise isolation - verify the remittance file belongs to this customer
      const xenCustId = extractCustomerId(req);
      const custCheck = xenCustId != null
        ? `AND (rf.customer_id = @_custId OR EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec_cust JOIN dbo.claims c_cust ON c_cust.ClaimID = ec_cust.ClaimID WHERE ec_cust.RemittanceFileID = @RemittanceFileID AND c_cust.customer_id = @_custId))`
        : '';

      // Verify the BankDeposit exists and is not already matched
      const checkReq = pool.request();
      checkReq.input('BankDepositID', sql.VarChar(50), bankDepositId);
      checkReq.input('RemittanceFileID', sql.VarChar(50), remittanceFileId);
      if (xenCustId != null) checkReq.input('_custId', sql.Int, xenCustId);

      const checkResult = await checkReq.query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.BankDeposit WHERE BankDepositID = @BankDepositID) AS bdExists,
          (SELECT COUNT(*) FROM dbo.remittanceFile rf WHERE rf.RemittanceFileID = @RemittanceFileID ${custCheck}) AS rfExists,
          (SELECT COUNT(*) FROM dbo.reconciliation WHERE BankDepositID = @BankDepositID AND RemittanceFileID = @RemittanceFileID) AS alreadyMatched
      `);

      const check = checkResult.recordset[0];
      if (!check.bdExists) {
        return res.status(404).json({ message: `BankDeposit ${bankDepositId} not found` });
      }
      if (!check.rfExists) {
        return res.status(404).json({ message: `RemittanceFile ${remittanceFileId} not found` });
      }
      if (check.alreadyMatched) {
        return res.status(409).json({ message: 'These records are already matched' });
      }

      // Generate a new ReconciliationID + INSERT inside a transaction to avoid race conditions
      const txn = new sql.Transaction(pool);
      await txn.begin();
      let newId: string;
      try {
        const maxIdResult = await txn.request().query(`
          SELECT TOP 1 ReconciliationID FROM dbo.reconciliation WITH (UPDLOCK, HOLDLOCK) ORDER BY ReconciliationID DESC
        `);
        const lastId = maxIdResult.recordset[0]?.ReconciliationID ?? 'REC000000';
        const lastNum = parseInt(lastId.replace('REC', ''), 10) || 0;
        newId = `REC${String(lastNum + 1).padStart(6, '0')}`;

        const insertReq = txn.request();
        insertReq.input('ReconciliationID', sql.VarChar(50), newId);
        insertReq.input('RemittanceFileID', sql.VarChar(50), remittanceFileId);
        insertReq.input('BankDepositID', sql.VarChar(50), bankDepositId);
        insertReq.input('MatchedBy', sql.VarChar(100), actorEmail);

        await insertReq.query(`
          INSERT INTO dbo.reconciliation
            (ReconciliationID, RemittanceFileID, BankDepositID, MatchedBy, CreateDate, ModifiedDate, MatchFlag)
          VALUES
            (@ReconciliationID, @RemittanceFileID, @BankDepositID, @MatchedBy, GETDATE(), GETDATE(), 'true')
        `);

        await txn.commit();
      } catch (txnErr) {
        await txn.rollback();
        throw txnErr;
      }

      logger.info('ApplyMatch.post \u2192 match created successfully', {
        reconciliationId: newId,
        bankDepositId,
        remittanceFileId,
        actorEmail,
      });

      return res.status(201).json({
        message: 'Match created successfully',
        reconciliationId: newId,
        bankDepositId,
        remittanceFileId,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('ApplyMatch.post \u2013 error creating match: ' + msg);
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
