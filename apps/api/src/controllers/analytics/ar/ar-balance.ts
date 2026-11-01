// controllers/analytics/ar/ar-balance.ts
import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';

export class ARBalanceByDOS extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
      const { bind: bindDos } = this.dosRange(req);
      const request = this.pool.request();
      bindCust(request);
      bindBody(request);
      bindDos(request);

      const query = `
        DECLARE @AsOfDate DATE = CAST(@_dos_end  AS DATE);
        DECLARE @PriorDate DATE = DATEADD(YEAR, -1, @AsOfDate);
        DECLARE @StartDate DATE = CAST(@_dos_start AS DATE);

        ;WITH Base AS (
            SELECT TrxType, TrxAmt, PostDate, ClaimID
            FROM dbo.recon_report
            WHERE PostDate IS NOT NULL
            ${custWhere} ${bodyWhere}
        ),
        -- Claims whose charge was posted in the last 12 months
        RecentChargeClaims AS (
            SELECT DISTINCT ClaimID
            FROM Base
            WHERE TrxType = 'Charge'
              AND PostDate >= @StartDate
              AND PostDate <= @AsOfDate
        ),
        Totals AS (
            SELECT
                SUM(CASE WHEN PostDate <= @AsOfDate THEN
                    CASE
                        WHEN TrxType = 'Charge' THEN ISNULL(TrxAmt, 0)
                        WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -ISNULL(TrxAmt, 0)
                        WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN ISNULL(TrxAmt, 0)
                        ELSE 0
                    END ELSE 0 END) AS CurrentAR,
                SUM(CASE WHEN PostDate <= @PriorDate THEN
                    CASE
                        WHEN TrxType = 'Charge' THEN ISNULL(TrxAmt, 0)
                        WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -ISNULL(TrxAmt, 0)
                        WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN ISNULL(TrxAmt, 0)
                        ELSE 0
                    END ELSE 0 END) AS PriorAR
            FROM Base
        ),
        -- Outstanding balance for claims billed in the last 12 months (all their transactions)
        Last12 AS (
            SELECT SUM(
                CASE
                    WHEN b.TrxType = 'Charge' THEN ISNULL(b.TrxAmt, 0)
                    WHEN b.TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -ISNULL(b.TrxAmt, 0)
                    WHEN b.TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN ISNULL(b.TrxAmt, 0)
                    ELSE 0
                END
            ) AS Last12AR
            FROM Base b
            JOIN RecentChargeClaims rc ON b.ClaimID = rc.ClaimID
        )
        SELECT
            COALESCE(CAST(t.CurrentAR AS DECIMAL(18, 2)), 0) AS CurrentARBalance,
            COALESCE(CAST(t.PriorAR   AS DECIMAL(18, 2)), 0) AS PriorYearARBalance,
            COALESCE(CAST(l.Last12AR  AS DECIMAL(18, 2)), 0) AS Last12MonthsARBalance
        FROM Totals t
        CROSS JOIN Last12 l;
      `;

      logger.info('ARBalanceByDOS.get -> executing recon_report AR balance query');
      const result = await request.query(query);
      const row = result.recordset[0] || {};

      const current = Number(row.CurrentARBalance ?? 0);
      const prior = Number(row.PriorYearARBalance ?? 0);
      const last12Months = Number(row.Last12MonthsARBalance ?? 0);

      return res.status(200).json({
        total: current,
        prior_year: prior,
        last_12_months: last12Months,
      });
    } catch (error: unknown) {
      logger.error('ARBalanceByDOS.get - error executing recon_report query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const arBalanceByDOS = new ARBalanceByDOS();