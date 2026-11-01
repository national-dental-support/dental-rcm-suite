/**
 * Claim Scrubber Agent - pre-submission denial risk assessment.
 *
 * Runs 7 parallel checks against historical denial data, then optionally
 * calls Ollama for medium+ risk claims to generate additional insights.
 * Ported from the practice-management system/server/src/modules/clinical/claim-scrubber.ts
 * and adapted for the RCM database schema.
 */
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';
import { ollama } from '../ollama';

export interface ScrubRequest {
  claimId: string;
  patientId?: number;
  procedureCodes: string[];
  payerName?: string;
  providerId?: number;
  chargeAmount: number;
  dateOfService: string;
  coverageType?: 'P' | 'S' | 'T';
}

export interface ScrubFinding {
  severity: 'block' | 'high' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  carcCode?: string;
  confidence: number;
}

export interface ScrubResult {
  riskScore: number;
  riskTier: 'low' | 'medium' | 'high' | 'critical';
  findings: ScrubFinding[];
  estimatedDenialProbability: number;
  suggestedActions: string[];
  aiInsight?: string;
}

async function queryRate(pool: sql.ConnectionPool, query: string, inputs: Record<string, any>): Promise<{ total: number; denied: number }> {
  try {
    const req = pool.request();
    for (const [k, v] of Object.entries(inputs)) req.input(k, sql.NVarChar, String(v));
    const r = await req.query(query);
    return r.recordset[0] ?? { total: 0, denied: 0 };
  } catch { return { total: 0, denied: 0 }; }
}

