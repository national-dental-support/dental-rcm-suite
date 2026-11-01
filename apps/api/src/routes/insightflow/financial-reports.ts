import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

const router = Router();
const getPool = () => Database.getInstance().getPool();

// -- Shared helpers -----------------------------------------------------------

function tenantFilter(req: Request, alias = 'rr') {
  const custId: number | null = (req as any).actor?.customer_id ?? null;
  if (custId == null) return { filter: '', bind: (r: sql.Request) => r };
  return {
    filter: `AND ${alias}.customer_id = @_custId`,
    bind: (r: sql.Request) => { r.input('_custId', sql.Int, custId); return r; },
  };
}

function locationFilter(req: Request, alias = 'rr'): { filter: string; bind: (r: sql.Request) => void } {
  const vals = arrParam(req, 'locations');
  if (!vals.length) return { filter: '', bind: () => {} };
  const names = vals.map((_, i) => `@_frl${i}`);
  return {
    filter: `AND ${alias}.Location IN (${names.join(',')})`,
    bind: (r: sql.Request) => vals.forEach((v, i) => r.input(`_frl${i}`, sql.NVarChar, v)),
  };
}

function payerFilter(req: Request, alias = 'rr'): { filter: string; bind: (r: sql.Request) => void } {
  const vals = arrParam(req, 'payers');
  if (!vals.length) return { filter: '', bind: () => {} };
  const names = vals.map((_, i) => `@_frp${i}`);
  return {
    filter: `AND ${alias}.InsuranceName IN (${names.join(',')})`,
    bind: (r: sql.Request) => vals.forEach((v, i) => r.input(`_frp${i}`, sql.NVarChar, v)),
  };
}

function providerFilter(req: Request, alias = 'rr'): { filter: string; bind: (r: sql.Request) => void } {
  const vals = arrParam(req, 'providers');
  if (!vals.length) return { filter: '', bind: () => {} };
  const names = vals.map((_, i) => `@_frpv${i}`);
  return {
    filter: `AND ${alias}.ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType='Charge' AND ProviderName IN (${names.join(',')}))`,
    bind: (r: sql.Request) => vals.forEach((v, i) => r.input(`_frpv${i}`, sql.NVarChar, v)),
  };
}

/** Extract multi-value query param (repeated keys like ?key=A&key=B). */
function arrParam(req: Request, key: string): string[] {
  const raw = req.query[key];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw as string[] : [String(raw)];
  return arr.map(v => v.trim()).filter(Boolean);
}

