import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';
import chalk from 'chalk';

export class ClaimsCount extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public async get(req: Request, res: Response): Promise<Response> {
    const { where: custWhere, bind: bindCust } = this.custFilter(req);
    const request = this.pool.request();
    bindCust(request);

    // Closed claims (Accepted) per month for the last 3 complete calendar months.
    const monthlyQuery = `
      SELECT
        FORMAT(DateOfService, 'yyyy-MM')  AS monthKey,
        FORMAT(DateOfService, 'MMM yyyy') AS monthLabel,
        COUNT(DISTINCT ClaimID)           AS claimCnt
      FROM dbo.recon_report
      WHERE ClaimStatus = 'Accepted'
        AND DateOfService >= DATEADD(MONTH, -3, DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0))
        AND DateOfService <  DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0)
        ${custWhere}
      GROUP BY FORMAT(DateOfService, 'yyyy-MM'), FORMAT(DateOfService, 'MMM yyyy')
      ORDER BY monthKey ASC;
    `;

    try {
      logger.info(chalk.greenBright('ClaimsCount; get; called (closed claims 3-month)'));

      const result = await request.query(monthlyQuery);

      const months = result.recordset.map((r: any) => ({
        month: r.monthLabel as string,
        count: r.claimCnt as number,
      }));

      let trend: 'up' | 'down' | 'flat' = 'flat';
      if (months.length >= 2) {
        const first = months[0].count;
        const last  = months[months.length - 1].count;
        if (last > first)      trend = 'up';
        else if (last < first) trend = 'down';
      }

      const latestCount = months.length > 0 ? months[months.length - 1].count : 0;

      return res.status(200).json({ months, trend, latestCount });
    } catch (error: any) {
      logger.error('ClaimsCount; Error:', error);
      return res.status(500).json({
        message: 'An error occurred while fetching claims count.',
      });
    }
  }
}

export const claimsCount = new ClaimsCount();
