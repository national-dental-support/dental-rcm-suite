// src/controllers/analytics/rcm/claim-value-by-status.ts
import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';

export interface ClaimValueByStatusRow {
  ClaimStatus: string;
  ClaimValue: number;
}

export class ClaimValueByStatus extends DatabaseConnectionController {
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
        DECLARE @EndDate   DATE = CAST(GETDATE() AS DATE);
        DECLARE @StartDate DATE = DATEADD(YEAR, -1, @EndDate);

        SELECT
            ISNULL(ClaimStatus, 'Unknown') AS ClaimStatus,
            SUM(TrxAmt) AS ClaimValue
        FROM recon_report
        WHERE
            TrxType IN ('Charge', 'Refund')
            AND DateOfService BETWEEN @StartDate AND @EndDate
            ${custWhere} ${bodyWhere}
        GROUP BY
            ISNULL(ClaimStatus, 'Unknown')
        HAVING SUM(TrxAmt) > 0
        ORDER BY
            ClaimValue DESC;
      `;

      const { recordset } = await request.query<ClaimValueByStatusRow>(query);
      return res.status(200).json(recordset ?? []);
    } catch (error) {
      console.error('[RCM] claim-value-by-status error', error);
      return res
        .status(500)
        .json({ message: 'Failed to fetch Claim Value by Status' });
    }
  }
}