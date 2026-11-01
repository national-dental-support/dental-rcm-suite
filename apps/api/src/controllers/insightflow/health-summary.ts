import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import logger from '../../utils/logger';

type SectionStatus = 'green' | 'yellow' | 'red';

interface SectionHealth {
  section: string;
  status: SectionStatus;
  metric: string;
  updatedAt: string;
}

function rag(value: number, greenMax: number, yellowMax: number): SectionStatus {
  if (value <= greenMax) return 'green';
  if (value <= yellowMax) return 'yellow';
  return 'red';
}

function ragAbove(value: number, greenMin: number, yellowMin: number): SectionStatus {
  if (value >= greenMin) return 'green';
  if (value >= yellowMin) return 'yellow';
  return 'red';
}

function worst(...statuses: SectionStatus[]): SectionStatus {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}

export class HealthSummaryController extends DatabaseConnectionController {
  constructor() { super(); }

  public getHealth = async (_req: Request, res: Response): Promise<Response> => {
    const now = new Date().toISOString();
    const sections: SectionHealth[] = [];

    // Enterprise isolation
    const xenCustId = extractCustomerId(_req);
    const custWhere = xenCustId != null
      ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = recon_report.ClaimID AND c_cust.customer_id = @_custId)`
      : '';
    const custWhereRR = xenCustId != null
      ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = rr.ClaimID AND c_cust.customer_id = @_custId)`
      : '';
    const addCustInput = (r: sql.Request) => { if (xenCustId != null) r.input('_custId', sql.Int, xenCustId); };

    // -- 1. Denial Management ----------------------------------------------
    try {
      const r1 = this.pool.request(); addCustInput(r1);
      const r = await r1.query(`
        SELECT
          COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) AS DeniedClaims,
          COUNT(DISTINCT CASE WHEN TrxType = 'Charge' THEN ClaimID END) AS TotalClaims,
          COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge'
            AND EXISTS (SELECT 1 FROM recon_report rp WHERE rp.ClaimID = recon_report.ClaimID AND rp.TrxType = 'Payment')
            THEN ClaimID END) AS RecoveredClaims,
          COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 AND TrxType = 'Charge' THEN ClaimID END) AS TotalDenied
        FROM recon_report
        WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE()) ${custWhere}
      `);
      const row = r.recordset[0];
      const denialRate   = row.TotalClaims  > 0 ? (row.DeniedClaims    / row.TotalClaims)  * 100 : 0;
      const recoveryRate = row.TotalDenied  > 0 ? (row.RecoveredClaims / row.TotalDenied)  * 100 : 100;
      const status = worst(
        rag(denialRate, 5, 10),
        ragAbove(recoveryRate, 90, 75)
      );
      sections.push({ section: 'denials', status, metric: `Denial Rate: ${denialRate.toFixed(1)}%`, updatedAt: now });
    } catch (err) {
      logger.warn('[HealthSummary] denials section query failed', { error: String(err) });
      sections.push({ section: 'denials', status: 'yellow', metric: 'Data unavailable', updatedAt: now });
    }

    // -- 2. Accounts Receivable --------------------------------------------
    // Classic Days-in-AR formula: (AR balance x 90) / 90-day charges
    try {
      const r2 = this.pool.request(); addCustInput(r2);
      const r = await r2.query(`
        SELECT
          ISNULL(SUM(CASE WHEN TrxType = 'Charge'     THEN TrxAmt ELSE 0 END), 0)
          - ISNULL(SUM(CASE WHEN TrxType = 'Payment'   THEN TrxAmt ELSE 0 END), 0)
          - ISNULL(SUM(CASE WHEN TrxType = 'Adjustment' THEN TrxAmt ELSE 0 END), 0) AS ARBalance,
          ISNULL(SUM(CASE WHEN TrxType = 'Charge'     THEN TrxAmt ELSE 0 END), 0) AS Charges90
        FROM recon_report
        WHERE DateOfService >= DATEADD(DAY, -90, GETDATE()) ${custWhere}
      `);
      const { ARBalance, Charges90 } = r.recordset[0];
      const daysInAR = Charges90 > 0 ? Math.max(0, ARBalance * 90.0 / Charges90) : 0;
      const status = rag(daysInAR, 30, 50);
      sections.push({ section: 'ar', status, metric: `Days in AR: ${daysInAR.toFixed(0)}`, updatedAt: now });
    } catch (err) {
      logger.warn('[HealthSummary] ar section query failed', { error: String(err) });
      sections.push({ section: 'ar', status: 'yellow', metric: 'Data unavailable', updatedAt: now });
    }

