import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

type SeriesRow = {
  period: string;
  eraEobPaymentAmount: number;
  patientResponsibilityAmount: number;
  adjustmentsAmount: number;
  unmatchedPaymentsNoEobCount: number;
  unmatchedNoPaymentToEobCount: number;
};

export class EraEobPayment extends DatabaseConnectionController {
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
      const practiceLocation = this.pickPracticeLocation(req);
      const payersCsv = this.normalizeCsv(req.query.payers);
      const providersCsv = this.normalizeCsv(req.query.providers);

      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const interval = (req.query.interval as string) ?? 'month';

      logger.info('EraEobPayment.get \u2192 querying chart series', {
        practiceLocation,
        payersCsv,
        providersCsv,
        from,
        to,
        interval,
      });

      const pool = (this as any).pool as sql.ConnectionPool;
      const dbReq = pool.request();

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custWhere = xenCustId != null ? `AND c.customer_id = @_custId` : '';
      const custWhereBd = xenCustId != null ? `AND bd.customer_id = @_custId` : '';
      const custWhereRf = xenCustId != null ? `AND rf.customer_id = @_custId` : '';
      if (xenCustId != null) dbReq.input('_custId', sql.Int, xenCustId);

      dbReq.input('from', sql.Date, from ?? null);
      dbReq.input('to', sql.Date, to ?? null);
      dbReq.input('practiceLocation', sql.VarChar(100), practiceLocation);
      dbReq.input('payersCsv', sql.VarChar(sql.MAX), payersCsv ?? null);
      dbReq.input('providersCsv', sql.VarChar(sql.MAX), providersCsv ?? null);
      dbReq.input('interval', sql.VarChar(10), interval);

