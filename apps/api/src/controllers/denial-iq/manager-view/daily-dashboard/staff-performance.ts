import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildTeamFilter, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class StaffPerformance extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      // All work-tracking data (AssignedTo, ClaimWorkStartedTime, ClaimWorkEndedTime)
      // lives in claimhistory, not recon_report. Use claimhistory for work metrics
      // and join with recon_report (via ClaimID) for financial aggregation.
      const chTeam = buildTeamFilter(scope, 'ch.AssignedTo', '_chTeamId');

      const request = this.pool.request();
      chTeam.addInputs(request);

      // Enterprise isolation via claims table (recon_report and claimhistory lack customer_id)
      const custFilterCH = buildCustomerFilter(scope.customerId, 'ch');
      const custFilterRR = buildCustomerFilter(scope.customerId, 'rr');
      custFilterCH.addInputs(request);
      // custFilterRR uses same @_custId param; only add once

      const query = `
DECLARE @LastActivityDate date;

SELECT
    @LastActivityDate = MAX(
        COALESCE(ClaimWorkEndedTime, ClaimWorkStartedTime)
    )
FROM dbo.claimhistory
WHERE AssignedTo IS NOT NULL;

IF @LastActivityDate IS NULL
BEGIN
    SET @LastActivityDate = CAST(GETDATE() AS date);
END;

;WITH DistinctClaimWork AS (
    -- claimhistory is the authoritative source for work sessions (AssignedTo, start/end times)
    SELECT DISTINCT
        ch.ClaimID,
        ch.AssignedTo                                                        AS StaffID,
        ch.ClaimWorkStartedTime,
        ch.ClaimWorkEndedTime,
        CAST(ch.ClaimWorkStartedTime AS date)                                AS WorkDate,
        DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)     AS MinutesWorked
    FROM dbo.claimhistory ch
    WHERE ch.AssignedTo IS NOT NULL
      AND ch.ClaimWorkStartedTime IS NOT NULL
      ${chTeam.sql}
      ${custFilterCH.where}
),

Financial AS (
    -- Join financial rows from recon_report by ClaimID (one RR row per transaction)
    SELECT
        rr.ClaimID,
        rr.TrxType,
        rr.TrxAmt,
        cw.StaffID,
        cw.WorkDate,
        cw.MinutesWorked
    FROM dbo.recon_report rr
    INNER JOIN DistinctClaimWork cw ON rr.ClaimID = cw.ClaimID
    WHERE cw.WorkDate <= @LastActivityDate
      ${custFilterRR.where}
),

PerStaff AS (
    SELECT
        StaffID,
        SUM(CASE WHEN TrxType = 'Charge'     THEN TrxAmt ELSE 0 END) AS Charges,
        SUM(CASE WHEN TrxType = 'Payment'    THEN TrxAmt ELSE 0 END) AS Payments,
        SUM(CASE WHEN TrxType = 'Adjustment' THEN TrxAmt ELSE 0 END) AS Adjustments,
        COUNT(DISTINCT WorkDate)  AS DaysWorked,
        COUNT(DISTINCT ClaimID)   AS ClaimsWorked,
        AVG(MinutesWorked)        AS AvgMinutesWorked
    FROM Financial
    GROUP BY StaffID
),

QueueToday AS (
    -- Open claims whose MOST RECENT assignment is to each specialist.
    -- ROW_NUMBER prevents double-counting re-assigned claims across multiple staff.
    SELECT
        latest.AssignedTo               AS StaffID,
        COUNT(*)                        AS ClaimsInQueueToday
    FROM (
        SELECT ch.ClaimID,
               ch.AssignedTo,
               ROW_NUMBER() OVER (
                   PARTITION BY ch.ClaimID
                   ORDER BY COALESCE(ch.ClaimWorkStartedTime,
                                     CAST(ch.ClaimSubmittedDate AS datetime2)) DESC
               ) AS rn
        FROM dbo.claimhistory ch
        WHERE ch.AssignedTo IS NOT NULL
          AND ch.ClaimWorkEndedTime IS NULL
          ${chTeam.sql}
          ${custFilterCH.where}
    ) latest
    WHERE latest.rn = 1
    GROUP BY latest.AssignedTo
),

-- Resolution quality metrics from claimhistory
ClaimSessions AS (
    SELECT
        ch.AssignedTo AS StaffID,
        ch.ClaimID,
        COUNT(*) AS SessionCount,
        MAX(CASE WHEN ch.ClaimWorkEndedTime IS NOT NULL THEN 1 ELSE 0 END) AS WasResolved,
        MAX(CASE WHEN ch.ClaimStatus = 'Escalated' THEN 1 ELSE 0 END) AS WasEscalated,
        MIN(ch.ClaimSubmittedDate) AS FirstStarted,
        MAX(ch.ClaimWorkEndedTime) AS LastEnded
    FROM dbo.claimhistory ch
    WHERE ch.AssignedTo IS NOT NULL
      AND ch.ClaimWorkEndedTime IS NOT NULL
      ${chTeam.sql}
      ${custFilterCH.where}
    GROUP BY ch.AssignedTo, ch.ClaimID
),

ResolutionStats AS (
    SELECT
        StaffID,
        COUNT(*) AS TotalClaims,
        SUM(WasResolved) AS ResolvedClaims,
        SUM(CASE WHEN WasResolved = 1 AND SessionCount = 1 THEN 1 ELSE 0 END) AS FirstTouchResolved,
        SUM(CASE WHEN SessionCount > 1 THEN 1 ELSE 0 END) AS ReworkClaims,
        SUM(WasEscalated) AS EscalatedClaims,
        AVG(CASE WHEN WasResolved = 1
             THEN CAST(DATEDIFF(DAY, FirstStarted, LastEnded) AS float)
             ELSE NULL END) AS AvgDaysToResolve
    FROM ClaimSessions
    GROUP BY StaffID
)

-- Drive from all staff who either worked claims or have items in queue today.
-- This ensures staff with only open-queue items (no completed sessions) also appear.
SELECT
    s.StaffID,

    COALESCE(
        NULLIF(LTRIM(RTRIM(ISNULL(u.FirstName, '') + ' ' + ISNULL(u.LastName, ''))), ''),
        'Staff ' + CAST(s.StaffID AS varchar(20))
    ) AS StaffName,

    CASE
        WHEN ISNULL(ps.Charges - ps.Adjustments, 0) = 0 THEN NULL
        ELSE CAST(
            100.0 * ps.Payments / NULLIF((ps.Charges - ps.Adjustments), 0)
            AS decimal(18,2)
        )
    END AS NetCollectionPct,

    CASE
        WHEN ISNULL(ps.DaysWorked, 0) = 0 THEN 0
        ELSE CAST(ps.Payments / NULLIF(ps.DaysWorked, 0) AS decimal(18,2))
    END AS RecoveryPerDay,

    CAST(ISNULL(ps.AvgMinutesWorked, 0) AS decimal(10,2)) AS AvgMinutesPerClaim,

    CASE
        WHEN ISNULL(ps.DaysWorked, 0) = 0 THEN 0
        ELSE CAST(1.0 * ps.ClaimsWorked / NULLIF(ps.DaysWorked, 0) AS decimal(18,2))
    END AS ClaimsPerDay,

    ISNULL(qt.ClaimsInQueueToday, 0) AS ClaimsInQueueToday,

    CASE WHEN rs.TotalClaims > 0
         THEN CAST(100.0 * rs.FirstTouchResolved / rs.ResolvedClaims AS decimal(5,1))
         ELSE NULL END AS FirstTouchRate,
    CASE WHEN rs.TotalClaims > 0
         THEN CAST(100.0 * rs.ReworkClaims / rs.TotalClaims AS decimal(5,1))
         ELSE NULL END AS ReworkRate,
    ISNULL(rs.EscalatedClaims, 0) AS EscalationCount,
    CAST(rs.AvgDaysToResolve AS decimal(5,1)) AS AvgDaysToResolve

FROM (
    SELECT StaffID FROM PerStaff
    UNION
    SELECT StaffID FROM QueueToday
) s
LEFT JOIN PerStaff ps     ON ps.StaffID = s.StaffID
LEFT JOIN QueueToday qt   ON qt.StaffID = s.StaffID
LEFT JOIN ResolutionStats rs ON rs.StaffID = s.StaffID
LEFT JOIN dbo.users u     ON u.userID = s.StaffID
ORDER BY ClaimsPerDay DESC, ISNULL(qt.ClaimsInQueueToday, 0) DESC;
      `;

      logger.info('StaffPerformance.get \u2192 executing staff performance query');
      const result = await request.query(query);

      return res.status(200).json({
        message: 'Staff performance data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('StaffPerformance.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
