/**
 * Narrative Rewrite Agent
 *
 * Takes a claim's existing narrative and produces inline diff-style
 * replacement suggestions. Each hunk identifies a weak sentence/section,
 * the improved replacement, and the reason for the change.
 */
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';
import { ollama } from '../ollama';

export interface RewriteHunk {
  original: string;
  replacement: string;
  reason: string;
}

export interface RewriteResult {
  original_text: string;
  rewritten_text: string;
  diff_hunks: RewriteHunk[];
  focus_areas: string[];
  confidence: number;
  model_version: string;
}

const SYSTEM_PROMPT = `You are an expert healthcare documentation specialist.
Your task is to rewrite a claim's clinical narrative to be more complete, medically specific, and persuasive for appeal purposes.

Respond ONLY with valid JSON matching this schema exactly:
{
  "rewritten_text": "<full rewritten narrative>",
  "diff_hunks": [
    {
      "original": "<original sentence or phrase>",
      "replacement": "<improved replacement>",
      "reason": "<why this change improves the documentation>"
    }
  ],
  "focus_areas": ["<area1>", "<area2>"],
  "confidence": <float 0.0-1.0>
}

Rules:
- Keep the medical facts accurate \u2014 do NOT fabricate clinical findings.
- Add standard documentation language for missing elements.
- Use medically precise terminology.
- focus_areas should list categories improved: e.g. "Medical necessity", "Clinical findings", "Procedure justification".
- confidence reflects how much improvement you could make (1.0 = substantial improvement possible).`;

export async function rewriteNarrative(
  claimId: string,
  customerId: number | null,
  existingNarrative?: string,
): Promise<RewriteResult | null> {
  const pool = Database.getInstance().getPool();

  let narrative = existingNarrative;
  let cptCodes: string[] = [];
  let payerName = 'Unknown Payer';
  let denialCode = '';
  let denialDescription = '';

  if (!narrative) {
    const req = pool.request();
    req.input('ClaimId', sql.NVarChar(50), claimId);
    if (customerId != null) req.input('_custId', sql.Int, customerId);

    const result = await req.query(`
      SELECT TOP 1
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
    narrative = row.Narrative || '';
    cptCodes = row.CPTCodes ? String(row.CPTCodes).split(',').filter(Boolean) : [];
    payerName = row.PayerName || 'Unknown Payer';
    denialCode = row.DenialCode || '';
    denialDescription = row.DenialDescription || '';
  }

  const originalText = narrative || '';

  const prompt = `Rewrite and improve the following clinical narrative to support a successful insurance appeal.

CONTEXT:
- Procedure code(s): ${cptCodes.join(', ') || 'Unknown'}
- Payer: ${payerName}
- Denial reason: ${denialCode || 'N/A'} \u2014 ${denialDescription || 'N/A'}

ORIGINAL NARRATIVE:
"${originalText}"

Provide inline diff suggestions and a complete rewritten version.`;

  try {
    const raw = await ollama.chat(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.35,
        maxTokens: 1024,
        noCache: true,
        timeoutMs: 120_000,
      },
    );

    // Strip markdown code fences if the model wrapped the JSON
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      // Model returned plain text - treat entire response as the rewrite
      logger.warn('[RewriteAgent] No JSON in response; using raw text as rewrite. Preview:', raw.slice(0, 120));
      return {
        original_text: originalText,
        rewritten_text: raw.trim() || originalText,
        diff_hunks: [],
        focus_areas: ['General improvement'],
        confidence: 0.5,
        model_version: process.env.OLLAMA_MODEL || 'thewindmom/llama3-med42-8b:latest',
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr: any) {
      logger.warn('[RewriteAgent] JSON.parse failed:', parseErr?.message, '| raw excerpt:', jsonMatch[0].slice(0, 200));
      return null;
    }

    return {
      original_text: originalText,
      rewritten_text: parsed.rewritten_text || originalText,
      diff_hunks: Array.isArray(parsed.diff_hunks) ? parsed.diff_hunks : [],
      focus_areas: Array.isArray(parsed.focus_areas) ? parsed.focus_areas : [],
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0)),
      model_version: process.env.OLLAMA_MODEL || 'thewindmom/llama3-med42-8b:latest',
    };
  } catch (err: any) {
    logger.warn('[RewriteAgent] Ollama error:', err?.message ?? err?.code ?? String(err));
    return null;
  }
}

export async function persistRewrite(
  claimId: string,
  customerId: number | null,
  result: RewriteResult,
): Promise<number> {
  const pool = Database.getInstance().getPool();
  const req = pool.request();
  req.input('ClaimId', sql.NVarChar(50), claimId);
  req.input('CustId', sql.Int, customerId);
  req.input('Original', sql.NVarChar(sql.MAX), result.original_text);
  req.input('Rewritten', sql.NVarChar(sql.MAX), result.rewritten_text);
  req.input('Diff', sql.NVarChar(sql.MAX), JSON.stringify(result.diff_hunks));
  req.input('Focus', sql.NVarChar(500), result.focus_areas.join(', ').substring(0, 500));
  req.input('Confidence', sql.Decimal(4, 3), result.confidence);
  req.input('ModelVer', sql.NVarChar(100), result.model_version);

  const r = await req.query(`
    INSERT INTO dbo.ClaimRewrite
      (customer_id, claim_id, original_text, rewritten_text, diff_hunks, focus_areas, confidence, model_version)
    OUTPUT INSERTED.id
    VALUES (@CustId, @ClaimId, @Original, @Rewritten, @Diff, @Focus, @Confidence, @ModelVer)
  `);
  return r.recordset[0]?.id ?? 0;
}
