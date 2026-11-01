// services/analytics/ar/ARDaysByPractice.ts
import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';

export class ARDaysByPractice extends DatabaseConnectionController {
  public readonly path = '/analytics/ar/ar-days-by-practice';

  async get(req: Request, res: Response): Promise<Response> {
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
                Operations,
                PostDate,
                TrxType,
                ISNULL(TrxAmt, 0) AS TrxAmt
            FROM dbo.recon_report
            WHERE PostDate IS NOT NULL
            ${custWhere} ${bodyWhere}
        ),
        Agg AS (
            SELECT
                Operations,
                -- All-time AR
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
                ) AS AllTimeAR,
                -- Last 12 months AR
                SUM(
                    CASE
                        WHEN PostDate >= @PriorDate AND PostDate <= @AsOfDate THEN
                            CASE
                                WHEN TrxType = 'Charge' THEN TrxAmt
                                WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -TrxAmt
                                WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN TrxAmt
                                ELSE 0
                            END
                        ELSE 0
                    END
                ) AS Last12MonthsAR,
                -- Trailing 13-month charges (primary denominator)
                SUM(
                    CASE
                        WHEN PostDate > @CurrentStart13
                         AND PostDate <= @AsOfDate
                         AND TrxType = 'Charge'
                        THEN TrxAmt
                        ELSE 0
                    END
                ) AS Charges13,
                -- All-time charges (fallback denominator)
                SUM(
                    CASE
                        WHEN PostDate <= @AsOfDate AND TrxType = 'Charge'
                        THEN TrxAmt
                        ELSE 0
                    END
                ) AS AllTimeCharges,
                -- Prior year AR (all transactions posted on or before PriorDate)
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
                -- Prior year trailing 13-month charges denominator
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
            GROUP BY Operations
        )
        SELECT
            Operations,
            CASE
                WHEN COALESCE(Charges13, AllTimeCharges, 0) = 0 THEN NULL
                ELSE Last12MonthsAR / (COALESCE(NULLIF(Charges13, 0), AllTimeCharges) / 395.0)
            END AS CurrentYear,
            CASE
                WHEN COALESCE(PriorCharges13, AllTimeCharges, 0) = 0 THEN NULL
                ELSE PriorAR / (COALESCE(NULLIF(PriorCharges13, 0), AllTimeCharges) / 395.0)
            END AS PreviousYear
        FROM Agg
        WHERE COALESCE(Charges13, 0) > 0 OR AllTimeAR <> 0
        ORDER BY Operations;
      `;

      const { recordset } = await request.query(query);

      const rows = (recordset || []).map((r: any) => ({
        operations: r.Operations,
        currentYear: r.CurrentYear != null ? Number(r.CurrentYear) : null,
        previousYear: r.PreviousYear != null ? Number(r.PreviousYear) : null,
      }));

      return res.json({ rows });
    } catch (err) {
      console.error('ARDaysByPractice error', err);
      return res
        .status(500)
        .json({ message: 'Failed to get Days in AR by Practice' });
    }
  }
}