import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Escalation Chains + SLA Timers
 *
 * Multi-level escalation chains (specialist -> team lead -> manager -> director)
 * with configurable SLA timers. Auto-escalate if unresolved within X hours/days.
 */
export class EscalationChainsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** GET /api/admin/escalation/chains - list all chains with levels */
  public listChains = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;

      const chains = await pool.request().query(`
        SELECT id, name, description, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
        FROM dbo.EscalationChain
        ORDER BY name
      `);

      const levels = await pool.request().query(`
        SELECT id, chain_id AS chainId, level_order AS levelOrder, target_role AS targetRole,
               sla_hours AS slaHours, notify_at_pct AS notifyAtPct, description
        FROM dbo.EscalationLevel
        ORDER BY chain_id, level_order
      `);

      const levelsByChain: Record<number, any[]> = {};
      for (const lv of levels.recordset) {
        if (!levelsByChain[lv.chainId]) levelsByChain[lv.chainId] = [];
        levelsByChain[lv.chainId].push(lv);
      }

      const data = chains.recordset.map((c: any) => ({
        ...c,
        levels: levelsByChain[c.id] ?? [],
      }));

      return res.status(200).json({ data });
    } catch (error: unknown) {
      logger.error('EscalationChains.listChains', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/admin/escalation/chains - create a chain with levels */
  public createChain = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { name, description, levels } = req.body;
      const pool = (this as any).pool as sql.ConnectionPool;

      const result = await pool.request()
        .input('name', sql.NVarChar(200), name)
        .input('desc', sql.NVarChar(500), description || null)
        .query(`
          INSERT INTO dbo.EscalationChain (name, description)
          OUTPUT INSERTED.id
          VALUES (@name, @desc)
        `);

      const chainId = result.recordset[0].id;

      if (Array.isArray(levels)) {
        for (let i = 0; i < levels.length; i++) {
          const lv = levels[i];
          await pool.request()
            .input('chainId', sql.Int, chainId)
            .input('order', sql.Int, i + 1)
            .input('role', sql.NVarChar(50), lv.targetRole)
            .input('sla', sql.Int, lv.slaHours ?? 48)
            .input('notify', sql.Int, lv.notifyAtPct ?? 75)
            .input('lvDesc', sql.NVarChar(200), lv.description || null)
            .query(`
              INSERT INTO dbo.EscalationLevel (chain_id, level_order, target_role, sla_hours, notify_at_pct, description)
              VALUES (@chainId, @order, @role, @sla, @notify, @lvDesc)
            `);
        }
      }

      return res.status(201).json({ id: chainId });
    } catch (error: unknown) {
      logger.error('EscalationChains.createChain', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/admin/escalation/chains/:id - update chain + replace levels */
  public updateChain = async (req: Request, res: Response): Promise<Response> => {
    try {
      const chainId = Number(req.params.id);
      const { name, description, isActive, levels } = req.body;
      const pool = (this as any).pool as sql.ConnectionPool;

      await pool.request()
        .input('id', sql.Int, chainId)
        .input('name', sql.NVarChar(200), name)
        .input('desc', sql.NVarChar(500), description || null)
        .input('active', sql.Bit, isActive !== false ? 1 : 0)
        .query(`
          UPDATE dbo.EscalationChain
          SET name = @name, description = @desc, is_active = @active, updated_at = GETDATE()
          WHERE id = @id
        `);

      // Replace levels
      if (Array.isArray(levels)) {
        await pool.request().input('chainId', sql.Int, chainId)
          .query(`DELETE FROM dbo.EscalationLevel WHERE chain_id = @chainId`);

        for (let i = 0; i < levels.length; i++) {
          const lv = levels[i];
          await pool.request()
            .input('chainId', sql.Int, chainId)
            .input('order', sql.Int, i + 1)
            .input('role', sql.NVarChar(50), lv.targetRole)
            .input('sla', sql.Int, lv.slaHours ?? 48)
            .input('notify', sql.Int, lv.notifyAtPct ?? 75)
            .input('lvDesc', sql.NVarChar(200), lv.description || null)
            .query(`
              INSERT INTO dbo.EscalationLevel (chain_id, level_order, target_role, sla_hours, notify_at_pct, description)
              VALUES (@chainId, @order, @role, @sla, @notify, @lvDesc)
            `);
        }
      }

      return res.status(200).json({ message: 'Updated' });
    } catch (error: unknown) {
      logger.error('EscalationChains.updateChain', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/admin/escalation/chains/:id */
  public deleteChain = async (req: Request, res: Response): Promise<Response> => {
    try {
      const chainId = Number(req.params.id);
      const pool = (this as any).pool as sql.ConnectionPool;

      await pool.request().input('id', sql.Int, chainId)
        .query(`DELETE FROM dbo.EscalationChain WHERE id = @id`);

      return res.status(200).json({ message: 'Deleted' });
    } catch (error: unknown) {
      logger.error('EscalationChains.deleteChain', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/admin/escalation/sla-status
   * Claims approaching or past SLA deadlines based on the default escalation chain
   */
  public getSlaStatus = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;

      const result = await pool.request().query(`
        ;WITH ActiveChain AS (
          SELECT TOP 1 id FROM dbo.EscalationChain WHERE is_active = 1 ORDER BY id
        ),
        ChainLevels AS (
          SELECT el.level_order, el.target_role, el.sla_hours, el.notify_at_pct
          FROM dbo.EscalationLevel el
          JOIN ActiveChain ac ON ac.id = el.chain_id
        ),
        OpenWork AS (
          SELECT
            ch.ClaimID,
            ch.AssignedTo,
            ch.ClaimStatus,
            ch.ClaimWorkStartedTime,
            ch.CARCCode,
            ch.ClaimBalanceDue,
            u.Role AS AssignedRole,
            u.FirstName + ' ' + u.LastName AS AssignedName,
            DATEDIFF(HOUR, ch.ClaimWorkStartedTime, GETDATE()) AS HoursOpen,
            p.FirstName + ' ' + p.LastName AS PatientName
          FROM dbo.claimhistory ch
          JOIN dbo.Users u ON u.userID = ch.AssignedTo
          LEFT JOIN dbo.patient p ON p.PatientID = (
            SELECT TOP 1 c.PatientID FROM dbo.claims c WHERE c.ClaimID = ch.ClaimID
          )
          WHERE ch.ClaimWorkEndedTime IS NULL
            AND ch.ClaimWorkStartedTime IS NOT NULL
        )
        SELECT
          ow.ClaimID AS claimId,
          ow.PatientName AS patientName,
          ow.AssignedName AS assignedTo,
          ow.AssignedRole AS assignedRole,
          ow.ClaimStatus AS claimStatus,
          ow.CARCCode AS carcCode,
          ow.ClaimBalanceDue AS balanceDue,
          ow.HoursOpen AS hoursOpen,
          cl.sla_hours AS slaHours,
          CASE
            WHEN ow.HoursOpen >= cl.sla_hours THEN 'breached'
            WHEN ow.HoursOpen >= cl.sla_hours * cl.notify_at_pct / 100 THEN 'warning'
            ELSE 'ok'
          END AS slaStatus,
          CASE
            WHEN ow.HoursOpen >= cl.sla_hours THEN 0
            ELSE cl.sla_hours - ow.HoursOpen
          END AS hoursRemaining
        FROM OpenWork ow
        LEFT JOIN ChainLevels cl ON cl.target_role = ow.AssignedRole
        WHERE cl.sla_hours IS NOT NULL
        ORDER BY
          CASE WHEN ow.HoursOpen >= cl.sla_hours THEN 0
               WHEN ow.HoursOpen >= cl.sla_hours * cl.notify_at_pct / 100 THEN 1
               ELSE 2 END,
          ow.HoursOpen DESC
      `);

      const rows = result.recordset ?? [];
      const breached = rows.filter((r: any) => r.slaStatus === 'breached').length;
      const warning = rows.filter((r: any) => r.slaStatus === 'warning').length;

      return res.status(200).json({
        data: rows,
        summary: { breached, warning, ok: rows.length - breached - warning, total: rows.length },
      });
    } catch (error: unknown) {
      logger.error('EscalationChains.getSlaStatus', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /api/admin/escalation/check-sla
   * Checks for SLA breaches and auto-escalates claims that have exceeded their SLA.
   * Should be called periodically (e.g., every 15 minutes via cron or on-demand).
   */
  public checkAndAutoEscalate = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;

      // Find the active chain
      const chainResult = await pool.request().query(`
        SELECT TOP 1 id FROM dbo.EscalationChain WHERE is_active = 1 ORDER BY id
      `);
      if (!chainResult.recordset.length) {
        return res.status(200).json({ message: 'No active chain', escalated: 0 });
      }
      const chainId = chainResult.recordset[0].id;

      // Get chain levels
      const levelsResult = await pool.request().input('chainId', sql.Int, chainId).query(`
        SELECT level_order, target_role, sla_hours
        FROM dbo.EscalationLevel
        WHERE chain_id = @chainId
        ORDER BY level_order
      `);
      const levels = levelsResult.recordset;

      // Find open claims that have breached SLA
      const breachedResult = await pool.request().query(`
        SELECT
          ch.ClaimHistoryId, ch.ClaimID, ch.AssignedTo, ch.ClaimStatus,
          ch.ClaimWorkStartedTime, ch.CARCCode, ch.ClaimBalanceDue,
          ch.Progress, ch.DateOfService, ch.ClaimSubmittedDate,
          u.Role AS AssignedRole,
          DATEDIFF(HOUR, ch.ClaimWorkStartedTime, GETDATE()) AS HoursOpen
        FROM dbo.claimhistory ch
        JOIN dbo.Users u ON u.userID = ch.AssignedTo
        WHERE ch.ClaimWorkEndedTime IS NULL
          AND ch.ClaimWorkStartedTime IS NOT NULL
        ORDER BY ch.ClaimWorkStartedTime
      `);

      let escalatedCount = 0;

      for (const claim of breachedResult.recordset) {
        // Find the current level for this role
        const currentLevel = levels.find((l: any) => l.target_role === claim.AssignedRole);
        if (!currentLevel) continue;

        // Check if SLA breached
        if (claim.HoursOpen < currentLevel.sla_hours) continue;

        // Find next level
        const nextLevel = levels.find((l: any) => l.level_order === currentLevel.level_order + 1);
        if (!nextLevel) continue; // Already at highest level

        // Find a user at the next level
        const nextUserResult = await pool.request()
          .input('role', sql.NVarChar(50), nextLevel.target_role)
          .query(`
            SELECT TOP 1 u.userID
            FROM dbo.Users u
            WHERE u.Role = @role AND u.IsActive = 1
            ORDER BY (
              SELECT COUNT(*) FROM dbo.claimhistory ch2
              WHERE ch2.AssignedTo = u.userID AND ch2.ClaimWorkEndedTime IS NULL
            ) ASC
          `);

        if (!nextUserResult.recordset.length) continue;
        const nextUserId = nextUserResult.recordset[0].userID;

        // Close current work row
        await pool.request()
          .input('histId', sql.NVarChar(50), claim.ClaimHistoryId)
          .query(`
            UPDATE dbo.claimhistory
            SET ClaimWorkEndedTime = GETDATE(), ClaimStatus = 'Auto-Escalated'
            WHERE ClaimHistoryId = @histId
          `);

        // Get next history ID
        const maxIdResult = await pool.request().query(`
          SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory ORDER BY CAST(REPLACE(ClaimHistoryId,'CH','') AS INT) DESC
        `);
        const maxId = maxIdResult.recordset[0]?.ClaimHistoryId ?? 'CH0';
        const nextId = 'CH' + (parseInt(maxId.replace('CH', '')) + 1);

        // Create new assignment row at next level
        await pool.request()
          .input('newId', sql.NVarChar(50), nextId)
          .input('claimId', sql.NVarChar(50), claim.ClaimID)
          .input('assignedTo', sql.Int, nextUserId)
          .input('balance', sql.Float, claim.ClaimBalanceDue)
          .input('progress', sql.Float, claim.Progress)
          .input('carc', sql.NVarChar(50), claim.CARCCode)
          .input('dos', sql.Date, claim.DateOfService)
          .input('submitted', sql.Date, claim.ClaimSubmittedDate)
          .query(`
            INSERT INTO dbo.claimhistory
              (ClaimHistoryId, ClaimID, AssignedTo, ClaimStatus, ClaimBalanceDue, Progress,
               CARCCode, DateOfService, ClaimSubmittedDate, ClaimModifiedDate)
            VALUES (@newId, @claimId, @assignedTo, 'Escalated', @balance, @progress,
                    @carc, @dos, @submitted, CAST(GETDATE() AS DATE))
          `);

        escalatedCount++;
      }

      return res.status(200).json({
        message: `Auto-escalation check complete`,
        escalated: escalatedCount,
      });
    } catch (error: unknown) {
      logger.error('EscalationChains.checkAndAutoEscalate', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
