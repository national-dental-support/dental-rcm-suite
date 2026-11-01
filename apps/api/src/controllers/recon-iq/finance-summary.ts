import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId, buildCustomerFilter } from '../../utils/resolve-user-scope';

/**
 * Finance Summary - CFO / Treasurer / Finance Controller view
 *
 * Pulls all PMS transaction types from recon_report and groups them into
 * standard finance categories so leadership can see the full money flow:
 *   Gross Charges -> Contractual Adjustments -> Write-offs
 *   -> Insurance Payments -> Patient Payments -> Net Collections
 */

export interface FinanceTrxGroup {
  trxType: string;
  category: 'charge' | 'insurance_payment' | 'patient_payment' | 'adjustment' | 'writeoff' | 'other';
  totalAmount: number;
  txCount: number;
}

export interface FinanceMonthRow {
  month: string;            // "YYYY-MM"
  grossCharges: number;
  insurancePayments: number;
  patientPayments: number;
  contractualAdjustments: number;
  writeOffs: number;
  otherCredits: number;
  netCollections: number;
}

export interface FinanceSummary {
  grossCharges: number;
  insurancePayments: number;
  patientPayments: number;
  contractualAdjustments: number;
  writeOffs: number;
  netCollections: number;
  netCollectionRate: number;   // percentage 0-100
  grossCollectionRate: number; // percentage 0-100
  openAR: number;
  daysInAR: number;
}

function categorise(trxType: string): FinanceTrxGroup['category'] {
  /* istanbul ignore next */
  const t = (trxType ?? '').toLowerCase().replace(/[\s-]/g, '');
  if (/charge|production/.test(t))                       return 'charge';
  if (/writeoff|woff|baddebt|courtesy|discount/.test(t)) return 'writeoff';
  if (/adjust|contractual|adj/.test(t))                  return 'adjustment';
  if (/insurance|era|eob|insur/.test(t))                 return 'insurance_payment';
  if (/patient|cash|credit|check|card|copay|debit/.test(t)) return 'patient_payment';
  if (/pay|payment/.test(t))                             return 'insurance_payment'; // default payment = insurance
  return 'other';
}

export class FinanceSummaryController extends DatabaseConnectionController {
  constructor() { super(); }

  get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const months   = Math.min(Math.max(parseInt(req.query.months as string) || 12, 1), 36);
      const location = typeof req.query.location === 'string' && req.query.location ? req.query.location : null;
      const payer    = typeof req.query.payer === 'string' && req.query.payer ? req.query.payer : null;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = buildCustomerFilter(xenCustId, 'r');

      const dbReq = this.pool.request();
      dbReq.input('months',   sql.Int,           months);
      dbReq.input('location', sql.NVarChar(200),  location);
      dbReq.input('payer',    sql.NVarChar(200),  payer);
      custFilter.addInputs(dbReq);

      const catCase = `
          CASE
            -- PayerType-based routing takes priority for standard 'Payment' TrxType
            WHEN r.TrxType = 'Payment' AND r.PayerType = 'Patient'                           THEN 'patient_payment'
            WHEN r.TrxType = 'Payment' AND (r.PayerType = 'Insurance' OR r.PayerType IS NULL) THEN 'insurance_payment'
            -- Keyword matching for non-standard PMS TrxType labels
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%charge%'      THEN 'charge'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%production%'   THEN 'charge'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%writeoff%'     THEN 'writeoff'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%woff%'         THEN 'writeoff'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%baddebt%'      THEN 'writeoff'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%courtesy%'     THEN 'writeoff'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%discount%'     THEN 'writeoff'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%adjust%'       THEN 'adjustment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%contractual%'  THEN 'adjustment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%insurance%'    THEN 'insurance_payment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%era%'          THEN 'insurance_payment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%eob%'          THEN 'insurance_payment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%patient%'      THEN 'patient_payment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%cash%'         THEN 'patient_payment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%copay%'        THEN 'patient_payment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%credit%'       THEN 'patient_payment'
            WHEN LOWER(REPLACE(REPLACE(r.TrxType, ' ', ''), '-', '')) LIKE '%pay%'          THEN 'insurance_payment'
            ELSE 'other'
          END`;

