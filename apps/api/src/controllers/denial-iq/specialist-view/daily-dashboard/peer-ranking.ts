import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, extractCustomerId, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class PeerRanking extends DatabaseConnectionController {
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
        return res.status(200).json({ message: 'Peer ranking', data: null });
      }

      const request = this.pool.request();
      request.input('CurrentUserID', sql.NVarChar(50), String(scope.userId));

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'ch');
      custFilter.addInputs(request);

      const query = `
      DECLARE @LastActivity date;
      SELECT @LastActivity = MAX(COALESCE(ch.ClaimWorkEndedTime, ch.ClaimWorkStartedTime))
      FROM dbo.claimhistory ch
      WHERE ch.ClaimWorkStartedTime IS NOT NULL
        ${custFilter.where};

      IF @LastActivity IS NULL SET @LastActivity = CAST(GETDATE() AS date);

      DECLARE @WeekStart date = DATEADD(DAY, 1 - ((DATEPART(WEEKDAY, @LastActivity) + @@DATEFIRST - 2) % 7 + 1), @LastActivity);
      DECLARE @WeekEnd date = DATEADD(DAY, 6, @WeekStart);

      ;WITH CompletedWork AS (
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

      -- Per-analyst metrics for the current week
      AnalystWeekly AS (
          SELECT
              AssignedTo,
              SUM(MinutesWorked) / 60.0 AS HoursWorked,
              COUNT(DISTINCT ClaimID) AS ClaimsDone,
              SUM(Revenue) AS TotalRevenue,
              CASE WHEN SUM(MinutesWorked) > 0
                   THEN SUM(Revenue) / (SUM(MinutesWorked) / 60.0)
                   ELSE 0 END AS ROI,
              CASE WHEN COUNT(DISTINCT ClaimID) > 0
                   THEN SUM(MinutesWorked) * 1.0 / COUNT(DISTINCT ClaimID)
                   ELSE NULL END AS AvgMinPerClaim
          FROM ClaimRevenue
          WHERE CompletedDate BETWEEN @WeekStart AND @WeekEnd
          GROUP BY AssignedTo
      ),

      -- Rank each analyst
      Ranked AS (
          SELECT
              AssignedTo,
              ClaimsDone,
              TotalRevenue,
              ROI,
              AvgMinPerClaim,
              PERCENT_RANK() OVER (ORDER BY ClaimsDone ASC) AS ClaimsPercentile,
              PERCENT_RANK() OVER (ORDER BY TotalRevenue ASC) AS RevenuePercentile,
              PERCENT_RANK() OVER (ORDER BY ROI ASC) AS RoiPercentile,
              PERCENT_RANK() OVER (ORDER BY AvgMinPerClaim DESC) AS SpeedPercentile
          FROM AnalystWeekly
      )

      SELECT
          CAST(r.ClaimsPercentile * 100 AS decimal(5,1)) AS ClaimsPercentile,
          CAST(r.RevenuePercentile * 100 AS decimal(5,1)) AS RevenuePercentile,
          CAST(r.RoiPercentile * 100 AS decimal(5,1)) AS RoiPercentile,
          CAST(r.SpeedPercentile * 100 AS decimal(5,1)) AS SpeedPercentile,
          (SELECT COUNT(DISTINCT AssignedTo) FROM AnalystWeekly) AS TotalSpecialists
      FROM Ranked r
      WHERE r.AssignedTo = @CurrentUserID;
      `;

      logger.info('PeerRanking.get \u2192 executing peer ranking query');
      const result = await request.query(query);
      const row = result.recordset?.[0] ?? null;

      return res.status(200).json({
        message: 'Peer ranking',
        data: row ? {
          claimsPercentile: Number(row.ClaimsPercentile ?? 0),
          revenuePercentile: Number(row.RevenuePercentile ?? 0),
          roiPercentile: Number(row.RoiPercentile ?? 0),
          speedPercentile: Number(row.SpeedPercentile ?? 0),
          totalSpecialists: Number(row.TotalSpecialists ?? 0),
        } : null,
      });
    } catch (error: unknown) {
      logger.error('PeerRanking.get \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
