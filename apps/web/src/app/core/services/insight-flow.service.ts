// src/app/core/services/insightflow.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { IRow } from '../models/payer-mix.models';
import { environment } from '../../../environments/environment';

export interface SectionHealth {
  section: string;
  status: 'green' | 'yellow' | 'red';
  metric: string;
  updatedAt: string;
}

export interface FinancialOverviewData {
  todayProduction: number;
  latestDay: string | null;
  mtdProduction: number;
  ytdProduction: number;
  mtdCollections: number;
  ytdCollections: number;
  outstandingAR: number;
  mtdWriteOffs: number;
  trend: { Month: string; Production: number }[];
  productionArrow: 'up' | 'down' | 'flat';
}

export interface InsightflowKpiPeriod {
  window: string;
  start: string;
  end: string;
}

export interface InsightflowKpiYoy {
  grossCollectionRate: number | null;
  netCollectionRate: number | null;
  denialRate: number | null;
}

export interface ArAgingBuckets {
  current: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

export interface RawRevenue {
  grossCharges: number;
  adjustments: number;
  netRevenue: number;
  payments: number;
  writeoffs: number;
  netOutstanding: number;
}

export interface InsightflowKpiData {
  period: InsightflowKpiPeriod;
  rawRevenue?: RawRevenue;
  arAgingBuckets?: ArAgingBuckets;
  grossCollectionRate: number | null;
  netCollectionRate: number | null;
  selfPayCollectionRate: number | null;
  denialRate: number | null;
  firstPassRate: number | null;
  daysInAR: number | null;
  avgDaysToPayment: number | null;
  avgDaysToDenial: number | null;
  avgDaysToWriteOff: number | null;
  arAging90PlusPct: number | null;
  writeOffRate: number | null;
  cleanClaimRate: number | null;
  costToCollect: number | null;
  denialOverturnRate: number | null;
  avgReimbursementPerClaim: number | null;
  yoy?: InsightflowKpiYoy;
}

export interface ProviderDailyProductionRow {
  providerName: string;
  dayDate: string;
  production: number;
  dailyGoal: number | null;
  weekProduction: number;
  weeklyGoal: number | null;
  pctOfDailyGoal: number | null;
  pctOfWeeklyGoal: number | null;
  rag: 'green' | 'amber' | 'red' | 'none';
}

@Injectable({ providedIn: 'root' })
export class InsightflowService {
  private readonly baseUrl = `${environment.server.baseUrl}/insightflow`;
  private readonly xenReportsUrl = `${environment.server.baseUrl}/insightflow/reports`;

  constructor(private http: HttpClient) {}

  getCollectionsByPracticeGroup$(userId: number | string = 1): Observable<IRow[]> {
    const params = new HttpParams().set('user_id', String(userId));
    return this.http.post<IRow[]>(
      `${this.baseUrl}/collections/all`,
      {},
      { params }
    );
  }

  getHealth(): Observable<{ sections: SectionHealth[] }> {
    return this.http.get<{ sections: SectionHealth[] }>(`${this.baseUrl}/health`);
  }

  getKpis(start?: string, end?: string, yoy = false, payers?: string[], providers?: string[], locations?: string[]): Observable<InsightflowKpiData> {
    let params = new HttpParams();
    if (start) params = params.set('start', start);
    if (end)   params = params.set('end', end);
    if (yoy)   params = params.set('yoy', 'true');
    payers?.forEach(v => params = params.append('payers', v));
    providers?.forEach(v => params = params.append('providers', v));
    locations?.forEach(v => params = params.append('locations', v));
    return this.http.get<{ data: InsightflowKpiData }>(`${this.baseUrl}/kpis`, { params })
      .pipe(map((res: { data: InsightflowKpiData }) => res.data));
  }

  // -- Financial Overview (shared reports) --------------------------------------

  getFinancialOverview(locations?: string[], payers?: string[], providers?: string[]): Observable<FinancialOverviewData> {
    const p = new URLSearchParams();
    locations?.forEach(l => p.append('locations', l));
    payers?.forEach(v => p.append('payers', v));
    providers?.forEach(v => p.append('providers', v));
    const qs = p.toString();
    return this.http.get<FinancialOverviewData>(`${this.xenReportsUrl}/provider-dashboard${qs ? '?' + qs : ''}`);
  }

  getWriteOffs(dateFrom: string, dateTo: string, locations?: string[], payers?: string[], providers?: string[]): Observable<{ byProvider: any[]; byType: any[]; summary: any }> {
    const p = new URLSearchParams({ dateFrom, dateTo });
    locations?.forEach(l => p.append('locations', l));
    payers?.forEach(v => p.append('payers', v));
    providers?.forEach(v => p.append('providers', v));
    return this.http.get<any>(`${this.xenReportsUrl}/write-offs?${p.toString()}`);
  }