      const sqlText = `
        DECLARE @StartDate DATE = DATEADD(MONTH, -@months,
          DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));

        /* \u2500\u2500 Transaction breakdown by category & month (categorised in SQL) \u2500\u2500 */
        SELECT
          r.TrxType,
          ${catCase} AS Category,
          CONVERT(CHAR(7), COALESCE(r.PostDate, r.DateOfService), 23) AS [Month],
          SUM(COALESCE(r.TrxAmt, 0))                                   AS TotalAmt,
          COUNT(*)                                                      AS TxCount
        FROM dbo.recon_report r
        WHERE COALESCE(r.PostDate, r.DateOfService) >= @StartDate
          AND COALESCE(r.PostDate, r.DateOfService) IS NOT NULL
          AND r.TrxType  IS NOT NULL
          AND (@location IS NULL OR r.Location      = @location)
          AND (@payer    IS NULL OR r.InsuranceName = @payer)
          ${custFilter.where}
        GROUP BY
          r.TrxType,
          ${catCase},
          CONVERT(CHAR(7), COALESCE(r.PostDate, r.DateOfService), 23)
        ORDER BY [Month], r.TrxType;
      `;

      // Open AR - claims not yet fully paid (using recon_report charges vs payments)
      const arSql = `
        WITH Charges AS (
          SELECT SUM(COALESCE(r.TrxAmt, 0)) AS Total
          FROM dbo.recon_report r
          WHERE r.TrxType = 'Charge'
            AND (@location IS NULL OR r.Location = @location)
            ${custFilter.where}
        ),
        Payments AS (
          SELECT SUM(COALESCE(r.TrxAmt, 0)) AS Total
          FROM dbo.recon_report r
          WHERE r.TrxType = 'Payment'
            AND r.PostDate IS NOT NULL
            AND (@location IS NULL OR r.Location = @location)
            ${custFilter.where}
        ),
        Adj AS (
          SELECT SUM(COALESCE(r.TrxAmt, 0)) AS Total
          FROM dbo.recon_report r
          WHERE r.TrxType NOT IN ('Charge','Payment')
            AND r.PostDate IS NOT NULL
            AND (@location IS NULL OR r.Location = @location)
            ${custFilter.where}
        ),
        Last90Charges AS (
          SELECT SUM(COALESCE(r.TrxAmt, 0)) AS Total
          FROM dbo.recon_report r
          WHERE r.TrxType = 'Charge'
            AND COALESCE(r.PostDate, r.DateOfService) >= DATEADD(DAY, -90, GETDATE())
            AND (@location IS NULL OR r.Location = @location)
            ${custFilter.where}
        )
        SELECT
          ABS(COALESCE(c.Total, 0))                             AS GrossChargesAllTime,
          ABS(COALESCE(c.Total, 0))
            - ABS(COALESCE(p.Total, 0))
            - ABS(COALESCE(a.Total, 0))                         AS OpenAR,
          ABS(COALESCE(l.Total, 0)) / 90.0                     AS AvgDailyCharges
        FROM Charges c, Payments p, Adj a, Last90Charges l;
      `;

      const txReq2 = this.pool.request();
      txReq2.input('months', sql.Int, months);
      txReq2.input('location', sql.NVarChar(200), location);
      txReq2.input('payer', sql.NVarChar(200), payer);
      custFilter.addInputs(txReq2);

      const arReq2 = this.pool.request();
      arReq2.input('location', sql.NVarChar(200), location);
      custFilter.addInputs(arReq2);

      // Approved write-offs live in WriteOffRequest (not recon_report)
      const custFilterWR = buildCustomerFilter(xenCustId, 'wr', 'claim_id');
      const woReq = this.pool.request();
      woReq.input('months', sql.Int, months);
      custFilterWR.addInputs(woReq);
      const woSql = `
        DECLARE @StartDate DATE = DATEADD(MONTH, -@months,
          DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));
        SELECT ISNULL(SUM(CAST(wr.balance AS decimal(18,2))), 0) AS TotalWriteOffs
        FROM dbo.WriteOffRequest wr
        WHERE wr.status = 'approved'
          AND (wr.posted_at IS NULL OR wr.posted_at >= @StartDate)
          ${custFilterWR.where};
      `;

      const [txResult, arResult, woResult] = await Promise.all([
        txReq2.query(sqlText),
        arReq2.query(arSql),
        woReq.query(woSql),
      ]);

      // -- Aggregate by category -------------------------------------------
      const monthMap = new Map<string, {
        grossCharges: number;
        insurancePayments: number;
        patientPayments: number;
        contractualAdjustments: number;
        writeOffs: number;
        otherCredits: number;
      }>();

