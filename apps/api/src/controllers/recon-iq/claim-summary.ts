import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class ReconIqClaimSummaryController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/recon-iq/claim-summary/:claimId
   * Returns lightweight reconciliation data for a single claim.
   * Used by the ReconIQ enrichment panel in DenialIQ claim detail.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    const { claimId } = req.params;

    try {
      const pool = this.pool;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = eoa.ClaimID AND c_cust.customer_id = @_custId)`
        : '';

      const csReq = pool.request();
      csReq.input('claimId', claimId);
      if (xenCustId != null) csReq.input('_custId', sql.Int, xenCustId);

      const result = await csReq.query(`
          SELECT TOP 1
            eoa.ClaimID              AS claimId,
            rf.RemittanceFileID      AS eobId,
            rf.FileDate              AS eobDate,
            rf.Amount                AS eobAmount,
            rf.FileType              AS eobType,
            CASE
              WHEN cp.PostedFlag = 1 THEN 'Posted'
              WHEN r.MatchFlag   = 1 THEN 'Matched - Unposted'
              ELSE 'Unmatched'
            END                      AS reconciliationStatus,
            bd.DepositDate           AS matchedPaymentDate,
            bd.DepositAmount         AS matchedPaymentAmount
          FROM dbo.EOBERAClaim eoa
          JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = eoa.RemittanceFileID
          LEFT JOIN dbo.reconciliation r   ON r.RemittanceFileID = rf.RemittanceFileID
          LEFT JOIN dbo.bankDeposit bd      ON bd.BankDepositID = r.BankDepositID
          LEFT JOIN dbo.claimPostHistory cp ON cp.RemittanceFileID = rf.RemittanceFileID
          WHERE eoa.ClaimID = @claimId
            ${custFilter}
          ORDER BY rf.FileDate DESC
        `);

      if (!result.recordset.length) {
        return res.json({ matched: false });
      }

      const row = result.recordset[0];
      return res.json({
        matched: true,
        eobId:                 row.eobId,
        eobDate:               row.eobDate,
        eobType:               row.eobType,
        matchedPaymentAmount:  row.matchedPaymentAmount,
        matchedPaymentDate:    row.matchedPaymentDate,
        reconciliationStatus:  row.reconciliationStatus,
      });
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
