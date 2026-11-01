import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

interface ClaimRow {
  claimId: string;
  dateClaimSubmitted: string;
  amount: number;
  claimStatus: 'PAID' | 'DENIED' | 'PENDED' | 'ZERO_PAY';
}

interface ReconciliationRow {
  eobId: string;
  eobDate: string;
  totalAmount: number;
  locationName: string;
  taxId: string;
  claimsWithMoneyCount: number;
  claimsZeroOpenCount: number;
  postingStatus: string;
  claims: ClaimRow[];
}

type FlatRow = {
  eobId: string;
  eobDate: string;
  totalAmount: number;
  locationName: string;
  remittanceClaimId: string | null;

  claimId: string | null;
  dateClaimSubmitted: string | null;
  amount: number | null;
  claimStatus: ClaimRow['claimStatus'] | null;

  isPosted: number | null;
};

export class PaymentReconciliation extends DatabaseConnectionController {
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

  private pickPracticeLocation(req: Request): string {
    const practiceId = (req.query.practiceId as string) ?? 'all';
    const practicesRaw = req.query.practices as any;
    const practices =
      Array.isArray(practicesRaw) ? practicesRaw : practicesRaw ? [practicesRaw] : [];

    const locationScope = (req.query.locationScope as string) ?? '';
    const firstPractice = (practices[0] ?? '').toString().trim();

    if (locationScope === 'practice' && firstPractice) return firstPractice;
    if (practiceId && practiceId !== 'all') return practiceId;
    return 'all';
  }

  private nestRows(flatRows: FlatRow[]): ReconciliationRow[] {
    const byEob = new Map<string, ReconciliationRow>();

    for (const r of flatRows) {
      /* istanbul ignore next */
      if (!r?.eobId) continue;

      if (!byEob.has(r.eobId)) {
        byEob.set(r.eobId, {
          eobId: r.eobId,
          eobDate: r.eobDate,
          totalAmount: Number(r.totalAmount ?? 0),
          locationName: r.locationName ?? '',
          taxId: '',
          claimsWithMoneyCount: 0,
          claimsZeroOpenCount: 0,
          postingStatus: 'UNPOSTED',
          claims: [],
        });
      }

      const parent = byEob.get(r.eobId)!;

      if (r.claimId) {
        parent.claims.push({
          claimId: String(r.claimId),
          dateClaimSubmitted: r.dateClaimSubmitted ?? '',
          amount: Number(r.amount ?? 0),
          claimStatus: (r.claimStatus ?? 'PENDED') as ClaimRow['claimStatus'],
        });
      }
    }

    return Array.from(byEob.values()).map((row) => {
      /* istanbul ignore next */
      row.claimsWithMoneyCount = row.claims.filter((c) => (c.amount ?? 0) > 0).length;
      /* istanbul ignore next */
      row.claimsZeroOpenCount = row.claims.filter((c) => (c.amount ?? 0) <= 0).length;
      return row;
    });
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 25);
      const search = (req.query.search as string) ?? '';

      const practiceLocation = this.pickPracticeLocation(req);
      const payersCsv = this.normalizeCsv(req.query.payers);
      const providersCsv = this.normalizeCsv(req.query.providers);

      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      logger.info('PaymentReconciliation.get \u2192 querying reconciled, unposted EOBs', {
        page,
        pageSize,
        search,
        practiceLocation,
        payersCsv,
        providersCsv,
        from,
        to,
      });

