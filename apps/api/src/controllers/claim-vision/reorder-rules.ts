import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class ReorderRules extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public patch = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId: number = (req as any).actor?.customer_id ?? 0;

      const items: { ruleId: string; executionOrder: number }[] = req.body?.items;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'items array is required' });
      }

      for (const item of items) {
        const request = this.pool.request();
        request.input('ruleId', sql.VarChar(50), item.ruleId);
        request.input('executionOrder', sql.Int, item.executionOrder);

        let where = 'WHERE RuleID = @ruleId';
        if (custId) {
          request.input('custId', sql.Int, custId);
          where += ' AND (customer_id = @custId OR customer_id IS NULL)';
        }

        await request.query(
          `UPDATE dbo.rules SET ExecutionOrder = @executionOrder ${where}`
        );
      }

      return res.status(200).json({ message: 'Execution order updated', updated: items.length });
    } catch (error: unknown) {
      logger.error('ReorderRules.patch \u2013 error updating execution order', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
