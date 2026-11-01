import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';
import chalk from 'chalk';

export class ClaimsCountByLocationGroup extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public async get(req: Request, res: Response): Promise<Response> {
    const _filters = req.body.filters || {};
    const request = this.pool.request();

    const query = `
      DECLARE @Today DATE = CAST(GETDATE() AS DATE);
      DECLARE @StartDate DATE = DATEADD(YEAR, -1, @Today);

      -- Claims count by location and group, aggregated by month
      SELECT
          Location,
          GroupKey,
          DATEFROMPARTS(YEAR(DateOfService), MONTH(DateOfService), 1) AS Month,
          COUNT(DISTINCT ClaimID) AS ClaimsCount
      FROM recon_report
      WHERE DateOfService BETWEEN @StartDate AND @Today
      GROUP BY Location, GroupKey, DATEFROMPARTS(YEAR(DateOfService), MONTH(DateOfService), 1)
      ORDER BY Location, GroupKey, Month;

      -- Claims count by location and group, aggregated by day
      SELECT
          Location,
          GroupKey,
          DateOfService AS Day,
          COUNT(DISTINCT ClaimID) AS ClaimsCount
      FROM recon_report
      WHERE DateOfService BETWEEN @StartDate AND @Today
      GROUP BY Location, GroupKey, DateOfService
      ORDER BY Location, GroupKey, Day;
    `;

    try {
      logger.info(chalk.greenBright('ClaimsCountByLocationGroup; get; called (recon_report)'));

      const result = await request.query(query);

      const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
      const monthlyData = recordsets[0] || [];
      const dailyData = recordsets[1] || [];

      return res.status(200).json({
        monthly: monthlyData,
        daily: dailyData,
      });
    } catch (error: any) {
      console.error('ClaimsCountByLocationGroup; RAW ERROR:', error);
      logger.error('ClaimsCountByLocationGroup; Error:', error);

      return res.status(500).json({
        message: 'An error occurred while fetching claims count by location and group.',
      });
    }
  }
}

export const claimsCountByLocationGroup = new ClaimsCountByLocationGroup();