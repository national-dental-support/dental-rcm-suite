// src/controllers/analytics/rcm/claim-amounts-by-payer.ts
import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../database-connection-controller';

export interface ClaimAmountsByPayerRow {
  Payer: string;
  TotalClaimAmount: number;
}

export class ClaimAmountsByPayer extends DatabaseConnectionController {
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

      const now = new Date();
      const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);
      const dosFilter = req.body?.filters?.date_of_service ?? req.body?.date_of_service;
      const start = (req.query.start as string) || dosFilter?.start_date || yearAgo.toISOString().slice(0, 10);
      const end   = (req.query.end   as string) || dosFilter?.end_date   || now.toISOString().slice(0, 10);
      request.input('_start', sql.NVarChar, start);
      request.input('_end',   sql.NVarChar, end);

      const query = `
        DECLARE @StartDate DATE = CAST(@_start AS DATE);
        DECLARE @EndDate   DATE = CAST(@_end   AS DATE);

        WITH PayerAmounts AS (
            SELECT
                ISNULL(InsuranceName, 'Unknown/Self-Pay') AS Payer,
                SUM(
                    CASE
                        WHEN TrxType = 'Charge'
                             AND DateOfService BETWEEN @StartDate AND @EndDate
                        THEN TrxAmt ELSE 0
                    END
                ) AS TotalClaimAmount
            FROM recon_report
            WHERE DateOfService BETWEEN @StartDate AND @EndDate
            ${custWhere} ${bodyWhere}
            GROUP BY ISNULL(InsuranceName, 'Unknown/Self-Pay')
        )
        SELECT TOP 8
            Payer,
            TotalClaimAmount
        FROM PayerAmounts
        ORDER BY TotalClaimAmount DESC;
      `;

      const { recordset } = await request.query<ClaimAmountsByPayerRow>(query);
      return res.status(200).json(recordset ?? []);
    } catch (error) {
      console.error('[RCM] claim-amounts-by-payer error', error);
      return res
        .status(500)
        .json({ message: 'Failed to fetch Claim Amounts by Payer' });
    }
  }
}