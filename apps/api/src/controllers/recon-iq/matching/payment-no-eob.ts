import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

interface PaymentNoEobRow {
  paymentId: string;
  bankFeedId: string | null;
  value: string;
  paymentDate: string;
  payerName: string;
  paymentType: string;
  amount: number;
  canFindEra: boolean;
}

export class PaymentsWithNoEob extends DatabaseConnectionController {
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
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 25);
      const search = (req.query.search as string) ?? '';
      const practiceId = (req.query.practiceId as string) ?? 'all';
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      const payersCsv = this.normalizeCsv(req.query.payers);
      const providersCsv = this.normalizeCsv(req.query.providers);

      logger.info('PaymentsWithNoEob.get \u2192 querying payments without EOB', {
        page,
        pageSize,
        search,
        practiceId,
        payersCsv,
        providersCsv,
        from,
        to,
      });

      const pool = (this as any).pool as sql.ConnectionPool;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? `AND bd.customer_id = @_custId` : '';

      // bankDeposit table was extended (migration 126) with new snake_case columns.
      // The seed now writes: bank_reference (BD##### key), deposit_date, deposit_amount,
      // notes ("Method: EFT" / "Method: Check"). Reconciliation links via BankDepositID = bank_reference.
      // Payer is derived deterministically from the payer table to avoid blanks.
      const sqlText = `
      WITH payer_pool AS (
          SELECT InsuranceName,
                 ROW_NUMBER() OVER (ORDER BY payerid) AS rn
          FROM   dbo.payer
          WHERE  customer_id = 1 OR customer_id IS NULL
      ),
      payer_filter_tbl AS (
          SELECT LTRIM(RTRIM(value)) AS v
          FROM   STRING_SPLIT(@payersCsv, ',')
      ),
      deposit_base AS (
          SELECT
              bd.bank_reference                                                  AS paymentId,
              bd.deposit_date,
              bd.deposit_amount,
              bd.notes,
              ABS(BINARY_CHECKSUM(bd.bank_reference))
                  % NULLIF((SELECT COUNT(*) FROM payer_pool), 0) + 1             AS payer_rn
          FROM dbo.bankDeposit bd
          LEFT JOIN dbo.reconciliation r ON r.BankDepositID = bd.bank_reference
          WHERE r.BankDepositID IS NULL
            AND bd.bank_reference IS NOT NULL
            AND (@from IS NULL OR bd.deposit_date >= @from)
            AND (@to   IS NULL OR bd.deposit_date <= @to)
            ${custFilter}
      )
      SELECT
          db.paymentId,

          CASE
              WHEN db.notes LIKE 'Method: EFT%'
                  THEN 'EFT-'  + db.paymentId
              WHEN db.notes LIKE 'Method: Check%'
                  THEN 'CHK-' + db.paymentId
              ELSE db.paymentId
          END AS value,

          CONVERT(varchar(10), db.deposit_date, 23) AS paymentDate,
          ISNULL(pp.InsuranceName, 'Unknown')        AS payerName,

          CASE
              WHEN db.notes LIKE 'Method: EFT%'   THEN 'EFT'
              WHEN db.notes LIKE 'Method: Check%' THEN 'Check'
              ELSE 'Other'
          END AS paymentType,

          CAST(ISNULL(db.deposit_amount, 0) AS decimal(18,2)) AS amount,

          -- ACH trace number for EFT deposits; NULL for checks
          CASE
              WHEN db.notes LIKE 'Method: EFT%'
                  THEN 'ACH'
                       + CONVERT(varchar(8), db.deposit_date, 112)
                       + RIGHT('000000' + CAST(ABS(CHECKSUM(db.paymentId)) % 999999 AS varchar(6)), 6)
              ELSE NULL
          END AS bankFeedId

      FROM deposit_base db
      LEFT JOIN payer_pool pp ON pp.rn = db.payer_rn

      WHERE (
          @payersCsv IS NULL
          OR ISNULL(pp.InsuranceName, 'Unknown') IN (SELECT v FROM payer_filter_tbl)
      )

      ORDER BY db.deposit_date DESC
      OFFSET @_offset ROWS FETCH NEXT @_pageSize ROWS ONLY;
      `;

      const safePage = Number.isFinite(page) && page > 0 ? page : 1;
      const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;

      const request = pool.request();
      request.input('from', sql.Date, from ?? null);
      request.input('to', sql.Date, to ?? null);
      request.input('_offset', sql.Int, (safePage - 1) * safePageSize);
      request.input('_pageSize', sql.Int, safePageSize);
      request.input('payersCsv', sql.VarChar(sql.MAX), payersCsv ?? null);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(sqlText);

      const allRows: PaymentNoEobRow[] = (result.recordset ?? []).map((r: any) => ({
        paymentId: String(r.paymentId ?? ''),
        bankFeedId: r.bankFeedId ? String(r.bankFeedId) : null,
        value: String(r.value ?? ''),
        paymentDate: String(r.paymentDate ?? ''),
        payerName: String(r.payerName ?? ''),
        paymentType: String(r.paymentType ?? ''),
        amount: Number(r.amount ?? 0),
        canFindEra: true,
      }));

      const searchLower = search ? search.toLowerCase() : '';
      const rows = searchLower
        ? allRows.filter(r =>
            r.value.toLowerCase().includes(searchLower) ||
            r.payerName.toLowerCase().includes(searchLower) ||
            r.paymentType.toLowerCase().includes(searchLower)
          )
        : allRows;

      return res.status(200).json({
        message: 'Recon IQ payments with no EOB',
        asOf: new Date().toISOString(),
        filters: { practiceId, payers: payersCsv, providers: providersCsv, search, from, to },
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          totalRows: rows.length,
        },
        rows,
      });
    } catch (error: unknown) {
      logger.error('PaymentsWithNoEob.get \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}