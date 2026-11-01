import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

// --- Models -----------------------------------------------------------------

export interface RemediationChecklist {
  id: number;
  sort_order: number;
  item_text: string;
}

export interface RemediationStep {
  id: number;
  sort_order: number;
  title: string;
  body: string | null;
  required: boolean;
  /** Present on claim-time responses (completion state) */
  completed?: boolean;
  completed_at?: string | null;
  checklist: RemediationChecklist[];
}

export interface RemediationStepSet {
  id: number;
  reason_code: string;
  role: string;
  status: string;
  version: number;
  published_at: string | null;
  published_by: string | null;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
  created_by: string | null;
  /** Only present in listSets (not in getSet detail) */
  step_count?: number;
  /** Only present in getSet detail */
  steps?: RemediationStep[];
}

export interface StepSetHistory {
  id: number;
  set_id: number;
  version: number;
  snapshot: string;
  changed_by: string;
  changed_at: string;
}

export interface ClaimRemediationData {
  set_id: number;
  reason_code: string;
  version: number;
  updated_at: string;
  steps: RemediationStep[];
}

export interface ClaimStepNote {
  id: number;
  claim_id: string;
  step_id: number | null;
  author_user_id: string;
  author_name: string | null;
  note_text: string;
  note_type: string;
  created_at: string;
  step_title: string | null;
  // structured follow-up fields
  contact_method: string | null;
  contact_person: string | null;
  phone_number: string | null;
  case_number: string | null;
  reference_number: string | null;
  action_taken: string | null;
  appeal_level: string | null;
  // edit tracking
  updated_at: string | null;
  updated_by: string | null;
}

export interface RemediationFeedback {
  id: number;
  set_id: number;
  step_id: number | null;
  claim_id: string | null;
  author_user_id: string;
  suggestion: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  reason_code: string;
  set_role: string;
  step_title: string | null;
}

