// src/controllers/analytics/rcm/collection-adjustment-trends.ts
import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../database-connection-controller';

export interface CollectionAdjustmentTrendRow {
  MonthLabel: string;
  Collections: number;
  Adjustments: number;
  CollectionRate: number | null;
  AdjustmentPctOfCollections: number | null;
}

export class CollectionAdjustmentTrends extends DatabaseConnectionController {
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

        WITH Monthly AS (
            SELECT
                DATEFROMPARTS(YEAR(PostDate), MONTH(PostDate), 1) AS MonthStart,

                SUM(CASE
                    WHEN TrxType = 'Payment'
                    THEN ABS(TrxAmt)
                    ELSE 0
                END) AS Payments,

                SUM(CASE
                    WHEN TrxType = 'Adjustment'
                    THEN ABS(TrxAmt)
                    ELSE 0
                END) AS Adjustments

            FROM recon_report
            WHERE PostDate BETWEEN @StartDate AND @EndDate
            ${custWhere} ${bodyWhere}
            GROUP BY DATEFROMPARTS(YEAR(PostDate), MONTH(PostDate), 1)
        )

        SELECT
            FORMAT(MonthStart, 'MMM yy') AS MonthLabel,
            Payments AS Collections,
            Adjustments,
            CASE
                WHEN Payments = 0 THEN NULL
                ELSE Adjustments * 1.0 / Payments
            END AS AdjustmentRate,
            CASE
                WHEN (Payments + Adjustments) = 0 THEN NULL
                ELSE Payments * 1.0 / (Payments + Adjustments)
            END AS CollectionRate
        FROM Monthly
        ORDER BY MonthStart;
      `;

      const { recordset } =
        await request.query<CollectionAdjustmentTrendRow>(query);
      return res.status(200).json(recordset ?? []);
    } catch (error) {
      console.error('[RCM] collection-adjustment-trends error', error);
      return res
        .status(500)
        .json({ message: 'Failed to fetch Collection & Adjustment Trends' });
    }
  }
}