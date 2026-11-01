/**
 * AI Appeal Letter Agent
 *
 * Generates persuasive, payer-specific appeal letters using Ollama.
 * Gathers claim context, payer denial history, and past appeal success
 * rates to build a detailed prompt. Falls back to template-based
 * generation if Ollama is unavailable.
 */
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';
import { ollama } from '../ollama';

interface AppealContext {
  claimId: string;
  patientName: string;
  dos: string;
  payerName: string;
  providerName: string;
  chargeAmount: string;
  denialCode: string;
  denialDescription: string;
  submittedDate: string;
  appealDeadline: string;
  payerDenialRate: number;
  payerAppealWinRate: number;
  similarDenialCount: number;
  similarAppealWins: number;
  customNotes: string;
}

/**
 * Gather full context for appeal letter generation.
 */
async function gatherContext(
  claimId: string,
  customerId: number | null,
  customNotes?: string,
): Promise<AppealContext | null> {
  const pool = Database.getInstance().getPool();

  // Claim details
  const claimReq = pool.request();
  claimReq.input('ClaimId', sql.NVarChar(50), claimId);
  if (customerId != null) claimReq.input('_custId', sql.Int, customerId);

  const claimResult = await claimReq.query(`
    SELECT TOP 1
      c.ClaimID, c.DateOfService, c.ClaimSubmittedDate, c.ChargeAmt,
      COALESCE(rr.InsuranceName, CAST(c.PayerID AS NVARCHAR)) AS PayerName,
      COALESCE(rr.ProviderName, '') AS ProviderName,
      LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))) AS PatientName,
      NULLIF(ch.CARCCode, '') AS DenialCode,
      CAST(carc.description AS NVARCHAR(MAX)) AS DenialDescription
    FROM dbo.claims c
    LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
    LEFT JOIN dbo.patient pt ON pt.PatientID = c.PatientID
    LEFT JOIN (
      SELECT ClaimID, CARCCode
      FROM dbo.claimhistory WHERE ClaimID = @ClaimId
      ORDER BY ClaimModifiedDate DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
    ) ch ON ch.ClaimID = c.ClaimID
    LEFT JOIN dbo.Carcs carc ON carc.code = ch.CARCCode
    WHERE c.ClaimID = @ClaimId${customerId != null ? ' AND c.customer_id = @_custId' : ''}
  `);

  if (!claimResult.recordset.length) return null;
  const claim = claimResult.recordset[0];

  // Payer stats + appeal win rates (parallel)
  const [payerStats, appealStats] = await Promise.allSettled([
    // Payer denial rate (last 12 months)
    pool.request()
      .input('PayerName', sql.NVarChar(255), claim.PayerName || '')
      .query(`
        SELECT
          COUNT(*) AS totalClaims,
          SUM(CASE WHEN IsClaimDenied = 1 THEN 1 ELSE 0 END) AS deniedClaims
        FROM dbo.recon_report
        WHERE InsuranceName = @PayerName
          AND DateOfService >= DATEADD(MONTH, -12, GETDATE())
      `),
    // Appeal success rate for this payer + CARC combo
    pool.request()
      .input('PayerName', sql.NVarChar(255), claim.PayerName || '')
      .input('DenialCode', sql.NVarChar(20), claim.DenialCode || '')
      .query(`
        SELECT
          COUNT(*) AS totalAppeals,
          SUM(CASE WHEN a.status = 'won' THEN 1 ELSE 0 END) AS wonAppeals
        FROM dbo.DenialAppeal a
        JOIN dbo.claims c ON c.ClaimID = a.claim_id
        LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
        WHERE rr.InsuranceName = @PayerName
          AND a.denial_reason = @DenialCode
      `),
  ]);

  const pStats = payerStats.status === 'fulfilled' ? payerStats.value.recordset[0] : null;
  const aStats = appealStats.status === 'fulfilled' ? appealStats.value.recordset[0] : null;

  const payerDenialRate = pStats?.totalClaims > 0
    ? Math.round((pStats.deniedClaims / pStats.totalClaims) * 100)
    : 0;
  const payerAppealWinRate = aStats?.totalAppeals > 0
    ? Math.round((aStats.wonAppeals / aStats.totalAppeals) * 100)
    : 0;

  // Filing deadline
  let appealDays = 60;
  if (claim.PayerName) {
    const pdReq = pool.request();
    pdReq.input('PayerName', sql.NVarChar(255), claim.PayerName);
    if (customerId != null) pdReq.input('_custId', sql.Int, customerId);
    const pdResult = await pdReq.query(`
      SELECT TOP 1 appeal_days FROM dbo.PayerFilingDeadlines
      WHERE payer_name LIKE '%' + @PayerName + '%'${customerId != null ? ' AND customer_id = @_custId' : ''}
    `);
    if (pdResult.recordset.length) appealDays = pdResult.recordset[0].appeal_days ?? 60;
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + appealDays);

  const fmt = (d: any) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

  return {
    claimId,
    patientName: claim.PatientName || 'Patient',
    dos: fmt(claim.DateOfService),
    payerName: claim.PayerName || 'Insurance Company',
    providerName: claim.ProviderName || 'Provider',
    chargeAmount: claim.ChargeAmt != null ? `$${parseFloat(claim.ChargeAmt).toFixed(2)}` : 'N/A',
    denialCode: claim.DenialCode || 'N/A',
    denialDescription: claim.DenialDescription || claim.DenialCode || 'N/A',
    submittedDate: fmt(claim.ClaimSubmittedDate),
    appealDeadline: fmt(dueDate),
    payerDenialRate,
    payerAppealWinRate,
    similarDenialCount: aStats?.totalAppeals ?? 0,
    similarAppealWins: aStats?.wonAppeals ?? 0,
    customNotes: customNotes || '',
  };
}

