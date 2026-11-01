import express, { Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

const router = express.Router();
const db = Database.getInstance();

function getCustId(req: Request): number {
  return (req as any).actor?.customer_id ?? 0;
}

// -- Rule catalogue (severity / description never change; enabled = default) --
const RULE_CATALOGUE = [
  { id: 'HIPAA-001', category: 'HIPAA',   name: 'Patient Identifier Present',     description: 'Claim must include a valid patient identifier (PatientID).',                                severity: 'critical', defaultEnabled: true  },
  { id: 'HIPAA-002', category: 'HIPAA',   name: 'Provider NPI Number Present',    description: 'Rendering/billing provider NPI must be a 10-digit number.',                                 severity: 'critical', defaultEnabled: true  },
  { id: 'HIPAA-003', category: 'HIPAA',   name: 'Payer ID Valid',                 description: 'PayerID must resolve to a known payer in the payer master.',                                 severity: 'warning',  defaultEnabled: true  },
  { id: 'CODE-002',  category: 'Coding',  name: 'CPT Code Present',               description: 'At least one service line with a valid CPT/HCPCS code must exist for the claim.',           severity: 'critical', defaultEnabled: true  },
  { id: 'BILL-001',  category: 'Billing', name: 'Timely Filing Limit',            description: 'Claim must be submitted within the payer timely-filing window (default 180 days from DOS).', severity: 'critical', defaultEnabled: true  },
  { id: 'BILL-002',  category: 'Billing', name: 'Prior Authorization Documented', description: 'An authorization number should be on file if the service may require prior auth.',           severity: 'warning',  defaultEnabled: true  },
  { id: 'BILL-003',  category: 'Billing', name: 'Duplicate Claim Check',          description: 'No other claim for the same patient, payer, and date of service should exist.',             severity: 'critical', defaultEnabled: true  },
  { id: 'BILL-005',  category: 'Billing', name: 'Charge Amount Present',          description: 'Billed charge amount must be greater than zero.',                                            severity: 'warning',  defaultEnabled: true  },
  { id: 'BILL-006',  category: 'Billing', name: 'Coordination of Benefits',       description: 'When secondary insurance exists, COB information should be verified.',                       severity: 'warning',  defaultEnabled: false },
];

interface RuleResult {
  ruleId: string; ruleName: string; category: string;
  status: 'pass' | 'warning' | 'fail'; message: string;
}
interface AuditResult {
  claimId: string; checkedAt: string; score: string;
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: { total: number; passed: number; warnings: number; failures: number };
  ruleResults: RuleResult[];
}

// -- Per-customer rule state (stored in AppConfig as JSON) ---------------------
async function loadRuleStates(custId: number): Promise<Record<string, boolean>> {
  const defaults: Record<string, boolean> = {};
  RULE_CATALOGUE.forEach(r => { defaults[r.id] = r.defaultEnabled; });
  try {
    const res = await db.getPool().request()
      .input('custId', sql.Int, custId)
      .query(`SELECT value FROM dbo.AppConfig WHERE customer_id = @custId AND [key] = 'compliance_rule_states'`);
    if (res.recordset.length) {
      const stored: Record<string, boolean> = JSON.parse(res.recordset[0].value);
      return { ...defaults, ...stored };
    }
  } catch {}
  return defaults;
}

async function saveRuleStates(custId: number, states: Record<string, boolean>): Promise<void> {
  await db.getPool().request()
    .input('custId',  sql.Int,               custId)
    .input('val',     sql.NVarChar(sql.MAX),  JSON.stringify(states))
    .query(`
      MERGE dbo.AppConfig AS t
      USING (SELECT @custId AS customer_id, N'compliance_rule_states' AS [key], @val AS value) AS s
        ON  t.customer_id = s.customer_id AND t.[key] = s.[key]
      WHEN MATCHED     THEN UPDATE SET t.value = s.value, t.updated_at = GETUTCDATE()
      WHEN NOT MATCHED THEN INSERT (customer_id, [key], value) VALUES (s.customer_id, s.[key], s.value);
    `);
}

// -- Core compliance check (respects per-customer rule state) ------------------
async function runChecks(claimId: string, custId: number, ruleStates?: Record<string, boolean>): Promise<AuditResult> {
  const pool    = db.getPool();
  const enabled = ruleStates ?? await loadRuleStates(custId);

  // Core claim row
  const coreRes = await pool.request()
    .input('cid',    sql.NVarChar(50), claimId)
    .input('custId', sql.Int,          custId)
    .query(`
      SELECT c.ClaimID, c.PatientID, c.PayerID, c.ProviderID,
             c.DateOfService, c.ClaimSubmittedDate, c.PreAuthString, c.ChargeAmt,
             pr.NPI           AS ProviderNPI,
             pay.InsuranceName
      FROM   dbo.claims c
      LEFT JOIN dbo.provider pr  ON pr.ProviderID = c.ProviderID
      LEFT JOIN dbo.payer    pay ON pay.PayerID    = c.PayerID
      WHERE  c.ClaimID = @cid AND c.customer_id = @custId
    `);

  if (!coreRes.recordset.length) throw new Error(`Claim ${claimId} not found.`);
  const c = coreRes.recordset[0];

  // Parallel secondary lookups (only fetch what's needed)
  const [slRes, authRes, dupRes, deadlineRes, cobRes] = await Promise.all([
    pool.request()
      .input('cid', sql.NVarChar(50), claimId)
      .query(`SELECT CPT, ContractedRate FROM dbo.serviceline WHERE ClaimID = @cid`),

    pool.request()
      .input('cid', sql.NVarChar(50), claimId)
      .query(`SELECT TOP 1 AuthorizationId FROM dbo.claimhistory WHERE ClaimID = @cid ORDER BY ClaimHistoryId DESC`),

    pool.request()
      .input('patId',  sql.NVarChar(50), c.PatientID)
      .input('payId',  sql.Int,          c.PayerID)
      .input('dos',    sql.NVarChar(20), c.DateOfService ? new Date(c.DateOfService).toISOString().slice(0, 10) : '')
      .input('cid',    sql.NVarChar(50), claimId)
      .input('custId', sql.Int,          custId)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM   dbo.claims
        WHERE  PatientID = @patId AND PayerID = @payId
          AND  CONVERT(date, DateOfService) = CONVERT(date, @dos)
          AND  ClaimID != @cid AND customer_id = @custId
      `),

    c.InsuranceName
      ? pool.request()
          .input('payer', sql.NVarChar(255), c.InsuranceName)
          .query(`
            SELECT TOP 1 deadline_days
            FROM   dbo.PayerFilingDeadlines
            WHERE  payer_name LIKE '%' + @payer + '%' OR @payer LIKE '%' + payer_name + '%'
          `)
      : Promise.resolve({ recordset: [] }),

    pool.request()
      .input('patId', sql.NVarChar(50), c.PatientID)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM   dbo.patientInsurance
        WHERE  PatientID = @patId
          AND  Priority IN ('Secondary','Tertiary')
          AND  (TermDate IS NULL OR TermDate > GETDATE())
      `),
  ]);

  const serviceLines = slRes.recordset;
  const authId       = (authRes.recordset[0]?.AuthorizationId ?? '').trim();
  const dupCount     = dupRes.recordset[0]?.cnt ?? 0;
  const deadlineDays = deadlineRes.recordset[0]?.deadline_days ?? 180;
  const hasSecondary = (cobRes.recordset[0]?.cnt ?? 0) > 0;

  const results: RuleResult[] = [];

  if (enabled['HIPAA-001']) {
    results.push({
      ruleId: 'HIPAA-001', ruleName: 'Patient Identifier Present', category: 'HIPAA',
      status:  c.PatientID ? 'pass' : 'fail',
      message: c.PatientID ? `Patient ID ${c.PatientID} is present.` : 'Patient identifier is missing.',
    });
  }

  if (enabled['HIPAA-002']) {
    const npi = (c.ProviderNPI ?? '').trim();
    const npiValid = /^\d{10}$/.test(npi);
    results.push({
      ruleId: 'HIPAA-002', ruleName: 'Provider NPI Number Present', category: 'HIPAA',
      status:  npiValid ? 'pass' : (npi.length ? 'warning' : 'fail'),
      message: npiValid
        ? `Provider NPI ${npi} is valid.`
        : npi.length ? `NPI "${npi}" does not match the required 10-digit format.` : 'Provider NPI is not populated.',
    });
  }

  if (enabled['HIPAA-003']) {
    results.push({
      ruleId: 'HIPAA-003', ruleName: 'Payer ID Valid', category: 'HIPAA',
      status:  c.InsuranceName ? 'pass' : 'warning',
      message: c.InsuranceName
        ? `Payer "${c.InsuranceName}" found in payer master.`
        : `PayerID ${c.PayerID ?? '(none)'} does not resolve to a known payer.`,
    });
  }

  if (enabled['CODE-002']) {
    const cptLines = serviceLines.filter((sl: any) => (sl.CPT ?? '').trim());
    results.push({
      ruleId: 'CODE-002', ruleName: 'CPT Code Present', category: 'Coding',
      status:  cptLines.length ? 'pass' : 'fail',
      message: cptLines.length
        ? `${cptLines.length} service line(s) with CPT codes: ${cptLines.map((sl: any) => sl.CPT).join(', ')}.`
        : 'No service lines with CPT codes found for this claim.',
    });
  }

  if (enabled['BILL-001']) {
    let status: 'pass' | 'warning' | 'fail' = 'warning';
    let message = 'Submission date or date of service is missing \u2014 cannot verify timely filing.';
    if (c.ClaimSubmittedDate && c.DateOfService) {
      const days = Math.floor(
        (new Date(c.ClaimSubmittedDate).getTime() - new Date(c.DateOfService).getTime()) / 86_400_000,
      );
      const payerLabel = c.InsuranceName ?? 'payer';
      if (days > deadlineDays) {
        status  = 'fail';
        message = `Filed ${days} days after DOS \u2014 exceeds the ${payerLabel} ${deadlineDays}-day limit.`;
      } else if (days > deadlineDays - 30) {
        status  = 'warning';
        message = `Filed ${days} days after DOS \u2014 within 30 days of the ${deadlineDays}-day deadline.`;
      } else {
        status  = 'pass';
        message = `Filed ${days} days after DOS \u2014 within the ${deadlineDays}-day window.`;
      }
    }
    results.push({ ruleId: 'BILL-001', ruleName: 'Timely Filing Limit', category: 'Billing', status, message });
  }

  if (enabled['BILL-002']) {
    const authVal = (c.PreAuthString ?? '').trim() || authId;
    results.push({
      ruleId: 'BILL-002', ruleName: 'Prior Authorization Documented', category: 'Billing',
      status:  authVal ? 'pass' : 'warning',
      message: authVal
        ? `Authorization on file: ${authVal}.`
        : 'No authorization number found \u2014 verify whether prior auth is required for this service.',
    });
  }

  if (enabled['BILL-003']) {
    results.push({
      ruleId: 'BILL-003', ruleName: 'Duplicate Claim Check', category: 'Billing',
      status:  dupCount > 0 ? 'fail' : 'pass',
      message: dupCount > 0
        ? `${dupCount} potential duplicate claim(s) found for this patient/payer/DOS.`
        : 'No duplicate claims detected.',
    });
  }

  if (enabled['BILL-005']) {
    const chargeAmt = Number(c.ChargeAmt ?? 0);
    results.push({
      ruleId: 'BILL-005', ruleName: 'Charge Amount Present', category: 'Billing',
      status:  chargeAmt > 0 ? 'pass' : 'fail',
      message: chargeAmt > 0 ? `Billed amount: $${chargeAmt.toFixed(2)}.` : 'Billed charge amount is zero.',
    });
  }

  if (enabled['BILL-006']) {
    results.push({
      ruleId: 'BILL-006', ruleName: 'Coordination of Benefits', category: 'Billing',
      status:  hasSecondary ? 'warning' : 'pass',
      message: hasSecondary
        ? 'Patient has active secondary insurance \u2014 verify COB information is correctly populated.'
        : 'No active secondary insurance found for this patient.',
    });
  }

  const failures = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const passed   = results.filter(r => r.status === 'pass').length;
  const total    = results.length;

  return {
    claimId,
    checkedAt:     new Date().toISOString(),
    score:         `${total > 0 ? Math.round((passed / total) * 10) : 0}/10`,
    overallStatus: failures > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass',
    summary:       { total, passed, warnings, failures },
    ruleResults:   results,
  };
}

