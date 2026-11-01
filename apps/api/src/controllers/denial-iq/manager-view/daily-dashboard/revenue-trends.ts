import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class RevenueTrends extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      // Map UI range selector to SQL view mode and period count
      const range = (req.query['range'] as string) ?? 'MoM';
      const viewMode = range === 'YTD' ? 'YEAR' : 'MONTH';
      const periodCount = range === 'YTD' ? 4 : range === 'MTD' ? 5 : range === 'DoD' ? 2 : 11;

      let locationFilter = '';
      const request = this.pool.request();
      if (scope.isManager && scope.teamLocations.length > 0) {
        const locParams = scope.teamLocations.map((loc, i) => {
          request.input(`_rtLoc${i}`, sql.NVarChar(255), loc);
          return `@_rtLoc${i}`;
        });
        locationFilter = `AND Location IN (${locParams.join(', ')})`;
      }

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'recon_report');
      custFilter.addInputs(request);

      const query = `
      DECLARE @ViewMode varchar(10) = '${viewMode}';
      DECLARE @PeriodCount int = ${periodCount};

      DECLARE @LastActivity date;

      -- 1) Use the last date with any activity as the anchor
      SELECT
        @LastActivity = MAX(COALESCE(PaymentPostDate, PostDate, DateOfService))
      FROM recon_report
      WHERE COALESCE(PaymentPostDate, PostDate, DateOfService) IS NOT NULL
        ${custFilter.where};

      IF @LastActivity IS NULL
      BEGIN
          -- No data at all
          SELECT
              CAST(NULL AS date)   AS PeriodStart,
              CAST(NULL AS date)   AS PeriodEnd,
              CAST(NULL AS varchar(10)) AS PeriodLabel,
              CAST(0 AS decimal(18,2)) AS Charges,
              CAST(0 AS decimal(18,2)) AS Payments,
              CAST(0 AS decimal(18,2)) AS Adjustments;
          RETURN;
      END;

      -- 2) Base activity set
      WITH Activity AS (
          SELECT
              COALESCE(PaymentPostDate, PostDate, DateOfService) AS ActivityDate,
              TrxType,
              ISNULL(TrxAmt, 0) AS TrxAmt
          FROM recon_report
          WHERE 1=1
            ${locationFilter}
            ${custFilter.where}
      ),
      
      -- 3) Generate periods (months or years) counting backwards from last activity
      Periods AS (
          SELECT
              0 AS n,
              CASE 
                  WHEN @ViewMode = 'YEAR'
                      THEN DATEFROMPARTS(YEAR(@LastActivity), 1, 1)      -- start of year
                  ELSE DATEFROMPARTS(YEAR(@LastActivity), MONTH(@LastActivity), 1) -- start of month
              END AS PeriodStart
          UNION ALL
          SELECT
              n + 1,
              DATEADD(
                  MONTH,
                  CASE WHEN @ViewMode = 'YEAR' THEN -12 ELSE -1 END,     -- step 12 months for YEAR, 1 month for MONTH
                  PeriodStart
              )
          FROM Periods
          WHERE n < @PeriodCount
      ),
      
      PeriodsWithEnd AS (
          SELECT
              n,
              PeriodStart,
              CASE 
                  WHEN @ViewMode = 'YEAR'
                      THEN DATEFROMPARTS(YEAR(PeriodStart), 12, 31)      -- end of year
                  ELSE EOMONTH(PeriodStart)                              -- end of month
              END AS PeriodEnd
          FROM Periods
      )
      
      -- 4) Aggregate Charges / Payments / Adjustments by period
      SELECT
          p.PeriodStart,
          p.PeriodEnd,
          CASE
              WHEN @ViewMode = 'YEAR'
                  THEN CONVERT(varchar(4), YEAR(p.PeriodStart))          -- e.g. '2024'
              ELSE FORMAT(p.PeriodStart, 'yyyy-MM')                      -- e.g. '2024-11'
          END AS PeriodLabel,
          SUM(CASE WHEN a.TrxType = 'Charge'     THEN a.TrxAmt ELSE 0 END) AS Charges,
          SUM(CASE WHEN a.TrxType = 'Payment'    THEN a.TrxAmt ELSE 0 END) AS Payments,
          SUM(CASE WHEN a.TrxType = 'Adjustment' THEN a.TrxAmt ELSE 0 END) AS Adjustments
      FROM PeriodsWithEnd p
      LEFT JOIN Activity a
          ON a.ActivityDate BETWEEN p.PeriodStart AND p.PeriodEnd
      GROUP BY
          p.PeriodStart,
          p.PeriodEnd
      ORDER BY
          p.PeriodStart
      OPTION (MAXRECURSION 100);      
      `;

      logger.info('RevenueTrends.get \u2192 executing revenue trends query');
      const result = await request.query(query);

      return res.status(200).json({
        message: 'Revenue trends data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('RevenueTrends.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
