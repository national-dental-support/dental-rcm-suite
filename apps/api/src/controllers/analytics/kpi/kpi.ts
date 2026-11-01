import { Request, Response } from 'express';
import sql, { Request as SqlRequest } from 'mssql';
import Database from '../../../modules/db';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { resolveUserScope } from '../../../utils/resolve-user-scope';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();

// Helper: extract tenant filter from request via DatabaseConnectionController
const _filterHelper = new DatabaseConnectionController();
function getCustFilter(req: Request): { where: string; bind: (r: SqlRequest) => void } {
  return (_filterHelper as any).custFilter(req);
}

// ----- Types (mirror frontend models) -----

type Rag = 'red' | 'amber' | 'green';

interface KpiThresholds {
  min: number;
  redMax: number;
  amberMax: number;
  max: number;
}

interface KpiItem {
  slug: string;
  title: string;
  value: number | null;
  unit?: string;
  thresholds: KpiThresholds;
  benchmark?: string;
  calcHint?: string;
  rag: Rag;
}

interface KpiTrendPoint {
  label: string;
  value: number;
}

interface KpiDetail {
  item: KpiItem;
  trendQuarterly: KpiTrendPoint[];
  interpretationHigh: string[];
  interpretationLow: string[];
  definition: string;
  improvements: string[];
  contributingFactors?: string[];
}

interface KpiFilters {
  practice: string | 'All';
  location: string | 'All';
  provider?: string | null;
  timeframe: 'Past 12 months' | 'Past month' | 'Past quarter' | 'YTD' | 'Custom';
  rag: 'All' | Rag;
  from?: string;
  to?: string;
}

type KpiSlug =
  | 'gross-expected-collection'
  | 'net-collection'
  | 'adjustment-by-payer'
  | 'rev-per-procedure'
  | 'claims-first-pass-rate';

const ALL_SLUGS: KpiSlug[] = [
  'gross-expected-collection',
  'net-collection',
  'adjustment-by-payer',
  'rev-per-procedure',
  'claims-first-pass-rate',
];

// ----- Per-KPI configuration -----

const KPI_THRESHOLDS: Record<KpiSlug, KpiThresholds> = {
  'gross-expected-collection': { min: 80, redMax: 90, amberMax: 97, max: 100 },
  'net-collection': { min: 80, redMax: 90, amberMax: 97, max: 100 },
  'adjustment-by-payer': { min: 30, redMax: 38, amberMax: 46, max: 60 },
  'rev-per-procedure': { min: 80, redMax: 90, amberMax: 96, max: 100 },
  'claims-first-pass-rate': { min: 80, redMax: 90, amberMax: 96, max: 100 },
};

const KPI_META: Record<KpiSlug, { title: string; unit: string; benchmark?: string; calcHint?: string }> = {
  'gross-expected-collection': {
    title: 'Gross Expected Collection %',
    unit: '%',
    benchmark: '97\u201399%',
    calcHint: 'Payments / Gross Charges',
  },
  'net-collection': {
    title: 'Net Collection %',
    unit: '%',
    benchmark: '96\u2013100%',
    calcHint: 'Payments / (Gross Charges \u2212 Contractual Adjustments)',
  },
  'adjustment-by-payer': {
    title: 'Adjustment % By Payer',
    unit: '%',
    benchmark: '38\u201346% (contractual norm)',
    calcHint: 'Insurance Adjustments / Gross Charges',
  },
  'rev-per-procedure': {
    title: 'Revenue Per Procedure Code',
    unit: '%',
    benchmark: '\u2265 96% of allowed rate',
    calcHint: 'Not currently available from loaded tables',
  },
  'claims-first-pass-rate': {
    title: 'Claims First Pass Rate',
    unit: '%',
    benchmark: '\u2265 96%',
    calcHint: 'Not currently available from loaded tables',
  },
};

