import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { resolveUserScope, extractCustomerId } from '../../../utils/resolve-user-scope';
import { broadcastToCustomer } from '../../../websockets/index';
import { recordClaimEvent } from '../../../utils/claim-events';
import { trackEvent } from '../../../utils/telemetry';

export class ClaimActionsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * POST /denial-iq/claim-detail/start-work
   * Sets ClaimWorkStartedTime on the current open claimhistory row.
   * If no open row exists for this user, creates one.
   */
  public startWork = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId } = req.body;
      if (!claimId) return res.status(400).json({ message: 'claimId is required' });

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) {
        return res.status(401).json({ message: 'Could not resolve user' });
      }

      const xenCustId2 = extractCustomerId(req);

      // Check if there's already an open row for this user + claim
      const checkReq = this.pool.request();
      checkReq.input('ClaimID', sql.NVarChar(50), claimId);
      checkReq.input('UserID', sql.Int, scope.userId);
      if (xenCustId2 != null) checkReq.input('_custId', sql.Int, xenCustId2);
      const existing = await checkReq.query(`
        SELECT TOP 1 ClaimHistoryId, ClaimWorkStartedTime
        FROM dbo.claimhistory
        WHERE ClaimID = @ClaimID AND AssignedTo = @UserID AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY ClaimModifiedDate DESC
      `);

      if (existing.recordset.length > 0) {
        const row = existing.recordset[0];
        if (row.ClaimWorkStartedTime) {
          // Already started - idempotent success
          return res.status(200).json({ message: 'Work already started', claimHistoryId: row.ClaimHistoryId });
        }
        // Update existing row
        const upd = this.pool.request();
        upd.input('ChId', sql.NVarChar(50), row.ClaimHistoryId);
        await upd.query(`
          UPDATE dbo.claimhistory
          SET ClaimWorkStartedTime = GETDATE(),
              ClaimModifiedDate = CAST(GETDATE() AS date),
              first_touch_at = CASE WHEN first_touch_at IS NULL THEN GETDATE() ELSE first_touch_at END
          WHERE ClaimHistoryId = @ChId
        `);

        await recordClaimEvent(this.pool, {
          claimId,
          eventType: 'denial_work_started',
          actorUser: actorEmail,
          metadata: { claimHistoryId: row.ClaimHistoryId },
        });

        return res.status(200).json({ message: 'Work started', claimHistoryId: row.ClaimHistoryId });
      }

      // No open row for this user - do not auto-assign; return no-op so viewing unassigned claims doesn't assign them
      logger.info('ClaimActions.startWork \u2192 no open row for user, skipping auto-create', { claimId, userId: scope.userId });
      return res.status(200).json({ message: 'No open work session for this user', claimHistoryId: null });
    } catch (error: unknown) {
      logger.error('ClaimActions.startWork \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/close
   * Closes the current open work row and creates a Pending hold record.
   * Claim sits in Pending queue for N days (ClaimPendingConfig, default 14)
   * then returns to Unassigned automatically.
   */
  public close = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, progress, claimStatus } = req.body;
      if (!claimId) return res.status(400).json({ message: 'claimId is required' });

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) {
        return res.status(401).json({ message: 'Could not resolve user' });
      }

      const xenCustId2 = extractCustomerId(req);

      const findReq = this.pool.request();
      findReq.input('ClaimID', sql.NVarChar(50), claimId);
      findReq.input('UserID', sql.Int, scope.userId);
      if (xenCustId2 != null) findReq.input('_custId', sql.Int, xenCustId2);
      const open = await findReq.query(`
        SELECT TOP 1 ClaimHistoryId
        FROM dbo.claimhistory
        WHERE ClaimID = @ClaimID AND AssignedTo = @UserID AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY ClaimModifiedDate DESC
      `);

      if (open.recordset.length === 0) {
        logger.info('ClaimActions.close \u2192 no open work row found, treating as already closed', { claimId, userId: scope.userId });
        return res.status(200).json({ message: 'Claim already closed or not assigned to user' });
      }

      const chId = open.recordset[0].ClaimHistoryId;

      // Close the current work row
      const sets = ['ClaimWorkEndedTime = GETDATE()', 'ClaimModifiedDate = CAST(GETDATE() AS date)', 'ClaimStatus = @FinalStatus'];
      const updReq = this.pool.request();
      updReq.input('ChId', sql.NVarChar(50), chId);
      updReq.input('FinalStatus', sql.NVarChar(50), claimStatus || 'Closed');
      if (progress != null) {
        sets.push('Progress = @Progress');
        updReq.input('Progress', sql.Float, Number(progress));
      }
      await updReq.query(`UPDATE dbo.claimhistory SET ${sets.join(', ')} WHERE ClaimHistoryId = @ChId`);

      // Look up pending hold days for this claim's customer
      const custReq = this.pool.request();
      custReq.input('CIDpc', sql.NVarChar(50), claimId);
      const custResult = await custReq.query(`
        SELECT TOP 1 COALESCE(cfg.pending_days, 14) AS pending_days
        FROM dbo.claims c
        LEFT JOIN dbo.ClaimPendingConfig cfg ON cfg.customer_id = c.customer_id
        WHERE c.ClaimID = @CIDpc
      `);
      const pendingDays: number = custResult.recordset[0]?.pending_days ?? 14;

      // Generate new history ID for the pending row
      const maxIdResult = await this.pool.request().query(
        `SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory ORDER BY CAST(REPLACE(ClaimHistoryId,'CH','') AS int) DESC`
      );
      const lastId = maxIdResult.recordset[0]?.ClaimHistoryId ?? 'CH0';
      const pendingChId = `CH${parseInt(lastId.replace('CH', ''), 10) + 1}`;

      // Carry forward claim data
      const claimReq = this.pool.request();
      claimReq.input('CID', sql.NVarChar(50), claimId);
      const claimData = await claimReq.query(`
        SELECT c.DateOfService, c.ClaimSubmittedDate,
               (SELECT TOP 1 CarcCode FROM dbo.claimhistory WHERE ClaimID=@CID ORDER BY ClaimModifiedDate DESC) AS CarcCode,
               (SELECT TOP 1 ClaimBalanceDue FROM dbo.claimhistory WHERE ClaimID=@CID ORDER BY ClaimModifiedDate DESC) AS ClaimBalanceDue
        FROM dbo.claims c WHERE c.ClaimID = @CID
      `);
      const cd = claimData.recordset[0];

      const pendReq = this.pool.request();
      pendReq.input('PendChId',       sql.NVarChar(50), pendingChId);
      pendReq.input('PendClaimID',    sql.NVarChar(50), claimId);
      pendReq.input('PendDOS',        sql.Date,         cd?.DateOfService ?? null);
      pendReq.input('PendSubmitted',  sql.Date,         cd?.ClaimSubmittedDate ?? null);
      pendReq.input('PendCarcCode',   sql.NVarChar(50), cd?.CarcCode ?? null);
      pendReq.input('PendBalance',    sql.Float,        cd?.ClaimBalanceDue ?? 0);
      pendReq.input('PendUntil',      sql.Date,         new Date(Date.now() + pendingDays * 86400000));
      await pendReq.query(`
        INSERT INTO dbo.claimhistory
          (ClaimHistoryId, ClaimID, AssignedTo, DateOfService, ClaimSubmittedDate,
           ClaimStatus, CarcCode, ClaimWorkStartedTime, ClaimWorkEndedTime,
           ClaimBalanceDue, Progress, ClaimModifiedDate, pending_until)
        VALUES
          (@PendChId, @PendClaimID, NULL, @PendDOS, @PendSubmitted,
           'Pending', @PendCarcCode, NULL, NULL,
           @PendBalance, 0, CAST(GETDATE() AS date), @PendUntil)
      `);

      await recordClaimEvent(this.pool, {
        claimId,
        eventType: 'denial_work_completed',
        actorUser: actorEmail,
        metadata: { claimHistoryId: chId, progress, status: claimStatus, pendingDays, pendingHistoryId: pendingChId },
      });

      logger.info('ClaimActions.close \u2192 closed + pending hold', { claimId, userId: scope.userId, pendingDays, pendingChId });
      broadcastToCustomer(scope.customerId ?? 0, 'claim:updated', { type: 'closed', claimId, userId: scope.userId, status: 'Pending' });
      trackEvent(this.pool, { event: 'claim_closed', feature: 'denial_iq', actorId: scope.userId, customerId: scope.customerId, metadata: { claimId, pendingDays } });
      return res.status(200).json({ message: 'Claim closed and placed in pending queue', claimHistoryId: chId, pendingDays });
    } catch (error: unknown) {
      logger.error('ClaimActions.close \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/close-adjudicated
   * Closes as fully adjudicated - skips the pending queue.
   */
  public closeAdjudicated = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, progress } = req.body;
      if (!claimId) return res.status(400).json({ message: 'claimId is required' });

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) {
        return res.status(401).json({ message: 'Could not resolve user' });
      }

      const xenCustId2 = extractCustomerId(req);

      const findReq = this.pool.request();
      findReq.input('ClaimID', sql.NVarChar(50), claimId);
      findReq.input('UserID', sql.Int, scope.userId);
      if (xenCustId2 != null) findReq.input('_custId', sql.Int, xenCustId2);
      const open = await findReq.query(`
        SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory
        WHERE ClaimID=@ClaimID AND AssignedTo=@UserID AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY ClaimModifiedDate DESC
      `);

      if (open.recordset.length === 0) {
        return res.status(200).json({ message: 'Claim already closed' });
      }

      const chId = open.recordset[0].ClaimHistoryId;
      const updReq = this.pool.request();
      updReq.input('ChId',     sql.NVarChar(50), chId);
      updReq.input('Progress', sql.Float,        progress != null ? Number(progress) : 100);
      await updReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime=GETDATE(), ClaimModifiedDate=CAST(GETDATE() AS date),
            ClaimStatus='Closed', Progress=@Progress
        WHERE ClaimHistoryId=@ChId
      `);

      await recordClaimEvent(this.pool, {
        claimId,
        eventType: 'denial_work_completed',
        actorUser: actorEmail,
        metadata: { claimHistoryId: chId, progress, status: 'Closed', adjudicated: true },
      });

      logger.info('ClaimActions.closeAdjudicated \u2192 fully adjudicated', { claimId, userId: scope.userId });
      broadcastToCustomer(scope.customerId ?? 0, 'claim:updated', { type: 'closed', claimId, userId: scope.userId, status: 'Closed' });
      trackEvent(this.pool, { event: 'claim_closed', feature: 'denial_iq', actorId: scope.userId, customerId: scope.customerId, metadata: { claimId, adjudicated: true } });
      return res.status(200).json({ message: 'Claim closed as fully adjudicated', claimHistoryId: chId });
    } catch (error: unknown) {
      logger.error('ClaimActions.closeAdjudicated \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/unassign
   * Removes the current user's open assignment, returning the claim to
   * the unassigned queue immediately.
   */
  public unassign = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId } = req.body;
      if (!claimId) return res.status(400).json({ message: 'claimId is required' });

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) {
        return res.status(401).json({ message: 'Could not resolve user' });
      }

      const xenCustId2 = extractCustomerId(req);

      const updReq = this.pool.request();
      updReq.input('ClaimID', sql.NVarChar(50), claimId);
      if (xenCustId2 != null) updReq.input('_custId', sql.Int, xenCustId2);
      const result = await updReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime=GETDATE(), ClaimModifiedDate=CAST(GETDATE() AS date)
        WHERE ClaimID=@ClaimID AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      if (!result.rowsAffected[0]) {
        return res.status(404).json({ message: 'Claim not found or not currently assigned' });
      }

      await recordClaimEvent(this.pool, {
        claimId,
        eventType: 'denial_work_unassigned',
        actorUser: actorEmail,
        metadata: { fromUserId: scope.userId },
      });

      logger.info('ClaimActions.unassign \u2192 claim unassigned', { claimId, userId: scope.userId, rowsAffected: result.rowsAffected[0] });
      broadcastToCustomer(scope.customerId ?? 0, 'claim:updated', { type: 'unassigned', claimId, fromUserId: scope.userId });
      trackEvent(this.pool, { event: 'claim_reopened', feature: 'denial_iq', actorId: scope.userId, customerId: scope.customerId, metadata: { claimId } });
      return res.status(200).json({ message: 'Claim unassigned', rowsAffected: result.rowsAffected[0] });
    } catch (error: unknown) {
      logger.error('ClaimActions.unassign \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/write-off
   * Writes off a claim balance and records it as a PaymentTransaction adjustment.
   * Integration 8: Denial IQ write-offs flow into financial data.
   */
  public writeOff = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, amount, reason } = req.body;
      if (!claimId) return res.status(400).json({ message: 'claimId is required' });

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) {
        return res.status(401).json({ message: 'Could not resolve user' });
      }

      const xenCustId2 = extractCustomerId(req);

      // Get claim data for the write-off amount
      const claimReq = this.pool.request();
      claimReq.input('CID', sql.NVarChar(50), claimId);
      if (xenCustId2 != null) claimReq.input('_custId', sql.Int, xenCustId2);
      const claimData = await claimReq.query(`
        SELECT TOP 1 c.customer_id, c.ChargeAmt,
               h.ClaimBalanceDue
        FROM dbo.claims c
        LEFT JOIN dbo.claimhistory h ON h.ClaimID = c.ClaimID
        WHERE c.ClaimID = @CID${xenCustId2 != null ? ' AND c.customer_id = @_custId' : ''}
        ORDER BY h.ClaimModifiedDate DESC
      `);

      if (claimData.recordset.length === 0) {
        return res.status(404).json({ message: 'Claim not found' });
      }

      const claim = claimData.recordset[0];
      const writeOffAmount = amount || claim.ClaimBalanceDue || claim.ChargeAmt || 0;
      const customerId = claim.customer_id;

      // Close the current work row as write-off
      const closeReq = this.pool.request();
      closeReq.input('ClaimID', sql.NVarChar(50), claimId);
      if (xenCustId2 != null) closeReq.input('_custId', sql.Int, xenCustId2);
      await closeReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETDATE(), ClaimModifiedDate = CAST(GETDATE() AS date),
            ClaimStatus = 'Written Off'
        WHERE ClaimID = @ClaimID AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      // Integration 8: Insert PaymentTransaction for financial tracking
      try {
        const txnReq = this.pool.request();
        txnReq.input('CidTxn', sql.SmallInt, customerId);
        txnReq.input('Amount', sql.Decimal(10, 2), writeOffAmount);
        txnReq.input('Description', sql.NVarChar(500), `Claim write-off: ${claimId}${reason ? ' - ' + reason : ''}`);
        await txnReq.query(`
          INSERT INTO dbo.PaymentTransaction
            (customer_id, patient_id, amount, currency, transaction_type, status,
             gateway_transaction_id, description, processed_at)
          VALUES (@CidTxn, NULL, @Amount, 'USD', 'adjustment', 'completed',
                  NULL, @Description, GETDATE())
        `);
      } catch (txnErr) {
        logger.error('ClaimActions.writeOff PaymentTransaction error (non-fatal)', { error: txnErr });
      }

      await recordClaimEvent(this.pool, {
        claimId,
        eventType: 'denial_claim_written_off',
        actorUser: actorEmail,
        metadata: { amount: writeOffAmount, reason },
      });

      logger.info('ClaimActions.writeOff complete', { claimId, amount: writeOffAmount });
      broadcastToCustomer(scope.customerId ?? 0, 'claim:updated', { type: 'written_off', claimId, userId: scope.userId });
      return res.status(200).json({ message: 'Claim written off', amount: writeOffAmount });
    } catch (error: unknown) {
      logger.error('ClaimActions.writeOff - error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/escalate
   * Closes the current specialist's work row and creates a new one assigned to a manager.
   */
  public escalate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, reason } = req.body;
      if (!claimId) return res.status(400).json({ message: 'claimId is required' });

      // Prefer the middleware-resolved actor email (already DB-verified) over raw header
      const actorEmail = ((req as any).actor?.email ?? req.headers['x-actor-email'] as string ?? '').toLowerCase().trim();
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const oid = req.headers['x-actor-oid'] as string | undefined;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);
      if (scope.userId == null) {
        logger.warn('ClaimActions.escalate \u2013 user not resolved', { actorEmail, xenCustId });
        return res.status(401).json({ message: 'Could not resolve user' });
      }

      const xenCustId2 = extractCustomerId(req);
      const effectiveCustId = xenCustId2 ?? scope.customerId ?? null;

      // 1. Close the current specialist's open row (best-effort; 0 rows updated is OK)
      logger.info('ClaimActions.escalate [1] closing open row', { claimId, userId: scope.userId });
      const closeReq = this.pool.request();
      closeReq.input('ClaimID', sql.NVarChar(50), claimId);
      closeReq.input('UserID', sql.Int, scope.userId);
      if (xenCustId2 != null) closeReq.input('_custId', sql.Int, xenCustId2);
      await closeReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETDATE(), ClaimModifiedDate = CAST(GETDATE() AS date),
            ClaimStatus = 'Escalated'
        WHERE ClaimID = @ClaimID AND AssignedTo = @UserID AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      // 2. Find a manager - prefer this specialist's assigned manager within the same tenant
      logger.info('ClaimActions.escalate [2] finding manager', { userId: scope.userId, customerId: effectiveCustId });
      const myMgrReq = this.pool.request();
      myMgrReq.input('_specId', sql.Int, scope.userId);
      const myMgrResult = await myMgrReq.query(`
        SELECT TOP 1 msa.manager_id
        FROM dbo.ManagerSpecialistAssignment msa
        JOIN dbo.Users u ON u.userID = msa.manager_id
        WHERE msa.specialist_id = @_specId
          AND ISNULL(u.archived, 0) = 0 AND ISNULL(u.disabled, 0) = 0
      `);
      let managerId: number | undefined = myMgrResult.recordset[0]?.manager_id;

      // Fallback A: any active Manager in the same tenant
      if (!managerId && effectiveCustId != null) {
        const mgrTenantReq = this.pool.request();
        mgrTenantReq.input('_custId2', sql.Int, effectiveCustId);
        const mgrTenantResult = await mgrTenantReq.query(`
          SELECT TOP 1 userID FROM dbo.Users
          WHERE Role IN ('Manager', 'Admin', 'Super Admin')
            AND customer_id = @_custId2
            AND ISNULL(archived, 0) = 0 AND ISNULL(disabled, 0) = 0
          ORDER BY CASE Role WHEN 'Manager' THEN 0 WHEN 'Admin' THEN 1 ELSE 2 END, userID
        `);
        managerId = mgrTenantResult.recordset[0]?.userID;
        if (managerId) logger.info('ClaimActions.escalate [2a] tenant-scoped manager fallback', { managerId, customerId: effectiveCustId });
      }

      // Fallback B: any active Manager globally (cross-tenant last resort)
      if (!managerId) {
        const mgrResult = await this.pool.request().query(`
          SELECT TOP 1 userID FROM dbo.Users
          WHERE Role IN ('Manager', 'Admin', 'Super Admin')
            AND ISNULL(archived, 0) = 0 AND ISNULL(disabled, 0) = 0
          ORDER BY CASE Role WHEN 'Manager' THEN 0 WHEN 'Admin' THEN 1 ELSE 2 END, userID
        `);
        managerId = mgrResult.recordset[0]?.userID;
        if (managerId) logger.info('ClaimActions.escalate [2b] global manager fallback', { managerId });
      }

      if (!managerId) {
        logger.warn('ClaimActions.escalate \u2013 no manager found', { claimId, customerId: effectiveCustId });
        return res.status(422).json({ message: 'No active manager found to escalate to' });
      }

      // 3. Generate new claimhistory ID
      logger.info('ClaimActions.escalate [3] generating history ID');
      const maxIdResult = await this.pool.request().query(
        `SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory WHERE ClaimHistoryId LIKE 'CH[0-9]%' AND ISNUMERIC(REPLACE(ClaimHistoryId, 'CH', '')) = 1 ORDER BY CAST(REPLACE(ClaimHistoryId, 'CH', '') AS int) DESC`
      );
      const lastId = maxIdResult.recordset[0]?.ClaimHistoryId ?? 'CH0';
      const nextNum = parseInt(lastId.replace('CH', ''), 10) + 1;
      const newId = `CH${nextNum}`;

      // 4. Get claim + latest history data
      logger.info('ClaimActions.escalate [4] fetching claim data', { claimId });
      const claimReq = this.pool.request();
      claimReq.input('CID', sql.NVarChar(50), claimId);
      const claimData = await claimReq.query(`
        SELECT c.DateOfService, c.ClaimSubmittedDate,
               (SELECT TOP 1 CarcCode FROM dbo.claimhistory WHERE ClaimID = @CID ORDER BY ClaimModifiedDate DESC) AS CarcCode,
               (SELECT TOP 1 ClaimBalanceDue FROM dbo.claimhistory WHERE ClaimID = @CID ORDER BY ClaimModifiedDate DESC) AS ClaimBalanceDue,
               (SELECT TOP 1 Progress FROM dbo.claimhistory WHERE ClaimID = @CID ORDER BY ClaimModifiedDate DESC) AS Progress
        FROM dbo.claims c WHERE c.ClaimID = @CID
      `);
      const cd = claimData.recordset[0];
      if (!cd) logger.warn('ClaimActions.escalate \u2013 claim not found in dbo.claims, proceeding with nulls', { claimId });

      // 5. Create new open row assigned to manager
      logger.info('ClaimActions.escalate [5] inserting manager history row', { newId, managerId, claimId });
      const insReq = this.pool.request();
      insReq.input('ChId', sql.NVarChar(50), newId);
      insReq.input('ClaimID', sql.NVarChar(50), claimId);
      insReq.input('ManagerID', sql.Int, managerId);
      insReq.input('DOS', sql.Date, cd?.DateOfService ?? null);
      insReq.input('Submitted', sql.Date, cd?.ClaimSubmittedDate ?? null);
      insReq.input('CarcCode', sql.NVarChar(50), cd?.CarcCode ?? null);
      insReq.input('Balance', sql.Float, cd?.ClaimBalanceDue ?? 0);
      insReq.input('Progress', sql.Float, cd?.Progress ?? 0);
      insReq.input('CustId', sql.Int, effectiveCustId);
      await insReq.query(`
        INSERT INTO dbo.claimhistory
          (ClaimHistoryId, ClaimID, AssignedTo, DateOfService, ClaimSubmittedDate,
           ClaimStatus, CarcCode, ClaimWorkStartedTime, ClaimWorkEndedTime,
           ClaimBalanceDue, Progress, ClaimModifiedDate, customer_id)
        VALUES
          (@ChId, @ClaimID, @ManagerID, @DOS, @Submitted,
           'Escalated', @CarcCode, NULL, NULL,
           @Balance, @Progress, CAST(GETDATE() AS date), @CustId)
      `);

      // 6. Add an escalation note
      logger.info('ClaimActions.escalate [6] inserting escalation note', { claimId });
      const noteReq = this.pool.request();
      noteReq.input('ClaimID2', sql.NVarChar(50), claimId);
      noteReq.input('Author', sql.NVarChar(255), actorEmail);
      noteReq.input('NoteText', sql.NVarChar(sql.MAX), `Claim escalated to manager. Reason: ${reason ?? 'Not specified'}`);
      await noteReq.query(`
        INSERT INTO dbo.ClaimStepNote (claim_id, step_id, author_user_id, note_text, note_type, created_at)
        VALUES (@ClaimID2, NULL, @Author, @NoteText, 'escalation', GETDATE())
      `);

      await recordClaimEvent(this.pool, {
        claimId,
        eventType: 'denial_work_escalated',
        actorUser: actorEmail,
        metadata: { fromUserId: scope.userId, toUserId: managerId, reason, claimHistoryId: newId },
      });

      logger.info('ClaimActions.escalate \u2192 success', { claimId, fromUser: scope.userId, toManager: managerId, reason, newHistoryId: newId });
      broadcastToCustomer(scope.customerId ?? 0, 'claim:updated', { type: 'escalated', claimId, fromUserId: scope.userId, toUserId: managerId });
      trackEvent(this.pool, { event: 'claim_escalated', feature: 'denial_iq', actorId: scope.userId, customerId: scope.customerId, metadata: { claimId, toManager: managerId, reason } });
      return res.status(201).json({ message: 'Claim escalated to manager', claimHistoryId: newId, managerId });
    } catch (error: unknown) {
      logger.error('ClaimActions.escalate \u2013 unhandled error', { error, claimId: req.body?.claimId });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/claim-detail/assign
   * Assigns an unassigned claim to the current user (or a specified user).
   */
  public assign = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, assignToUserId } = req.body;
      if (!claimId) return res.status(400).json({ message: 'claimId is required' });

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      if (scope.userId == null) {
        return res.status(401).json({ message: 'Could not resolve user' });
      }

      const targetUserId = assignToUserId ?? scope.userId;

      const xenCustId2 = extractCustomerId(req);

      // Close any existing open row so this works as a reassign from any state
      const closeReq = this.pool.request();
      closeReq.input('ClaimID_close', sql.NVarChar(50), claimId);
      if (xenCustId2 != null) closeReq.input('_custId', sql.Int, xenCustId2);
      await closeReq.query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETDATE(), ClaimModifiedDate = CAST(GETDATE() AS date), ClaimStatus = 'Reassigned'
        WHERE ClaimID = @ClaimID_close AND ClaimWorkEndedTime IS NULL${xenCustId2 != null ? ' AND customer_id = @_custId' : ''}
      `);

      // Generate new ID
      const maxIdResult = await this.pool.request().query(
        `SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory WHERE ClaimHistoryId LIKE 'CH[0-9]%' AND ISNUMERIC(REPLACE(ClaimHistoryId, 'CH', '')) = 1 ORDER BY CAST(REPLACE(ClaimHistoryId, 'CH', '') AS int) DESC`
      );
      const lastId = maxIdResult.recordset[0]?.ClaimHistoryId ?? 'CH0';
      const nextNum = parseInt(lastId.replace('CH', ''), 10) + 1;
      const newId = `CH${nextNum}`;

      // Get claim data
      const claimReq = this.pool.request();
      claimReq.input('CID', sql.NVarChar(50), claimId);
      const claimData = await claimReq.query(`
        SELECT DateOfService, ClaimSubmittedDate, ChargeAmt FROM dbo.claims WHERE ClaimID = @CID
      `);
      const cd = claimData.recordset[0];

      // Get latest history for status carry-forward
      const prevReq = this.pool.request();
      prevReq.input('CID2', sql.NVarChar(50), claimId);
      const prev = await prevReq.query(`
        SELECT TOP 1 ClaimStatus, CarcCode, ClaimBalanceDue
        FROM dbo.claimhistory WHERE ClaimID = @CID2
        ORDER BY ClaimModifiedDate DESC, ClaimWorkStartedTime DESC
      `);
      const ph = prev.recordset[0];

      const insReq = this.pool.request();
      insReq.input('ChId', sql.NVarChar(50), newId);
      insReq.input('ClaimID', sql.NVarChar(50), claimId);
      insReq.input('AssignedTo', sql.Int, targetUserId);
      insReq.input('DOS', sql.Date, cd?.DateOfService ?? null);
      insReq.input('Submitted', sql.Date, cd?.ClaimSubmittedDate ?? null);
      insReq.input('Status', sql.NVarChar(50), ph?.ClaimStatus ?? 'Assigned');
      insReq.input('CarcCode', sql.NVarChar(50), ph?.CarcCode ?? null);
      insReq.input('Balance', sql.Float, ph?.ClaimBalanceDue ?? cd?.ChargeAmt ?? 0);

      await insReq.query(`
        INSERT INTO dbo.claimhistory
          (ClaimHistoryId, ClaimID, AssignedTo, DateOfService, ClaimSubmittedDate,
           ClaimStatus, CarcCode, ClaimWorkStartedTime, ClaimWorkEndedTime,
           ClaimBalanceDue, Progress, ClaimModifiedDate)
        VALUES
          (@ChId, @ClaimID, @AssignedTo, @DOS, @Submitted,
           @Status, @CarcCode, GETDATE(), NULL,
           @Balance, 0, CAST(GETDATE() AS date))
      `);

      await recordClaimEvent(this.pool, {
        claimId,
        eventType: 'denial_work_assigned',
        actorUser: actorEmail,
        metadata: { assignedTo: targetUserId, claimHistoryId: newId },
      });

      logger.info('ClaimActions.assign \u2192 claim assigned', { claimId, assignedTo: targetUserId, claimHistoryId: newId });
      broadcastToCustomer(scope.customerId ?? 0, 'claim:updated', { type: 'assigned', claimId, assignedTo: targetUserId });
      trackEvent(this.pool, { event: 'claim_assigned', feature: 'denial_iq', actorId: scope.userId, customerId: scope.customerId, metadata: { claimId, assignedTo: targetUserId } });
      return res.status(201).json({ message: 'Claim assigned', claimHistoryId: newId, assignedTo: targetUserId });
    } catch (error: unknown) {
      logger.error('ClaimActions.assign \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
