import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ErrorDisplayService } from './error-display.service';

export interface DenialTrendPoint {
  PeriodLabel: string;   // 'yyyy-MM'
  DeniedClaims: number;
  DeniedCharges: number;
}

export interface DenialKpis {
  currentDeniedClaims:  number;
  currentDeniedCharges: number;
  denialRate:           number; // 0-1
  recoveryRate:         number; // 0-1
  deltaClaimsYoy:       number; // % change vs prior year
  deltaChargesYoy:      number;
  deltaDenialRateYoy:   number;
}

export interface DenialReason {
  Reason:          string;
  CurrentAmount:   number;
  PreviousAmount:  number;
}

/** Level-2 drill-down: (CARC, RARC) pair within a grouping */
export interface DenialCodeRow {
  carcCode:       string;
  rarcCode:       string | null;
  ClaimCount:     number;
  CurrentAmount:  number;
  PreviousAmount: number;
}

/** Level-3 drill-down: individual claim under a (CARC, RARC) pair */
export interface DenialClaimRow {
  claimId:       string;
  patientName:   string | null;
  payerName:     string | null;
  providerName:  string | null;
  dateOfService: string | null;
  chargeAmount:  number;
}

export interface InsightflowFilterOptions {
  payers:    string[];
  providers: string[];
  locations: string[];
  practices?: string[];
}

export interface DenialFilterParams {
  start?: string | null;
  end?: string | null;
  payers?: string[];
  providers?: string[];
  locations?: string[];
  practices?: string[];
}

// -- Payer Intelligence ---------------------------------------------------

export interface CarcGuidance {
  code: string;
  description: string | null;
  category: string;
  common_cause: string | null;
  resolution: string | null;
  prevention: string | null;
  payer_specific: boolean;
  filing_deadline_days: number | null;
  appeal_days: number | null;
}

export interface PayerFilingDeadline {
  id?: number;
  payer_name: string;
  deadline_days: number;
  appeal_days: number;
  notes: string | null;
}

export interface PendingConfig {
  customer_id: number;
  pending_days: number;
  updated_by: string | null;
  updated_at: string | null;
}

// -- Appeals --------------------------------------------------------------

