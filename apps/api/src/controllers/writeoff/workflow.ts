import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { recordClaimEvent } from '../../utils/claim-events';

const ROLE_HIERARCHY: Record<string, number> = {
  'ar_specialist': 1,
  'manager': 2,
  'director': 3,
  'vp': 4,
  'admin': 5,
  'super_admin': 6,
};

function meetsApprovalLevel(actorRole: string, requiredLevel: string | null): boolean {
  if (!requiredLevel) return true; // no level required
  const actorRank = ROLE_HIERARCHY[(actorRole || '').toLowerCase()] ?? 0;
  const requiredRank = ROLE_HIERARCHY[requiredLevel.toLowerCase()] ?? 0;
  return actorRank >= requiredRank;
}

export class WriteOffWorkflowController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/writeoff/rules - list all rules */
  public getRules = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as any).actor?.customer_id ?? (req as any).customerId;
      const r = await this.pool.request()
        .input('cid', sql.Int, customerId)
        .query(`SELECT * FROM WriteOffRule WHERE customer_id = @cid ORDER BY priority`);
      return res.json(r.recordset);
    } catch (e) {
      logger.error('[WriteOff] getRules failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/writeoff/rules - create rule */
  public createRule = async (req: Request, res: Response): Promise<Response> => {
    const { rule_name, priority, conditions, adj_type, adj_note_template, requires_approval, approval_level } = req.body;
    const customerId = (req as any).actor?.customer_id ?? (req as any).customerId;
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    try {
      const r = await this.pool.request()
        .input('name',      sql.NVarChar(100),     rule_name)
        .input('priority',  sql.Int,               priority ?? 100)
        .input('cond',      sql.NVarChar(sql.MAX), typeof conditions === 'string' ? conditions : JSON.stringify(conditions))
        .input('adjType',   sql.NVarChar(50),      adj_type)
        .input('note',      sql.NVarChar(500),     adj_note_template ?? null)
        .input('approval',  sql.Bit,               requires_approval ? 1 : 0)
        .input('level',     sql.NVarChar(50),      approval_level ?? null)
        .input('user',      sql.NVarChar(255),     userEmail)
        .input('cid',       sql.Int,               customerId)
        .query(`INSERT INTO WriteOffRule (rule_name, priority, conditions, adj_type, adj_note_template, requires_approval, approval_level, created_by, customer_id)
                OUTPUT INSERTED.*
                VALUES (@name, @priority, @cond, @adjType, @note, @approval, @level, @user, @cid)`);
      return res.status(201).json(r.recordset[0]);
    } catch (e) {
      logger.error('[WriteOff] createRule failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/writeoff/rules/:id - update rule */
  public updateRule = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params['id']);
    const { rule_name, priority, conditions, adj_type, adj_note_template, requires_approval, approval_level, is_active } = req.body;
    try {
      const r = await this.pool.request()
        .input('id',        sql.Int,               id)
        .input('name',      sql.NVarChar(100),     rule_name)
        .input('priority',  sql.Int,               priority ?? 100)
        .input('cond',      sql.NVarChar(sql.MAX), typeof conditions === 'string' ? conditions : JSON.stringify(conditions))
        .input('adjType',   sql.NVarChar(50),      adj_type)
        .input('note',      sql.NVarChar(500),     adj_note_template ?? null)
        .input('approval',  sql.Bit,               requires_approval ? 1 : 0)
        .input('level',     sql.NVarChar(50),      approval_level ?? null)
        .input('active',    sql.Bit,               is_active !== false ? 1 : 0)
        .query(`UPDATE WriteOffRule SET rule_name=@name, priority=@priority, conditions=@cond, adj_type=@adjType,
                adj_note_template=@note, requires_approval=@approval, approval_level=@level, is_active=@active, updated_at=GETUTCDATE()
                WHERE id=@id; SELECT * FROM WriteOffRule WHERE id=@id`);
      return res.json(r.recordset[0]);
    } catch (e) {
      logger.error('[WriteOff] updateRule failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/writeoff/rules/:id */
  public deleteRule = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params['id']);
    try {
      await this.pool.request().input('id', sql.Int, id).query(`DELETE FROM WriteOffRule WHERE id=@id`);
      return res.json({ deleted: true });
    } catch (e) {
      logger.error('[WriteOff] deleteRule failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/writeoff/scan - run all active rules against aged claims */
  public scan = async (req: Request, res: Response): Promise<Response> => {
    const customerId = (req as any).actor?.customer_id ?? (req as any).customerId;
    const dryRun = req.query['dryRun'] === 'true';
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    try {
      // Get active rules
      const rulesResult = await this.pool.request()
        .input('cid', sql.Int, customerId)
        .query(`SELECT * FROM WriteOffRule WHERE is_active=1 AND (customer_id = @cid) ORDER BY priority`);
      const rules = rulesResult.recordset;

      // Get aged claims with balances
      const claimsReq = this.pool.request();
      if (customerId != null) claimsReq.input('_custId', sql.Int, customerId);
      const claims = await claimsReq.query(`
        WITH ClaimBalances AS (
          SELECT ClaimID, PatientID, InsuranceName,
            SUM(CASE WHEN TrxType='Charge' THEN TrxAmt ELSE 0 END) AS Charges,
            SUM(CASE WHEN TrxType='Payment' THEN TrxAmt ELSE 0 END) AS Payments,
            SUM(CASE WHEN TrxType='Adjustment' THEN TrxAmt ELSE 0 END) AS Adjustments,
            MIN(DateOfService) AS EarliestDOS,
            MAX(ClaimStatus) AS ClaimStatus
          FROM recon_report
          WHERE DateOfService >= DATEADD(YEAR, -3, GETDATE())
            ${customerId != null ? 'AND customer_id = @_custId' : ''}
          GROUP BY ClaimID, PatientID, InsuranceName
        )
        SELECT ClaimID, PatientID, InsuranceName, ClaimStatus,
          (Charges - Payments - Adjustments) AS Balance,
          DATEDIFF(DAY, EarliestDOS, GETDATE()) AS AgingDays
        FROM ClaimBalances
        WHERE (Charges - Payments - Adjustments) > 0
          AND DATEDIFF(DAY, EarliestDOS, GETDATE()) > 90
      `);

      const matched: any[] = [];
      const autoPosted: any[] = [];
      const requestsCreated: any[] = [];

      for (const claim of claims.recordset) {
        for (const rule of rules) {
          let cond: any;
          try { cond = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions; }
          catch { continue; }

          // Check conditions
          if (cond.minAgingDays && claim.AgingDays < cond.minAgingDays) continue;
          if (cond.maxBalance && claim.Balance > cond.maxBalance) continue;
          if (cond.minBalance && claim.Balance < cond.minBalance) continue;
          if (cond.denialCodes?.length && !cond.denialCodes.includes(claim.ClaimStatus)) continue;

          const matchItem = {
            claimId: claim.ClaimID,
            patientId: claim.PatientID,
            payerName: claim.InsuranceName,
            balance: claim.Balance,
            agingDays: claim.AgingDays,
            ruleId: rule.id,
            ruleName: rule.rule_name,
            adjType: rule.adj_type,
            requiresApproval: rule.requires_approval,
          };
          matched.push(matchItem);

          if (!dryRun) {
            if (rule.requires_approval) {
              // Create WriteOffRequest
              await this.pool.request()
                .input('claimId',   sql.NVarChar(50),  claim.ClaimID)
                .input('patId',     sql.NVarChar(50),  claim.PatientID)
                .input('payer',     sql.NVarChar(100), claim.InsuranceName)
                .input('balance',   sql.Decimal(12,2), claim.Balance)
                .input('aging',     sql.Int,           claim.AgingDays)
                .input('adjType',   sql.NVarChar(50),  rule.adj_type)
                .input('note',      sql.NVarChar(500), rule.adj_note_template ?? `Auto-generated by rule: ${rule.rule_name}`)
                .input('ruleId',    sql.Int,           rule.id)
                .input('ruleName',  sql.NVarChar(100), rule.rule_name)
                .input('user',      sql.NVarChar(255), userEmail)
                .input('cid',       sql.Int,           customerId)
                .query(`INSERT INTO WriteOffRequest (claim_id, patient_id, patient_name, payer_name, balance, aging_days, adj_type, adj_note, rule_id, rule_name, requested_by, customer_id)
                        VALUES (@claimId, @patId, NULL, @payer, @balance, @aging, @adjType, @note, @ruleId, @ruleName, @user, @cid)`);

              await recordClaimEvent(this.pool, {
                customerId,
                claimId: claim.ClaimID,
                eventType: 'writeoff_requested',
                actorUser: userEmail,
                metadata: { ruleId: rule.id, ruleName: rule.rule_name, balance: claim.Balance },
              });

              requestsCreated.push(matchItem);
            } else {
              // Auto-post: log to audit
              await this.pool.request()
                .input('claimId',  sql.NVarChar(50),  claim.ClaimID)
                .input('ruleId',   sql.Int,           rule.id)
                .input('ruleName', sql.NVarChar(100), rule.rule_name)
                .input('amt',      sql.Decimal(12,2), claim.Balance)
                .input('adjType',  sql.NVarChar(50),  rule.adj_type)
                .input('note',     sql.NVarChar(500), rule.adj_note_template ?? `Auto write-off: ${rule.rule_name}`)
                .input('cid',      sql.Int,           customerId)
                .query(`INSERT INTO WriteOffAuditLog (claim_id, rule_id, rule_name, adj_amt, adj_type, adj_note, customer_id)
                        VALUES (@claimId, @ruleId, @ruleName, @amt, @adjType, @note, @cid)`);

              await recordClaimEvent(this.pool, {
                customerId,
                claimId: claim.ClaimID,
                eventType: 'writeoff_auto_posted',
                actorUser: userEmail,
                metadata: { ruleId: rule.id, ruleName: rule.rule_name, amount: claim.Balance },
              });

              autoPosted.push(matchItem);
            }
          }
          break; // first matching rule wins per claim
        }
      }

      return res.json({
        dryRun,
        totalClaims: claims.recordset.length,
        totalMatched: matched.length,
        autoPosted: autoPosted.length,
        requestsCreated: requestsCreated.length,
        matches: matched,
      });
    } catch (e) {
      logger.error('[WriteOff] scan failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/writeoff/queue - pending approval queue */
  public getQueue = async (req: Request, res: Response): Promise<Response> => {
    const customerId = (req as any).actor?.customer_id ?? (req as any).customerId;
    const status = req.query['status'] ?? 'pending';
    try {
      const r = await this.pool.request()
        .input('cid', sql.Int, customerId)
        .input('status', sql.NVarChar(20), status as string)
        .query(`SELECT * FROM WriteOffRequest
                WHERE (customer_id = @cid)
                  AND status=@status
                ORDER BY requested_at DESC`);
      return res.json(r.recordset);
    } catch (e) {
      logger.error('[WriteOff] getQueue failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/writeoff/queue/:id/approve */
  public approveRequest = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params['id']);
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    const actorRole = (req as any).actor?.role ?? 'manager';
    const { review_note } = req.body;
    try {
      // Check approval level requirement from the associated rule
      const reqCheck = await this.pool.request().input('id', sql.Int, id)
        .query(`SELECT wr.*, r.approval_level FROM WriteOffRequest wr
                LEFT JOIN WriteOffRule r ON r.id = wr.rule_id
                WHERE wr.id = @id AND wr.status = 'pending'`);
      const pending = reqCheck.recordset[0];
      if (!pending) {
        return res.status(404).json({ message: 'Request not found or not pending' });
      }
      if (!meetsApprovalLevel(actorRole, pending.approval_level)) {
        return res.status(403).json({
          message: `This write-off requires ${pending.approval_level}-level approval. Your role (${actorRole}) is insufficient.`,
        });
      }

      await this.pool.request()
        .input('id',     sql.Int,           id)
        .input('user',   sql.NVarChar(255), userEmail)
        .input('note',   sql.NVarChar(500), review_note ?? null)
        .query(`UPDATE WriteOffRequest SET status='approved', reviewed_by=@user, reviewed_at=GETUTCDATE(), review_note=@note, posted_at=GETUTCDATE()
                WHERE id=@id AND status='pending'`);

      // Also log to audit
      const req2 = await this.pool.request().input('id', sql.Int, id)
        .query(`SELECT * FROM WriteOffRequest WHERE id=@id`);
      const wo = req2.recordset[0];
      if (wo) {
        await this.pool.request()
          .input('claimId',  sql.NVarChar(50),  wo.claim_id)
          .input('ruleId',   sql.Int,           wo.rule_id ?? 0)
          .input('ruleName', sql.NVarChar(100), wo.rule_name ?? 'Manual approval')
          .input('amt',      sql.Decimal(12,2), wo.balance)
          .input('adjType',  sql.NVarChar(50),  wo.adj_type)
          .input('adjNote',  sql.NVarChar(500), `Approved by ${userEmail}: ${review_note ?? ''}`)
          .input('cid',      sql.Int,           wo.customer_id)
          .query(`INSERT INTO WriteOffAuditLog (claim_id, rule_id, rule_name, adj_amt, adj_type, adj_note, customer_id)
                  VALUES (@claimId, @ruleId, @ruleName, @amt, @adjType, @adjNote, @cid)`);

        await recordClaimEvent(this.pool, {
          customerId: wo.customer_id,
          claimId: wo.claim_id,
          eventType: 'writeoff_approved',
          actorUser: userEmail,
          metadata: { reviewNote: review_note ?? null, adjType: wo.adj_type, amount: wo.balance },
        });
      }

      return res.json({ approved: true });
    } catch (e) {
      logger.error('[WriteOff] approve failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/writeoff/queue/:id/reject */
  public rejectRequest = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params['id']);
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    const { review_note } = req.body;
    try {
      await this.pool.request()
        .input('id',     sql.Int,           id)
        .input('user',   sql.NVarChar(255), userEmail)
        .input('note',   sql.NVarChar(500), review_note ?? null)
        .query(`UPDATE WriteOffRequest SET status='rejected', reviewed_by=@user, reviewed_at=GETUTCDATE(), review_note=@note
                WHERE id=@id AND status='pending'`);

      // Record event for rejected request
      const req2 = await this.pool.request().input('id', sql.Int, id)
        .query(`SELECT * FROM WriteOffRequest WHERE id=@id`);
      const wo = req2.recordset[0];
      if (wo) {
        await recordClaimEvent(this.pool, {
          customerId: wo.customer_id,
          claimId: wo.claim_id,
          eventType: 'writeoff_rejected',
          actorUser: userEmail,
          metadata: { reviewNote: review_note ?? null, adjType: wo.adj_type, balance: wo.balance },
        });
      }

      return res.json({ rejected: true });
    } catch (e) {
      logger.error('[WriteOff] reject failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/writeoff/request - manual write-off request from AR specialist */
  public createRequest = async (req: Request, res: Response): Promise<Response> => {
    const { claim_id, patient_id, patient_name, payer_name, balance, aging_days, adj_type, adj_note } = req.body;
    const customerId = (req as any).actor?.customer_id ?? (req as any).customerId;
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    try {
      const r = await this.pool.request()
        .input('claimId',   sql.NVarChar(50),  claim_id)
        .input('patId',     sql.NVarChar(50),  patient_id ?? null)
        .input('patName',   sql.NVarChar(100), patient_name ?? null)
        .input('payer',     sql.NVarChar(100), payer_name ?? null)
        .input('balance',   sql.Decimal(12,2), balance)
        .input('aging',     sql.Int,           aging_days ?? 0)
        .input('adjType',   sql.NVarChar(50),  adj_type)
        .input('note',      sql.NVarChar(500), adj_note ?? null)
        .input('user',      sql.NVarChar(255), userEmail)
        .input('cid',       sql.Int,           customerId)
        .query(`INSERT INTO WriteOffRequest (claim_id, patient_id, patient_name, payer_name, balance, aging_days, adj_type, adj_note, requested_by, customer_id)
                OUTPUT INSERTED.*
                VALUES (@claimId, @patId, @patName, @payer, @balance, @aging, @adjType, @note, @user, @cid)`);
      return res.status(201).json(r.recordset[0]);
    } catch (e) {
      logger.error('[WriteOff] createRequest failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/writeoff/queue/:id - edit a pending request (adj_type, adj_note, balance) */
  public updateRequest = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params['id']);
    const { adj_type, adj_note, balance } = req.body;
    try {
      const result = await this.pool.request()
        .input('id',      sql.Int,           id)
        .input('adjType', sql.NVarChar(50),  adj_type ?? null)
        .input('adjNote', sql.NVarChar(500), adj_note ?? null)
        .input('balance', sql.Decimal(12,2), balance ?? null)
        .query(`
          UPDATE WriteOffRequest
          SET
            adj_type  = COALESCE(@adjType, adj_type),
            adj_note  = COALESCE(@adjNote, adj_note),
            balance   = COALESCE(@balance, balance)
          WHERE id = @id AND status = 'pending'
        `);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ message: 'Request not found or not pending' });
      }
      return res.json({ updated: true });
    } catch (e) {
      logger.error('[WriteOff] updateRequest failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/writeoff/queue/:id - delete a request */
  public deleteRequest = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params['id']);
    try {
      const result = await this.pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM WriteOffRequest WHERE id = @id`);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ message: 'Request not found' });
      }
      return res.json({ deleted: true });
    } catch (e) {
      logger.error('[WriteOff] deleteRequest failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/writeoff/queue/:id/reopen - move approved/rejected back to pending */
  public reopenRequest = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params['id']);
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    try {
      const result = await this.pool.request()
        .input('id', sql.Int, id)
        .query(`
          UPDATE WriteOffRequest
          SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, posted_at = NULL
          WHERE id = @id AND status IN ('approved', 'rejected')
        `);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ message: 'Request not found or not in approved/rejected state' });
      }
      const req2 = await this.pool.request().input('id', sql.Int, id)
        .query(`SELECT * FROM WriteOffRequest WHERE id = @id`);
      const wo = req2.recordset[0];
      if (wo) {
        await recordClaimEvent(this.pool, {
          customerId: wo.customer_id,
          claimId: wo.claim_id,
          eventType: 'writeoff_reopened',
          actorUser: userEmail,
          metadata: { adjType: wo.adj_type, balance: wo.balance },
        });
      }
      return res.json({ reopened: true });
    } catch (e) {
      logger.error('[WriteOff] reopenRequest failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/writeoff/audit - audit log */
  public getAuditLog = async (req: Request, res: Response): Promise<Response> => {
    const customerId = (req as any).actor?.customer_id ?? (req as any).customerId;
    try {
      const r = await this.pool.request()
        .input('cid', sql.Int, customerId)
        .query(`SELECT TOP 200 * FROM WriteOffAuditLog
                WHERE customer_id = @cid
                ORDER BY posted_at DESC`);
      return res.json(r.recordset);
    } catch (e) {
      logger.error('[WriteOff] getAuditLog failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/writeoff/queue-stats - summary counts for queue dashboard */
  public getQueueStats = async (req: Request, res: Response): Promise<Response> => {
    const customerId = (req as any).actor?.customer_id ?? (req as any).customerId;
    try {
      const r = await this.pool.request()
        .input('cid', sql.Int, customerId)
        .query(`
          SELECT
            COUNT(CASE WHEN status='pending' THEN 1 END) AS pendingCount,
            ISNULL(SUM(CASE WHEN status='pending' THEN balance ELSE 0 END), 0) AS pendingBalance,
            COUNT(CASE WHEN status='approved' AND reviewed_at >= DATEADD(DAY, -30, GETUTCDATE()) THEN 1 END) AS approved30d,
            COUNT(CASE WHEN status='rejected' AND reviewed_at >= DATEADD(DAY, -30, GETUTCDATE()) THEN 1 END) AS rejected30d
          FROM WriteOffRequest
          WHERE customer_id = @cid
        `);
      return res.json(r.recordset[0]);
    } catch (e) {
      logger.error('[WriteOff] getQueueStats failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/writeoff/queue/bulk-approve */
  public bulkApprove = async (req: Request, res: Response): Promise<Response> => {
    const { ids, review_note } = req.body;
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    const actorRole = (req as any).actor?.role ?? 'manager';
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' });
    }
    try {
      let approved = 0;
      const errors: { id: number; message: string }[] = [];

      for (const id of ids) {
        const check = await this.pool.request().input('id', sql.Int, id)
          .query(`SELECT wr.*, r.approval_level FROM WriteOffRequest wr
                  LEFT JOIN WriteOffRule r ON r.id = wr.rule_id
                  WHERE wr.id = @id AND wr.status = 'pending'`);
        const pending = check.recordset[0];
        if (!pending) { errors.push({ id, message: 'Not found or not pending' }); continue; }
        if (!meetsApprovalLevel(actorRole, pending.approval_level)) {
          errors.push({ id, message: `Requires ${pending.approval_level} approval` });
          continue;
        }

        await this.pool.request()
          .input('id', sql.Int, id)
          .input('user', sql.NVarChar(255), userEmail)
          .input('note', sql.NVarChar(500), review_note ?? null)
          .query(`UPDATE WriteOffRequest SET status='approved', reviewed_by=@user, reviewed_at=GETUTCDATE(), review_note=@note, posted_at=GETUTCDATE()
                  WHERE id=@id AND status='pending'`);

        await this.pool.request()
          .input('claimId',  sql.NVarChar(50),  pending.claim_id)
          .input('ruleId',   sql.Int,           pending.rule_id ?? 0)
          .input('ruleName', sql.NVarChar(100), pending.rule_name ?? 'Manual approval')
          .input('amt',      sql.Decimal(12,2), pending.balance)
          .input('adjType',  sql.NVarChar(50),  pending.adj_type)
          .input('adjNote',  sql.NVarChar(500), `Bulk approved by ${userEmail}: ${review_note ?? ''}`)
          .input('cid',      sql.Int,           pending.customer_id)
          .query(`INSERT INTO WriteOffAuditLog (claim_id, rule_id, rule_name, adj_amt, adj_type, adj_note, customer_id)
                  VALUES (@claimId, @ruleId, @ruleName, @amt, @adjType, @adjNote, @cid)`);

        approved++;
      }

      return res.json({ approved, errors });
    } catch (e) {
      logger.error('[WriteOff] bulkApprove failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/writeoff/queue/bulk-reject */
  public bulkReject = async (req: Request, res: Response): Promise<Response> => {
    const { ids, review_note } = req.body;
    const userEmail = (req as any).actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'system';
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' });
    }
    try {
      let rejected = 0;
      for (const id of ids) {
        const result = await this.pool.request()
          .input('id', sql.Int, id)
          .input('user', sql.NVarChar(255), userEmail)
          .input('note', sql.NVarChar(500), review_note ?? null)
          .query(`UPDATE WriteOffRequest SET status='rejected', reviewed_by=@user, reviewed_at=GETUTCDATE(), review_note=@note
                  WHERE id=@id AND status='pending'`);
        if (result.rowsAffected[0] > 0) rejected++;
      }
      return res.json({ rejected });
    } catch (e) {
      logger.error('[WriteOff] bulkReject failed', { error: e });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
