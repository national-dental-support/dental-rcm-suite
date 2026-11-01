// src/controllers/analytics/rcm/claim-amounts-by-practice.ts
import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../database-connection-controller';

export interface ClaimAmountsByPracticeRow {
  Practice: string;
  TotalClaimAmount: number;
}

export class ClaimAmountsByPractice extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public async get(req: Request, res: Response): Promise<Response> {
    try {
      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
      const request = this.pool.request();
      bindCust(request);
      bindBody(request);

      const query = `
        DECLARE @EndDate DATE = CAST(GETDATE() AS DATE);
        DECLARE @StartDate DATE = DATEADD(YEAR, -1, @EndDate);

        SELECT TOP 5
            ISNULL(Operations, 'Unknown') AS Practice,
            SUM(TrxAmt) AS TotalClaimAmount
        FROM recon_report
        WHERE TrxType = 'Charge'
          AND DateOfService BETWEEN @StartDate AND @EndDate
          ${custWhere} ${bodyWhere}
        GROUP BY Operations
        ORDER BY TotalClaimAmount DESC;
      `;

      const { recordset } = await request.query<ClaimAmountsByPracticeRow>(query);
      return res.status(200).json(recordset ?? []);
    } catch (error) {
      console.error('[RCM] claim-amounts-by-practice error', error);
      return res
        .status(500)
        .json({ message: 'Failed to fetch Claim Amounts by Practice' });
    }
  }
}