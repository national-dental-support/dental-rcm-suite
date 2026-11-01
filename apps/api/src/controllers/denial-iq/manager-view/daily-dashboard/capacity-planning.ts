import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildTeamFilter, buildCustomerFilter, buildClaimsCustomerWhere } from '../../../../utils/resolve-user-scope';

/**
 * Capacity Planning Dashboard
 *
 * Backlog overview, team velocity, staffing metrics, and forecasts.
 */
export class CapacityPlanningController extends DatabaseConnectionController {
  constructor() { super(); }

  public get = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = this.pool;
      const actorEmail = (_req.headers['x-actor-email'] as string) ?? '';
      const oid = (_req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (_req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(pool, actorEmail, xenCustId, oid);

      const chTeam = buildTeamFilter(scope, 'ch.AssignedTo', '_chTeamId');

      // Enterprise isolation - always filter, even for Super Admins (they are grounded in one enterprise)
      const custId = scope.customerId;
      const custFilterCH = buildCustomerFilter(custId, 'ch');
      const custFilterC = buildClaimsCustomerWhere(custId, 'c');

      // Helper: create a new request with team + customer inputs already bound
      const teamRequest = () => {
        const r = pool.request();
        chTeam.addInputs(r);
        custFilterCH.addInputs(r);
        return r;
      };

      // -- 1. Backlog overview --
      // Open claims = claims whose latest claimhistory row is NOT 'Accepted'/'Completed'
      // (i.e., still needs work: Denied, Submitted, Rejected, Pending, in-progress)
      const backlogResult = await teamRequest().query(`
        ;WITH LatestStatus AS (
          SELECT
            ch.ClaimID,
            ch.ClaimStatus,
            ch.AssignedTo,
            ch.ClaimWorkEndedTime,
            ROW_NUMBER() OVER (PARTITION BY ch.ClaimID ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC) AS rn
          FROM dbo.claimhistory ch
        ),
        OpenClaims AS (
          SELECT
            c.ClaimID,
            DATEDIFF(DAY, c.ClaimSubmittedDate, CAST(GETDATE() AS DATE)) AS AgingDays,
            c.ChargeAmt,
            ls.AssignedTo,
            ls.ClaimStatus,
            ls.ClaimWorkEndedTime
          FROM dbo.claims c
          JOIN LatestStatus ls ON ls.ClaimID = c.ClaimID AND ls.rn = 1
          WHERE ls.ClaimStatus NOT IN ('Accepted', 'Completed')
            ${chTeam.sql}
            ${custFilterC.where}
        )
        SELECT
          COUNT(*) AS totalOpen,
          SUM(ChargeAmt) AS totalValue,
          AVG(CAST(AgingDays AS FLOAT)) AS avgAging,
          SUM(CASE WHEN AgingDays <= 30 THEN 1 ELSE 0 END) AS current30,
          SUM(CASE WHEN AgingDays > 30 AND AgingDays <= 60 THEN 1 ELSE 0 END) AS urgent60,
          SUM(CASE WHEN AgingDays > 60 AND AgingDays <= 90 THEN 1 ELSE 0 END) AS critical90,
          SUM(CASE WHEN AgingDays > 90 THEN 1 ELSE 0 END) AS severe90plus
        FROM OpenClaims
      `);

      // Unassigned = claims whose latest status is DENIED/Rejected/Pending AND no specialist assigned
      const unassignedReq = pool.request();
      custFilterC.addInputs(unassignedReq);
      const unassignedResult = await unassignedReq.query(`
        ;WITH LatestStatus AS (
          SELECT ch.ClaimID, ch.ClaimStatus, ch.AssignedTo,
            ROW_NUMBER() OVER (PARTITION BY ch.ClaimID ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC) AS rn
          FROM dbo.claimhistory ch
        )
        SELECT COUNT(*) AS cnt
        FROM dbo.claims c
        JOIN LatestStatus ls ON ls.ClaimID = c.ClaimID AND ls.rn = 1
        WHERE ls.ClaimStatus IN ('DENIED', 'Rejected', 'Pending')
          AND (ls.AssignedTo IS NULL)
        ${custFilterC.where}
      `);

      const bl = backlogResult.recordset[0] ?? {};
      const unassigned = unassignedResult.recordset[0]?.cnt ?? 0;

      // -- 2. Team velocity (last 30 days) --
      const velocityResult = await teamRequest().query(`
        ;WITH CompletedWork AS (
          SELECT
            ch.ClaimID,
            ch.AssignedTo,
            ch.ClaimWorkStartedTime,
            ch.ClaimWorkEndedTime,
            DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked,
            CAST(ch.ClaimWorkEndedTime AS DATE) AS WorkDate
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkEndedTime IS NOT NULL
            AND ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkEndedTime >= DATEADD(DAY, -30, GETDATE())
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) > 0
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) < 1440
            ${chTeam.sql}
            ${custFilterCH.where}
        )
        SELECT
          COUNT(DISTINCT ClaimID) AS claimsCompleted30d,
          COUNT(DISTINCT AssignedTo) AS activeStaff,
          COUNT(DISTINCT WorkDate) AS workDays,
          AVG(CAST(MinutesWorked AS FLOAT)) AS avgMinutes
        FROM CompletedWork
      `);

      const vel = velocityResult.recordset[0] ?? {};
      const workDays = Math.max(vel.workDays || 1, 1);
      const activeStaff = vel.activeStaff || 1;
      const teamClaimsPerDay = Math.round((vel.claimsCompleted30d || 0) / workDays * 10) / 10;
      const avgPerSpecialist = Math.round(teamClaimsPerDay / activeStaff * 10) / 10;
      const avgMinutes = Math.round((vel.avgMinutes || 0) * 10) / 10;

      // Average days to resolve = from claim submission to final resolution (completed work)
      // Uses ClaimSubmittedDate -> ClaimWorkEndedTime but only for claims resolved in the last 90 days
      // to avoid skewing from very old claims
      const resolveResult = await teamRequest().query(`
        SELECT AVG(CAST(DATEDIFF(DAY, ch.ClaimSubmittedDate, ch.ClaimWorkEndedTime) AS FLOAT)) AS avgDays
        FROM dbo.claimhistory ch
        WHERE ch.ClaimWorkEndedTime IS NOT NULL
          AND ch.ClaimSubmittedDate IS NOT NULL
          AND ch.ClaimStatus IN ('Accepted', 'Completed')
          AND ch.ClaimWorkEndedTime >= DATEADD(DAY, -90, GETDATE())
          AND DATEDIFF(DAY, ch.ClaimSubmittedDate, ch.ClaimWorkEndedTime) > 0
          ${chTeam.sql}
          ${custFilterCH.where}
      `);
      const avgDaysToResolve = Math.round((resolveResult.recordset[0]?.avgDays ?? 0) * 10) / 10;

      // -- 3. Per-staff metrics --
      // For managers, filter to only their team members via a user ID filter
      const staffTeamFilter = (scope.isManager && scope.teamMemberIds.length > 0)
        ? `AND u.userID IN (${scope.teamMemberIds.map((_, i) => `@_staffTeamId${i}`).join(', ')})`
        : '';

      const staffReq = pool.request();
      if (scope.isManager && scope.teamMemberIds.length > 0) {
        scope.teamMemberIds.forEach((id, i) => {
          staffReq.input(`_staffTeamId${i}`, sql.Int, id);
        });
      }
      custFilterCH.addInputs(staffReq);

      const staffCustFilter = custId != null ? 'AND u.customer_id = @_custId' : '';

      const staffResult = await staffReq.query(`
        ;WITH StaffQueue AS (
          SELECT
            ch.AssignedTo,
            COUNT(DISTINCT ch.ClaimID) AS queueSize
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkEndedTime IS NULL
            AND ch.ClaimWorkStartedTime IS NOT NULL
            ${custFilterCH.where}
          GROUP BY ch.AssignedTo
        ),
        StaffVelocity AS (
          SELECT
            ch.AssignedTo,
            COUNT(DISTINCT ch.ClaimID) AS completed30d,
            COUNT(DISTINCT CAST(ch.ClaimWorkEndedTime AS DATE)) AS daysWorked
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkEndedTime IS NOT NULL
            AND ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkEndedTime >= DATEADD(DAY, -30, GETDATE())
            ${custFilterCH.where}
          GROUP BY ch.AssignedTo
        )
        SELECT
          u.userID AS staffId,
          u.FirstName + ' ' + u.LastName AS name,
          u.Role AS role,
          ISNULL(sq.queueSize, 0) AS queueSize,
          ISNULL(sv.completed30d, 0) AS completed30d,
          ISNULL(sv.daysWorked, 1) AS daysWorked,
          CASE WHEN ISNULL(sv.daysWorked, 1) > 0
            THEN ROUND(CAST(ISNULL(sv.completed30d, 0) AS FLOAT) / ISNULL(sv.daysWorked, 1), 1)
            ELSE 0
          END AS claimsPerDay
        FROM dbo.Users u
        LEFT JOIN StaffQueue sq ON sq.AssignedTo = u.userID
        LEFT JOIN StaffVelocity sv ON sv.AssignedTo = u.userID
        WHERE (sq.queueSize > 0 OR sv.completed30d > 0)
          ${staffTeamFilter}
          ${staffCustFilter}
        ORDER BY ISNULL(sq.queueSize, 0) DESC
      `);

      // -- 4. Forecasts --
      const totalOpen = bl.totalOpen ?? 0;
      const daysToCloseBacklog = teamClaimsPerDay > 0
        ? Math.ceil(totalOpen / teamClaimsPerDay)
        : 0;

      // Target: clear backlog in 30 days
      const targetDays = 30;
      const neededPerDay = targetDays > 0 ? Math.ceil(totalOpen / targetDays) : /* istanbul ignore next */ 0;
      const staffNeeded = avgPerSpecialist > 0 ? Math.ceil(neededPerDay / avgPerSpecialist) : 0;
      const currentCapacity = teamClaimsPerDay;
      const overtimePct = currentCapacity > 0 && neededPerDay > currentCapacity
        ? Math.round((neededPerDay / currentCapacity - 1) * 100)
        : 0;
      const additionalHires = Math.max(staffNeeded - activeStaff, 0);

      // -- 5. Weekly trend (last 8 weeks) --
      const trendResult = await teamRequest().query(`
        SELECT
          DATEPART(YEAR, ch.ClaimWorkEndedTime) AS yr,
          DATEPART(ISO_WEEK, ch.ClaimWorkEndedTime) AS wk,
          COUNT(DISTINCT ch.ClaimID) AS completed,
          COUNT(DISTINCT ch.AssignedTo) AS staffWorking
        FROM dbo.claimhistory ch
        WHERE ch.ClaimWorkEndedTime IS NOT NULL
          AND ch.ClaimWorkStartedTime IS NOT NULL
          AND ch.ClaimWorkEndedTime >= DATEADD(WEEK, -8, GETDATE())
          ${chTeam.sql}
          ${custFilterCH.where}
        GROUP BY DATEPART(YEAR, ch.ClaimWorkEndedTime), DATEPART(ISO_WEEK, ch.ClaimWorkEndedTime)
        ORDER BY yr, wk
      `);

      return res.status(200).json({
        backlog: {
          totalOpen,
          unassigned,
          totalValue: Math.round((bl.totalValue ?? 0) * 100) / 100,
          avgAgingDays: Math.round((bl.avgAging ?? 0) * 10) / 10,
          agingBuckets: {
            current: bl.current30 ?? 0,
            urgent: bl.urgent60 ?? 0,
            critical: bl.critical90 ?? 0,
            severe: bl.severe90plus ?? 0,
          },
        },
        velocity: {
          teamClaimsPerDay,
          avgPerSpecialist,
          avgMinutesPerClaim: avgMinutes,
          avgDaysToResolve,
          claimsCompleted30d: vel.claimsCompleted30d ?? 0,
        },
        staffing: {
          activeSpecialists: activeStaff,
          staff: staffResult.recordset,
        },
        forecast: {
          daysToCloseBacklog,
          targetDays,
          staffNeededForTarget: staffNeeded,
          overtimeNeededPct: overtimePct,
          additionalHiresNeeded: additionalHires,
          neededClaimsPerDay: neededPerDay,
        },
        weeklyTrend: trendResult.recordset,
      });
    } catch (error: unknown) {
      logger.error(`CapacityPlanning.get: ${(error as any)?.message ?? String(error)}`);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
