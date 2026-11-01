import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../../controllers/database-connection-controller';

export class PayersDecreasingProduction extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
      const query = `
      DECLARE @Today DATE = CAST(GETDATE() AS DATE);

      DECLARE @CurrentStart DATE = DATEADD(YEAR, -1, @Today);
      DECLARE @CurrentEnd   DATE = @Today;

      DECLARE @LastStart DATE = DATEADD(YEAR, -2, @Today);
      DECLARE @LastEnd   DATE = DATEADD(YEAR, -1, @Today);

      WITH PayerCharges AS (
        SELECT
          rr.InsuranceName,

          SUM(CASE WHEN rr.DateOfService >= @CurrentStart AND rr.DateOfService <= @CurrentEnd
                   THEN rr.TrxAmt ELSE 0 END) AS CurrentPeriodCharges,

          SUM(CASE WHEN rr.DateOfService >= @LastStart AND rr.DateOfService <  @LastEnd
                   THEN rr.TrxAmt ELSE 0 END) AS LastPeriodCharges
        FROM dbo.recon_report rr
        WHERE rr.TrxType = 'Charge'
          AND rr.DateOfService BETWEEN @LastStart AND @CurrentEnd
          AND rr.InsuranceName IS NOT NULL
          ${custWhere} ${bodyWhere}
        GROUP BY rr.InsuranceName
      )
      SELECT
        InsuranceName,
        CurrentPeriodCharges,
        LastPeriodCharges,
        CurrentPeriodCharges - LastPeriodCharges AS ChargeDelta,
        CASE WHEN LastPeriodCharges = 0 THEN NULL
             ELSE (CurrentPeriodCharges - LastPeriodCharges) * 1.0 / LastPeriodCharges * 100
        END AS ChargeDeltaPct
      FROM PayerCharges
      -- optional: only increasing
      -- WHERE CurrentPeriodCharges - LastPeriodCharges > 0
      ORDER BY ChargeDelta ASC;
      `;

      const request = this.pool.request();
      bindCust(request);
      bindBody(request);
      const result = await request.query(query);
      return res.status(200).json(result.recordset);
    } catch (error: any) {
      console.error('PayersDecreasingProduction error:', error);
      return res.status(500).json({ message: error?.message || 'Internal Server Error' });
    }
  };
}

export const payersDecreasingProduction = new PayersDecreasingProduction();