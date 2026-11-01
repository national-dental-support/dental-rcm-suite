import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { loadThresholds, ExecThresholdConfig } from '../admin/exec-thresholds';
import { resolveUserScope } from '../../utils/resolve-user-scope';
import { ollama } from '../../services/ollama';

type Status   = 'green' | 'yellow' | 'red' | 'error';
type Severity = 'critical' | 'warning' | 'info';
type Priority = 'high' | 'medium' | 'low';

interface ActionItem   { priority: Priority; label: string; link: string; queryParams?: Record<string, string>; product: string; }
interface SectionAlert { severity: Severity; message: string; actions: ActionItem[]; }
interface KpiItem      { key: string; label: string; value: number | null; format: 'number' | 'currency' | 'percent'; }
interface SummarySection {
  slug: string; label: string; status: Status; kpis: KpiItem[]; alerts: SectionAlert[];
  message?: string;
  topPayers?: { payerName: string; denialRate: number; deniedCount: number; totalCount: number }[];
  staffByProduct?: { product: string; staffCount: number }[];
  reportUsage?: { product: string; uniqueUsers: number; totalViews: number; avgDuration: number }[];
}
interface CrossProductInsight { severity: Severity; products: string[]; title: string; detail: string; actions: ActionItem[]; }
interface Metrics {
  denialRate: number|null; recoveryRate: number|null; collectionRate: number|null;
  daysInAR: number|null; pctAging90: number|null; avgQueueSize: number|null;
  activeSpecialists: number|null; openDenials: number|null; revenueAtRisk: number|null;
  topPayerConcentration: number|null; topPayerName: string|null;
  trainingCompliance: number|null; overdueTraining: number|null;
  reportAdoption: number|null;
}

function ragBelow(v: number|null, gMax: number, yMax: number): Status {
  if (v==null) return 'yellow'; if (v<=gMax) return 'green'; if (v<=yMax) return 'yellow'; return 'red';
}
function ragAbove(v: number|null, gMin: number, yMin: number): Status {
  /* istanbul ignore next */
  if (v==null) return 'yellow'; if (v>=gMin) return 'green'; if (v>=yMin) return 'yellow'; return 'red';
}
function worst(...s: Status[]): Status {
  if (s.includes('red')) return 'red'; if (s.includes('yellow')) return 'yellow'; return 'green';
}

