import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Specialist Scorecards + Goal Setting
 *
 * Weekly/monthly scorecards with claims completed vs goal, revenue recovered vs goal,
 * first-touch rate vs target. Managers set per-specialist goals.
 */
export class SpecialistScorecardsController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/admin/scorecards - all specialists' scorecards for a period */
  public getScorecards = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const period = (req.query.period as string) || 'weekly';
      const daysBack = period === 'monthly' ? 30 : 7;

      const result = await pool.request()
        .input('daysBack', sql.Int, daysBack)
        .input('period', sql.NVarChar(10), period)
        .query(`
          ;WITH CompletedWork AS (
            SELECT
              ch.ClaimHistoryId,
              ch.AssignedTo,
              ch.ClaimID,
              ch.ClaimWorkStartedTime,
              ch.ClaimWorkEndedTime,
              ch.ClaimBalanceDue,
              DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked,
              DATEDIFF(DAY, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS DaysToResolve
            FROM dbo.claimhistory ch
            WHERE ch.ClaimWorkEndedTime IS NOT NULL
              AND ch.ClaimWorkStartedTime IS NOT NULL
              AND ch.ClaimWorkEndedTime >= DATEADD(DAY, -@daysBack, GETDATE())
              AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) > 0
              AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) < 1440
          ),
          FirstTouch AS (
            SELECT
              ch1.AssignedTo,
              ch1.ClaimID,
              CASE WHEN NOT EXISTS (
                SELECT 1 FROM dbo.claimhistory ch2
                WHERE ch2.ClaimID = ch1.ClaimID
                  AND ch2.ClaimHistoryId != ch1.ClaimHistoryId
                  AND ch2.ClaimWorkEndedTime IS NOT NULL
                  AND ch2.ClaimWorkEndedTime < ch1.ClaimWorkEndedTime
              ) THEN 1 ELSE 0 END AS IsFirstTouch
            FROM CompletedWork ch1
          ),
          PerStaff AS (
            SELECT
              cw.AssignedTo,
              COUNT(DISTINCT cw.ClaimID) AS claimsDone,
              SUM(cw.ClaimBalanceDue) AS revenueRecovered,
              AVG(CAST(cw.MinutesWorked AS FLOAT)) AS avgMinutes,
              AVG(CAST(cw.DaysToResolve AS FLOAT)) AS avgDays
            FROM CompletedWork cw
            GROUP BY cw.AssignedTo
          ),
          FirstTouchRate AS (
            SELECT AssignedTo,
              CAST(SUM(IsFirstTouch) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 AS ftRate
            FROM FirstTouch
            GROUP BY AssignedTo
          ),
          QueueNow AS (
            SELECT AssignedTo, COUNT(DISTINCT ClaimID) AS queueSize
            FROM dbo.claimhistory
            WHERE ClaimWorkEndedTime IS NULL AND ClaimWorkStartedTime IS NOT NULL
            GROUP BY AssignedTo
          )
          SELECT
            u.userID AS staffId,
            u.FirstName + ' ' + u.LastName AS staffName,
            u.Role AS role,
            ps.claimsDone,
            ROUND(ps.revenueRecovered, 2) AS revenueRecovered,
            ROUND(ftr.ftRate, 1) AS firstTouchRate,
            ROUND(ps.avgMinutes, 1) AS avgMinutesPerClaim,
            ROUND(ps.avgDays, 1) AS avgDaysToResolve,
            ISNULL(qn.queueSize, 0) AS currentQueue,
            sg.claims_goal AS claimsGoal,
            sg.revenue_goal AS revenueGoal,
            sg.first_touch_goal AS firstTouchGoal,
            sg.avg_days_goal AS avgDaysGoal
          FROM dbo.Users u
          JOIN PerStaff ps ON ps.AssignedTo = u.userID
          LEFT JOIN FirstTouchRate ftr ON ftr.AssignedTo = u.userID
          LEFT JOIN QueueNow qn ON qn.AssignedTo = u.userID
          LEFT JOIN dbo.SpecialistGoals sg ON sg.staff_id = u.userID AND sg.period = @period
          WHERE ISNULL(u.disabled, 0) = 0 AND ISNULL(u.archived, 0) = 0
          ORDER BY ps.claimsDone DESC
        `);

      return res.status(200).json({ data: result.recordset, period });
    } catch (error: unknown) {
      logger.error('SpecialistScorecards.getScorecards', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/scorecards/goals - list all goals */
  public getGoals = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const period = (req.query.period as string) || 'weekly';

      const result = await pool.request()
        .input('period', sql.NVarChar(10), period)
        .query(`
          SELECT
            sg.id,
            sg.staff_id AS staffId,
            u.FirstName + ' ' + u.LastName AS staffName,
            sg.period,
            sg.claims_goal AS claimsGoal,
            sg.revenue_goal AS revenueGoal,
            sg.first_touch_goal AS firstTouchGoal,
            sg.avg_days_goal AS avgDaysGoal,
            sg.updated_at AS updatedAt
          FROM dbo.SpecialistGoals sg
          JOIN dbo.Users u ON u.userID = sg.staff_id
          WHERE sg.period = @period
          ORDER BY u.FirstName
        `);

      return res.status(200).json({ data: result.recordset });
    } catch (error: unknown) {
      logger.error('SpecialistScorecards.getGoals', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/admin/scorecards/goals - upsert goals for a specialist */
  public setGoals = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { staffId, period, claimsGoal, revenueGoal, firstTouchGoal, avgDaysGoal } = req.body;
      const pool = (this as any).pool as sql.ConnectionPool;

      await pool.request()
        .input('staffId', sql.Int, staffId)
        .input('period', sql.NVarChar(10), period || 'weekly')
        .input('claims', sql.Int, claimsGoal ?? null)
        .input('revenue', sql.Float, revenueGoal ?? null)
        .input('firstTouch', sql.Float, firstTouchGoal ?? null)
        .input('avgDays', sql.Float, avgDaysGoal ?? null)
        .query(`
          MERGE dbo.SpecialistGoals AS target
          USING (SELECT @staffId AS staff_id, @period AS period) AS source
            ON target.staff_id = source.staff_id AND target.period = source.period
          WHEN MATCHED THEN
            UPDATE SET claims_goal = @claims, revenue_goal = @revenue,
                       first_touch_goal = @firstTouch, avg_days_goal = @avgDays,
                       updated_at = GETUTCDATE()
          WHEN NOT MATCHED THEN
            INSERT (staff_id, period, claims_goal, revenue_goal, first_touch_goal, avg_days_goal)
            VALUES (@staffId, @period, @claims, @revenue, @firstTouch, @avgDays);
        `);

      return res.status(200).json({ message: 'Goals saved' });
    } catch (error: unknown) {
      logger.error('SpecialistScorecards.setGoals', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