// -- Routes --------------------------------------------------------------------

/** GET /rules - rule catalogue with per-customer enabled state */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const states = await loadRuleStates(getCustId(req));
    const rules = RULE_CATALOGUE.map(r => ({ ...r, enabled: states[r.id] ?? r.defaultEnabled }));
    res.json({ rules });
  } catch (err: any) {
    console.error('[compliance-checker] GET /rules', err);
    res.status(500).json({ message: 'Failed to load compliance rules' });
  }
});

/** PUT /rules/:ruleId - toggle enabled state for one rule */
router.put('/rules/:ruleId', async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') return res.status(400).json({ message: 'enabled (boolean) is required' });

  const rule = RULE_CATALOGUE.find(r => r.id === ruleId);
  if (!rule) return res.status(404).json({ message: `Unknown rule: ${ruleId}` });

  const cid = getCustId(req);
  try {
    const states = await loadRuleStates(cid);
    states[ruleId] = enabled;
    await saveRuleStates(cid, states);
    res.status(204).end();
  } catch (err: any) {
    console.error('[compliance-checker] PUT /rules/:ruleId', err);
    res.status(500).json({ message: 'Failed to update rule state' });
  }
});

/** GET /claims - paginated claim list (no pre-computed scores) */
router.get('/claims', async (req: Request, res: Response) => {
  const cid      = getCustId(req);
  const page     = Math.max(1, parseInt(String(req.query['page']     ?? '1'),  10));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query['pageSize'] ?? '50'), 10)));
  const offset   = (page - 1) * pageSize;

  try {
    const pool = db.getPool();
    const [listRes, countRes] = await Promise.all([
      pool.request()
        .input('custId',   sql.Int, cid)
        .input('offset',   sql.Int, offset)
        .input('pageSize', sql.Int, pageSize)
        .query(`
          SELECT c.ClaimID,
                 ISNULL(p.FirstName + ' ' + p.LastName, 'Unknown') AS PatientName,
                 CONVERT(varchar(10), c.ClaimSubmittedDate, 23)    AS SubmitDate
          FROM   dbo.claims c
          LEFT JOIN dbo.patient p ON p.PatientID = c.PatientID
          WHERE  c.customer_id = @custId AND c.ClaimSubmittedDate IS NOT NULL
          ORDER  BY c.ClaimSubmittedDate DESC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `),
      pool.request()
        .input('custId', sql.Int, cid)
        .query(`SELECT COUNT(*) AS total FROM dbo.claims WHERE customer_id = @custId AND ClaimSubmittedDate IS NOT NULL`),
    ]);

    res.json({
      claims: listRes.recordset.map((r: any) => ({
        claimId:    r.ClaimID,
        patient:    r.PatientName,
        submitDate: r.SubmitDate,
      })),
      total: countRes.recordset[0]?.total ?? 0,
      page,
      pageSize,
    });
  } catch (err: any) {
    console.error('[compliance-checker] GET /claims', err);
    res.status(500).json({ message: 'Failed to load claims' });
  }
});

