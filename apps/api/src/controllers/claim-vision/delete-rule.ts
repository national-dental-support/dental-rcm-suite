import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class DeleteRule extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public delete = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ message: 'Rule ID is required' });
      }

      const custId: number = (req as any).actor?.customer_id ?? 0;

      const deleteReq = this.pool.request().input('ruleId', sql.NVarChar(50), id);

      let tenantClause = '';
      if (custId != null) {
        deleteReq.input('custId', sql.Int, custId);
        tenantClause = ' AND (customer_id = @custId OR customer_id IS NULL)';
      }

      const result = await deleteReq.query(
        `DELETE FROM dbo.rules WHERE RuleID = @ruleId${tenantClause}`,
      );

      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ message: 'Rule not found' });
      }

      await this.pool.request()
        .input('ruleId', sql.NVarChar(50), id)
        .query(`DELETE FROM dbo.ruleshistory WHERE RuleID = @ruleId`);

      return res.status(200).json({ message: 'Rule deleted', data: { ruleId: id } });
    } catch (error: unknown) {
      logger.error('DeleteRule.delete \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