    // -- 3. Revenue Cycle Management ---------------------------------------
    // Net collection rate = Payments / Charges (last 12 months)
    try {
      const r3 = this.pool.request(); addCustInput(r3);
      const r = await r3.query(`
        SELECT
          ISNULL(SUM(CASE WHEN TrxType = 'Payment' THEN TrxAmt ELSE 0 END), 0) AS TotalPayments,
          ISNULL(SUM(CASE WHEN TrxType = 'Charge'  THEN TrxAmt ELSE 0 END), 0) AS TotalCharges
        FROM recon_report
        WHERE DateOfService >= DATEADD(MONTH, -12, GETDATE()) ${custWhere}
      `);
      const { TotalPayments, TotalCharges } = r.recordset[0];
      const collRate = TotalCharges > 0 ? (TotalPayments / TotalCharges) * 100 : 0;
      const status = ragAbove(collRate, 90, 80);
      sections.push({ section: 'rcm', status, metric: `Collection Rate: ${collRate.toFixed(1)}%`, updatedAt: now });
    } catch (err) {
      logger.warn('[HealthSummary] rcm section query failed', { error: String(err) });
      sections.push({ section: 'rcm', status: 'yellow', metric: 'Data unavailable', updatedAt: now });
    }

    // -- 4. Payer Mix ------------------------------------------------------
    // Top-payer concentration: % of total charges billed to single payer
    try {
      const r4 = this.pool.request(); addCustInput(r4);
      const r = await r4.query(`
        SELECT TOP 1
          InsuranceName,
          SUM(TrxAmt) AS TopPayerCharges,
          (SELECT ISNULL(SUM(TrxAmt), 1)
           FROM recon_report
           WHERE TrxType = 'Charge'
             AND DateOfService >= DATEADD(MONTH, -12, GETDATE()) ${custWhere}) AS TotalCharges
        FROM recon_report
        WHERE TrxType = 'Charge'
          AND DateOfService >= DATEADD(MONTH, -12, GETDATE())
          AND InsuranceName IS NOT NULL ${custWhere}
        GROUP BY InsuranceName
        ORDER BY TopPayerCharges DESC
      `);
      const row = r.recordset[0];
      const concentration = row && row.TotalCharges > 0
        ? (row.TopPayerCharges / row.TotalCharges) * 100 : 0;
      const status = rag(concentration, 35, 50);
      sections.push({ section: 'payer-mix', status, metric: `Top Payer: ${concentration.toFixed(0)}%`, updatedAt: now });
    } catch (err) {
      logger.warn('[HealthSummary] payer-mix section query failed', { error: String(err) });
      sections.push({ section: 'payer-mix', status: 'yellow', metric: 'Data unavailable', updatedAt: now });
    }

    // -- 5. KPIs -----------------------------------------------------------
    // % of open (unpaid) claims that have aged > 90 days
    try {
      const r5 = this.pool.request(); addCustInput(r5);
      const r = await r5.query(`
        WITH Charges AS (
          SELECT ClaimID, MAX(DateOfService) AS DOS
          FROM recon_report
          WHERE TrxType = 'Charge'
            AND DateOfService >= DATEADD(YEAR, -2, GETDATE()) ${custWhere}
          GROUP BY ClaimID
        ),
        Paid AS (
          SELECT DISTINCT ClaimID
          FROM recon_report
          WHERE TrxType = 'Payment' ${custWhere}
        ),
        OpenClaims AS (
          SELECT c.ClaimID, c.DOS
          FROM Charges c
          WHERE c.ClaimID NOT IN (SELECT ClaimID FROM Paid)
        )
        SELECT
          COUNT(*) AS TotalOpen,
          SUM(CASE WHEN DATEDIFF(DAY, DOS, GETDATE()) > 90 THEN 1 ELSE 0 END) AS Over90
        FROM OpenClaims
      `);
      const { TotalOpen, Over90 } = r.recordset[0];
      const pctOver90 = TotalOpen > 0 ? (Over90 / TotalOpen) * 100 : 0;
      const status = rag(pctOver90, 10, 20);
      sections.push({ section: 'kpi', status, metric: `Aging >90d: ${pctOver90.toFixed(0)}%`, updatedAt: now });
    } catch (err) {
      logger.warn('[HealthSummary] kpi section query failed', { error: String(err) });
      sections.push({ section: 'kpi', status: 'yellow', metric: 'Data unavailable', updatedAt: now });
    }

    return res.json({ sections });
  };
}
