import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export interface BuilderInfoRow {
  payerContractId: number;
  cpt: string;
  volume: number;
  currentAllowed: number;
  avgPaid: number;
  totalCharges: number;
  underpaidDollars: number;
}

export interface BuilderInfoSummary {
  underpaymentCount: number;
  underpaymentDollars: number;
  avgPaymentLagDays: number;
  totalDenials: number;
}

export class BuilderInfo extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const payerContractIdRaw = req.query.payerContractId;
      const payerContractId =
        payerContractIdRaw !== undefined ? Number(String(payerContractIdRaw).trim()) : null;

      if (payerContractId === null || !Number.isFinite(payerContractId) || payerContractId <= 0) {
        return res.status(400).json({
          message: 'payerContractId is required and must be a positive number',
          data: [],
        });
      }

      const endStr = typeof req.query.end === 'string' ? req.query.end.trim() : null;
      const startStr = typeof req.query.start === 'string' ? req.query.start.trim() : null;

      const parseYYYYMMDD = (s: string | null): Date | null => {
        if (!s) return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
        const d = new Date(`${s}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
      };

      const endDate = parseYYYYMMDD(endStr) ?? new Date();
      const startDate = parseYYYYMMDD(startStr) ?? (() => {
        const d = new Date(endDate);
        d.setMonth(d.getMonth() - 12);
        return d;
      })();

      if (startDate.getTime() > endDate.getTime()) {
        return res.status(400).json({
          message: 'start must be <= end',
          data: [],
        });
      }

      const startISO = startDate.toISOString().slice(0, 10);
      const endISO = endDate.toISOString().slice(0, 10);

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custWhere   = xenCustId != null ? 'AND r.customer_id = @_custId'  : '';
      const plCustWhere = xenCustId != null ? 'AND customer_id   = @_custId'  : '';
      const rrCustWhere = xenCustId != null ? 'AND rr2.customer_id = @_custId' : '';
      const rr3CustWhere = xenCustId != null ? 'AND rr3.customer_id = @_custId' : '';

      // Uses recon_report for CPT-level payment analysis.
      // payerContractId maps to ABS(CHECKSUM(InsuranceName)) from contract-options.
      // CPT is taken directly from recon_report.CPT - no serviceline JOIN needed.
      const query = `
      WITH payer_lookup AS (
        SELECT DISTINCT InsuranceName
        FROM dbo.recon_report
        WHERE ABS(CHECKSUM(InsuranceName)) = @payerContractId
          ${plCustWhere}
      ),
      tx AS (
        SELECT
          r.ClaimID,
          r.DateOfService,
          UPPER(LTRIM(RTRIM(COALESCE(r.CPT, '')))) AS CPT,
          SUM(CASE WHEN r.TrxType = 'Payment' THEN CAST(r.TrxAmt AS decimal(18,2)) ELSE 0 END) AS PaidAmt,
          SUM(CASE WHEN r.TrxType = 'Charge'  THEN CAST(r.TrxAmt AS decimal(18,2)) ELSE 0 END) AS ChargedAmt
        FROM dbo.recon_report r
        JOIN payer_lookup pl
          ON r.InsuranceName = pl.InsuranceName
        WHERE r.DateOfService >= @start
          AND r.DateOfService < DATEADD(DAY, 1, @end)
          AND r.TrxType IN ('Payment', 'Charge')
          AND r.CPT IS NOT NULL
          AND r.CPT <> ''
          ${custWhere}
        GROUP BY
          r.ClaimID,
          r.DateOfService,
          UPPER(LTRIM(RTRIM(COALESCE(r.CPT, ''))))
      ),
      cpt_rollup AS (
        SELECT
          @payerContractId AS PayerContractID,
          tx.CPT,
          COUNT(*) AS Volume,
          AVG(tx.ChargedAmt) AS CurrentAllowed,
          AVG(tx.PaidAmt) AS AvgPaid,
          SUM(tx.ChargedAmt) AS TotalCharges,
          SUM(CASE WHEN tx.PaidAmt < tx.ChargedAmt THEN (tx.ChargedAmt - tx.PaidAmt) ELSE 0 END) AS UnderpaidDollars,
          SUM(CASE WHEN tx.PaidAmt < tx.ChargedAmt THEN 1 ELSE 0 END) AS UnderpaidCount
        FROM tx
        GROUP BY tx.CPT
      )
      SELECT
        SUM(r.UnderpaidCount)   OVER () AS UnderpaymentCount,
        SUM(r.UnderpaidDollars) OVER () AS UnderpaymentDollars,
        COALESCE((SELECT AVG(DATEDIFF(DAY, rr2.DateOfService, rr2.PaymentPostDate)) FROM dbo.recon_report rr2 WHERE rr2.TrxType = 'Payment' AND rr2.PaymentPostDate IS NOT NULL AND rr2.InsuranceName IN (SELECT InsuranceName FROM payer_lookup) AND rr2.DateOfService >= DATEADD(MONTH, -12, GETDATE()) ${rrCustWhere}), 0) AS AvgPaymentLagDays,
        COALESCE((SELECT COUNT(DISTINCT rr3.ClaimID) FROM dbo.recon_report rr3 WHERE rr3.IsClaimDenied = 1 AND rr3.InsuranceName IN (SELECT InsuranceName FROM payer_lookup) AND rr3.DateOfService >= DATEADD(MONTH, -12, GETDATE()) ${rr3CustWhere}), 0) AS TotalDenials,
        r.PayerContractID,
        r.CPT,
        r.Volume,
        CAST(r.CurrentAllowed   AS decimal(18,2)) AS CurrentAllowed,
        CAST(r.AvgPaid          AS decimal(18,2)) AS AvgPaid,
        CAST(r.TotalCharges     AS decimal(18,2)) AS TotalCharges,
        CAST(r.UnderpaidDollars AS decimal(18,2)) AS UnderpaidDollars
      FROM cpt_rollup r
      WHERE r.UnderpaidDollars > 0
      ORDER BY r.UnderpaidDollars DESC, r.TotalCharges DESC;
      `;

      logger.info('BuilderInfo.get \u2192 executing builder info query', {
        payerContractId,
        start: startISO,
        end: endISO,
      });

      const request = this.pool.request();
      request.input('payerContractId', sql.Int, payerContractId);
      request.input('start', sql.Date, startDate);
      request.input('end', sql.Date, endDate);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(query);
      const recordset = (result.recordset ?? []) as any[];

      const summary: BuilderInfoSummary =
        recordset.length > 0
          ? {
              underpaymentCount: Number(recordset[0].UnderpaymentCount ?? 0),
              underpaymentDollars: Number(recordset[0].UnderpaymentDollars ?? 0),
              avgPaymentLagDays: Number(recordset[0].AvgPaymentLagDays ?? 0),
              totalDenials: Number(recordset[0].TotalDenials ?? 0),
            }
          : {
              underpaymentCount: 0,
              underpaymentDollars: 0,
              avgPaymentLagDays: 0,
              totalDenials: 0,
            };

      const rows: BuilderInfoRow[] = recordset.map((r) => ({
        payerContractId: Number(r.PayerContractID),
        cpt: String(r.CPT),
        volume: Number(r.Volume ?? 0),
        currentAllowed: Number(r.CurrentAllowed ?? 0),
        avgPaid: Number(r.AvgPaid ?? 0),
        totalCharges: Number(r.TotalCharges ?? 0),
        underpaidDollars: Number(r.UnderpaidDollars ?? 0),
      }));

      return res.status(200).json({
        message: 'Builder info data',
        filters: {
          payerContractId,
          start: startISO,
          end: endISO,
        },
        summary,
        rows,
      });
    } catch (error: unknown) {
      logger.error('BuilderInfo.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
