import sql from 'mssql';
import logger from '../../utils/logger';

interface EvaluatorCondition {
  field: string;
  operator: string;
  value: string;
}

interface EvaluatorRule {
  ruleId: string;
  ruleName: string;
  matchType: 'any' | 'all';
  conditions: EvaluatorCondition[];
  scope: string;
  scopeValues: string[];
  customerId: number | null;
}

function parseJson<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  try { return typeof val === 'string' ? JSON.parse(val) : val; }
  catch { return fallback; }
}

function evaluateCondition(claimData: Record<string, any>, cond: EvaluatorCondition): boolean {
  const raw = claimData[cond.field];
  const target = (cond.value ?? '').trim();
  const strVal = raw == null ? '' : String(raw).trim();

  switch (cond.operator) {
    case 'Is missing':       return raw == null || strVal === '';
    case 'Is present':       return raw != null && strVal !== '';
    case 'Equals':           return strVal.toLowerCase() === target.toLowerCase();
    case 'Does not equal':   return strVal.toLowerCase() !== target.toLowerCase();
    case 'Contains':         return strVal.toLowerCase().includes(target.toLowerCase());
    case 'Does not contain': return !strVal.toLowerCase().includes(target.toLowerCase());
    default:                 return false;
  }
}

function matchesRule(claimData: Record<string, any>, rule: EvaluatorRule): boolean {
  if (!rule.conditions.length) return false;
  const results = rule.conditions.map(c => evaluateCondition(claimData, c));
  return rule.matchType === 'all' ? results.every(Boolean) : results.some(Boolean);
}

function claimMatchesScope(claimData: Record<string, any>, rule: EvaluatorRule): boolean {
  if (rule.scope === 'enterprise' || !rule.scopeValues.length) return true;

  const scopeFieldMap: Record<string, string> = {
    payer:    'payerName',
    location: 'practiceLocation',
    provider: 'providerNpi',
    practice: 'practiceLocation',
    group:    'practiceLocation',
  };

  const field = scopeFieldMap[rule.scope];
  if (!field) return true;

  const claimVal = String(claimData[field] ?? '').toLowerCase();
  return rule.scopeValues.some(sv => claimVal.includes(sv.toLowerCase()));
}

