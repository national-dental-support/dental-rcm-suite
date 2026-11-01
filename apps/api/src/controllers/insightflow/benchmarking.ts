import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Industry Benchmarking - compares practice metrics against dental industry benchmarks.
 * Uses ADA/MGMA reference data as static industry benchmarks.
 * Practice values are calculated live from recon_report + claimhistory.
 * Supports global filters: payers, providers (claim-based), locations, date range.
 */

const INDUSTRY_BENCHMARKS = {
  grossCollectionRate: { industry: 95.0, topQuartile: 98.0, label: 'Gross Collection Rate %', unit: '%', higherIsBetter: true,
    description: 'Total payments collected as a percentage of gross billed charges before any contractual adjustments. ADA benchmark: top practices collect 98%+ of gross charges. Gaps below 95% indicate uncollected patient balances, timely filing losses, or excessive write-offs.' },
  selfPayCollectionRate: { industry: 65.0, topQuartile: 82.0, label: 'Self-Pay Collection Rate %', unit: '%', higherIsBetter: true,
    description: 'Percentage of charges from uninsured or self-pay patients that are actually collected. Industry average is ~65%; top practices achieve 82%+. Self-pay is the highest-risk revenue segment \u2014 improving collection by 10 points typically adds 1\u20133% to total revenue.' },
  writeOffRate:         { industry: 4.0,  topQuartile: 1.5,  label: 'Write-Off Rate %',          unit: '%', higherIsBetter: false,
    description: 'Bad-debt write-offs as a percentage of gross charges. MGMA benchmark: top quartile keeps this under 1.5%. Write-off rate above 4% typically signals patient collection gaps, timely-filing misses, or unchallenged payer denials being abandoned rather than appealed.' },
  denialRate:           { industry: 5.0,  topQuartile: 2.5,  label: 'Denial Rate %',        unit: '%',    higherIsBetter: false,
    description: 'Percentage of submitted claims denied by payers. ADA benchmark: top practices keep this below 2.5%. High denial rates drive up rework costs and delay cash flow \u2014 each denial costs an average of $25\u2013$118 to rework.' },
  collectionRate:       { industry: 95.0, topQuartile: 98.0, label: 'Net Collection Rate %', unit: '%',    higherIsBetter: true,
    description: 'Percentage of net collectible revenue actually collected after contractual adjustments. MGMA benchmark: top quartile exceeds 98%. A rate below 95% typically signals coding errors, uncollected patient balances, or write-off policy issues.' },
  avgDaysToResolve:     { industry: 45,   topQuartile: 21,   label: 'Avg Days to Resolve',  unit: 'days', higherIsBetter: false,
    description: 'Average calendar days from claim submission to final payer resolution (accepted or adjudicated). ADA benchmark: top practices resolve in 21 days or fewer. Longer resolution times tie up cash and increase write-off risk.' },
  firstPassRate:        { industry: 85,   topQuartile: 95,   label: 'First-Pass Rate %',    unit: '%',    higherIsBetter: true,
    description: 'Percentage of claims accepted by the payer on the first submission with no rejections or corrections required. MGMA benchmark: top quartile achieves 95%+. Low first-pass rates add 7\u201314 days to revenue cycle time per claim.' },
  arOver90Days:         { industry: 18,   topQuartile: 8,    label: 'AR Over 90 Days %',    unit: '%',    higherIsBetter: false,
    description: 'Percentage of total accounts receivable balance that is 90 or more days old. ADA/MGMA benchmark: top practices keep this under 8%. Claims over 90 days are significantly more likely to be written off \u2014 collection probability drops to under 50% after 120 days.' },
  averageReimbursement: { industry: 145,  topQuartile: 178,  label: 'Avg Reimbursement $',  unit: '$',    higherIsBetter: true,
    description: 'Average payment received per claim from payers. MGMA benchmark: top-quartile dental practices average $178+ per claim. Below-average reimbursement often points to fee schedule misalignment, downcoding by payers, or underpayment not being challenged.' },
  underpaymentRate:     { industry: 25.0, topQuartile: 10.0, label: 'Underpayment Rate %',  unit: '%',    higherIsBetter: false,
    description: 'Percentage of paid claims where the payer paid less than the contracted fee schedule amount. Industry average is ~25% of claims. Top practices reduce this to under 10% through systematic contract rate validation and automated underpayment detection.' },
  appealSuccessRate:    { industry: 40.0, topQuartile: 65.0, label: 'Appeal Success Rate %', unit: '%',   higherIsBetter: true,
    description: 'Percentage of denied claims that are successfully overturned through appeals. ADA benchmark: top practices achieve 65%+ appeal success. A strong appeal program directly converts denied revenue \u2014 $1 spent on appealing typically recovers $8\u2013$12.' },
  chargeLag:            { industry: 3,    topQuartile: 1,    label: 'Charge Lag (Days)',     unit: 'days', higherIsBetter: false,
    description: 'Average days between the date of service and when the claim is submitted to the payer. ADA benchmark: top practices submit within 1 day. Every day of lag delays the entire payment cycle \u2014 practices with charge lag over 5 days lose an estimated 3\u20137% of collectible revenue annually.' },
  resubmissionRate:     { industry: 12.0, topQuartile: 5.0,  label: 'Resubmission Rate %',  unit: '%',    higherIsBetter: false,
    description: 'Percentage of submitted claims that required at least one resubmission due to rejection or payer correction requests. MGMA benchmark: top quartile keeps this under 5%. High resubmission rates indicate coding, eligibility verification, or documentation gaps.' },
  avgArDays:            { industry: 32,   topQuartile: 18,   label: 'Average AR Days',       unit: 'days', higherIsBetter: false,
    description: 'Average number of days outstanding claims have been in accounts receivable, from date of service to today. ADA benchmark: top practices maintain under 18 days. High AR days indicate bottlenecks in billing, payer delays, or patient collections \u2014 each additional AR day represents tied-up capital.' },
};

