import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class CreateRule extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public post = async (req: Request, res: Response): Promise<Response> => {
    try {
      const {
        name,
        category,
        description,
        ruleType = 'Custom',
        matchType = 'any',
        conditions = '[]',
        actions = '[]',
        scope = 'enterprise',
        scopeValues = '[]',
        activeFlag = 1,
        expirationDate = null,
        createdBy = 'Unknown',
      } = req.body;

      if (!name) {
        return res.status(400).json({ message: 'Rule name is required' });
      }

      const custId: number = (req as any).actor?.customer_id ?? 0;

      const txn = new sql.Transaction(this.pool);
      await txn.begin();

      try {
      const request = txn.request();

      // Generate next RuleID in R#### format (within transaction to prevent race)
      const maxIdResult = await request.query(`
        SELECT TOP 1 RuleID
        FROM dbo.rules WITH (UPDLOCK, HOLDLOCK)
        WHERE RuleID LIKE 'R%'
        ORDER BY RuleID DESC
      `);

      let nextNum = 1;
      if (maxIdResult.recordset.length > 0) {
        const lastId = maxIdResult.recordset[0].RuleID as string;
        const numPart = parseInt(lastId.replace('R', ''), 10);
        if (!isNaN(numPart)) nextNum = numPart + 1;
      }
      const newRuleId = `R${String(nextNum).padStart(4, '0')}`;

      const insertReq = txn.request();
      insertReq.input('ruleId', newRuleId);
      insertReq.input('name', name);
      insertReq.input('category', category || null);
      insertReq.input('description', description || null);
      insertReq.input('ruleType', ruleType);
      insertReq.input('matchType', matchType);
      insertReq.input('conditions', typeof conditions === 'string' ? conditions : JSON.stringify(conditions));
      insertReq.input('actions', typeof actions === 'string' ? actions : JSON.stringify(actions));
      insertReq.input('scope', scope);
      insertReq.input('scopeValues', typeof scopeValues === 'string' ? scopeValues : JSON.stringify(scopeValues));
      insertReq.input('activeFlag', activeFlag ? 1 : 0);
      insertReq.input('expirationDate', expirationDate || null);
      insertReq.input('createdBy', createdBy);
      insertReq.input('custId', sql.Int, custId);

      await insertReq.query(`
        INSERT INTO dbo.rules
          (RuleID, RuleName, Category, Description, RuleType, MatchType,
           Conditions, Actions, Scope, ScopeValues, ActiveFlag, ExpirationDate,
           CreatedBy, CreateDate, customer_id)
        VALUES
          (@ruleId, @name, @category, @description, @ruleType, @matchType,
           @conditions, @actions, @scope, @scopeValues, @activeFlag, @expirationDate,
           @createdBy, GETDATE(), @custId)
      `);

      await txn.commit();
      return res.status(201).json({
        message: 'Rule created',
        data: { ruleId: newRuleId },
      });
      } catch (txnErr) {
        await txn.rollback();
        throw txnErr;
      }
    } catch (error: unknown) {
      logger.error('CreateRule.post \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
