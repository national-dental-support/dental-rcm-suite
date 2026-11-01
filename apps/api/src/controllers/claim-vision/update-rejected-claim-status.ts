import { Request, Response } from 'express';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import sql from 'mssql';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class UpdateRejectedClaimStatus extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public patch = async (req: Request, res: Response): Promise<Response> => {
    try {
      const rejectedClaimId = req.params.id;
      const { status } = req.body;

      if (!rejectedClaimId) {
        return res.status(400).json({ message: 'Missing rejectedClaimId parameter' });
      }

      const validStatuses = ['Not complete', 'Completed'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust JOIN dbo.rejectedclaims rc_cust ON rc_cust.ClaimID = c_cust.ClaimID WHERE rc_cust.RejectedClaimID = @rejectedClaimId AND c_cust.customer_id = @_custId)`
        : '';

      const request = this.pool.request();
      request.input('rejectedClaimId', sql.NVarChar(50), rejectedClaimId);
      request.input('status', sql.NVarChar(20), status);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const completedDate = status === 'Completed' ? new Date() : null;
      request.input('completedDate', sql.DateTime2, completedDate);

      const userEmail = req.headers['x-actor-email'] as string || 'unknown';
      const completedBy = status === 'Completed' ? userEmail : null;
      request.input('completedBy', sql.NVarChar(200), completedBy);

      await request.query(`
        UPDATE dbo.rejectedclaims
        SET Status = @status,
            CompletedDate = @completedDate,
            CompletedBy = @completedBy
        WHERE RejectedClaimID = @rejectedClaimId
          ${custFilter}
      `);

      return res.status(200).json({
        message: 'Status updated',
        data: { rejectedClaimId, status },
      });
    } catch (error: unknown) {
      logger.error('UpdateRejectedClaimStatus.patch \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
