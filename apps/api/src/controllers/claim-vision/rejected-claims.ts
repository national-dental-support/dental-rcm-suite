import { Request, Response } from 'express';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import sql from 'mssql';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class ClaimVision extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 25));
      const offset = (page - 1) * pageSize;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND rc.customer_id = @_custId`
        : '';

      const request = this.pool.request();
      request.input('offset', sql.Int, offset);
      request.input('pageSize', sql.Int, pageSize);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const query = `
      SELECT
          CAST(DATEADD(day, 1 - DATEPART(weekday, DATEADD(day, @@DATEFIRST - 1, rc.CreateDate)),
               CAST(rc.CreateDate AS date)) AS DATE) AS batchWeekStart,
          COUNT(DISTINCT rc.ClaimID) AS rejectedClaimsCount,
          r.RuleName AS ruleName,
          r.Category AS category,
          r.Description AS rejectionMessage,
          r.RuleType AS ruleType,
          rc.RuleID AS ruleId,
          COUNT(*) OVER() AS totalCount
      FROM dbo.rejectedclaims rc
      JOIN dbo.rules r ON r.RuleID = rc.RuleID
      WHERE 1=1
        ${custFilter}
      GROUP BY
          CAST(DATEADD(day, 1 - DATEPART(weekday, DATEADD(day, @@DATEFIRST - 1, rc.CreateDate)),
               CAST(rc.CreateDate AS date)) AS DATE),
          r.RuleName, r.Category, r.Description, r.RuleType, rc.RuleID
      ORDER BY batchWeekStart DESC, rejectedClaimsCount DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
      `;
      const result = await request.query(query);

      /* istanbul ignore next */
      const totalCount = result.recordset.length > 0 ? result.recordset[0].totalCount : 0;
      /* istanbul ignore next */
      const claimData = result.recordset || [];

      return res.status(200).json({
        message: 'Claim information data',
        data: claimData,
        total: totalCount,
        page,
        pageSize,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      });
    } catch (error: unknown) {
      logger.error('ClaimInformation.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /**
   * GET /api/claim-vision/rejected-claims-trend
   * Returns month-over-month rejection counts for the last 12 months
   */
  public getTrend = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND rc.customer_id = @_custId`
        : '';

      const request = this.pool.request();
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const query = `
      SELECT
          FORMAT(rc.CreateDate, 'yyyy-MM') AS month,
          COUNT(DISTINCT rc.ClaimID) AS rejectedCount,
          COUNT(DISTINCT rc.RuleID) AS rulesTriggered
      FROM dbo.rejectedclaims rc
      WHERE rc.CreateDate >= DATEADD(MONTH, -12, GETDATE())
        ${custFilter}
      GROUP BY FORMAT(rc.CreateDate, 'yyyy-MM')
      ORDER BY month ASC;
      `;

      const result = await request.query(query);
      /* istanbul ignore next */
      const trendData = result.recordset || [];

      return res.status(200).json({
        message: 'Rejected claims trend data',
        data: trendData,
      });
    } catch (error: unknown) {
      logger.error('ClaimVision.getTrend \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
