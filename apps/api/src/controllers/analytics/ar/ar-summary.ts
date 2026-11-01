// controllers/analytics/ar/ar-summary.ts
import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';

export class ARSummary extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
      const { bind: bindDos } = this.dosRange(req);

      // ----- AR Aging (PostDate-based, user-selected window) -----
      const agingQuery = `
        DECLARE @Today DATE = CAST(@_dos_end   AS DATE);
        DECLARE @PriorDate DATE = CAST(@_dos_start AS DATE);

        ;WITH Bucketed AS (
            SELECT
                CASE
                    WHEN DATEDIFF(DAY, PostDate, @Today) < 30 THEN '<30'
                    WHEN DATEDIFF(DAY, PostDate, @Today) < 61 THEN '31-60'
                    WHEN DATEDIFF(DAY, PostDate, @Today) < 91 THEN '61-90'
                    ELSE '>90'
                END AS AgeBucket,
                CASE
                    WHEN TrxType = 'Charge' THEN ISNULL(TrxAmt, 0)
                    WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -ISNULL(TrxAmt, 0)
                    WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN ISNULL(TrxAmt, 0)
                    ELSE 0
                END AS ARAmount
            FROM dbo.recon_report
            WHERE PostDate IS NOT NULL
              AND PostDate >= @PriorDate
              AND PostDate <= @Today
              ${custWhere} ${bodyWhere}
        )
        SELECT
            b.AgeBucket,
            COALESCE(a.ARBalance, 0) AS ARBalance
        FROM (VALUES
            ('<30'),
            ('31-60'),
            ('61-90'),
            ('>90')
        ) b(AgeBucket)
        LEFT JOIN (
            SELECT AgeBucket, SUM(ARAmount) AS ARBalance
            FROM Bucketed
            GROUP BY AgeBucket
        ) a ON a.AgeBucket = b.AgeBucket
        ORDER BY
            CASE b.AgeBucket
                WHEN '<30'   THEN 1
                WHEN '31-60' THEN 2
                WHEN '61-90' THEN 3
                ELSE 4
            END;
      `;

      // ----- AR Specialty (PostDate-based, user-selected window) -----
      const specialtyQuery = `
        DECLARE @Today DATE = CAST(@_dos_end   AS DATE);
        DECLARE @PriorDate DATE = CAST(@_dos_start AS DATE);

        SELECT
            ISNULL(Specialty, 'Unspecified') AS category,
            SUM(
                CASE
                    WHEN TrxType = 'Charge' THEN ISNULL(TrxAmt, 0)
                    WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -ISNULL(TrxAmt, 0)
                    WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN ISNULL(TrxAmt, 0)
                    ELSE 0
                END
            ) AS category_total
        FROM dbo.recon_report
        WHERE PostDate IS NOT NULL
          AND PostDate >= @PriorDate
          AND PostDate <= @Today
          ${custWhere} ${bodyWhere}
        GROUP BY ISNULL(Specialty, 'Unspecified')
        HAVING SUM(
            CASE
                WHEN TrxType = 'Charge' THEN ISNULL(TrxAmt, 0)
                WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -ISNULL(TrxAmt, 0)
                WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN ISNULL(TrxAmt, 0)
                ELSE 0
            END
        ) > 0
        ORDER BY category_total DESC;
      `;

      // ----- AR Trends Over Time (monthly snapshot, PostDate-based aging) -----
      // Ages each transaction by its own PostDate relative to the month-end snapshot,
      // matching the same approach used by the aging panel (no ClaimID dependency).
      const trendsQuery = `
        DECLARE @Today DATE = CAST(GETDATE() AS DATE);

        ;WITH Months AS (
            SELECT 0 AS n, EOMONTH(@Today) AS AsOfDate
            UNION ALL
            SELECT n + 1,
                   EOMONTH(DATEADD(MONTH, -(n + 1), @Today))
            FROM Months
            WHERE n < 11
        ),
        MonthlyAR AS (
            SELECT
                m.AsOfDate,
                CASE
                    WHEN DATEDIFF(DAY, rr.PostDate, m.AsOfDate) < 30  THEN '<30'
                    WHEN DATEDIFF(DAY, rr.PostDate, m.AsOfDate) < 61  THEN '31-60'
                    WHEN DATEDIFF(DAY, rr.PostDate, m.AsOfDate) < 91  THEN '61-90'
                    ELSE '>90'
                END AS AgeBucket,
                CASE
                    WHEN rr.TrxType = 'Charge'                                          THEN  ISNULL(rr.TrxAmt, 0)
                    WHEN rr.TrxType IN ('Adjustment','Payment','Writeoff','Courtesy')   THEN -ISNULL(rr.TrxAmt, 0)
                    WHEN rr.TrxType IN ('Refund','Recoupment','ReturnedCheck','Debit')  THEN  ISNULL(rr.TrxAmt, 0)
                    ELSE 0
                END AS ARAmount
            FROM Months m
            JOIN dbo.recon_report rr
              ON rr.PostDate IS NOT NULL
             AND rr.PostDate <= m.AsOfDate
             ${custWhere} ${bodyWhere}
        )
        SELECT
            CONVERT(date, AsOfDate) AS AsOfMonth,
            SUM(CASE WHEN AgeBucket = '<30'   THEN ARAmount ELSE 0 END) AS AR_LT_30,
            SUM(CASE WHEN AgeBucket = '31-60' THEN ARAmount ELSE 0 END) AS AR_31_60,
            SUM(CASE WHEN AgeBucket = '61-90' THEN ARAmount ELSE 0 END) AS AR_61_90,
            SUM(CASE WHEN AgeBucket = '>90'   THEN ARAmount ELSE 0 END) AS AR_GT_90
        FROM MonthlyAR
        GROUP BY AsOfDate
        ORDER BY AsOfDate
        OPTION (MAXRECURSION 100);
      `;

      const agingReq = this.pool.request();
      bindCust(agingReq);
      bindBody(agingReq);
      bindDos(agingReq);

      const specialtyReq = this.pool.request();
      bindCust(specialtyReq);
      bindBody(specialtyReq);
      bindDos(specialtyReq);

      const trendsReq = this.pool.request();
      bindCust(trendsReq);
      bindBody(trendsReq);

      const [agingResult, specialtyResult, trendsResult] = await Promise.all([
        agingReq.query(agingQuery),
        specialtyReq.query(specialtyQuery),
        trendsReq.query(trendsQuery),
      ]);

      const agingRows = agingResult.recordset || [];
      const totalOutstanding = agingRows.reduce(
        (sum, r) => sum + Number(r.ARBalance ?? 0),
        0
      );
      // Base percentages on positive balances only to prevent >100% or negative %
      const positiveTotal = agingRows.reduce(
        (sum, r) => sum + Math.max(0, Number(r.ARBalance ?? 0)),
        0
      );

      const agingDetails = agingRows.map((r: any) => {
        const value = Number(r.ARBalance ?? 0);
        const pct = positiveTotal > 0
          ? ((Math.max(0, value) / positiveTotal) * 100).toFixed(1)
          : '0.0';
        return {
          category: r.AgeBucket,
          value,
          percentage: pct,
        };
      });

      const specialtyRows = specialtyResult.recordset || [];
      const specialtyTotal = specialtyRows.reduce(
        (sum, r) => sum + Number(r.category_total ?? 0),
        0
      );

      const specialtyDetails = specialtyRows.map((r: any) => {
        const value = Number(r.category_total ?? 0);
        const pct =
          specialtyTotal !== 0 ? ((value / specialtyTotal) * 100).toFixed(1) : '0.0';
        return {
          category: r.category,
          value,
          percentage: pct,
        };
      });

      const trendsDetails = (trendsResult.recordset || []).map((r: any) => ({
        month: r.AsOfMonth,
        total_0_30: Number(r.AR_LT_30 ?? 0),
        total_31_60: Number(r.AR_31_60 ?? 0),
        total_61_90: Number(r.AR_61_90 ?? 0),
        total_over_90: Number(r.AR_GT_90 ?? 0),
      }));

      return res.status(200).json({
        ar_aging: {
          total: totalOutstanding,
          details: agingDetails,
        },
        ar_specialty: {
          total: specialtyTotal,
          details: specialtyDetails,
        },
        ar_trends: {
          details: trendsDetails,
        },
      });
    } catch (error: unknown) {
      logger.error('ARSummary.get - error executing recon_report queries', { error });
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Internal server error', error: msg });
    }
  };
}

export const arSummary = new ARSummary();