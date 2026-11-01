import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class UpdateRule extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public put = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ruleId = req.params.id;
      if (!ruleId) {
        return res.status(400).json({ message: 'Rule ID is required' });
      }

      const {
        name,
        category,
        description,
        matchType,
        conditions,
        actions,
        scope,
        scopeValues,
        activeFlag,
        expirationDate,
        modifiedBy = 'Unknown',
      } = req.body;

      const custId: number = (req as any).actor?.customer_id ?? 0;

      const txn = new sql.Transaction(this.pool);
      await txn.begin();
      try {
        const request = txn.request();
        request.input('ruleId', ruleId);
        request.input('name', name || null);
        request.input('category', category || null);
        request.input('description', description || null);
        request.input('matchType', matchType || 'any');
        request.input('conditions', typeof conditions === 'string' ? conditions : JSON.stringify(conditions || []));
        request.input('actions', typeof actions === 'string' ? actions : JSON.stringify(actions || []));
        request.input('scope', scope || 'enterprise');
        request.input('scopeValues', typeof scopeValues === 'string' ? scopeValues : JSON.stringify(scopeValues || []));
        request.input('activeFlag', activeFlag != null ? (activeFlag ? 1 : 0) : 1);
        request.input('expirationDate', expirationDate || null);

        let tenantClause = '';
        if (custId != null) {
          request.input('custId', sql.Int, custId);
          tenantClause = ' AND (customer_id = @custId OR customer_id IS NULL)';
        }

        await request.query(`
          UPDATE dbo.rules
          SET RuleName        = @name,
              Category        = @category,
              Description     = @description,
              MatchType       = @matchType,
              Conditions      = @conditions,
              Actions         = @actions,
              Scope           = @scope,
              ScopeValues     = @scopeValues,
              ActiveFlag      = @activeFlag,
              ExpirationDate  = @expirationDate
          WHERE RuleID = @ruleId${tenantClause}
        `);

        // Insert history record (same transaction)
        const histReq = txn.request();
        histReq.input('ruleId', ruleId);
        histReq.input('modifiedBy', modifiedBy);
        await histReq.query(`
          INSERT INTO dbo.ruleshistory (RuleID, ModifiedDate, ModifiedBy)
          VALUES (@ruleId, GETDATE(), @modifiedBy)
        `);

        await txn.commit();
      } catch (txnErr) {
        await txn.rollback();
        throw txnErr;
      }

      return res.status(200).json({
        message: 'Rule updated',
        data: { ruleId },
      });
    } catch (error: unknown) {
      logger.error('UpdateRule.put \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
