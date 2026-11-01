import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, extractCustomerId, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class PerformanceTrends extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId = extractCustomerId(req);
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      if (scope.userId == null) {
        return res.status(200).json({ message: 'Performance trends', data: [] });
      }

      const weeks = Math.min(Number(req.query.weeks) || 12, 52);

      const request = this.pool.request();
      request.input('CurrentUserID', sql.NVarChar(50), String(scope.userId));
      request.input('Weeks', sql.Int, weeks);

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'ch');
      custFilter.addInputs(request);

      const query = `
      DECLARE @LastActivity date;
      SELECT @LastActivity = MAX(COALESCE(ClaimWorkEndedTime, ClaimWorkStartedTime))
      FROM dbo.claimhistory
      WHERE AssignedTo = @CurrentUserID
        AND ClaimWorkStartedTime IS NOT NULL;

      IF @LastActivity IS NULL SET @LastActivity = CAST(GETDATE() AS date);

      DECLARE @CurrentWeekStart date = DATEADD(DAY, 1 - ((DATEPART(WEEKDAY, @LastActivity) + @@DATEFIRST - 2) % 7 + 1), @LastActivity);

      -- Generate week buckets going backward
      ;WITH WeekBuckets AS (
          SELECT 0 AS WeekOffset, @CurrentWeekStart AS WeekStart, DATEADD(DAY, 6, @CurrentWeekStart) AS WeekEnd
          UNION ALL
          SELECT WeekOffset + 1, DATEADD(DAY, -7, WeekStart), DATEADD(DAY, -1, WeekStart)
          FROM WeekBuckets WHERE WeekOffset < @Weeks - 1
      ),

      CompletedWork AS (
          SELECT DISTINCT
              ch.ClaimID,
              ch.AssignedTo,
              CAST(ch.ClaimWorkEndedTime AS date) AS CompletedDate,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkEndedTime IS NOT NULL
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) > 0
            ${custFilter.where}
      ),

      ClaimRevenue AS (
          SELECT
              cw.ClaimID,
              cw.AssignedTo,
              cw.CompletedDate,
              MAX(cw.MinutesWorked) AS MinutesWorked,
              ISNULL(SUM(CASE WHEN rr.TrxType = 'Payment' THEN rr.TrxAmt ELSE 0 END), 0) AS Revenue
          FROM CompletedWork cw
          LEFT JOIN dbo.recon_report rr ON cw.ClaimID = rr.ClaimID
          GROUP BY cw.ClaimID, cw.AssignedTo, cw.CompletedDate
      ),

      -- My metrics per week
      MyWeekly AS (
          SELECT
              wb.WeekStart,
              wb.WeekEnd,
              ISNULL(SUM(CASE WHEN cr.AssignedTo = @CurrentUserID THEN cr.MinutesWorked ELSE 0 END), 0) / 60.0 AS HoursWorked,
              COUNT(DISTINCT CASE WHEN cr.AssignedTo = @CurrentUserID THEN cr.ClaimID END) AS ClaimsDone,
              ISNULL(SUM(CASE WHEN cr.AssignedTo = @CurrentUserID THEN cr.Revenue ELSE 0 END), 0) AS Revenue
          FROM WeekBuckets wb
          LEFT JOIN ClaimRevenue cr ON cr.CompletedDate BETWEEN wb.WeekStart AND wb.WeekEnd
          GROUP BY wb.WeekStart, wb.WeekEnd
      ),

      -- Team metrics per week (all analysts)
      TeamWeekly AS (
          SELECT
              wb.WeekStart,
              wb.WeekEnd,
              COUNT(DISTINCT cr.AssignedTo) AS AnalystCount,
              ISNULL(SUM(cr.MinutesWorked), 0) / 60.0 AS TotalHours,
              COUNT(DISTINCT cr.ClaimID) AS TotalClaims,
              ISNULL(SUM(cr.Revenue), 0) AS TotalRevenue
          FROM WeekBuckets wb
          LEFT JOIN ClaimRevenue cr ON cr.CompletedDate BETWEEN wb.WeekStart AND wb.WeekEnd
          GROUP BY wb.WeekStart, wb.WeekEnd
      )

      SELECT
          mw.WeekStart,
          mw.WeekEnd,
          FORMAT(mw.WeekStart, 'MMM d') AS WeekLabel,
          CAST(mw.HoursWorked AS decimal(10,1)) AS HoursWorked,
          mw.ClaimsDone,
          CAST(mw.Revenue AS decimal(18,2)) AS Revenue,
          CASE WHEN mw.HoursWorked > 0 THEN CAST(mw.Revenue / mw.HoursWorked AS decimal(18,2)) ELSE 0 END AS ROI,
          CASE WHEN tw.AnalystCount > 0 THEN CAST(tw.TotalHours / tw.AnalystCount AS decimal(10,1)) ELSE 0 END AS TeamAvgHours,
          CASE WHEN tw.AnalystCount > 0 THEN CAST(1.0 * tw.TotalClaims / tw.AnalystCount AS decimal(10,1)) ELSE 0 END AS TeamAvgClaims,
          CASE WHEN tw.AnalystCount > 0 THEN CAST(tw.TotalRevenue / tw.AnalystCount AS decimal(18,2)) ELSE 0 END AS TeamAvgRevenue,
          CASE WHEN tw.AnalystCount > 0 AND tw.TotalHours > 0
               THEN CAST((tw.TotalRevenue / tw.AnalystCount) / (tw.TotalHours / tw.AnalystCount) AS decimal(18,2))
               ELSE 0 END AS TeamAvgROI
      FROM MyWeekly mw
      JOIN TeamWeekly tw ON mw.WeekStart = tw.WeekStart
      ORDER BY mw.WeekStart ASC;
      `;

      logger.info('PerformanceTrends.get \u2192 executing trends query');
      const result = await request.query(query);

      const data = (result.recordset || []).map((r: any) => ({
        weekStart: r.WeekStart,
        weekEnd: r.WeekEnd,
        weekLabel: r.WeekLabel,
        hoursWorked: Number(r.HoursWorked ?? 0),
        claimsDone: Number(r.ClaimsDone ?? 0),
        revenue: Number(r.Revenue ?? 0),
        roi: Number(r.ROI ?? 0),
        teamAvgHours: Number(r.TeamAvgHours ?? 0),
        teamAvgClaims: Number(r.TeamAvgClaims ?? 0),
        teamAvgRevenue: Number(r.TeamAvgRevenue ?? 0),
        teamAvgRoi: Number(r.TeamAvgROI ?? 0),
      }));

      return res.status(200).json({ message: 'Performance trends', data });
    } catch (error: unknown) {
      logger.error('PerformanceTrends.get \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