export interface AppealLetterTemplate {
  id: number;
  template_name: string;
  denial_category: string | null;
  carc_codes: string | null;
  subject_line: string;
  body_template: string;
  closing_text: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClaimAppeal {
  id: number;
  claim_id: string;
  template_id: number | null;
  denial_reason: string | null;
  appeal_level: number;
  submitted_date: string | null;
  due_date: string | null;
  status: 'draft' | 'submitted' | 'won' | 'lost' | 'pending';
  generated_letter: string | null;
  notes: string | null;
  created_at: string;
  template_name?: string | null;
}

export interface TimelyFilingAlert {
  claimId: string;
  payerName: string;
  daysRemaining: number;
  filingDeadline: string;
  alertLevel: 'CRITICAL' | 'WARNING' | 'EXPIRED' | 'OK';
}

// -- Priority Settings ----------------------------------------------------

export interface PriorityWeights {
  aging: number;
  value: number;
  deadline: number;
  workload: number;
  proficiency: number;
}

export interface PrioritySettings {
  weights: PriorityWeights;
  enabled: boolean;
  stats: {
    totalScored: number;
    lastRunAt: string | null;
    avgScore: number;
    maxScore: number;
    minScore: number;
  };
  distribution: { high: number; medium: number; low: number };
}

// -- Practice Groups --------------------------------------------------

export interface PracticeGroupLocation {
  id: number;
  location_name: string;
}

export interface PracticeGroupMember {
  id: number;
  name: string;
}

export interface PracticeGroup {
  id: number;
  name: string;
  is_active: boolean;
  locations: PracticeGroupLocation[];
  members: PracticeGroupMember[];
}

// -- Claim Approval Gate ----------------------------------------------

export interface ClaimApprovalRecord {
  id: number;
  claim_id: string;
  appeal_id: number | null;
  submitted_by: string;
  submitted_at: string;
  reviewer_email: string | null;
  reviewed_at: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'recalled';
  reviewer_notes: string | null;
  PatientName?: string;
  PayerName?: string;
  ChargeAmt?: number;
  DenialCode?: string;
}

// -- Narrative Completeness Score -------------------------------------

export interface NarrativeScore {
  id: number;
  claim_id: string;
  score: number;
  missing_elements: string[];
  recommendations: string[];
  model_version: string;
  scored_at: string;
}

// -- Inline Narrative Rewrite -----------------------------------------

export interface RewriteHunk {
  original: string;
  replacement: string;
  reason: string;
}

export interface ClaimRewrite {
  id: number;
  claim_id: string;
  original_text: string;
  rewritten_text: string;
  diff_hunks: RewriteHunk[];
  focus_areas: string[];
  confidence: number;
  accepted: boolean | null;
  model_version: string;
  created_at: string;
}

// -- Resubmission Package ---------------------------------------------

export interface PackageChecklistItem {
  item: string;
  checked: boolean;
}

export interface ClaimAttachment {
  id: number;
  file_name: string;
  file_type: string | null;
  file_size_kb: number | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ResubmissionPackage {
  id: number;
  claim_id: string;
  appeal_id: number | null;
  status: 'draft' | 'ready' | 'submitted' | 'approved' | 'rejected';
  checklist: PackageChecklistItem[];
  corrected_claim: Record<string, unknown> | null;
  notes: string | null;
  created_by: string | null;
  submitted_at: string | null;
  attachments: ClaimAttachment[];
}

// -- Collections Forecast ---------------------------------------------

export interface ForecastBreakdownRow {
  payer_name: string;
  open_balance: number;
  expected_payment: number;
  expected_by_days: number;
  payment_ratio: number;
}

export interface CollectionsForecast {
  computed_at: string;
  forecast: {
    next_30_days: number;
    next_60_days: number;
    next_90_days: number;
    beyond_90_days: number;
  };
  breakdown: ForecastBreakdownRow[];
  note: string;
}

// -- Template Performance / Continuous Learning ------------------------

export interface TemplatePerformanceRow {
  id: number;
  template_id: number;
  template_name: string | null;
  payer_name: string | null;
  denial_reason: string | null;
  total_used: number;
  total_won: number;
  total_lost: number;
  win_rate: number | null;
  avg_days_to_win: number | null;
  rank_in_segment: number;
}

// -- Payer Velocity Score ----------------------------------------------

export interface PayerVelocityScore {
  claim_id: string;
  payer_name: string;
  charge_amount: number;
  expected_payment: number;
  payment_probability: number;
  avg_days_to_payment: number;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

// -- Organization Hierarchy (from /api/groups) ------------------------

export interface OrgHierarchyLocation {
  id: number;
  name: string;
}

export interface OrgHierarchyPractice {
  id: number;
  name: string;
  locations: OrgHierarchyLocation[];
  expanded?: boolean;
}

export interface OrgHierarchyGroup {
  id: number;
  name: string;
  locations: OrgHierarchyLocation[];
  practices?: OrgHierarchyPractice[];
  expanded?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DenialManagementService {
  private readonly base = `${environment.server.baseUrl}/insightflow/denial-management`;
  private readonly insightflowBase = `${environment.server.baseUrl}/insightflow`;
  private readonly payerIntelBase = `${environment.server.baseUrl}/denial-iq/payer-intelligence`;
  private readonly appealsBase = `${environment.server.baseUrl}/denial-iq/appeals`;

  constructor(private http: HttpClient, private errorDisplay: ErrorDisplayService) {}

  private buildParams(f?: DenialFilterParams): HttpParams {
    let params = new HttpParams();
    if (f?.start) params = params.set('start', f.start);
    if (f?.end) params = params.set('end', f.end);
    if (f?.payers?.length) {
      for (const p of f.payers) params = params.append('payer', p);
    }
    if (f?.providers?.length) {
      for (const p of f.providers) params = params.append('provider', p);
    }
    if (f?.locations?.length) {
      for (const l of f.locations) params = params.append('location', l);
    }
    if (f?.practices?.length) {
      for (const p of f.practices) params = params.append('practice', p);
    }
    return params;
  }

  getTrend(filters?: DenialFilterParams): Observable<DenialTrendPoint[]> {
    return this.http
      .get<{ data: DenialTrendPoint[] }>(`${this.base}/trend`, { params: this.buildParams(filters) })
      .pipe(map(r => r.data ?? []));
  }

  getKpis(filters?: DenialFilterParams): Observable<DenialKpis | null> {
    return this.http
      .get<{ data: DenialKpis | null }>(`${this.base}/kpis`, { params: this.buildParams(filters) })
      .pipe(map(r => r.data));
  }

  getTopReasons(filters?: DenialFilterParams, all = false): Observable<DenialReason[]> {
    let params = this.buildParams(filters);
    if (all) params = params.set('all', '1');
    return this.http
      .get<{ data: DenialReason[] }>(`${this.base}/top-reasons`, { params })
      .pipe(map(r => r.data ?? []));
  }

  getCodesForGrouping(grouping: string, filters?: DenialFilterParams): Observable<DenialCodeRow[]> {
    const params = this.buildParams(filters).set('grouping', grouping);
    return this.http
      .get<{ data: DenialCodeRow[] }>(`${this.base}/top-reasons/codes`, { params })
      .pipe(map(r => r.data ?? []));
  }

  getClaimsForCode(carc: string, rarc: string | null, filters?: DenialFilterParams): Observable<DenialClaimRow[]> {
    let params = this.buildParams(filters).set('carc', carc);
    // empty string means "RARC IS NULL" on the backend
    params = params.set('rarc', rarc ?? '');
    return this.http
      .get<{ data: DenialClaimRow[] }>(`${this.base}/top-reasons/claims`, { params })
      .pipe(map(r => r.data ?? []));
  }

  getFilterOptions(): Observable<InsightflowFilterOptions> {
    return this.http
      .get<InsightflowFilterOptions>(`${this.insightflowBase}/filter-options`);
  }

  // -- Payer Intelligence -----------------------------------------------

  listCarcDescriptions(): Observable<{ code: string; description: string }[]> {
    return this.http
      .get<{ data: { code: string; description: string }[] }>(`${this.payerIntelBase}/carc-descriptions`)
      .pipe(map(r => r.data ?? []), catchError(err => { this.errorDisplay.log('listCarcDescriptions', err); return of([]); }));
  }

  getCarcDetail(code: string, payerName?: string): Observable<CarcGuidance | null> {
    let params = new HttpParams();
    if (payerName) params = params.set('payerName', payerName);
    return this.http
      .get<{ data: CarcGuidance }>(`${this.payerIntelBase}/carc/${encodeURIComponent(code)}`, { params })
      .pipe(map(r => r.data ?? null));
  }

  listCarcLibrary(search = '', category = '', page = 1): Observable<{ data: CarcGuidance[]; total: number }> {
    let params = new HttpParams().set('page', page.toString());
    if (search) params = params.set('search', search);
    if (category) params = params.set('category', category);
    return this.http
      .get<{ data: CarcGuidance[]; total: number }>(`${this.payerIntelBase}/carc-library`, { params });
  }

  getPayerDeadline(payerName: string): Observable<PayerFilingDeadline | null> {
    const params = new HttpParams().set('payerName', payerName);
    return this.http
      .get<{ data: PayerFilingDeadline }>(`${this.payerIntelBase}/deadlines`, { params })
      .pipe(map(r => r.data ?? null));
  }

  listPayerDeadlines(): Observable<PayerFilingDeadline[]> {
    return this.http
      .get<{ data: PayerFilingDeadline[] }>(`${this.payerIntelBase}/deadlines/all`)
      .pipe(map(r => r.data ?? []), catchError(err => { this.errorDisplay.log('listPayerDeadlines', err); return of([]); }));
  }

  upsertPayerDeadline(body: Partial<PayerFilingDeadline>): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.payerIntelBase}/deadlines`, body)
      .pipe(catchError(err => throwError(() => err)));
  }

  // -- Appeals ----------------------------------------------------------

  listAppealTemplates(all = false): Observable<AppealLetterTemplate[]> {
    const params = all ? '?all=1' : '';
    return this.http
      .get<{ data: AppealLetterTemplate[] }>(`${this.appealsBase}/templates${params}`)
      .pipe(map(r => r.data ?? []), catchError(err => { this.errorDisplay.log('listAppealTemplates', err); return of([]); }));
  }

  createAppealTemplate(body: Partial<AppealLetterTemplate>): Observable<AppealLetterTemplate> {
    return this.http
      .post<{ data: AppealLetterTemplate }>(`${this.appealsBase}/templates`, body)
      .pipe(map(r => r.data));
  }

  updateAppealTemplate(id: number, body: Partial<AppealLetterTemplate>): Observable<void> {
    return this.http.put<void>(`${this.appealsBase}/templates/${id}`, body);
  }

  deleteAppealTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.appealsBase}/templates/${id}`);
  }

