import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { expandWithAliases } from '../../../utils/expand-filter';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class MatchStats extends DatabaseConnectionController {
  constructor() {
    super();
  }

  private normalizeCsv(input: unknown): string | null {
    if (!input) return null;

    const values: string[] = Array.isArray(input)
      ? input.map(v => String(v))
      : String(input).split(',');

    const cleaned = values
      .map(v => v.trim())
      .filter(Boolean)
      .filter(v => v.toLowerCase() !== 'all');

    return cleaned.length ? cleaned.join(',') : null;
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const locationScope =
        (req.query.locationScope as string | undefined)?.toLowerCase() ?? '';

      const practicesCsvRaw = this.normalizeCsv(req.query.practices);
      const payersCsv = this.normalizeCsv(req.query.payers);
      const providersCsv = this.normalizeCsv(req.query.providers);

      // Expand practice names with location aliases before filtering
      let practicesArr = practicesCsvRaw ? practicesCsvRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (practicesArr.length) practicesArr = await expandWithAliases(this.pool, 'location', practicesArr);

      const practicesCsv =
        locationScope === 'practice' && practicesArr.length ? practicesArr.join(',') : null;

      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      // Enterprise isolation - filter through EOBERAClaim -> claims
      const xenCustId = extractCustomerId(req);

      // Base CTE filter: reconciliation has RemittanceFileID -> EOBERAClaim -> claims
      const custFilterBase = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec_cust JOIN dbo.claims c_cust ON c_cust.ClaimID = ec_cust.ClaimID WHERE ec_cust.RemittanceFileID = r.RemittanceFileID AND c_cust.customer_id = @_custId)`
        : '';

      // PaymentsWithoutEOB filter: direct customer_id on bankDeposit (unmatched have no recon path)
      const custFilterBank = xenCustId != null
        ? `AND bd.customer_id = @_custId`
        : '';

      // EOBWithoutPayment filter: direct customer_id on remittanceFile (unmatched have no EOBERAClaim path)
      const custFilterRF = xenCustId != null
        ? `AND rf.customer_id = @_custId`
        : '';

      const request = this.pool.request();
      request.input('practicesCsv', sql.NVarChar, practicesCsv ?? null);
      request.input('from', sql.NVarChar, from ?? null);
      request.input('to', sql.NVarChar, to ?? null);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const sqlText = `
        ;WITH Base AS (
          SELECT
            r.RemittanceFileID,
            r.BankDepositID,
            r.MatchFlag,
            COALESCE(cph.PostedFlag, 0) AS PostedFlag,
            rf.PracticeLocation,
            rf.FileDate,
            bd.DepositDate
          FROM dbo.reconciliation r
          LEFT JOIN dbo.claimPostHistory cph
            ON r.RemittanceFileID = cph.RemittanceFileID
          LEFT JOIN dbo.remittanceFile rf
            ON r.RemittanceFileID = rf.RemittanceFileID
          LEFT JOIN dbo.bankDeposit bd
            ON r.BankDepositID = bd.BankDepositID
          WHERE (
            @practicesCsv IS NULL OR EXISTS (
              SELECT 1
              FROM STRING_SPLIT(@practicesCsv, ',') s
              WHERE LTRIM(RTRIM(s.value)) = rf.PracticeLocation
            )
          )
          AND (@from IS NULL OR COALESCE(rf.FileDate, bd.DepositDate) >= @from)
          AND (@to   IS NULL OR COALESCE(rf.FileDate, bd.DepositDate) <= @to)
          ${custFilterBase}
        ),
        PaymentsWithoutEOB AS (
          SELECT COUNT(*) AS cnt
          FROM dbo.bankDeposit bd
          WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.reconciliation r
            WHERE r.BankDepositID = bd.BankDepositID
          )
          AND (@from IS NULL OR bd.DepositDate >= @from)
          AND (@to   IS NULL OR bd.DepositDate <= @to)
          ${custFilterBank}
        ),
        EOBWithoutPayment AS (
          SELECT COUNT(*) AS cnt
          FROM dbo.remittanceFile rf
          WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.reconciliation r
            WHERE r.RemittanceFileID = rf.RemittanceFileID
              AND r.MatchFlag = 1
          )
          AND (
            @practicesCsv IS NULL OR EXISTS (
              SELECT 1
              FROM STRING_SPLIT(@practicesCsv, ',') s
              WHERE LTRIM(RTRIM(s.value)) = rf.PracticeLocation
            )
          )
          AND (@from IS NULL OR rf.FileDate >= @from)
          AND (@to   IS NULL OR rf.FileDate <= @to)
          ${custFilterRF}
        )
        SELECT
          SUM(CASE WHEN MatchFlag = 1 AND PostedFlag = 0 THEN 1 ELSE 0 END) AS payment_eob_matched,
          SUM(CASE WHEN MatchFlag = 1 AND PostedFlag = 1 THEN 1 ELSE 0 END) AS fully_reconciled_posted,
          (SELECT cnt FROM PaymentsWithoutEOB) AS payments_without_eob,
          (SELECT cnt FROM EOBWithoutPayment)  AS eob_without_payments
        FROM Base;
      `;

      const result = await request.query(sqlText);
      const row = result.recordset?.[0] ?? {};

      const stats = [
        {
          key: 'payment_eob_matched',
          label: 'Payment and EOB/ERA Matched',
          value: Number(row.payment_eob_matched ?? 0),
          route: '/matching?status=matched',
        },
        {
          key: 'payments_without_eob',
          label: 'Payments without EOB/ERA',
          value: Number(row.payments_without_eob ?? 0),
          route: '/payment-reconciliation?status=payment_without_eob',
        },
        {
          key: 'eob_without_payments',
          label: 'EOB/ERA without Payments',
          value: Number(row.eob_without_payments ?? 0),
          route: '/payment-reconciliation?status=eob_without_payment',
        },
        {
          key: 'escalated_bank_issues',
          label: 'Escalated Bank Issues',
          value: 0,
          route: '/payment-reconciliation?status=escalated_bank_issues',
        },
        {
          key: 'fully_reconciled_posted',
          label: 'Fully Reconciled and Posted',
          value: Number(row.fully_reconciled_posted ?? 0),
          route: '/matching?status=fully_reconciled_posted',
        },
      ];

      return res.status(200).json({
        message: 'Recon IQ match-stats',
        asOf: new Date().toISOString(),
        filters: {
          locationScope,
          practices: practicesCsv,
          payers: payersCsv,
          providers: providersCsv,
          from,
          to,
        },
        stats,
      });
    } catch (error: unknown) {
      logger.error('MatchStats.get \u2013 error building response', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