// --- Service ----------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class RemediationService {
  private readonly adminBase = `${environment.server.baseUrl}/admin/remediation`;
  private readonly claimBase = `${environment.server.baseUrl}/denial-iq/claim-detail`;

  constructor(private http: HttpClient) {}

  // -- Admin: Step Sets ------------------------------------------------------

  listSets(params?: { reasonCode?: string; role?: string; status?: string }): Observable<RemediationStepSet[]> {
    let p = new HttpParams();
    if (params?.reasonCode) p = p.set('reasonCode', params.reasonCode);
    if (params?.role) p = p.set('role', params.role);
    if (params?.status) p = p.set('status', params.status);
    return this.http
      .get<{ data: RemediationStepSet[] }>(`${this.adminBase}/sets`, { params: p })
      .pipe(map(r => r.data ?? []));
  }

  getSet(id: number): Observable<RemediationStepSet> {
    return this.http
      .get<{ data: RemediationStepSet }>(`${this.adminBase}/sets/${id}`)
      .pipe(map(r => r.data));
  }

  createSet(payload: { reason_code: string; role: string; steps: Array<{ title: string; body?: string; required?: boolean; checklist?: string[] }> }): Observable<{ id: number }> {
    return this.http
      .post<{ data: { id: number } }>(`${this.adminBase}/sets`, payload)
      .pipe(map(r => r.data));
  }

  updateSet(id: number, payload: { reason_code?: string; role?: string; steps: Array<{ title: string; body?: string; required?: boolean; checklist?: string[] }> }): Observable<{ id: number }> {
    return this.http
      .put<{ data: { id: number } }>(`${this.adminBase}/sets/${id}`, payload)
      .pipe(map(r => r.data));
  }

  publishSet(id: number): Observable<{ id: number; version: number; status: string }> {
    return this.http
      .post<{ data: { id: number; version: number; status: string } }>(`${this.adminBase}/sets/${id}/publish`, {})
      .pipe(map(r => r.data));
  }

  deleteSet(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.adminBase}/sets/${id}`);
  }

  getSetHistory(id: number): Observable<StepSetHistory[]> {
    return this.http
      .get<{ data: StepSetHistory[] }>(`${this.adminBase}/sets/${id}/history`)
      .pipe(map(r => r.data ?? []));
  }

  // -- Admin: Reason Codes ---------------------------------------------------

  listReasonCodes(): Observable<string[]> {
    return this.http
      .get<{ data: string[] }>(`${this.adminBase}/reason-codes`)
      .pipe(map(r => r.data ?? []));
  }

  // -- Admin: Feedback Queue -------------------------------------------------

  listFeedback(params?: { status?: string }): Observable<RemediationFeedback[]> {
    let p = new HttpParams();
    if (params?.status) p = p.set('status', params.status);
    return this.http
      .get<{ data: RemediationFeedback[] }>(`${this.adminBase}/feedback`, { params: p })
      .pipe(map(r => r.data ?? []));
  }

  reviewFeedback(id: number, payload: { status: string; reviewer_note?: string }): Observable<{ id: number; status: string }> {
    return this.http
      .patch<{ data: { id: number; status: string } }>(`${this.adminBase}/feedback/${id}`, payload)
      .pipe(map(r => r.data));
  }

  // -- Claim-time ------------------------------------------------------------

  getClaimSteps(claimId: string, role: string, reasonCode?: string): Observable<{ data: ClaimRemediationData | null; claimReasonCode: string }> {
    let p = new HttpParams().set('claimId', claimId).set('role', role);
    if (reasonCode) p = p.set('reasonCode', reasonCode);
    return this.http.get<{ data: ClaimRemediationData | null; claimReasonCode: string }>(
      `${this.claimBase}/remediation`, { params: p }
    );
  }

  saveStepCompletion(payload: { claimId: string; stepId: number; completed: boolean; userId: string }): Observable<void> {
    return this.http.post<void>(`${this.claimBase}/step-completion`, payload);
  }

  getNotes(claimId: string): Observable<ClaimStepNote[]> {
    const p = new HttpParams().set('claimId', claimId);
    return this.http
      .get<{ data: ClaimStepNote[] }>(`${this.claimBase}/notes`, { params: p })
      .pipe(map(r => r.data ?? []));
  }

  addNote(payload: {
    claimId: string;
    stepId?: number | null;
    authorUserId: string;
    noteText: string;
    noteType?: string;
    contactMethod?: string;
    contactPerson?: string;
    phoneNumber?: string;
    caseNumber?: string;
    referenceNumber?: string;
    actionTaken?: string;
    appealLevel?: string;
  }): Observable<ClaimStepNote> {
    return this.http
      .post<{ data: ClaimStepNote }>(`${this.claimBase}/notes`, payload)
      .pipe(map(r => r.data));
  }

  updateNote(id: number, payload: {
    noteText: string;
    noteType?: string;
    contactMethod?: string;
    contactPerson?: string;
    phoneNumber?: string;
    caseNumber?: string;
    referenceNumber?: string;
    actionTaken?: string;
    appealLevel?: string;
  }): Observable<ClaimStepNote> {
    return this.http
      .put<{ data: ClaimStepNote }>(`${this.claimBase}/notes/${id}`, payload)
      .pipe(map(r => r.data));
  }

  deleteNote(id: number): Observable<void> {
    return this.http.delete<void>(`${this.claimBase}/notes/${id}`);
  }

  submitFeedback(payload: {
    setId: number;
    stepId?: number | null;
    claimId?: string | null;
    authorUserId: string;
    suggestion: string;
  }): Observable<{ id: number }> {
    return this.http
      .post<{ data: { id: number } }>(`${this.claimBase}/feedback`, payload)
      .pipe(map(r => r.data));
  }

  // --- Smart SOP Recommendations ------------------------------------------

  getSmartSteps(claimId: string, role: string): Observable<SmartStepsResponse | null> {
    const p = new HttpParams().set('claimId', claimId).set('role', role);
    return this.http
      .get<{ data: SmartStepsResponse | null }>(`${this.claimBase}/smart-steps`, { params: p })
      .pipe(map(r => r.data));
  }

  getSOPRecommendations(): Observable<SOPRecommendation[]> {
    return this.http
      .get<{ data: SOPRecommendation[] }>(`${this.adminBase}/recommendations`)
      .pipe(map(r => r.data ?? []));
  }

  getSOPEffectiveness(): Observable<SOPEffectivenessRow[]> {
    return this.http
      .get<{ data: SOPEffectivenessRow[] }>(`${this.adminBase}/effectiveness`)
      .pipe(map(r => r.data ?? []));
  }
}

// --- Smart SOP Models -----------------------------------------------------

export interface SmartStep {
  id: number;
  title: string;
  body: string | null;
  sortOrder: number;
  isRequired: boolean;
  completionRate: number;
  avgDaysWhenCompleted: number;
  recentFeedback: number;
  effectiveness: 'high' | 'medium' | 'unknown';
}

export interface SmartStepsResponse {
  setId: number;
  reasonCode: string;
  version: number;
  steps: SmartStep[];
}

export interface SOPRecommendation {
  type: 'low_completion' | 'high_feedback' | 'escalation_spike' | 'slow_resolution' | 'missing_sop';
  severity: 'high' | 'medium';
  reasonCode: string;
  setId: number | null;
  stepId: number | null;
  title: string;
  detail: string;
  metric: number;
  metricLabel: string;
}

export interface SOPEffectivenessRow {
  reasonCode: string;
  targetRole: string;
  setId: number;
  version: number;
  stepCount: number;
  claimsWithCompletions: number;
  avgStepsCompleted: number;
  feedbackCount: number;
  recentClaimCount: number;
  avgDaysToResolve: number;
  escalationRate: number;
}
