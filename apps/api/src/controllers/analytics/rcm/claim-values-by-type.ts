// src/controllers/analytics/rcm/claim-values-by-type.ts
import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';

export interface ClaimValuesByTypeRow {
  ClaimType: string;
  TotalClaimAmount: number;
}

export class ClaimValuesByType extends DatabaseConnectionController {
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

        SELECT
            PrimarySecondaryTertiary AS ClaimType,
            SUM(TrxAmt) AS TotalClaimAmount
        FROM recon_report
        WHERE TrxType = 'Charge'
          AND DateOfService BETWEEN @StartDate AND @EndDate
          ${custWhere} ${bodyWhere}
        GROUP BY PrimarySecondaryTertiary
        ORDER BY TotalClaimAmount DESC;
      `;

      const { recordset } = await request.query<ClaimValuesByTypeRow>(query);
      return res.status(200).json(recordset ?? []);
    } catch (error) {
      console.error('[RCM] claim-values-by-type error', error);
      return res
        .status(500)
        .json({ message: 'Failed to fetch Claim Values by Type' });
    }
  }
}