export async function runEvaluation(
  pool: sql.ConnectionPool,
  customerId?: number | null,
): Promise<{ inserted: number; skipped: number; rulesEvaluated: number }> {

  // 1. Load active, non-expired rules
  const rulesReq = pool.request();
  if (customerId != null) rulesReq.input('_custId', sql.Int, customerId);

  const rulesResult = await rulesReq.query(`
    SELECT RuleID, RuleName, MatchType, Conditions, Scope, ScopeValues, customer_id
    FROM dbo.rules
    WHERE ActiveFlag = 1
      AND RuleType = 'Custom'
      AND (ExpirationDate IS NULL OR ExpirationDate > GETDATE())
      ${customerId != null ? 'AND (customer_id = @_custId OR customer_id IS NULL)' : ''}
    ORDER BY ExecutionOrder ASC, RuleID ASC
  `);

  const rules: EvaluatorRule[] = rulesResult.recordset
    .map((r: any) => ({
      ruleId:      r.RuleID as string,
      ruleName:    r.RuleName as string,
      matchType:   ((r.MatchType as string) || 'any') as 'any' | 'all',
      conditions:  parseJson<EvaluatorCondition[]>(r.Conditions, []),
      scope:       (r.Scope as string) || 'enterprise',
      scopeValues: parseJson<string[]>(r.ScopeValues, []),
      customerId:  r.customer_id ?? null,
    }))
    .filter(r => r.conditions.length > 0);

  if (!rules.length) {
    return { inserted: 0, skipped: 0, rulesEvaluated: 0 };
  }

  // 2. Load claims with all evaluable fields (one row per claim via lateral join)
  const claimsReq = pool.request();
  if (customerId != null) claimsReq.input('_custId2', sql.Int, customerId);

  const claimsResult = await claimsReq.query(`
    SELECT
      c.ClaimID,
      c.customer_id,
      -- Patient / subscriber
      pt.firstname                                          AS patientFirstName,
      pt.lastname                                           AS patientLastName,
      ISNULL(pt.SubscriberFirstName, pt.firstname)          AS subscriberFirstName,
      ISNULL(pt.SubscriberLastName,  pt.lastname)           AS subscriberLastName,
      CONVERT(varchar(10), pt.dob, 120)                     AS patientDob,
      CONVERT(varchar(10), pt.dob, 120)                     AS subscriberDob,
      CAST(pt.Gender AS varchar(5))                         AS patientGender,
      CAST(pt.Gender AS varchar(5))                         AS subscriberGender,
      pt.address                                            AS patientAddress,
      pt.address                                            AS subscriberAddress,
      pt.city                                               AS subscriberCity,
      pt.state                                              AS patientState,
      pt.state                                              AS subscriberState,
      pt.Zip                                                AS patientZip,
      pt.Zip                                                AS subscriberZip,
      -- Insurance
      pi.MemberID                                           AS subscriberId,
      pi.GroupNumber                                        AS groupNumber,
      pt.InsurancePolicyNumber                              AS planType,
      -- Payer
      COALESCE(p.InsuranceName, p.payer)                    AS payerName,
      p.ElectronicID                                        AS payerId,
      -- Claim header
      c.ClaimID                                             AS claimControlNumber,
      c.ClaimID                                             AS patientAccountNumber,
      CAST(ISNULL(c.ChargeAmt, 0) AS varchar(20))           AS totalChargeAmount,
      COALESCE(c.ClaimStatus, ch.ClaimStatus)               AS claimStatus,
      CONVERT(varchar(10), c.DateOfService, 120)            AS lineItemDateOfService,
      CONVERT(varchar(10), c.DateOfService, 120)            AS statementFromDate,
      CONVERT(varchar(10), c.ClaimSubmittedDate, 120)       AS statementToDate,
      c.PreAuthString                                       AS priorAuthNumber,
      c.ClaimNote                                           AS claimNote,
      c.InsuranceClaimID                                    AS referralNumber,
      -- Provider (sourced from payer table NPI as proxy)
      p.NpiNum                                              AS billingProviderNpi,
      p.NpiNum                                              AS providerNpi
    FROM dbo.claims c
    LEFT JOIN dbo.patient pt   ON pt.PatientID = c.PatientID
    LEFT JOIN dbo.payer p      ON p.PayerID    = c.PayerID
    LEFT JOIN (
      SELECT PatientID, MAX(PayerID) AS PayerID, MAX(MemberID) AS MemberID, MAX(GroupNumber) AS GroupNumber
      FROM dbo.patientInsurance
      GROUP BY PatientID
    ) pi ON pi.PatientID = c.PatientID
    LEFT JOIN (
      SELECT ClaimID, ClaimStatus,
             ROW_NUMBER() OVER (PARTITION BY ClaimID ORDER BY ClaimModifiedDate DESC) AS rn
      FROM dbo.claimhistory
    ) ch ON ch.ClaimID = c.ClaimID AND ch.rn = 1
    WHERE c.ClaimID IS NOT NULL
      ${customerId != null ? 'AND c.customer_id = @_custId2' : ''}
  `);

  if (!claimsResult.recordset.length) {
    return { inserted: 0, skipped: 0, rulesEvaluated: rules.length };
  }

  // 3. Evaluate each claim against each rule; insert matches
  let inserted = 0;
  let skipped = 0;

  for (const claim of claimsResult.recordset) {
    const claimData: Record<string, any> = { ...claim };
    const effectiveCustId: number | null = claim.customer_id ?? customerId ?? null;

    for (const rule of rules) {
      if (rule.customerId != null && effectiveCustId != null && rule.customerId !== effectiveCustId) {
        continue;
      }
      if (!claimMatchesScope(claimData, rule) || !matchesRule(claimData, rule)) continue;

      try {
        const ins = pool.request()
          .input('ClaimID', sql.NVarChar(50), claim.ClaimID)
          .input('RuleID',  sql.NVarChar(50), rule.ruleId)
          .input('CustId',  sql.Int,          effectiveCustId);

        const result = await ins.query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.rejectedclaims
            WHERE ClaimID = @ClaimID AND RuleID = @RuleID
              AND ((@CustId IS NULL AND customer_id IS NULL) OR customer_id = @CustId)
          )
          BEGIN
            INSERT INTO dbo.rejectedclaims
              (RejectedClaimID, ClaimID, RuleID, customer_id, CreateDate, Status)
            VALUES
              (LEFT(REPLACE(CONVERT(varchar(36), NEWID()), '-', ''), 20),
               @ClaimID, @RuleID, @CustId, GETDATE(), 'Not complete')
          END
        `);

        if (result.rowsAffected[0] > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        if (e?.number !== 2601 && e?.number !== 2627) {
          logger.warn(`[ClaimVision] Insert failed ${claim.ClaimID}/${rule.ruleId}: ${e?.message}`);
        } else {
          skipped++;
        }
      }
    }
  }

  logger.info(`[ClaimVision] Evaluation complete \u2014 ${rules.length} rules, ${inserted} new rejections, ${skipped} already logged`);
  return { inserted, skipped, rulesEvaluated: rules.length };
}
