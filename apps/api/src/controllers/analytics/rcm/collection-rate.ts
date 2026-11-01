// src/controllers/analytics/rcm/collection-rate.ts
import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';
import chalk from 'chalk';

export class CollectionRate extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public async get(req: Request, res: Response): Promise<Response> {
    const { where: custWhere, bind: bindCust } = this.custFilter(req);
    const request = this.pool.request();
    bindCust(request);

    // Adjusted Collection Rate (ACR) for Accepted (closed) claims.
    // Formula: Payments / (Payments + Writeoffs + Outstanding Balance)
    // This is the industry-standard measure for fully adjudicated claims -
    // it answers "of collectible revenue, what % did we actually receive?"
    const monthlyQuery = `
      SELECT
        FORMAT(DateOfService, 'yyyy-MM')  AS monthKey,
        FORMAT(DateOfService, 'MMM yyyy') AS monthLabel,
        SUM(payments)   AS payments,
        SUM(writeoffs)  AS writeoffs,
        SUM(balance)    AS outstanding
      FROM (
        SELECT
          ClaimID,
          MAX(DateOfService) AS DateOfService,
          SUM(CASE WHEN TrxType = 'Payment'  THEN TrxAmt        ELSE 0 END) AS payments,
          SUM(CASE WHEN TrxType = 'Writeoff' THEN ABS(TrxAmt)   ELSE 0 END) AS writeoffs,
          MAX(ISNULL(ClaimBalanceDue, 0))                                    AS balance
        FROM dbo.recon_report
        WHERE ClaimStatus = 'Accepted'
          AND DateOfService >= DATEADD(MONTH, -3, DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0))
          AND DateOfService <  DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0)
          ${custWhere}
        GROUP BY ClaimID
      ) x
      GROUP BY FORMAT(DateOfService, 'yyyy-MM'), FORMAT(DateOfService, 'MMM yyyy')
      ORDER BY monthKey ASC;
    `;

    try {
      logger.info(chalk.greenBright('CollectionRate; get; called (Closed Claim ACR)'));

      const result = await request.query(monthlyQuery);

      const months = result.recordset.map((r: any) => {
        const denom = (r.payments ?? 0) + (r.writeoffs ?? 0) + (r.outstanding ?? 0);
        const rate = denom > 0 ? Math.round(((r.payments / denom) * 100) * 100) / 100 : null;
        return { month: r.monthLabel as string, rate };
      });

      let trend: 'up' | 'down' | 'flat' = 'flat';
      if (months.length >= 2) {
        const first = months[0].rate ?? 0;
        const last  = months[months.length - 1].rate ?? 0;
        if (last > first + 0.1)      trend = 'up';
        else if (last < first - 0.1) trend = 'down';
      }

      const latestRate = months.length > 0 ? months[months.length - 1].rate : null;

      return res.status(200).json({ months, trend, latestRate });
    } catch (error: any) {
      logger.error('CollectionRate; Error:', error);
      return res.status(500).json({
        message: 'An error occurred while calculating collection rate.',
      });
    }
  }
}

export const collectionRate = new CollectionRate();