      const pool = (this as any).pool as sql.ConnectionPool;
      const request = pool.request();

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec_cust JOIN dbo.claims c_cust ON c_cust.ClaimID = ec_cust.ClaimID WHERE ec_cust.RemittanceFileID = rf.RemittanceFileID AND c_cust.customer_id = @_custId)`
        : '';
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const safePage = Number.isFinite(page) && page > 0 ? page : 1;
      const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;
      request.input('_offset', sql.Int, (safePage - 1) * safePageSize);
      request.input('_pageSize', sql.Int, safePageSize);

      request.input('from', sql.Date, from ?? null);
      request.input('to', sql.Date, to ?? null);
      request.input('practiceLocation', sql.VarChar(100), practiceLocation);
      request.input('payersCsv', sql.VarChar(sql.MAX), payersCsv ?? null);
      request.input('providersCsv', sql.VarChar(sql.MAX), providersCsv ?? null);

      const sqlText = `


      WITH payer_filter AS (
        SELECT LTRIM(RTRIM(value)) AS v
        FROM STRING_SPLIT(@payersCsv, ',')
      ),
      provider_filter AS (
        SELECT LTRIM(RTRIM(value)) AS v
        FROM STRING_SPLIT(@providersCsv, ',')
      ),
      LatestClaimHistory AS (
        SELECT
          ch.ClaimID,
          ch.ClaimStatus,
          rn = ROW_NUMBER() OVER (
            PARTITION BY ch.ClaimID
            ORDER BY ch.DateOfService DESC
          )
        FROM dbo.ClaimHistory ch
      ),
      EobClaimCounts AS (
        SELECT
          ec.RemittanceFileID,
          COUNT(DISTINCT ec.ClaimID) AS eobClaimCount
        FROM dbo.EOBERAClaim ec
        WHERE ec.ClaimID IS NOT NULL
        GROUP BY ec.RemittanceFileID
      )
      SELECT
        rf.RemittanceFileID                               AS eobId,
        CONVERT(varchar(10), rf.FileDate, 23)             AS eobDate,
        CAST(ISNULL(rf.Amount, 0) AS decimal(18,2))       AS totalAmount,
        rf.PracticeLocation + ISNULL(' - ' + rf.TaxID,'') AS locationName,
        ec.RemittanceClaimID                              AS remittanceClaimId,
        CAST(c.ClaimID AS varchar(50))                    AS claimId,
        CONVERT(varchar(10), c.DateOfService, 23)         AS dateClaimSubmitted,
        CAST(ISNULL(c.ChargeAmt, 0) AS decimal(18,2))     AS amount,
        CASE
          WHEN c.ClaimID IS NULL THEN NULL
          WHEN ISNULL(c.ChargeAmt, 0) <= 0 THEN 'ZERO_PAY'
          WHEN lch.ClaimStatus IN ('PAID','PAY','P') THEN 'PAID'
          WHEN lch.ClaimStatus IN ('DENIED','DENY','D') THEN 'DENIED'
          ELSE 'PENDED'
        END AS claimStatus,

        CASE WHEN ISNULL(cph.PostedFlag, 0) = 1 THEN 1 ELSE 0 END AS isPosted,

        ISNULL(ecc.eobClaimCount, 0) AS eobClaimCount
      FROM dbo.reconciliation r
      JOIN dbo.remittanceFile rf
        ON rf.RemittanceFileID = r.RemittanceFileID

      LEFT JOIN dbo.EOBERAClaim ec
        ON ec.RemittanceFileID = r.RemittanceFileID
       AND ec.ClaimID IS NOT NULL

      LEFT JOIN dbo.claims c
        ON c.ClaimID = ec.ClaimID
      LEFT JOIN dbo.payer pay
        ON pay.PayerID = c.PayerID
      LEFT JOIN dbo.provider prov
        ON prov.ProviderID = c.ProviderID
      LEFT JOIN LatestClaimHistory lch
        ON lch.ClaimID = c.ClaimID
       AND lch.rn = 1

      LEFT JOIN dbo.claimPostHistory cph
        ON cph.RemittanceFileID = rf.RemittanceFileID
      LEFT JOIN EobClaimCounts ecc
        ON ecc.RemittanceFileID = rf.RemittanceFileID
      WHERE r.MatchFlag = 1
        AND ISNULL(cph.PostedFlag, 0) = 0
        AND (@from IS NULL OR rf.FileDate >= @from)
        AND (@to   IS NULL OR rf.FileDate <= @to)
        ${custFilter}
        AND (
          @practiceLocation = 'all'
          OR rf.PracticeLocation = @practiceLocation
        )
        AND (
          @payersCsv IS NULL
          OR pay.InsuranceName IN (SELECT v FROM payer_filter)
        )
        AND (
          @providersCsv IS NULL
          OR prov.Provider IN (SELECT v FROM provider_filter)
        )
      ORDER BY
        rf.FileDate DESC,
        rf.RemittanceFileID DESC,
        c.DateOfService DESC
      OFFSET @_offset ROWS FETCH NEXT @_pageSize ROWS ONLY;
      `;

      const result = await request.query(sqlText);
      const flatRows = (result.recordset ?? []) as FlatRow[];

      const allRows = this.nestRows(flatRows);

      const rows = search
        ? allRows.filter((r) => {
            const s = search.toLowerCase();
            return (
              r.eobId.toLowerCase().includes(s) ||
              r.locationName.toLowerCase().includes(s) ||
              r.claims.some((c) => c.claimId.toLowerCase().includes(s))
            );
          })
        : allRows;

      return res.status(200).json({
        message: 'Recon IQ payment reconciliation',
        asOf: new Date().toISOString(),
        filters: { practiceLocation, payers: payersCsv, providers: providersCsv, search, from, to },
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          totalRows: rows.length,
          totalPages: Math.ceil(rows.length / safePageSize),
        },
        rows,
      });
    } catch (error: unknown) {
      logger.error('PaymentReconciliation.get \u2013 error building response', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}