const KPI_DETAIL_TEXT: Record<KpiSlug, Omit<KpiDetail, 'item' | 'trendQuarterly'>> = {
  'gross-expected-collection': {
    interpretationHigh: [
      'Strong collection efficiency across the revenue cycle.',
      'Healthy charge capture and minimal revenue leakage.',
    ],
    interpretationLow: [
      'Underpayments or unusual adjustments may be eroding collections.',
      'Increased denials or front-desk collection issues.',
    ],
    definition:
      'Gross Collections Percentage measures collections relative to gross charges billed.',
    improvements: [
      'Ensure charges are captured accurately and quickly.',
      'Tighten point-of-service collections and payment plans.',
      'Review payer contracts and underpayments regularly.',
      'Reduce denials via eligibility, coding, and documentation checks.',
    ],
    contributingFactors: [
      'Payer mix and reimbursement policy.',
      'Accuracy and timeliness of charge capture.',
      'Effectiveness of denial management workflows.',
      'Patient access and front-desk collection processes.',
      'Timely follow-up on outstanding AR.',
    ],
  },
  'net-collection': {
    interpretationHigh: [
      'Strong net collections relative to contractual allowances.',
      'Effective write-off management and accurate adjustments.',
    ],
    interpretationLow: [
      'Excessive write-offs or inappropriate contractual adjustments.',
      'Inefficiencies in AR follow-up or underpayments.',
    ],
    definition:
      'Net Collection Percentage measures how much collectible revenue is actually collected after adjustments.',
    improvements: [
      'Validate that adjustments are contractually appropriate.',
      'Monitor write-offs and underpayments by payer.',
      'Optimize AR follow-up and denial workflows.',
    ],
    contributingFactors: [
      'Accuracy of contract loading and fee schedules.',
      'Adjustment and write-off policies by payer.',
      'Effectiveness of underpayment detection.',
    ],
  },
  'adjustment-by-payer': {
    interpretationHigh: [
      'Contractual discounts are at expected levels for the payer mix.',
      'Consistent with insurer fee schedule agreements.',
    ],
    interpretationLow: [
      'Unusually low adjustments may indicate billing or posting errors.',
      'Could signal under-utilisation of contractual discounts.',
    ],
    definition:
      'Adjustment Percentage by Payer compares insurance adjustments to total gross charges.',
    improvements: [
      'Review payer contracts with adjustment rates outside the 38\u201346% norm.',
      'Audit coding and documentation quality for high-adjustment payers.',
      'Monitor denial and write-off patterns by payer over time.',
    ],
    contributingFactors: [
      'Payer contract terms and fee schedules.',
      'Coding accuracy and documentation quality.',
      'Appeal and recovery processes for denials.',
    ],
  },
  'rev-per-procedure': {
    interpretationHigh: [
      'Revenue per procedure is close to or at the allowed rate.',
      'Suggests accurate billing and effective payer reimbursement.',
    ],
    interpretationLow: [
      'Underpayments or fee schedule discrepancies may be present.',
      'Possible coding inaccuracies or claim denials reducing collected amounts.',
    ],
    definition:
      'Revenue Per Procedure Code would compare procedure-level reimbursement to expected allowed amounts, but it is not currently available from loaded tables.',
    improvements: [
      'Load or derive a reliable procedure-level allowed rate source.',
      'Ensure CPT-linked payment attribution is available.',
    ],
    contributingFactors: [
      'Availability of CPT-linked reimbursement data.',
      'Procedure-level payment attribution quality.',
    ],
  },
  'claims-first-pass-rate': {
    interpretationHigh: [
      'High percentage of claims accepted and paid on first submission.',
      'Indicates clean billing processes and accurate eligibility verification.',
    ],
    interpretationLow: [
      'High rework volume driving up administrative cost.',
      'Potential issues with eligibility, coding, or documentation.',
    ],
    definition:
      'Claims First Pass Rate is the percentage of claims paid on first submission, but it is not currently available from loaded tables.',
    improvements: [
      'Load first-pass or clean-claim indicators into the warehouse.',
      'Track rejections, resubmissions, and accepted-first-pass outcomes.',
    ],
    contributingFactors: [
      'Eligibility and benefits verification accuracy.',
      'Coding and documentation quality.',
      'Claim scrubbing and edit rules in the billing system.',
    ],
  },
};

