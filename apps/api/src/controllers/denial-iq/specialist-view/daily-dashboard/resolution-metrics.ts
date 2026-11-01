import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, extractCustomerId, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

function periodDays(period: string): number {
  switch (period) {
    case '1w': return 7;
    case '1m': return 30;
    case '3m': return 90;
    case '1y': return 365;
    default:   return 90;
  }
}

export class ResolutionMetrics extends DatabaseConnectionController {
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
        return res.status(200).json({ message: 'Resolution metrics', data: null });
      }

      const period = (req.query.period as string) ?? '3m';
      const days = periodDays(period);

      const request = this.pool.request();
      request.input('CurrentUserID', sql.NVarChar(50), String(scope.userId));
      request.input('PeriodDays', sql.Int, days);

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'ch');
      custFilter.addInputs(request);

      const query = `
      -- Anchor cutoff to the latest claimhistory date so demo data is always visible
      ;WITH DateAnchor AS (
          SELECT ISNULL(
              MAX(ClaimWorkStartedTime),
              GETDATE()
          ) AS MaxDate
          FROM dbo.claimhistory
          WHERE AssignedTo IS NOT NULL
            AND ClaimWorkStartedTime IS NOT NULL
      ),

      -- All work sessions for the current user
      -- IsResolved uses ClaimStatus OR ClaimWorkEndedTime so demo data with nulled
      -- ClaimWorkEndedTime (migration 016 side-effect) still counts as resolved.
      MyWorkSessions AS (
          SELECT
              ch.ClaimID,
              ch.ClaimWorkStartedTime,
              ch.ClaimSubmittedDate,
              COALESCE(ch.ClaimWorkEndedTime, CAST(ch.ClaimModifiedDate AS datetime2)) AS EffectiveEndTime,
              CASE WHEN ch.ClaimStatus IN ('Completed') OR ch.ClaimWorkEndedTime IS NOT NULL THEN 1 ELSE 0 END AS IsResolved
          FROM dbo.claimhistory ch
          CROSS JOIN DateAnchor da
          WHERE ch.AssignedTo = @CurrentUserID
            AND ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@PeriodDays, da.MaxDate)
            ${custFilter.where}
      ),

      -- Per-claim aggregates for current user
      -- LifetimeSessions: total sessions ever for this claim+user (not just the period window)
      -- so rework rate is non-zero even when the original session predates the period cutoff
      MyClaimAgg AS (
          SELECT
              ws.ClaimID,
              (SELECT COUNT(*) FROM dbo.claimhistory lh
               WHERE lh.ClaimID = ws.ClaimID AND lh.AssignedTo = @CurrentUserID
                 AND lh.ClaimWorkStartedTime IS NOT NULL)  AS LifetimeSessions,
              MAX(ws.IsResolved)                           AS WasResolved,
              MIN(ws.ClaimSubmittedDate)                   AS SubmittedDate,
              MAX(ws.EffectiveEndTime)                     AS LastEnded
          FROM MyWorkSessions ws
          GROUP BY ws.ClaimID
      ),

      -- My metrics
      MyMetrics AS (
          SELECT
              COUNT(*)                                                                         AS TotalClaims,
              SUM(WasResolved)                                                                 AS ResolvedClaims,
              SUM(CASE WHEN WasResolved = 1 AND LifetimeSessions = 1 THEN 1 ELSE 0 END)      AS FirstTouchResolved,
              SUM(CASE WHEN LifetimeSessions > 1 THEN 1 ELSE 0 END)                           AS ReworkClaims,
              -- Avg days from claim submission to final resolution
              AVG(CASE WHEN WasResolved = 1 AND SubmittedDate IS NOT NULL AND LastEnded IS NOT NULL
                   THEN CAST(DATEDIFF(DAY, SubmittedDate, LastEnded) AS float)
                   ELSE NULL END)                                                         AS AvgDaysToResolve
          FROM MyClaimAgg
      ),

      -- All work sessions for all users (team metrics) \u2014 same period
      TeamWorkSessions AS (
          SELECT
              ch.ClaimID,
              ch.AssignedTo,
              ch.ClaimWorkStartedTime,
              ch.ClaimSubmittedDate,
              COALESCE(ch.ClaimWorkEndedTime, CAST(ch.ClaimModifiedDate AS datetime2)) AS EffectiveEndTime,
              CASE WHEN ch.ClaimStatus IN ('Completed') OR ch.ClaimWorkEndedTime IS NOT NULL THEN 1 ELSE 0 END AS IsResolved
          FROM dbo.claimhistory ch
          CROSS JOIN DateAnchor da
          WHERE ch.AssignedTo IS NOT NULL
            AND ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -@PeriodDays, da.MaxDate)
            ${custFilter.where}
      ),

      TeamClaimAgg AS (
          SELECT
              ws.ClaimID,
              ws.AssignedTo,
              (SELECT COUNT(*) FROM dbo.claimhistory lh
               WHERE lh.ClaimID = ws.ClaimID AND lh.AssignedTo = ws.AssignedTo
                 AND lh.ClaimWorkStartedTime IS NOT NULL)  AS LifetimeSessions,
              MAX(ws.IsResolved)                           AS WasResolved,
              MIN(ws.ClaimSubmittedDate)                   AS SubmittedDate,
              MAX(ws.EffectiveEndTime)                     AS LastEnded
          FROM TeamWorkSessions ws
          GROUP BY ws.ClaimID, ws.AssignedTo
      ),

      TeamMetrics AS (
          SELECT
              COUNT(*)                                                                         AS TotalClaims,
              SUM(WasResolved)                                                                 AS ResolvedClaims,
              SUM(CASE WHEN WasResolved = 1 AND LifetimeSessions = 1 THEN 1 ELSE 0 END)      AS FirstTouchResolved,
              SUM(CASE WHEN LifetimeSessions > 1 THEN 1 ELSE 0 END)                           AS ReworkClaims,
              AVG(CASE WHEN WasResolved = 1 AND SubmittedDate IS NOT NULL AND LastEnded IS NOT NULL
                   THEN CAST(DATEDIFF(DAY, SubmittedDate, LastEnded) AS float)
                   ELSE NULL END)                                                         AS AvgDaysToResolve
          FROM TeamClaimAgg
      )

      SELECT
          -- My metrics (fall back to team average when user has no personal sessions)
          CASE WHEN mm.TotalClaims > 0
               THEN CAST(100.0 * mm.ResolvedClaims / mm.TotalClaims AS decimal(5,1))
               WHEN tm.TotalClaims > 0
               THEN CAST(100.0 * tm.ResolvedClaims / tm.TotalClaims AS decimal(5,1))
               ELSE NULL END AS ResolutionRate,
          CASE WHEN mm.ResolvedClaims > 0
               THEN CAST(100.0 * mm.FirstTouchResolved / mm.ResolvedClaims AS decimal(5,1))
               WHEN tm.ResolvedClaims > 0
               THEN CAST(100.0 * tm.FirstTouchResolved / tm.ResolvedClaims AS decimal(5,1))
               ELSE NULL END AS FirstTouchRate,
          COALESCE(CAST(mm.AvgDaysToResolve AS decimal(5,1)), CAST(tm.AvgDaysToResolve AS decimal(5,1))) AS AvgDaysToResolve,
          CASE WHEN mm.TotalClaims > 0
               THEN CAST(100.0 * mm.ReworkClaims / mm.TotalClaims AS decimal(5,1))
               WHEN tm.TotalClaims > 0
               THEN CAST(100.0 * tm.ReworkClaims / tm.TotalClaims AS decimal(5,1))
               ELSE NULL END AS ReworkRate,

          -- Team metrics
          CASE WHEN tm.TotalClaims > 0
               THEN CAST(100.0 * tm.ResolvedClaims / tm.TotalClaims AS decimal(5,1))
               ELSE NULL END AS TeamResolutionRate,
          CASE WHEN tm.ResolvedClaims > 0
               THEN CAST(100.0 * tm.FirstTouchResolved / tm.ResolvedClaims AS decimal(5,1))
               ELSE NULL END AS TeamFirstTouchRate,
          CAST(tm.AvgDaysToResolve AS decimal(5,1)) AS TeamAvgDaysToResolve,
          CASE WHEN tm.TotalClaims > 0
               THEN CAST(100.0 * tm.ReworkClaims / tm.TotalClaims AS decimal(5,1))
               ELSE NULL END AS TeamReworkRate,

          -- Flag so frontend knows if personal data was available
          CAST(CASE WHEN mm.TotalClaims > 0 THEN 1 ELSE 0 END AS BIT) AS HasPersonalData

      FROM MyMetrics mm
      CROSS JOIN TeamMetrics tm;
      `;

      logger.info('ResolutionMetrics.get \u2192 executing', { period, days });
      const result = await request.query(query);
      const row = result.recordset?.[0] ?? null;

      return res.status(200).json({
        message: 'Resolution metrics',
        data: row ? {
          resolutionRate: row.ResolutionRate != null ? Number(row.ResolutionRate) : null,
          firstTouchRate: row.FirstTouchRate != null ? Number(row.FirstTouchRate) : null,
          avgDaysToResolve: row.AvgDaysToResolve != null ? Number(row.AvgDaysToResolve) : null,
          reworkRate: row.ReworkRate != null ? Number(row.ReworkRate) : null,
          teamResolutionRate: row.TeamResolutionRate != null ? Number(row.TeamResolutionRate) : null,
          teamFirstTouchRate: row.TeamFirstTouchRate != null ? Number(row.TeamFirstTouchRate) : null,
          teamAvgDaysToResolve: row.TeamAvgDaysToResolve != null ? Number(row.TeamAvgDaysToResolve) : null,
          teamReworkRate: row.TeamReworkRate != null ? Number(row.TeamReworkRate) : null,
          hasPersonalData: row.HasPersonalData === true,
        } : null,
      });
    } catch (error: unknown) {
      logger.error('ResolutionMetrics.get \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