function deriveInsights(m: Metrics, cfg: ExecThresholdConfig): CrossProductInsight[] {
  const ins: CrossProductInsight[] = [];
  const t = cfg.triggers;

  if (m.denialRate!=null && m.pctAging90!=null && m.denialRate>t.denialAndAging.denialRate && m.pctAging90>t.denialAndAging.pctAging90)
    ins.push({ severity:'critical', products:['denial-iq','kpi'], title:'Denied claims are aging unresolved',
      detail:`${m.denialRate.toFixed(1)}% denial rate combined with ${m.pctAging90.toFixed(0)}% of open claims aged over 90 days signals compounding revenue risk. Every additional day a denied claim ages reduces the probability of a successful appeal.`,
      actions:[
        { priority:'high',   label:'Open manager claim queue sorted by age \u2014 assign aged denials to senior specialists', link:'/app/denial-iq/claim-queue/manager', queryParams:{ tab:'all' },       product:'Denial IQ'   },
        { priority:'high',   label:'Configure escalation routing rules for claims denied and open >60 days',              link:'/app/manager/routing',                              product:'Workforce'   },
        { priority:'medium', label:'Review denial analytics to identify systemic denial drivers',                         link:'/app/insightflow/view/denials',                     product:'InsightFlow' },
      ]});

  if (m.collectionRate!=null && m.collectionRate<t.lowCollection.collectionRate)
    ins.push({ severity:'critical', products:['recon-iq'], title:'Net collection rate below industry threshold',
      detail:`${m.collectionRate.toFixed(1)}% collection rate means approximately ${(100-m.collectionRate).toFixed(1)}% of billed charges are going uncollected. Industry benchmark is 90%+.`,
      actions:[
        { priority:'high',   label:'Run RCM collections breakdown by practice to find underperforming locations', link:'/app/insightflow/view/rcm',         product:'InsightFlow' },
        { priority:'high',   label:'Review underpayment analysis for systematic short-payment patterns',          link:'/app/payer-iq/underpayments',        product:'Payer IQ'    },
        { priority:'medium', label:'Audit AR aging \u2014 focus on claims >120 days outstanding',                      link:'/app/insightflow/view/ar',           product:'InsightFlow' },
      ]});

  if (m.denialRate!=null && m.recoveryRate!=null && m.denialRate>t.denialAndRecovery.denialRate && m.recoveryRate<t.denialAndRecovery.recoveryRate)
    ins.push({ severity:'critical', products:['denial-iq'], title:'Appeal process not recovering denied revenue',
      detail:`${m.recoveryRate.toFixed(1)}% recovery rate on a ${m.denialRate.toFixed(1)}% denial rate means most denied claims are being written off rather than successfully appealed.`,
      actions:[
        { priority:'high',   label:'Review appeal win rates and success patterns by denial reason code',          link:'/app/insightflow/view/appeal-success',            product:'InsightFlow' },
        { priority:'high',   label:'Open escalated denial queue \u2014 review claims awaiting appeal',                 link:'/app/denial-iq/claim-queue/manager', queryParams:{ tab:'escalated' }, product:'Denial IQ'   },
        { priority:'medium', label:'Review CARC library and update remediation SOPs for low-recovery codes',      link:'/app/insightflow/view/carc-library',               product:'InsightFlow' },
      ]});

  if (m.topPayerConcentration!=null && m.topPayerConcentration>t.payerConcentration.topPayerConcentration) {
    const name = m.topPayerName ?? 'your top payer';
    ins.push({ severity: m.topPayerConcentration>cfg.rag.payerConcentration.yellowMax?'critical':'warning', products:['payer-iq'],
      title:`Revenue concentration risk \u2014 ${name}`,
      detail:`${m.topPayerConcentration.toFixed(0)}% of charges are billed to a single payer (${name}). Any contract dispute, rate cut, or credentialing issue with this payer will have an outsized revenue impact.`,
      actions:[
        { priority:'high',   label:`Review ${name} underpayments, denial patterns, and contract performance`,    link:'/app/payer-iq/underpayments',             product:'Payer IQ'    },
        { priority:'medium', label:'Analyze payer mix concentration and model diversification scenarios',         link:'/app/insightflow/view/payer-mix',         product:'InsightFlow' },
        { priority:'low',    label:'Build contract negotiation strategy to reduce single-payer dependency',       link:'/app/payer-iq/strategy',                  product:'Payer IQ'    },
      ]});
  }

  if (m.daysInAR!=null && m.daysInAR>t.highDaysInAR.daysInAR)
    ins.push({ severity: m.daysInAR>cfg.rag.daysInAR.yellowMax?'critical':'warning', products:['recon-iq'], title:'Days in AR above benchmark',
      detail:`${m.daysInAR.toFixed(0)} average days in AR versus the ${t.highDaysInAR.daysInAR}-day industry benchmark. Extended AR increases the risk of payer non-payment and claim abandonment.`,
      actions:[
        { priority:'high',   label:'Review AR aging by practice location to identify outlier sites',              link:'/app/insightflow/view/ar',            product:'InsightFlow' },
        { priority:'medium', label:'Identify slowest-paying payers and review their payment patterns',            link:'/app/payer-iq/underpayments',         product:'Payer IQ'    },
        { priority:'low',    label:'Review payer contracts for ERA/EFT enrollment opportunities',                 link:'/app/payer-iq/strategy',              product:'Payer IQ'    },
      ]});

  if (m.avgQueueSize!=null && m.avgQueueSize>t.highAvgQueue.avgQueueSize)
    ins.push({ severity: m.avgQueueSize>cfg.rag.avgQueueSpecialist.yellowMax?'critical':'warning', products:['denial-iq'], title:'Specialist workload above recommended capacity',
      detail:`Average queue of ${m.avgQueueSize.toFixed(0)} claims per specialist exceeds the recommended ${cfg.rag.avgQueueSpecialist.greenMax}\u2013${cfg.rag.avgQueueSpecialist.yellowMax}. Overloaded specialists have lower appeal success rates and increase claim aging.`,
      actions:[
        { priority:'high',   label:'Redistribute open claim queue \u2014 review unassigned claims and reassign',       link:'/app/denial-iq/claim-queue/manager', queryParams:{ tab:'unassigned' }, product:'Denial IQ' },
        { priority:'medium', label:'Configure skill-based routing rules to auto-balance specialist load',         link:'/app/manager/routing',                              product:'Workforce' },
        { priority:'low',    label:'Review specialist skills and capacity assignments',                           link:'/app/manager/skills',                               product:'Workforce' },
      ]});

  if (m.trainingCompliance!=null && m.trainingCompliance<t.lowTrainingCompliance.trainingCompliance/100) {
    const pct = (m.trainingCompliance*100).toFixed(0);
    ins.push({ severity: m.trainingCompliance<(cfg.rag.trainingCompliance.yellowMin/100*0.75)?'critical':'warning', products:['denial-iq'], title:'Training compliance gap may be driving avoidable denials',
      detail:`${pct}% training compliance. Undertrained staff are more likely to generate avoidable denials due to coding errors, missing authorizations, and incorrect claim submission${m.overdueTraining?` - ${m.overdueTraining} module(s) are currently overdue`:''}. `,
      actions:[
        { priority:'high',   label:`Complete ${m.overdueTraining??'all'} overdue training module(s)`,            link:'/app/training',                          product:'Training'    },
        { priority:'medium', label:'Review denial analytics and match drivers to training gaps',                  link:'/app/insightflow/view/denials',          product:'InsightFlow' },
        { priority:'low',    label:'Review staff training completion and schedule upcoming sessions',             link:'/app/training',                          product:'Training'    },
      ]});
  }

  const order: Record<Severity,number> = { critical:0, warning:1, info:2 };
  return ins.sort((a,b) => order[a.severity]-order[b.severity]);
}

function buildActionQueue(insights: CrossProductInsight[]): ActionItem[] {
  const seen = new Set<string>(); const queue: ActionItem[] = [];
  for (const sev of ['critical','warning','info'] as Severity[])
    for (const ins of insights.filter(i=>i.severity===sev))
      for (const a of ins.actions)
        if (!seen.has(a.label)) { seen.add(a.label); queue.push(a); }
  const pOrd: Record<Priority,number> = { high:0, medium:1, low:2 };
  return queue.sort((a,b)=>pOrd[a.priority]-pOrd[b.priority]);
}

export class ExecutiveSummaryController extends DatabaseConnectionController {
  constructor() { super(); }

