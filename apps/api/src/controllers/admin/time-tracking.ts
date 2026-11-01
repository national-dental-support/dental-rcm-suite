import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Time Tracking + Utilization Analytics
 *
 * Aggregates work session data (startWork/closeClaim timestamps) into:
 * - Per-specialist utilization rates
 * - Time sinks by denial code
 * - Time by payer
 * - Individual vs team benchmarks
 */
export class TimeTrackingController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/admin/time-tracking/summary - high-level KPIs */
  getSummary = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
          WITH WorkSessions AS (
            SELECT
              ch.AssignedTo,
              ch.ClaimID,
              ch.ClaimWorkStartedTime,
              ch.ClaimWorkEndedTime,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked,
              CAST(ch.ClaimWorkStartedTime AS DATE) AS WorkDate
            FROM dbo.claimhistory ch
            WHERE ch.ClaimWorkStartedTime IS NOT NULL
              AND ch.ClaimWorkEndedTime IS NOT NULL
              AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@Days, GETDATE())
              AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
          ),
          DailyUtil AS (
            SELECT
              AssignedTo,
              WorkDate,
              SUM(MinutesWorked) AS DayMinutes
            FROM WorkSessions
            GROUP BY AssignedTo, WorkDate
          ),
          StaffStats AS (
            SELECT
              AssignedTo,
              COUNT(DISTINCT WorkDate) AS DaysActive,
              SUM(DayMinutes) AS TotalMinutes,
              AVG(CAST(DayMinutes AS FLOAT)) AS AvgDailyMinutes
            FROM DailyUtil
            GROUP BY AssignedTo
          )
          SELECT
            COUNT(DISTINCT ws.AssignedTo) AS activeSpecialists,
            COUNT(DISTINCT ws.ClaimID)    AS totalClaimsWorked,
            SUM(ws.MinutesWorked)         AS totalMinutesWorked,
            AVG(CAST(ws.MinutesWorked AS FLOAT)) AS avgMinutesPerClaim,
            (SELECT AVG(AvgDailyMinutes) FROM StaffStats) AS avgDailyMinutesPerSpecialist,
            (SELECT AVG(CAST(AvgDailyMinutes AS FLOAT) / 480.0 * 100) FROM StaffStats) AS avgUtilizationPct
          FROM WorkSessions ws
        `);

      const row = result.recordset[0] || {};
      res.json({
        activeSpecialists: row.activeSpecialists || 0,
        totalClaimsWorked: row.totalClaimsWorked || 0,
        totalHoursWorked: Math.round((row.totalMinutesWorked || 0) / 60),
        avgMinutesPerClaim: Math.round((row.avgMinutesPerClaim || 0) * 10) / 10,
        avgDailyHoursPerSpecialist: Math.round((row.avgDailyMinutesPerSpecialist || 0) / 60 * 10) / 10,
        avgUtilizationPct: Math.round((row.avgUtilizationPct || 0) * 10) / 10,
        periodDays: days,
      });
    } catch (err: any) {
      logger.error('time-tracking summary error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/time-tracking/utilization - per-specialist daily utilization */
  getUtilization = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const days = parseInt(req.query.days as string) || 14;

      const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
          WITH WorkSessions AS (
            SELECT
              ch.AssignedTo,
              CAST(ch.ClaimWorkStartedTime AS DATE) AS WorkDate,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked
            FROM dbo.claimhistory ch
            WHERE ch.ClaimWorkStartedTime IS NOT NULL
              AND ch.ClaimWorkEndedTime IS NOT NULL
              AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@Days, GETDATE())
              AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
          ),
          DailyUtil AS (
            SELECT
              AssignedTo,
              WorkDate,
              SUM(MinutesWorked) AS DayMinutes,
              COUNT(*) AS SessionCount
            FROM WorkSessions
            GROUP BY AssignedTo, WorkDate
          )
          SELECT
            du.AssignedTo AS staffId,
            u.FirstName + ' ' + u.LastName AS staffName,
            COUNT(DISTINCT du.WorkDate) AS daysActive,
            AVG(CAST(du.DayMinutes AS FLOAT)) AS avgDailyMinutes,
            MIN(du.DayMinutes) AS minDailyMinutes,
            MAX(du.DayMinutes) AS maxDailyMinutes,
            SUM(du.DayMinutes) AS totalMinutes,
            AVG(CAST(du.SessionCount AS FLOAT)) AS avgSessionsPerDay,
            CAST(AVG(CAST(du.DayMinutes AS FLOAT)) / 480.0 * 100 AS DECIMAL(5,1)) AS utilizationPct
          FROM DailyUtil du
          JOIN dbo.Users u ON u.userID = du.AssignedTo
          GROUP BY du.AssignedTo, u.FirstName, u.LastName
          ORDER BY utilizationPct DESC
        `);

      res.json(result.recordset);
    } catch (err: any) {
      logger.error('time-tracking utilization error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/time-tracking/time-sinks - slowest denial codes */
  getTimeSinks = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const days = parseInt(req.query.days as string) || 30;
      const limit = parseInt(req.query.limit as string) || 15;

      const result = await pool.request()
        .input('Days', sql.Int, days)
        .input('Limit', sql.Int, limit)
        .query(`
          WITH CodeMetrics AS (
            SELECT
              ch.CarcCode,
              COUNT(DISTINCT ch.ClaimID) AS claimCount,
              AVG(CAST(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS FLOAT)) AS avgMinutes,
              MIN(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)) AS minMinutes,
              MAX(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)) AS maxMinutes,
              SUM(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)) AS totalMinutes
            FROM dbo.claimhistory ch
            WHERE ch.CarcCode IS NOT NULL AND ch.CarcCode <> ''
              AND ch.ClaimWorkStartedTime IS NOT NULL
              AND ch.ClaimWorkEndedTime IS NOT NULL
              AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@Days, GETDATE())
              AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
            GROUP BY ch.CarcCode
            HAVING COUNT(DISTINCT ch.ClaimID) >= 3
          ),
          TeamAvg AS (
            SELECT AVG(avgMinutes) AS overallAvg FROM CodeMetrics
          )
          SELECT TOP (@Limit)
            cm.CarcCode AS carcCode,
            cm.claimCount,
            ROUND(cm.avgMinutes, 1) AS avgMinutes,
            cm.minMinutes,
            cm.maxMinutes,
            cm.totalMinutes,
            ROUND(ta.overallAvg, 1) AS teamAvgMinutes,
            ROUND(cm.avgMinutes - ta.overallAvg, 1) AS diffFromAvg,
            CASE WHEN ta.overallAvg > 0
              THEN ROUND((cm.avgMinutes / ta.overallAvg - 1) * 100, 0)
              ELSE 0
            END AS diffPct
          FROM CodeMetrics cm
          CROSS JOIN TeamAvg ta
          ORDER BY cm.avgMinutes DESC
        `);

      res.json(result.recordset);
    } catch (err: any) {
      logger.error('time-tracking time-sinks error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/time-tracking/by-payer - time per claim grouped by payer */
  getByPayer = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
          WITH PayerWork AS (
            SELECT
              c.PayerID,
              ch.ClaimID,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked
            FROM dbo.claimhistory ch
            JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
            WHERE ch.ClaimWorkStartedTime IS NOT NULL
              AND ch.ClaimWorkEndedTime IS NOT NULL
              AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@Days, GETDATE())
              AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
          ),
          PayerAgg AS (
            SELECT
              PayerID,
              COUNT(DISTINCT ClaimID) AS claimCount,
              AVG(CAST(MinutesWorked AS FLOAT)) AS avgMinutes,
              SUM(MinutesWorked) AS totalMinutes
            FROM PayerWork
            GROUP BY PayerID
            HAVING COUNT(DISTINCT ClaimID) >= 2
          ),
          TeamAvg AS (
            SELECT AVG(avgMinutes) AS overallAvg FROM PayerAgg
          )
          SELECT
            pa.PayerID AS payerId,
            ISNULL(p.PayerName, 'Payer ' + CAST(pa.PayerID AS NVARCHAR)) AS payerName,
            pa.claimCount,
            ROUND(pa.avgMinutes, 1) AS avgMinutes,
            pa.totalMinutes,
            ROUND(CAST(pa.totalMinutes AS FLOAT) / 60, 1) AS totalHours,
            ROUND(ta.overallAvg, 1) AS teamAvgMinutes,
            ROUND(pa.avgMinutes - ta.overallAvg, 1) AS diffFromAvg
          FROM PayerAgg pa
          CROSS JOIN TeamAvg ta
          LEFT JOIN dbo.Payers p ON p.PayerID = pa.PayerID
          ORDER BY pa.avgMinutes DESC
        `);

      res.json(result.recordset);
    } catch (err: any) {
      logger.error('time-tracking by-payer error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/time-tracking/benchmarks - per-specialist vs team comparison */
  getBenchmarks = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
          WITH CompletedWork AS (
            SELECT
              ch.AssignedTo,
              ch.ClaimID,
              ch.CarcCode,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked,
              CAST(ch.ClaimWorkStartedTime AS DATE) AS WorkDate
            FROM dbo.claimhistory ch
            WHERE ch.ClaimWorkStartedTime IS NOT NULL
              AND ch.ClaimWorkEndedTime IS NOT NULL
              AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@Days, GETDATE())
              AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
          ),
          TeamStats AS (
            SELECT
              AVG(CAST(MinutesWorked AS FLOAT)) AS teamAvgMinPerClaim,
              COUNT(DISTINCT ClaimID) AS teamTotalClaims,
              COUNT(DISTINCT AssignedTo) AS teamSize
            FROM CompletedWork
          ),
          StaffAgg AS (
            SELECT
              cw.AssignedTo AS staffId,
              u.FirstName + ' ' + u.LastName AS staffName,
              COUNT(DISTINCT cw.ClaimID) AS claimsWorked,
              COUNT(DISTINCT cw.WorkDate) AS daysActive,
              SUM(cw.MinutesWorked) AS totalMinutes,
              AVG(CAST(cw.MinutesWorked AS FLOAT)) AS avgMinPerClaim,
              CAST(COUNT(DISTINCT cw.ClaimID) AS FLOAT) /
                NULLIF(COUNT(DISTINCT cw.WorkDate), 0) AS claimsPerDay
            FROM CompletedWork cw
            JOIN dbo.Users u ON u.userID = cw.AssignedTo
            GROUP BY cw.AssignedTo, u.FirstName, u.LastName
          )
          SELECT
            sa.staffId,
            sa.staffName,
            sa.claimsWorked,
            sa.daysActive,
            ROUND(CAST(sa.totalMinutes AS FLOAT) / 60, 1) AS totalHours,
            ROUND(sa.avgMinPerClaim, 1) AS avgMinPerClaim,
            ROUND(ts.teamAvgMinPerClaim, 1) AS teamAvgMinPerClaim,
            ROUND(sa.avgMinPerClaim - ts.teamAvgMinPerClaim, 1) AS diffFromTeam,
            CASE WHEN ts.teamAvgMinPerClaim > 0
              THEN ROUND((sa.avgMinPerClaim / ts.teamAvgMinPerClaim - 1) * 100, 0)
              ELSE 0
            END AS diffPct,
            ROUND(sa.claimsPerDay, 1) AS claimsPerDay,
            ROUND(CAST(sa.totalMinutes AS FLOAT) / NULLIF(sa.daysActive, 0) / 480.0 * 100, 1) AS utilizationPct,
            PERCENT_RANK() OVER (ORDER BY sa.avgMinPerClaim ASC) AS speedPercentile
          FROM StaffAgg sa
          CROSS JOIN TeamStats ts
          ORDER BY sa.avgMinPerClaim ASC
        `);

      res.json(result.recordset.map((r: any) => ({
        ...r,
        speedPercentile: Math.round((r.speedPercentile || 0) * 100),
      })));
    } catch (err: any) {
      logger.error('time-tracking benchmarks error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/time-tracking/trend - daily time trend over period */
  getTrend = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
          SELECT
            CAST(ch.ClaimWorkStartedTime AS DATE) AS workDate,
            COUNT(DISTINCT ch.AssignedTo) AS activeStaff,
            COUNT(DISTINCT ch.ClaimID) AS claimsWorked,
            SUM(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)) AS totalMinutes,
            AVG(CAST(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS FLOAT)) AS avgMinPerClaim
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkEndedTime IS NOT NULL
            AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@Days, GETDATE())
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 480
          GROUP BY CAST(ch.ClaimWorkStartedTime AS DATE)
          ORDER BY workDate
        `);

      res.json(result.recordset.map((r: any) => ({
        date: r.workDate,
        activeStaff: r.activeStaff,
        claimsWorked: r.claimsWorked,
        totalHours: Math.round((r.totalMinutes || 0) / 60 * 10) / 10,
        avgMinPerClaim: Math.round((r.avgMinPerClaim || 0) * 10) / 10,
      })));
    } catch (err: any) {
      logger.error('time-tracking trend error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
