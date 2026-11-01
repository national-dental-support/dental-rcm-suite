import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId, buildClaimsCustomerWhere } from '../../../utils/resolve-user-scope';

type EncounterResearchPatientRowDto = {
  patientName: string;
  payerName: string | null;
  paymentId: string | null;
  doctorName: string | null;
  dateOfService: string;
  patientAccount: string;
};

export class Patients extends DatabaseConnectionController {
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

      logger.info('Patients.get \u2192 querying encounter research patients (most recent visit only)', {
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
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');
      custC.addInputs(request);

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
        RankedVisits AS (
          SELECT
              ISNULL(
                NULLIF(LTRIM(RTRIM(COALESCE(p.FirstName,'') + ' ' + COALESCE(p.LastName,''))), ''),
                p.PatientName
              ) AS patientName,
              pay.InsuranceName                           AS payerName,
              prov.Provider                               AS doctorName,
              CONVERT(varchar(10), c.DateOfService, 23)   AS dateOfService,
              CAST(c.PatientID AS varchar(50))            AS patientAccount,
              CAST(c.PatientID AS varchar(50))            AS PatientIDStr,
              rn = ROW_NUMBER() OVER (
                PARTITION BY CAST(c.PatientID AS varchar(50))
                ORDER BY c.DateOfService DESC, c.ClaimID DESC
              )
          FROM dbo.claims c
          JOIN dbo.Patient p
              ON p.PatientID = c.PatientID
          LEFT JOIN dbo.payer pay
              ON pay.PayerID = c.PayerID
          LEFT JOIN dbo.provider prov
              ON prov.ProviderID = c.ProviderID
          WHERE (p.FirstName IS NOT NULL OR p.LastName IS NOT NULL OR p.PatientName IS NOT NULL)
            AND c.DateOfService IS NOT NULL
            ${custC.where}
            AND (@from IS NULL OR c.DateOfService >= @from)
            AND (@to   IS NULL OR c.DateOfService <= @to)
            AND (
              @practiceLocation = 'all'
              OR prov.Location = @practiceLocation
            )
            AND (
              @payersCsv IS NULL
              OR pay.InsuranceName IN (SELECT v FROM payer_filter)
            )
            AND (
              @providersCsv IS NULL
              OR prov.Provider IN (SELECT v FROM provider_filter)
            )
        ),
        LatestPaymentRef AS (
          SELECT
              CAST(c.PatientID AS varchar(50)) AS PatientIDStr,
              RefValue =
                CASE
                  WHEN bd.DepositMethod = 'EFT'
                    THEN 'EFT-' + ISNULL(NULLIF(LTRIM(RTRIM(CAST(pp.EFTTraceNumber AS varchar(50)))), ''), 'UNKNOWN')
                  WHEN bd.DepositMethod = 'CHECK'
                    THEN 'CHK-' + ISNULL(NULLIF(LTRIM(RTRIM(CAST(pp.CheckNumber AS varchar(50)))), ''), 'UNKNOWN')
                  ELSE
                    COALESCE(
                      CASE WHEN NULLIF(LTRIM(RTRIM(CAST(pp.EFTTraceNumber AS varchar(50)))), '') IS NOT NULL
                        THEN 'EFT-' + CAST(pp.EFTTraceNumber AS varchar(50)) END,
                      CASE WHEN NULLIF(LTRIM(RTRIM(CAST(pp.CheckNumber AS varchar(50)))), '') IS NOT NULL
                        THEN 'CHK-' + CAST(pp.CheckNumber AS varchar(50)) END,
                      NULL
                    )
                END,
              rn = ROW_NUMBER() OVER (
                PARTITION BY CAST(c.PatientID AS varchar(50))
                ORDER BY bd.DepositDate DESC, bd.BankDepositID DESC
              )
          FROM dbo.claims c
          JOIN dbo.EOBERAClaim ec
              ON ec.ClaimID = c.ClaimID
          JOIN dbo.remittanceFile rf
              ON rf.RemittanceFileID = ec.RemittanceFileID
          JOIN dbo.reconciliation r
              ON r.RemittanceFileID = rf.RemittanceFileID
             AND r.MatchFlag = 1
          JOIN dbo.bankDeposit bd
              ON bd.BankDepositID = r.BankDepositID
          LEFT JOIN dbo.payerPayment pp
              ON pp.PayerPaymentID = bd.PayerPaymentID
          LEFT JOIN dbo.provider prov
              ON prov.ProviderID = c.ProviderID
          WHERE bd.DepositDate IS NOT NULL
            AND (@from IS NULL OR bd.DepositDate >= @from)
            AND (@to   IS NULL OR bd.DepositDate <= @to)
            AND (
              @practiceLocation = 'all'
              OR prov.Location = @practiceLocation
            )
        )
        SELECT
          rv.patientName,
          rv.payerName,
          lpr.RefValue AS paymentId,
          rv.doctorName,
          rv.dateOfService,
          rv.patientAccount
        FROM RankedVisits rv
        LEFT JOIN LatestPaymentRef lpr
          ON lpr.PatientIDStr = rv.PatientIDStr
         AND lpr.rn = 1
        WHERE rv.rn = 1
        ORDER BY rv.dateOfService DESC, rv.patientName
        OFFSET @_offset ROWS FETCH NEXT @_pageSize ROWS ONLY;
      `;

      const result = await request.query(sqlText);

      const allRows: EncounterResearchPatientRowDto[] = (result.recordset ?? []).map((r: any) => ({
        patientName: String(r.patientName ?? ''),
        payerName: r.payerName ?? null,
        paymentId: r.paymentId ?? null,
        doctorName: r.doctorName ?? null,
        dateOfService: String(r.dateOfService ?? ''),
        patientAccount: String(r.patientAccount ?? ''),
      }));

      const rows = search
        ? allRows.filter((r) => {
            const s = search.toLowerCase();
            return (
              r.patientName.toLowerCase().includes(s) ||
              (r.payerName ?? '').toLowerCase().includes(s) ||
              (r.paymentId ?? '').toLowerCase().includes(s) ||
              (r.doctorName ?? '').toLowerCase().includes(s) ||
              r.patientAccount.toLowerCase().includes(s)
            );
          })
        : allRows;

      return res.status(200).json({
        message: 'Recon IQ encounter research',
        asOf: new Date().toISOString(),
        filters: {
          practiceLocation,
          payers: payersCsv,
          providers: providersCsv,
          search,
          from,
          to,
        },
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          totalRows: rows.length,
          totalPages: Math.ceil(rows.length / safePageSize),
        },
        rows,
      });
    } catch (error: unknown) {
      logger.error('Patients.get \u2013 error building response', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}