      const totals = {
        grossCharges: 0,
        insurancePayments: 0,
        patientPayments: 0,
        contractualAdjustments: 0,
        writeOffs: 0,
        otherCredits: 0,
      };

      const trxGroups: FinanceTrxGroup[] = [];
      const trxGroupMap = new Map<string, FinanceTrxGroup>();

      for (const row of (txResult.recordset ?? [])) {
        const month    = String(row.Month ?? '');
        const trxType  = String(row.TrxType ?? '');
        const amount   = Math.abs(Number(row.TotalAmt ?? 0));
        const txCount  = Number(row.TxCount ?? 0);
        const category = (row.Category as FinanceTrxGroup['category']) || categorise(trxType);

        // Build/update trxGroups summary
        const existing = trxGroupMap.get(trxType);
        if (existing) {
          existing.totalAmount += amount;
          existing.txCount     += txCount;
        } else {
          const g: FinanceTrxGroup = { trxType, category, totalAmount: amount, txCount };
          trxGroupMap.set(trxType, g);
          trxGroups.push(g);
        }

        // Build monthly map
        if (!monthMap.has(month)) {
          monthMap.set(month, { grossCharges: 0, insurancePayments: 0, patientPayments: 0, contractualAdjustments: 0, writeOffs: 0, otherCredits: 0 });
        }
        const m = monthMap.get(month)!;

        switch (category) {
          case 'charge':             m.grossCharges           += amount; totals.grossCharges           += amount; break;
          case 'insurance_payment':  m.insurancePayments      += amount; totals.insurancePayments      += amount; break;
          case 'patient_payment':    m.patientPayments        += amount; totals.patientPayments        += amount; break;
          case 'adjustment':         m.contractualAdjustments += amount; totals.contractualAdjustments += amount; break;
          case 'writeoff':           m.writeOffs              += amount; totals.writeOffs              += amount; break;
          default:                   m.otherCredits           += amount; totals.otherCredits           += amount; break;
        }
      }

      // Build monthly trend rows
      const monthly: FinanceMonthRow[] = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, m]) => ({
          month,
          grossCharges:           m.grossCharges,
          insurancePayments:      m.insurancePayments,
          patientPayments:        m.patientPayments,
          contractualAdjustments: m.contractualAdjustments,
          writeOffs:              m.writeOffs,
          otherCredits:           m.otherCredits,
          netCollections:         m.insurancePayments + m.patientPayments,
        }));

      // Approved write-offs from WriteOffRequest (not in recon_report)
      const approvedWriteOffs = Math.abs(Number(woResult.recordset?.[0]?.TotalWriteOffs ?? 0));
      totals.writeOffs += approvedWriteOffs;

      // AR & Days in AR
      const arRow = arResult.recordset?.[0] ?? {};
      const openAR         = Math.max(Number(arRow.OpenAR ?? 0), 0);
      const avgDailyCharges = Number(arRow.AvgDailyCharges ?? 0);
      const daysInAR       = avgDailyCharges > 0 ? Math.round(openAR / avgDailyCharges) : 0;

      // Net collection metrics
      const netCollections    = totals.insurancePayments + totals.patientPayments;
      const adjustedCharges   = totals.grossCharges - totals.contractualAdjustments - totals.writeOffs;
      const netCollectionRate = adjustedCharges > 0
        ? Math.min(Math.round((netCollections / adjustedCharges) * 100 * 10) / 10, 100)
        : 0;
      const grossCollectionRate = totals.grossCharges > 0
        ? Math.min(Math.round((netCollections / totals.grossCharges) * 100 * 10) / 10, 100)
        : 0;

      const summary: FinanceSummary = {
        grossCharges:           totals.grossCharges,
        insurancePayments:      totals.insurancePayments,
        patientPayments:        totals.patientPayments,
        contractualAdjustments: totals.contractualAdjustments,
        writeOffs:              totals.writeOffs,
        netCollections,
        netCollectionRate,
        grossCollectionRate,
        openAR,
        daysInAR,
      };

      logger.info('[FinanceSummary] success', { months, location, trxGroupCount: trxGroups.length });

      return res.status(200).json({
        message:    'Finance summary',
        asOf:       new Date().toISOString(),
        months,
        summary,
        monthly,
        byTrxType:  trxGroups,
      });
    } catch (err: any) {
      logger.error(`[FinanceSummary] error: ${err?.message ?? String(err)}`);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
