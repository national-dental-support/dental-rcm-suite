import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildTeamFilter, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class TrainingMatrix extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      const chTeam = buildTeamFilter(scope, 'ch.AssignedTo', '_chTeamId');

      const request = this.pool.request();
      chTeam.addInputs(request);

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'ch');
      custFilter.addInputs(request);

      // CARCCode and work sessions may be on separate claimhistory rows.
      // ClaimCodes CTE: get the CARC code for each claim (from any row).
      // WorkSessions CTE: get completed work sessions (from any row).
      // CompletedClaims: join them by ClaimID.
      const query = `
      ;WITH ClaimCodes AS (
          SELECT DISTINCT
              ch.ClaimID,
              ch.CARCCode AS ReasonCode
          FROM dbo.claimhistory ch
          WHERE ch.CARCCode IS NOT NULL
            AND ch.CARCCode <> ''
            ${custFilter.where}
      ),

      WorkSessions AS (
          SELECT DISTINCT
              ch.ClaimID,
              ch.AssignedTo,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkEndedTime IS NOT NULL
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) > 0
            AND ch.AssignedTo IS NOT NULL
            ${chTeam.sql}
            ${custFilter.where}
      ),

      CompletedClaims AS (
          SELECT
              ws.ClaimID,
              ws.AssignedTo,
              cc.ReasonCode,
              ws.MinutesWorked
          FROM WorkSessions ws
          INNER JOIN ClaimCodes cc ON cc.ClaimID = ws.ClaimID
      ),

      -- Top denial codes by volume (limit to top 10)
      TopCodes AS (
          SELECT TOP 10 ReasonCode, COUNT(DISTINCT ClaimID) AS TotalClaims
          FROM CompletedClaims
          GROUP BY ReasonCode
          ORDER BY TotalClaims DESC
      ),

      -- Team average per denial code
      TeamAvg AS (
          SELECT
              cc.ReasonCode,
              AVG(CAST(cc.MinutesWorked AS float)) AS TeamAvgMinutes,
              COUNT(DISTINCT cc.ClaimID) AS TeamClaimCount
          FROM CompletedClaims cc
          INNER JOIN TopCodes tc ON cc.ReasonCode = tc.ReasonCode
          GROUP BY cc.ReasonCode
      ),

      -- Per-staff per-denial-code metrics
      StaffMetrics AS (
          SELECT
              cc.AssignedTo,
              cc.ReasonCode,
              COUNT(DISTINCT cc.ClaimID) AS ClaimCount,
              AVG(CAST(cc.MinutesWorked AS float)) AS AvgMinutes
          FROM CompletedClaims cc
          INNER JOIN TopCodes tc ON cc.ReasonCode = tc.ReasonCode
          GROUP BY cc.AssignedTo, cc.ReasonCode
          HAVING COUNT(DISTINCT cc.ClaimID) >= 1
      )

      SELECT
          sm.AssignedTo AS StaffId,
          COALESCE(
              NULLIF(LTRIM(RTRIM(ISNULL(u.FirstName, '') + ' ' + ISNULL(u.LastName, ''))), ''),
              'Staff ' + CAST(sm.AssignedTo AS varchar(20))
          ) AS StaffName,
          sm.ReasonCode,
          sm.ClaimCount,
          CAST(sm.AvgMinutes AS decimal(10,1)) AS StaffAvgMinutes,
          CAST(ta.TeamAvgMinutes AS decimal(10,1)) AS TeamAvgMinutes,
          CAST(sm.AvgMinutes - ta.TeamAvgMinutes AS decimal(10,1)) AS DiffMinutes,
          CASE
              WHEN sm.AvgMinutes - ta.TeamAvgMinutes < -2 THEN 'strong'
              WHEN sm.AvgMinutes - ta.TeamAvgMinutes <= 2 THEN 'average'
              WHEN sm.AvgMinutes - ta.TeamAvgMinutes <= 5 THEN 'below-average'
              ELSE 'needs-training'
          END AS Rating
      FROM StaffMetrics sm
      INNER JOIN TeamAvg ta ON sm.ReasonCode = ta.ReasonCode
      LEFT JOIN dbo.users u ON sm.AssignedTo = u.userID
      ORDER BY sm.AssignedTo, sm.ReasonCode;
      `;

      logger.info('TrainingMatrix.get \u2192 executing training matrix query');
      const result = await request.query(query);

      // Transform flat rows into matrix structure
      const rows = result.recordset || [];
      const staffMap = new Map<number, any>();
      const allCodes = new Set<string>();

      for (const r of rows) {
        allCodes.add(r.ReasonCode);
        if (!staffMap.has(r.StaffId)) {
          staffMap.set(r.StaffId, {
            staffId: r.StaffId,
            staffName: r.StaffName,
            codes: {},
          });
        }
        staffMap.get(r.StaffId).codes[r.ReasonCode] = {
          claimCount: r.ClaimCount,
          staffAvgMinutes: Number(r.StaffAvgMinutes),
          teamAvgMinutes: Number(r.TeamAvgMinutes),
          diffMinutes: Number(r.DiffMinutes),
          rating: r.Rating,
        };
      }

      return res.status(200).json({
        message: 'Training matrix',
        data: {
          denialCodes: Array.from(allCodes).sort(),
          staff: Array.from(staffMap.values()),
        },
      });
    } catch (error: unknown) {
      logger.error('TrainingMatrix.get \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
