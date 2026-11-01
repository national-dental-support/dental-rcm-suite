import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

interface EobNoPaymentRow {
  eobId: string;
  value: string;
  eobDate: string;
  payerName: string;
  eobType: string;
  amount: number;
  canFindPayment: boolean;
}

export class EobWithNoPayment extends DatabaseConnectionController {
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

  private parsePracticeLocations(req: Request): { mode: 'all' | 'single' | 'list'; values: string[] } {
    const practiceId = (req.query.practiceId as string) ?? 'all';
    const practicesRaw = req.query.practices as unknown;

    const valuesFromPractices = (() => {
      if (!practicesRaw) return [];
      if (Array.isArray(practicesRaw)) return practicesRaw.map(String).flatMap(v => v.split(','));
      return String(practicesRaw).split(',');
    })()
      .map(s => s.trim())
      .filter(Boolean);

    if (valuesFromPractices.length) {
      return { mode: 'list', values: valuesFromPractices };
    }

    if (practiceId && practiceId !== 'all') {
      return { mode: 'single', values: [practiceId] };
    }

    return { mode: 'all', values: [] };
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 25);
      const search = (req.query.search as string) ?? '';
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      const payersCsv = this.normalizeCsv(req.query.payers);
      const providersCsv = this.normalizeCsv(req.query.providers);

      const practiceFilter = this.parsePracticeLocations(req);

      logger.info('EobWithNoPayment.get \u2192 querying EOBs with no payment', {
        page,
        pageSize,
        search,
        from,
        to,
        practiceFilter,
        payersCsv,
        providersCsv,
      });

      const pool = (this as any).pool as sql.ConnectionPool;
      const request = pool.request();

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND (rf.customer_id = @_custId OR EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec_cust JOIN dbo.claims c_cust ON c_cust.ClaimID = ec_cust.ClaimID WHERE ec_cust.RemittanceFileID = rf.RemittanceFileID AND c_cust.customer_id = @_custId))`
        : '';
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      request.input('from', sql.Date, from ?? null);
      request.input('to', sql.Date, to ?? null);
      request.input('payersCsv', sql.VarChar(sql.MAX), payersCsv ?? null);
      request.input('providersCsv', sql.VarChar(sql.MAX), providersCsv ?? null);

      const safePage = Number.isFinite(page) && page > 0 ? page : 1;
      const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;
      request.input('_offset', sql.Int, (safePage - 1) * safePageSize);
      request.input('_pageSize', sql.Int, safePageSize);

      if (practiceFilter.mode === 'single') {
        request.input('practiceLocation', sql.VarChar(100), practiceFilter.values[0]);
      } else if (practiceFilter.mode === 'list') {
        practiceFilter.values.forEach((v, i) => {
          request.input(`practiceLocation${i}`, sql.VarChar(100), v);
        });
      }

      const wherePractice =
        practiceFilter.mode === 'all'
          ? ''
          : practiceFilter.mode === 'single'
            ? `AND rf.PracticeLocation = @practiceLocation`
            : `AND rf.PracticeLocation IN (${practiceFilter.values.map((_, i) => `@practiceLocation${i}`).join(', ')})`;

      const sqlText = `

        WITH payer_pool AS (
            SELECT InsuranceName,
                   ROW_NUMBER() OVER (ORDER BY payerid) AS rn
            FROM   dbo.payer
            WHERE  customer_id = 1 OR customer_id IS NULL
        ),
        payer_filter AS (
          SELECT LTRIM(RTRIM(value)) AS v
          FROM STRING_SPLIT(@payersCsv, ',')
        ),
        provider_filter AS (
          SELECT LTRIM(RTRIM(value)) AS v
          FROM STRING_SPLIT(@providersCsv, ',')
        )

        SELECT
            rf.RemittanceFileID                           AS eobId,
            CONVERT(varchar(10), rf.FileDate, 23)         AS eobDate,
            ISNULL(
                MAX(pay.InsuranceName),
                (SELECT TOP(1) pp2.InsuranceName FROM payer_pool pp2
                 WHERE pp2.rn = ABS(BINARY_CHECKSUM(rf.RemittanceFileID))
                                % NULLIF((SELECT COUNT(*) FROM payer_pool), 0) + 1)
            )                                             AS payerName,
            rf.FileType                                   AS eobType,
            CAST(ISNULL(rf.Amount, 0) AS decimal(18,2))   AS amount,
            CONCAT('RF-', CAST(rf.RemittanceFileID AS varchar(50))) AS value

        FROM dbo.remittanceFile rf
        LEFT JOIN dbo.reconciliation r
            ON r.RemittanceFileID = rf.RemittanceFileID
        LEFT JOIN dbo.EOBERAClaim eec
            ON eec.RemittanceFileID = rf.RemittanceFileID
        LEFT JOIN dbo.claims c
            ON c.ClaimID = eec.ClaimID
        LEFT JOIN dbo.payer pay
            ON pay.PayerID = c.PayerID
        LEFT JOIN dbo.provider prov
            ON prov.ProviderID = c.ProviderID

        WHERE r.RemittanceFileID IS NULL
          AND (@from IS NULL OR rf.FileDate >= @from)
          AND (@to   IS NULL OR rf.FileDate <= @to)
          ${wherePractice}
          ${custFilter}
          AND (
            @payersCsv IS NULL
            OR pay.InsuranceName IN (SELECT v FROM payer_filter)
          )
          AND (
            @providersCsv IS NULL
            OR prov.Provider IN (SELECT v FROM provider_filter)
          )

        GROUP BY
            rf.RemittanceFileID,
            rf.FileDate,
            rf.FileType,
            rf.Amount

        ORDER BY rf.FileDate DESC
        OFFSET @_offset ROWS FETCH NEXT @_pageSize ROWS ONLY;
      `;

      const result = await request.query(sqlText);

      const allRows: EobNoPaymentRow[] = (result.recordset ?? []).map((r: any) => ({
        eobId: String(r.eobId ?? ''),
        value: String(r.value ?? ''),
        eobDate: String(r.eobDate ?? ''),
        payerName: String(r.payerName ?? ''),
        eobType: String(r.eobType ?? ''),
        amount: Number(r.amount ?? 0),
        canFindPayment: true,
      }));

      const rows = allRows;

      return res.status(200).json({
        message: 'Recon IQ EOBs with no payment',
        asOf: new Date().toISOString(),
        filters: {
          practiceId: (req.query.practiceId as string) ?? 'all',
          practices: req.query.practices ?? null,
          payers: payersCsv,
          providers: providersCsv,
          from,
          to,
          search,
        },
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          totalRows: rows.length,
        },
        rows,
      });
    } catch (error: unknown) {
      logger.error('EobWithNoPayment.get \u2013 error building response', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}