  generateAppealLetter(claimId: string, templateId?: number, customNotes?: string): Observable<{ appeal: ClaimAppeal; letter: string }> {
    return this.http.post<{ appeal: ClaimAppeal; letter: string }>(
      `${this.appealsBase}/generate`,
      { claimId, templateId, customNotes }
    );
  }

  generateAiAppealLetter(claimId: string, customNotes?: string): Observable<{ appeal: ClaimAppeal; letter: string; source: string }> {
    return this.http.post<{ appeal: ClaimAppeal; letter: string; source: string }>(
      `${this.appealsBase}/generate-ai`,
      { claimId, customNotes }
    );
  }

  listClaimAppeals(claimId: string): Observable<ClaimAppeal[]> {
    const params = new HttpParams().set('claimId', claimId);
    return this.http
      .get<{ data: ClaimAppeal[] }>(this.appealsBase, { params })
      .pipe(map(r => r.data ?? []));
  }

  updateAppealStatus(id: number, status: string, notes?: string): Observable<void> {
    return this.http.patch<void>(`${this.appealsBase}/${id}`, { status, notes });
  }

  // -- Pending Queue Config ---------------------------------------------

  private readonly pendingConfigBase = `${environment.server.baseUrl}/denial-iq/pending-config`;

  getPendingConfig(): Observable<PendingConfig[]> {
    return this.http
      .get<{ data: PendingConfig[] }>(this.pendingConfigBase)
      .pipe(map(r => r.data ?? []));
  }