  getWriteOffAnomalies(locations?: string[], payers?: string[], providers?: string[]): Observable<{ anomalies: any[] }> {
    const p = new URLSearchParams();
    locations?.forEach(l => p.append('locations', l));
    payers?.forEach(v => p.append('payers', v));
    providers?.forEach(v => p.append('providers', v));
    const qs = p.toString();
    return this.http.get<any>(`${this.xenReportsUrl}/write-off-anomalies${qs ? '?' + qs : ''}`);
  }

  getClaimVelocity(dateFrom: string, dateTo: string, locations?: string[], payers?: string[], providers?: string[]): Observable<{ overall: any; byPayer: any[] }> {
    const p = new URLSearchParams({ dateFrom, dateTo });
    locations?.forEach(l => p.append('locations', l));
    payers?.forEach(v => p.append('payers', v));
    providers?.forEach(v => p.append('providers', v));
    return this.http.get<any>(`${this.xenReportsUrl}/claim-velocity?${p.toString()}`);
  }

  getStalledClaims(thresholdDays = 30, page = 1, limit = 15, locations?: string[], payers?: string[], providers?: string[]): Observable<{ claims: any[]; total: number }> {
    const p = new URLSearchParams({ thresholdDays: String(thresholdDays), page: String(page), limit: String(limit) });
    locations?.forEach(l => p.append('locations', l));
    payers?.forEach(v => p.append('payers', v));
    providers?.forEach(v => p.append('providers', v));
    return this.http.get<any>(`${this.xenReportsUrl}/stalled-claims?${p.toString()}`);
  }

  getProviderDailyProduction(dayDate?: string, locations?: string[], providers?: string[]): Observable<{ rows: ProviderDailyProductionRow[]; asOf: string }> {
    const p = new URLSearchParams();
    if (dayDate) p.set('dayDate', dayDate);
    locations?.forEach(l => p.append('locations', l));
    providers?.forEach(v => p.append('providers', v));
    const qs = p.toString();
    return this.http.get<{ rows: ProviderDailyProductionRow[]; asOf: string }>(`${this.xenReportsUrl}/provider-daily-production${qs ? '?' + qs : ''}`);
  }

  getTreatmentAcceptanceSummary(dateFrom?: string, dateTo?: string, providers?: string[]): Observable<TreatmentAcceptanceSummary> {
    const p = new URLSearchParams();
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);
    providers?.forEach(v => p.append('providers', v));
    const qs = p.toString();
    return this.http.get<TreatmentAcceptanceSummary>(`${this.baseUrl}/treatment-acceptance/summary${qs ? '?' + qs : ''}`);
  }

  getTreatmentAcceptanceTrend(): Observable<{ trend: TreatmentAcceptanceTrendPoint[] }> {
    return this.http.get<{ trend: TreatmentAcceptanceTrendPoint[] }>(`${this.baseUrl}/treatment-acceptance/trend`);
  }

  getPatientLtv(): Observable<PatientLtvData> {
    return this.http.get<PatientLtvData>(`${this.baseUrl}/patient-ltv`);
  }

  getTopPatients(page = 1, limit = 20): Observable<{ patients: TopPatientRow[]; total: number; page: number; limit: number }> {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    return this.http.get<{ patients: TopPatientRow[]; total: number; page: number; limit: number }>(`${this.baseUrl}/patient-ltv/top-patients?${p.toString()}`);
  }

  // -- Bad Debt Write-Off Analysis ----------------------------------------------

  getBadDebt(): Observable<BadDebtData> {
    return this.http.get<BadDebtData>(`${this.baseUrl}/bad-debt`);
  }

  // -- Claim Cycle Time ---------------------------------------------------------

  getCycleTime(): Observable<CycleTimeData> {
    return this.http.get<CycleTimeData>(`${this.baseUrl}/cycle-time`);
  }

  // -- Pre-Auth Analytics -------------------------------------------------------

  getPreauthAnalytics(): Observable<PreauthAnalyticsData> {
    return this.http.get<PreauthAnalyticsData>(`${this.baseUrl}/preauth-analytics`);
  }

  // -- Patient Reactivation -----------------------------------------------------

  getReactivation(minDays = 365, maxDays = 99999, page = 1, limit = 50): Observable<ReactivationData> {
    const p = new URLSearchParams({
      minDays: String(minDays),
      maxDays: String(maxDays),
      page: String(page),
      limit: String(limit),
    });
    return this.http.get<ReactivationData>(`${this.baseUrl}/reactivation?${p.toString()}`);
  }

