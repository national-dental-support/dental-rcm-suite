// controllers/analytics/ar/ar-collections-breakdown.ts
import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';

/**
 * AR Collections Breakdown (recon_report)
 *
 * PostDate-only model:
 * - Production = Charge by PostDate
 * - Collections = Payment by PostDate
 * - Adjustments = Adjustment by PostDate
 * - Refunds = Refund by PostDate
 *
 * We keep both output fields for compatibility:
 * - productionAdjustment = 0
 * - collectionAdjustment = actual adjustments
 */
export class ARCollectionsBreakdown extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response) => {
    try {
      const { filters = {}, page = 1, limit = 50, sort } = req.body || {};

      logger.info(
        `ARCollectionsBreakdownByDOS; get; Called with filters: ${JSON.stringify(
          filters
        )}, sort: ${JSON.stringify(sort)}`
      );

      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
      const { bind: bindDos } = this.dosRange(req);
      const request = this.pool.request();
      bindCust(request);
      bindBody(request);
      bindDos(request);

      const query = `
        DECLARE @EndDate DATE = CAST(@_dos_end   AS DATE);
        DECLARE @StartDate DATE = CAST(@_dos_start AS DATE);

        ;WITH Base AS (
            SELECT
                Operations AS Practice,
                TrxType,
                ISNULL(TrxAmt, 0) AS TrxAmt,
                PayerType,
                ClaimID,
                PostDate
            FROM dbo.recon_report
            WHERE PostDate IS NOT NULL
              ${custWhere} ${bodyWhere}
        ),
        PracticeAgg AS (
            SELECT
                Practice,

                COUNT(CASE
                    WHEN TrxType = 'Payment'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN 1
                END) AS NumCollections,

                SUM(CASE
                    WHEN TrxType = 'Payment'
                     AND ISNULL(PayerType, '') <> 'Patient'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN TrxAmt ELSE 0
                END) AS InsuranceCollections,

                SUM(CASE
                    WHEN TrxType = 'Payment'
                     AND ISNULL(PayerType, '') = 'Patient'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN TrxAmt ELSE 0
                END) AS PatientCollections,

                SUM(CASE
                    WHEN TrxType = 'Payment'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN TrxAmt ELSE 0
                END) AS GrossCollections,

                SUM(CASE
                    WHEN TrxType = 'Charge'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN TrxAmt ELSE 0
                END) AS Production,

                SUM(CASE
                    WHEN TrxType IN ('Adjustment', 'Courtesy')
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN TrxAmt ELSE 0
                END) AS Adjustments,

                SUM(CASE
                    WHEN TrxType = 'Writeoff'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN TrxAmt ELSE 0
                END) AS Writeoffs,

                SUM(CASE
                    WHEN TrxType = 'Refund'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN TrxAmt ELSE 0
                END) AS Refunds,

                COUNT(DISTINCT CASE
                    WHEN ISNULL(PayerType, '') <> 'Patient'
                     AND TrxType = 'Charge'
                     AND PostDate >= @StartDate
                     AND PostDate <= @EndDate
                    THEN ClaimID
                END) AS InsuranceBilled
            FROM Base
            GROUP BY Practice
        )
        SELECT
            Practice,
            NumCollections,
            InsuranceCollections,
            PatientCollections,
            GrossCollections,

            CASE
                WHEN (Production - Adjustments - Writeoffs) < 100 THEN NULL
                WHEN GrossCollections >= (Production - Adjustments - Writeoffs) THEN 100.00
                ELSE ROUND(GrossCollections * 100.0 / (Production - Adjustments - Writeoffs), 2)
            END AS CollectionRate,

            Writeoffs AS ProductionAdjustment,
            Adjustments AS CollectionAdjustment,
            Refunds AS Refund,
            InsuranceBilled,
            Production
        FROM PracticeAgg
        ORDER BY GrossCollections DESC;
      `;

      logger.info(`ARCollectionsBreakdownByDOS; query:\n${query}`);

      const result = await request.query(query);
      const rows = result.recordset || [];

      const data = rows.map((row: any) => ({
        practice: row.Practice,
        numCollections: row.NumCollections ?? 0,
        insuranceCollections: row.InsuranceCollections ?? 0,
        patientCollections: row.PatientCollections ?? 0,
        grossCollections: row.GrossCollections ?? 0,
        collectionRate: row.CollectionRate ?? null,
        productionAdjustment: row.ProductionAdjustment ?? 0,
        collectionAdjustment: row.CollectionAdjustment ?? 0,
        refund: row.Refund ?? 0,
        insuranceBilled: row.InsuranceBilled ?? 0,
        production: row.Production ?? 0,
      }));

      return res.status(200).json({
        data,
        pagination: {
          currentPage: 1,
          pageSize: data.length,
          totalRecords: data.length,
        },
      });
    } catch (error: unknown) {
      logger.error('ARCollectionsBreakdownByDOS; get; Error fetching data:', error);

      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const arCollectionsBreakdown = new ARCollectionsBreakdown();