  updatePendingConfig(customerId: number, pendingDays: number): Observable<void> {
    return this.http.patch<void>(this.pendingConfigBase, { customer_id: customerId, pending_days: pendingDays });
  }

  // -- Priority Settings ------------------------------------------------

  private readonly priorityBase = `${environment.server.baseUrl}/admin/priority`;

  getPrioritySettings(): Observable<PrioritySettings> {
    return this.http.get<PrioritySettings>(`${this.priorityBase}/settings`);
  }

  updatePrioritySettings(weights: PriorityWeights, enabled?: boolean): Observable<void> {
    return this.http.put<void>(`${this.priorityBase}/settings`, { weights, enabled });
  }

  recalculatePriorities(): Observable<{ scored: number }> {
    return this.http.post<{ scored: number }>(`${this.priorityBase}/recalculate`, {});
  }

  // -- Practice Groups -----------------------------------------------

  private readonly groupsBase = `${environment.server.baseUrl}/denial-iq/admin/groups`;

  listGroups(): Observable<PracticeGroup[]> {
    return this.http
      .get<{ data: PracticeGroup[] }>(this.groupsBase)
      .pipe(map(r => r.data ?? []));
  }

  createGroup(name: string): Observable<PracticeGroup> {
    return this.http
      .post<{ data: PracticeGroup }>(this.groupsBase, { name })
      .pipe(map(r => r.data));
  }

  addGroupLocation(groupId: number, locationName: string): Observable<void> {
    return this.http.post<void>(`${this.groupsBase}/${groupId}/locations`, { location_name: locationName });
  }

  removeGroupLocation(groupId: number, locationId: number): Observable<void> {
    return this.http.delete<void>(`${this.groupsBase}/${groupId}/locations/${locationId}`);
  }

  // -- Claim Approval Gate -----------------------------------------------

  private readonly approvalsBase = `${environment.server.baseUrl}/denial-iq/approvals`;

  listApprovals(status?: string, claimId?: string): Observable<ClaimApprovalRecord[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (claimId) params = params.set('claimId', claimId);
    return this.http
      .get<{ data: ClaimApprovalRecord[] }>(this.approvalsBase, { params })
      .pipe(map(r => r.data ?? []));
  }

  submitForApproval(claimId: string, appealId?: number, packageSnapshot?: Record<string, unknown>): Observable<ClaimApprovalRecord> {
    return this.http
      .post<{ data: ClaimApprovalRecord }>(this.approvalsBase, { claim_id: claimId, appeal_id: appealId, package_snapshot: packageSnapshot })
      .pipe(map(r => r.data));
  }

