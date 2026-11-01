import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, extractCustomerId, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class MyPerformanceSummary extends DatabaseConnectionController {
  constructor() { super(); }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId = extractCustomerId(req);
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      if (scope.userId == null) {
        return res.status(200).json({ message: 'My performance summary data', data: null });
      }

      const period = (req.query.period as string) ?? '1w';
      const userEmail = actorEmail;

      const request = this.pool.request();
      request.input('CurrentUserID', sql.Int, scope.userId);
      request.input('UserEmail', sql.NVarChar(255), userEmail);

      const effectiveCustId = scope.customerId;
      const custFilterCH = buildCustomerFilter(effectiveCustId, 'ch');
      custFilterCH.addInputs(request);

      // -- Compute COMPLETED period boundaries ------------------------------
      // "Last week" = Mon-Sun of the previous full week (not current partial week)
      // "Last month" = 1st to last day of previous calendar month
      // "Last quarter" = previous full calendar quarter
      // "Last year" = previous full calendar year
      let periodSql: string;
      switch (period) {
        case '1w':
          periodSql = `
            DECLARE @ThisMonday date = DATEADD(DAY, -(DATEPART(WEEKDAY, @Today) + 5) % 7, @Today);
            DECLARE @PeriodStart date = DATEADD(DAY, -7, @ThisMonday);
            DECLARE @PeriodEnd   date = DATEADD(DAY, -1, @ThisMonday);
            DECLARE @PriorStart  date = DATEADD(DAY, -14, @ThisMonday);
            DECLARE @PriorEnd    date = DATEADD(DAY, -8, @ThisMonday);
            DECLARE @PeriodLabel varchar(20) = 'Last week';
          `;
          break;
        case '1m':
          periodSql = `
            DECLARE @FirstOfThisMonth date = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);
            DECLARE @PeriodStart date = DATEADD(MONTH, -1, @FirstOfThisMonth);
            DECLARE @PeriodEnd   date = DATEADD(DAY, -1, @FirstOfThisMonth);
            DECLARE @PriorStart  date = DATEADD(MONTH, -2, @FirstOfThisMonth);
            DECLARE @PriorEnd    date = DATEADD(DAY, -1, @PeriodStart);
            DECLARE @PeriodLabel varchar(20) = 'Last month';
          `;
          break;
        case '3m':
          periodSql = `
            DECLARE @ActiveQ int = DATEPART(QUARTER, @Today);
            DECLARE @ActiveY int = YEAR(@Today);
            DECLARE @PrevQ int = CASE WHEN @ActiveQ = 1 THEN 4 ELSE @ActiveQ - 1 END;
            DECLARE @PrevY int = CASE WHEN @ActiveQ = 1 THEN @ActiveY - 1 ELSE @ActiveY END;
            DECLARE @PeriodStart date = DATEFROMPARTS(@PrevY, (@PrevQ - 1) * 3 + 1, 1);
            DECLARE @PeriodEnd   date = DATEADD(DAY, -1, DATEFROMPARTS(
              CASE WHEN @PrevQ = 4 THEN @PrevY + 1 ELSE @PrevY END,
              CASE WHEN @PrevQ = 4 THEN 1 ELSE @PrevQ * 3 + 1 END, 1));
            DECLARE @PP_Q int = CASE WHEN @PrevQ = 1 THEN 4 ELSE @PrevQ - 1 END;
            DECLARE @PP_Y int = CASE WHEN @PrevQ = 1 THEN @PrevY - 1 ELSE @PrevY END;
            DECLARE @PriorStart date = DATEFROMPARTS(@PP_Y, (@PP_Q - 1) * 3 + 1, 1);
            DECLARE @PriorEnd   date = DATEADD(DAY, -1, @PeriodStart);
            DECLARE @PeriodLabel varchar(20) = 'Last quarter';
          `;
          break;
        case '1y':
          periodSql = `
            DECLARE @PeriodStart date = DATEFROMPARTS(YEAR(@Today) - 1, 1, 1);
            DECLARE @PeriodEnd   date = DATEFROMPARTS(YEAR(@Today) - 1, 12, 31);
            DECLARE @PriorStart  date = DATEFROMPARTS(YEAR(@Today) - 2, 1, 1);
            DECLARE @PriorEnd    date = DATEFROMPARTS(YEAR(@Today) - 2, 12, 31);
            DECLARE @PeriodLabel varchar(20) = 'Last year';
          `;
          break;
        default:
          periodSql = `
            DECLARE @ThisMonday date = DATEADD(DAY, -(DATEPART(WEEKDAY, @Today) + 5) % 7, @Today);
            DECLARE @PeriodStart date = DATEADD(DAY, -7, @ThisMonday);
            DECLARE @PeriodEnd   date = DATEADD(DAY, -1, @ThisMonday);
            DECLARE @PriorStart  date = DATEADD(DAY, -14, @ThisMonday);
            DECLARE @PriorEnd    date = DATEADD(DAY, -8, @ThisMonday);
            DECLARE @PeriodLabel varchar(20) = 'Last week';
          `;
      }

      const query = `
      DECLARE @Today date = CAST(GETDATE() AS date);

      ${periodSql}

      -- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
      -- MY QUEUE TODAY (look ahead \u2014 what needs to be done)
      -- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

      -- Open claims currently assigned to me.
      -- Match my-queue.ts exactly: ROW_NUMBER over ALL rows ordered by ClaimModifiedDate,
      -- then post-filter for open + not closed/adjudicated. This avoids the 796-vs-0 bug
      -- where pre-filtering to EndTime IS NULL gave a different "latest row" per claim.
      DECLARE @QueueSize int = 0;
      SELECT @QueueSize = COUNT(*)
      FROM (
          SELECT ch.ClaimID,
                 ROW_NUMBER() OVER (
                     PARTITION BY ch.ClaimID
                     ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
                 ) AS rn,
                 ch.AssignedTo,
                 ch.ClaimWorkEndedTime,
                 ch.ClaimStatus
          FROM dbo.claimhistory ch
          WHERE ch.AssignedTo IS NOT NULL
            ${custFilterCH.where}
      ) t
      WHERE t.rn = 1
        AND t.AssignedTo = @CurrentUserID
        AND t.ClaimWorkEndedTime IS NULL
        AND t.ClaimStatus NOT IN ('Closed', 'Adjudicated');

      -- Urgent/overdue claims (aging > 60 days from submission)
      DECLARE @UrgentClaims int = 0;
      SELECT @UrgentClaims = COUNT(DISTINCT t.ClaimID)
      FROM (
          SELECT ch.ClaimID,
                 ROW_NUMBER() OVER (
                     PARTITION BY ch.ClaimID
                     ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
                 ) AS rn,
                 ch.AssignedTo, ch.ClaimWorkEndedTime, ch.ClaimStatus
          FROM dbo.claimhistory ch
          WHERE ch.AssignedTo IS NOT NULL
            ${custFilterCH.where}
      ) t
      JOIN dbo.claims c ON c.ClaimID = t.ClaimID
      WHERE t.rn = 1
        AND t.AssignedTo = @CurrentUserID
        AND t.ClaimWorkEndedTime IS NULL
        AND t.ClaimStatus NOT IN ('Closed', 'Adjudicated')
        AND DATEDIFF(DAY, c.ClaimSubmittedDate, @Today) > 60;

      -- Queue value (total charge amount of open claims assigned to me)
      DECLARE @QueueValue decimal(18,2) = 0;
      SELECT @QueueValue = ISNULL(SUM(c.ChargeAmt), 0)
      FROM (
          SELECT ch.ClaimID,
                 ROW_NUMBER() OVER (
                     PARTITION BY ch.ClaimID
                     ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
                 ) AS rn,
                 ch.AssignedTo, ch.ClaimWorkEndedTime, ch.ClaimStatus
          FROM dbo.claimhistory ch
          WHERE ch.AssignedTo IS NOT NULL
            ${custFilterCH.where}
      ) t
      JOIN dbo.claims c ON c.ClaimID = t.ClaimID
      WHERE t.rn = 1
        AND t.AssignedTo = @CurrentUserID
        AND t.ClaimWorkEndedTime IS NULL
        AND t.ClaimStatus NOT IN ('Closed', 'Adjudicated');

      -- Daily quota: avg claims completed per workday.
      -- Use the most recent 365 days so demo data seeded months ago is still captured.
      -- If still zero (brand-new account), leave at 0 \u2014 frontend fills in defaults.
      DECLARE @AvgClaimsPerDay float = 0;
      DECLARE @WorkDays int = 0;
      SELECT
        @AvgClaimsPerDay = CASE WHEN COUNT(DISTINCT CAST(ch.ClaimWorkEndedTime AS date)) > 0
          THEN CAST(COUNT(DISTINCT ch.ClaimID) AS float) / COUNT(DISTINCT CAST(ch.ClaimWorkEndedTime AS date))
          ELSE 0 END,
        @WorkDays = COUNT(DISTINCT CAST(ch.ClaimWorkEndedTime AS date))
      FROM dbo.claimhistory ch
      WHERE ch.AssignedTo = @CurrentUserID
        AND ch.ClaimWorkEndedTime IS NOT NULL
        AND ch.ClaimWorkEndedTime >= DATEADD(DAY, -365, @Today)
        AND ch.ClaimWorkEndedTime <= @Today
        ${custFilterCH.where};

      -- Estimated days to clear queue
      DECLARE @DaysToClear float = CASE WHEN @AvgClaimsPerDay > 0
        THEN @QueueSize / @AvgClaimsPerDay ELSE 0 END;

      -- Avg minutes per claim (365-day window, matching dailyQuota window)
      DECLARE @AvgMinPerClaim float = 0;
      SELECT @AvgMinPerClaim = ISNULL(AVG(
        CAST(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS float)
      ), 0)
      FROM dbo.claimhistory ch
      WHERE ch.AssignedTo = @CurrentUserID
        AND ch.ClaimWorkStartedTime IS NOT NULL AND ch.ClaimWorkEndedTime IS NOT NULL
        AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
        AND ch.ClaimWorkEndedTime >= DATEADD(DAY, -365, @Today)
        AND ch.ClaimWorkEndedTime <= @Today
        ${custFilterCH.where};

      -- Estimated hours to hit daily quota
      DECLARE @EstHoursToday float = @AvgClaimsPerDay * @AvgMinPerClaim / 60.0;

      -- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
      -- LAST [PERIOD] PERFORMANCE (look back at COMPLETED period)
      -- Hours = daily-capped login time from UserSessions (max 10h/day)
      -- Falls back to claim work durations if no session data
      -- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

      -- Hours: fall back to claim work durations (UserSessions may not have demo data)
      DECLARE @PeriodLoginHours float = 0;
      SELECT @PeriodLoginHours = ISNULL(SUM(
        CASE WHEN DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
             THEN DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) ELSE 0 END
      ), 0) / 60.0
      FROM dbo.claimhistory ch
      WHERE ch.AssignedTo = @CurrentUserID
        AND ch.ClaimWorkStartedTime IS NOT NULL AND ch.ClaimWorkEndedTime IS NOT NULL
        AND CAST(ch.ClaimWorkEndedTime AS date) BETWEEN @PeriodStart AND @PeriodEnd
        ${custFilterCH.where};

      DECLARE @PriorLoginHours float = 0;
      SELECT @PriorLoginHours = ISNULL(SUM(
        CASE WHEN DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
             THEN DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) ELSE 0 END
      ), 0) / 60.0
      FROM dbo.claimhistory ch
      WHERE ch.AssignedTo = @CurrentUserID
        AND ch.ClaimWorkStartedTime IS NOT NULL AND ch.ClaimWorkEndedTime IS NOT NULL
        AND CAST(ch.ClaimWorkEndedTime AS date) BETWEEN @PriorStart AND @PriorEnd
        ${custFilterCH.where};

      -- Work days in period (days where user completed at least one claim)
      DECLARE @PeriodWorkDays int = 0;
      SELECT @PeriodWorkDays = COUNT(DISTINCT CAST(ch.ClaimWorkEndedTime AS date))
      FROM dbo.claimhistory ch
      WHERE ch.AssignedTo = @CurrentUserID
        AND ch.ClaimWorkEndedTime IS NOT NULL
        AND CAST(ch.ClaimWorkEndedTime AS date) BETWEEN @PeriodStart AND @PeriodEnd
        ${custFilterCH.where};

      -- Claims completed in completed period
      DECLARE @PeriodClaims int = 0;
      SELECT @PeriodClaims = COUNT(DISTINCT ch.ClaimID)
      FROM dbo.claimhistory ch
      WHERE ch.AssignedTo = @CurrentUserID
        AND ch.ClaimWorkEndedTime IS NOT NULL
        AND CAST(ch.ClaimWorkEndedTime AS date) BETWEEN @PeriodStart AND @PeriodEnd
        ${custFilterCH.where};

      -- Claims completed in prior period
      DECLARE @PriorClaims int = 0;
      SELECT @PriorClaims = COUNT(DISTINCT ch.ClaimID)
      FROM dbo.claimhistory ch
      WHERE ch.AssignedTo = @CurrentUserID
        AND ch.ClaimWorkEndedTime IS NOT NULL
        AND CAST(ch.ClaimWorkEndedTime AS date) BETWEEN @PriorStart AND @PriorEnd
        ${custFilterCH.where};

      -- Revenue in completed period
      DECLARE @PeriodRevenue decimal(18,2) = 0;
      SELECT @PeriodRevenue = ISNULL(SUM(rr.TrxAmt), 0)
      FROM dbo.recon_report rr
      WHERE rr.ClaimID IN (
        SELECT DISTINCT ch.ClaimID FROM dbo.claimhistory ch
        WHERE ch.AssignedTo = @CurrentUserID
          AND ch.ClaimWorkEndedTime IS NOT NULL
          AND CAST(ch.ClaimWorkEndedTime AS date) BETWEEN @PeriodStart AND @PeriodEnd
          ${custFilterCH.where}
      ) AND rr.TrxType = 'Payment';

      -- Revenue in prior period
      DECLARE @PriorRevenue decimal(18,2) = 0;
      SELECT @PriorRevenue = ISNULL(SUM(rr.TrxAmt), 0)
      FROM dbo.recon_report rr
      WHERE rr.ClaimID IN (
        SELECT DISTINCT ch.ClaimID FROM dbo.claimhistory ch
        WHERE ch.AssignedTo = @CurrentUserID
          AND ch.ClaimWorkEndedTime IS NOT NULL
          AND CAST(ch.ClaimWorkEndedTime AS date) BETWEEN @PriorStart AND @PriorEnd
          ${custFilterCH.where}
      ) AND rr.TrxType = 'Payment';

      -- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
      -- RESULT
      -- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

      SELECT
        -- My Queue Today (look ahead)
        @QueueSize           AS queueSize,
        @UrgentClaims        AS urgentClaims,
        @QueueValue          AS queueValue,
        @AvgClaimsPerDay     AS dailyQuota,
        @DaysToClear         AS daysToClear,
        @AvgMinPerClaim      AS avgMinutesPerClaim,
        @EstHoursToday       AS estimatedHoursToday,

        -- Last [Period] (look back \u2014 completed period only)
        @PeriodLabel         AS periodLabel,
        CAST(@PeriodStart AS varchar) AS periodStart,
        CAST(@PeriodEnd AS varchar)   AS periodEnd,
        @PeriodLoginHours    AS hoursWorked,
        @PeriodWorkDays      AS workDays,
        CASE WHEN @PeriodWorkDays > 0
             THEN @PeriodLoginHours / @PeriodWorkDays
             ELSE 0 END      AS avgHoursPerDay,
        @PeriodClaims        AS claimsCompleted,
        CASE WHEN @PeriodWorkDays > 0
             THEN CAST(@PeriodClaims AS float) / @PeriodWorkDays
             ELSE 0 END      AS avgClaimsPerDay,
        @PeriodRevenue       AS revenueRecovered,
        CASE WHEN @PeriodLoginHours > 0
             THEN @PeriodRevenue / @PeriodLoginHours
             ELSE 0 END      AS roi,

        -- Prior period (for delta arrows)
        @PriorLoginHours     AS priorHoursWorked,
        @PriorClaims         AS priorClaimsCompleted,
        @PriorRevenue        AS priorRevenueRecovered,

        -- Deltas
        @PeriodLoginHours - @PriorLoginHours AS hoursChange,
        CASE WHEN @PriorClaims > 0
             THEN ((@PeriodClaims - @PriorClaims) * 100.0 / @PriorClaims)
             ELSE NULL END   AS claimsChangePct,
        CASE WHEN @PriorRevenue > 0
             THEN ((@PeriodRevenue - @PriorRevenue) * 100.0 / @PriorRevenue)
             ELSE NULL END   AS revenueChangePct;
      `;

      logger.info('MyPerformanceSummary.get \u2192 executing', { period });

      // Load configurable KPI targets
      const cfgResult = await this.pool.request().query(`
        SELECT [key], value FROM dbo.AppConfig WHERE [key] IN ('kpi_target_roi', 'industry_benchmark_roi')
      `);
      const cfgMap: Record<string, number> = {};
      for (const r of cfgResult.recordset) {
        const n = parseFloat(r.value);
        if (!isNaN(n)) cfgMap[r.key] = n;
      }

      const result = await request.query(query);
      const row = result.recordset?.[0] ?? null;

      return res.status(200).json({
        message: 'My performance summary data',
        data: row ? {
          // My Queue Today - look ahead
          queueToday: {
            claimsInQueue:       Number(row.queueSize ?? 0),
            urgentClaims:        Number(row.urgentClaims ?? 0),
            queueValue:          Number(row.queueValue ?? 0),
            dailyQuota:          Math.round((Number(row.dailyQuota) || 0) * 10) / 10,
            daysToClear:         Math.round((Number(row.daysToClear) || 0) * 10) / 10,
            avgMinutesPerClaim:  Math.round((Number(row.avgMinutesPerClaim) || 0) * 10) / 10,
            estimatedHoursToday: Math.round((Number(row.estimatedHoursToday) || 0) * 10) / 10,
          },
          // Last [Period] - look back at completed period
          lastPeriod: {
            label:               row.periodLabel,
            startDate:           row.periodStart,
            endDate:             row.periodEnd,
            hoursWorked:         Math.round((Number(row.hoursWorked) || 0) * 10) / 10,
            workDays:            Number(row.workDays ?? 0),
            avgHoursPerDay:      Math.round((Number(row.avgHoursPerDay) || 0) * 10) / 10,
            claimsCompleted:     Number(row.claimsCompleted ?? 0),
            avgClaimsPerDay:     Math.round((Number(row.avgClaimsPerDay) || 0) * 10) / 10,
            revenueRecovered:    Number(row.revenueRecovered ?? 0),
            roi:                 Math.round((Number(row.roi) || 0) * 100) / 100,
            // Prior period for comparison
            priorHoursWorked:    Math.round((Number(row.priorHoursWorked) || 0) * 10) / 10,
            priorClaims:         Number(row.priorClaimsCompleted ?? 0),
            priorRevenue:        Number(row.priorRevenueRecovered ?? 0),
            // Deltas
            hoursChange:         row.hoursChange != null ? Math.round(Number(row.hoursChange) * 10) / 10 : null,
            claimsChangePct:     row.claimsChangePct != null ? Math.round(Number(row.claimsChangePct) * 10) / 10 : null,
            revenueChangePct:    row.revenueChangePct != null ? Math.round(Number(row.revenueChangePct) * 10) / 10 : null,
          },
          // Benchmarks
          kpiTarget:             cfgMap['kpi_target_roi'] ?? 1572,
          industryBenchmark:     cfgMap['industry_benchmark_roi'] ?? 1521,
        } : null,
      });
    } catch (error: unknown) {
      logger.error('MyPerformanceSummary.get \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
