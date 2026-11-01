/**
 * Narrative Completeness Scorer Agent
 *
 * Sends the clinical narrative for a denied claim to Ollama and receives a
 * 0-100 completeness score plus a list of missing documentation elements.
 * Falls back gracefully when Ollama is unavailable.
 */
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';
import { ollama } from '../ollama';

export interface NarrativeScoreResult {
  score: number;
  missing_elements: string[];
  recommendations: string[];
  model_version: string;
}

interface ClaimNarrativeContext {
  claimId: string;
  narrative: string;
  cptCodes: string[];
  payerName: string;
  denialCode: string;
  denialDescription: string;
}

async function gatherNarrativeContext(
  claimId: string,
  customerId: number | null,
): Promise<ClaimNarrativeContext | null> {
  const pool = Database.getInstance().getPool();
  const req = pool.request();
  req.input('ClaimId', sql.NVarChar(50), claimId);
  if (customerId != null) req.input('_custId', sql.Int, customerId);

  const result = await req.query(`
    SELECT TOP 1
      c.ClaimID,
      COALESCE(c.xen_claim_note, c.ClaimNote, '') AS Narrative,
      COALESCE(rr.InsuranceName, CAST(c.PayerID AS NVARCHAR)) AS PayerName,
      NULLIF(ch.CarcCode, '') AS DenialCode,
      CAST(carc.description AS NVARCHAR(MAX)) AS DenialDescription,
      (
        SELECT STRING_AGG(cpt, ',')
        FROM (SELECT DISTINCT rr2.CPT AS cpt FROM dbo.recon_report rr2 WHERE rr2.ClaimID = c.ClaimID AND rr2.CPT IS NOT NULL) AS d
      ) AS CPTCodes
    FROM dbo.claims c
    LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID AND rr.TrxType = 'Charge'
    LEFT JOIN (
      SELECT TOP 1 ClaimID, CarcCode
      FROM dbo.claimhistory
      WHERE ClaimID = @ClaimId
      ORDER BY ClaimModifiedDate DESC
    ) ch ON ch.ClaimID = c.ClaimID
    LEFT JOIN dbo.Carcs carc ON carc.code = ch.CarcCode
    WHERE c.ClaimID = @ClaimId${customerId != null ? ' AND c.customer_id = @_custId' : ''}
  `);

  if (!result.recordset.length) return null;
  const row = result.recordset[0];

  return {
    claimId,
    narrative: row.Narrative || '',
    cptCodes: row.CPTCodes ? String(row.CPTCodes).split(',').filter(Boolean) : [],
    payerName: row.PayerName || 'Unknown Payer',
    denialCode: row.DenialCode || '',
    denialDescription: row.DenialDescription || '',
  };
}

const SYSTEM_PROMPT = `You are a clinical documentation auditor specializing in healthcare claims.
Your job is to evaluate whether a claim's narrative/notes contain sufficient documentation to support medical necessity and appeal a denial.

Respond ONLY with valid JSON matching this schema exactly:
{
  "score": <integer 0-100>,
  "missing_elements": [<string>, ...],
  "recommendations": [<string>, ...]
}

Scoring guide:
- 90-100: Comprehensive. All required elements present.
- 70-89: Mostly complete. Minor gaps.
- 50-69: Significant gaps. Likely to be denied.
- 0-49: Insufficient. Major required elements absent.

Missing elements should be specific: e.g. "Date of symptom onset", "Medical necessity statement", "Clinical findings supporting D4341".
Recommendations should be actionable: e.g. "Add the patient's periodontal staging (Stage III, Grade B)".`;

export async function scoreNarrative(
  claimId: string,
  customerId: number | null,
): Promise<NarrativeScoreResult | null> {
  const ctx = await gatherNarrativeContext(claimId, customerId);
  if (!ctx) return null;

  if (!ctx.narrative || ctx.narrative.trim().length < 10) {
    return {
      score: 0,
      missing_elements: ['No clinical narrative present'],
      recommendations: ['Add a clinical narrative describing the patient condition, symptoms, and medical necessity for the billed procedure(s).'],
      model_version: 'rule-based',
    };
  }

  const prompt = `Evaluate this claim narrative for documentation completeness:

CLAIM CONTEXT:
- Procedure code(s): ${ctx.cptCodes.join(', ') || 'Unknown'}
- Payer: ${ctx.payerName}
- Denial reason code: ${ctx.denialCode || 'N/A'} \u2014 ${ctx.denialDescription || 'N/A'}

NARRATIVE TO EVALUATE:
"${ctx.narrative}"

Score the narrative and list what is missing and what should be added to strengthen the appeal.`;

  try {
    const raw = await ollama.chat(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.2,
        maxTokens: 512,
        noCache: true,
        timeoutMs: 60_000,
      },
    );

    // Extract JSON from the response (model sometimes wraps in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      score: Math.min(100, Math.max(0, parseInt(parsed.score, 10) || 0)),
      missing_elements: Array.isArray(parsed.missing_elements) ? parsed.missing_elements : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      model_version: process.env.OLLAMA_MODEL || 'thewindmom/llama3-med42-8b:latest',
    };
  } catch (err: any) {
    logger.warn('[NarrativeScorer] Ollama unavailable or parse error:', err?.message);
    return null;
  }
}

export async function persistScore(
  claimId: string,
  customerId: number | null,
  result: NarrativeScoreResult,
): Promise<number> {
  const pool = Database.getInstance().getPool();
  const req = pool.request();
  req.input('ClaimId', sql.NVarChar(50), claimId);
  req.input('CustId', sql.Int, customerId);
  req.input('Score', sql.Int, result.score);
  req.input('Missing', sql.NVarChar(sql.MAX), JSON.stringify(result.missing_elements));
  req.input('Recs', sql.NVarChar(sql.MAX), JSON.stringify(result.recommendations));
  req.input('ModelVer', sql.NVarChar(100), result.model_version);

  const r = await req.query(`
    INSERT INTO dbo.NarrativeScore (customer_id, claim_id, score, missing_elements, recommendations, model_version)
    OUTPUT INSERTED.id
    VALUES (@CustId, @ClaimId, @Score, @Missing, @Recs, @ModelVer)
  `);
  return r.recordset[0]?.id ?? 0;
}
