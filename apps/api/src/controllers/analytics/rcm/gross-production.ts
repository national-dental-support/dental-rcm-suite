import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';
import chalk from 'chalk';

export class GrossProduction extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public async get(req: Request, res: Response): Promise<Response> {
    const { where: custWhere, bind: bindCust } = this.custFilter(req);
    const request = this.pool.request();
    bindCust(request);

    // Gross production (all claims) per month for the last 3 complete calendar months.
    // Uses MAX(ChargeAmt) per claim to avoid duplication across multi-row claims.
    const monthlyQuery = `
      SELECT
        FORMAT(DateOfService, 'yyyy-MM')  AS monthKey,
        FORMAT(DateOfService, 'MMM yyyy') AS monthLabel,
        SUM(claimCharge)                  AS grossProduction
      FROM (
        SELECT
          ClaimID,
          MAX(DateOfService)       AS DateOfService,
          MAX(ISNULL(ChargeAmt, 0)) AS claimCharge
        FROM dbo.recon_report
        WHERE DateOfService >= DATEADD(MONTH, -3, DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0))
          AND DateOfService <  DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0)
          ${custWhere}
        GROUP BY ClaimID
      ) x
      GROUP BY FORMAT(DateOfService, 'yyyy-MM'), FORMAT(DateOfService, 'MMM yyyy')
      ORDER BY monthKey ASC;
    `;

    try {
      logger.info(chalk.greenBright('GrossProduction; get; called (3-month)'));

      const result = await request.query(monthlyQuery);

      const months = result.recordset.map((r: any) => ({
        month: r.monthLabel as string,
        amount: Math.round(r.grossProduction ?? 0),
      }));

      let trend: 'up' | 'down' | 'flat' = 'flat';
      if (months.length >= 2) {
        const first = months[0].amount;
        const last  = months[months.length - 1].amount;
        if (last > first * 1.01)      trend = 'up';
        else if (last < first * 0.99) trend = 'down';
      }

      const latestAmount = months.length > 0 ? months[months.length - 1].amount : 0;

      return res.status(200).json({ months, trend, latestAmount });
    } catch (error: any) {
      logger.error('GrossProduction; Error:', error);
      return res.status(500).json({
        message: 'An error occurred while fetching gross production.',
      });
    }
  }
}

export const grossProduction = new GrossProduction();
