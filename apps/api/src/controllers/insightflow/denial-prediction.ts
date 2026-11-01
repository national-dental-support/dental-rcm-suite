import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId, buildClaimsCustomerWhere } from '../../utils/resolve-user-scope';

/**
 * Denial Prediction Engine
 *
 * SQL-based scoring model that computes denial likelihood (0-100%) for claims
 * using weighted historical denial rates across multiple dimensions:
 *   - Payer denial rate        (weight: 30%)
 *   - CARC code frequency      (weight: 25%)
 *   - Charge amount band       (weight: 15%)
 *   - Provider denial rate     (weight: 15%)
 *   - Day-of-week pattern      (weight: 5%)
 *   - Coverage type            (weight: 10%)
 *
 * Scores are computed on-demand from live recon_report data (last 12 months).
 * No pre-training step required - the "model" is the historical data itself.
 */
export class DenialPredictionController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/insightflow/predictions/risk-summary
   * Aggregate risk distribution: how many claims fall into each risk tier
   */
  public getRiskSummary = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const xenCustId = extractCustomerId(_req);
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');
      const custRRDirect = xenCustId != null ? 'AND customer_id = @_custId' : '';

      const req1 = pool.request();
      custC.addInputs(req1);
      const result = await req1.query(`
        ;WITH DenialRates AS (
          SELECT
            InsuranceName,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS PayerDenialRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND InsuranceName IS NOT NULL AND InsuranceName != ''
            ${custRRDirect}
          GROUP BY InsuranceName
        ),
        ProcedureRates AS (
          SELECT
            CPT,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS ProcedureDenialRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND CPT IS NOT NULL AND CPT != ''
            ${custRRDirect}
          GROUP BY CPT
        ),
        RecentClaims AS (
          SELECT
            c.ClaimID,
            c.ChargeAmt,
            rr.InsuranceName,
            rr.CPT,
            rr.CARCCode,
            rr.ProviderName,
            rr.PrimarySecondaryTertiary,
            rr.IsClaimDenied,
            ISNULL(dr.PayerDenialRate, 0.15) AS PayerDenialRate,
            ISNULL(pr.ProcedureDenialRate, 0.12) AS ProcedureDenialRate
          FROM dbo.claims c
          JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID AND rr.TrxType = 'Charge'
          LEFT JOIN DenialRates dr ON dr.InsuranceName = rr.InsuranceName
          LEFT JOIN ProcedureRates pr ON pr.CPT = rr.CPT
          WHERE c.DateOfService >= DATEADD(MONTH, -6, GETDATE())
            ${custC.where}
        ),
        Scored AS (
          SELECT
            ClaimID,
            ChargeAmt,
            InsuranceName,
            IsClaimDenied,
            -- Composite score \u2014 High Risk >= 60 requires strong payer + strong procedure signals
            -- Factor weights: Payer(35) + CPT(30) + Confirmed Denial(15) + Charge(10) + Coverage(8) = max 98
            CAST(
              -- Payer denial rate (35 pts) \u2014 ADA/MGMA: industry avg 5%
              CASE
                WHEN PayerDenialRate >= 0.20 THEN 35
                WHEN PayerDenialRate >= 0.15 THEN 28
                WHEN PayerDenialRate >= 0.10 THEN 18
                WHEN PayerDenialRate >= 0.05 THEN 8
                ELSE 2
              END
              -- Procedure (CPT) denial rate (30 pts)
              + CASE
                WHEN ProcedureDenialRate >= 0.20 THEN 30
                WHEN ProcedureDenialRate >= 0.15 THEN 22
                WHEN ProcedureDenialRate >= 0.10 THEN 14
                WHEN ProcedureDenialRate >= 0.05 THEN 6
                ELSE 2
              END
              -- Confirmed denial \u2014 already denied, needs appeal/resolution (15 pts)
              + CASE WHEN IsClaimDenied = 1 THEN 15 ELSE 0 END
              -- Charge amount (10 pts)
              + CASE
                WHEN ChargeAmt >= 5000 THEN 10
                WHEN ChargeAmt >= 2000 THEN 5
                WHEN ChargeAmt >= 500  THEN 2
                ELSE 0
              END
              -- Coverage type (8 pts)
              + CASE
                WHEN PrimarySecondaryTertiary IN ('Secondary', 'Tertiary') THEN 8
                ELSE 0
              END
            AS INT) AS RiskScore
          FROM RecentClaims
        )
        SELECT
          COUNT(CASE WHEN RiskScore >= 60 THEN 1 END) AS HighRisk,
          COUNT(CASE WHEN RiskScore >= 35 AND RiskScore < 60 THEN 1 END) AS MediumRisk,
          COUNT(CASE WHEN RiskScore < 35 THEN 1 END) AS LowRisk,
          COUNT(*) AS TotalScored,
          ISNULL(AVG(CAST(RiskScore AS FLOAT)), 0) AS AvgRiskScore,
          ISNULL(SUM(CASE WHEN RiskScore >= 60 THEN ChargeAmt ELSE 0 END), 0) AS HighRiskCharges,
          ISNULL(SUM(ChargeAmt), 0) AS TotalCharges,
          -- Precision: of high-risk scored claims, how many were actually denied?
          COUNT(CASE WHEN RiskScore >= 60 AND IsClaimDenied = 1 THEN 1 END) AS HighRiskDenied,
          COUNT(CASE WHEN RiskScore >= 60 THEN 1 END) AS HighRiskTotal
        FROM Scored;
      `);

      const row = result.recordset[0] || {};
      return res.status(200).json({
        data: {
          highRisk: row.HighRisk ?? 0,
          mediumRisk: row.MediumRisk ?? 0,
          lowRisk: row.LowRisk ?? 0,
          totalScored: row.TotalScored ?? 0,
          avgRiskScore: Number((row.AvgRiskScore ?? 0).toFixed(1)),
          highRiskCharges: row.HighRiskCharges ?? 0,
          totalCharges: row.TotalCharges ?? 0,
          // Precision: % of high-risk predictions that were correct
          highRiskPrecision: row.HighRiskTotal > 0
            ? Number(((row.HighRiskDenied / row.HighRiskTotal) * 100).toFixed(1))
            : 0,
        },
      });
    } catch (error: unknown) {
      logger.error('DenialPrediction.getRiskSummary', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/insightflow/predictions/high-risk-claims?limit=50
   * Top N claims by risk score (highest first)
   */
  public getHighRiskClaims = async (req: Request, res: Response): Promise<Response> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const pool = (this as any).pool as sql.ConnectionPool;
      const xenCustId = extractCustomerId(req);
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');

      const custRRDirect = xenCustId != null ? 'AND customer_id = @_custId' : '';
      const hrReq = pool.request();
      hrReq.input('limit', sql.Int, limit);
      custC.addInputs(hrReq);
      const result = await hrReq.query(`
        ;WITH DenialRates AS (
          SELECT
            InsuranceName,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS PayerDenialRate,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) AS PayerDeniedCount
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND InsuranceName IS NOT NULL AND InsuranceName != ''
            ${custRRDirect}
          GROUP BY InsuranceName
        ),
        ProviderRates AS (
          SELECT
            ProviderName,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS ProviderDenialRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND ProviderName IS NOT NULL AND ProviderName != ''
            ${custRRDirect}
          GROUP BY ProviderName
        ),
        ProcedureRates AS (
          SELECT
            CPT,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS ProcedureDenialRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND CPT IS NOT NULL AND CPT != ''
            ${custRRDirect}
          GROUP BY CPT
        ),
        PayerProcedureRates AS (
          SELECT
            InsuranceName, CPT,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS PayerProcRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND CPT IS NOT NULL AND CPT != ''
            AND InsuranceName IS NOT NULL AND InsuranceName != ''
            ${custRRDirect}
          GROUP BY InsuranceName, CPT
          HAVING COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END) >= 5
        ),
        Scored AS (
          SELECT
            c.ClaimID,
            c.ChargeAmt,
            c.DateOfService,
            c.ClaimSubmittedDate,
            rr.InsuranceName,
            rr.ProviderName,
            rr.CPT,
            rr.CARCCode,
            rr.Location,
            rr.PrimarySecondaryTertiary,
            rr.IsClaimDenied,
            ISNULL(dr.PayerDenialRate, 0.15) AS PayerDenialRate,
            ISNULL(prov.ProviderDenialRate, 0.10) AS ProviderDenialRate,
            ISNULL(prr.ProcedureDenialRate, 0.12) AS ProcedureDenialRate,
            ISNULL(ppr.PayerProcRate, 0) AS PayerProcRate,
            CAST(
              -- Payer denial rate (25 pts) \u2014 calibrated to ADA/MGMA: industry avg 5%
              CASE
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.20 THEN 25
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.15 THEN 20
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.10 THEN 13
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.05 THEN 6
                ELSE 2
              END
              -- Payer\u00D7Procedure combination (20 pts) \u2014 most specific signal
              + ISNULL(CASE
                WHEN ppr.PayerProcRate >= 0.50 THEN 20
                WHEN ppr.PayerProcRate >= 0.35 THEN 15
                WHEN ppr.PayerProcRate >= 0.25 THEN 10
                WHEN ppr.PayerProcRate >= 0.15 THEN 5
                ELSE 0
              END, 0)
              -- Procedure (CPT) denial rate (15 pts)
              + ISNULL(CASE
                WHEN prr.ProcedureDenialRate >= 0.20 THEN 15
                WHEN prr.ProcedureDenialRate >= 0.15 THEN 10
                WHEN prr.ProcedureDenialRate >= 0.10 THEN 5
                ELSE 2
              END, 2)
              -- Provider denial rate (10 pts)
              + CASE
                WHEN ISNULL(prov.ProviderDenialRate, 0.10) >= 0.20 THEN 10
                WHEN ISNULL(prov.ProviderDenialRate, 0.10) >= 0.15 THEN 7
                WHEN ISNULL(prov.ProviderDenialRate, 0.10) >= 0.10 THEN 4
                ELSE 2
              END
              -- Charge amount (10 pts)
              + CASE
                WHEN c.ChargeAmt >= 5000 THEN 10
                WHEN c.ChargeAmt >= 2000 THEN 6
                WHEN c.ChargeAmt >= 500  THEN 3
                ELSE 1
              END
              -- Coverage type (8 pts)
              + CASE
                WHEN rr.PrimarySecondaryTertiary IN ('Secondary', 'Tertiary') THEN 8
                ELSE 1
              END
              -- Claim aging (7 pts)
              + CASE
                WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 90 THEN 7
                WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 60 THEN 5
                WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 30 THEN 2
                ELSE 0
              END
              -- Already denied (CARC code present) \u2014 confirmed denial signal
              + CASE
                WHEN rr.CARCCode IS NOT NULL AND rr.CARCCode != '' AND rr.IsClaimDenied = 1 THEN 15
                ELSE 0
              END
            AS INT) AS RiskScore
          FROM dbo.claims c
          JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID AND rr.TrxType = 'Charge'
          LEFT JOIN DenialRates dr ON dr.InsuranceName = rr.InsuranceName
          LEFT JOIN ProviderRates prov ON prov.ProviderName = rr.ProviderName
          LEFT JOIN ProcedureRates prr ON prr.CPT = rr.CPT
          LEFT JOIN PayerProcedureRates ppr ON ppr.InsuranceName = rr.InsuranceName AND ppr.CPT = rr.CPT
          WHERE c.DateOfService >= DATEADD(MONTH, -6, GETDATE())
            ${custC.where}
        )
        SELECT TOP (@limit)
          ClaimID AS claimId,
          ChargeAmt AS chargeAmt,
          DateOfService AS dateOfService,
          InsuranceName AS insuranceName,
          ProviderName AS providerName,
          CPT AS cptCode,
          CARCCode AS carcCode,
          Location AS location,
          PrimarySecondaryTertiary AS coverageType,
          IsClaimDenied AS isDenied,
          RiskScore AS riskScore,
          CASE
            WHEN RiskScore >= 70 THEN 'High'
            WHEN RiskScore >= 40 THEN 'Medium'
            ELSE 'Low'
          END AS riskTier,
          CAST(PayerDenialRate * 100 AS DECIMAL(5,1)) AS payerDenialPct,
          CAST(ProviderDenialRate * 100 AS DECIMAL(5,1)) AS providerDenialPct,
          CAST(ProcedureDenialRate * 100 AS DECIMAL(5,1)) AS procedureDenialPct,
          CAST(PayerProcRate * 100 AS DECIMAL(5,1)) AS payerProcDenialPct
        FROM Scored
        ORDER BY RiskScore DESC;
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('DenialPrediction.getHighRiskClaims', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/insightflow/predictions/risk-by-payer
   * Payer-level risk breakdown: denial rate, claim count, risk tier
   */
  public getRiskByPayer = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const xenCustId = extractCustomerId(_req);
      const custRRDirect = xenCustId != null ? 'AND customer_id = @_custId' : '';

      const bpReq = pool.request();
      if (xenCustId != null) bpReq.input('_custId', sql.Int, xenCustId);
      const result = await bpReq.query(`
        SELECT TOP 25
          InsuranceName AS payerName,
          COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END) AS totalClaims,
          COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) AS deniedClaims,
          ISNULL(SUM(CASE WHEN TrxType = 'Charge' THEN TrxAmt ELSE 0 END), 0) AS totalCharges,
          ISNULL(SUM(CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN TrxAmt ELSE 0 END), 0) AS deniedCharges,
          CAST(
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 100.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0)
          AS DECIMAL(5,1)) AS denialRate,
          -- Tier thresholds: High = >15% (3x industry avg of 5%), Medium = 10-15% (2x avg)
          CASE
            WHEN COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
                 NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) >= 0.15 THEN 'High'
            WHEN COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
                 NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) >= 0.10 THEN 'Medium'
            ELSE 'Low'
          END AS riskTier
        FROM dbo.recon_report
        WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
          AND InsuranceName IS NOT NULL AND InsuranceName != ''
          ${custRRDirect}
        GROUP BY InsuranceName
        HAVING COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END) >= 5
        ORDER BY denialRate DESC;
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('DenialPrediction.getRiskByPayer', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/insightflow/predictions/risk-by-reason
   * Risk by CARC code: which denial reasons are driving the most risk
   */
  public getRiskByReason = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const xenCustId = extractCustomerId(_req);
      const custRRDirect = xenCustId != null ? 'AND rr.customer_id = @_custId' : '';

      const rrReq = pool.request();
      if (xenCustId != null) rrReq.input('_custId', sql.Int, xenCustId);
      const result = await rrReq.query(`
        SELECT TOP 15
          rr.CARCCode AS carcCode,
          -- Normalize hyphenated codes (e.g. "CO-45" -> "CO45") for description lookup
          ISNULL(cc.Description, rr.CARCCode) AS reasonDescription,
          COUNT(DISTINCT rr.ClaimID) AS deniedClaims,
          ISNULL(SUM(rr.TrxAmt), 0) AS deniedCharges,
          -- Avg time to resolve (claims that have been worked to completion)
          ISNULL(AVG(
            CASE WHEN ch.ClaimWorkEndedTime IS NOT NULL
              THEN DATEDIFF(DAY, rr.DateOfService, ch.ClaimWorkEndedTime)
            END
          ), 0) AS avgResolutionDays,
          -- Recovery rate: % of denied claims eventually Accepted or Completed
          CAST(
            COUNT(DISTINCT CASE WHEN ch.ClaimStatus IN ('Accepted','Completed') THEN rr.ClaimID END) * 100.0 /
            NULLIF(COUNT(DISTINCT rr.ClaimID), 0)
          AS DECIMAL(5,1)) AS recoveryRate
        FROM dbo.recon_report rr
        LEFT JOIN dbo.carccodes cc ON cc.CARCCode = REPLACE(rr.CARCCode, '-', '')
        LEFT JOIN dbo.claimhistory ch ON ch.ClaimID = rr.ClaimID
        WHERE rr.IsClaimDenied = 1
          AND rr.TrxType = 'Charge'
          AND rr.CARCCode IS NOT NULL AND rr.CARCCode != ''
          AND rr.DateOfService >= DATEADD(MONTH, -12, GETDATE())
          ${custRRDirect}
        GROUP BY rr.CARCCode, cc.Description
        ORDER BY deniedCharges DESC;
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('DenialPrediction.getRiskByReason', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/insightflow/predictions/risk-trend
   * Monthly risk score trend: avg risk score + high-risk count over last 12 months
   */
  public getRiskTrend = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const xenCustId = extractCustomerId(_req);
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');

      const custRRDirect = xenCustId != null ? 'AND customer_id = @_custId' : '';
      const trendReq = pool.request();
      custC.addInputs(trendReq);
      const result = await trendReq.query(`
        ;WITH DenialRates AS (
          SELECT
            InsuranceName,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS PayerDenialRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -18, GETDATE())
            AND InsuranceName IS NOT NULL AND InsuranceName != ''
            ${custRRDirect}
          GROUP BY InsuranceName
        ),
        ProcedureRates AS (
          SELECT
            CPT,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS ProcedureDenialRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -18, GETDATE())
            AND CPT IS NOT NULL AND CPT != ''
            ${custRRDirect}
          GROUP BY CPT
        ),
        MonthlyScores AS (
          SELECT
            FORMAT(c.DateOfService, 'yyyy-MM') AS PeriodLabel,
            c.ClaimID,
            CAST(
              CASE
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.20 THEN 35
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.15 THEN 28
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.10 THEN 18
                WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.05 THEN 8
                ELSE 2
              END
              + CASE
                WHEN ISNULL(prr.ProcedureDenialRate, 0.12) >= 0.20 THEN 30
                WHEN ISNULL(prr.ProcedureDenialRate, 0.12) >= 0.15 THEN 22
                WHEN ISNULL(prr.ProcedureDenialRate, 0.12) >= 0.10 THEN 14
                WHEN ISNULL(prr.ProcedureDenialRate, 0.12) >= 0.05 THEN 6
                ELSE 2
              END
              + CASE WHEN c.ChargeAmt >= 5000 THEN 10 WHEN c.ChargeAmt >= 2000 THEN 5 ELSE 0 END
              + CASE WHEN rr.PrimarySecondaryTertiary IN ('Secondary','Tertiary') THEN 8 ELSE 0 END
            AS INT) AS RiskScore
          FROM dbo.claims c
          JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID AND rr.TrxType = 'Charge'
          LEFT JOIN DenialRates dr ON dr.InsuranceName = rr.InsuranceName
          LEFT JOIN ProcedureRates prr ON prr.CPT = rr.CPT
          WHERE c.DateOfService >= DATEADD(MONTH, -12, GETDATE())
            ${custC.where}
        )
        SELECT
          PeriodLabel AS period,
          COUNT(DISTINCT ClaimID) AS totalClaims,
          COUNT(DISTINCT CASE WHEN RiskScore >= 70 THEN ClaimID END) AS highRiskClaims,
          CAST(AVG(CAST(RiskScore AS FLOAT)) AS DECIMAL(5,1)) AS avgRiskScore
        FROM MonthlyScores
        GROUP BY PeriodLabel
        ORDER BY PeriodLabel;
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('DenialPrediction.getRiskTrend', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/insightflow/predictions/score/:claimId
   * Score a single claim - used from the claim detail view
   */
  public scoreClaimById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const pool = (this as any).pool as sql.ConnectionPool;
      const xenCustId = extractCustomerId(req);
      const custRRDirect = xenCustId != null ? 'AND customer_id = @_custId' : '';
      const custCDirect = xenCustId != null ? 'AND c.customer_id = @_custId' : '';

      const scoreReq = pool.request()
        .input('claimId', sql.NVarChar(50), claimId);
      if (xenCustId != null) scoreReq.input('_custId', sql.Int, xenCustId);

      const result = await scoreReq.query(`
        ;WITH DenialRates AS (
          SELECT
            InsuranceName,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS PayerDenialRate,
            COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END) AS PayerClaimCount
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND InsuranceName IS NOT NULL AND InsuranceName != ''
            ${custRRDirect}
          GROUP BY InsuranceName
        ),
        ProviderRates AS (
          SELECT
            ProviderName,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) * 1.0 /
            NULLIF(COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END), 0) AS ProviderDenialRate
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND ProviderName IS NOT NULL AND ProviderName != ''
            ${custRRDirect}
          GROUP BY ProviderName
        ),
        CARCRates AS (
          SELECT
            CARCCode,
            COUNT(DISTINCT ClaimID) AS CodeDeniedCount,
            ISNULL(AVG(TrxAmt), 0) AS AvgDeniedCharge
          FROM dbo.recon_report
          WHERE IsClaimDenied = 1 AND TrxType = 'Charge'
            AND DateOfService >= DATEADD(MONTH, -12, GETDATE())
            AND CARCCode IS NOT NULL AND CARCCode != ''
            ${custRRDirect}
          GROUP BY CARCCode
        )
        SELECT
          c.ClaimID AS claimId,
          c.ChargeAmt AS chargeAmt,
          c.DateOfService AS dateOfService,
          rr.InsuranceName AS insuranceName,
          rr.ProviderName AS providerName,
          rr.CARCCode AS carcCode,
          rr.PrimarySecondaryTertiary AS coverageType,
          rr.IsClaimDenied AS isDenied,
          CAST(ISNULL(dr.PayerDenialRate, 0.15) * 100 AS DECIMAL(5,1)) AS payerDenialPct,
          CAST(ISNULL(pr.ProviderDenialRate, 0.10) * 100 AS DECIMAL(5,1)) AS providerDenialPct,
          ISNULL(cr.CodeDeniedCount, 0) AS carcDeniedCount,
          ISNULL(dr.PayerClaimCount, 0) AS payerClaimVolume,
          -- Composite risk score (calibrated to ADA/MGMA: industry avg denial = 5%)
          CAST(
            CASE
              WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.20 THEN 30
              WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.15 THEN 24
              WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.10 THEN 16
              WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.05 THEN 8
              ELSE 3
            END
            + CASE
              WHEN ISNULL(pr.ProviderDenialRate, 0.10) >= 0.20 THEN 15
              WHEN ISNULL(pr.ProviderDenialRate, 0.10) >= 0.15 THEN 11
              WHEN ISNULL(pr.ProviderDenialRate, 0.10) >= 0.10 THEN 7
              ELSE 3
            END
            + CASE
              WHEN c.ChargeAmt >= 5000 THEN 15
              WHEN c.ChargeAmt >= 2000 THEN 10
              WHEN c.ChargeAmt >= 500  THEN 5
              ELSE 2
            END
            + CASE
              WHEN rr.PrimarySecondaryTertiary IN ('Secondary', 'Tertiary') THEN 10
              ELSE 2
            END
            + CASE
              WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 90 THEN 12
              WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 60 THEN 8
              WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 30 THEN 4
              ELSE 0
            END
            + CASE
              WHEN rr.CARCCode IS NOT NULL AND rr.CARCCode != '' AND rr.IsClaimDenied = 1 THEN 18
              ELSE 0
            END
          AS INT) AS riskScore,
          -- Risk factors breakdown
          CASE
            WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.15 THEN 'High payer denial rate (>15% \u2014 3x industry avg)'
            WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.10 THEN 'Elevated payer denial rate (10\u201315% \u2014 2x industry avg)'
            WHEN ISNULL(dr.PayerDenialRate, 0.15) >= 0.05 THEN 'Above-average payer denial rate (5\u201310%)'
            ELSE 'Low payer denial rate (<5% \u2014 at industry avg)'
          END AS payerRiskFactor,
          CASE
            WHEN c.ChargeAmt >= 5000 THEN 'High charge amount'
            WHEN c.ChargeAmt >= 2000 THEN 'Moderate charge amount'
            ELSE 'Standard charge amount'
          END AS chargeRiskFactor,
          CASE
            WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 90 THEN 'Aging > 90 days'
            WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 60 THEN 'Aging > 60 days'
            WHEN DATEDIFF(DAY, c.DateOfService, GETDATE()) > 30 THEN 'Aging > 30 days'
            ELSE 'Recent claim'
          END AS agingRiskFactor
        FROM dbo.claims c
        JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID AND rr.TrxType = 'Charge'
        LEFT JOIN DenialRates dr ON dr.InsuranceName = rr.InsuranceName
        LEFT JOIN ProviderRates pr ON pr.ProviderName = rr.ProviderName
        LEFT JOIN CARCRates cr ON cr.CARCCode = rr.CARCCode
        WHERE c.ClaimID = @claimId
          ${custCDirect};
      `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: 'Claim not found' });
      }

      const row = result.recordset[0];
      return res.status(200).json({
        data: {
          ...row,
          riskTier: row.riskScore >= 70 ? 'High' : row.riskScore >= 40 ? 'Medium' : 'Low',
          riskFactors: [
            row.payerRiskFactor,
            row.chargeRiskFactor,
            row.agingRiskFactor,
            row.coverageType === 'Secondary' || row.coverageType === 'Tertiary'
              ? 'Non-primary coverage' : null,
            row.isDenied ? 'Already denied' : null,
          ].filter(Boolean),
        },
      });
    } catch (error: unknown) {
      logger.error('DenialPrediction.scoreClaimById', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
