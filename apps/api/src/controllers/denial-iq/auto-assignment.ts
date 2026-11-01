import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

interface RoutingRule {
  id: number;
  rule_name: string;
  priority: number;
  match_criteria: string; // JSON: { field, operator, values }
  assign_strategy: string; // 'skill_match' | 'least_loaded' | 'round_robin' | 'specific_user'
  assign_target: string | null;
}

interface MatchCriteria {
  field: string;       // 'reason_code', 'payer', 'cpt_group', etc.
  operator: string;    // 'in', 'equals', 'contains'
  values: string[];
}

interface Specialist {
  userID: number;
  FirstName: string;
  LastName: string;
}

interface UserSkill {
  user_id: number;
  skill_type: string;
  skill_value: string;
  proficiency: number;
}

export class AutoAssignmentController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * POST /denial-iq/auto-assign
   * Auto-assigns unassigned claims using WorkRoutingRules + UserSkills.
   * Falls back to least-loaded round-robin if no rules match.
   * Body: { limit?: number } - max claims to assign (default 50)
   */
  public run = async (req: Request, res: Response): Promise<Response> => {
    try {
      const limit = Math.min(req.body?.limit ?? 50, 200);
      const xenCustId = extractCustomerId(req);

      // 1. Get all active AR Specialists
      const specReq = this.pool.request();
      if (xenCustId != null) specReq.input('_custId', sql.Int, xenCustId);
      const specialistsResult = await specReq.query(`
        SELECT userID, FirstName, LastName
        FROM dbo.Users
        WHERE Role = 'AR Specialist'
          AND ISNULL(archived, 0) = 0
          AND ISNULL(disabled, 0) = 0
          ${xenCustId != null ? 'AND customer_id = @_custId' : ''}
      `);
      const specialists: Specialist[] = specialistsResult.recordset;
      if (specialists.length === 0) {
        return res.status(422).json({ message: 'No active AR specialists found' });
      }

      // 2. Get current open queue counts per specialist
      const queueReq = this.pool.request();
      if (xenCustId != null) queueReq.input('_custId2', sql.Int, xenCustId);
      const queueResult = await queueReq.query(`
        SELECT AssignedTo, COUNT(*) AS OpenCount
        FROM dbo.claimhistory
        WHERE ClaimWorkEndedTime IS NULL AND AssignedTo IS NOT NULL
          ${xenCustId != null ? 'AND customer_id = @_custId2' : ''}
        GROUP BY AssignedTo
      `);
      const queueMap = new Map<number, number>();
      for (const row of queueResult.recordset) {
        queueMap.set(row.AssignedTo, row.OpenCount);
      }

      // 3. Load active routing rules (priority ascending = highest priority first)
      const rulesReq = this.pool.request();
      if (xenCustId != null) rulesReq.input('_custId3', sql.Int, xenCustId);
      const rulesResult = await rulesReq.query(`
        SELECT id, rule_name, priority, match_criteria, assign_strategy, assign_target
        FROM dbo.WorkRoutingRules
        WHERE is_active = 1
          ${xenCustId != null ? 'AND customer_id = @_custId3' : ''}
        ORDER BY priority ASC
      `);
      const rules: RoutingRule[] = rulesResult.recordset;

      // 4. Load all user skills for AR Specialists
      const skillsReq = this.pool.request();
      if (xenCustId != null) skillsReq.input('_custId4', sql.Int, xenCustId);
      const skillsResult = await skillsReq.query(`
        SELECT us.user_id, us.skill_type, us.skill_value, us.proficiency
        FROM dbo.UserSkills us
        INNER JOIN dbo.Users u ON u.userID = us.user_id
        WHERE u.Role = 'AR Specialist'
          AND ISNULL(u.archived, 0) = 0
          AND ISNULL(u.disabled, 0) = 0
          ${xenCustId != null ? 'AND us.customer_id = @_custId4' : ''}
      `);
      const allSkills: UserSkill[] = skillsResult.recordset;

      // Build skill index: Map<userId, Map<skill_type, Set<skill_value>>>
      const skillIndex = new Map<number, Map<string, Set<string>>>();
      for (const sk of allSkills) {
        if (!skillIndex.has(sk.user_id)) skillIndex.set(sk.user_id, new Map());
        const userSkills = skillIndex.get(sk.user_id)!;
        if (!userSkills.has(sk.skill_type)) userSkills.set(sk.skill_type, new Set());
        userSkills.get(sk.skill_type)!.add(sk.skill_value.toLowerCase());
      }

      // 5. Get unassigned claims with reason code info for routing
      const unassignedReq = this.pool.request()
        .input('Limit', sql.Int, limit);
      if (xenCustId != null) unassignedReq.input('_custId5', sql.Int, xenCustId);
      const unassignedResult = await unassignedReq.query(`
          SELECT TOP (@Limit)
            c.ClaimID, c.DateOfService, c.ClaimSubmittedDate, c.ChargeAmt, c.PayerID,
            rr.ReasonCode, rr.InsuranceName
          FROM dbo.claims c
          LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
          WHERE NOT EXISTS (
            SELECT 1 FROM dbo.claimhistory ch
            WHERE ch.ClaimID = c.ClaimID AND ch.ClaimWorkEndedTime IS NULL
          )
            ${xenCustId != null ? 'AND c.customer_id = @_custId5' : ''}
          ORDER BY
            DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) DESC,
            c.ChargeAmt DESC
        `);
      const unassigned = unassignedResult.recordset;

      if (unassigned.length === 0) {
        return res.json({ message: 'No unassigned claims to distribute', count: 0 });
      }

      // 6. Generate history IDs
      const maxIdResult = await this.pool.request().query(
        `SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory ORDER BY CAST(REPLACE(ClaimHistoryId, 'CH', '') AS int) DESC`
      );
      const lastId = maxIdResult.recordset[0]?.ClaimHistoryId ?? 'CH0';
      let nextNum = parseInt(lastId.replace('CH', ''), 10) + 1;

      // 7. Assign claims using routing rules + skill matching
      let assigned = 0;
      const assignments: { claimId: string; specialistId: number; specialistName: string; strategy: string }[] = [];

      for (const claim of unassigned) {
        const target = this.resolveAssignment(claim, rules, specialists, queueMap, skillIndex);

        const histId = `CH${nextNum++}`;
        await this.pool.request()
          .input('ChId', sql.NVarChar(50), histId)
          .input('ClaimID', sql.NVarChar(50), claim.ClaimID)
          .input('AssignedTo', sql.Int, target.specialist.userID)
          .input('DOS', sql.Date, claim.DateOfService ?? null)
          .input('Submitted', sql.Date, claim.ClaimSubmittedDate ?? null)
          .input('Balance', sql.Float, claim.ChargeAmt ?? 0)
          .query(`
            INSERT INTO dbo.claimhistory
              (ClaimHistoryId, ClaimID, AssignedTo, DateOfService, ClaimSubmittedDate,
               ClaimStatus, ClaimWorkStartedTime, ClaimWorkEndedTime,
               ClaimBalanceDue, Progress, ClaimModifiedDate)
            VALUES
              (@ChId, @ClaimID, @AssignedTo, @DOS, @Submitted,
               'Assigned', NULL, NULL, @Balance, 0, CAST(GETDATE() AS date))
          `);

        // Update queue count
        queueMap.set(target.specialist.userID, (queueMap.get(target.specialist.userID) ?? 0) + 1);
        assignments.push({
          claimId: claim.ClaimID,
          specialistId: target.specialist.userID,
          specialistName: `${target.specialist.FirstName} ${target.specialist.LastName}`.trim(),
          strategy: target.strategy,
        });
        assigned++;
      }

      logger.info('AutoAssignment.run', { assigned, specialists: specialists.length, rulesApplied: rules.length });
      return res.json({
        message: `${assigned} claim(s) auto-assigned`,
        count: assigned,
        assignments,
      });
    } catch (error: unknown) {
      logger.error('AutoAssignment.run error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * Resolve which specialist should receive a claim.
   * Evaluates routing rules in priority order; first match wins.
   * Fallback: least-loaded round-robin.
   */
  private resolveAssignment(
    claim: any,
    rules: RoutingRule[],
    specialists: Specialist[],
    queueMap: Map<number, number>,
    skillIndex: Map<number, Map<string, Set<string>>>,
  ): { specialist: Specialist; strategy: string } {
    // Check each routing rule
    for (const rule of rules) {
      let criteria: MatchCriteria;
      try { criteria = JSON.parse(rule.match_criteria); } catch { continue; }

      if (!this.claimMatchesCriteria(claim, criteria)) continue;

      // Rule matched - apply assignment strategy
      switch (rule.assign_strategy) {
        case 'skill_match': {
          const matched = this.findSkillMatchedSpecialist(criteria, specialists, queueMap, skillIndex);
          if (matched) return { specialist: matched, strategy: `skill_match:${rule.rule_name}` };
          break; // No skilled specialist available - fall through to next rule
        }
        case 'least_loaded': {
          const least = this.findLeastLoaded(specialists, queueMap);
          return { specialist: least, strategy: `least_loaded:${rule.rule_name}` };
        }
        case 'specific_user': {
          if (rule.assign_target) {
            const target = specialists.find(
              s => `${s.FirstName} ${s.LastName}`.trim().toLowerCase() === rule.assign_target!.toLowerCase()
                || String(s.userID) === rule.assign_target
            );
            if (target) return { specialist: target, strategy: `specific_user:${rule.rule_name}` };
          }
          break;
        }
        case 'round_robin':
        default: {
          const rr = this.findLeastLoaded(specialists, queueMap);
          return { specialist: rr, strategy: `round_robin:${rule.rule_name}` };
        }
      }
    }

    // No rule matched - fallback to least-loaded
    return { specialist: this.findLeastLoaded(specialists, queueMap), strategy: 'fallback_least_loaded' };
  }

  /**
   * Check if a claim matches a routing rule's criteria.
   */
  private claimMatchesCriteria(claim: any, criteria: MatchCriteria): boolean {
    const fieldMap: Record<string, string> = {
      reason_code: 'ReasonCode',
      payer: 'InsuranceName',
      payer_id: 'PayerID',
    };

    const claimField = fieldMap[criteria.field] || criteria.field;
    const claimValue = String(claim[claimField] ?? '').toLowerCase();

    if (!claimValue) return false;

    const values = criteria.values.map(v => v.toLowerCase());

    switch (criteria.operator) {
      case 'in':
        return values.includes(claimValue);
      case 'equals':
        return values.length > 0 && values[0] === claimValue;
      case 'contains':
        return values.some(v => claimValue.includes(v));
      default:
        return false;
    }
  }

  /**
   * Find a specialist who has matching skills and the lowest queue count.
   */
  private findSkillMatchedSpecialist(
    criteria: MatchCriteria,
    specialists: Specialist[],
    queueMap: Map<number, number>,
    skillIndex: Map<number, Map<string, Set<string>>>,
  ): Specialist | null {
    // Skill type maps to criteria field
    const skillType = criteria.field; // e.g., 'reason_code', 'payer'
    const requiredValues = new Set(criteria.values.map(v => v.toLowerCase()));

    // Filter specialists who have at least one matching skill
    const qualified = specialists.filter(spec => {
      const userSkills = skillIndex.get(spec.userID);
      if (!userSkills) return false;
      const typeSkills = userSkills.get(skillType);
      if (!typeSkills) return false;
      // Check if any of the specialist's skills overlap with required values
      for (const val of requiredValues) {
        if (typeSkills.has(val)) return true;
      }
      return false;
    });

    if (qualified.length === 0) return null;

    // Return the qualified specialist with the lowest queue
    return this.findLeastLoaded(qualified, queueMap);
  }

  /**
   * Find the specialist with the smallest open queue.
   */
  private findLeastLoaded(specialists: Specialist[], queueMap: Map<number, number>): Specialist {
    let minCount = Infinity;
    let target = specialists[0];
    for (const spec of specialists) {
      const count = queueMap.get(spec.userID) ?? 0;
      if (count < minCount) {
        minCount = count;
        target = spec;
      }
    }
    return target;
  }
}
