import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { buildDateAndPayerFilters } from '../../../utils/global-filters';

export interface CptNonPaymentPayerRow {
  PayerName: string;
  TotalCharges: number;
  TotalPaid: number;
  TotalBalance: number;
  ClaimsCount: number;
}

export interface CptNonPaymentCptRow {
  PayerName: string;
  ProcedureCode: string;
  TotalCharges: number;
  TotalPaid: number;
  TotalBalance: number;
  ClaimsCount: number;
}

export interface CptNonPaymentLineRow {
  PayerName: string;
  ProcedureCode: string;
  ClaimID: string | number;
  TotalCharges: number;
  AmountPaid: number;
  Balance: number;
}

export class CPTNonPayment extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      let built: ReturnType<typeof buildDateAndPayerFilters>;
      try {
        built = buildDateAndPayerFilters(
          req,
          { claims: 'r', payer: 'r' },
          { startParam: 'startParam', endParam: 'endParam', payerParamPrefix: 'payer' }
        );
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_DATE') {
          return res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD for start/end.',
          });
        }
        throw e;
      }

      const payerFilterSql = built.payerInClause ? `AND ${built.payerInClause}` : '';
      const providerFilterSql = built.providerInClause ? `AND ${built.providerInClause}` : '';
      const locationFilterSql = built.locationInClause ? `AND ${built.locationInClause}` : '';

      // Enterprise isolation - applyGlobalFilters already added @_custId to built.inputs
      const custClausePart = built.clauseParts.find(c => c.includes('@_custId')) ?? '';
      const custWhere = custClausePart ? `  AND ${custClausePart}` : '';

      const query = `
DECLARE @start date = @startParam;
DECLARE @end   date = @endParam;

IF OBJECT_ID('tempdb..#not_fully_paid') IS NOT NULL DROP TABLE #not_fully_paid;

SELECT
  r.InsuranceName AS PayerName,
  r.ClaimID,
  LTRIM(RTRIM(CAST(s.CPT AS nvarchar(50)))) AS ProcedureCode,
  SUM(CASE WHEN r.TrxType = 'Charge'  THEN COALESCE(r.TrxAmt, 0) ELSE 0 END) AS ChargeAmt,
  SUM(CASE WHEN r.TrxType = 'Payment' THEN COALESCE(r.TrxAmt, 0) ELSE 0 END) AS PaidAmt
INTO #not_fully_paid
FROM dbo.recon_report r
JOIN dbo.serviceline s
  ON s.ClaimID = r.ClaimID
 AND s.ServiceLineID = r.ServiceLineID
WHERE
  r.DateOfService >= @start
  AND r.DateOfService < DATEADD(day, 1, @end)
  AND r.TrxType IN ('Charge', 'Payment')
  AND s.CPT IS NOT NULL
  ${payerFilterSql}
  ${providerFilterSql}
  ${locationFilterSql}
  ${custWhere}
GROUP BY
  r.InsuranceName,
  r.ClaimID,
  LTRIM(RTRIM(CAST(s.CPT AS nvarchar(50))));

-- keep only not fully paid rows
DELETE nfp
FROM #not_fully_paid nfp
WHERE nfp.ChargeAmt <= 0
   OR nfp.ChargeAmt <= nfp.PaidAmt;

------------------------------------------------------------
-- (1) PAYER ROLLUP
------------------------------------------------------------
SELECT
  nfp.PayerName,
  SUM(nfp.ChargeAmt) AS TotalCharges,
  SUM(nfp.PaidAmt)   AS TotalPaid,
  SUM(nfp.ChargeAmt - nfp.PaidAmt) AS TotalBalance,
  COUNT(*) AS ClaimsCount
FROM #not_fully_paid nfp
GROUP BY nfp.PayerName
ORDER BY TotalBalance DESC;

------------------------------------------------------------
-- (2) CPT ROLLUP
------------------------------------------------------------
SELECT
  nfp.PayerName,
  nfp.ProcedureCode,
  SUM(nfp.ChargeAmt) AS TotalCharges,
  SUM(nfp.PaidAmt)   AS TotalPaid,
  SUM(nfp.ChargeAmt - nfp.PaidAmt) AS TotalBalance,
  COUNT(*) AS ClaimsCount
FROM #not_fully_paid nfp
GROUP BY
  nfp.PayerName,
  nfp.ProcedureCode
ORDER BY
  nfp.PayerName,
  TotalBalance DESC;

------------------------------------------------------------
-- (3) LINE ITEMS (lowest grain)
------------------------------------------------------------
SELECT
  nfp.PayerName,
  nfp.ProcedureCode,
  nfp.ClaimID,
  nfp.ChargeAmt AS TotalCharges,
  nfp.PaidAmt   AS AmountPaid,
  (nfp.ChargeAmt - nfp.PaidAmt) AS Balance
FROM #not_fully_paid nfp
ORDER BY
  nfp.PayerName,
  nfp.ProcedureCode,
  Balance DESC;
      `;

      const request = this.pool.request();
      // Note: built.inputs already includes _custId from buildDateAndPayerFilters
      built.inputs.forEach(({ name, value }) => request.input(name, value));

      logger.info('CPTNonPayment.get \u2192 executing CPT non-payment roll-down query', {
        startDate: built.startDate,
        endDate: built.endDate,
        payers: built.payers,
      });

      const result = await request.query(query);

      const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];

      return res.status(200).json({
        message: 'CPT non-payment data',
        payerRollup: recordsets[0] ?? [],
        cptRollup: recordsets[1] ?? [],
        lineItems: recordsets[2] ?? [],
      });
    } catch (error: unknown) {
      logger.error('CPTNonPayment.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