  reviewApproval(id: number, status: 'approved' | 'rejected', reviewerNotes?: string): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.approvalsBase}/${id}`, { status, reviewer_notes: reviewerNotes });
  }

  recallApproval(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.approvalsBase}/${id}`);
  }

  // -- Narrative Score ---------------------------------------------------

  private readonly narrativeScoreBase = `${environment.server.baseUrl}/denial-iq/narrative-score`;

  getNarrativeScore(claimId: string): Observable<NarrativeScore | null> {
    return this.http
      .get<{ data: NarrativeScore }>(`${this.narrativeScoreBase}/${claimId}`)
      .pipe(map(r => r.data ?? null));
  }

  scoreNarrative(claimId: string): Observable<NarrativeScore> {
    return this.http
      .post<{ data: NarrativeScore }>(`${this.narrativeScoreBase}/${claimId}`, {})
      .pipe(map(r => r.data));
  }

  // -- Claim Rewrite -----------------------------------------------------

  private readonly claimRewriteBase = `${environment.server.baseUrl}/denial-iq/claim-rewrite`;

  getLatestRewrite(claimId: string): Observable<ClaimRewrite | null> {
    return this.http
      .get<{ data: ClaimRewrite }>(`${this.claimRewriteBase}/${claimId}`)
      .pipe(map(r => r.data ?? null));
  }

  generateRewrite(claimId: string, narrative?: string): Observable<ClaimRewrite> {
    return this.http
      .post<{ data: ClaimRewrite }>(`${this.claimRewriteBase}/${claimId}`, { narrative })
      .pipe(map(r => r.data));
  }

  acceptRewrite(id: number, accepted: boolean, rewrittenText?: string): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.claimRewriteBase}/${id}/accept`, {
      accepted,
      ...(rewrittenText !== undefined && { rewritten_text: rewrittenText }),
    });
  }

  // -- Resubmission Package ----------------------------------------------

  private readonly packageBase = `${environment.server.baseUrl}/denial-iq/resubmission-package`;

  getResubmissionPackage(claimId: string): Observable<ResubmissionPackage | null> {
    return this.http
      .get<{ data: ResubmissionPackage }>(`${this.packageBase}/${claimId}`)
      .pipe(map(r => r.data ?? null));
  }

  createResubmissionPackage(claimId: string, body: Partial<ResubmissionPackage>): Observable<ResubmissionPackage> {
    return this.http
      .post<{ data: ResubmissionPackage }>(`${this.packageBase}/${claimId}`, body)
      .pipe(map(r => r.data));
  }

  updateResubmissionPackage(id: number, body: Partial<ResubmissionPackage>): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.packageBase}/${id}`, body);
  }

  addAttachment(claimId: string, body: Partial<ClaimAttachment> & { package_id?: number }): Observable<ClaimAttachment> {
    return this.http
      .post<{ data: ClaimAttachment }>(`${this.packageBase}/${claimId}/attachments`, body)
      .pipe(map(r => r.data));
  }

  removeAttachment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.packageBase}/attachments/${id}`);
  }

  // -- Collections Forecast ----------------------------------------------

  private readonly forecastBase = `${environment.server.baseUrl}/ai/collections-forecast`;

  getCollectionsForecast(): Observable<CollectionsForecast | null> {
    return this.http
      .get<{ data: CollectionsForecast }>(this.forecastBase)
      .pipe(map(r => r.data ?? null));
  }

  // -- Template Performance ----------------------------------------------

  private readonly tplPerfBase = `${environment.server.baseUrl}/denial-iq/template-performance`;

  getTemplateLeaderboard(payer?: string, denialReason?: string): Observable<TemplatePerformanceRow[]> {
    let params = new HttpParams();
    if (payer) params = params.set('payer', payer);
    if (denialReason) params = params.set('denial_reason', denialReason);
    return this.http
      .get<{ data: TemplatePerformanceRow[] }>(this.tplPerfBase, { params })
      .pipe(map(r => r.data ?? []));
  }

  recordAppealOutcome(appealId: number, outcome: 'won' | 'lost', daysToClose?: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.tplPerfBase}/outcome`, { appeal_id: appealId, outcome, days_to_close: daysToClose });
  }

  // -- Payer Velocity ----------------------------------------------------

  getPayerVelocityScore(claimId: string): Observable<PayerVelocityScore | null> {
    return this.http
      .get<{ data: PayerVelocityScore }>(`${environment.server.baseUrl}/ai/payer-velocity/score/${claimId}`)
      .pipe(map(r => r.data ?? null));
  }

  // -- Organization Hierarchy -----------------------------------------

  getOrgHierarchy(): Observable<OrgHierarchyGroup[]> {
    return this.http
      .get<{ data: OrgHierarchyGroup[] }>(`${environment.server.baseUrl}/groups`)
      .pipe(map(r => (r.data ?? []).map(g => ({ ...g, expanded: true }))));
  }
}
