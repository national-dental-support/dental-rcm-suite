import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { recalculatePriorities } from '../../schedulers/priority-scheduler';
import { extractCustomerId } from '../../utils/resolve-user-scope';

/**
 * Admin Priority Settings Controller
 *
 * Manage priority recalculation weights, enable/disable, and trigger manual runs.
 */
export class PrioritySettingsController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/admin/priority/settings - current config + last recalc stats */
  public getSettings = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;

      const configResult = await pool.request().query(`
        SELECT [key], value FROM dbo.AppConfig
        WHERE [key] IN ('priority_weights', 'priority_recalc_enabled')
      `);

      let weights = { aging: 40, value: 25, deadline: 20, workload: 15, proficiency: 0 };
      let enabled = true;
      for (const row of configResult.recordset) {
        if (row.key === 'priority_weights') {
          try { weights = JSON.parse(row.value); } catch { /* defaults */ }
        }
        if (row.key === 'priority_recalc_enabled') {
          enabled = row.value === '1' || row.value === 'true';
        }
      }

      // Last recalculation stats
      const xenCustId = extractCustomerId(_req);
      const custFilter = xenCustId != null ? 'WHERE cp.customer_id = @_custId' : '';
      const statsReq = pool.request();
      if (xenCustId != null) statsReq.input('_custId', sql.Int, xenCustId);
      const statsResult = await statsReq.query(`
        SELECT
          COUNT(*) AS totalScored,
          MAX(cp.recalculated_at) AS lastRunAt,
          AVG(cp.priority_score) AS avgScore,
          MAX(cp.priority_score) AS maxScore,
          MIN(cp.priority_score) AS minScore
        FROM dbo.ClaimPriority cp
        ${custFilter}
      `);

      const stats = statsResult.recordset[0] ?? {};

      // Distribution
      const distReq = pool.request();
      if (xenCustId != null) distReq.input('_custId', sql.Int, xenCustId);
      const distResult = await distReq.query(`
        SELECT
          SUM(CASE WHEN cp.priority_score >= 70 THEN 1 ELSE 0 END) AS high,
          SUM(CASE WHEN cp.priority_score >= 40 AND cp.priority_score < 70 THEN 1 ELSE 0 END) AS medium,
          SUM(CASE WHEN cp.priority_score < 40 THEN 1 ELSE 0 END) AS low
        FROM dbo.ClaimPriority cp
        ${custFilter}
      `);

      const dist = distResult.recordset[0] ?? { high: 0, medium: 0, low: 0 };

      return res.status(200).json({
        weights,
        enabled,
        stats: {
          totalScored: stats.totalScored ?? 0,
          lastRunAt: stats.lastRunAt ?? null,
          avgScore: Math.round((stats.avgScore ?? 0) * 10) / 10,
          maxScore: Math.round((stats.maxScore ?? 0) * 10) / 10,
          minScore: Math.round((stats.minScore ?? 0) * 10) / 10,
        },
        distribution: {
          high: dist.high ?? 0,
          medium: dist.medium ?? 0,
          low: dist.low ?? 0,
        },
      });
    } catch (error: unknown) {
      logger.error('PrioritySettings.getSettings', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/admin/priority/settings - update weights and enabled flag */
  public updateSettings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { weights, enabled } = req.body;
      const pool = (this as any).pool as sql.ConnectionPool;

      if (weights) {
        const w = JSON.stringify({
          aging:       Number(weights.aging)       || 40,
          value:       Number(weights.value)       || 25,
          deadline:    Number(weights.deadline)    || 20,
          workload:    Number(weights.workload)    || 15,
          proficiency: Number(weights.proficiency) || 0,
        });
        await pool.request()
          .input('key', sql.NVarChar(100), 'priority_weights')
          .input('value', sql.NVarChar(sql.MAX), w)
          .query(`
            MERGE dbo.AppConfig AS target
            USING (SELECT @key AS [key], @value AS value) AS source ON target.[key] = source.[key]
            WHEN MATCHED THEN UPDATE SET value = source.value, updated_at = GETUTCDATE()
            WHEN NOT MATCHED THEN INSERT ([key], value) VALUES (source.[key], source.value);
          `);
      }

      if (enabled !== undefined) {
        await pool.request()
          .input('key', sql.NVarChar(100), 'priority_recalc_enabled')
          .input('value', sql.NVarChar(sql.MAX), enabled ? '1' : '0')
          .query(`
            MERGE dbo.AppConfig AS target
            USING (SELECT @key AS [key], @value AS value) AS source ON target.[key] = source.[key]
            WHEN MATCHED THEN UPDATE SET value = source.value, updated_at = GETUTCDATE()
            WHEN NOT MATCHED THEN INSERT ([key], value) VALUES (source.[key], source.value);
          `);
      }

      return res.status(200).json({ message: 'Settings updated' });
    } catch (error: unknown) {
      logger.error('PrioritySettings.updateSettings', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/admin/priority/recalculate - trigger a manual recalculation */
  public triggerRecalculate = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const count = await recalculatePriorities();
      return res.status(200).json({ message: 'Recalculation complete', scored: count });
    } catch (error: unknown) {
      logger.error('PrioritySettings.triggerRecalculate', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/priority/top-claims - top N claims by priority score */
  public getTopClaims = async (req: Request, res: Response): Promise<Response> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const pool = (this as any).pool as sql.ConnectionPool;

      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND c.customer_id = @_custId' : '';
      const topReq = pool.request().input('limit', sql.Int, limit);
      if (xenCustId != null) topReq.input('_custId', sql.Int, xenCustId);

      const result = await topReq.query(`
          SELECT TOP (@limit)
            cp.ClaimID AS claimId,
            ROUND(cp.priority_score, 1) AS priorityScore,
            ROUND(cp.aging_component, 1) AS agingComponent,
            ROUND(cp.value_component, 1) AS valueComponent,
            ROUND(cp.deadline_component, 1) AS deadlineComponent,
            ROUND(cp.workload_component, 1) AS workloadComponent,
            cp.recalculated_at AS recalculatedAt,
            c.ChargeAmt AS chargeAmt,
            DATEDIFF(DAY, c.ClaimSubmittedDate, CAST(GETDATE() AS DATE)) AS agingDays,
            ch.CARCCode AS carcCode,
            ch.ClaimStatus AS claimStatus,
            u.FirstName + ' ' + u.LastName AS assignedTo,
            u.Role AS assignedRole,
            p.FirstName + ' ' + p.LastName AS patientName
          FROM dbo.ClaimPriority cp
          JOIN dbo.claims c ON c.ClaimID = cp.ClaimID
          LEFT JOIN dbo.claimhistory ch ON ch.ClaimID = cp.ClaimID
            AND ch.ClaimWorkEndedTime IS NULL AND ch.ClaimWorkStartedTime IS NOT NULL
          LEFT JOIN dbo.Users u ON u.userID = ch.AssignedTo
          LEFT JOIN dbo.patient p ON p.PatientID = c.PatientID
          WHERE 1=1 ${custFilter}
          ORDER BY cp.priority_score DESC
        `);

      return res.status(200).json({ data: result.recordset });
    } catch (error: unknown) {
      logger.error('PrioritySettings.getTopClaims', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
