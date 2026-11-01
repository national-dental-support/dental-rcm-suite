import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { resolveUserScope, extractCustomerId } from '../../../utils/resolve-user-scope';
import { broadcastToCustomer } from '../../../websockets/index';

export class BulkActionsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** Build parameterized IN clause: adds @c0, @c1, ... inputs and returns '(@c0,@c1,...)' */
  private addClaimIdParams(req: sql.Request, claimIds: string[]): string {
    claimIds.forEach((id, i) => req.input(`c${i}`, sql.NVarChar(50), id));
    return claimIds.map((_, i) => `@c${i}`).join(',');
  }

  /** Fire-and-forget: INSERT one ClaimEvent row per claim in the list using INSERT...SELECT. */
  private async recordBulkEvents(
    claimIds: string[],
    eventType: string,
    actorEmail: string,
    metadata: Record<string, any>,
    xenCustId: number | null,
  ): Promise<void> {
    try {
      const r = this.pool.request()
        .input('bEvtType', sql.NVarChar(50), eventType)
        .input('bActor', sql.NVarChar(255), actorEmail)
        .input('bMeta', sql.NVarChar(sql.MAX), JSON.stringify(metadata));
      claimIds.forEach((id, i) => r.input(`be${i}`, sql.NVarChar(50), id));
      const inClause = claimIds.map((_, i) => `@be${i}`).join(',');
      if (xenCustId != null) r.input('_bCustId', sql.Int, xenCustId);
      await r.query(`
        INSERT INTO dbo.ClaimEvent (customer_id, claim_id, event_type, event_time, actor_user, metadata)
        SELECT ${xenCustId != null ? '@_bCustId' : 'NULL'}, ClaimID, @bEvtType, GETDATE(), @bActor, @bMeta
        FROM dbo.claims
        WHERE ClaimID IN (${inClause})${xenCustId != null ? ' AND customer_id = @_bCustId' : ''}
      `);
    } catch (err) {
      logger.warn('BulkActions.recordBulkEvents failed', { eventType, error: err });
    }
  }

  /** Get the next available CH-prefix number for history IDs. */
  private async getNextHistoryNum(): Promise<number> {
    const r = await this.pool.request().query(
      `SELECT TOP 1 CAST(REPLACE(ClaimHistoryId, 'CH', '') AS int) AS n FROM dbo.claimhistory WHERE ClaimHistoryId LIKE 'CH[0-9]%' AND ISNUMERIC(REPLACE(ClaimHistoryId, 'CH', '')) = 1 ORDER BY CAST(REPLACE(ClaimHistoryId, 'CH', '') AS int) DESC`
    );
    return (r.recordset[0]?.n ?? 0) + 1;
  }

  /**
   * POST /denial-iq/claim-detail/bulk-assign
   * Assigns multiple unassigned claims to a specified user.
   * Body: { claimIds: string[], assignToUserId?: number }
   *
   * Optimized: single INSERT...SELECT replaces N*4 individual queries.
   */
  public bulkAssign = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimIds, assignToUserId } = req.body;
      if (!Array.isArray(claimIds) || claimIds.length === 0) {
        return res.status(400).json({ message: 'claimIds array is required' });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) return res.status(401).json({ message: 'Could not resolve user' });

      const targetUserId = assignToUserId ?? scope.userId;
      const xenCustId2 = extractCustomerId(req);

      // Step 1: Close any existing open assignment rows for these claims
      const closeReq = this.pool.request();
      const closeIn = this.addClaimIdParams(closeReq, claimIds);
      if (xenCustId2 != null) closeReq.input('_custId', sql.Int, xenCustId2);
      await closeReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETDATE(), ClaimModifiedDate = CAST(GETDATE() AS date), ClaimStatus = 'Reassigned'
        WHERE ClaimID IN (${closeIn}) AND ClaimWorkEndedTime IS NULL AND AssignedTo IS NOT NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      // Step 2: Insert new assignment rows
      const startNum = await this.getNextHistoryNum();
      const r = this.pool.request()
        .input('AssignedTo', sql.Int, targetUserId)
        .input('startNum', sql.Int, startNum);
      const inClause = this.addClaimIdParams(r, claimIds);
      if (xenCustId2 != null) r.input('_custId', sql.Int, xenCustId2);

      const result = await r.query(`
        INSERT INTO dbo.claimhistory
          (ClaimHistoryId, ClaimID, AssignedTo, DateOfService, ClaimSubmittedDate,
           ClaimStatus, CarcCode, ClaimWorkStartedTime, ClaimWorkEndedTime,
           ClaimBalanceDue, Progress, ClaimModifiedDate, customer_id)
        SELECT
          'CH' + CAST((@startNum + ROW_NUMBER() OVER (ORDER BY c.ClaimID) - 1) AS VARCHAR),
          c.ClaimID, @AssignedTo, c.DateOfService, c.ClaimSubmittedDate,
          'Assigned', h.CarcCode, GETDATE(), NULL,
          ISNULL(h.ClaimBalanceDue, c.ChargeAmt), ISNULL(h.Progress, 0), CAST(GETDATE() AS date), c.customer_id
        FROM dbo.claims c
        OUTER APPLY (
          SELECT TOP 1 CarcCode, ClaimBalanceDue, Progress
          FROM dbo.claimhistory WHERE ClaimID = c.ClaimID AND CarcCode IS NOT NULL ORDER BY ClaimModifiedDate DESC
        ) h
        WHERE c.ClaimID IN (${inClause})${xenCustId2 != null ? ' AND c.customer_id = @_custId' : ''}
      `);

      const assigned = result.rowsAffected[0] ?? 0;
      logger.info('BulkActions.bulkAssign', { count: assigned, targetUserId, actor: actorEmail });
      if (assigned > 0) {
        if (scope.customerId) broadcastToCustomer(scope.customerId, 'claim:updated', { type: 'bulk-assigned', count: assigned });
        void this.recordBulkEvents(claimIds, 'denial_work_assigned', actorEmail, { bulkOp: true, assignedTo: targetUserId }, xenCustId2);
      }
      return res.json({ message: `${assigned} claim(s) assigned`, count: assigned });
    } catch (error: unknown) {
      logger.error('BulkActions.bulkAssign error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/bulk-escalate
   * Escalates multiple claims to a manager.
   * Body: { claimIds: string[], reason?: string }
   *
   * Optimized: 3 batch queries instead of N*4 individual queries.
   */
  public bulkEscalate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimIds, reason } = req.body;
      if (!Array.isArray(claimIds) || claimIds.length === 0) {
        return res.status(400).json({ message: 'claimIds array is required' });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) return res.status(401).json({ message: 'Could not resolve user' });

      const xenCustId2 = extractCustomerId(req);

      const mgrResult = await this.pool.request().query(`
        SELECT TOP 1 userID FROM dbo.Users
        WHERE Role = 'Manager' AND ISNULL(archived, 0) = 0 AND ISNULL(disabled, 0) = 0
        ORDER BY userID
      `);
      const managerId = mgrResult.recordset[0]?.userID;
      if (!managerId) return res.status(422).json({ message: 'No active manager found' });

      // Step 1: Close current specialist's open rows for all claims at once
      const closeReq = this.pool.request().input('UserID', sql.Int, scope.userId);
      const closeIn = this.addClaimIdParams(closeReq, claimIds);
      if (xenCustId2 != null) closeReq.input('_custId', sql.Int, xenCustId2);
      await closeReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETDATE(), ClaimModifiedDate = CAST(GETDATE() AS date), ClaimStatus = 'Escalated'
        WHERE ClaimID IN (${closeIn}) AND AssignedTo = @UserID AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      // Step 2: Insert new manager assignment rows for all claims at once
      const startNum = await this.getNextHistoryNum();
      const insReq = this.pool.request()
        .input('ManagerID', sql.Int, managerId)
        .input('startNum', sql.Int, startNum)
        .input('Reason', sql.NVarChar(50), reason ?? 'Escalated');
      const insIn = this.addClaimIdParams(insReq, claimIds);
      if (xenCustId2 != null) insReq.input('_custId', sql.Int, xenCustId2);

      const result = await insReq.query(`
        INSERT INTO dbo.claimhistory
          (ClaimHistoryId, ClaimID, AssignedTo, DateOfService, ClaimSubmittedDate,
           ClaimStatus, CarcCode, ClaimWorkStartedTime, ClaimWorkEndedTime,
           ClaimBalanceDue, Progress, ClaimModifiedDate, customer_id)
        SELECT
          'CH' + CAST((@startNum + ROW_NUMBER() OVER (ORDER BY c.ClaimID) - 1) AS VARCHAR),
          c.ClaimID, @ManagerID, c.DateOfService, c.ClaimSubmittedDate,
          @Reason,
          h.CarcCode, NULL, NULL,
          ISNULL(h.ClaimBalanceDue, c.ChargeAmt), ISNULL(h.Progress, 0), CAST(GETDATE() AS date), c.customer_id
        FROM dbo.claims c
        OUTER APPLY (
          SELECT TOP 1 CarcCode, ClaimBalanceDue, Progress
          FROM dbo.claimhistory WHERE ClaimID = c.ClaimID ORDER BY ClaimModifiedDate DESC
        ) h
        WHERE c.ClaimID IN (${insIn})${xenCustId2 != null ? ' AND c.customer_id = @_custId' : ''}
      `);

      // Step 3: Insert escalation notes for all claims at once
      const noteReq = this.pool.request()
        .input('Author', sql.NVarChar(255), actorEmail)
        .input('NoteText', sql.NVarChar(sql.MAX), `Bulk escalation. Reason: ${reason ?? 'Not specified'}`);
      const noteIn = this.addClaimIdParams(noteReq, claimIds);
      if (xenCustId2 != null) noteReq.input('_custId', sql.Int, xenCustId2);
      await noteReq.query(`
        INSERT INTO dbo.ClaimStepNote (claim_id, step_id, author_user_id, note_text, note_type, created_at)
        SELECT ClaimID, NULL, @Author, @NoteText, 'escalation', GETDATE()
        FROM dbo.claims WHERE ClaimID IN (${noteIn})${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      const escalated = result.rowsAffected[0] ?? 0;
      logger.info('BulkActions.bulkEscalate', { count: escalated, managerId, actor: actorEmail });
      if (escalated > 0) {
        if (scope.customerId) broadcastToCustomer(scope.customerId, 'claim:updated', { type: 'bulk-escalated', count: escalated });
        void this.recordBulkEvents(claimIds, 'denial_work_escalated', actorEmail, { bulkOp: true, reason: reason ?? 'Not specified', toUserId: managerId }, xenCustId2);
      }
      return res.json({ message: `${escalated} claim(s) escalated`, count: escalated, managerId });
    } catch (error: unknown) {
      logger.error('BulkActions.bulkEscalate error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/bulk-close
   * Closes multiple claims at once.
   * Body: { claimIds: string[], claimStatus?: string }
   *
   * Optimized: single UPDATE with IN clause replaces N individual UPDATEs.
   */
  public bulkClose = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimIds, claimStatus } = req.body;
      if (!Array.isArray(claimIds) || claimIds.length === 0) {
        return res.status(400).json({ message: 'claimIds array is required' });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) return res.status(401).json({ message: 'Could not resolve user' });

      const xenCustId2 = extractCustomerId(req);

      // Always set ClaimStatus - default to 'Closed' so queue filters exclude these rows.
      // Without an explicit status update, the row retains a PMS code or stale status
      // and the queue's CASE mapping would still render it as 'Open'.
      const finalStatus = claimStatus || 'Closed';
      const r = this.pool.request()
        .input('UserID', sql.Int, scope.userId)
        .input('ClaimStatus', sql.NVarChar(50), finalStatus);
      const inClause = this.addClaimIdParams(r, claimIds);
      if (xenCustId2 != null) r.input('_custId', sql.Int, xenCustId2);

      const result = await r.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETDATE(), ClaimModifiedDate = CAST(GETDATE() AS date), ClaimStatus = @ClaimStatus
        WHERE ClaimID IN (${inClause})
          AND AssignedTo = @UserID
          AND ClaimWorkEndedTime IS NULL
          AND ClaimStatus NOT IN ('Closed', 'Adjudicated')
          ${xenCustId2 != null ? 'AND customer_id = @_custId' : ''}
      `);

      const closed = result.rowsAffected[0] ?? 0;
      const skipped = claimIds.length - closed;
      logger.info('BulkActions.bulkClose', { count: closed, skipped, actor: actorEmail });
      if (closed > 0) {
        if (scope.customerId) broadcastToCustomer(scope.customerId, 'claim:updated', { type: 'bulk-closed', count: closed });
        void this.recordBulkEvents(claimIds, 'denial_work_completed', actorEmail, { bulkOp: true, status: finalStatus }, xenCustId2);
      }
      return res.json({ message: `${closed} claim(s) closed, ${skipped} skipped`, closed, skipped });
    } catch (error: unknown) {
      logger.error('BulkActions.bulkClose error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/bulk-reassign
   * Reassigns claims from their current owner to a different user.
   * Body: { claimIds: string[], toUserId: number }
   *
   * Optimized: 3 batch queries instead of N*4 individual queries.
   */
  public bulkReassign = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimIds, toUserId } = req.body;
      if (!Array.isArray(claimIds) || claimIds.length === 0 || !toUserId) {
        return res.status(400).json({ message: 'claimIds array and toUserId are required' });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId2 = extractCustomerId(req);

      // Step 1: Close all open rows for these claims at once
      const closeReq = this.pool.request();
      const closeIn = this.addClaimIdParams(closeReq, claimIds);
      if (xenCustId2 != null) closeReq.input('_custId', sql.Int, xenCustId2);
      await closeReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETDATE(), ClaimModifiedDate = CAST(GETDATE() AS date), ClaimStatus = 'Reassigned'
        WHERE ClaimID IN (${closeIn}) AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      // Step 2: Insert new assignment rows for all claims at once
      const startNum = await this.getNextHistoryNum();
      const insReq = this.pool.request()
        .input('AssignedTo', sql.Int, toUserId)
        .input('startNum', sql.Int, startNum);
      const insIn = this.addClaimIdParams(insReq, claimIds);
      if (xenCustId2 != null) insReq.input('_custId', sql.Int, xenCustId2);

      const result = await insReq.query(`
        INSERT INTO dbo.claimhistory
          (ClaimHistoryId, ClaimID, AssignedTo, DateOfService, ClaimSubmittedDate,
           ClaimStatus, CarcCode, ClaimWorkStartedTime, ClaimWorkEndedTime,
           ClaimBalanceDue, Progress, ClaimModifiedDate, customer_id)
        SELECT
          'CH' + CAST((@startNum + ROW_NUMBER() OVER (ORDER BY c.ClaimID) - 1) AS VARCHAR),
          c.ClaimID, @AssignedTo, c.DateOfService, c.ClaimSubmittedDate,
          'Assigned', h.CarcCode, NULL, NULL,
          ISNULL(h.ClaimBalanceDue, c.ChargeAmt), ISNULL(h.Progress, 0), CAST(GETDATE() AS date), c.customer_id
        FROM dbo.claims c
        OUTER APPLY (
          SELECT TOP 1 CarcCode, ClaimBalanceDue, Progress
          FROM dbo.claimhistory WHERE ClaimID = c.ClaimID ORDER BY ClaimModifiedDate DESC
        ) h
        WHERE c.ClaimID IN (${insIn})${xenCustId2 != null ? ' AND c.customer_id = @_custId' : ''}
      `);

      const reassigned = result.rowsAffected[0] ?? 0;
      logger.info('BulkActions.bulkReassign', { count: reassigned, toUserId, actor: actorEmail });
      if (reassigned > 0) {
        if (xenCustId2) broadcastToCustomer(xenCustId2, 'claim:updated', { type: 'bulk-reassigned', count: reassigned });
        void this.recordBulkEvents(claimIds, 'denial_work_assigned', actorEmail, { bulkOp: true, reassignedTo: toUserId }, xenCustId2);
      }
      return res.json({ message: `${reassigned} claim(s) reassigned`, count: reassigned, toUserId });
    } catch (error: unknown) {
      logger.error('BulkActions.bulkReassign error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