  public getSummary = async (req: Request, res: Response): Promise<Response> => {
    // A null customer_id means the actor is not scoped to one tenant - a Super
    // Admin with see_all. Do not reject it and do not substitute a default: drop
    // the app-level filter and let the row-level security policy decide what the
    // actor may read. see_all returns every tenant, a scoped user is filtered to
    // their own, and an unscoped non-superadmin gets nothing because the policy
    // fails closed. Same pattern as benchmarking.ts.
    const xenCustId: number | null = (req as any).actor?.customer_id ?? null;
    const hasCust = xenCustId != null;

    const esNow = new Date();
    const esTwelveAgo = new Date(esNow); esTwelveAgo.setMonth(esNow.getMonth() - 12);
    const esStart = (req.query.start as string) || esTwelveAgo.toISOString().slice(0, 10);
    const esEnd   = (req.query.end   as string) || esNow.toISOString().slice(0, 10);

    const actorEmail      = (req as any).actor?.email ?? '';
    const isImpersonating = !!(req as any).actor?.impersonatedBy;
    const actorOid        = isImpersonating ? undefined : req.headers['x-actor-oid'] as string | undefined;

    const _t0 = Date.now();
    const _lap = (label: string) => { logger.info(`[ExecSummary] ${label} +${Date.now()-_t0}ms`); };

    // -- Setup: thresholds + user scope in parallel ----------------------------
    const [cfg, scope] = await Promise.all([
      loadThresholds(this.pool),
      resolveUserScope(this.pool, actorEmail, xenCustId, actorOid),
    ]);
    _lap('setup done');

    const custWhere   = hasCust ? `AND customer_id = @_custId`    : '';
    const custWhereRR = hasCust ? `AND rr.customer_id = @_custId` : '';
    const custWhereCH = hasCust ? `AND ch.customer_id = @_custId` : '';
    const addCustInput = (r: sql.Request) => { if (hasCust) r.input('_custId', sql.Int, xenCustId); r.input('_start', sql.NVarChar, esStart); r.input('_end', sql.NVarChar, esEnd); };

    let scopeWhere   = '';
    let scopeWhereRR = '';
    const scopeLocBinders: Array<(r: sql.Request) => void> = [];
    if (scope.locations.length > 0) {
      const params = scope.locations.map((_, i) => `@_sLoc${i}`);
      const inClause = `IN (${params.join(', ')})`;
      scopeWhere   = `AND Location ${inClause}`;
      scopeWhereRR = `AND rr.Location ${inClause}`;
      scopeLocBinders.push((r) => scope.locations.forEach((v, i) => r.input(`_sLoc${i}`, sql.NVarChar(255), v)));
    }
    const addScopeInputs = (r: sql.Request) => scopeLocBinders.forEach(fn => fn(r));

    const toQArr = (v: unknown): string[] => {
      if (!v) return [];
      return Array.isArray(v) ? (v as string[]).filter(Boolean) : [String(v)];
    };
    const qPayers    = toQArr(req.query.payers);
    const qProviders = toQArr(req.query.providers);
    const qLocations = toQArr(req.query.locations);
    const qPractices = toQArr(req.query.practices);

    let filterWhere   = '';
    let filterWhereRR = '';
    const filterBinders: Array<(r: sql.Request) => void> = [];

    if (qPayers.length) {
      const ps = qPayers.map((_, i) => `@_fPay${i}`);
      filterWhere   += ` AND InsuranceName IN (${ps.join(',')})`;
      filterWhereRR += ` AND rr.InsuranceName IN (${ps.join(',')})`;
      filterBinders.push(r => qPayers.forEach((v, i) => r.input(`_fPay${i}`, sql.NVarChar(255), v)));
    }
    if (qProviders.length) {
      const ps = qProviders.map((_, i) => `@_fProv${i}`);
      filterWhere   += ` AND ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType='Charge' AND ProviderName IN (${ps.join(',')}))`;
      filterWhereRR += ` AND rr.ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType='Charge' AND ProviderName IN (${ps.join(',')}))`;
      filterBinders.push(r => qProviders.forEach((v, i) => r.input(`_fProv${i}`, sql.NVarChar(255), v)));
    }
    if (qLocations.length) {
      const ps = qLocations.map((_, i) => `@_fLoc${i}`);
      filterWhere   += ` AND Location IN (${ps.join(',')})`;
      filterWhereRR += ` AND rr.Location IN (${ps.join(',')})`;
      filterBinders.push(r => qLocations.forEach((v, i) => r.input(`_fLoc${i}`, sql.NVarChar(255), v)));
    }
    if (qPractices.length) {
      const ps = qPractices.map((_, i) => `@_fPrac${i}`);
      filterWhere   += ` AND Location IN (${ps.join(',')})`;
      filterWhereRR += ` AND rr.Location IN (${ps.join(',')})`;
      filterBinders.push(r => qPractices.forEach((v, i) => r.input(`_fPrac${i}`, sql.NVarChar(255), v)));
    }
    const addFilterInputs = (r: sql.Request) => filterBinders.forEach(fn => fn(r));

    // Helper: new request with all standard inputs pre-bound
    const mkFull = () => { const r = this.pool.request(); addCustInput(r); addScopeInputs(r); addFilterInputs(r); return r; };
    const mkCust = () => { const r = this.pool.request(); addCustInput(r); return r; };
    // Workforce filter - scope to specialists handling matching claims when filters active
    const wfFilterExists = filterWhere
      ? `AND EXISTS (SELECT 1 FROM dbo.recon_report rr WHERE rr.ClaimID = ch.ClaimID AND rr.TrxType = 'Charge' ${filterWhereRR})`
      : '';
    const mkWf = () => { const r = this.pool.request(); addCustInput(r); addFilterInputs(r); return r; };

    // Per-query failure capture: log the reason (no silent failure) AND record it so the
    // section can be surfaced as a degraded 'error' card instead of vanishing.
    const qErr: Record<string, string> = {};
    const capErr = (key: string, label: string) => (e: any) => {
      const msg = e && e.message ? e.message : String(e);
      logger.error('[ExecSummary] ' + label + ' query failed: ' + msg);
      qErr[key] = msg;
      return null;
    };

    // -- All queries in parallel ------------------------------------------------
    const [
      denialRs,
      collRs,
      arRs,
      topPayersRs,
      concRs,
      kpiRs,
      wfRs,
      resolvedRs,
      staffByProdRs,
      trainRs,
      ruRs,
      totalUsersRs,
    ] = await Promise.all([

      // 1. Denial IQ - recon_report aggregate.
      // The "recovered" flag (denied claim that later received a Payment) is precomputed in a
      // `paid` CTE and LEFT JOINed - a subquery nested inside COUNT(DISTINCT CASE ...) is invalid
      // T-SQL ("Cannot perform an aggregate function on an expression containing ... a subquery")
      // and made this query 500 every time, silently dropping the Denial card.
      mkFull().query(`
        WITH src AS (
          SELECT ClaimID, IsClaimDenied, TrxType, TrxAmt
          FROM recon_report
          WHERE DateOfService BETWEEN @_start AND @_end ${custWhere} ${scopeWhere} ${filterWhere}
        ),
        paid AS ( SELECT DISTINCT ClaimID FROM recon_report WHERE TrxType = 'Payment' )
        SELECT
          COUNT(DISTINCT CASE WHEN s.IsClaimDenied=1 AND s.TrxType='Charge' THEN s.ClaimID END) AS DeniedClaims,
          COUNT(DISTINCT CASE WHEN s.TrxType='Charge'                       THEN s.ClaimID END) AS TotalClaims,
          ISNULL(SUM(CASE WHEN s.IsClaimDenied=1 AND s.TrxType='Charge' THEN s.TrxAmt ELSE 0 END),0) AS DeniedCharges,
          COUNT(DISTINCT CASE WHEN s.IsClaimDenied=1 AND s.TrxType='Charge' AND p.ClaimID IS NOT NULL THEN s.ClaimID END) AS RecoveredClaims,
          COUNT(DISTINCT CASE WHEN s.IsClaimDenied=1 AND s.TrxType='Charge' THEN s.ClaimID END) AS TotalDenied,
          ISNULL(SUM(CASE WHEN s.TrxType='Charge'     THEN s.TrxAmt      ELSE 0 END),0) AS TotalCharges,
          ISNULL(SUM(CASE WHEN s.TrxType='Adjustment' THEN ABS(s.TrxAmt) ELSE 0 END),0) AS TotalAdjustments,
          ISNULL(SUM(CASE WHEN s.TrxType='Payment'    THEN s.TrxAmt      ELSE 0 END),0) AS TotalPayments
        FROM src s LEFT JOIN paid p ON p.ClaimID = s.ClaimID`)
        .catch(capErr('denial', 'denial-iq')),

      // 2. ReconIQ - collection rate
      mkFull().query(`
        SELECT
          ISNULL(SUM(CASE WHEN TrxType='Charge'     AND DateOfService BETWEEN @_start AND @_end THEN TrxAmt      ELSE 0 END),0) AS TotalCharges,
          ISNULL(SUM(CASE WHEN TrxType='Adjustment' AND PostDate      BETWEEN @_start AND @_end THEN ABS(TrxAmt) ELSE 0 END),0) AS TotalAdjustments,
          ISNULL(SUM(CASE WHEN TrxType='Payment'    AND PostDate      BETWEEN @_start AND @_end THEN TrxAmt      ELSE 0 END),0) AS TotalPayments
        FROM recon_report WHERE 1=1 ${custWhere} ${scopeWhere} ${filterWhere}`)
        .catch(capErr('coll', 'collection-rate')),

      // 3. ReconIQ - days in AR (full balance scan)
      mkFull().query(`
        SELECT
          SUM(
            CASE
              WHEN TrxType='Charge'
                THEN ISNULL(TrxAmt,0)
              WHEN TrxType IN ('Adjustment','Payment','Writeoff','Courtesy')
                AND PostDate IS NOT NULL AND PostDate <= GETDATE()
                THEN -ISNULL(TrxAmt,0)
              WHEN TrxType IN ('Refund','Recoupment','ReturnedCheck','Debit')
                AND PostDate IS NOT NULL AND PostDate <= GETDATE()
                THEN ISNULL(TrxAmt,0)
              ELSE 0
            END
          ) AS CurrentAR,
          SUM(CASE WHEN TrxType='Charge'
                    AND COALESCE(PostDate, DateOfService) > DATEADD(MONTH,-13,GETDATE())
                    AND COALESCE(PostDate, DateOfService) <= GETDATE()
                   THEN ISNULL(TrxAmt,0) ELSE 0 END) AS CurrentCharges13
        FROM dbo.recon_report
        WHERE 1=1 ${custWhere} ${scopeWhere} ${filterWhere}`)
        .catch(capErr('ar', 'ar-days')),

      // 4. Payer IQ - top 5 by denial rate
      mkFull().query(`
        SELECT TOP 5
          InsuranceName AS PayerName,
          COUNT(DISTINCT CASE WHEN IsClaimDenied=1 THEN ClaimID END) AS DeniedClaims,
          COUNT(DISTINCT ClaimID) AS TotalClaims,
          CAST(COUNT(DISTINCT CASE WHEN IsClaimDenied=1 THEN ClaimID END) AS float)
            / NULLIF(COUNT(DISTINCT ClaimID),0)*100 AS DenialRatePct
        FROM recon_report
        WHERE TrxType='Charge' AND DateOfService BETWEEN @_start AND @_end AND InsuranceName IS NOT NULL ${custWhere} ${scopeWhere} ${filterWhere}
        GROUP BY InsuranceName HAVING COUNT(DISTINCT ClaimID)>=5 ORDER BY DenialRatePct DESC`)
        .catch(capErr('payers', 'payer-top5')),

      // 5. Payer IQ - top payer concentration
      mkFull().query(`
        SELECT TOP 1 InsuranceName,
          SUM(TrxAmt) AS TopPayerCharges,
          (SELECT ISNULL(SUM(TrxAmt),1) FROM recon_report WHERE TrxType='Charge' AND DateOfService BETWEEN @_start AND @_end ${custWhere} ${scopeWhere} ${filterWhere}) AS TotalCharges
        FROM recon_report
        WHERE TrxType='Charge' AND DateOfService BETWEEN @_start AND @_end AND InsuranceName IS NOT NULL ${custWhere} ${scopeWhere} ${filterWhere}
        GROUP BY InsuranceName ORDER BY TopPayerCharges DESC`)
        .catch(capErr('conc', 'payer-conc')),

      // 6. KPI - open claim aging
      mkFull().query(`
        SELECT COUNT(*) AS TotalOpen,
               ISNULL(SUM(CASE WHEN DATEDIFF(DAY, c.DOS, GETDATE()) > 90 THEN 1 ELSE 0 END), 0) AS Over90
        FROM (
          SELECT rr.ClaimID, MAX(rr.DateOfService) AS DOS
          FROM dbo.recon_report rr
          WHERE rr.TrxType = 'Charge'
            AND rr.DateOfService >= DATEADD(YEAR,-2,GETDATE()) ${custWhereRR} ${scopeWhereRR} ${filterWhereRR}
          GROUP BY rr.ClaimID
        ) c
        WHERE NOT EXISTS (
          SELECT 1 FROM dbo.recon_report p
          WHERE p.ClaimID = c.ClaimID AND p.TrxType = 'Payment' ${custWhereRR.replace(/\brr\./g, 'p.')} ${scopeWhereRR.replace(/\brr\./g, 'p.')} ${filterWhereRR.replace(/\brr\./g, 'p.')}
        )`)
        .catch(capErr('kpi', 'kpi-aging')),

      // 7. Workforce - active specialists + open queue
      mkWf().query(`
        SELECT COUNT(DISTINCT ch.AssignedTo) AS ActiveSpecialists, COUNT(*) AS TotalOpen,
          CASE WHEN COUNT(DISTINCT ch.AssignedTo)>0 THEN CAST(COUNT(*) AS float)/COUNT(DISTINCT ch.AssignedTo) ELSE 0 END AS AvgQueue
        FROM dbo.claimhistory ch WHERE ch.ClaimWorkEndedTime IS NULL AND ch.AssignedTo IS NOT NULL ${custWhereCH}
        ${wfFilterExists}`)
        .catch(capErr('wf', 'workforce-queue')),

      // 8. Workforce - resolved in last 30 days
      mkWf().query(`
        SELECT COUNT(*) AS Resolved30 FROM dbo.claimhistory ch
        WHERE ch.ClaimWorkEndedTime IS NOT NULL AND ch.ClaimWorkEndedTime>=DATEADD(DAY,-30,GETDATE()) ${custWhereCH}
        ${wfFilterExists}`)
        .catch(e => { logger.error('[ExecSummary] workforce-resolved query failed: ' + (e && e.message ? e.message : String(e))); return null; }),

      // 9. Staff by product (silently skipped if UserProducts table absent)
      mkCust().query(`
        SELECT p.name AS ProductName, COUNT(DISTINCT u.id) AS StaffCount
        FROM dbo.users u
        JOIN dbo.UserProducts up ON up.user_id = u.id
        JOIN dbo.Products p ON p.id = up.product_id
        WHERE u.role IN ('ar-specialist','manager','Admin') ${hasCust ? 'AND u.customer_id = @_custId' : ''}
        GROUP BY p.name
        ORDER BY StaffCount DESC`)
        .catch(() => null),

      // 10. Training compliance
      mkCust().query(`
        SELECT COUNT(*) AS Total,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS Completed,
          SUM(CASE WHEN dueDate IS NOT NULL AND dueDate<GETDATE() AND status!='completed' THEN 1 ELSE 0 END) AS Overdue
        FROM dbo.TrainingAssignments WHERE ${hasCust ? 'customer_id = @_custId' : '1=1'}`)
        .catch(capErr('train', 'training')),

      // 11. Report usage (PageVisits)
      mkCust().query(`
        SELECT
          pv.product_slug AS ProductSlug,
          COUNT(DISTINCT pv.user_email) AS UniqueUsers,
          COUNT(*) AS TotalViews,
          ISNULL(AVG(pv.duration_seconds), 0) AS AvgDuration
        FROM dbo.PageVisits pv
        JOIN dbo.users u ON u.email = pv.user_email ${hasCust ? 'AND u.customer_id = @_custId' : ''}
        WHERE pv.entered_at >= DATEADD(DAY, -30, GETDATE())
          AND pv.product_slug IS NOT NULL AND pv.product_slug != ''
        GROUP BY pv.product_slug
        ORDER BY TotalViews DESC`)
        .catch(capErr('ru', 'report-usage')),

      // 12. Total staff count
      mkCust().query(`
        SELECT COUNT(*) AS Total FROM dbo.users WHERE role != 'Super Admin' ${hasCust ? 'AND customer_id = @_custId' : ''}`)
        .catch(e => { logger.error('[ExecSummary] total-users query failed: ' + (e && e.message ? e.message : String(e))); return null; }),
    ]);

    _lap('all queries done');

    // -- Process results --------------------------------------------------------
    const sections: Record<string, SummarySection> = {};
    const m: Metrics = {
      denialRate:null, recoveryRate:null, collectionRate:null, daysInAR:null, pctAging90:null,
      avgQueueSize:null, activeSpecialists:null, openDenials:null, revenueAtRisk:null,
      topPayerConcentration:null, topPayerName:null, trainingCompliance:null, overdueTraining:null,
      reportAdoption:null,
    };

    // Denial IQ
    if (denialRs) {
      const d = denialRs.recordset[0];
      m.denialRate    = d.TotalClaims>0 ? (d.DeniedClaims/d.TotalClaims)*100 : 0;
      m.recoveryRate  = d.TotalDenied>0 ? (d.RecoveredClaims/d.TotalDenied)*100 : 100;
      m.openDenials   = Math.max(0, d.DeniedClaims-d.RecoveredClaims);
      const adjCharges = d.TotalCharges - d.TotalAdjustments;
      const netRate    = adjCharges > 0 ? d.TotalPayments / adjCharges : 0;
      m.revenueAtRisk  = Math.round(d.DeniedCharges * netRate);

      const dr = cfg.rag.denialRate;
      const rr = cfg.rag.recoveryRate;
      const status = worst(ragBelow(m.denialRate, dr.greenMax, dr.yellowMax), ragAbove(m.recoveryRate, rr.greenMin, rr.yellowMin));
      const alerts: SectionAlert[] = [];
      if (m.denialRate>dr.yellowMax) alerts.push({ severity:'critical', message:`Denial rate of ${m.denialRate.toFixed(1)}% exceeds the ${dr.yellowMax}% critical threshold.`, actions:[{ priority:'high', label:'Analyze the drivers behind these denials', link:'/app/insightflow/view/denials', product:'InsightFlow' }] });
      else if (m.denialRate>dr.greenMax) alerts.push({ severity:'warning', message:`Denial rate of ${m.denialRate.toFixed(1)}% is above the ${dr.greenMax}% target.`, actions:[{ priority:'medium', label:'Review denial trends and reason codes', link:'/app/insightflow/view/denials', product:'InsightFlow' }] });
      if (m.recoveryRate<rr.yellowMin) alerts.push({ severity:'critical', message:`Recovery rate of ${m.recoveryRate.toFixed(1)}% \u2014 most denied claims are being written off.`, actions:[{ priority:'high', label:'Review appeal success rates by payer and CARC code', link:'/app/insightflow/view/appeal-success', product:'InsightFlow' }] });

      sections['denial-iq'] = { slug:'denial-iq', label:'Denial Management', status, alerts, kpis:[
        { key:'deniedClaims',  label:'Denied Claims',            value:d.DeniedClaims,       format:'number'   },
        { key:'deniedCharges', label:'Denied Charges',           value:d.DeniedCharges,      format:'currency' },
        { key:'denialRate',    label:'Denial Rate',              value:m.denialRate/100,     format:'percent'  },
        { key:'recoveryRate',  label:'Recovery Rate',            value:m.recoveryRate/100,   format:'percent'  },
        { key:'openDenials',   label:'Non-Recoverable Denials',  value:m.openDenials,        format:'number'   },
        { key:'atRisk',        label:'Revenue at Risk',          value:m.revenueAtRisk,      format:'currency' },
      ]};
    }

    // ReconIQ
    if (collRs && arRs) {
      const rc = collRs.recordset[0];
      const adjustedCharges = rc.TotalCharges - rc.TotalAdjustments;
      m.collectionRate = adjustedCharges > 0 ? (rc.TotalPayments / adjustedCharges) * 100 : 0;

      const arRow = arRs.recordset[0];
      const currentAR = Number(arRow?.CurrentAR ?? 0);
      const charges13 = Number(arRow?.CurrentCharges13 ?? 0);
      m.daysInAR = charges13 > 0 ? Math.round(currentAR / (charges13 / 395.0)) : null;

      const cr = cfg.rag.collectionRate;
      const ar = cfg.rag.daysInAR;
      const status = worst(ragAbove(m.collectionRate, cr.greenMin, cr.yellowMin), ragBelow(m.daysInAR ?? 0, ar.greenMax, ar.yellowMax));
      const alerts: SectionAlert[] = [];
      if (m.collectionRate<cr.yellowMin) alerts.push({ severity:'critical', message:`Collection rate of ${m.collectionRate.toFixed(1)}% \u2014 ~${(100-m.collectionRate).toFixed(0)}% of billed charges uncollected.`, actions:[{ priority:'high', label:'Review RCM collections breakdown by practice', link:'/app/insightflow/view/rcm', product:'InsightFlow' }] });
      if (m.daysInAR !== null && m.daysInAR > ar.yellowMax) alerts.push({ severity:'critical', message:`${m.daysInAR.toFixed(0)} days in AR is critically above the ${ar.greenMax}-day benchmark.`, actions:[{ priority:'high', label:'View AR aging buckets by location', link:'/app/insightflow/view/ar', product:'InsightFlow' }] });
      else if (m.daysInAR !== null && m.daysInAR > ar.greenMax) alerts.push({ severity:'warning', message:`${m.daysInAR.toFixed(0)} days in AR is approaching the critical threshold.`, actions:[{ priority:'medium', label:'View AR aging buckets by location', link:'/app/insightflow/view/ar', product:'InsightFlow' }] });

      sections['recon-iq'] = { slug:'recon-iq', label:'Revenue Reconciliation', status, alerts, kpis:[
        { key:'totalCharged',   label:'Total Charged',       value:rc.TotalCharges,      format:'currency' },
        { key:'totalCollected', label:'Total Collected',     value:rc.TotalPayments,     format:'currency' },
        { key:'collectionRate', label:'Net Collection Rate', value:m.collectionRate/100, format:'percent'  },
        { key:'daysInAR',       label:'Days in AR',          value:m.daysInAR,           format:'number'   },
      ]};
    }

    // Payer IQ
    if (topPayersRs || concRs) {
      const concRow = concRs?.recordset[0];
      m.topPayerConcentration = concRow && concRow.TotalCharges>0 ? (concRow.TopPayerCharges/concRow.TotalCharges)*100 : 0;
      m.topPayerName = concRow?.InsuranceName ?? null;

      const topPayers = (topPayersRs?.recordset ?? []).map((row: any) => ({
        payerName:row.PayerName, denialRate:row.DenialRatePct/100, deniedCount:row.DeniedClaims, totalCount:row.TotalClaims,
      }));
      const avgPayerDenial = topPayers.length>0 ? topPayers.reduce((s:number,p:any)=>s+p.denialRate*100,0)/topPayers.length : 0;

      const pc = cfg.rag.payerConcentration;
      const status = worst(ragBelow(m.topPayerConcentration, pc.greenMax, pc.yellowMax), ragBelow(avgPayerDenial, cfg.rag.denialRate.greenMax, cfg.rag.denialRate.yellowMax));
      const alerts: SectionAlert[] = [];
      if (m.topPayerConcentration!>pc.greenMax) alerts.push({ severity:m.topPayerConcentration!>pc.yellowMax?'critical':'warning', message:`${m.topPayerName} represents ${m.topPayerConcentration!.toFixed(0)}% of total charges \u2014 concentration risk.`, actions:[{ priority:'high', label:`Review ${m.topPayerName} underpayments and denial patterns`, link:'/app/payer-iq/underpayments', product:'Payer IQ' }] });

      sections['payer-iq'] = { slug:'payer-iq', label:'Payer Risk Exposure', status, alerts, topPayers, kpis:[
        { key:'topPayerConc',  label:'Top Payer Concentration', value:m.topPayerConcentration!/100, format:'percent' },
        { key:'highRiskCount', label:'High-Risk Payers (6mo)',  value:topPayers.length,             format:'number'  },
      ]};
    }

    // KPI - aging
    if (kpiRs) {
      const { TotalOpen, Over90 } = kpiRs.recordset[0];
      m.pctAging90 = TotalOpen>0 ? (Over90/TotalOpen)*100 : 0;

      const ag = cfg.rag.pctAging90;
      const status = ragBelow(m.pctAging90, ag.greenMax, ag.yellowMax);
      const alerts: SectionAlert[] = [];
      if (m.pctAging90>ag.yellowMax) alerts.push({ severity:'critical', message:`${m.pctAging90.toFixed(0)}% of open claims aged >90 days \u2014 prioritize these immediately.`, actions:[{ priority:'high', label:'Open manager claim queue \u2014 review and assign aged claims', link:'/app/denial-iq/claim-queue/manager', queryParams:{ tab:'all' }, product:'Denial IQ' }] });

      sections['kpi'] = { slug:'kpi', label:'Key Performance Indicators', status, alerts, kpis:[
        { key:'totalOpen', label:'Total Open Claims', value:TotalOpen,          format:'number'  },
        { key:'over90',    label:'Aged >90 Days',     value:Over90,             format:'number'  },
        { key:'pctAging',  label:'% Aging >90 Days',  value:m.pctAging90/100,  format:'percent' },
      ]};
    }

    // Workforce
    if (wfRs) {
      const w = wfRs.recordset[0];
      m.avgQueueSize = w.AvgQueue; m.activeSpecialists = w.ActiveSpecialists;

      const staffByProduct: { product: string; staffCount: number }[] =
        (staffByProdRs?.recordset ?? []).map((row: any) => ({ product: row.ProductName, staffCount: row.StaffCount }));

      const qs = cfg.rag.avgQueueSpecialist;
      const status = ragBelow(m.avgQueueSize, qs.greenMax, qs.yellowMax);
      const alerts: SectionAlert[] = [];
      if (m.avgQueueSize!=null && m.avgQueueSize>qs.yellowMax) alerts.push({ severity:'critical', message:`Average queue of ${m.avgQueueSize.toFixed(0)} claims/specialist exceeds the ${qs.yellowMax}-claim threshold.`, actions:[{ priority:'high', label:'Review unassigned claims and configure routing rules', link:'/app/denial-iq/claim-queue/manager', queryParams:{ tab:'unassigned' }, product:'Denial IQ' }] });

      sections['workforce'] = { slug:'workforce', label:'Staffing Efficiency', status, alerts, staffByProduct, kpis:[
        { key:'specialists', label:'Active Specialists',     value:w.ActiveSpecialists,                                         format:'number' },
        { key:'openQueue',   label:'Open Claims Queue',      value:w.TotalOpen,                                                 format:'number' },
        { key:'avgQueue',    label:'Avg Queue / Specialist', value:Math.round(m.avgQueueSize!),                                  format:'number' },
        { key:'resolved30',  label:'Resolved (30d)',         value:resolvedRs?.recordset[0]?.Resolved30 ?? 0,                   format:'number' },
      ]};
    }

    // Training
    if (trainRs) {
      const t = trainRs.recordset[0];
      m.trainingCompliance = t.Total>0 ? t.Completed/t.Total : 1;
      m.overdueTraining    = t.Overdue;

      const tc = cfg.rag.trainingCompliance;
      const status = ragAbove(m.trainingCompliance, tc.greenMin/100, tc.yellowMin/100);
      const alerts: SectionAlert[] = [];
      if (m.trainingCompliance<tc.yellowMin/100) alerts.push({ severity:m.trainingCompliance<(tc.yellowMin/100*0.75)?'critical':'warning', message:`${(m.trainingCompliance*100).toFixed(0)}% compliance \u2014 ${m.overdueTraining} assignment(s) overdue.`, actions:[{ priority:'high', label:'View and complete overdue training assignments', link:'/app/training', product:'Training' }] });

      sections['training'] = { slug:'training', label:'Training Compliance', status, alerts, kpis:[
        { key:'compliance', label:'Compliance Rate', value:m.trainingCompliance, format:'percent' },
        { key:'completed',  label:'Completed',       value:t.Completed,          format:'number'  },
        { key:'overdue',    label:'Overdue',          value:t.Overdue,            format:'number'  },
      ]};
    }

    // Report usage
    if (ruRs) {
      const reportUsage = ruRs.recordset.map((row: any) => ({
        product: row.ProductSlug, uniqueUsers: row.UniqueUsers, totalViews: row.TotalViews, avgDuration: Math.round(row.AvgDuration),
      }));

      const totalStaff = totalUsersRs?.recordset[0]?.Total ?? 1;
      const maxProductUsers = ruRs.recordset.length > 0
        ? ruRs.recordset.reduce((s: number, r: any) => Math.max(s, Number(r.UniqueUsers || 0)), 0)
        : 0;
      const activeReportUsers = Math.min(maxProductUsers, totalStaff);
      m.reportAdoption = totalStaff > 0 ? (activeReportUsers / totalStaff) * 100 : 0;

      const ruc = cfg.rag.reportUsage;
      const status = ragAbove(m.reportAdoption, ruc.greenMin, ruc.yellowMin);
      const alerts: SectionAlert[] = [];
      if (m.reportAdoption < ruc.yellowMin) alerts.push({ severity: status === 'red' ? 'critical' : /* istanbul ignore next */ 'warning', message:`Only ${m.reportAdoption.toFixed(0)}% of staff are actively using reports \u2014 low adoption may indicate training gaps or usability issues.`, actions:[{ priority:'medium', label:'Review staff activity and platform usage', link:'/app/manager/activity', product:'Workforce' }] });

      const totalViews = reportUsage.reduce((s, r) => s + r.totalViews, 0);
      const maxUnique  = reportUsage.reduce((s, r) => Math.max(s, r.uniqueUsers), 0);

      sections['report-usage'] = { slug:'report-usage', label:'Report Usage Efficiency', status, alerts, reportUsage, kpis:[
        { key:'activeUsers',  label:'Active Report Users (30d)', value:maxUnique,             format:'number'  },
        { key:'totalViews',   label:'Total Report Views (30d)',  value:totalViews,            format:'number'  },
        { key:'adoption',     label:'Staff Adoption Rate',       value:m.reportAdoption/100, format:'percent' },
        { key:'products',     label:'Products Used',             value:reportUsage.length,   format:'number'  },
      ]};
    }

    // -- Surface failed sections as degraded 'error' cards (no silent drop) -----
    // A query that 500'd is recorded in qErr; if its section did not build, emit an
    // explicit error section so the UI renders "failed to load: <reason>" instead of
    // the card vanishing (which is exactly how the denial card disappeared unnoticed).
    const errSection = (slug: string, label: string, msg: string) => {
      if (sections[slug]) return;
      sections[slug] = { slug, label, status:'error', message:'Failed to load: ' + msg, kpis:[], alerts:[] };
    };
    if (qErr.denial)              errSection('denial-iq',    'Denial Management',            qErr.denial);
    if (qErr.coll || qErr.ar)     errSection('recon-iq',     'Revenue Reconciliation',       qErr.coll || qErr.ar);
    if (qErr.payers || qErr.conc) errSection('payer-iq',     'Payer Risk Exposure',          qErr.payers || qErr.conc);
    if (qErr.kpi)                 errSection('kpi',          'Key Performance Indicators',   qErr.kpi);
    if (qErr.wf)                  errSection('workforce',    'Staffing Efficiency',          qErr.wf);
    if (qErr.train)               errSection('training',     'Training Compliance',          qErr.train);
    if (qErr.ru)                  errSection('report-usage', 'Report Usage Efficiency',      qErr.ru);

    // -- Insights + action queue + overall -------------------------------------
    const crossProductInsights = deriveInsights(m, cfg);
    const actionQueue          = buildActionQueue(crossProductInsights);
    const statuses             = Object.values(sections).map(s => s.status);
    const criticalCount        = statuses.filter(s=>s==='red').length;
    const warningCount         = statuses.filter(s=>s==='yellow').length;
    const okCount              = statuses.filter(s=>s==='green').length;
    const errorCount           = statuses.filter(s=>s==='error').length;
    const overallStatus: Status = criticalCount>0 ? 'red' : (warningCount>0 || errorCount>0) ? 'yellow' : 'green';

    _lap('done');

    return res.json({ generatedAt:new Date().toISOString(), period:{ start:esStart, end:esEnd }, overallStatus, criticalCount, warningCount, okCount, errorCount, sections, crossProductInsights, actionQueue });
  };