// -- 1. Provider Dashboard (Financial Overview) -------------------------------
// GET /provider-dashboard?locations=&payers=&providers=
router.get('/provider-dashboard', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const lf = locationFilter(req);
    const pf = payerFilter(req);
    const pvf = providerFilter(req);
    const pool = getPool();
    const r = pool.request();
    tf.bind(r);
    lf.bind(r);
    pf.bind(r);
    pvf.bind(r);

    // Single-pass aggregation + trend query
    // Date scoping matches exec summary / revenue cycle:
    //   Charges by DateOfService, Payments/Adjustments/Writeoffs by PostDate
    //   Outstanding AR scoped to last 12 months (same window as exec summary)
    const result = await r.query(`
      DECLARE @12moAgo DATE = DATEADD(YEAR, -1, GETDATE());
      DECLARE @mtdStart DATE = DATEADD(DAY, 1-DAY(GETDATE()), CAST(GETDATE() AS DATE));
      DECLARE @ytdStart DATE = DATEFROMPARTS(YEAR(GETDATE()), 1, 1);
      -- Most recent day with charge data (scripts run with ~1 day lag)
      DECLARE @latestDay DATE = (SELECT MAX(CAST(DateOfService AS DATE)) FROM dbo.recon_report rr WHERE TrxType='Charge' ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter});

      SELECT
        @latestDay AS LatestDay,
        ISNULL(SUM(CASE WHEN TrxType='Charge' AND CAST(DateOfService AS DATE) = @latestDay
                        THEN TrxAmt ELSE 0 END), 0) AS LatestDayProduction,
        ISNULL(SUM(CASE WHEN TrxType='Charge' AND DateOfService >= @mtdStart
                        THEN TrxAmt ELSE 0 END), 0) AS MtdProduction,
        ISNULL(SUM(CASE WHEN TrxType='Charge' AND DateOfService >= @ytdStart
                        THEN TrxAmt ELSE 0 END), 0) AS YtdProduction,
        ISNULL(SUM(CASE WHEN TrxType='Payment' AND PostDate >= @mtdStart
                        THEN TrxAmt ELSE 0 END), 0) AS MtdCollections,
        ISNULL(SUM(CASE WHEN TrxType='Payment' AND PostDate >= @ytdStart
                        THEN TrxAmt ELSE 0 END), 0) AS YtdCollections,
        -- Outstanding AR: last 12 months net balance (matches exec summary)
        ISNULL(SUM(CASE WHEN PostDate >= @12moAgo AND PostDate <= GETDATE() THEN
                    CASE WHEN TrxType='Charge'                                          THEN TrxAmt
                         WHEN TrxType IN ('Payment','Adjustment','Writeoff','Courtesy') THEN -ABS(TrxAmt)
                         WHEN TrxType IN ('Refund','Recoupment','ReturnedCheck','Debit') THEN ABS(TrxAmt)
                         ELSE 0 END
                   ELSE 0 END), 0) AS OutstandingAR,
        ISNULL(SUM(CASE WHEN TrxType IN ('Writeoff','Courtesy') AND PostDate >= @mtdStart
                        THEN ABS(TrxAmt) ELSE 0 END), 0) AS MtdWriteOffs
      FROM dbo.recon_report rr
      WHERE 1=1 ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter};

      SELECT FORMAT(rr.DateOfService, 'yyyy-MM') AS Month, SUM(rr.TrxAmt) AS Production
      FROM dbo.recon_report rr
      WHERE rr.TrxType = 'Charge'
        AND rr.DateOfService >= DATEADD(MONTH, -5, DATEADD(DAY, 1-DAY(GETDATE()), CAST(GETDATE() AS DATE)))
        ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter}
      GROUP BY FORMAT(rr.DateOfService, 'yyyy-MM')
      ORDER BY Month;
    `);

    const rs = result.recordsets as any[][];
    const agg = rs[0]?.[0] ?? {};
    const trend = rs[1] ?? [];
    const prevProd = trend.length >= 2 ? trend[trend.length - 2]?.Production ?? 0 : 0;
    const currProd = trend.length >= 1 ? trend[trend.length - 1]?.Production ?? 0 : 0;

    res.json({
      todayProduction: agg.LatestDayProduction ?? 0,
      latestDay: agg.LatestDay ?? null,
      mtdProduction: agg.MtdProduction ?? 0,
      ytdProduction: agg.YtdProduction ?? 0,
      mtdCollections: agg.MtdCollections ?? 0,
      ytdCollections: agg.YtdCollections ?? 0,
      outstandingAR: agg.OutstandingAR ?? 0,
      mtdWriteOffs: agg.MtdWriteOffs ?? 0,
      trend,
      productionArrow: currProd > prevProd ? 'up' : currProd < prevProd ? 'down' : 'flat',
    });
  } catch (e: any) {
    console.error('provider-dashboard error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -- 2. Write-Offs ------------------------------------------------------------
// GET /write-offs?dateFrom=&dateTo=&locations=&payers=&providers=
router.get('/write-offs', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const lf = locationFilter(req);
    const pf = payerFilter(req);
    const pvf = providerFilter(req);
    const pool = getPool();
    const dateFrom = (req.query['dateFrom'] as string) || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo   = (req.query['dateTo'] as string)   || new Date().toISOString().slice(0, 10);

    const r = pool.request();
    tf.bind(r);
    lf.bind(r);
    pf.bind(r);
    pvf.bind(r);
    r.input('dateFrom', sql.Date, dateFrom);
    r.input('dateTo', sql.Date, dateTo);

    const result = await r.query(`
      SELECT
        ISNULL(alias.canonical_name, ISNULL(cp.ChargeProvider, ISNULL(NULLIF(rr.ProviderName, ''), 'Unassigned'))) AS Provider,
        SUM(CASE WHEN rr.TrxType = 'Courtesy' THEN ABS(rr.TrxAmt) ELSE 0 END) AS Courtesy,
        SUM(CASE WHEN rr.TrxType = 'Writeoff' THEN ABS(rr.TrxAmt) ELSE 0 END) AS InsWriteOff,
        SUM(ABS(rr.TrxAmt)) AS Total,
        COUNT(*) AS AdjCount
      FROM dbo.recon_report rr
      OUTER APPLY (
        SELECT TOP 1 c.ProviderName AS ChargeProvider
        FROM dbo.recon_report c
        WHERE c.ClaimID = rr.ClaimID AND c.TrxType = 'Charge' AND c.ProviderName IS NOT NULL AND c.ProviderName != ''
      ) cp
      LEFT JOIN dbo.DataAliasMapping alias
        ON alias.entity_type = 'provider'
        AND LOWER(alias.dirty_name) = LOWER(ISNULL(cp.ChargeProvider, rr.ProviderName))
      WHERE rr.TrxType IN ('Writeoff','Courtesy')
        AND rr.PostDate BETWEEN @dateFrom AND @dateTo
        ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter}
      GROUP BY ISNULL(alias.canonical_name, ISNULL(cp.ChargeProvider, ISNULL(NULLIF(rr.ProviderName, ''), 'Unassigned')))
      ORDER BY Total DESC;

      SELECT
        rr.TrxType AS AdjType,
        CASE rr.TrxType WHEN 'Courtesy' THEN 'Courtesy' WHEN 'Writeoff' THEN 'Write-Off' ELSE rr.TrxType END AS TypeLabel,
        SUM(ABS(rr.TrxAmt)) AS Total,
        COUNT(*) AS AdjCount
      FROM dbo.recon_report rr
      WHERE rr.TrxType IN ('Writeoff','Courtesy')
        AND rr.PostDate BETWEEN @dateFrom AND @dateTo
        ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter}
      GROUP BY rr.TrxType;

      SELECT
        SUM(ABS(rr.TrxAmt)) AS GrandTotal,
        COUNT(*) AS TotalCount,
        COUNT(DISTINCT rr.ProviderName) AS ProviderCount
      FROM dbo.recon_report rr
      WHERE rr.TrxType IN ('Writeoff','Courtesy')
        AND rr.PostDate BETWEEN @dateFrom AND @dateTo
        ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter};
    `);

    const rs = result.recordsets as any[][];
    res.json({ byProvider: rs[0] ?? [], byType: rs[1] ?? [], summary: rs[2]?.[0] ?? null });
  } catch (e: any) {
    console.error('write-offs error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -- 3. Write-Off Anomalies ---------------------------------------------------
// GET /write-off-anomalies?locations=&payers=&providers=
router.get('/write-off-anomalies', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const lf = locationFilter(req);
    const pf = payerFilter(req);
    const pvf = providerFilter(req);
    const pool = getPool();
    const r = pool.request();
    tf.bind(r);
    lf.bind(r);
    pf.bind(r);
    pvf.bind(r);

    const result = await r.query(`
      ;WITH ProvStats AS (
        SELECT rr.ProviderName AS Provider,
               SUM(ABS(rr.TrxAmt)) AS Total,
               COUNT(*) AS AdjCount,
               AVG(ABS(rr.TrxAmt)) AS AvgAmt
        FROM dbo.recon_report rr
        WHERE rr.TrxType IN ('Writeoff','Courtesy')
          AND rr.PostDate >= DATEADD(DAY, -90, GETDATE())
          ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter}
        GROUP BY rr.ProviderName
      ),
      Totals AS (
        SELECT SUM(Total) AS GrandTotal, AVG(Total) AS AvgProvTotal,
               STDEV(Total) AS StdProvTotal, AVG(CAST(AdjCount AS FLOAT)) AS AvgProvCount
        FROM ProvStats
      )
      SELECT ps.Provider, ps.Total, ps.AdjCount, ps.AvgAmt, t.GrandTotal,
        CASE WHEN t.GrandTotal > 0
          THEN CAST(ps.Total * 100.0 / t.GrandTotal AS DECIMAL(5,1)) ELSE 0 END AS PctOfTotal,
        CASE
          WHEN t.StdProvTotal > 0 AND ps.Total > t.AvgProvTotal + 2 * t.StdProvTotal THEN 'HIGH_AMOUNT'
          WHEN t.GrandTotal > 0 AND ps.Total * 100.0 / t.GrandTotal > 40 THEN 'CONCENTRATION'
          WHEN t.AvgProvCount > 0 AND ps.AdjCount > 3 * t.AvgProvCount THEN 'HIGH_FREQUENCY'
          ELSE NULL
        END AS Flag
      FROM ProvStats ps CROSS JOIN Totals t
      WHERE (t.StdProvTotal > 0 AND ps.Total > t.AvgProvTotal + 2 * t.StdProvTotal)
         OR (t.GrandTotal > 0 AND ps.Total * 100.0 / t.GrandTotal > 40)
         OR (t.AvgProvCount > 0 AND ps.AdjCount > 3 * t.AvgProvCount)
      ORDER BY ps.Total DESC;
    `);

    res.json({ anomalies: result.recordset });
  } catch (e: any) {
    console.error('write-off-anomalies error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -- 4. Claim Velocity --------------------------------------------------------
// GET /claim-velocity?dateFrom=&dateTo=&locations=&payers=&providers=
router.get('/claim-velocity', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const lf = locationFilter(req);
    const pf = payerFilter(req);
    const pvf = providerFilter(req);
    const pool = getPool();
    const dateFrom = (req.query['dateFrom'] as string) || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const dateTo   = (req.query['dateTo'] as string)   || new Date().toISOString().slice(0, 10);

    const r = pool.request();
    tf.bind(r);
    lf.bind(r);
    pf.bind(r);
    pvf.bind(r);
    r.input('dateFrom', sql.Date, dateFrom);
    r.input('dateTo', sql.Date, dateTo);

    const result = await r.query(`
      ;WITH ClaimPay AS (
        SELECT charge.ClaimID, charge.InsuranceName AS Payer,
               MIN(charge.DateOfService) AS ChargeDate,
               MIN(pay.PostDate) AS FirstPayDate
        FROM dbo.recon_report charge
        JOIN dbo.recon_report pay ON pay.ClaimID = charge.ClaimID AND pay.TrxType = 'Payment'
        WHERE charge.TrxType = 'Charge'
          AND charge.DateOfService BETWEEN @dateFrom AND @dateTo
          ${tf.filter.replace(/\brr\./g, 'charge.')} ${lf.filter.replace(/\brr\./g, 'charge.')} ${pf.filter.replace(/\brr\./g, 'charge.')} ${pvf.filter.replace(/\brr\./g, 'charge.')}
        GROUP BY charge.ClaimID, charge.InsuranceName
        HAVING MIN(pay.PostDate) >= MIN(charge.DateOfService)
      )
      SELECT
        COUNT(*) AS TotalClaims,
        AVG(CAST(DATEDIFF(DAY, ChargeDate, FirstPayDate) AS FLOAT)) AS AvgDays,
        MIN(DATEDIFF(DAY, ChargeDate, FirstPayDate)) AS MinDays,
        MAX(DATEDIFF(DAY, ChargeDate, FirstPayDate)) AS MaxDays
      FROM ClaimPay
      WHERE DATEDIFF(DAY, ChargeDate, FirstPayDate) <= 365;

      ;WITH ClaimPay AS (
        SELECT charge.ClaimID, charge.InsuranceName AS Payer,
               MIN(charge.DateOfService) AS ChargeDate,
               MIN(pay.PostDate) AS FirstPayDate
        FROM dbo.recon_report charge
        JOIN dbo.recon_report pay ON pay.ClaimID = charge.ClaimID AND pay.TrxType = 'Payment'
        WHERE charge.TrxType = 'Charge'
          AND charge.DateOfService BETWEEN @dateFrom AND @dateTo
          ${tf.filter.replace(/\brr\./g, 'charge.')} ${lf.filter.replace(/\brr\./g, 'charge.')} ${pf.filter.replace(/\brr\./g, 'charge.')} ${pvf.filter.replace(/\brr\./g, 'charge.')}
        GROUP BY charge.ClaimID, charge.InsuranceName
        HAVING MIN(pay.PostDate) >= MIN(charge.DateOfService)
      )
      SELECT Payer, COUNT(*) AS ClaimCount,
             AVG(CAST(DATEDIFF(DAY, ChargeDate, FirstPayDate) AS FLOAT)) AS AvgDays
      FROM ClaimPay
      WHERE DATEDIFF(DAY, ChargeDate, FirstPayDate) <= 365
      GROUP BY Payer
      ORDER BY AvgDays DESC;
    `);

    const rs = result.recordsets as any[][];
    res.json({ overall: rs[0]?.[0] ?? null, byPayer: rs[1] ?? [] });
  } catch (e: any) {
    console.error('claim-velocity error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -- 5. Stalled Claims --------------------------------------------------------
// GET /stalled-claims?thresholdDays=30&page=1&limit=15&locations=&payers=&providers=
router.get('/stalled-claims', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const lf = locationFilter(req);
    const pf = payerFilter(req);
    const pvf = providerFilter(req);
    const pool = getPool();
    const thresholdDays = parseInt(req.query['thresholdDays'] as string) || 30;
    const page  = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(200, parseInt(req.query['limit'] as string) || 15);
    const offset = (page - 1) * limit;

    const r = pool.request();
    tf.bind(r);
    lf.bind(r);
    pf.bind(r);
    pvf.bind(r);
    r.input('thresholdDays', sql.Int, thresholdDays);
    r.input('offset', sql.Int, offset);
    r.input('limit', sql.Int, limit);

    const cte = `
      ;WITH ClaimActivity AS (
        SELECT rr.ClaimID,
               SUM(CASE WHEN rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END) AS ClaimFee,
               MAX(rr.ProviderName) AS ProviderName,
               MAX(rr.InsuranceName) AS Payer,
               MAX(rr.ClaimStatus) AS ClaimStatus,
               MAX(rr.PatientFirstName + ' ' + rr.PatientLastName) AS PatientName,
               MAX(CASE WHEN rr.TrxType != 'Charge' THEN rr.PostDate ELSE rr.DateOfService END) AS LastActivity
        FROM dbo.recon_report rr
        WHERE 1=1 ${tf.filter} ${lf.filter} ${pf.filter} ${pvf.filter}
        GROUP BY rr.ClaimID
      )`;

    const result = await r.query(`
      ${cte}
      SELECT ca.ClaimID AS ClaimNum, ca.PatientName, ca.Payer, ca.ClaimStatus,
             ca.ClaimFee, ca.LastActivity,
             DATEDIFF(DAY, ca.LastActivity, GETDATE()) AS DaysStalled
      FROM ClaimActivity ca
      WHERE DATEDIFF(DAY, ca.LastActivity, GETDATE()) >= @thresholdDays
        AND DATEDIFF(DAY, ca.LastActivity, GETDATE()) <= 365
      ORDER BY DaysStalled DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      ${cte.replace('ClaimActivity', 'ClaimActivity2')}
      SELECT COUNT(*) AS total
      FROM ClaimActivity2
      WHERE DATEDIFF(DAY, LastActivity, GETDATE()) >= @thresholdDays
        AND DATEDIFF(DAY, LastActivity, GETDATE()) <= 365;
    `);

    const rs = result.recordsets as any[][];
    res.json({ claims: rs[0] ?? [], total: rs[1]?.[0]?.total ?? 0 });
  } catch (e: any) {
    console.error('stalled-claims error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -- 6. Provider Daily Production --------------------------------------------
// GET /provider-daily-production?dayDate=YYYY-MM-DD&locations=&providers=
router.get('/provider-daily-production', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const lf = locationFilter(req);
    const pool = getPool();

    const providerVals = arrParam(req, 'providers');
    const pvNames = providerVals.map((_, i) => `@_pdpPv${i}`);
    const pvFilter = providerVals.length
      ? `AND rr.ProviderName IN (${pvNames.join(',')})`
      : '';

    const custId: number | null = (req as any).actor?.customer_id ?? null;
    const goalJoinCond = custId != null ? `AND pg.customer_id = @_custId` : '';

    const dayDateParam = req.query['dayDate'] as string | undefined;
    const r = pool.request();
    tf.bind(r);
    lf.bind(r);
    providerVals.forEach((v, i) => r.input(`_pdpPv${i}`, sql.NVarChar, v));
    r.input('_dayDate', sql.Date, dayDateParam ?? null);

    const query = `
      DECLARE @targetDate DATE = ISNULL(
        @_dayDate,
        (SELECT MAX(CAST(DateOfService AS DATE)) FROM dbo.recon_report WHERE TrxType = 'Charge')
      );
      DECLARE @weekStart DATE = DATEADD(DAY, 1 - DATEPART(WEEKDAY, @targetDate), @targetDate);

      SELECT
        rr.ProviderName                                                          AS providerName,
        CONVERT(varchar(10), @targetDate, 23)                                    AS dayDate,
        ISNULL(SUM(CASE WHEN CAST(rr.DateOfService AS DATE) = @targetDate
                         AND rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END), 0) AS production,
        ISNULL(SUM(CASE WHEN CAST(rr.DateOfService AS DATE) BETWEEN @weekStart AND @targetDate
                         AND rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END), 0) AS weekProduction,
        MAX(pg.daily_production_goal)                                            AS dailyGoal,
        MAX(pg.weekly_production_goal)                                           AS weeklyGoal
      FROM dbo.recon_report rr
      LEFT JOIN dbo.provider_goals pg
        ON pg.provider_name = rr.ProviderName ${goalJoinCond}
      WHERE rr.ProviderName IS NOT NULL AND rr.ProviderName <> ''
        ${tf.filter} ${lf.filter} ${pvFilter}
      GROUP BY rr.ProviderName
      HAVING SUM(CASE WHEN rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END) > 0
      ORDER BY production DESC;
    `;

    const result = await r.query(query);
    const rows = (result.recordset ?? []).map((row: any) => {
      const prod = Number(row.production ?? 0);
      const dailyGoal = row.dailyGoal != null ? Number(row.dailyGoal) : null;
      const weekProd = Number(row.weekProduction ?? 0);
      const weeklyGoal = row.weeklyGoal != null ? Number(row.weeklyGoal) : null;
      const pctOfDailyGoal = dailyGoal && dailyGoal > 0 ? Math.round((prod / dailyGoal) * 100) : null;
      const pctOfWeeklyGoal = weeklyGoal && weeklyGoal > 0 ? Math.round((weekProd / weeklyGoal) * 100) : null;
      const rag: 'green' | 'amber' | 'red' | 'none' = pctOfDailyGoal == null ? 'none'
        : pctOfDailyGoal >= 90 ? 'green'
        : pctOfDailyGoal >= 70 ? 'amber'
        : 'red';
      return { providerName: String(row.providerName ?? ''), dayDate: String(row.dayDate ?? ''), production: prod, dailyGoal, weekProduction: weekProd, weeklyGoal, pctOfDailyGoal, pctOfWeeklyGoal, rag };
    });

    res.json({ rows, asOf: new Date().toISOString() });
  } catch (e: any) {
    console.error('provider-daily-production error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