// ----- Helpers -----


async function getDateRangeFromFilters(filters: Partial<KpiFilters>): Promise<{ startDate: Date; endDate: Date }> {
  const endDate = filters.timeframe === 'Custom' && filters.to
    ? new Date(filters.to)
    : new Date();

  let startDate: Date;

  switch (filters.timeframe) {
    case 'Past quarter':
      startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'YTD':
      startDate = new Date(endDate.getFullYear(), 0, 1);
      break;
    case 'Custom':
      startDate = filters.from ? new Date(filters.from) : new Date(endDate);
      if (!filters.from) startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case 'Past 12 months':
    case 'Past month':
    default:
      startDate = new Date(endDate);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  return { startDate, endDate };
}

function calculateRag(value: number | null, thresholds: KpiThresholds): Rag {
  if (value === null || Number.isNaN(value)) return 'red';
  if (value <= thresholds.redMax) return 'red';
  if (value <= thresholds.amberMax) return 'amber';
  return 'green';
}

function buildKpiItem(slug: KpiSlug, value: number | null): KpiItem {
  const meta = KPI_META[slug];
  const thresholds = KPI_THRESHOLDS[slug];
  return {
    slug,
    title: meta.title,
    value,
    unit: meta.unit,
    thresholds,
    benchmark: meta.benchmark,
    calcHint: meta.calcHint,
    rag: calculateRag(value, thresholds),
  };
}

function normalizeValue(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ----- DB queries -----

async function queryAllKpis(
  startDate: Date,
  endDate: Date,
  custFilter: { where: string; bind: (r: SqlRequest) => void },
  scopeWhere: string,
  addScopeInputs: (r: SqlRequest) => void,
): Promise<Record<KpiSlug, number | null>> {
  const req = new sql.Request(pool);
  req.input('StartDate', sql.Date, startDate);
  req.input('EndDate', sql.Date, endDate);
  custFilter.bind(req);
  addScopeInputs(req);

  const result = await req.query<{
    KPI: KpiSlug;
    ValuePct: number | null;
  }>(`
    WITH Base AS (
        SELECT
            TrxType,
            TrxAmt,
            PayerType,
            CPT,
            DateOfService,
            PostDate
        FROM dbo.recon_report
        WHERE 1=1
        ${custFilter.where}
        ${scopeWhere}
    ),
    Agg AS (
        SELECT
            SUM(CASE
                    WHEN TrxType = 'Charge'
                     AND DateOfService BETWEEN @StartDate AND @EndDate
                    THEN TrxAmt ELSE 0
                END) AS GrossCharges,

            SUM(CASE
                    WHEN TrxType = 'Payment'
                     AND PostDate BETWEEN @StartDate AND @EndDate
                    THEN TrxAmt ELSE 0
                END) AS TotalPayments,

            SUM(CASE
                    WHEN TrxType = 'Adjustment'
                     AND PostDate BETWEEN @StartDate AND @EndDate
                    THEN ABS(TrxAmt) ELSE 0
                END) AS TotalAdjustments,

            SUM(CASE
                    WHEN TrxType = 'Adjustment'
                     AND PayerType = 'Insurance'
                     AND PostDate BETWEEN @StartDate AND @EndDate
                    THEN ABS(TrxAmt) ELSE 0
                END) AS InsuranceAdjustments
        FROM Base
    )
    SELECT
        KPI,
        ValuePct
    FROM (
        SELECT
            'gross-expected-collection' AS KPI,
            -- Matches collection-rate.ts: Payments / GrossCharges
            CASE
                WHEN GrossCharges = 0 THEN NULL
                ELSE 100.0 * TotalPayments / GrossCharges
            END AS ValuePct
        FROM Agg

        UNION ALL

        SELECT
            'net-collection' AS KPI,
            -- Industry-standard Net Collection Rate: Payments / (Gross Charges - Contractual Adjustments)
            CASE
                WHEN (GrossCharges - TotalAdjustments) <= 0 THEN NULL
                ELSE 100.0 * TotalPayments / (GrossCharges - TotalAdjustments)
            END AS ValuePct
        FROM Agg

        UNION ALL

        SELECT
            'adjustment-by-payer' AS KPI,
            CASE
                WHEN GrossCharges = 0 THEN NULL
                ELSE 100.0 * InsuranceAdjustments / GrossCharges
            END AS ValuePct
        FROM Agg

        UNION ALL

        SELECT
            'rev-per-procedure' AS KPI,
            CAST(NULL AS DECIMAL(18, 6)) AS ValuePct

        UNION ALL

        SELECT
            'claims-first-pass-rate' AS KPI,
            CAST(NULL AS DECIMAL(18, 6)) AS ValuePct
    ) x;
  `);

  const out: Record<KpiSlug, number | null> = {
    'gross-expected-collection': null,
    'net-collection': null,
    'adjustment-by-payer': null,
    'rev-per-procedure': null,
    'claims-first-pass-rate': null,
  };

  for (const row of result.recordset) {
    out[row.KPI] = normalizeValue(row.ValuePct);
  }

  return out;
}

async function queryQuarterlyTrend(
  slug: KpiSlug,
  custFilter: { where: string; bind: (r: SqlRequest) => void },
  scopeWhere: string,
  addScopeInputs: (r: SqlRequest) => void,
): Promise<KpiTrendPoint[]> {
  const req = new sql.Request(pool);
  req.input('Slug', sql.NVarChar(100), slug);
  custFilter.bind(req);
  addScopeInputs(req);

  const result = await req.query<{ label: string; value: number }>(`
    ;WITH QuarterRanges AS (
        SELECT 0 AS OffsetN
        UNION ALL SELECT 1
        UNION ALL SELECT 2
        UNION ALL SELECT 3
    ),
    Bounds AS (
        SELECT
            OffsetN,
            DATEADD(QUARTER, -OffsetN, DATEFROMPARTS(YEAR(GETDATE()), ((DATEPART(QUARTER, GETDATE()) - 1) * 3) + 1, 1)) AS QuarterStart
        FROM QuarterRanges
    ),
    Agg AS (
        SELECT
            b.OffsetN,
            b.QuarterStart,
            CASE
                WHEN @Slug = 'gross-expected-collection' THEN
                    CASE
                        WHEN SUM(CASE WHEN rr.TrxType = 'Charge' AND rr.DateOfService >= b.QuarterStart AND rr.DateOfService < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END) = 0
                        THEN NULL
                        ELSE 100.0 *
                             SUM(CASE WHEN rr.TrxType = 'Payment' AND rr.PostDate >= b.QuarterStart AND rr.PostDate < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END)
                             /
                             SUM(CASE WHEN rr.TrxType = 'Charge' AND rr.DateOfService >= b.QuarterStart AND rr.DateOfService < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END)
                    END

                WHEN @Slug = 'net-collection' THEN
                    CASE
                        WHEN (
                            SUM(CASE WHEN rr.TrxType = 'Charge' AND rr.DateOfService >= b.QuarterStart AND rr.DateOfService < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END)
                            -
                            SUM(CASE WHEN rr.TrxType = 'Adjustment' AND rr.PostDate >= b.QuarterStart AND rr.PostDate < DATEADD(QUARTER, 1, b.QuarterStart) THEN ABS(rr.TrxAmt) ELSE 0 END)
                        ) = 0
                        THEN NULL
                        ELSE 100.0 *
                             SUM(CASE WHEN rr.TrxType = 'Payment' AND rr.PostDate >= b.QuarterStart AND rr.PostDate < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END)
                             /
                             (
                                SUM(CASE WHEN rr.TrxType = 'Charge' AND rr.DateOfService >= b.QuarterStart AND rr.DateOfService < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END)
                                -
                                SUM(CASE WHEN rr.TrxType = 'Adjustment' AND rr.PostDate >= b.QuarterStart AND rr.PostDate < DATEADD(QUARTER, 1, b.QuarterStart) THEN ABS(rr.TrxAmt) ELSE 0 END)
                             )
                    END

                WHEN @Slug = 'adjustment-by-payer' THEN
                    CASE
                        WHEN SUM(CASE WHEN rr.TrxType = 'Charge' AND rr.DateOfService >= b.QuarterStart AND rr.DateOfService < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END) = 0
                        THEN NULL
                        ELSE 100.0 *
                             SUM(CASE WHEN rr.TrxType = 'Adjustment' AND rr.PayerType = 'Insurance' AND rr.PostDate >= b.QuarterStart AND rr.PostDate < DATEADD(QUARTER, 1, b.QuarterStart) THEN ABS(rr.TrxAmt) ELSE 0 END)
                             /
                             SUM(CASE WHEN rr.TrxType = 'Charge' AND rr.DateOfService >= b.QuarterStart AND rr.DateOfService < DATEADD(QUARTER, 1, b.QuarterStart) THEN rr.TrxAmt ELSE 0 END)
                    END

                ELSE NULL
            END AS value
        FROM Bounds b
        CROSS JOIN dbo.recon_report rr
        WHERE 1=1
        ${custFilter.where}
        ${scopeWhere}
        GROUP BY b.OffsetN, b.QuarterStart
    )
    SELECT
        'Q' + CAST(DATEPART(QUARTER, QuarterStart) AS NVARCHAR(1))
          + ' ''' + RIGHT(CAST(YEAR(QuarterStart) AS NVARCHAR(4)), 2) AS label,
        CAST(value AS DECIMAL(10,2)) AS value
    FROM Agg
    ORDER BY QuarterStart DESC;
  `);

  return result.recordset
    .reverse()
    .map(r => ({ label: r.label, value: Number(r.value) || 0 }));
}

// ----- Controller -----

export const kpiController = {
  async getKpiList(req: Request, res: Response) {
    try {
      // A null customer_id means the actor is not scoped to one tenant - a Super
      // Admin with see_all. getCustFilter already yields an empty filter in that
      // case, so the row-level security policy decides what the actor may read
      // rather than this controller rejecting the request or guessing a tenant.
      const custId: number | null = (req as any).actor?.customer_id ?? null;

      const filters = (req.body || {}) as Partial<KpiFilters>;
      const { startDate, endDate } = await getDateRangeFromFilters(filters);
      const custFilter = getCustFilter(req);

      const actorEmail      = (req as any).actor?.email ?? '';
      const isImpersonating = !!(req as any).actor?.impersonatedBy;
      const actorOid        = isImpersonating ? undefined : req.headers['x-actor-oid'] as string | undefined;
      const scope = await resolveUserScope(pool, actorEmail, custId, actorOid);

      let scopeWhere = '';
      const scopeInputBinders: Array<(r: SqlRequest) => void> = [];
      if (scope.locations.length > 0) {
        const params = scope.locations.map((_, i) => `@_sLoc${i}`);
        scopeWhere = `AND Location IN (${params.join(', ')})`;
        scopeInputBinders.push((r) => scope.locations.forEach((v, i) => r.input(`_sLoc${i}`, sql.NVarChar(255), v)));
      }

      // Apply global filters from request body
      if (filters.practice && filters.practice !== 'All') {
        scopeWhere += ' AND Operations = @_fPractice';
        scopeInputBinders.push((r) => r.input('_fPractice', sql.NVarChar(255), filters.practice));
      }
      if (filters.location && filters.location !== 'All') {
        scopeWhere += ' AND Location = @_fLocation';
        scopeInputBinders.push((r) => r.input('_fLocation', sql.NVarChar(255), filters.location));
      }
      if (filters.provider) {
        scopeWhere += ' AND ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType=\'Charge\' AND ProviderName = @_fProvider)';
        scopeInputBinders.push((r) => r.input('_fProvider', sql.NVarChar(255), filters.provider));
      }
      const payers = Array.isArray((filters as any).payer) ? (filters as any).payer.filter((p: string) => p) : [];
      if (payers.length) {
        const paramNames = payers.map((_: string, i: number) => `@_fPayer${i}`);
        scopeWhere += ` AND InsuranceName IN (${paramNames.join(', ')})`;
        scopeInputBinders.push((r) => payers.forEach((p: string, i: number) => r.input(`_fPayer${i}`, sql.NVarChar(255), p)));
      }

      const addScopeInputs = (r: SqlRequest) => scopeInputBinders.forEach(fn => fn(r));

      const values = await queryAllKpis(startDate, endDate, custFilter, scopeWhere, addScopeInputs);

      let items: KpiItem[] = ALL_SLUGS.map(slug => buildKpiItem(slug, values[slug]));

      if (filters.rag && filters.rag !== 'All') {
        items = items.filter(item => item.rag === filters.rag);
      }

      res.json(items);
    } catch (err) {
      logger.error(`[kpi] getKpiList error: ${(err as Error).message}`);
      res.status(500).json({ message: 'Failed to load KPIs' });
    }
  },

  async getKpiDetail(req: Request, res: Response) {
    try {
      // See getKpiList: a null tenant is delegated to the security policy.
      const custId: number | null = (req as any).actor?.customer_id ?? null;

      const slug = req.params.slug as KpiSlug;

      if (!ALL_SLUGS.includes(slug)) {
        return res.status(404).json({ message: `Unknown KPI slug: ${slug}` });
      }

      const filters = (req.body || {}) as Partial<KpiFilters>;
      const { startDate, endDate } = await getDateRangeFromFilters(filters);
      const custFilter = getCustFilter(req);

      const actorEmail      = (req as any).actor?.email ?? '';
      const isImpersonating = !!(req as any).actor?.impersonatedBy;
      const actorOid        = isImpersonating ? undefined : req.headers['x-actor-oid'] as string | undefined;
      const scope = await resolveUserScope(pool, actorEmail, custId, actorOid);

      let scopeWhere = '';
      const scopeInputBinders: Array<(r: SqlRequest) => void> = [];
      if (scope.locations.length > 0) {
        const params = scope.locations.map((_, i) => `@_sLoc${i}`);
        scopeWhere = `AND Location IN (${params.join(', ')})`;
        scopeInputBinders.push((r) => scope.locations.forEach((v, i) => r.input(`_sLoc${i}`, sql.NVarChar(255), v)));
      }

      // Apply global filters from request body
      if (filters.practice && filters.practice !== 'All') {
        scopeWhere += ' AND Operations = @_fPractice';
        scopeInputBinders.push((r) => r.input('_fPractice', sql.NVarChar(255), filters.practice));
      }
      if (filters.location && filters.location !== 'All') {
        scopeWhere += ' AND Location = @_fLocation';
        scopeInputBinders.push((r) => r.input('_fLocation', sql.NVarChar(255), filters.location));
      }
      if (filters.provider) {
        scopeWhere += ' AND ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType=\'Charge\' AND ProviderName = @_fProvider)';
        scopeInputBinders.push((r) => r.input('_fProvider', sql.NVarChar(255), filters.provider));
      }
      const payers = Array.isArray((filters as any).payer) ? (filters as any).payer.filter((p: string) => p) : [];
      if (payers.length) {
        const paramNames = payers.map((_: string, i: number) => `@_fPayer${i}`);
        scopeWhere += ` AND InsuranceName IN (${paramNames.join(', ')})`;
        scopeInputBinders.push((r) => payers.forEach((p: string, i: number) => r.input(`_fPayer${i}`, sql.NVarChar(255), p)));
      }

      const addScopeInputs = (r: SqlRequest) => scopeInputBinders.forEach(fn => fn(r));

      const [values, trendQuarterly] = await Promise.all([
        queryAllKpis(startDate, endDate, custFilter, scopeWhere, addScopeInputs),
        queryQuarterlyTrend(slug, custFilter, scopeWhere, addScopeInputs),
      ]);

      const detail: KpiDetail = {
        item: buildKpiItem(slug, values[slug]),
        trendQuarterly,
        ...KPI_DETAIL_TEXT[slug],
      };

      res.json(detail);
    } catch (err) {
      logger.error(`[kpi] getKpiDetail error: ${(err as Error).message}`);
      res.status(500).json({ message: 'Failed to load KPI detail' });
    }
  },
};