import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, extractCustomerId, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class AnalystProficiency extends DatabaseConnectionController {
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
        return res.status(200).json({
          message: 'Analyst proficiency data',
          data: [],
        });
      }

      const request = this.pool.request();
      request.input('CurrentUserID', sql.NVarChar(50), String(scope.userId));

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'ch');
      custFilter.addInputs(request);

      const query = `
      ;WITH CompletedClaims AS (
          -- All completed work sessions with a CARC code (denial reason)
          SELECT DISTINCT
              ch.ClaimID,
              ch.AssignedTo,
              ch.CARCCode AS ReasonCode,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.ClaimWorkEndedTime IS NOT NULL
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) > 0
            AND ch.CARCCode IS NOT NULL
            AND ch.CARCCode <> ''
            ${custFilter.where}
      ),

      -- My proficiency grouped by reason code
      MyProficiency AS (
          SELECT
              ReasonCode,
              COUNT(DISTINCT ClaimID)               AS MyClaimCount,
              AVG(CAST(MinutesWorked AS float))      AS MyAvgMinutes
          FROM CompletedClaims
          WHERE AssignedTo = @CurrentUserID
          GROUP BY ReasonCode
      ),

      -- Team proficiency grouped by reason code (all analysts)
      TeamProficiency AS (
          SELECT
              ReasonCode,
              COUNT(DISTINCT ClaimID)               AS TeamClaimCount,
              AVG(CAST(MinutesWorked AS float))      AS TeamAvgMinutes,
              COUNT(DISTINCT AssignedTo)             AS AnalystCount
          FROM CompletedClaims
          GROUP BY ReasonCode
      )

      SELECT
          mp.ReasonCode                                              AS CARCCode,
          carc.description                                           AS CARCDescription,
          mp.MyClaimCount,
          CAST(mp.MyAvgMinutes AS decimal(10,1))                     AS MyAvgMinutes,
          tp.TeamClaimCount,
          CAST(tp.TeamAvgMinutes AS decimal(10,1))                   AS TeamAvgMinutes,
          tp.AnalystCount,
          CAST(mp.MyAvgMinutes - tp.TeamAvgMinutes AS decimal(10,1)) AS DiffFromTeamMinutes,
          CASE
              WHEN tp.TeamAvgMinutes > 0
              THEN CAST(((mp.MyAvgMinutes - tp.TeamAvgMinutes) / tp.TeamAvgMinutes * 100) AS decimal(5,1))
              ELSE NULL
          END AS DiffFromTeamPct
      FROM MyProficiency mp
      JOIN TeamProficiency tp ON mp.ReasonCode = tp.ReasonCode
      LEFT JOIN dbo.Carcs carc
        ON carc.code = mp.ReasonCode
        OR carc.code = REPLACE(mp.ReasonCode, 'CO', '')
      WHERE mp.MyClaimCount >= 3
      ORDER BY DiffFromTeamMinutes DESC;
      `;

      logger.info('AnalystProficiency.get \u2192 executing proficiency query');
      const result = await request.query(query);

      return res.status(200).json({
        message: 'Analyst proficiency data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('AnalystProficiency.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
