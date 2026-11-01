import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { expandWithAliases } from '../../utils/expand-filter';
import { extractCustomerId } from '../../utils/resolve-user-scope';

function asArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return [String(v)].map(s => s.trim()).filter(Boolean);
}

export class DenialManagementController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** Build WHERE clauses and inputs for date + payer + provider + location filters on recon_report */
  private async buildFilters(req: Request) {
    const start = typeof req.query.start === 'string' ? req.query.start : null;
    const end = typeof req.query.end === 'string' ? req.query.end : null;
    let payers = asArray(req.query.payer);
    const providers = asArray(req.query.provider);
    const locations = asArray(req.query.location);
    const practices = asArray(req.query.practice);

    const whereParts: string[] = [];
    const inputs: { name: string; type: any; value: any }[] = [];

    if (start) {
      whereParts.push('DateOfService >= @filterStart');
      inputs.push({ name: 'filterStart', type: sql.NVarChar, value: start });
    }
    if (end) {
      whereParts.push('DateOfService <= @filterEnd');
      inputs.push({ name: 'filterEnd', type: sql.NVarChar, value: end });
    }
    if (payers.length) {
      payers = await expandWithAliases(this.pool, 'payer', payers);
      const paramNames = payers.map((_, i) => `@filterPayer${i}`);
      whereParts.push(`InsuranceName IN (${paramNames.join(', ')})`);
      payers.forEach((p, i) => {
        inputs.push({ name: `filterPayer${i}`, type: sql.NVarChar, value: p });
      });
    }
    if (providers.length) {
      const paramNames = providers.map((_, i) => `@filterProv${i}`);
      whereParts.push(`ProviderName IN (${paramNames.join(', ')})`);
      providers.forEach((p, i) => {
        inputs.push({ name: `filterProv${i}`, type: sql.NVarChar, value: p });
      });
    }
    if (locations.length) {
      const paramNames = locations.map((_, i) => `@filterLoc${i}`);
      whereParts.push(`Location IN (${paramNames.join(', ')})`);
      locations.forEach((l, i) => {
        inputs.push({ name: `filterLoc${i}`, type: sql.NVarChar, value: l });
      });
    }
    if (practices.length) {
      const paramNames = practices.map((_, i) => `@filterPg${i}`);
      whereParts.push(`Operations IN (${paramNames.join(', ')})`);
      practices.forEach((p, i) => {
        inputs.push({ name: `filterPg${i}`, type: sql.NVarChar, value: p });
      });
    }

    return { whereParts, inputs };
  }

  private applyInputs(request: sql.Request, inputs: { name: string; type: any; value: any }[]) {
    for (const inp of inputs) {
      request.input(inp.name, inp.type, inp.value);
    }
  }

  /** Build customer_id filter for recon_report (which has its own customer_id column) */
  private buildCustFilter(req: Request, alias = 'recon_report'): { where: string; addInputs: (r: sql.Request) => void } {
    const xenCustId = extractCustomerId(req);
    if (xenCustId == null) return { where: '', addInputs: () => {} };
    return {
      where: `AND ${alias}.customer_id = @_custId`,
      addInputs: (r: sql.Request) => { r.input('_custId', sql.Int, xenCustId); },
    };
  }

  /**
   * GET /api/insightflow/denial-management/trend
   * Returns the last 13 months of denied claim counts and denied charge amounts.
   * Source: recon_report (IsClaimDenied = 1, TrxType = 'Charge')
   *
   * NOTE: Denied claims have PaymentPostDate = NULL, so we use DateOfService
   * as the time axis for all denial management queries.
   */
  public getTrend = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { whereParts, inputs } = await this.buildFilters(req);
      const cust = this.buildCustFilter(req);
      const baseWhere = [
        'IsClaimDenied = 1',
        `TrxType = 'Charge'`,
        'DateOfService IS NOT NULL',
      ];
      if (!whereParts.some(w => w.includes('filterStart'))) {
        baseWhere.push('DateOfService >= DATEADD(MONTH, -12, GETDATE())');
      }
      if (cust.where) baseWhere.push(cust.where.replace(/^AND /, ''));
      const allWhere = [...baseWhere, ...whereParts].join('\n          AND ');

      const request = this.pool.request();
      this.applyInputs(request, inputs);
      cust.addInputs(request);

      const result = await request.query(`
        SELECT
          FORMAT(DateOfService, 'yyyy-MM') AS PeriodLabel,
          COUNT(DISTINCT ClaimID)           AS DeniedClaims,
          ISNULL(SUM(TrxAmt), 0)           AS DeniedCharges
        FROM recon_report
        WHERE ${allWhere}
        GROUP BY FORMAT(DateOfService, 'yyyy-MM')
        ORDER BY PeriodLabel;
      `);

      logger.info('DenialManagement.getTrend \u2192 returned rows: ' + result.recordset.length);
      /* istanbul ignore next */
      return res.status(200).json({
        message: 'Denial management trend data',
        data: result.recordset ?? [],
      });
    } catch (error: unknown) {
      logger.error('DenialManagement.getTrend \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /**
   * GET /api/insightflow/denial-management/kpis
   * Returns year-over-year KPI summary: denied claims, denied charges, denial rate, recovery rate.
   * Source: recon_report (IsClaimDenied = 1)
   */
  public getKpis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { whereParts, inputs } = await this.buildFilters(req);
      const cust = this.buildCustFilter(req);
      const extraWhere = [...whereParts, ...(cust.where ? [cust.where.replace(/^AND /, '')] : [])].join('\n          AND ');

      const request = this.pool.request();
      this.applyInputs(request, inputs);
      cust.addInputs(request);

      const result = await request.query(`
        DECLARE @now       DATETIME2 = GETDATE();
        DECLARE @cy_start  DATETIME2 = DATEADD(YEAR, -1, @now);
        DECLARE @py_start  DATETIME2 = DATEADD(YEAR, -2, @now);

        SELECT
          COUNT(DISTINCT CASE WHEN IsClaimDenied = 1
                               AND DateOfService >= @cy_start
                               AND TrxType = 'Charge'   THEN ClaimID END) AS CurrentDeniedClaims,
          ISNULL(SUM(CASE WHEN IsClaimDenied = 1
                          AND DateOfService >= @cy_start
                          AND TrxType = 'Charge'        THEN TrxAmt ELSE 0 END), 0) AS CurrentDeniedCharges,
          COUNT(DISTINCT CASE WHEN IsClaimDenied = 1
                               AND DateOfService >= @py_start
                               AND DateOfService <  @cy_start
                               AND TrxType = 'Charge'   THEN ClaimID END) AS PrevDeniedClaims,
          ISNULL(SUM(CASE WHEN IsClaimDenied = 1
                          AND DateOfService >= @py_start
                          AND DateOfService <  @cy_start
                          AND TrxType = 'Charge'        THEN TrxAmt ELSE 0 END), 0) AS PrevDeniedCharges,
          COUNT(DISTINCT CASE WHEN DateOfService >= @cy_start
                               AND TrxType = 'Charge'   THEN ClaimID END) AS CurrentTotalClaims,
          COUNT(DISTINCT CASE WHEN DateOfService >= @py_start
                               AND DateOfService <  @cy_start
                               AND TrxType = 'Charge'   THEN ClaimID END) AS PrevTotalClaims,
          0 AS RecoveredClaims,
          0 AS DeniedCurrTotal
        FROM recon_report
        WHERE DateOfService >= @py_start
          AND DateOfService IS NOT NULL
          ${extraWhere ? 'AND ' + extraWhere : ''};
      `);

      // Recovery rate: denied claims with a won appeal / denied claims with any appeal filed.
      // EXISTS(subquery) inside COUNT(DISTINCT) is not supported by SQL Server (error 130),
      // so recovery is computed in a separate query joined through DenialAppeal.
      // A null customer_id means the actor is not scoped to one tenant. Never
      // substitute a default here: falling back to 1 silently scoped an unscoped
      // actor to whichever tenant happens to be first. Drop the filter instead
      // and let the row-level security policy decide.
      const custIdVal: number | null = (req as any).actor?.customer_id ?? null;
      const rrHasCust = custIdVal != null;
      const rrRequest = this.pool.request();
      if (rrHasCust) rrRequest.input('rrCustId', sql.Int, custIdVal);
      const rrResult = await rrRequest.query(`
        DECLARE @cy_start DATETIME2 = DATEADD(YEAR, -1, GETDATE());
        SELECT
          COUNT(DISTINCT CASE WHEN da.status = 'won' THEN da.claim_id END) AS RecoveredClaims,
          COUNT(DISTINCT da.claim_id)                                       AS DeniedCurrTotal
        FROM dbo.DenialAppeal da
        JOIN dbo.recon_report rr ON rr.ClaimID = da.claim_id
          AND rr.TrxType = 'Charge'
          AND rr.IsClaimDenied = 1
          AND rr.DateOfService >= @cy_start
          ${rrHasCust ? 'AND rr.customer_id = @rrCustId' : ''}
      `);
      const rrRow = rrResult.recordset[0];

      logger.info('DenialManagement.getKpis \u2192 executing query');
      const row = result.recordset[0];

      if (!row) {
        return res.status(200).json({ message: 'No denial KPI data', data: null });
      }

      const currentDenied      = Number(row.CurrentDeniedClaims  ?? 0);
      const currentTotal       = Number(row.CurrentTotalClaims    ?? 0);
      const prevDenied         = Number(row.PrevDeniedClaims      ?? 0);
      const prevTotal          = Number(row.PrevTotalClaims       ?? 0);
      const deniedChargesCurr  = Number(row.CurrentDeniedCharges  ?? 0);
      const deniedChargesPrev  = Number(row.PrevDeniedCharges     ?? 0);
      const recovered          = Number(rrRow?.RecoveredClaims    ?? 0);
      const deniedForRecovery  = Number(rrRow?.DeniedCurrTotal    ?? 0);

      const denialRateCurr = currentTotal     > 0 ? currentDenied  / currentTotal     : 0;
      const denialRatePrev = prevTotal        > 0 ? prevDenied     / prevTotal        : 0;
      const recoveryRate   = deniedForRecovery > 0 ? recovered     / deniedForRecovery : 0;

      const deltaClaimsYoy     = prevDenied        > 0 ? ((currentDenied      - prevDenied)       / prevDenied)       * 100 : 0;
      const deltaChargesYoy    = deniedChargesPrev > 0 ? ((deniedChargesCurr  - deniedChargesPrev) / deniedChargesPrev) * 100 : 0;
      const deltaDenialRateYoy = denialRatePrev    > 0 ? ((denialRateCurr    - denialRatePrev)    / denialRatePrev)   * 100 : 0;

      return res.status(200).json({
        message: 'Denial management KPIs',
        data: {
          currentDeniedClaims:  currentDenied,
          currentDeniedCharges: deniedChargesCurr,
          denialRate:           denialRateCurr,
          recoveryRate,
          deltaClaimsYoy:      Number(deltaClaimsYoy.toFixed(1)),
          deltaChargesYoy:     Number(deltaChargesYoy.toFixed(1)),
          deltaDenialRateYoy:  Number(deltaDenialRateYoy.toFixed(2)),
        },
      });
    } catch (error: unknown) {
      logger.error('DenialManagement.getKpis \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /**
   * GET /api/insightflow/filter-options
   * Returns payers, providers, and locations for the global filter dropdowns.
   *
   * If the catalog tables have been seeded (via sync), only 'active' catalog
   * items are returned - giving admins control over what appears in the filter.
   * Falls back to raw recon_report values if a catalog is still empty.
   */
  public getFilterOptions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(req);

      // Check whether each catalog has been seeded yet
      const [locCnt, provCnt, payerCnt] = await Promise.all([
        this.pool.request().query(`SELECT COUNT(*) AS cnt FROM LocationCatalog`),
        this.pool.request().query(`SELECT COUNT(*) AS cnt FROM ProviderCatalog`),
        this.pool.request().query(`SELECT COUNT(*) AS cnt FROM PayerCatalog`),
      ]);

      const locSeeded   = (locCnt.recordset[0]   as any).cnt > 0;
      const provSeeded  = (provCnt.recordset[0]  as any).cnt > 0;
      const payerSeeded = (payerCnt.recordset[0] as any).cnt > 0;

      // Enterprise isolation: scope recon_report fallback queries to customer_id.
      const custExistsSql = xenCustId != null
        ? `AND rr.customer_id = @_custId`
        : '';

      const makeReq = () => {
        const r = this.pool.request();
        if (xenCustId != null) r.input('_custId', sql.Int, xenCustId);
        return r;
      };

      // When enterprise-scoped, always use recon_report DISTINCT (filtered by customer)
      // instead of shared catalog tables
      const useReconFallback = xenCustId != null;

      const [payers, providers, locations, practices] = await Promise.all([
        payerSeeded && !useReconFallback
          ? this.pool.request().query(`SELECT name FROM PayerCatalog    WHERE status = 'active' ORDER BY name`)
          : makeReq().query(`SELECT DISTINCT rr.InsuranceName AS name FROM recon_report rr WHERE rr.InsuranceName IS NOT NULL AND rr.InsuranceName != '' ${custExistsSql} ORDER BY rr.InsuranceName`),
        provSeeded && !useReconFallback
          ? this.pool.request().query(`SELECT name FROM ProviderCatalog WHERE status = 'active' ORDER BY name`)
          : makeReq().query(`SELECT DISTINCT rr.ProviderName   AS name FROM recon_report rr WHERE rr.ProviderName  IS NOT NULL AND rr.ProviderName  != '' ${custExistsSql} ORDER BY rr.ProviderName`),
        locSeeded && !useReconFallback
          ? this.pool.request().query(`SELECT name FROM LocationCatalog WHERE status = 'active' ORDER BY name`)
          : makeReq().query(`SELECT DISTINCT rr.Location        AS name FROM recon_report rr WHERE rr.Location       IS NOT NULL AND rr.Location       != '' ${custExistsSql} ORDER BY rr.Location`),
        makeReq().query(`SELECT DISTINCT rr.Operations AS name FROM recon_report rr WHERE rr.Operations IS NOT NULL AND rr.Operations != '' ${custExistsSql} ORDER BY rr.Operations`),
      ]);

      return res.status(200).json({
        payers:    payers.recordset.map((r: { name: string }) => r.name),
        providers: providers.recordset.map((r: { name: string }) => r.name),
        locations: locations.recordset.map((r: { name: string }) => r.name),
        practices: practices.recordset.map((r: { name: string }) => r.name),
      });
    } catch (error: unknown) {
      logger.error('DenialManagement.getFilterOptions \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /**
   * GET /api/insightflow/denial-management/top-reasons
   * Returns the top 9 preventable denial groupings (from DenialCodeMapping),
   * current 90 days vs previous 90 days.
   *
   * Mapping resolution priority (per row in recon_report):
   *   1. exact (CARC + RARC) - handles OA96 disambiguation
   *   2. CARC-only (with stripped prefix fallback, e.g. 'CO45'->'45')
   *   3. payer-specific CARC
   *
   * Filters to grouping LIKE 'Denial -%' so only preventable categories appear
   * (non-preventable 'Reason Code - *' buckets like contractual adjustments
   * and patient responsibility are excluded from this preventable-denials viz).
   */
  public getTopReasons = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { whereParts, inputs } = await this.buildFilters(req);
      const cust = this.buildCustFilter(req, 'rr');
      const rrWhereParts = whereParts.map(w => `rr.${w}`);
      if (cust.where) rrWhereParts.push(cust.where.replace(/^AND /, ''));
      const rrExtraWhere = rrWhereParts.length ? 'AND ' + rrWhereParts.join('\n            AND ') : '';

      const request = this.pool.request();
      this.applyInputs(request, inputs);
      cust.addInputs(request);

      const result = await request.query(`
        DECLARE @now       DATE = CAST(GETDATE() AS DATE);
        DECLARE @curr_start DATE = DATEADD(DAY, -90,  @now);
        DECLARE @prev_start DATE = DATEADD(DAY, -180, @now);
        DECLARE @prev_end   DATE = DATEADD(DAY, -91,  @now);

        WITH normalized AS (
          SELECT
            rr.CARCCode,
            rr.RARCCode,
            rr.DateOfService,
            rr.TrxType,
            rr.TrxAmt,
            -- strip group prefix for numeric-only lookup:
            -- 'CO45' \u2192 '45', 'OA96' \u2192 '96', 'PR1' \u2192 '1'
            CASE
              WHEN rr.CARCCode LIKE 'CO%' OR rr.CARCCode LIKE 'PR%' OR rr.CARCCode LIKE 'OA%'
                OR rr.CARCCode LIKE 'PI%' OR rr.CARCCode LIKE 'CR%'
              THEN SUBSTRING(rr.CARCCode, PATINDEX('%[0-9]%', rr.CARCCode + '0'), 50)
              ELSE rr.CARCCode
            END AS carc_num
          FROM recon_report rr
          WHERE rr.IsClaimDenied = 1
            AND rr.CARCCode IS NOT NULL
            AND rr.CARCCode != ''
            AND UPPER(REPLACE(rr.CARCCode, '-', '')) NOT IN ('45', 'CO45')
            AND rr.DateOfService >= DATEADD(DAY, -180, GETDATE())
            ${rrExtraWhere}
        ),
        mapped AS (
          SELECT n.*,
            COALESCE(
              -- 1. Exact CARC + RARC match (OA96 disambiguation)
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.CARCCode AND m.rarc = n.RARCCode),
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.carc_num AND m.rarc = n.RARCCode),
              -- 2. CARC-only match (with and without group prefix)
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.CARCCode AND m.rarc IS NULL),
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.carc_num AND m.rarc IS NULL),
              -- 3. Payer-specific CARC fallback
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_payer = n.CARCCode)
            ) AS grouping
          FROM normalized n
        )
        SELECT ${req.query['all'] === '1' ? '' : 'TOP 9'}
          grouping AS Reason,
          ISNULL(SUM(CASE WHEN CAST(DateOfService AS DATE) >= @curr_start
                          AND TrxType = 'Charge'
                          THEN TrxAmt ELSE 0 END), 0) AS CurrentAmount,
          ISNULL(SUM(CASE WHEN CAST(DateOfService AS DATE) BETWEEN @prev_start AND @prev_end
                          AND TrxType = 'Charge'
                          THEN TrxAmt ELSE 0 END), 0) AS PreviousAmount
        FROM mapped
        WHERE grouping LIKE 'Denial -%'
        GROUP BY grouping
        ORDER BY CurrentAmount DESC;
      `);

      logger.info('DenialManagement.getTopReasons \u2192 returned rows: ' + result.recordset.length);
      /* istanbul ignore next */
      return res.status(200).json({
        message: 'Denial management top reasons',
        data: result.recordset ?? [],
      });
    } catch (error: unknown) {
      logger.error('DenialManagement.getTopReasons \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /**
   * GET /api/insightflow/denial-management/top-reasons/codes?grouping=Denial%20-%20Eligibility
   * Returns each (CARC, RARC) pair within a grouping, with totals.
   */
  public getCodesForGrouping = async (req: Request, res: Response): Promise<Response> => {
    const grouping = (req.query.grouping as string) ?? '';
    if (!grouping) return res.status(400).json({ message: 'grouping is required' });

    try {
      const { whereParts, inputs } = await this.buildFilters(req);
      const cust = this.buildCustFilter(req, 'rr');
      const payerClause = whereParts.filter(w => w.includes('InsuranceName')).join(' AND ');

      const request = this.pool.request();
      this.applyInputs(request, inputs);
      cust.addInputs(request);
      request.input('grouping', sql.NVarChar(100), grouping);

      const result = await request.query(`
        DECLARE @now       DATE = CAST(GETDATE() AS DATE);
        DECLARE @curr_start DATE = DATEADD(DAY, -90,  @now);
        DECLARE @prev_start DATE = DATEADD(DAY, -180, @now);
        DECLARE @prev_end   DATE = DATEADD(DAY, -91,  @now);

        WITH normalized AS (
          SELECT
            rr.CARCCode, rr.RARCCode, rr.DateOfService, rr.TrxType, rr.TrxAmt, rr.ClaimID,
            CASE
              WHEN rr.CARCCode LIKE 'CO%' OR rr.CARCCode LIKE 'PR%' OR rr.CARCCode LIKE 'OA%'
                OR rr.CARCCode LIKE 'PI%' OR rr.CARCCode LIKE 'CR%'
              THEN SUBSTRING(rr.CARCCode, PATINDEX('%[0-9]%', rr.CARCCode + '0'), 50)
              ELSE rr.CARCCode
            END AS carc_num
          FROM recon_report rr
          WHERE rr.IsClaimDenied = 1
            AND rr.CARCCode IS NOT NULL AND rr.CARCCode != ''
            AND UPPER(REPLACE(rr.CARCCode, '-', '')) NOT IN ('45', 'CO45')
            AND rr.DateOfService >= DATEADD(DAY, -180, GETDATE())
            ${payerClause ? 'AND rr.' + payerClause : ''}
            ${cust.where}
        ),
        mapped AS (
          SELECT n.*,
            COALESCE(
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.CARCCode AND m.rarc = n.RARCCode),
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.carc_num AND m.rarc = n.RARCCode),
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.CARCCode AND m.rarc IS NULL),
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_x12 = n.carc_num AND m.rarc IS NULL),
              (SELECT TOP 1 m.grouping FROM dbo.DenialCodeMapping m
               WHERE m.carc_payer = n.CARCCode)
            ) AS grouping
          FROM normalized n
        )
        SELECT
          CARCCode AS carcCode,
          RARCCode AS rarcCode,
          COUNT(DISTINCT ClaimID) AS ClaimCount,
          ISNULL(SUM(CASE WHEN CAST(DateOfService AS DATE) >= @curr_start
                          AND TrxType = 'Charge' THEN TrxAmt ELSE 0 END), 0) AS CurrentAmount,
          ISNULL(SUM(CASE WHEN CAST(DateOfService AS DATE) BETWEEN @prev_start AND @prev_end
                          AND TrxType = 'Charge' THEN TrxAmt ELSE 0 END), 0) AS PreviousAmount
        FROM mapped
        WHERE grouping = @grouping
        GROUP BY CARCCode, RARCCode
        ORDER BY CurrentAmount DESC;
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('DenialManagement.getCodesForGrouping \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/insightflow/denial-management/top-reasons/claims?carc=OA96&rarc=MA67
   * Returns the specific claims behind a CARC/RARC pair (current 90 days).
   */
  public getClaimsForCode = async (req: Request, res: Response): Promise<Response> => {
    const carc = (req.query.carc as string) ?? '';
    const rarcParam = (req.query.rarc as string) ?? '';
    if (!carc) return res.status(400).json({ message: 'carc is required' });

    try {
      const { whereParts, inputs } = await this.buildFilters(req);
      const cust = this.buildCustFilter(req, 'rr');
      const payerClause = whereParts.filter(w => w.includes('InsuranceName')).join(' AND ');

      const request = this.pool.request();
      this.applyInputs(request, inputs);
      cust.addInputs(request);
      request.input('carc', sql.NVarChar(50), carc);

      let rarcFilter = '';
      if (rarcParam === '' || rarcParam.toLowerCase() === 'null') {
        rarcFilter = 'AND rr.RARCCode IS NULL';
      } else {
        rarcFilter = 'AND rr.RARCCode = @rarc';
        request.input('rarc', sql.NVarChar(50), rarcParam);
      }

      const result = await request.query(`
        DECLARE @now       DATE = CAST(GETDATE() AS DATE);
        DECLARE @curr_start DATE = DATEADD(DAY, -90,  @now);

        SELECT TOP 500
          rr.ClaimID         AS claimId,
          ISNULL(rr.SubscriberFirstName, '') + ' ' + ISNULL(rr.SubscriberLastName, '') AS patientName,
          rr.InsuranceName   AS payerName,
          rr.ProviderName    AS providerName,
          CAST(rr.DateOfService AS DATE) AS dateOfService,
          ISNULL(SUM(rr.TrxAmt), 0) AS chargeAmount
        FROM recon_report rr
        WHERE rr.IsClaimDenied = 1
          AND rr.CARCCode = @carc
          ${rarcFilter}
          AND rr.TrxType = 'Charge'
          AND rr.DateOfService >= @curr_start
          ${payerClause ? 'AND rr.' + payerClause : ''}
          ${cust.where}
        GROUP BY rr.ClaimID, rr.SubscriberFirstName, rr.SubscriberLastName, rr.InsuranceName, rr.ProviderName, CAST(rr.DateOfService AS DATE)
        ORDER BY chargeAmount DESC;
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('DenialManagement.getClaimsForCode \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