      const sqlText = `


        WITH payer_filter AS (
            SELECT LTRIM(RTRIM(value)) AS v
            FROM STRING_SPLIT(@payersCsv, ',')
        ),
        provider_filter AS (
            SELECT LTRIM(RTRIM(value)) AS v
            FROM STRING_SPLIT(@providersCsv, ',')
        ),
        Months AS (
          SELECT DISTINCT CONVERT(char(7), rf.FileDate, 23) AS period
          FROM dbo.remittanceFile rf
          WHERE rf.FileDate IS NOT NULL
            AND (@from IS NULL OR rf.FileDate >= @from)
            AND (@to IS NULL OR rf.FileDate <= @to)
            AND (
              @practiceLocation = 'all'
              OR rf.PracticeLocation = @practiceLocation
            )
        ),

        MatchedLineSums AS (
          SELECT
            CONVERT(char(7), bd.DepositDate, 23) AS period,
            SUM(CAST(ISNULL(rl.PaidAmt, 0) AS decimal(18,2)))        AS eraEobPaymentAmount,
            SUM(CAST(ISNULL(rl.PatientRespAmt, 0) AS decimal(18,2))) AS patientResponsibilityAmount,
            SUM(CAST(ISNULL(rl.AdjustmentAmt, 0) AS decimal(18,2)))  AS adjustmentsAmount
          FROM dbo.bankDeposit bd
          JOIN dbo.reconciliation r
            ON r.BankDepositID = bd.BankDepositID
          JOIN dbo.remittanceFile rf
            ON rf.RemittanceFileID = r.RemittanceFileID
           AND rf.FileType IN ('ERA','EOB')
          JOIN dbo.EOBERAClaim ec
            ON ec.RemittanceFileID = rf.RemittanceFileID
           AND ec.ClaimID IS NOT NULL
          JOIN dbo.remittanceLine rl
            ON rl.ClaimID = ec.ClaimID
          LEFT JOIN dbo.claims c
            ON c.ClaimID = ec.ClaimID
          LEFT JOIN dbo.payer pay
            ON pay.PayerID = c.PayerID
          LEFT JOIN dbo.provider prov
            ON prov.ProviderID = c.ProviderID
          WHERE r.MatchFlag = 1
            AND bd.DepositDate IS NOT NULL
            AND (@from IS NULL OR bd.DepositDate >= @from)
            AND (@to IS NULL OR bd.DepositDate <= @to)
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
            ${custWhere}
          GROUP BY CONVERT(char(7), bd.DepositDate, 23)
        ),

        UnmatchedPaymentsNoEob AS (
          SELECT
            CONVERT(char(7), bd.DepositDate, 23) AS period,
            COUNT(*) AS unmatchedPaymentsNoEobCount
          FROM dbo.bankDeposit bd
          LEFT JOIN dbo.reconciliation r
            ON r.BankDepositID = bd.BankDepositID
          WHERE r.BankDepositID IS NULL
            AND bd.DepositDate IS NOT NULL
            AND (@from IS NULL OR bd.DepositDate >= @from)
            AND (@to IS NULL OR bd.DepositDate <= @to)
            ${custWhereBd}
          GROUP BY CONVERT(char(7), bd.DepositDate, 23)
        ),

        UnmatchedNoPaymentToEob AS (
          SELECT
            CONVERT(char(7), rf.FileDate, 23) AS period,
            COUNT(*) AS unmatchedNoPaymentToEobCount
          FROM dbo.remittanceFile rf
          LEFT JOIN dbo.reconciliation r
            ON r.RemittanceFileID = rf.RemittanceFileID
          LEFT JOIN dbo.EOBERAClaim ec
            ON ec.RemittanceFileID = rf.RemittanceFileID
          LEFT JOIN dbo.claims c
            ON c.ClaimID = ec.ClaimID
          LEFT JOIN dbo.payer pay
            ON pay.PayerID = c.PayerID
          LEFT JOIN dbo.provider prov
            ON prov.ProviderID = c.ProviderID
          WHERE r.RemittanceFileID IS NULL
            AND rf.FileDate IS NOT NULL
            AND (@from IS NULL OR rf.FileDate >= @from)
            AND (@to IS NULL OR rf.FileDate <= @to)
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
            ${custWhereRf}
          GROUP BY CONVERT(char(7), rf.FileDate, 23)
        )

        SELECT
          m.period,
          eraEobPaymentAmount          = CAST(ISNULL(ms.eraEobPaymentAmount, 0) AS decimal(18,2)),
          patientResponsibilityAmount  = CAST(ISNULL(ms.patientResponsibilityAmount, 0) AS decimal(18,2)),
          adjustmentsAmount            = CAST(ISNULL(ms.adjustmentsAmount, 0) AS decimal(18,2)),
          unmatchedPaymentsNoEobCount  = ISNULL(u1.unmatchedPaymentsNoEobCount, 0),
          unmatchedNoPaymentToEobCount = ISNULL(u2.unmatchedNoPaymentToEobCount, 0)
        FROM Months m
        LEFT JOIN MatchedLineSums ms
          ON ms.period = m.period
        LEFT JOIN UnmatchedPaymentsNoEob u1
          ON u1.period = m.period
        LEFT JOIN UnmatchedNoPaymentToEob u2
          ON u2.period = m.period
        ORDER BY m.period;
      `;

      const result = await dbReq.query(sqlText);

      const series: SeriesRow[] = (result.recordset ?? []).map((r: any) => ({
        period: String(r.period),
        eraEobPaymentAmount: Number(r.eraEobPaymentAmount ?? 0),
        patientResponsibilityAmount: Number(r.patientResponsibilityAmount ?? 0),
        adjustmentsAmount: Number(r.adjustmentsAmount ?? 0),
        unmatchedPaymentsNoEobCount: Number(r.unmatchedPaymentsNoEobCount ?? 0),
        unmatchedNoPaymentToEobCount: Number(r.unmatchedNoPaymentToEobCount ?? 0),
      }));

      return res.status(200).json({
        message: 'Recon IQ ERA/EOB payment',
        asOf: new Date().toISOString(),
        filters: {
          practiceLocation,
          payers: payersCsv,
          providers: providersCsv,
          from,
          to,
          interval: interval as 'month',
        },
        series,
      });
    } catch (error: unknown) {
      logger.error('EraEobPayment.get \u2013 error building response', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}