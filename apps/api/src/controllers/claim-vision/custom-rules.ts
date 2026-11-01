import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class CustomRules extends DatabaseConnectionController {
  constructor() {
    super();
  }
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId: number = (req as any).actor?.customer_id ?? 0;
      const request = this.pool.request();
      if (custId) request.input('custId', sql.Int, custId);

      const query = `
      WITH claims_impacted AS (
          SELECT
              rc.RuleID,
              COUNT(DISTINCT rc.ClaimID) AS ClaimsImpacted
          FROM dbo.rejectedclaims rc
          ${custId ? 'WHERE rc.customer_id = @custId' : ''}
          GROUP BY rc.RuleID
      ),
      latest_history AS (
          SELECT
              rh.RuleID,
              rh.ModifiedDate,
              rh.ModifiedBy,
              ROW_NUMBER() OVER (
                  PARTITION BY rh.RuleID
                  ORDER BY rh.ModifiedDate DESC, rh.RulesHistoryID DESC
              ) AS rn
          FROM dbo.ruleshistory rh
      )
      SELECT
          r.RuleName                     AS [Rule name],
          r.Category                     AS [Category],
          r.Description                  AS [Description],
          r.ExpirationDate               AS [Expires],

          r.CreateDate                   AS [Created Date],
          r.CreatedBy                    AS [Created By],

          lh.ModifiedDate                AS [Modified Date],
          lh.ModifiedBy                  AS [Modified By],

          CASE WHEN r.ActiveFlag = 1 THEN 'Active' ELSE 'Inactive' END AS [Activation status],

          COALESCE(ci.ClaimsImpacted, 0) AS [Claims impacted],

          r.RuleID                       AS [RuleID],

          COALESCE(r.MatchType, 'any')   AS [MatchType],
          COALESCE(r.Conditions, '[]')   AS [Conditions],
          COALESCE(r.Actions, '[]')      AS [Actions],
          COALESCE(r.Scope, 'enterprise') AS [Scope],
          COALESCE(r.ScopeValues, '[]')  AS [ScopeValues],
          r.ExecutionOrder               AS [ExecutionOrder]
      FROM dbo.rules r
      LEFT JOIN latest_history lh
          ON lh.RuleID = r.RuleID
         AND lh.rn = 1
      LEFT JOIN claims_impacted ci
          ON ci.RuleID = r.RuleID
      WHERE
          r.RuleType = 'Custom'
          ${custId ? 'AND (r.customer_id = @custId OR r.customer_id IS NULL)' : ''}
      ORDER BY
          r.ExecutionOrder ASC,
          r.RuleName;
      `;

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Custom rules',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('CustomRules.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