/**
 * Generate an AI-powered appeal letter using Ollama.
 */
export async function generateAiAppealLetter(
  claimId: string,
  customerId: number | null,
  customNotes?: string,
): Promise<{ letter: string; source: 'ai' } | null> {
  const ctx = await gatherContext(claimId, customerId, customNotes);
  if (!ctx) return null;

  // The model only generates the persuasive argument paragraphs - it never
  // touches factual fields. Code assembles the full letter around those paragraphs,
  // injecting all DB-sourced values directly. This prevents hallucinated dates/amounts.
  const systemPrompt = `You are an expert healthcare revenue cycle management appeal writer.
Your job is to write the persuasive ARGUMENT SECTION of a dental insurance appeal letter.

You will be given the denial code and payer context. Write 3-5 paragraphs that:
- Explain why the denial under this specific code is incorrect or should be reconsidered
- Reference relevant clinical standards, billing guidelines, and medical necessity criteria
- Cite the type of documentation that supports the claim (chart notes, x-rays, treatment plans, etc.)
- Make a firm, respectful case for reconsideration

Do NOT write greetings, closings, dates, patient names, claim IDs, dollar amounts, or any letter headers.
Write ONLY the body argument paragraphs.`;

  const prompt = `Write the argument section for a dental insurance appeal.

DENIAL DETAILS:
- Denial code: ${ctx.denialCode}
- Denial reason: ${ctx.denialDescription}
- Payer: ${ctx.payerName}
- Payer overall denial rate: ${ctx.payerDenialRate}%
- Similar appeal history for this payer + code: ${ctx.similarDenialCount} filed, ${ctx.similarAppealWins} won (${ctx.payerAppealWinRate}% success rate)
${ctx.customNotes ? `\nSPECIALIST NOTES:\n${ctx.customNotes}` : ''}

Write 3-5 persuasive argument paragraphs only. No greeting, no closing, no factual claim data.`;

  try {
    const argumentBody = await ollama.chat(
      [{ role: 'user', content: prompt }],
      { systemPrompt, temperature: 0.4, noCache: true, timeoutMs: 120_000 },
    );
    if (!argumentBody) return null;

    // Assemble the full letter - all factual fields come from the DB, never from the model
    const letter = [
      `Dear ${ctx.payerName} Claims Appeal Review Team,`,
      '',
      `I am writing to formally appeal the denial of claim ${ctx.claimId} for services provided to patient ${ctx.patientName} on ${ctx.dos} by ${ctx.providerName}. The original claim was submitted on ${ctx.submittedDate} with a billed charge of ${ctx.chargeAmount}. We respectfully request a full review and reversal of this denial.`,
      '',
      `The denial was issued under reason code ${ctx.denialCode} (${ctx.denialDescription}). We believe this determination does not accurately reflect the clinical circumstances and documented medical necessity of the services rendered.`,
      '',
      argumentBody.trim(),
      '',
      `We respectfully request that ${ctx.payerName} reconsider this claim and issue payment in accordance with the terms of the patient's benefit plan. Please note that the deadline for this appeal is ${ctx.appealDeadline}. All supporting documentation is available upon request.`,
      '',
      'Thank you for your time and consideration.',
    ].join('\n');

    return { letter, source: 'ai' };
  } catch (err: any) {
    logger.error('[AppealAgent] Ollama generation failed', err?.message);
    return null;
  }
}