export async function scrubClaim(request: ScrubRequest, customerId: number): Promise<ScrubResult> {
  const pool = Database.getInstance().getPool();
  const findings: ScrubFinding[] = [];
  let riskScore = 0;

  // Run 7 checks in parallel
  const [payerStats, procStats, provStats, timelyFiling, duplicates, annualMax] = await Promise.allSettled([
    // 1. Payer denial rate
    queryRate(pool, `
      SELECT COUNT(*) AS total, SUM(CASE WHEN IsClaimDenied = 1 THEN 1 ELSE 0 END) AS denied
      FROM dbo.recon_report WHERE InsuranceName = @payer AND customer_id = @custId
      AND DateOfService >= DATEADD(MONTH, -12, GETDATE())
    `, { payer: request.payerName || '', custId: String(customerId) }),

    // 2. Procedure denial rate
    queryRate(pool, `
      SELECT COUNT(*) AS total, SUM(CASE WHEN IsClaimDenied = 1 THEN 1 ELSE 0 END) AS denied
      FROM dbo.recon_report WHERE CPTCode IN (${request.procedureCodes.map((_, i) => `@pc${i}`).join(',')})
      AND customer_id = @custId AND DateOfService >= DATEADD(MONTH, -12, GETDATE())
    `, { ...Object.fromEntries(request.procedureCodes.map((c, i) => [`pc${i}`, c])), custId: String(customerId) }),

    // 3. Provider denial rate
    request.providerId ? queryRate(pool, `
      SELECT COUNT(*) AS total, SUM(CASE WHEN IsClaimDenied = 1 THEN 1 ELSE 0 END) AS denied
      FROM dbo.recon_report WHERE ProviderName IN (
        SELECT LName + ', ' + FName FROM dbo.Provider WHERE ProviderID = @provId
      ) AND customer_id = @custId AND DateOfService >= DATEADD(MONTH, -12, GETDATE())
    `, { provId: String(request.providerId), custId: String(customerId) }) : Promise.resolve({ total: 0, denied: 0 }),

    // 4. Timely filing check
    (async () => {
      let deadline = 365;
      if (request.payerName) {
        try {
          const r = await pool.request()
            .input('payer', sql.NVarChar, request.payerName)
            .input('custId', sql.Int, customerId)
            .query(`SELECT TOP 1 filing_deadline FROM dbo.PayerFilingDeadlines WHERE payer_name LIKE '%' + @payer + '%' AND customer_id = @custId`);
          deadline = r.recordset[0]?.filing_deadline ?? 365;
        } catch { /* default */ }
      }
      const daysSince = Math.floor((Date.now() - new Date(request.dateOfService).getTime()) / 86400000);
      return { isLate: daysSince > deadline, daysRemaining: deadline - daysSince, daysSince, deadline };
    })(),

    // 5. Duplicate detection
    (async () => {
      if (!request.patientId) return { found: false };
      try {
        const r = await pool.request()
          .input('pid', sql.Int, request.patientId)
          .input('dos', sql.NVarChar, request.dateOfService)
          .input('custId', sql.Int, customerId)
          .input('claimId', sql.NVarChar(50), request.claimId)
          .query(`SELECT TOP 1 ClaimID FROM dbo.claims WHERE PatientID = @pid AND CAST(DateOfService AS DATE) = @dos AND customer_id = @custId AND ClaimID != @claimId`);
        return { found: r.recordset.length > 0, claimId: r.recordset[0]?.ClaimID };
      } catch { return { found: false }; }
    })(),

    // 6. Annual max check
    (async () => {
      if (!request.patientId) return { exceedsMax: false, remaining: 0, annualMax: 0 };
      try {
        const r = await pool.request()
          .input('pid', sql.Int, request.patientId)
          .input('custId', sql.Int, customerId)
          .query(`
            SELECT ISNULL(SUM(ChargeAmt), 0) AS ytdCharges
            FROM dbo.claims WHERE PatientID = @pid AND customer_id = @custId
            AND YEAR(DateOfService) = YEAR(GETDATE())
          `);
        const ytd = r.recordset[0]?.ytdCharges ?? 0;
        const annualMax = 2000; // typical dental max - could be from InsPlan
        return { exceedsMax: ytd + request.chargeAmount > annualMax, remaining: Math.max(0, annualMax - ytd), annualMax };
      } catch { return { exceedsMax: false, remaining: 0, annualMax: 0 }; }
    })(),
  ]);

  // Process results
  const payer = payerStats.status === 'fulfilled' ? payerStats.value : { total: 0, denied: 0 };
  const proc = procStats.status === 'fulfilled' ? procStats.value : { total: 0, denied: 0 };
  const prov = provStats.status === 'fulfilled' ? provStats.value : { total: 0, denied: 0 };

  const payerRate = payer.total > 0 ? payer.denied / payer.total : 0;
  const procRate = proc.total > 0 ? proc.denied / proc.total : 0;
  const provRate = prov.total > 0 ? prov.denied / prov.total : 0;

  if (payerRate > 0.3) { riskScore += 20; findings.push({ severity: 'high', category: 'Payer History', title: 'High payer denial rate', description: `${request.payerName} denies ${(payerRate * 100).toFixed(0)}% of claims.`, recommendation: 'Verify coverage and pre-authorize.', confidence: 0.85 }); }
  else if (payerRate > 0.15) { riskScore += 10; findings.push({ severity: 'warning', category: 'Payer History', title: 'Moderate payer denial rate', description: `${request.payerName} denies ${(payerRate * 100).toFixed(0)}% of claims.`, recommendation: 'Double-check documentation completeness.', confidence: 0.75 }); }

  if (procRate > 0.25) { riskScore += 20; findings.push({ severity: 'high', category: 'Procedure History', title: 'High denial rate for these codes', description: `Procedures ${request.procedureCodes.join(', ')} have ${(procRate * 100).toFixed(0)}% denial rate.`, recommendation: 'Ensure medical necessity documentation.', confidence: 0.82 }); }

  if (provRate > 0.2) { riskScore += 10; findings.push({ severity: 'warning', category: 'Provider History', title: 'Provider has elevated denial rate', description: `Provider denial rate: ${(provRate * 100).toFixed(0)}%.`, recommendation: 'Review documentation patterns.', confidence: 0.7 }); }

  const tf = timelyFiling.status === 'fulfilled' ? timelyFiling.value : { isLate: false, daysRemaining: 999, daysSince: 0, deadline: 365 };
  if (tf.isLate) { riskScore += 25; findings.push({ severity: 'block', category: 'Timely Filing', title: 'Past timely filing deadline', description: `${tf.daysSince} days since DOS. Deadline: ${tf.deadline} days.`, recommendation: 'Submit immediately with delay documentation.', carcCode: 'CO29', confidence: 0.95 }); }
  else if (tf.daysRemaining < 30) { riskScore += 10; findings.push({ severity: 'warning', category: 'Timely Filing', title: 'Approaching filing deadline', description: `${tf.daysRemaining} days remaining.`, recommendation: 'Submit soon.', carcCode: 'CO29', confidence: 0.6 }); }

  const dup = duplicates.status === 'fulfilled' ? duplicates.value : { found: false };
  if (dup.found) { riskScore += 20; findings.push({ severity: 'block', category: 'Duplicate', title: 'Potential duplicate claim', description: `Existing claim ${(dup as any).claimId} for same patient + DOS.`, recommendation: 'Verify not a duplicate.', carcCode: 'CO18', confidence: 0.9 }); }

  const am = annualMax.status === 'fulfilled' ? annualMax.value : { exceedsMax: false, remaining: 0, annualMax: 0 };
  if (am.exceedsMax) { riskScore += 15; findings.push({ severity: 'high', category: 'Benefits', title: 'Exceeds annual maximum', description: `$${am.remaining.toFixed(0)} remaining of $${am.annualMax.toFixed(0)} max.`, recommendation: 'Inform patient of out-of-pocket cost.', carcCode: 'CO119', confidence: 0.88 }); }

  if (request.chargeAmount > 5000) { riskScore += 8; findings.push({ severity: 'warning', category: 'Charge Amount', title: 'High-value claim', description: 'Claims over $5,000 receive additional scrutiny.', recommendation: 'Include detailed clinical notes.', confidence: 0.65 }); }

  if (request.coverageType === 'S' || request.coverageType === 'T') { riskScore += 5; findings.push({ severity: 'info', category: 'Coverage', title: 'Secondary/tertiary coverage', description: 'Coordination of benefits required.', recommendation: 'Attach primary payer EOB.', confidence: 0.7 }); }

  riskScore = Math.min(100, riskScore);
  const riskTier: ScrubResult['riskTier'] = riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';
  const denialProb = Math.min(0.95, payerRate * 0.3 + procRate * 0.25 + provRate * 0.15 + (tf.isLate ? 0.95 : 0) * 0.15 + (dup.found ? 0.9 : 0) * 0.15);

  const suggestedActions = findings.filter(f => f.severity !== 'info').sort((a, b) => { const o = { block: 0, high: 1, warning: 2, info: 3 }; return o[a.severity] - o[b.severity]; }).map(f => f.recommendation);

  const result: ScrubResult = {
    riskScore, riskTier,
    findings: findings.sort((a, b) => b.confidence - a.confidence),
    estimatedDenialProbability: denialProb,
    suggestedActions: [...new Set(suggestedActions)],
  };

  // Optional: Ollama insight for medium+ risk
  if (riskScore >= 25) {
    try {
      const summary = findings.map(f => `[${f.severity.toUpperCase()}] ${f.title}: ${f.description}`).join('\n');
      const aiInsight = await ollama.generate(
        `Summarize these claim risk findings in 2-3 sentences and suggest the single most important action:\n\n${summary}`,
        { temperature: 0.3, maxTokens: 256, timeoutMs: 30_000 },
      );
      if (aiInsight) result.aiInsight = aiInsight;
    } catch (err: any) {
      logger.warn('[ClaimScrubber] Ollama insight failed (non-fatal)', err?.message);
    }
  }

  return result;
}
