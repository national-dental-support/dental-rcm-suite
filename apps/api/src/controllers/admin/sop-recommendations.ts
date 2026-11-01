import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Smart SOP Recommendations
 *
 * Analyzes historical claim resolution data correlated with SOP step completion
 * to recommend the most effective remediation steps for each denial reason code.
 *
 * Generates recommendations based on:
 *   - Step completion rates (low completion = confusing/unclear step)
 *   - Feedback volume (high feedback = step needs revision)
 *   - Resolution outcomes (which SOPs lead to faster resolution / higher recovery)
 *   - Escalation correlation (which reason codes escalate most)
 */
export class SOPRecommendationsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/admin/remediation/recommendations
   * Returns auto-generated SOP improvement recommendations
   */
  public getRecommendations = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const recommendations: any[] = [];

      // 1. Step completion rates - identify steps being skipped
      const completionResult = await pool.request().query(`
        SELECT
          ss.id AS setId,
          ss.reason_code AS reasonCode,
          ss.target_role AS targetRole,
          s.id AS stepId,
          s.title AS stepTitle,
          s.sort_order AS sortOrder,
          s.is_required AS isRequired,
          (SELECT COUNT(DISTINCT csc.claim_id)
           FROM dbo.ClaimStepCompletion csc WHERE csc.step_id = s.id) AS completedCount,
          -- Total claims that loaded this SOP (approximation via claimhistory with matching CARCCode)
          ISNULL((SELECT COUNT(DISTINCT ch.ClaimID)
           FROM dbo.claimhistory ch
           WHERE ch.CARCCode = ss.reason_code
             AND ch.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())), 1) AS totalClaimsWithCode
        FROM dbo.RemediationStepSet ss
        JOIN dbo.RemediationStep s ON s.set_id = ss.id
        WHERE ss.status = 'active'
        ORDER BY ss.reason_code, s.sort_order
      `);

      for (const row of completionResult.recordset) {
        const completionRate = row.totalClaimsWithCode > 0
          ? (row.completedCount / row.totalClaimsWithCode) * 100
          : 0;

        if (completionRate < 40 && row.isRequired) {
          recommendations.push({
            type: 'low_completion',
            severity: completionRate < 20 ? 'high' : 'medium',
            reasonCode: row.reasonCode,
            setId: row.setId,
            stepId: row.stepId,
            title: `Low completion rate on required step "${row.stepTitle}"`,
            detail: `Only ${completionRate.toFixed(0)}% of claims with reason code ${row.reasonCode} complete this required step. Consider simplifying the instructions or adding a checklist.`,
            metric: Number(completionRate.toFixed(1)),
            metricLabel: 'completion rate',
          });
        }
      }

      // 2. Feedback volume - steps getting most complaints
      const feedbackResult = await pool.request().query(`
        SELECT
          f.set_id AS setId,
          f.step_id AS stepId,
          ss.reason_code AS reasonCode,
          ISNULL(s.title, 'General') AS stepTitle,
          COUNT(*) AS feedbackCount,
          COUNT(CASE WHEN f.status = 'pending' THEN 1 END) AS pendingCount
        FROM dbo.RemediationFeedback f
        JOIN dbo.RemediationStepSet ss ON ss.id = f.set_id
        LEFT JOIN dbo.RemediationStep s ON s.id = f.step_id
        WHERE f.created_at >= DATEADD(MONTH, -3, GETDATE())
        GROUP BY f.set_id, f.step_id, ss.reason_code, s.title
        HAVING COUNT(*) >= 2
        ORDER BY feedbackCount DESC
      `);

      for (const row of feedbackResult.recordset) {
        recommendations.push({
          type: 'high_feedback',
          severity: row.feedbackCount >= 5 ? 'high' : 'medium',
          reasonCode: row.reasonCode,
          setId: row.setId,
          stepId: row.stepId,
          title: `Multiple workers flagged "${row.stepTitle}" for improvement`,
          detail: `${row.feedbackCount} feedback submissions in the last 90 days (${row.pendingCount} pending review). Workers may find this step confusing or ineffective.`,
          metric: row.feedbackCount,
          metricLabel: 'feedback count',
        });
      }

      // 3. Escalation rates by reason code - SOPs not preventing escalations
      const escalationResult = await pool.request().query(`
        ;WITH ReasonStats AS (
          SELECT
            ch.CARCCode AS reasonCode,
            COUNT(DISTINCT ch.ClaimID) AS totalClaims,
            COUNT(DISTINCT CASE WHEN ch.ClaimStatus = 'Escalated' THEN ch.ClaimID END) AS escalatedClaims
          FROM dbo.claimhistory ch
          WHERE ch.CARCCode IS NOT NULL AND ch.CARCCode != ''
            AND ch.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())
          GROUP BY ch.CARCCode
          HAVING COUNT(DISTINCT ch.ClaimID) >= 3
        )
        SELECT
          rs.reasonCode,
          rs.totalClaims,
          rs.escalatedClaims,
          CAST(rs.escalatedClaims * 100.0 / rs.totalClaims AS DECIMAL(5,1)) AS escalationRate,
          ss.id AS setId,
          ss.status AS setStatus
        FROM ReasonStats rs
        LEFT JOIN dbo.RemediationStepSet ss
          ON ss.reason_code = rs.reasonCode AND ss.status = 'active'
        WHERE rs.escalatedClaims * 1.0 / rs.totalClaims > 0.25
        ORDER BY escalationRate DESC
      `);

      for (const row of escalationResult.recordset) {
        recommendations.push({
          type: 'escalation_spike',
          severity: row.escalationRate >= 50 ? 'high' : 'medium',
          reasonCode: row.reasonCode,
          setId: row.setId,
          stepId: null,
          title: `High escalation rate for ${row.reasonCode} (${row.escalationRate}%)`,
          detail: `${row.escalatedClaims} of ${row.totalClaims} claims with reason code ${row.reasonCode} were escalated in the last 90 days. ${row.setId ? 'Current SOP may be insufficient.' : 'No active SOP exists \u2014 create one.'}`,
          metric: Number(row.escalationRate),
          metricLabel: 'escalation rate',
        });
      }

      // 4. Resolution time analysis - which reason codes take longest
      const resolutionResult = await pool.request().query(`
        SELECT TOP 10
          ch.CARCCode AS reasonCode,
          COUNT(DISTINCT ch.ClaimID) AS claimCount,
          AVG(DATEDIFF(DAY, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)) AS avgDaysToResolve,
          MAX(DATEDIFF(DAY, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)) AS maxDaysToResolve,
          ss.id AS setId
        FROM dbo.claimhistory ch
        LEFT JOIN dbo.RemediationStepSet ss
          ON ss.reason_code = ch.CARCCode AND ss.status = 'active'
        WHERE ch.CARCCode IS NOT NULL AND ch.CARCCode != ''
          AND ch.ClaimWorkStartedTime IS NOT NULL
          AND ch.ClaimWorkEndedTime IS NOT NULL
          AND ch.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())
        GROUP BY ch.CARCCode, ss.id
        HAVING COUNT(DISTINCT ch.ClaimID) >= 3
          AND AVG(DATEDIFF(DAY, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime)) > 7
        ORDER BY avgDaysToResolve DESC
      `);

      for (const row of resolutionResult.recordset) {
        recommendations.push({
          type: 'slow_resolution',
          severity: row.avgDaysToResolve >= 14 ? 'high' : 'medium',
          reasonCode: row.reasonCode,
          setId: row.setId,
          stepId: null,
          title: `Slow resolution for ${row.reasonCode}: avg ${row.avgDaysToResolve} days`,
          detail: `${row.claimCount} claims averaged ${row.avgDaysToResolve} days to resolve (max: ${row.maxDaysToResolve} days). ${row.setId ? 'Review SOP for optimization opportunities.' : 'No SOP exists \u2014 adding one may speed resolution.'}`,
          metric: row.avgDaysToResolve,
          metricLabel: 'avg days to resolve',
        });
      }

      // 5. Missing SOPs - reason codes with claims but no active SOP
      const missingResult = await pool.request().query(`
        SELECT TOP 10
          ch.CARCCode AS reasonCode,
          ISNULL(cc.Description, ch.CARCCode) AS reasonDescription,
          COUNT(DISTINCT ch.ClaimID) AS claimCount
        FROM dbo.claimhistory ch
        LEFT JOIN dbo.carccodes cc ON cc.CARCCode = ch.CARCCode
        WHERE ch.CARCCode IS NOT NULL AND ch.CARCCode != ''
          AND ch.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())
          AND NOT EXISTS (
            SELECT 1 FROM dbo.RemediationStepSet ss
            WHERE ss.reason_code = ch.CARCCode AND ss.status = 'active'
          )
          AND ch.CARCCode != 'DEFAULT'
        GROUP BY ch.CARCCode, cc.Description
        HAVING COUNT(DISTINCT ch.ClaimID) >= 3
        ORDER BY claimCount DESC
      `);

      for (const row of missingResult.recordset) {
        recommendations.push({
          type: 'missing_sop',
          severity: row.claimCount >= 10 ? 'high' : 'medium',
          reasonCode: row.reasonCode,
          setId: null,
          stepId: null,
          title: `No SOP for ${row.reasonCode}: ${row.reasonDescription}`,
          detail: `${row.claimCount} claims in the last 90 days use reason code ${row.reasonCode} but no dedicated SOP exists. Workers fall back to the DEFAULT SOP.`,
          metric: row.claimCount,
          metricLabel: 'claims using default SOP',
        });
      }

      // Sort: high severity first, then by metric descending
      recommendations.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
        return b.metric - a.metric;
      });

      return res.status(200).json({ data: recommendations });
    } catch (error: unknown) {
      logger.error('SOPRecommendations.getRecommendations', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/admin/remediation/effectiveness
   * Per-reason-code SOP effectiveness metrics
   */
  public getEffectiveness = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;

      const result = await pool.request().query(`
        SELECT
          ss.reason_code AS reasonCode,
          ss.target_role AS targetRole,
          ss.id AS setId,
          ss.version,
          (SELECT COUNT(*) FROM dbo.RemediationStep s WHERE s.set_id = ss.id) AS stepCount,
          -- Step completions
          ISNULL((SELECT COUNT(DISTINCT csc.claim_id)
           FROM dbo.ClaimStepCompletion csc
           JOIN dbo.RemediationStep s2 ON s2.id = csc.step_id
           WHERE s2.set_id = ss.id), 0) AS claimsWithCompletions,
          -- Avg steps completed per claim
          ISNULL((SELECT AVG(cnt * 1.0) FROM (
            SELECT csc.claim_id, COUNT(*) AS cnt
            FROM dbo.ClaimStepCompletion csc
            JOIN dbo.RemediationStep s3 ON s3.id = csc.step_id
            WHERE s3.set_id = ss.id
            GROUP BY csc.claim_id
          ) AS sub), 0) AS avgStepsCompleted,
          -- Feedback count
          (SELECT COUNT(*) FROM dbo.RemediationFeedback f WHERE f.set_id = ss.id) AS feedbackCount,
          -- Claims using this code (via claimhistory)
          ISNULL((SELECT COUNT(DISTINCT ch.ClaimID)
           FROM dbo.claimhistory ch
           WHERE ch.CARCCode = ss.reason_code
             AND ch.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())), 0) AS recentClaimCount,
          -- Avg resolution time for this reason code
          ISNULL((SELECT AVG(DATEDIFF(DAY, ch2.ClaimWorkStartedTime, ch2.ClaimWorkEndedTime))
           FROM dbo.claimhistory ch2
           WHERE ch2.CARCCode = ss.reason_code
             AND ch2.ClaimWorkStartedTime IS NOT NULL AND ch2.ClaimWorkEndedTime IS NOT NULL
             AND ch2.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())), 0) AS avgDaysToResolve,
          -- Escalation rate
          ISNULL((SELECT COUNT(DISTINCT CASE WHEN ch3.ClaimStatus = 'Escalated' THEN ch3.ClaimID END) * 100.0 /
                  NULLIF(COUNT(DISTINCT ch3.ClaimID), 0)
           FROM dbo.claimhistory ch3
           WHERE ch3.CARCCode = ss.reason_code
             AND ch3.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())), 0) AS escalationRate
        FROM dbo.RemediationStepSet ss
        WHERE ss.status = 'active'
        ORDER BY ss.reason_code
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('SOPRecommendations.getEffectiveness', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/denial-iq/claim-detail/smart-steps?claimId=&role=
   * For a specific claim, recommend the best steps based on historical outcomes
   * Returns the standard SOP steps enriched with effectiveness data
   */
  public getSmartSteps = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.query.claimId as string;
      const role = (req.query.role as string) || 'ar-specialist';
      const pool = (this as any).pool as sql.ConnectionPool;

      // Get claim's reason code
      const claimResult = await pool.request()
        .input('claimId', sql.NVarChar(50), claimId)
        .query(`
          SELECT TOP 1 CARCCode
          FROM dbo.claimhistory
          WHERE ClaimID = @claimId AND CARCCode IS NOT NULL AND CARCCode != ''
          ORDER BY ClaimModifiedDate DESC
        `);

      const reasonCode = claimResult.recordset[0]?.CARCCode ?? 'DEFAULT';

      // Get active SOP for this reason code (with fallback to DEFAULT)
      const sopResult = await pool.request()
        .input('reasonCode', sql.NVarChar(20), reasonCode)
        .input('role', sql.NVarChar(50), role)
        .query(`
          SELECT TOP 1 ss.id, ss.reason_code, ss.version
          FROM dbo.RemediationStepSet ss
          WHERE ss.status = 'active'
            AND ss.target_role = @role
            AND (ss.reason_code = @reasonCode OR ss.reason_code = 'DEFAULT')
          ORDER BY CASE WHEN ss.reason_code = @reasonCode THEN 0 ELSE 1 END
        `);

      if (!sopResult.recordset.length) {
        return res.status(200).json({ data: null, message: 'No SOP found' });
      }

      const setId = sopResult.recordset[0].id;

      // Get steps with historical effectiveness
      const stepsResult = await pool.request()
        .input('setId', sql.Int, setId)
        .input('reasonCode2', sql.NVarChar(20), reasonCode)
        .query(`
          SELECT
            s.id, s.title, s.body, s.sort_order AS sortOrder, s.is_required AS isRequired,
            -- How often this step is completed
            (SELECT COUNT(DISTINCT csc.claim_id) FROM dbo.ClaimStepCompletion csc WHERE csc.step_id = s.id) AS completionCount,
            -- Total claims in last 3 months
            ISNULL((SELECT COUNT(DISTINCT ch.ClaimID) FROM dbo.claimhistory ch
              WHERE ch.CARCCode = @reasonCode2 AND ch.ClaimWorkStartedTime >= DATEADD(MONTH, -3, GETDATE())), 1) AS totalClaims,
            -- Avg resolution time when this step IS completed
            ISNULL((SELECT AVG(DATEDIFF(DAY, ch2.ClaimWorkStartedTime, ch2.ClaimWorkEndedTime))
              FROM dbo.claimhistory ch2
              JOIN dbo.ClaimStepCompletion csc2 ON csc2.claim_id = ch2.ClaimID AND csc2.step_id = s.id
              WHERE ch2.ClaimWorkStartedTime IS NOT NULL AND ch2.ClaimWorkEndedTime IS NOT NULL), 0) AS avgDaysWhenCompleted,
            -- Feedback count
            (SELECT COUNT(*) FROM dbo.RemediationFeedback f WHERE f.step_id = s.id AND f.created_at >= DATEADD(MONTH, -3, GETDATE())) AS recentFeedback
          FROM dbo.RemediationStep s
          WHERE s.set_id = @setId
          ORDER BY s.sort_order
        `);

      const steps = stepsResult.recordset.map((s: any) => ({
        id: s.id,
        title: s.title,
        body: s.body,
        sortOrder: s.sortOrder,
        isRequired: s.isRequired,
        completionRate: s.totalClaims > 0 ? Number(((s.completionCount / s.totalClaims) * 100).toFixed(0)) : 0,
        avgDaysWhenCompleted: s.avgDaysWhenCompleted,
        recentFeedback: s.recentFeedback,
        effectiveness: s.completionCount > 0 && s.avgDaysWhenCompleted <= 7 ? 'high' :
          s.completionCount > 0 ? 'medium' : 'unknown',
      }));

      return res.status(200).json({
        data: {
          setId,
          reasonCode: sopResult.recordset[0].reason_code,
          version: sopResult.recordset[0].version,
          steps,
        },
      });
    } catch (error: unknown) {
      logger.error('SOPRecommendations.getSmartSteps', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
