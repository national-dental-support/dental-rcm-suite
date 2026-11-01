import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import sql from 'mssql';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class DeniedClaimsAndNonPayments extends DatabaseConnectionController {
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

      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const interval = (req.query.interval as string) ?? 'month';

      const practicesCsv =
        locationScope === 'practice' ? practicesCsvRaw : null;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custWhere = xenCustId != null ? `AND c.customer_id = @_custId` : '';

      logger.info('DeniedClaimsAndNonPayments.get \u2192 querying DB', {
        locationScope,
        practicesCsv,
        payersCsv,
        providersCsv,
        from,
        to,
        interval,
      });

      const query = `


        WITH practice_filter AS (
            SELECT LTRIM(RTRIM(value)) AS v
            FROM STRING_SPLIT(@practicesCsv, ',')
        ),
        payer_filter AS (
            SELECT LTRIM(RTRIM(value)) AS v
            FROM STRING_SPLIT(@payersCsv, ',')
        ),
        provider_filter AS (
            SELECT LTRIM(RTRIM(value)) AS v
            FROM STRING_SPLIT(@providersCsv, ',')
        )

        SELECT TOP (13)
          FORMAT(c.DateOfService, 'yyyy-MM') AS period,
          SUM(c.ChargeAmt) AS denialsAmount,
          SUM(
            CASE
              WHEN ch.ClaimBalanceDue = (c.ChargeAmt - ch.ContractualAdjustments)
              THEN 1
              ELSE 0
            END
          ) AS nonPaymentsCount
        FROM dbo.claimHistory ch
        JOIN dbo.claims c
          ON ch.ClaimID = c.ClaimID

        -- "practice" for now = provider.Location
        JOIN dbo.provider p
          ON p.ProviderID = c.ProviderID
        LEFT JOIN dbo.payer pay
          ON pay.PayerID = c.PayerID
        WHERE ch.ClaimStatus = 'Denied'
          AND (@from IS NULL OR c.DateOfService >= @from)
          AND (@to IS NULL OR c.DateOfService <= @to)
          ${custWhere}
          AND (
            @practicesCsv IS NULL
            OR p.Location IN (SELECT v FROM practice_filter)
          )
          AND (
            @payersCsv IS NULL
            OR pay.InsuranceName IN (SELECT v FROM payer_filter)
          )
          AND (
            @providersCsv IS NULL
            OR p.Provider IN (SELECT v FROM provider_filter)
          )
        GROUP BY FORMAT(c.DateOfService, 'yyyy-MM')
        ORDER BY period DESC;
      `;

      const pool = (this as any).pool as sql.ConnectionPool;
      const request = pool.request();

      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      request.input('from', sql.Date, from ?? null);
      request.input('to', sql.Date, to ?? null);
      request.input('practicesCsv', sql.VarChar(sql.MAX), practicesCsv ?? null);
      request.input('payersCsv', sql.VarChar(sql.MAX), payersCsv ?? null);
      request.input('providersCsv', sql.VarChar(sql.MAX), providersCsv ?? null);

      const result = await request.query(query);

      const series = (result.recordset ?? []).reverse();

      return res.status(200).json({
        message: 'Recon IQ denied claims & non-payments',
        asOf: new Date().toISOString(),
        filters: {
          locationScope,
          practices: practicesCsv,
          payers: payersCsv,
          providers: providersCsv,
          from,
          to,
          interval: interval as 'month',
        },
        series,
      });
    } catch (error: unknown) {
      logger.error('DeniedClaimsAndNonPayments.get \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}