/** GET /claims/:claimId/check - run compliance check on one claim */
router.get('/claims/:claimId/check', async (req: Request, res: Response) => {
  const cid = getCustId(req);
  try {
    const result = await runChecks(req.params['claimId'], cid);
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
});

/** POST /batch-check - run compliance checks on multiple claims */
router.post('/batch-check', async (req: Request, res: Response) => {
  const { claimIds } = req.body as { claimIds?: string[] };
  if (!Array.isArray(claimIds) || !claimIds.length)
    return res.status(400).json({ error: 'claimIds array is required' });
  if (claimIds.length > 100)
    return res.status(400).json({ error: 'Maximum 100 claims per batch' });
  if (!claimIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 50))
    return res.status(400).json({ error: 'Each claimId must be a non-empty string up to 50 characters' });

  const cid = getCustId(req);
  try {
    // Load rule states once and reuse across all checks in this batch
    const ruleStates = await loadRuleStates(cid);
    const results = await Promise.all(
      claimIds.map(id =>
        runChecks(String(id), cid, ruleStates).catch(err => ({
          claimId: id, checkedAt: new Date().toISOString(), score: '0/10',
          overallStatus: 'fail' as const,
          summary: { total: 1, passed: 0, warnings: 0, failures: 1 },
          ruleResults: [{ ruleId: 'SYS', ruleName: 'Claim Lookup', category: 'System', status: 'fail' as const, message: err.message }],
        })),
      ),
    );
    const totals = results.reduce(
      (acc, r) => { acc.total++; if (r.overallStatus === 'pass') acc.passed++; else if (r.overallStatus === 'warning') acc.warnings++; else acc.failures++; return acc; },
      { total: 0, passed: 0, warnings: 0, failures: 0 },
    );
    res.json({ summary: totals, results });
  } catch (err: any) {
    console.error('[compliance-checker] POST /batch-check', err);
    res.status(500).json({ message: 'Batch compliance check failed' });
  }
});

export default router;
