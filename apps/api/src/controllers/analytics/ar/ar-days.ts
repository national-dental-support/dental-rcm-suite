// controllers/analytics/ar/ar-days.ts
import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';

export class ARDaysByDOS extends DatabaseConnectionController {
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
        DECLARE @AsOfDate DATE = CAST(@_dos_end AS DATE);
        DECLARE @PriorDate DATE = DATEADD(YEAR, -1, @AsOfDate);

        DECLARE @CurrentStart13 DATE = DATEADD(MONTH, -13, @AsOfDate);
        DECLARE @PriorStart13   DATE = DATEADD(MONTH, -13, @PriorDate);

        ;WITH Base AS (
            SELECT
                ClaimID,
                PostDate,
                TrxType,
                ISNULL(TrxAmt, 0) AS TrxAmt
            FROM dbo.recon_report
            WHERE PostDate IS NOT NULL
            ${custWhere} ${bodyWhere}
        ),
        -- Claims whose charge was posted in the last 12 months
        RecentChargeClaims AS (
            SELECT DISTINCT ClaimID
            FROM Base
            WHERE TrxType = 'Charge'
              AND PostDate >= @PriorDate
              AND PostDate <= @AsOfDate
        ),
        Agg AS (
            SELECT
                SUM(
                    CASE
                        WHEN PostDate <= @AsOfDate THEN
                            CASE
                                WHEN TrxType = 'Charge' THEN TrxAmt
                                WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -TrxAmt
                                WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN TrxAmt
                                ELSE 0
                            END
                        ELSE 0
                    END
                ) AS CurrentAR,

                SUM(
                    CASE
                        WHEN PostDate <= @PriorDate THEN
                            CASE
                                WHEN TrxType = 'Charge' THEN TrxAmt
                                WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -TrxAmt
                                WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN TrxAmt
                                ELSE 0
                            END
                        ELSE 0
                    END
                ) AS PriorAR,

                SUM(
                    CASE
                        WHEN PostDate > @CurrentStart13
                         AND PostDate <= @AsOfDate
                         AND TrxType = 'Charge'
                        THEN TrxAmt
                        ELSE 0
                    END
                ) AS CurrentCharges13,

                SUM(
                    CASE
                        WHEN PostDate > @PriorStart13
                         AND PostDate <= @PriorDate
                         AND TrxType = 'Charge'
                        THEN TrxAmt
                        ELSE 0
                    END
                ) AS PriorCharges13
            FROM Base
        ),
        -- Outstanding balance for claims billed in the last 12 months (all their transactions)
        Last12 AS (
            SELECT SUM(
                CASE
                    WHEN b.TrxType = 'Charge' THEN b.TrxAmt
                    WHEN b.TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -b.TrxAmt
                    WHEN b.TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN b.TrxAmt
                    ELSE 0
                END
            ) AS Last12AR
            FROM Base b
            JOIN RecentChargeClaims rc ON b.ClaimID = rc.ClaimID
        )
        SELECT
            CASE
                WHEN a.CurrentCharges13 = 0 THEN NULL
                ELSE a.CurrentAR / (a.CurrentCharges13 / 395.0)
            END AS DaysInAR,

            CASE
                WHEN a.PriorCharges13 = 0 THEN NULL
                ELSE a.PriorAR / (a.PriorCharges13 / 395.0)
            END AS PriorDaysInAR,

            CASE
                WHEN a.CurrentCharges13 = 0 OR a.PriorCharges13 = 0 THEN NULL
                ELSE
                    (a.CurrentAR / (a.CurrentCharges13 / 395.0))
                    - (a.PriorAR / (a.PriorCharges13 / 395.0))
            END AS DaysInAR_Delta,

            CASE
                WHEN a.CurrentCharges13 = 0 THEN NULL
                ELSE l.Last12AR / (a.CurrentCharges13 / 395.0)
            END AS Last12MonthsDaysInAR
        FROM Agg a
        CROSS JOIN Last12 l;
      `;

      logger.info('ARDaysByDOS.get -> executing recon_report Days in AR query');

      const result = await request.query(query);
      const row = result.recordset[0] || {};

      const current = row.DaysInAR != null ? Number(row.DaysInAR) : null;
      const prior = row.PriorDaysInAR != null ? Number(row.PriorDaysInAR) : null;

      const last12Months = row.Last12MonthsDaysInAR != null ? Number(row.Last12MonthsDaysInAR) : null;

      return res.status(200).json({
        total: current,
        prior_year: prior,
        delta: row.DaysInAR_Delta != null ? Number(row.DaysInAR_Delta) : null,
        last_12_months: last12Months,
      });
    } catch (error: unknown) {
      logger.error('ARDaysByDOS.get - error executing recon_report query', { error });
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Internal server error', error: msg });
    }
  };
}

export const arDaysByDOS = new ARDaysByDOS();