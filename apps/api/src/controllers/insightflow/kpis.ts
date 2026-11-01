import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../database-connection-controller';
import logger from '../../utils/logger';
import { queryClaimEvents } from '../../utils/claim-events';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import sql from 'mssql';

function parseWindow(period: string | undefined, window: string): { start: string; end: string } {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (!period) {
    // default to current period
    if (window === 'month') {
      return {
        start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
        end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`,
      };
    }
    if (window === 'quarter') {
      const q = Math.floor(now.getMonth() / 3) + 1;
      const qStartMonth = (q - 1) * 3;
      const start = new Date(now.getFullYear(), qStartMonth, 1);
      const end = new Date(now.getFullYear(), qStartMonth + 3, 0);
      return {
        start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
      };
    }
    // year
    return {
      start: `${now.getFullYear()}-01-01`,
      end: `${now.getFullYear()}-12-31`,
    };
  }

  const trimmed = period.trim();
  if (window === 'month') {
    const [y, m] = trimmed.split('-');
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
      start: `${year}-${pad(month)}-01`,
      end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    };
  }
  if (window === 'quarter') {
    const match = trimmed.match(/(\d{4})-Q([1-4])/i);
    if (!match) throw new Error('Invalid quarter format. Use YYYY-Qn');
    const year = parseInt(match[1], 10);
    const q = parseInt(match[2], 10);
    const start = new Date(year, (q - 1) * 3, 1);
    const end = new Date(year, q * 3, 0);
    return {
      start: `${year}-${pad(start.getMonth() + 1)}-01`,
      end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    };
  }
  // year
  const year = parseInt(trimmed, 10);
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export class KpisController extends DatabaseConnectionController {
  constructor() { super(); }

  /** Helper: add @_custId input to a sql.Request when customerId is present */
  private addCustInput(request: sql.Request, customerId: number | null): void {
    if (customerId != null) request.input('_custId', sql.Int, customerId);
  }

  public getKpis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const window = (req.query.window as string || 'year').toLowerCase();
      const period = (req.query.period as string) || undefined;
      const yearOverYear = String(req.query.yoy || req.query.yoy === 'true' ? 'true' : 'false').toLowerCase() === 'true';

      // Explicit start/end take priority over window/period
      const startParam = (req.query.start as string) || undefined;
      const endParam   = (req.query.end   as string) || undefined;
      const { start, end } = (startParam && endParam)
        ? { start: startParam, end: endParam }
        : parseWindow(period, window);
      const customerId = extractCustomerId(req) ?? (req as any).actor?.customer_id;

      const pool = this.pool;

      // recon_report: direct customer_id filter (matches revenue cycle / exec summary pattern)
      const rrFilter = customerId != null
        ? `AND customer_id = @_custId`
        : '';
      const chFilter = customerId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = claimhistory.ClaimID AND c_cust.customer_id = @_custId)`
        : '';
      // ClaimEvent and UserActivity DO have customer_id - direct filter
      const evFilter = customerId != null ? 'AND customer_id = @_custId' : '';

      // Global filters: payers, providers, locations
      const toArr = (v: unknown): string[] => {
        if (!v) return [];
        const arr = Array.isArray(v) ? v as string[] : [String(v)];
        return arr.map(s => s.trim()).filter(Boolean);
      };
      const qPayers    = toArr(req.query.payers);
      const qProviders = toArr(req.query.providers);
      const qLocations = toArr(req.query.locations);

      let extraFilter = '';
      const extraFilterParams: Array<{ name: string; value: string }> = [];
      if (qPayers.length) {
        const pNames = qPayers.map((_, i) => `@fp${i}`);
        qPayers.forEach((v, i) => extraFilterParams.push({ name: `fp${i}`, value: v }));
        extraFilter += ` AND InsuranceName IN (${pNames.join(',')})`;
      }
      if (qProviders.length) {
        const pvNames = qProviders.map((_, i) => `@fpv${i}`);
        qProviders.forEach((v, i) => extraFilterParams.push({ name: `fpv${i}`, value: v }));
        extraFilter += ` AND ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType='Charge' AND ProviderName IN (${pvNames.join(',')}))`;
      }
      if (qLocations.length) {
        const lNames = qLocations.map((_, i) => `@fl${i}`);
        qLocations.forEach((v, i) => extraFilterParams.push({ name: `fl${i}`, value: v }));
        extraFilter += ` AND Location IN (${lNames.join(',')})`;
      }
      const bindExtraFilter = (r: sql.Request) => extraFilterParams.forEach(p => r.input(p.name, sql.NVarChar, p.value));

      // Core KPI queries
      const r = pool.request().input('start', start).input('end', end);
      this.addCustInput(r, customerId);
      bindExtraFilter(r);

      const result = await r.query(`
        SELECT
          ISNULL(SUM(CASE WHEN TrxType='Charge'     AND DateOfService BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS GrossCharges,
          ISNULL(SUM(CASE WHEN TrxType='Payment'    AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS Payments,
          ISNULL(SUM(CASE WHEN TrxType='Adjustment' AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS Adjustments,
          ISNULL(SUM(CASE WHEN TrxType='Writeoff'   AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS Writeoffs,
          -- Self-pay (no insurance) portion
          ISNULL(SUM(CASE WHEN TrxType='Charge'  AND (InsuranceName IS NULL OR InsuranceName = '' OR LOWER(InsuranceName) LIKE '%self%') AND DateOfService BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS SelfPayCharges,
          ISNULL(SUM(CASE WHEN TrxType='Payment' AND (InsuranceName IS NULL OR InsuranceName = '' OR LOWER(InsuranceName) LIKE '%self%') AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS SelfPayPayments,
          COUNT(DISTINCT CASE WHEN TrxType='Charge' AND DateOfService BETWEEN @start AND @end THEN ClaimID END) AS TotalClaims,
          COUNT(DISTINCT CASE WHEN IsClaimDenied=1 AND TrxType='Charge' AND DateOfService BETWEEN @start AND @end THEN ClaimID END) AS DeniedClaims
        FROM recon_report
        WHERE (
          (TrxType = 'Charge' AND DateOfService BETWEEN @start AND @end)
          OR (TrxType IN ('Payment', 'Adjustment') AND PostDate BETWEEN @start AND @end)
          OR (TrxType NOT IN ('Charge', 'Payment', 'Adjustment') AND DateOfService BETWEEN @start AND @end)
        )
          ${rrFilter} ${extraFilter};
      `);

      const row = result.recordset[0] ?? {};
      const grossCharges = Number(row.GrossCharges ?? 0);
      const payments = Number(row.Payments ?? 0);
      const adjustments = Number(row.Adjustments ?? 0);
      const writeoffs = Number(row.Writeoffs ?? 0);
      const selfPayCharges = Number(row.SelfPayCharges ?? 0);
      const selfPayPayments = Number(row.SelfPayPayments ?? 0);
      const totalClaims = Number(row.TotalClaims ?? 0);
      const deniedClaims = Number(row.DeniedClaims ?? 0);

      const netRevenue = Math.max(0, grossCharges - adjustments);
      const kpis: any = {
        period: { window, start, end },
        // Raw dollar amounts for revenue waterfall
        rawRevenue: {
          grossCharges: Math.round(grossCharges),
          adjustments:  Math.round(adjustments),
          netRevenue:   Math.round(netRevenue),
          payments:     Math.round(payments),
          writeoffs:    Math.round(writeoffs),
          netOutstanding: Math.round(Math.max(0, netRevenue - payments)),
        },
        grossCollectionRate: grossCharges > 0 ? payments / grossCharges : null,
        netCollectionRate: netRevenue > 0 ? payments / netRevenue : null,
        selfPayCollectionRate: selfPayCharges > 0 ? selfPayPayments / selfPayCharges : null,
        denialRate: totalClaims > 0 ? deniedClaims / totalClaims : null,
      };

      // First-pass rate from claimhistory (no customer_id column - use EXISTS)
      const fpsReq = pool.request().input('start', start).input('end', end);
      this.addCustInput(fpsReq, customerId);
      const fps = await fpsReq.query(`
          SELECT
            COUNT(DISTINCT ClaimID) AS TotalResolved,
            COUNT(DISTINCT CASE WHEN CarcCode IS NULL OR CarcCode = '' THEN ClaimID END) AS FirstPass
          FROM dbo.claimhistory
          WHERE ClaimWorkEndedTime IS NOT NULL
            AND ClaimWorkStartedTime BETWEEN @start AND @end
            ${chFilter};
        `);

      const fpsRow = fps.recordset[0] ?? {};
      const totalResolved = Number(fpsRow.TotalResolved ?? 0);
      const firstPass = Number(fpsRow.FirstPass ?? 0);
      kpis.firstPassRate = totalResolved > 0 ? firstPass / totalResolved : null;

      // Days in AR - net balance / average daily charges over the period
      const periodDays = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
      const netAR = grossCharges - payments - adjustments;
      kpis.daysInAR = grossCharges > 0 && netAR > 0
        ? Math.round(netAR / (grossCharges / periodDays))
        : null;

      // Lag metrics (days) from event telemetry (ClaimEvent HAS customer_id)
      try {
        const lagReq = pool.request().input('start', start).input('end', end);
        this.addCustInput(lagReq, customerId);
        const lagRes = await lagReq.query(`
            WITH submitted AS (
              SELECT claim_id, MIN(event_time) AS submitted_at
              FROM dbo.ClaimEvent
              WHERE event_type = 'claim_created' AND event_time BETWEEN @start AND @end
              ${evFilter}
              GROUP BY claim_id
            ),
            payments AS (
              SELECT claim_id, MIN(event_time) AS paid_at
              FROM dbo.ClaimEvent
              WHERE event_type = 'payment_posted'
              ${evFilter}
              GROUP BY claim_id
            ),
            denials AS (
              SELECT claim_id, MIN(event_time) AS denied_at
              FROM dbo.ClaimEvent
              WHERE event_type = 'denial_work_started'
              ${evFilter}
              GROUP BY claim_id
            ),
            writeoffs AS (
              SELECT claim_id, MIN(event_time) AS writeoff_at
              FROM dbo.ClaimEvent
              WHERE event_type IN ('writeoff_auto_posted','writeoff_approved')
              ${evFilter}
              GROUP BY claim_id
            )
            SELECT
              AVG(DATEDIFF(day, s.submitted_at, p.paid_at)) AS AvgDaysToPayment,
              AVG(DATEDIFF(day, s.submitted_at, d.denied_at)) AS AvgDaysToDenial,
              AVG(DATEDIFF(day, s.submitted_at, w.writeoff_at)) AS AvgDaysToWriteOff
            FROM submitted s
            LEFT JOIN payments p ON p.claim_id = s.claim_id
            LEFT JOIN denials d ON d.claim_id = s.claim_id
            LEFT JOIN writeoffs w ON w.claim_id = s.claim_id;
          `);

        const lagRow = lagRes.recordset[0] ?? {};
        kpis.avgDaysToPayment = lagRow.AvgDaysToPayment != null ? Number(lagRow.AvgDaysToPayment) : null;
        kpis.avgDaysToDenial = lagRow.AvgDaysToDenial != null ? Number(lagRow.AvgDaysToDenial) : null;
        kpis.avgDaysToWriteOff = lagRow.AvgDaysToWriteOff != null ? Number(lagRow.AvgDaysToWriteOff) : null;
      } catch (err) {
        // Telemetry lag metrics are optional; do not break main KPI response
        logger.warn('[KPI] optional metric failed:', (err as any)?.message);
      }

      // avgDaysToWriteOff fallback: ClaimEvent write-off events are rarely populated;
      // derive from recon_report charge->writeoff row pairs instead.
      if (kpis.avgDaysToWriteOff == null) {
        try {
          const woReq = pool.request().input('start', start).input('end', end);
          this.addCustInput(woReq, customerId);
          bindExtraFilter(woReq);
          const woRes = await woReq.query(`
            SELECT AVG(CAST(DATEDIFF(DAY, c.DateOfService, w.PostDate) AS FLOAT)) AS AvgDaysToWriteOff
            FROM dbo.recon_report c
            JOIN dbo.recon_report w
              ON  w.ClaimID  = c.ClaimID
              AND w.TrxType  = 'Writeoff'
              AND w.PostDate IS NOT NULL
            WHERE c.TrxType = 'Charge'
              AND c.DateOfService BETWEEN @start AND @end
              AND DATEDIFF(DAY, c.DateOfService, w.PostDate) BETWEEN 1 AND 730
              ${rrFilter} ${extraFilter};
          `);
          const woRow = woRes.recordset[0] ?? {};
          if (woRow.AvgDaysToWriteOff != null) {
            kpis.avgDaysToWriteOff = Math.round(Number(woRow.AvgDaysToWriteOff));
          }
        } catch (err) { logger.warn('[KPI] avgDaysToWriteOff fallback failed:', (err as any)?.message); }
      }

      // -- Expanded industry KPIs (all optional) ---------------------------
      // Write-Off Rate - bad-debt writeoffs only (not contractual adjustments)
      kpis.writeOffRate = grossCharges > 0 ? writeoffs / grossCharges : null;

      // Average Reimbursement per Claim
      try {
        const reimbReq = pool.request().input('start', start).input('end', end);
        this.addCustInput(reimbReq, customerId);
        bindExtraFilter(reimbReq);
        const reimb = await reimbReq.query(`
            SELECT
              ISNULL(SUM(CASE WHEN TrxType='Payment' AND PostDate BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS TotalPay,
              COUNT(DISTINCT CASE WHEN TrxType='Payment' AND TrxAmt > 0 AND PostDate BETWEEN @start AND @end THEN ClaimID END) AS PaidClaims
            FROM recon_report
            WHERE PostDate BETWEEN @start AND @end
              ${rrFilter} ${extraFilter};
          `);
        const rr = reimb.recordset[0] ?? {};
        const paidClaims = Number(rr.PaidClaims ?? 0);
        /* istanbul ignore next */
        kpis.avgReimbursementPerClaim = paidClaims > 0 ? Number(rr.TotalPay ?? 0) / paidClaims : null;
      } catch (err) { logger.warn('[KPI] optional metric failed:', (err as any)?.message); }

      // A/R Aging >90 Days %
      try {
        const agingReq = pool.request();
        this.addCustInput(agingReq, customerId);
        bindExtraFilter(agingReq);
        const aging = await agingReq.query(`
            SELECT
              COUNT(DISTINCT CASE WHEN DATEDIFF(day, DateOfService, GETDATE()) > 90 THEN ClaimID END) AS Over90,
              COUNT(DISTINCT ClaimID) AS TotalOutstanding
            FROM recon_report
            WHERE TrxType='Charge'
              AND NOT EXISTS (
                SELECT 1 FROM recon_report p
                WHERE p.ClaimID = recon_report.ClaimID AND p.TrxType='Payment' AND p.TrxAmt > 0
              )
              ${rrFilter} ${extraFilter};
          `);
        const ar = aging.recordset[0] ?? {};
        const totalOutstanding = Number(ar.TotalOutstanding ?? 0);
        /* istanbul ignore next */
        kpis.arAging90PlusPct = totalOutstanding > 0 ? Number(ar.Over90 ?? 0) / totalOutstanding : null;
      } catch (err) { logger.warn('[KPI] optional metric failed:', (err as any)?.message); }

      // AR Aging dollar buckets (0-30, 31-60, 61-90, 90+)
      try {
        const bucketReq = pool.request();
        this.addCustInput(bucketReq, customerId);
        bindExtraFilter(bucketReq);
        const buckets = await bucketReq.query(`
          SELECT
            ISNULL(SUM(CASE WHEN DATEDIFF(day,DateOfService,GETDATE()) BETWEEN  0 AND 30  THEN TrxAmt ELSE 0 END),0) AS d0_30,
            ISNULL(SUM(CASE WHEN DATEDIFF(day,DateOfService,GETDATE()) BETWEEN 31 AND 60  THEN TrxAmt ELSE 0 END),0) AS d31_60,
            ISNULL(SUM(CASE WHEN DATEDIFF(day,DateOfService,GETDATE()) BETWEEN 61 AND 90  THEN TrxAmt ELSE 0 END),0) AS d61_90,
            ISNULL(SUM(CASE WHEN DATEDIFF(day,DateOfService,GETDATE())         > 90       THEN TrxAmt ELSE 0 END),0) AS d90plus
          FROM dbo.recon_report
          WHERE TrxType = 'Charge'
            AND NOT EXISTS (
              SELECT 1 FROM dbo.recon_report p
              WHERE p.ClaimID = recon_report.ClaimID AND p.TrxType = 'Payment' AND p.TrxAmt > 0
            )
            ${rrFilter} ${extraFilter};
        `);
        const b = buckets.recordset[0] ?? {};
        kpis.arAgingBuckets = {
          current:   Math.round(Number(b.d0_30   ?? 0)),
          days31to60: Math.round(Number(b.d31_60 ?? 0)),
          days61to90: Math.round(Number(b.d61_90 ?? 0)),
          days90plus: Math.round(Number(b.d90plus ?? 0)),
        };
      } catch (err) { logger.warn('[KPI] arAgingBuckets failed:', (err as any)?.message); }

      // Clean Claim Rate (claims without any rejection/rework codes)
      try {
        const cleanReq = pool.request().input('start', start).input('end', end);
        this.addCustInput(cleanReq, customerId);
        const clean = await cleanReq.query(`
            SELECT
              COUNT(DISTINCT ClaimID) AS TotalSubmitted,
              COUNT(DISTINCT CASE WHEN NOT EXISTS (
                SELECT 1 FROM dbo.claimhistory ch2
                WHERE ch2.ClaimID = claimhistory.ClaimID
                  AND ch2.CarcCode IS NOT NULL AND ch2.CarcCode <> ''
                  AND ch2.ClaimWorkStartedTime BETWEEN @start AND @end
              ) THEN ClaimID END) AS CleanClaims
            FROM dbo.claimhistory
            WHERE ClaimWorkStartedTime BETWEEN @start AND @end
              ${chFilter};
          `);
        const cr = clean.recordset[0] ?? {};
        const totalSubmitted = Number(cr.TotalSubmitted ?? 0);
        /* istanbul ignore next */
        kpis.cleanClaimRate = totalSubmitted > 0 ? Number(cr.CleanClaims ?? 0) / totalSubmitted : null;
      } catch (err) { logger.warn('[KPI] optional metric failed:', (err as any)?.message); }

      // Denial Overturn Rate (denied then resolved/paid)
      try {
        const overturnReq = pool.request().input('start', start).input('end', end);
        this.addCustInput(overturnReq, customerId);
        const chFilterInner = customerId != null
          ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = ch_inner.ClaimID AND c_cust.customer_id = @_custId)`
          : '';
        const overturn = await overturnReq.query(`
            SELECT
              COUNT(DISTINCT d.ClaimID) AS TotalDenied,
              COUNT(DISTINCT p.ClaimID) AS Overturned
            FROM (
              SELECT DISTINCT ClaimID FROM dbo.claimhistory ch_inner
              WHERE CarcCode IS NOT NULL AND CarcCode <> ''
                AND ClaimWorkStartedTime BETWEEN @start AND @end
                ${chFilterInner}
            ) d
            LEFT JOIN (
              SELECT DISTINCT ClaimID FROM dbo.claimhistory ch_inner
              WHERE ClaimWorkEndedTime IS NOT NULL
                AND (CarcCode IS NULL OR CarcCode = '')
                AND ClaimWorkStartedTime BETWEEN @start AND @end
                ${chFilterInner}
            ) p ON p.ClaimID = d.ClaimID;
          `);
        const ot = overturn.recordset[0] ?? {};
        const totalDenied = Number(ot.TotalDenied ?? 0);
        /* istanbul ignore next */
        kpis.denialOverturnRate = totalDenied > 0 ? Number(ot.Overturned ?? 0) / totalDenied : null;
      } catch (err) { logger.warn('[KPI] optional metric failed:', (err as any)?.message); }

      // Cost to Collect (staff hours / payments - approximate from UserActivity; HAS customer_id)
      try {
        const costReq = pool.request().input('start', start).input('end', end);
        this.addCustInput(costReq, customerId);
        const cost = await costReq.query(`
            SELECT
              ISNULL(SUM(DATEDIFF(minute, start_time, end_time)) / 60.0, 0) AS TotalHours
            FROM dbo.UserActivity
            WHERE start_time BETWEEN @start AND @end
              ${evFilter};
          `);
        const totalHours = Number(cost.recordset[0]?.TotalHours ?? 0);
        // Cost to collect as ratio: hours / (payments / 100) - cents per dollar
        kpis.costToCollect = payments > 0 && totalHours > 0 ? (totalHours * 25) / payments : null; // assuming $25/hr labor cost
      } catch (err) { logger.warn('[KPI] optional metric failed:', (err as any)?.message); }

      if (yearOverYear) {
        // Compute same window a year earlier
        const prevStart = new Date(start);
        prevStart.setFullYear(prevStart.getFullYear() - 1);
        const prevEnd = new Date(end);
        prevEnd.setFullYear(prevEnd.getFullYear() - 1);

        const ps = `${prevStart.getFullYear()}-${(prevStart.getMonth()+1).toString().padStart(2,'0')}-${prevStart.getDate().toString().padStart(2,'0')}`;
        const pe = `${prevEnd.getFullYear()}-${(prevEnd.getMonth()+1).toString().padStart(2,'0')}-${prevEnd.getDate().toString().padStart(2,'0')}`;

        const yqReq = pool.request().input('start', ps).input('end', pe);
        this.addCustInput(yqReq, customerId);
        bindExtraFilter(yqReq);
        const yq = await yqReq.query(`
            SELECT
              ISNULL(SUM(CASE WHEN TrxType='Charge'     AND DateOfService BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS GrossCharges,
              ISNULL(SUM(CASE WHEN TrxType='Payment'    AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS Payments,
              ISNULL(SUM(CASE WHEN TrxType='Adjustment' AND PostDate      BETWEEN @start AND @end THEN TrxAmt ELSE 0 END),0) AS Adjustments,
              COUNT(DISTINCT CASE WHEN TrxType='Charge' AND DateOfService BETWEEN @start AND @end THEN ClaimID END) AS TotalClaims,
              COUNT(DISTINCT CASE WHEN IsClaimDenied=1 AND TrxType='Charge' AND DateOfService BETWEEN @start AND @end THEN ClaimID END) AS DeniedClaims
            FROM recon_report
            WHERE (
              (TrxType != 'Payment' AND DateOfService BETWEEN @start AND @end)
              OR (TrxType = 'Payment' AND PostDate BETWEEN @start AND @end)
            )
            ${rrFilter} ${extraFilter};
          `);

        /* istanbul ignore next */
        const yrow = yq.recordset[0] ?? {};
        const yGross = Number(yrow.GrossCharges ?? 0);
        const yPay = Number(yrow.Payments ?? 0);
        const yAdj = Number(yrow.Adjustments ?? 0);
        const yTotalClaims = Number(yrow.TotalClaims ?? 0);
        const yDenied = Number(yrow.DeniedClaims ?? 0);

        kpis.yoy = {
          grossCollectionRate: yGross > 0 ? yPay / yGross : null,
          netCollectionRate: (yGross - yAdj) > 0 ? yPay / (yGross - yAdj) : null,
          denialRate: yTotalClaims > 0 ? yDenied / yTotalClaims : null,
        };
      }

      return res.status(200).json({ message: 'KPI summary', data: kpis });
    } catch (err: any) {
      logger.error('Kpis.getKpis \u2013 error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  public getClaimEvents = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = (req.query.claimId as string) || undefined;
      const eventType = (req.query.eventType as string) || undefined;
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;
      const customerId = extractCustomerId(req) ?? (req as any).actor?.customer_id;

      const events = await queryClaimEvents(this.pool, {
        claimId,
        eventType,
        from,
        to,
        customerId,
      });

      return res.status(200).json({ message: 'Claim events', data: events });
    } catch (err: any) {
      logger.error('Kpis.getClaimEvents \u2013 error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