  // -- Claims Analytics ---------------------------------------------------------

  getClaimsAnalytics(startDate?: string, endDate?: string): Observable<ClaimsAnalyticsData> {
    const p = new URLSearchParams();
    if (startDate) p.set('startDate', startDate);
    if (endDate)   p.set('endDate', endDate);
    const qs = p.toString();
    return this.http.get<ClaimsAnalyticsData>(`${this.baseUrl}/claims-analytics${qs ? '?' + qs : ''}`);
  }

  // -- Billing Optimization ------------------------------------------------------

  getBillingRecommendations(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/billing-optimization/recommendations`); }
  getBillingStats(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/billing-optimization/stats`); }
  updateBillingRecStatus(id: number, status: string): Observable<any> { return this.http.put<any>(`${this.baseUrl}/billing-optimization/${id}/status`, { status }); }

  // -- Claim Auto-Submission -----------------------------------------------------

  getAutoSubmitRules(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/claim-auto-submission/rules`); }
  getAutoSubmitQueue(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/claim-auto-submission/queue`); }
  getAutoSubmitStats(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/claim-auto-submission/stats`); }
  toggleAutoSubmitRule(id: number): Observable<any> { return this.http.put<any>(`${this.baseUrl}/claim-auto-submission/rules/${id}/toggle`, {}); }

  // -- Denial Prediction ---------------------------------------------------------

  getDenialPredictions(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/denial-prediction/predictions`); }
  getDenialPredictionAccuracy(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/denial-prediction/accuracy`); }

  // -- Clean Claim ---------------------------------------------------------------

  getCleanClaimIssues(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/clean-claim/issues`); }
  getCleanClaimStats(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/clean-claim/stats`); }
  autoFixClaims(claimIds: number[]): Observable<any> { return this.http.post<any>(`${this.baseUrl}/clean-claim/auto-fix`, { claimIds }); }

  // -- Image Verification --------------------------------------------------------

  getImageVerificationQueue(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/image-verification/queue`); }
  getImageVerificationStats(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/image-verification/stats`); }
  verifyClaimImage(claimId: string): Observable<any> { return this.http.put<any>(`${this.baseUrl}/image-verification/${claimId}/verify`, {}); }
  rejectClaimImage(claimId: string, reason: string): Observable<any> { return this.http.put<any>(`${this.baseUrl}/image-verification/${claimId}/reject`, { reason }); }

  // -- RCM Consulting ------------------------------------------------------------

  getConsultants(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/rcm-consulting/consultants`); }
  getConsultingRecommendations(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/rcm-consulting/recommendations`); }
  getConsultingSessions(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/rcm-consulting/sessions`); }
  getConsultingMetrics(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/rcm-consulting/metrics`); }

  // -- Appeal Success Rate by Payer ----------------------------------------------

  getAppealSuccessByPayer(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/appeal-success/by-payer`); }
  getAppealSuccessByCaRC(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/appeal-success/by-carc`); }
  getAppealSuccessTrend(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/appeal-success/trend`); }
  getAppealSuccessStats(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/appeal-success/stats`); }

  // -- CPT Denial Risk -----------------------------------------------------------

  getCptDenialRiskMatrix(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/cpt-denial/risk-matrix`); }
  getCptDenialHighRisk(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/cpt-denial/high-risk`); }
  getCptDenialByCpt(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/cpt-denial/by-cpt`); }
  getCptDenialStats(): Observable<any> { return this.http.get<any>(`${this.baseUrl}/cpt-denial/stats`); }

  getClaimContext(reasonCode: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/claim-context/${encodeURIComponent(reasonCode)}`);
  }
}

export interface TreatmentAcceptanceByType {
  treatmentType: string;
  totalPlans: number;
  totalPresented: number;
  totalAccepted: number;
  acceptanceRate: number;
  rag: 'green' | 'amber' | 'red';
}

export interface TreatmentAcceptanceSummary {
  overall: { totalPlans: number; totalPresented: number; totalAccepted: number; acceptanceRate: number; rag: 'green' | 'amber' | 'red' };
  byType: TreatmentAcceptanceByType[];
  dateFrom: string;
  dateTo: string;
}

export interface TreatmentAcceptanceTrendPoint {
  month: string;
  totalPlans: number;
  totalPresented: number;
  totalAccepted: number;
  acceptanceRate: number;
}

export interface PatientLtvSummary {
  totalPatients: number;
  avgLtv: number;
  totalLifetimeValue: number;
  avgActiveMonths: number;
  avgClaimsPerPatient: number;
}

export interface PatientLtvCohort {
  cohortYear: number;
  patientCount: number;
  avgLtv: number;
  totalCollected: number;
}

export interface PatientLtvPayer {
  payer: string;
  patientCount: number;
  avgCollected: number;
  totalCollected: number;
}

export interface PatientLtvData {
  summary: PatientLtvSummary;
  byCohort: PatientLtvCohort[];
  byPayer: PatientLtvPayer[];
}

export interface TopPatientRow {
  patient_name: string;
  primary_payer: string;
  cohort_year: number;
  first_visit: string;
  last_visit: string;
  total_claims: number;
  total_billed: number;
  total_collected: number;
  active_months: number;
  estimated_ltv: number;
}

// -- Bad Debt ------------------------------------------------------------------

export interface BadDebtSummary {
  totalWriteOffsYTD: number;
  pctOfRevenue: number;
  avgPerClaim: number;
  claimsWithWriteOff: number;
}

export interface BadDebtPayerRow {
  payer: string;
  writeOffAmount: number;
  claimCount: number;
}

export interface BadDebtAgeBucketRow {
  ageBucket: string;
  writeOffAmount: number;
  claimCount: number;
}

export interface BadDebtTrendRow {
  month: string;
  writeOffAmount: number;
  claimCount: number;
}

export interface BadDebtData {
  summary: BadDebtSummary;
  byPayer: BadDebtPayerRow[];
  byAgeBucket: BadDebtAgeBucketRow[];
  monthlyTrend: BadDebtTrendRow[];
}

// -- Cycle Time ----------------------------------------------------------------

export interface CycleTimeSummary {
  avgCycleDays: number;
  totalClaims: number;
  pctWithin30: number;
  pctWithin60: number;
  pctWithin90: number;
  pctWithin120: number;
}

export interface CycleTimeTrendRow {
  month: string;
  avgCycleDays: number;
  claimCount: number;
}

export interface CycleTimePayerRow {
  payer: string;
  avgDays: number;
  claimCount: number;
  pctOnTime: number;
}

export interface CycleTimeData {
  summary: CycleTimeSummary;
  monthlyTrend: CycleTimeTrendRow[];
  slowestPayers: CycleTimePayerRow[];
}

// -- Pre-Auth Analytics --------------------------------------------------------

export interface PreauthSummary {
  totalClaims: number;
  deniedClaims: number;
  approvalRate: number;
  avgProcessingDays: number;
}

export interface PreauthPayerRow {
  payer: string;
  totalClaims: number;
  deniedClaims: number;
  approvalRate: number;
}

export interface PreauthProcedureRow {
  procedureCode: string;
  totalClaims: number;
  deniedClaims: number;
  approvalRate: number;
  denialRate: number;
}

export interface PreauthTrendRow {
  month: string;
  totalClaims: number;
  approvalRate: number;
}

export interface PreauthAnalyticsData {
  summary: PreauthSummary;
  byPayer: PreauthPayerRow[];
  byProcedure: PreauthProcedureRow[];
  monthlyTrend: PreauthTrendRow[];
}

// -- Patient Reactivation ------------------------------------------------------

export interface ReactivationSummary {
  lapsedCount: number;
  atRiskCount: number;
  activeCount: number;
  totalPatients: number;
  reactivatedLast90: number;
}

export interface ReactivationPatientRow {
  patientName: string;
  insurance: string;
  lastVisit: string;
  totalClaims: number;
  totalCollected: number;
  daysSinceVisit: number;
}

export interface ReactivationData {
  summary: ReactivationSummary;
  patients: ReactivationPatientRow[];
  total: number;
  page: number;
  limit: number;
}

// -- Claims Analytics ----------------------------------------------------------

export interface ClaimsAnalyticsSummary {
  totalClaims: number;
  totalBilled: number;
  totalPaid: number;
  avgPerClaim: number;
}

export interface ClaimsProcedureRow {
  procedureCode: string;
  procedureDescription: string;
  claimCount: number;
  avgFee: number;
  totalRevenue: number;
}

export interface ClaimsPayerRow {
  payer: string;
  totalPaid: number;
  claimCount: number;
}

export interface ClaimsTrendRow {
  month: string;
  totalBilled: number;
  totalPaid: number;
}

export interface ClaimsAnalyticsData {
  summary: ClaimsAnalyticsSummary;
  topProcedures: ClaimsProcedureRow[];
  payerMix: ClaimsPayerRow[];
  monthlyTrend: ClaimsTrendRow[];
}
