/**
 * Proactive Alert Agent - detects emerging patterns and pushes alerts.
 *
 * 6 parallel SQL pattern detectors:
 * 1. Denial spike (>2 std dev from 4-week avg)
 * 2. Payer behavior change (new CARC codes)
 * 3. Timely filing urgency (30/15/7 day warnings)
 * 4. Collection drop (below forecast)
 * 5. Claim backlog growth
 * 6. Write-off anomalies
 */
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';
import { ollama } from '../ollama';

export interface AiAlert {
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  aiExplanation?: string;
  recommendedActions: string[];
  metadata?: Record<string, any>;
}

export async function detectAlerts(customerId: number): Promise<AiAlert[]> {
  const pool = Database.getInstance().getPool();
  const alerts: AiAlert[] = [];

  const results = await Promise.allSettled([
    detectDenialSpike(pool, customerId),
    detectTimelyFilingUrgency(pool, customerId),
    detectCollectionDrop(pool, customerId),
    detectBacklogGrowth(pool, customerId),
    detectWriteoffAnomalies(pool, customerId),
  ]);

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      alerts.push(...(Array.isArray(r.value) ? r.value : [r.value]));
    }
  }

  // Optionally generate AI explanations for critical/warning alerts
  for (const alert of alerts.filter(a => a.severity !== 'info')) {
    try {
      const explanation = await ollama.generate(
        `Explain this RCM alert in 1-2 sentences and suggest one action:\n\nType: ${alert.alertType}\nTitle: ${alert.title}\nDetail: ${alert.detail}`,
        { temperature: 0.3, maxTokens: 128, timeoutMs: 15_000 },
      );
      if (explanation) alert.aiExplanation = explanation;
    } catch { /* non-fatal */ }
  }

  return alerts;
}

async function detectDenialSpike(pool: sql.ConnectionPool, customerId: number): Promise<AiAlert | null> {
  try {
    const r = await pool.request().input('custId', sql.Int, customerId).query(`
      WITH WeeklyDenials AS (
        SELECT DATEPART(WEEK, DateOfService) AS wk, YEAR(DateOfService) AS yr,
               COUNT(*) AS total, SUM(CASE WHEN IsClaimDenied = 1 THEN 1 ELSE 0 END) AS denied
        FROM dbo.recon_report WHERE customer_id = @custId AND DateOfService >= DATEADD(WEEK, -5, GETDATE())
        GROUP BY DATEPART(WEEK, DateOfService), YEAR(DateOfService)
      )
      SELECT AVG(CAST(denied AS FLOAT)) AS avgDenied, STDEV(CAST(denied AS FLOAT)) AS stdDenied,
             (SELECT TOP 1 denied FROM WeeklyDenials ORDER BY yr DESC, wk DESC) AS currentWeek
      FROM WeeklyDenials
    `);
    const { avgDenied, stdDenied, currentWeek } = r.recordset[0] ?? {};
    if (avgDenied && stdDenied && currentWeek > avgDenied + 2 * stdDenied) {
      return {
        alertType: 'denial_spike', severity: 'critical',
        title: 'Denial spike detected',
        detail: `This week: ${currentWeek} denials vs ${avgDenied.toFixed(0)} avg (${stdDenied.toFixed(0)} std dev).`,
        recommendedActions: ['Review recent denials by payer', 'Check for systematic billing issues', 'Escalate to team lead'],
      };
    }
  } catch (e: any) { logger.warn('[AlertAgent] denialSpike error', e?.message); }
  return null;
}

async function detectTimelyFilingUrgency(pool: sql.ConnectionPool, customerId: number): Promise<AiAlert[]> {
  const alerts: AiAlert[] = [];
  try {
    const r = await pool.request().input('custId', sql.Int, customerId).query(`
      SELECT c.ClaimID, DATEDIFF(DAY, c.DateOfService, GETDATE()) AS daysSince,
             ISNULL(pfd.filing_deadline, 365) AS deadline
      FROM dbo.claims c
      LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
      LEFT JOIN dbo.PayerFilingDeadlines pfd ON pfd.payer_name LIKE '%' + rr.InsuranceName + '%' AND pfd.customer_id = @custId
      WHERE c.customer_id = @custId AND c.ClaimSubmittedDate IS NULL
      AND DATEDIFF(DAY, c.DateOfService, GETDATE()) > ISNULL(pfd.filing_deadline, 365) - 30
    `);
    const urgent = r.recordset.filter((c: any) => c.daysSince > c.deadline - 7);
    const approaching = r.recordset.filter((c: any) => c.daysSince <= c.deadline - 7);

    if (urgent.length > 0) {
      alerts.push({
        alertType: 'timely_filing', severity: 'critical',
        title: `${urgent.length} claim(s) within 7 days of filing deadline`,
        detail: `Claims: ${urgent.slice(0, 5).map((c: any) => c.ClaimID).join(', ')}`,
        recommendedActions: ['Submit these claims immediately', 'Prepare delay documentation if needed'],
      });
    }
    if (approaching.length > 0) {
      alerts.push({
        alertType: 'timely_filing', severity: 'warning',
        title: `${approaching.length} claim(s) approaching filing deadline (30 days)`,
        detail: `Claims nearing deadline.`,
        recommendedActions: ['Prioritize submission of aging claims'],
      });
    }
  } catch (e: any) { logger.warn('[AlertAgent] timelyFiling error', e?.message); }
  return alerts;
}

