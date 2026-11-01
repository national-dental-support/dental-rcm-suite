import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class PaymentBreakdownPie extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      let locationFilter = '';
      const request = this.pool.request();
      if (scope.isManager && scope.teamLocations.length > 0) {
        const locParams = scope.teamLocations.map((loc, i) => {
          request.input(`_pbLoc${i}`, sql.NVarChar(255), loc);
          return `@_pbLoc${i}`;
        });
        locationFilter = `AND r.Location IN (${locParams.join(', ')})`;
      }

      // Location filter for the @LastActivity subquery (uses bare table name)
      const locationFilterBare = locationFilter.replace(/r\.Location/g, 'Location');

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'r');
      custFilter.addInputs(request);
      // For bare-table subqueries (no alias)
      const custFilterBare = buildCustomerFilter(scope.customerId, 'recon_report');

      const query = `
      DECLARE @LastActivity date;

      -- 1) Find the last date with insurance/ERA payments (PayerType IS NULL covers ERA rows).
      --    These represent the bulk of dental revenue and give the most meaningful donut.
      --    Fall back to any payment, then any activity, if insurance payments are missing.
      SELECT @LastActivity = MAX(COALESCE(PaymentPostDate, PostDate, DateOfService))
      FROM recon_report
      WHERE TrxType = 'Payment'
        AND (PayerType = 'Insurance' OR PayerType IS NULL)
        AND COALESCE(PaymentPostDate, PostDate, DateOfService) IS NOT NULL
        ${custFilterBare.where};

      IF @LastActivity IS NULL
      BEGIN
        SELECT @LastActivity = MAX(COALESCE(PaymentPostDate, PostDate, DateOfService))
        FROM recon_report
        WHERE TrxType = 'Payment'
          AND COALESCE(PaymentPostDate, PostDate, DateOfService) IS NOT NULL
          ${custFilterBare.where};
      END;

      IF @LastActivity IS NULL
      BEGIN
        SELECT @LastActivity = MAX(COALESCE(PaymentPostDate, PostDate, DateOfService))
        FROM recon_report
        WHERE COALESCE(PaymentPostDate, PostDate, DateOfService) IS NOT NULL
          ${custFilterBare.where};
      END;

      -- If there is absolutely no data, just bail out with zeros/nulls
      IF @LastActivity IS NULL
      BEGIN
          SELECT
              NULL AS CurrentPeriodStart,
              NULL AS CurrentPeriodEnd,
              0    AS Charges,
              0    AS TotalPayments,
              0    AS InsurancePayments,
              0    AS PatientPayments,
              0    AS Adjustments,
              0    AS RemainingBalance,
              NULL AS PriorTotalPayments,
              NULL AS PctChangeLast30Days;
          RETURN;
      END;

      -- 2) Define "current month" based on the last activity date
      DECLARE @CurrentStart date = DATEFROMPARTS(YEAR(@LastActivity), MONTH(@LastActivity), 1);
      DECLARE @CurrentEnd   date = @LastActivity;

      -- 3) Previous 30-day window (ending the day before current month)
      DECLARE @PriorStart   date = DATEADD(DAY, -30, @CurrentStart);
      DECLARE @PriorEnd     date = DATEADD(DAY, -1,  @CurrentStart);

      WITH CurrentPeriod AS (
          SELECT
              Charges = ISNULL(SUM(CASE WHEN TrxType = 'Charge' THEN TrxAmt ELSE 0 END), 0),
              TotalPayments = ISNULL(SUM(CASE WHEN TrxType = 'Payment' THEN TrxAmt ELSE 0 END), 0),
              Adjustments = ISNULL(SUM(CASE WHEN TrxType = 'Adjustment' THEN TrxAmt ELSE 0 END), 0),
              InsurancePayments = ISNULL(SUM(
                  CASE
                      WHEN TrxType = 'Payment' AND (PayerType = 'Insurance' OR PayerType IS NULL) THEN TrxAmt
                      ELSE 0
                  END
              ), 0),
              PatientPayments = ISNULL(SUM(
                  CASE
                      WHEN TrxType = 'Payment' AND PayerType = 'Patient' THEN TrxAmt
                      ELSE 0
                  END
              ), 0)
          FROM recon_report r
          CROSS APPLY (
              SELECT COALESCE(r.PaymentPostDate, r.PostDate, r.DateOfService) AS ActivityDate
          ) d
          WHERE d.ActivityDate BETWEEN @CurrentStart AND @CurrentEnd
            ${locationFilter}
            ${custFilter.where}
      ),
      PriorPeriod AS (
          SELECT
              PriorTotalPayments = ISNULL(SUM(
                  CASE WHEN TrxType = 'Payment' THEN TrxAmt ELSE 0 END
              ), 0)
          FROM recon_report r
          CROSS APPLY (
              SELECT COALESCE(r.PaymentPostDate, r.PostDate, r.DateOfService) AS ActivityDate
          ) d
          WHERE d.ActivityDate BETWEEN @PriorStart AND @PriorEnd
            ${locationFilter}
            ${custFilter.where}
      )
      SELECT
          @CurrentStart AS CurrentPeriodStart,
          @CurrentEnd   AS CurrentPeriodEnd,
      
          c.Charges,
          c.TotalPayments,
          c.InsurancePayments,
          c.PatientPayments,
          c.Adjustments,
          (c.Charges - c.TotalPayments - c.Adjustments) AS RemainingBalance,
      
          p.PriorTotalPayments,
          CASE 
              WHEN p.PriorTotalPayments = 0 THEN NULL
              ELSE CAST(
                  100.0 * (c.TotalPayments - p.PriorTotalPayments) / p.PriorTotalPayments
                  AS decimal(5,2)
              )
          END AS PctChangeLast30Days
      FROM CurrentPeriod c
      CROSS JOIN PriorPeriod p;      
      `;

      logger.info('PaymentBreakdownPie.get \u2192 executing payment breakdown query');
      const result = await request.query(query);

      return res.status(200).json({
        message: 'Payment breakdown pie data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('PaymentBreakdownPie.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
