import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

interface WorkflowRule {
  id: number;
  name: string;
  description: string;
  matchType: 'all' | 'any';
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
  priority: number;
}

interface WorkflowCondition {
  field: string;     // 'agingDays' | 'payerName' | 'reasonCode' | 'chargeAmount' | 'claimStatus'
  operator: string;  // '>' | '<' | '=' | 'contains' | '!='
  value: string;
}

interface WorkflowAction {
  actionType: string; // 'auto-escalate' | 'auto-assign' | 'set-priority' | 'add-note'
  params: Record<string, any>;
}

export class WorkflowRulesController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /denial-iq/workflow-rules
   * Returns all workflow rules
   */
  public list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(req);
      const listReq = this.pool.request();
      if (xenCustId != null) listReq.input('_custId', sql.Int, xenCustId);
      const result = await listReq.query(`
        SELECT id, name, description, match_type, conditions, actions,
               is_active, priority, created_at, updated_at
        FROM dbo.WorkflowRules
        ${xenCustId != null ? 'WHERE customer_id = @_custId' : ''}
        ORDER BY priority ASC, name
      `);

      const rules = result.recordset.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        matchType: r.match_type || 'all',
        conditions: this.parseJson(r.conditions, []),
        actions: this.parseJson(r.actions, []),
        isActive: !!r.is_active,
        priority: r.priority ?? 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return res.json({ message: 'Workflow rules', data: rules });
    } catch (error: unknown) {
      logger.error('WorkflowRules.list error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/workflow-rules
   * Creates a new workflow rule
   */
  public create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { name, description, matchType, conditions, actions, priority } = req.body;
      if (!name) return res.status(400).json({ message: 'Name is required' });

      const xenCustId = extractCustomerId(req);
      const createReq = this.pool.request()
        .input('name', sql.NVarChar(255), name)
        .input('description', sql.NVarChar(sql.MAX), description || '')
        .input('matchType', sql.NVarChar(10), matchType || 'all')
        .input('conditions', sql.NVarChar(sql.MAX), JSON.stringify(conditions || []))
        .input('actions', sql.NVarChar(sql.MAX), JSON.stringify(actions || []))
        .input('priority', sql.Int, priority ?? 0)
        .input('_custId', sql.Int, xenCustId);
      const result = await createReq.query(`
          INSERT INTO dbo.WorkflowRules
            (name, description, match_type, conditions, actions, is_active, priority, created_at, updated_at, customer_id)
          OUTPUT INSERTED.id
          VALUES (@name, @description, @matchType, @conditions, @actions, 1, @priority, GETDATE(), GETDATE(), @_custId)
        `);

      return res.status(201).json({ message: 'Rule created', data: { id: result.recordset[0].id } });
    } catch (error: unknown) {
      logger.error('WorkflowRules.create error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * PUT /denial-iq/workflow-rules/:id
   * Updates a workflow rule
   */
  public update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const { name, description, matchType, conditions, actions, isActive, priority } = req.body;
      const xenCustId = extractCustomerId(req);

      const updReq = this.pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('name', sql.NVarChar(255), name)
        .input('description', sql.NVarChar(sql.MAX), description || '')
        .input('matchType', sql.NVarChar(10), matchType || 'all')
        .input('conditions', sql.NVarChar(sql.MAX), JSON.stringify(conditions || []))
        .input('actions', sql.NVarChar(sql.MAX), JSON.stringify(actions || []))
        .input('isActive', sql.Bit, isActive ? 1 : 0)
        .input('priority', sql.Int, priority ?? 0);
      if (xenCustId != null) updReq.input('_custId', sql.Int, xenCustId);
      await updReq.query(`
          UPDATE dbo.WorkflowRules
          SET name = @name, description = @description, match_type = @matchType,
              conditions = @conditions, actions = @actions, is_active = @isActive,
              priority = @priority, updated_at = GETDATE()
          WHERE id = @id${xenCustId != null ? ' AND customer_id = @_custId' : ''}
        `);

      return res.json({ message: 'Rule updated' });
    } catch (error: unknown) {
      logger.error('WorkflowRules.update error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * DELETE /denial-iq/workflow-rules/:id
   */
  public delete = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const xenCustId = extractCustomerId(req);
      const delReq = this.pool.request()
        .input('id', sql.Int, parseInt(id));
      if (xenCustId != null) delReq.input('_custId', sql.Int, xenCustId);
      await delReq.query(`DELETE FROM dbo.WorkflowRules WHERE id = @id${xenCustId != null ? ' AND customer_id = @_custId' : ''}`);

      return res.json({ message: 'Rule deleted' });
    } catch (error: unknown) {
      logger.error('WorkflowRules.delete error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * POST /denial-iq/workflow-rules/evaluate
   * Runs all active workflow rules against current claims and executes matching actions.
   */
  public evaluate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(req);

      // 1. Load active rules
      const rulesReq = this.pool.request();
      if (xenCustId != null) rulesReq.input('_custId', sql.Int, xenCustId);
      const rulesResult = await rulesReq.query(`
        SELECT id, name, match_type, conditions, actions, priority
        FROM dbo.WorkflowRules
        WHERE is_active = 1${xenCustId != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY priority ASC
      `);
      const rules: WorkflowRule[] = rulesResult.recordset.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: '',
        matchType: r.match_type || 'all',
        conditions: this.parseJson(r.conditions, []),
        actions: this.parseJson(r.actions, []),
        isActive: true,
        priority: r.priority ?? 0,
      }));

      if (rules.length === 0) {
        return res.json({ message: 'No active workflow rules', actionsExecuted: 0 });
      }

      // 2. Load open claims with metadata
      const claimsReq = this.pool.request();
      if (xenCustId != null) claimsReq.input('_custId2', sql.Int, xenCustId);
      const claimsResult = await claimsReq.query(`
        SELECT
          c.ClaimID,
          DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) AS AgingDays,
          c.ChargeAmt,
          p.PayerName,
          ch.ClaimStatus,
          ch.CarcCode,
          ch.AssignedTo
        FROM dbo.claims c
        LEFT JOIN (
          SELECT ClaimID, ClaimStatus, CarcCode, AssignedTo,
                 ROW_NUMBER() OVER (PARTITION BY ClaimID ORDER BY ClaimModifiedDate DESC) AS rn
          FROM dbo.claimhistory
        ) ch ON c.ClaimID = ch.ClaimID AND ch.rn = 1
        LEFT JOIN dbo.Payers p ON c.PayerID = p.PayerID
        WHERE (ch.ClaimWorkEndedTime IS NULL OR ch.ClaimID IS NULL)${xenCustId != null ? ' AND c.customer_id = @_custId2' : ''}
      `);

      let actionsExecuted = 0;
      const results: any[] = [];

      for (const claim of claimsResult.recordset) {
        for (const rule of rules) {
          if (this.matchesRule(claim, rule)) {
            for (const action of rule.actions) {
              await this.executeAction(claim, action, rule);
              actionsExecuted++;
            }
            results.push({ claimId: claim.ClaimID, ruleName: rule.name });
          }
        }
      }

      logger.info('WorkflowRules.evaluate', { rulesEvaluated: rules.length, actionsExecuted });
      return res.json({ message: `${actionsExecuted} action(s) executed`, actionsExecuted, results });
    } catch (error: unknown) {
      logger.error('WorkflowRules.evaluate error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  private matchesRule(claim: any, rule: WorkflowRule): boolean {
    const checks = rule.conditions.map(cond => this.evaluateCondition(claim, cond));
    return rule.matchType === 'all' ? checks.every(Boolean) : checks.some(Boolean);
  }

  private evaluateCondition(claim: any, cond: WorkflowCondition): boolean {
    const fieldMap: Record<string, any> = {
      agingDays: claim.AgingDays,
      payerName: claim.PayerName,
      reasonCode: claim.CarcCode,
      chargeAmount: claim.ChargeAmt,
      claimStatus: claim.ClaimStatus,
    };

    const actual = fieldMap[cond.field];
    if (actual == null) return false;

    const target = cond.value;
    switch (cond.operator) {
      case '>': return Number(actual) > Number(target);
      case '<': return Number(actual) < Number(target);
      case '>=': return Number(actual) >= Number(target);
      case '<=': return Number(actual) <= Number(target);
      case '=':
      case 'equals': return String(actual).toLowerCase() === String(target).toLowerCase();
      case '!=': return String(actual).toLowerCase() !== String(target).toLowerCase();
      case 'contains': return String(actual).toLowerCase().includes(String(target).toLowerCase());
      default: return false;
    }
  }

  private async executeAction(claim: any, action: WorkflowAction, rule: WorkflowRule): Promise<void> {
    switch (action.actionType) {
      case 'auto-escalate': {
        // Find manager and create escalation
        const mgrResult = await this.pool.request().query(`
          SELECT TOP 1 userID FROM dbo.Users
          WHERE Role = 'Manager' AND ISNULL(archived, 0) = 0 AND ISNULL(disabled, 0) = 0
          ORDER BY userID
        `);
        const managerId = mgrResult.recordset[0]?.userID;
        if (!managerId) break;

        // Close current assignment
        await this.pool.request()
          .input('ClaimID', sql.NVarChar(50), claim.ClaimID)
          .query(`
            UPDATE dbo.claimhistory
            SET ClaimWorkEndedTime = GETDATE(), ClaimStatus = 'Auto-Escalated'
            WHERE ClaimID = @ClaimID AND ClaimWorkEndedTime IS NULL
          `);

        // Create new assignment to manager
        const maxIdResult = await this.pool.request().query(
          `SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory ORDER BY CAST(REPLACE(ClaimHistoryId, 'CH', '') AS int) DESC`
        );
        const lastId = maxIdResult.recordset[0]?.ClaimHistoryId ?? 'CH0';
        const nextNum = parseInt(lastId.replace('CH', ''), 10) + 1;

        await this.pool.request()
          .input('ChId', sql.NVarChar(50), `CH${nextNum}`)
          .input('ClaimID', sql.NVarChar(50), claim.ClaimID)
          .input('ManagerID', sql.Int, managerId)
          .input('Balance', sql.Float, claim.ChargeAmt ?? 0)
          .query(`
            INSERT INTO dbo.claimhistory
              (ClaimHistoryId, ClaimID, AssignedTo, ClaimStatus, ClaimBalanceDue, Progress, ClaimModifiedDate)
            VALUES (@ChId, @ClaimID, @ManagerID, 'Escalated', @Balance, 0, CAST(GETDATE() AS date))
          `);

        // Add note
        await this.pool.request()
          .input('CID', sql.NVarChar(50), claim.ClaimID)
          .input('NoteText', sql.NVarChar(sql.MAX), `Auto-escalated by workflow rule: ${rule.name}`)
          .query(`
            INSERT INTO dbo.ClaimStepNote (claim_id, step_id, author_user_id, note_text, note_type, created_at)
            VALUES (@CID, NULL, 'system', @NoteText, 'escalation', GETDATE())
          `);
        break;
      }
      case 'add-note': {
        const noteText = action.params?.message || `Workflow rule triggered: ${rule.name}`;
        await this.pool.request()
          .input('CID', sql.NVarChar(50), claim.ClaimID)
          .input('NoteText', sql.NVarChar(sql.MAX), noteText)
          .query(`
            INSERT INTO dbo.ClaimStepNote (claim_id, step_id, author_user_id, note_text, note_type, created_at)
            VALUES (@CID, NULL, 'system', @NoteText, 'workflow', GETDATE())
          `);
        break;
      }
      default:
        logger.warn(`WorkflowRules: unknown action type "${action.actionType}"`);
    }
  }

  private parseJson(val: any, fallback: any): any {
    if (!val) return fallback;
    try { return typeof val === 'string' ? JSON.parse(val) : val; }
    catch { return fallback; }
  }
}
