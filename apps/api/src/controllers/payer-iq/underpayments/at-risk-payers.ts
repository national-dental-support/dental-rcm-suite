import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { applyGlobalFilters } from '../../../utils/global-filters';

export interface AtRiskPayerRow {
  PayerName: string;
  CPTCode: string | null;
  Claims: number;          // UI expects THIS name
  LossRevenue: number;
  RiskRate: string | null;
}

export class AtRiskPayers extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      let built: ReturnType<typeof applyGlobalFilters>;
      try {
        built = applyGlobalFilters(req, { claims: 'c', payer: 'p' });
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_DATE') {
          return res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD for start/end.',
          });
        }
        throw e;
      }

      const whereParts: string[] = [
        ...built.clauseParts,
        `t.TrxType IN ('Charge','Payment')`,
        `t.CPT IS NOT NULL`,
      ];

      const query = `
WITH line_rollup AS (
  SELECT
    p.InsuranceName AS PayerName,
    c.ClaimID,
    COALESCE(NULLIF(LTRIM(RTRIM(t.CPT)), ''), 'Unknown') AS CPTCode,
    SUM(CASE WHEN t.TrxType = 'Charge'  THEN COALESCE(t.TrxAmt, 0.0) ELSE 0.0 END) AS ChargeAmt,
    SUM(CASE WHEN t.TrxType = 'Payment' THEN COALESCE(t.TrxAmt, 0.0) ELSE 0.0 END) AS PaidAmt
  FROM dbo.transactions t
  JOIN dbo.claims c
    ON c.ClaimID = t.ClaimID
  JOIN dbo.Payer p
    ON p.PayerID = c.PayerID
  WHERE ${whereParts.join('\n    AND ')}
  GROUP BY
    p.InsuranceName,
    c.ClaimID,
    COALESCE(NULLIF(LTRIM(RTRIM(t.CPT)), ''), 'Unknown')
),

not_fully_paid AS (
  SELECT *
  FROM line_rollup
  WHERE ChargeAmt > PaidAmt
    AND ChargeAmt > 0
),

payer_agg AS (
  SELECT
    PayerName,
    COUNT(*) AS Claims,                     -- \u2705 ADDITIVE + UI-COMPATIBLE
    SUM(PaidAmt - ChargeAmt) AS LossRevenue,
    SUM(ChargeAmt) AS TotalCharges
  FROM not_fully_paid
  GROUP BY PayerName
),

payer_cpt_agg AS (
  SELECT
    PayerName,
    CPTCode,
    COUNT(*) AS Claims,                     -- \u2705 ADDITIVE + UI-COMPATIBLE
    SUM(PaidAmt - ChargeAmt) AS LossRevenue
  FROM not_fully_paid
  GROUP BY PayerName, CPTCode
),

final_payer AS (
  SELECT
    1 AS SortLevel,
    'PAYER' AS RowType,
    pa.PayerName,
    CAST(NULL AS nvarchar(50)) AS CPTCode,
    pa.Claims,
    CAST(pa.LossRevenue AS float) AS LossRevenue,
    CASE
      WHEN pa.LossRevenue >= 0 THEN 'Low'                 -- no loss
      WHEN ABS(pa.LossRevenue) >= 150000 THEN 'High'
      WHEN ABS(pa.LossRevenue) >= 70000  THEN 'Medium'
      ELSE 'Low'
    END AS RiskRate
  
  FROM payer_agg pa
),

final_cpt AS (
  SELECT
    2 AS SortLevel,
    'CPT' AS RowType,
    pca.PayerName,
    pca.CPTCode,
    pca.Claims,
    CAST(pca.LossRevenue AS float) AS LossRevenue,
    CAST(NULL AS varchar(10)) AS RiskRate
  FROM payer_cpt_agg pca
)

SELECT
  SortLevel,
  RowType,
  PayerName,
  CPTCode,
  Claims,
  LossRevenue,
  RiskRate
FROM (
  SELECT * FROM final_payer
  UNION ALL
  SELECT * FROM final_cpt
) x
ORDER BY
  PayerName,
  SortLevel,
  LossRevenue;
      `;

      const request = this.pool.request();
      built.inputs.forEach(({ name, value }) => request.input(name, value));

      logger.info('AtRiskPayers.get \u2192 executing at-risk payers roll-down query', {
        startDate: built.startDate,
        endDate: built.endDate,
        payers: built.payers,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'At-risk payers data',
        data: result.recordset ?? [],
      });
    } catch (error: unknown) {
      logger.error('AtRiskPayers.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