/** Build filter fragments from query params (already alias-expanded by middleware). */
function buildFilters(req: Request) {
  const custId: number | null = (req as any).actor?.customer_id ?? null;
  const custFilter = custId != null ? 'AND customer_id = @_custId' : '';

  const toArr = (v: unknown): string[] => {
    if (!v) return [];
    return (Array.isArray(v) ? v as string[] : [String(v)]).map(s => s.trim()).filter(Boolean);
  };

  const payers    = toArr(req.query.payers);
  const providers = toArr(req.query.providers);
  const locations = toArr(req.query.locations);

  let extra = '';
  const filterParams: Array<{ name: string; value: string }> = [];

  if (payers.length) {
    const pNames = payers.map((_, i) => `@fp${i}`);
    payers.forEach((v, i) => filterParams.push({ name: `fp${i}`, value: v }));
    extra += ` AND InsuranceName IN (${pNames.join(',')})`;
  }
  if (providers.length) {
    const pvNames = providers.map((_, i) => `@fpv${i}`);
    providers.forEach((v, i) => filterParams.push({ name: `fpv${i}`, value: v }));
    extra += ` AND ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType='Charge' AND ProviderName IN (${pvNames.join(',')}))`;
  }
  if (locations.length) {
    const lNames = locations.map((_, i) => `@fl${i}`);
    locations.forEach((v, i) => filterParams.push({ name: `fl${i}`, value: v }));
    extra += ` AND Location IN (${lNames.join(',')})`;
  }

  return { custId, custFilter, extra, filterParams };
}

export class BenchmarkingController extends DatabaseConnectionController {
  constructor() { super(); }

