/**
 * Smart Routing Agent - matches unassigned claims to specialists.
 *
 * Scoring factors:
 * - Specialist proficiency for this CARC code (historical win rate)
 * - Current workload (open claim count)
 * - Payer-specific experience
 * - Overall resolution rate
 */
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';
import { ollama } from '../ollama';

export interface RoutingRecommendation {
  claimId: string;
  recommendedSpecialist: string;
  specialistUserId: number;
  fitScore: number;
  reasons: string[];
  aiExplanation?: string;
}

export async function getRoutingRecommendations(
  customerId: number,
  claimIds?: string[],
): Promise<RoutingRecommendation[]> {
  const pool = Database.getInstance().getPool();
  const recommendations: RoutingRecommendation[] = [];

  // Get unassigned claims (or specific claims if provided)
  const claimReq = pool.request().input('custId', sql.Int, customerId);
  let claimWhere = `ch.AssignedTo IS NULL AND ch.ClaimWorkEndedTime IS NULL AND ch.customer_id = @custId`;
  if (claimIds?.length) {
    claimIds.forEach((id, i) => claimReq.input(`cid${i}`, sql.NVarChar(50), id));
    claimWhere += ` AND ch.ClaimID IN (${claimIds.map((_, i) => `@cid${i}`).join(',')})`;
  }

  const claims = await claimReq.query(`
    SELECT DISTINCT ch.ClaimID, ch.CARCCode, rr.InsuranceName, rr.ChargeAmt
    FROM dbo.claimhistory ch
    LEFT JOIN dbo.recon_report rr ON rr.ClaimID = ch.ClaimID
    WHERE ${claimWhere}
  `);

  if (!claims.recordset.length) return [];

  // Get specialist stats
  const specialists = await pool.request().input('custId', sql.Int, customerId).query(`
    SELECT
      u.userID, u.Email, u.FirstName + ' ' + u.LastName AS FullName,
      COUNT(DISTINCT ch.ClaimID) AS openClaims,
      SUM(CASE WHEN ch.ClaimWorkEndedTime IS NOT NULL THEN 1 ELSE 0 END) AS resolvedClaims,
      SUM(CASE WHEN a.status = 'won' THEN 1 ELSE 0 END) AS appealsWon,
      COUNT(DISTINCT a.id) AS totalAppeals
    FROM dbo.Users u
    LEFT JOIN dbo.claimhistory ch ON ch.AssignedTo = u.Email AND ch.customer_id = @custId
    LEFT JOIN dbo.DenialAppeal a ON a.author_user_id = u.Email
    WHERE u.Role IN ('AR Specialist', 'Manager') AND u.customer_id = @custId AND u.disabled = 0
    GROUP BY u.userID, u.Email, u.FirstName, u.LastName
  `);

  if (!specialists.recordset.length) return [];

  // CARC-specific proficiency per specialist
  const carcProficiency = await pool.request().input('custId', sql.Int, customerId).query(`
    SELECT ch.AssignedTo, ch.CARCCode,
           COUNT(*) AS handled,
           SUM(CASE WHEN ch.ClaimWorkEndedTime IS NOT NULL THEN 1 ELSE 0 END) AS resolved
    FROM dbo.claimhistory ch
    WHERE ch.customer_id = @custId AND ch.AssignedTo IS NOT NULL AND ch.CARCCode IS NOT NULL
    GROUP BY ch.AssignedTo, ch.CARCCode
  `);

  const profMap = new Map<string, Map<string, { handled: number; resolved: number }>>();
  for (const row of carcProficiency.recordset) {
    if (!profMap.has(row.AssignedTo)) profMap.set(row.AssignedTo, new Map());
    profMap.get(row.AssignedTo)!.set(row.CARCCode, { handled: row.handled, resolved: row.resolved });
  }

  for (const claim of claims.recordset) {
    let bestSpec: any = null;
    let bestScore = -1;
    const reasons: string[] = [];

    for (const spec of specialists.recordset) {
      let score = 0;

      // CARC proficiency (40 pts)
      const prof = profMap.get(spec.Email)?.get(claim.CARCCode);
      if (prof && prof.handled >= 3) {
        const rate = prof.resolved / prof.handled;
        score += Math.round(rate * 40);
      }

      // Workload balance (30 pts - fewer open claims = higher score)
      const maxQueue = 50;
      score += Math.round(Math.max(0, 1 - spec.openClaims / maxQueue) * 30);

      // Overall resolution rate (20 pts)
      const totalHandled = spec.openClaims + spec.resolvedClaims;
      if (totalHandled > 0) {
        score += Math.round((spec.resolvedClaims / totalHandled) * 20);
      }

      // Appeal success rate (10 pts)
      if (spec.totalAppeals > 0) {
        score += Math.round((spec.appealsWon / spec.totalAppeals) * 10);
      }

      if (score > bestScore) {
        bestScore = score;
        bestSpec = spec;
        reasons.length = 0;
        if (prof) reasons.push(`${((prof.resolved / prof.handled) * 100).toFixed(0)}% resolution rate for ${claim.CARCCode}`);
        reasons.push(`${spec.openClaims} open claims (capacity available)`);
        if (spec.totalAppeals > 0) reasons.push(`${spec.appealsWon}/${spec.totalAppeals} appeals won`);
      }
    }

    if (bestSpec) {
      recommendations.push({
        claimId: claim.ClaimID,
        recommendedSpecialist: bestSpec.FullName,
        specialistUserId: bestSpec.userID,
        fitScore: bestScore,
        reasons,
      });
    }
  }

  // Optional: AI explanation for top recommendations
  if (recommendations.length > 0 && recommendations.length <= 10) {
    try {
      const summary = recommendations.map(r =>
        `${r.claimId} \u2192 ${r.recommendedSpecialist} (score ${r.fitScore}): ${r.reasons.join(', ')}`
      ).join('\n');
      const explanation = await ollama.generate(
        `Summarize these claim-to-specialist routing decisions in 2-3 sentences:\n\n${summary}`,
        { temperature: 0.3, maxTokens: 256, timeoutMs: 20_000 },
      );
      if (explanation) recommendations[0].aiExplanation = explanation;
    } catch { /* non-fatal */ }
  }

  return recommendations.sort((a, b) => b.fitScore - a.fitScore);
}
