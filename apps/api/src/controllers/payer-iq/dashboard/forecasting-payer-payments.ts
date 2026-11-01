import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';
import { buildDateAndPayerFilters } from '../../../utils/global-filters';
import { extractCustomerId, buildCustomerFilter } from '../../../utils/resolve-user-scope';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export interface ForecastingPayerPaymentsRow {
  payer: string;
  nowMonthStart: string;
  '3_months_ago': number;
  '2_months_ago': number;
  '1_month_ago': number;
  now: number;
  '1_month_future': number;
  '2_month_future': number;
  '3_month_future': number;
  // Historical rolling-avg forecast (what the algorithm would have predicted)
  '3_months_ago_forecast': number;
  '2_months_ago_forecast': number;
  '1_months_ago_forecast': number;
}

export class ForecastingPayerPayments extends DatabaseConnectionController {
  get: ControllerMethod = async (req: Request, res: Response) => {
    try {
      let built: ReturnType<typeof buildDateAndPayerFilters>;
      try {
        built = buildDateAndPayerFilters(
          req,
          { claims: 'r', payer: 'r' },
          { startParam: 'start', endParam: 'end', payerParamPrefix: 'payer' }
        );
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_DATE') {
          return res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD for start/end.',
          });
        }
        throw e;
      }

      const payerWhere = built.payerInClause ? `AND ${built.payerInClause}` : '';
      const providerWhere = built.providerInClause ? `AND ${built.providerInClause}` : '';
      const locationWhere = built.locationInClause ? `AND ${built.locationInClause}` : '';

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = buildCustomerFilter(xenCustId, 'r');

      const query = `
WITH params AS (
  SELECT
    CAST(@start AS date) AS StartDate,
    CAST(@end AS date) AS EndDate,
    CAST(@useMidpointAnchor AS bit) AS UseMidpointAnchor
),
data_today AS (
  SELECT MAX(r.PostDate) AS DataToday
  FROM dbo.recon_report r
  WHERE r.TrxType = 'Payment'
    AND r.PostDate IS NOT NULL
),
midpoint AS (
  SELECT
    DATEADD(day, DATEDIFF(day, p.StartDate, p.EndDate) / 2, p.StartDate) AS MidDate
  FROM params p
),
anchor AS (
  SELECT
    CASE
      WHEN p.UseMidpointAnchor = 1
        THEN DATEFROMPARTS(YEAR(m.MidDate), MONTH(m.MidDate), 1)
      ELSE DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
    END AS NowMonthStart
  FROM params p
  CROSS JOIN data_today d
  CROSS JOIN midpoint m
),
-- Extended to 6 months back so we can compute historical rolling-avg forecasts
monthly_actuals AS (
  SELECT
    r.InsuranceName AS PayerName,
    DATEFROMPARTS(YEAR(r.PostDate), MONTH(r.PostDate), 1) AS MonthStart,
    SUM(COALESCE(r.TrxAmt, 0)) AS MonthlyPayments
  FROM dbo.recon_report r
  CROSS JOIN anchor a
  WHERE r.TrxType = 'Payment'
    AND r.PostDate IS NOT NULL
    AND r.PostDate >= DATEADD(MONTH, -6, a.NowMonthStart)
    AND r.PostDate <  DATEADD(MONTH,  1, a.NowMonthStart)
    ${payerWhere}
    ${providerWhere}
    ${locationWhere}
    ${custFilter.where}
  GROUP BY
    r.InsuranceName,
    DATEFROMPARTS(YEAR(r.PostDate), MONTH(r.PostDate), 1)
),
-- Future forecast: rolling avg of last 3 full months (months -3, -2, -1)
avg_last_3_full_months AS (
  SELECT
    m.PayerName,
    SUM(m.MonthlyPayments) * 1.0 / NULLIF(COUNT(*), 0) AS AvgMonthlyPayment
  FROM monthly_actuals m
  CROSS JOIN anchor a
  WHERE m.MonthStart >= DATEADD(MONTH, -3, a.NowMonthStart)
    AND m.MonthStart <  a.NowMonthStart
  GROUP BY m.PayerName
),
-- Historical forecast for month -3: avg of months -6, -5, -4
hist_forecast_m3 AS (
  SELECT m.PayerName, COALESCE(AVG(m.MonthlyPayments), 0) AS ForecastAmount
  FROM monthly_actuals m
  CROSS JOIN anchor a
  WHERE m.MonthStart >= DATEADD(MONTH, -6, a.NowMonthStart)
    AND m.MonthStart <  DATEADD(MONTH, -3, a.NowMonthStart)
  GROUP BY m.PayerName
),
-- Historical forecast for month -2: avg of months -5, -4, -3
hist_forecast_m2 AS (
  SELECT m.PayerName, COALESCE(AVG(m.MonthlyPayments), 0) AS ForecastAmount
  FROM monthly_actuals m
  CROSS JOIN anchor a
  WHERE m.MonthStart >= DATEADD(MONTH, -5, a.NowMonthStart)
    AND m.MonthStart <  DATEADD(MONTH, -2, a.NowMonthStart)
  GROUP BY m.PayerName
),
-- Historical forecast for month -1: avg of months -4, -3, -2
hist_forecast_m1 AS (
  SELECT m.PayerName, COALESCE(AVG(m.MonthlyPayments), 0) AS ForecastAmount
  FROM monthly_actuals m
  CROSS JOIN anchor a
  WHERE m.MonthStart >= DATEADD(MONTH, -4, a.NowMonthStart)
    AND m.MonthStart <  DATEADD(MONTH, -1, a.NowMonthStart)
  GROUP BY m.PayerName
),
payers AS (
  SELECT DISTINCT PayerName
  FROM monthly_actuals
)
SELECT
  pr.PayerName AS payer,
  CONVERT(date, a.NowMonthStart) AS nowMonthStart,

  -- Actual payment amounts (last 3 months + current)
  COALESCE(SUM(CASE WHEN m.MonthStart = DATEADD(MONTH, -3, a.NowMonthStart) THEN m.MonthlyPayments END), 0) AS [3_months_ago],
  COALESCE(SUM(CASE WHEN m.MonthStart = DATEADD(MONTH, -2, a.NowMonthStart) THEN m.MonthlyPayments END), 0) AS [2_months_ago],
  COALESCE(SUM(CASE WHEN m.MonthStart = DATEADD(MONTH, -1, a.NowMonthStart) THEN m.MonthlyPayments END), 0) AS [1_month_ago],
  COALESCE(SUM(CASE WHEN m.MonthStart = a.NowMonthStart                  THEN m.MonthlyPayments END), 0) AS [now],

  -- Future forecast (rolling avg of last 3 full months)
  COALESCE(a3.AvgMonthlyPayment, 0) AS [1_month_future],
  COALESCE(a3.AvgMonthlyPayment, 0) AS [2_month_future],
  COALESCE(a3.AvgMonthlyPayment, 0) AS [3_month_future],

  -- Historical rolling-avg forecasts (what the algorithm would have predicted for past months)
  COALESCE(hm3.ForecastAmount, 0) AS [3_months_ago_forecast],
  COALESCE(hm2.ForecastAmount, 0) AS [2_months_ago_forecast],
  COALESCE(hm1.ForecastAmount, 0) AS [1_months_ago_forecast]

FROM payers pr
CROSS JOIN anchor a
LEFT JOIN monthly_actuals m
  ON m.PayerName = pr.PayerName
LEFT JOIN avg_last_3_full_months a3
  ON a3.PayerName = pr.PayerName
LEFT JOIN hist_forecast_m3 hm3
  ON hm3.PayerName = pr.PayerName
LEFT JOIN hist_forecast_m2 hm2
  ON hm2.PayerName = pr.PayerName
LEFT JOIN hist_forecast_m1 hm1
  ON hm1.PayerName = pr.PayerName
GROUP BY
  pr.PayerName,
  a.NowMonthStart,
  a3.AvgMonthlyPayment,
  hm3.ForecastAmount,
  hm2.ForecastAmount,
  hm1.ForecastAmount
ORDER BY
  pr.PayerName;
`;

      const request = this.pool.request();
      // Note: built.inputs already includes _custId from buildDateAndPayerFilters
      built.inputs.forEach(({ name, value }) => request.input(name, value));

      const startQ = typeof req.query.start === 'string' ? req.query.start : null;
      const endQ = typeof req.query.end === 'string' ? req.query.end : null;
      const userProvidedBothIso = Boolean(startQ && endQ);
      request.input('useMidpointAnchor', userProvidedBothIso);

      logger.info('ForecastingPayerPayments.get \u2192 executing forecasting query', {
        startDate: built.startDate,
        endDate: built.endDate,
        useMidpointAnchor: userProvidedBothIso,
        payers: built.payers,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Forecasting payer payments data',
        data: (result.recordset ?? []) as ForecastingPayerPaymentsRow[],
      });
    } catch (err: any) {
      logger.error('ForecastingPayerPayments.get \u2013 error executing query', { err });
      /* istanbul ignore next */
      return res.status(500).json({
        message: 'Failed to fetch forecasting payer payments.',
        data: [],
      });
    }
  };
}