  /** Shared query logic for both endpoints. */
  private async queryPracticeValues(req: Request) {
    const { custId, custFilter, extra, filterParams } = buildFilters(req);

    const now = new Date();
    const twelveAgo = new Date(now); twelveAgo.setMonth(now.getMonth() - 12);
    const start = (req.query.start as string) || twelveAgo.toISOString().slice(0, 10);
    const end   = (req.query.end   as string) || now.toISOString().slice(0, 10);

    const mkReq = () => {
      const r = this.pool.request();
      if (custId != null) r.input('_custId', sql.Int, custId);
      r.input('start', start).input('end', end);
      filterParams.forEach(p => r.input(p.name, sql.NVarChar, p.value));
      return r;
    };

    const rrWhere = `${custFilter} ${extra}`;
    const chWhere = custId != null
      ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = claimhistory.ClaimID AND c_cust.customer_id = @_custId)`
      : '';

    const [q1, q2, q3, q5, q6, q7, q8, q9, q10, q4] = await Promise.allSettled([
      // Query 1: Core recon_report metrics (also computes gross/writeoff/selfpay for additional benchmarks)
      mkReq().query(`
        SELECT
          COUNT(DISTINCT CASE WHEN TrxType='Charge' THEN ClaimID END) AS totalClaims,
          COUNT(DISTINCT CASE WHEN IsClaimDenied=1 AND TrxType='Charge' THEN ClaimID END) AS deniedClaims,
          COUNT(CASE WHEN IsClaimDenied IS NOT NULL THEN 1 END) AS hasClaimDeniedData,
          ISNULL(SUM(CASE WHEN TrxType='Charge'    AND DateOfService BETWEEN @start AND @end THEN TrxAmt ELSE 0 END), 0) AS totalCharges,
          ISNULL(SUM(CASE WHEN TrxType='Payment'   AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END), 0) AS totalPayments,
          ISNULL(SUM(CASE WHEN TrxType='Adjustment' AND PostDate     BETWEEN @start AND @end THEN ABS(TrxAmt) ELSE 0 END), 0) AS totalAdjustments,
          ISNULL(SUM(CASE WHEN TrxType='Writeoff'  AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END), 0) AS totalWriteoffs,
          ISNULL(SUM(CASE WHEN TrxType='Charge'   AND DateOfService BETWEEN @start AND @end
                          AND (InsuranceName IS NULL OR InsuranceName='' OR LOWER(InsuranceName) LIKE '%self%') THEN TrxAmt ELSE 0 END), 0) AS selfPayCharges,
          ISNULL(SUM(CASE WHEN TrxType='Payment'  AND PostDate      BETWEEN @start AND @end
                          AND (InsuranceName IS NULL OR InsuranceName='' OR LOWER(InsuranceName) LIKE '%self%') THEN TrxAmt ELSE 0 END), 0) AS selfPayPayments
        FROM dbo.recon_report
        WHERE (DateOfService BETWEEN @start AND @end OR PostDate BETWEEN @start AND @end)
          ${rrWhere}
      `),

      // Query 2: First-pass rate - % of charge claims that were never denied
      // Uses recon_report.IsClaimDenied (0=clean, 1=denied) rather than claimhistory.CarcCode,
      // which is only populated for specialist-worked claims and under-represents clean claims.
      mkReq().query(`
        SELECT
          COUNT(DISTINCT ClaimID) AS totalResolved,
          COUNT(DISTINCT CASE WHEN IsClaimDenied = 0 OR IsClaimDenied IS NULL THEN ClaimID END) AS firstPassResolved
        FROM dbo.recon_report
        WHERE TrxType = 'Charge'
          AND DateOfService BETWEEN @start AND @end
          ${rrWhere}
      `),

      // Query 3: Avg reimbursement per claim (exclude NULL ClaimIDs - unlinked payments)
      mkReq().query(`
        SELECT AVG(claimPay) AS avgPerClaim
        FROM (
          SELECT ClaimID, SUM(TrxAmt) AS claimPay
          FROM dbo.recon_report
          WHERE TrxType = 'Payment' AND TrxAmt > 0 AND ClaimID IS NOT NULL
            AND PostDate BETWEEN @start AND @end
            ${rrWhere}
          GROUP BY ClaimID
        ) x
      `),

      // Query 5: Avg days to resolve - submission date to specialist close date.
      // Joins claims for ClaimSubmittedDate; customer filter inlined (avoids alias mismatch with chWhere).
      mkReq().query(`
        SELECT AVG(CAST(DATEDIFF(DAY, c.ClaimSubmittedDate, ch.ClaimWorkEndedTime) AS FLOAT)) AS AvgDaysToResolve
        FROM dbo.claimhistory ch
        JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
        WHERE ch.ClaimWorkEndedTime IS NOT NULL
          AND c.ClaimSubmittedDate IS NOT NULL
          AND ch.ClaimStatus IN ('Accepted','Completed','Adjudicated')
          AND DATEDIFF(DAY, c.ClaimSubmittedDate, ch.ClaimWorkEndedTime) BETWEEN 1 AND 365
          AND ch.ClaimWorkEndedTime BETWEEN @start AND @end
          ${custId != null ? 'AND c.customer_id = @_custId' : ''}
      `),

      // Query 6: Underpayment rate - claims paid below contracted estimate
      mkReq().query(`
        SELECT
          COUNT(CASE WHEN InsPayEst > 0 THEN 1 END) AS totalWithEst,
          COUNT(CASE WHEN InsPayAmt < InsPayEst AND InsPayAmt > 0 THEN 1 END) AS underpaidCount
        FROM dbo.claims
        WHERE DateOfService BETWEEN @start AND @end
          ${custId != null ? 'AND customer_id = @_custId' : ''}
      `),

      // Query 7: Appeal success rate - denied claims (have CARC) that were accepted/completed
      mkReq().query(`
        SELECT
          COUNT(DISTINCT CASE WHEN ch.CarcCode IS NOT NULL AND ch.CarcCode <> ''
                              AND ch.ClaimStatus IN ('Accepted','Completed') THEN ch.ClaimID END) AS appealSuccess,
          COUNT(DISTINCT CASE WHEN ch.CarcCode IS NOT NULL AND ch.CarcCode <> '' THEN ch.ClaimID END) AS totalDenied
        FROM dbo.claimhistory ch
        WHERE ch.ClaimWorkEndedTime BETWEEN @start AND @end
          ${custId != null ? 'AND EXISTS (SELECT 1 FROM dbo.claims cc WHERE cc.ClaimID = ch.ClaimID AND cc.customer_id = @_custId)' : ''}
      `),

      // Query 8: Charge lag - avg days from date of service to claim submission
      mkReq().query(`
        SELECT AVG(CAST(DATEDIFF(DAY, DateOfService, ClaimSubmittedDate) AS FLOAT)) AS AvgChargeLag
        FROM dbo.claims
        WHERE ClaimSubmittedDate IS NOT NULL
          AND DateOfService IS NOT NULL
          AND DATEDIFF(DAY, DateOfService, ClaimSubmittedDate) BETWEEN 0 AND 90
          AND DateOfService BETWEEN @start AND @end
          ${custId != null ? 'AND customer_id = @_custId' : ''}
      `),

      // Query 9: Resubmission rate - % of submission records that needed resubmission
      mkReq().query(`
        SELECT
          COUNT(*) AS totalSubmissions,
          COUNT(CASE WHEN resubmission_count > 0 THEN 1 END) AS resubmitted
        FROM dbo.SubmissionRecord sr
        JOIN dbo.SubmissionBatch sb ON sb.id = sr.batch_id
        WHERE sb.submitted_at BETWEEN @start AND @end
          ${custId != null ? 'AND sr.customer_id = @_custId' : ''}
      `),

      // Query 10: Average AR days - avg days open claims have been outstanding
      mkReq().query(`
        SELECT AVG(CAST(DATEDIFF(DAY, rr.DateOfService, GETDATE()) AS FLOAT)) AS AvgArDays
        FROM (
          SELECT rr.ClaimID, MAX(rr.DateOfService) AS DateOfService
          FROM dbo.recon_report rr
          WHERE rr.TrxType = 'Charge'
            AND rr.DateOfService >= DATEADD(YEAR,-2,GETDATE())
            ${rrWhere.replace(/\bcustomer_id\b/g, 'rr.customer_id').replace(/\bClaimID\b(?! IN)/g, 'rr.ClaimID').replace(/\bInsuranceName\b/g, 'rr.InsuranceName').replace(/\bLocation\b/g, 'rr.Location')}
          GROUP BY rr.ClaimID
        ) rr
        WHERE NOT EXISTS (
          SELECT 1 FROM dbo.recon_report p
          WHERE p.ClaimID = rr.ClaimID AND p.TrxType = 'Payment'
            ${custFilter.replace(/\bcustomer_id\b/g, 'p.customer_id')}
        )
        AND DATEDIFF(DAY, rr.DateOfService, GETDATE()) BETWEEN 1 AND 730
      `),

      // Query 4: Open claims aging >90 days (NOT EXISTS instead of NOT IN)
      mkReq().query(`
        SELECT COUNT(*) AS TotalOpen,
               ISNULL(SUM(CASE WHEN DATEDIFF(DAY, c.DOS, GETDATE()) > 90 THEN 1 ELSE 0 END), 0) AS Over90
        FROM (
          SELECT rr.ClaimID, MAX(rr.DateOfService) AS DOS
          FROM dbo.recon_report rr
          WHERE rr.TrxType = 'Charge'
            AND rr.DateOfService >= DATEADD(YEAR,-2,GETDATE())
            ${rrWhere.replace(/\bcustomer_id\b/g, 'rr.customer_id').replace(/\bClaimID\b(?! IN)/g, 'rr.ClaimID').replace(/\bInsuranceName\b/g, 'rr.InsuranceName').replace(/\bLocation\b/g, 'rr.Location')}
          GROUP BY rr.ClaimID
        ) c
        WHERE NOT EXISTS (
          SELECT 1 FROM dbo.recon_report p
          WHERE p.ClaimID = c.ClaimID AND p.TrxType = 'Payment'
            ${custFilter.replace(/\bcustomer_id\b/g, 'p.customer_id')}
        )
      `),
    ]);

    let denialRate: number | null = null;
    let collectionRate: number | null = null;
    let grossCollectionRate: number | null = null;
    let writeOffRate: number | null = null;
    let selfPayCollectionRate: number | null = null;
    let avgDaysToResolve: number | null = null;
    if (q1.status === 'fulfilled') {
      const d = q1.value.recordset[0];
      denialRate = d.hasClaimDeniedData > 0 && d.totalClaims > 0
        ? Math.round((d.deniedClaims / d.totalClaims) * 10000) / 100
        : null;
      const adjustedCharges = d.totalCharges - d.totalAdjustments;
      collectionRate       = adjustedCharges > 0 ? Math.round((d.totalPayments / adjustedCharges) * 10000) / 100 : null;
      grossCollectionRate  = d.totalCharges > 0  ? Math.round((d.totalPayments / d.totalCharges) * 10000) / 100 : null;
      writeOffRate         = d.totalCharges > 0  ? Math.round((d.totalWriteoffs / d.totalCharges) * 10000) / 100 : null;
      selfPayCollectionRate = d.selfPayCharges > 0 ? Math.round((d.selfPayPayments / d.selfPayCharges) * 10000) / 100 : null;
    } else {
      logger.warn('[Benchmarking] recon_report query failed', { error: q1.reason });
    }

    if (q5.status === 'fulfilled') {
      const d = q5.value.recordset[0];
      avgDaysToResolve = d?.AvgDaysToResolve != null ? Math.round(d.AvgDaysToResolve) : null;
    } else {
      logger.warn('[Benchmarking] days-to-resolve query failed', { error: (q5 as any).reason });
    }

    let firstPassRate: number | null = null;
    if (q2.status === 'fulfilled') {
      const w = q2.value.recordset[0];
      firstPassRate = w.totalResolved > 0 ? Math.round((w.firstPassResolved / w.totalResolved) * 10000) / 100 : null;
    } else {
      logger.warn('[Benchmarking] claimhistory query failed', { error: q2.reason });
    }

    // Avg reimbursement per claim
    let avgReimbursement: number | null = null;
    if (q3.status === 'fulfilled') {
      const r = q3.value.recordset[0];
      avgReimbursement = r.avgPerClaim != null ? Math.round(r.avgPerClaim) : null;
    }

    let arOver90Days: number | null = null;
    if (q4.status === 'fulfilled') {
      const a = q4.value.recordset[0];
      arOver90Days = a.TotalOpen > 0 ? Math.round((a.Over90 / a.TotalOpen) * 10000) / 100 : null;
    } else {
      logger.warn('[Benchmarking] aging query failed', { error: q4.reason });
    }

    let underpaymentRate: number | null = null;
    if (q6.status === 'fulfilled') {
      const u = (q6 as any).value.recordset[0];
      underpaymentRate = u.totalWithEst > 0 ? Math.round((u.underpaidCount / u.totalWithEst) * 10000) / 100 : null;
    } else {
      logger.warn('[Benchmarking] underpayment rate query failed', { error: (q6 as any).reason });
    }

    let appealSuccessRate: number | null = null;
    if (q7.status === 'fulfilled') {
      const ap = (q7 as any).value.recordset[0];
      appealSuccessRate = ap.totalDenied > 0 ? Math.round((ap.appealSuccess / ap.totalDenied) * 10000) / 100 : null;
    } else {
      logger.warn('[Benchmarking] appeal success rate query failed', { error: (q7 as any).reason });
    }

    let chargeLag: number | null = null;
    if (q8.status === 'fulfilled') {
      const cl = (q8 as any).value.recordset[0];
      chargeLag = cl?.AvgChargeLag != null ? Math.round(cl.AvgChargeLag) : null;
    } else {
      logger.warn('[Benchmarking] charge lag query failed', { error: (q8 as any).reason });
    }

    let resubmissionRate: number | null = null;
    if (q9.status === 'fulfilled') {
      const rs = (q9 as any).value.recordset[0];
      resubmissionRate = rs.totalSubmissions > 0 ? Math.round((rs.resubmitted / rs.totalSubmissions) * 10000) / 100 : null;
    } else {
      logger.warn('[Benchmarking] resubmission rate query failed', { error: (q9 as any).reason });
    }

    let avgArDays: number | null = null;
    if (q10.status === 'fulfilled') {
      const ar = (q10 as any).value.recordset[0];
      avgArDays = ar?.AvgArDays != null ? Math.round(ar.AvgArDays) : null;
    } else {
      logger.warn('[Benchmarking] avg AR days query failed', { error: (q10 as any).reason });
    }

    return { grossCollectionRate, selfPayCollectionRate, writeOffRate, denialRate, collectionRate, avgDaysToResolve, firstPassRate, arOver90Days, avgReimbursement, underpaymentRate, appealSuccessRate, chargeLag, resubmissionRate, avgArDays, start, end };
  }

  getBenchmarks = async (req: Request, res: Response) => {
    try {
      const pv = await this.queryPracticeValues(req);
      const metrics = {
        grossCollectionRate:  { practice: pv.grossCollectionRate,  ...INDUSTRY_BENCHMARKS.grossCollectionRate  },
        selfPayCollectionRate:{ practice: pv.selfPayCollectionRate, ...INDUSTRY_BENCHMARKS.selfPayCollectionRate},
        writeOffRate:         { practice: pv.writeOffRate,         ...INDUSTRY_BENCHMARKS.writeOffRate         },
        denialRate:           { practice: pv.denialRate,           ...INDUSTRY_BENCHMARKS.denialRate           },
        collectionRate:       { practice: pv.collectionRate,       ...INDUSTRY_BENCHMARKS.collectionRate       },
        avgDaysToResolve:     { practice: pv.avgDaysToResolve,     ...INDUSTRY_BENCHMARKS.avgDaysToResolve     },
        firstPassRate:        { practice: pv.firstPassRate,        ...INDUSTRY_BENCHMARKS.firstPassRate        },
        arOver90Days:         { practice: pv.arOver90Days,         ...INDUSTRY_BENCHMARKS.arOver90Days         },
        averageReimbursement: { practice: pv.avgReimbursement,     ...INDUSTRY_BENCHMARKS.averageReimbursement },
        underpaymentRate:     { practice: pv.underpaymentRate,     ...INDUSTRY_BENCHMARKS.underpaymentRate     },
        appealSuccessRate:    { practice: pv.appealSuccessRate,    ...INDUSTRY_BENCHMARKS.appealSuccessRate    },
        chargeLag:            { practice: pv.chargeLag,            ...INDUSTRY_BENCHMARKS.chargeLag            },
        resubmissionRate:     { practice: pv.resubmissionRate,     ...INDUSTRY_BENCHMARKS.resubmissionRate     },
        avgArDays:            { practice: pv.avgArDays,            ...INDUSTRY_BENCHMARKS.avgArDays            },
      };
      res.json({ metrics, period: `${pv.start} to ${pv.end}`, source: 'ADA/MGMA Industry Benchmarks' });
    } catch (err: any) {
      logger.error('benchmarking error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  getComparison = async (req: Request, res: Response) => {
    try {
      const pv = await this.queryPracticeValues(req);
      const practiceValues: Record<string, number | null> = {
        grossCollectionRate: pv.grossCollectionRate, selfPayCollectionRate: pv.selfPayCollectionRate,
        writeOffRate: pv.writeOffRate, denialRate: pv.denialRate, collectionRate: pv.collectionRate,
        avgDaysToResolve: pv.avgDaysToResolve, firstPassRate: pv.firstPassRate,
        arOver90Days: pv.arOver90Days, averageReimbursement: pv.avgReimbursement,
        underpaymentRate: pv.underpaymentRate, appealSuccessRate: pv.appealSuccessRate,
        chargeLag: pv.chargeLag, resubmissionRate: pv.resubmissionRate, avgArDays: pv.avgArDays,
      };
      const comparisons = Object.entries(INDUSTRY_BENCHMARKS).map(([metric, bench]) => {
        const practice = practiceValues[metric] ?? null;
        return {
          metric, label: bench.label, description: bench.description,
          practiceValue: practice, industryAvg: bench.industry, industryTop25: bench.topQuartile,
          unit: bench.unit, higherIsBetter: bench.higherIsBetter,
          percentile: practice != null ? this.calcPercentile(practice, bench.industry, bench.topQuartile, bench.higherIsBetter) : null,
        };
      });
      res.json({ comparisons, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      logger.error('benchmarking comparison error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  private calcPercentile(practice: number, industry: number, top25: number, higherIsBetter: boolean): number {
    if (higherIsBetter) {
      if (practice >= top25) return 88;
      if (practice >= industry) return 62;
      if (practice >= industry * 0.85) return 38;
      return 12;
    } else {
      if (practice <= top25) return 88;
      if (practice <= industry) return 62;
      if (practice <= industry * 1.2) return 38;
      return 12;
    }
  }
}