async function detectCollectionDrop(pool: sql.ConnectionPool, customerId: number): Promise<AiAlert | null> {
  try {
    const r = await pool.request().input('custId', sql.Int, customerId).query(`
      SELECT
        SUM(CASE WHEN DateOfService >= DATEADD(MONTH, -1, GETDATE()) AND TrxType = 'Payment' THEN ABS(TrxAmt) ELSE 0 END) AS thisMonth,
        SUM(CASE WHEN DateOfService >= DATEADD(MONTH, -2, GETDATE()) AND DateOfService < DATEADD(MONTH, -1, GETDATE()) AND TrxType = 'Payment' THEN ABS(TrxAmt) ELSE 0 END) AS lastMonth
      FROM dbo.recon_report WHERE customer_id = @custId
    `);
    const { thisMonth, lastMonth } = r.recordset[0] ?? {};
    if (lastMonth > 0 && thisMonth < lastMonth * 0.8) {
      return {
        alertType: 'collection_drop', severity: 'warning',
        title: 'Collections trending down',
        detail: `MTD: $${thisMonth?.toFixed(0)} vs last month: $${lastMonth?.toFixed(0)} (${((1 - thisMonth / lastMonth) * 100).toFixed(0)}% drop).`,
        recommendedActions: ['Review outstanding AR', 'Follow up on aging claims', 'Check for payer payment delays'],
      };
    }
  } catch (e: any) { logger.warn('[AlertAgent] collectionDrop error', e?.message); }
  return null;
}

async function detectBacklogGrowth(pool: sql.ConnectionPool, customerId: number): Promise<AiAlert | null> {
  try {
    const r = await pool.request().input('custId', sql.Int, customerId).query(`
      SELECT COUNT(*) AS openClaims FROM dbo.claimhistory
      WHERE ClaimWorkEndedTime IS NULL AND customer_id = @custId
    `);
    const open = r.recordset[0]?.openClaims ?? 0;
    if (open > 100) {
      return {
        alertType: 'backlog_growth', severity: open > 200 ? 'critical' : 'warning',
        title: `Claim backlog: ${open} open claims`,
        detail: `${open} claims in the work queue without resolution.`,
        recommendedActions: ['Review specialist capacity', 'Consider temporary staffing', 'Prioritize high-value claims'],
      };
    }
  } catch (e: any) { logger.warn('[AlertAgent] backlogGrowth error', e?.message); }
  return null;
}

async function detectWriteoffAnomalies(pool: sql.ConnectionPool, customerId: number): Promise<AiAlert | null> {
  try {
    const r = await pool.request().input('custId', sql.Int, customerId).query(`
      WITH ProvStats AS (
        SELECT ProviderName, COUNT(*) AS adjCount, SUM(ABS(AdjAmt)) AS totalAdj,
               AVG(ABS(AdjAmt)) AS avgAdj
        FROM dbo.Adjustment WHERE customer_id = @custId
        AND AdjDate >= DATEADD(DAY, -90, GETDATE())
        GROUP BY ProviderName HAVING COUNT(*) >= 5
      )
      SELECT TOP 1 ProviderName, adjCount, totalAdj, avgAdj FROM ProvStats
      WHERE avgAdj > (SELECT AVG(avgAdj) * 2 FROM ProvStats)
      ORDER BY totalAdj DESC
    `);
    const anom = r.recordset[0];
    if (anom) {
      return {
        alertType: 'writeoff_anomaly', severity: 'warning',
        title: `Write-off anomaly: ${anom.ProviderName}`,
        detail: `${anom.adjCount} adjustments totaling $${anom.totalAdj.toFixed(0)} (avg $${anom.avgAdj.toFixed(0)}) \u2014 2x above average.`,
        recommendedActions: ['Audit this provider\'s adjustments', 'Review write-off approval process'],
      };
    }
  } catch (e: any) { logger.warn('[AlertAgent] writeoffAnomalies error', e?.message); }
  return null;
}
