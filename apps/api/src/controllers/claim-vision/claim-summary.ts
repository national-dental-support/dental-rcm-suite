import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class ClaimVisionClaimSummaryController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/claim-vision/claim-summary/:claimId
   * Returns rejection rule data for a single claim.
   * Used by the ClaimVision enrichment panel in DenialIQ claim detail.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    const { claimId } = req.params;

    try {
      const pool = this.pool;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND rc.customer_id = @_custId`
        : '';

      const csReq = pool.request();
      csReq.input('claimId', claimId);
      if (xenCustId != null) csReq.input('_custId', sql.Int, xenCustId);

      const result = await csReq.query(`
          SELECT
            rc.RejectedClaimID  AS rejectedClaimId,
            rc.ClaimID          AS claimId,
            rc.CreateDate       AS rejectedDate,
            r.RuleID            AS ruleId,
            r.RuleName          AS ruleName,
            r.Description       AS description,
            r.Category          AS category,
            r.CreatedBy         AS createdBy
          FROM dbo.rejectedclaims rc
          JOIN dbo.rules r ON r.RuleID = rc.RuleID
          WHERE rc.ClaimID = @claimId
            ${custFilter}
          ORDER BY rc.CreateDate DESC
        `);

      return res.json({
        rejected: result.recordset.length > 0,
        rules: result.recordset,
      });
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