  // -- On-demand AI narrative - called explicitly by the user, not on page load --
  public getNarrative = async (req: Request, res: Response): Promise<Response> => {
    // See getSummary: a null tenant is delegated to the security policy, not
    // rejected and not defaulted.
    const xenCustId: number | null = (req as any).actor?.customer_id ?? null;
    const hasCust = xenCustId != null;

    const now = new Date();
    const twelveAgo = new Date(now); twelveAgo.setMonth(now.getMonth() - 12);
    const esStart = (req.query.start as string) || twelveAgo.toISOString().slice(0, 10);
    const esEnd   = (req.query.end   as string) || now.toISOString().slice(0, 10);

    try {
      const custWhere = hasCust ? `AND customer_id = @_custId` : '';
      const r = this.pool.request();
      if (hasCust) r.input('_custId', sql.Int, xenCustId);
      r.input('_start', sql.NVarChar, esStart);
      r.input('_end',   sql.NVarChar, esEnd);

      const chRequest = this.pool.request();
      if (hasCust) chRequest.input('_custId', sql.Int, xenCustId);

      // Two lightweight queries to get the key metrics for the prompt
      const [denialRs, arRs] = await Promise.all([
        r.query(`
          SELECT
            COUNT(DISTINCT CASE WHEN IsClaimDenied=1 AND TrxType='Charge' THEN ClaimID END) AS DeniedClaims,
            COUNT(DISTINCT CASE WHEN TrxType='Charge' THEN ClaimID END) AS TotalClaims,
            ISNULL(SUM(CASE WHEN TrxType='Charge' THEN TrxAmt ELSE 0 END),0) AS TotalCharges,
            ISNULL(SUM(CASE WHEN TrxType='Payment' THEN TrxAmt ELSE 0 END),0) AS TotalPayments,
            ISNULL(SUM(CASE WHEN TrxType='Adjustment' THEN ABS(TrxAmt) ELSE 0 END),0) AS TotalAdjustments,
            ISNULL(SUM(CASE WHEN IsClaimDenied=1 AND TrxType='Charge' THEN TrxAmt ELSE 0 END),0) AS DeniedCharges
          FROM dbo.recon_report WHERE DateOfService BETWEEN @_start AND @_end ${custWhere}`),
        chRequest.query(`
          SELECT COUNT(DISTINCT ch.AssignedTo) AS ActiveSpecialists,
                 COUNT(*) AS OpenQueue
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkEndedTime IS NULL AND ch.AssignedTo IS NOT NULL ${hasCust ? 'AND ch.customer_id = @_custId' : ''}`),
      ]);

      const d = denialRs.recordset[0];
      const w = arRs.recordset[0];
      const denialRate     = d.TotalClaims > 0 ? (d.DeniedClaims / d.TotalClaims * 100).toFixed(1) : 'N/A';
      const adjCharges     = d.TotalCharges - d.TotalAdjustments;
      const collectionRate = adjCharges > 0 ? (d.TotalPayments / adjCharges * 100).toFixed(1) : 'N/A';

      const metricsStr = [
        `Denial Rate: ${denialRate}%`,
        `Collection Rate: ${collectionRate}%`,
        `Open Denials: ${d.DeniedClaims}`,
        `Revenue at Risk: $${Math.round(d.DeniedCharges).toLocaleString()}`,
        `Active AR Specialists: ${w.ActiveSpecialists}`,
        `Open Claim Queue: ${w.OpenQueue}`,
      ].join(', ');

      const narrative = await ollama.generate(
        `You are an executive RCM analyst. In 2-3 sentences, summarize these revenue cycle metrics for a dental practice manager. Highlight the most important finding and recommend one priority action. Be specific and concise.\n\nMetrics: ${metricsStr}`,
        { temperature: 0.4, maxTokens: 300 },
      );

      return res.json({ narrative });
    } catch (err: any) {
      // The narrative needs a local Ollama (OLLAMA_BASE_URL). A fresh install
      // has none, so an unreachable model server is an unconfigured optional
      // feature, not a server fault - say so with 503 instead of a blanket 500,
      // which made every first install look broken.
      const msg = err?.message ?? String(err);
      const unreachable = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up|fetch failed/i.test(msg);
      if (unreachable) {
        logger.warn('[ExecSummary] narrative model server unreachable', { err: msg, alert: 'OLLAMA_NOT_CONFIGURED' });
        return res.status(503).json({
          message: 'AI narrative is unavailable: no model server is reachable. Set OLLAMA_BASE_URL to enable it.',
          code: 'AI_NARRATIVE_UNAVAILABLE',
        });
      }
      logger.error('[ExecSummary] getNarrative error', { err: msg, alert: 'EXEC_NARRATIVE_FAILED' });
      return res.status(500).json({ message: 'Failed to generate narrative.' });
    }
  };
}
