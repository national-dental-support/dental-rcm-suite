import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EligibilityDashboard {
  verificationRate: number;
  failuresToday: number;
  alertsOpen: number;
  authLimitsExpiringSoon: number;
  visitLimitsNearlyExhausted: number;
  failuresByPayer: { payerName: string; failures: number }[];
  failuresByLocation: { locationName: string; failures: number }[];
  last7Days: { date: string; passed: number; failed: number; errors: number }[];
  authAlertBreakdown: { alertType: string; count: number }[];
}

export interface EligibilityBatch {
  id: number;
  run_date: string;
  triggered_by: string;
  status: string;
  total_checked: number;
  passed: number;
  failed: number;
  errors: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface EligibilityCheckRow {
  id: number;
  patient_name: string;
  payer_name: string;
  location_name: string;
  provider_name: string;
  appointment_date: string;
  check_status: string;
  checked_at: string;
  error_detail: string | null;
  coverage_type?: string;
  copay_amount?: number;
  deductible_remaining?: number;
  annual_remaining?: number;
}

export interface EligibilityBenefits {
  id: number;
  check_id: number;
  copay_amount: number;
  deductible_individual: number;
  deductible_met: number;
  deductible_remaining: number;
  annual_maximum: number;
  annual_used: number;
  annual_remaining: number;
  coverage_type: string;
  effective_date: string;
  termination_date: string;
  preventive_pct: number;
  basic_pct: number;
  major_pct: number;
  ortho_covered: boolean;
  waiting_period_months: number;
  oop_individual?: number;
  oop_met?: number;
  oop_remaining?: number;
  network_status?: 'in_network' | 'out_of_network' | 'unknown';
  cob_order?: 'primary' | 'secondary';
  secondary_payer_name?: string | null;
}

export interface EligibilityAuthLimit {
  id: number;
  check_id: number;
  service_category: string;
  auth_number: string;
  auth_type: 'visit' | 'dollar' | 'both';
  visits_approved: number | null;
  visits_used: number | null;
  visits_remaining: number | null;
  dollar_limit: number | null;
  dollar_used: number | null;
  dollar_remaining: number | null;
  auth_start_date: string;
  auth_expiration_date: string;
  policy_year_end: string;
  renewal_required: boolean;
  notes: string | null;
}

export interface EligibilityCheckResult {
  check: EligibilityCheckRow;
  benefits: EligibilityBenefits;
  authLimits: EligibilityAuthLimit[];
  secondaryBenefits?: EligibilityBenefits | null;
}

export interface VerifyQueueRow {
  check_id: number;
  patient_name: string;
  payer_name: string;
  location_name: string;
  provider_name: string;
  appointment_date: string;
  eligibility_status: string;
  last_checked: string | null;
  subscriber_id: string;
  verify_status: 'verified' | 'stale' | 'failed' | 'unverified';
}

export interface EligibilityAlert {
  id: number;
  patient_name: string;
  payer_name: string;
  location_name: string;
  alert_type: string;
  priority: 'high' | 'medium' | 'low';
  alert_date: string;
  appointment_date: string;
  created_at: string;
  service_category: string | null;
  auth_number: string | null;
  auth_type: string | null;
  visits_approved: number | null;
  visits_remaining: number | null;
  dollar_limit: number | null;
  dollar_remaining: number | null;
  auth_expiration_date: string | null;
}

export interface CheckFilters {
  status?: string;
  payerName?: string;
  locationName?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class EligibilityIqService {
  private readonly base = `${environment.server.baseUrl}/eligibility-iq`;

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<EligibilityDashboard> {
    return this.http.get<EligibilityDashboard>(`${this.base}/dashboard`);
  }

  getBatches(): Observable<EligibilityBatch[]> {
    return this.http.get<EligibilityBatch[]>(`${this.base}/batch-status`);
  }

  getBatchChecks(batchId: number, page = 1, pageSize = 25, status?: string): Observable<{ data: EligibilityCheckRow[]; total: number; page: number; pageSize: number }> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status) params = params.set('status', status);
    return this.http.get<any>(`${this.base}/batch-status/${batchId}/checks`, { params });
  }

  submitCheck(payload: {
    patientName: string;
    patientDob?: string;
    subscriberId: string;
    payerName?: string;
    payerId?: string;
    locationName?: string;
    providerName?: string;
    appointmentDate?: string;
  }): Observable<EligibilityCheckResult> {
    return this.http.post<EligibilityCheckResult>(`${this.base}/check`, payload);
  }

  getChecks(filters: CheckFilters = {}): Observable<{ data: EligibilityCheckRow[]; total: number; page: number; pageSize: number }> {
    let params = new HttpParams();
    if (filters.status)       params = params.set('status',       filters.status);
    if (filters.payerName)    params = params.set('payerName',    filters.payerName);
    if (filters.locationName) params = params.set('locationName', filters.locationName);
    if (filters.from)         params = params.set('from',         filters.from);
    if (filters.to)           params = params.set('to',           filters.to);
    if (filters.page)         params = params.set('page',         filters.page);
    if (filters.pageSize)     params = params.set('pageSize',     filters.pageSize);
    return this.http.get<any>(`${this.base}/checks`, { params });
  }

  getAlerts(priority?: string, alertType?: string): Observable<EligibilityAlert[]> {
    let params = new HttpParams();
    if (priority)  params = params.set('priority',  priority);
    if (alertType) params = params.set('alertType', alertType);
    return this.http.get<EligibilityAlert[]>(`${this.base}/alerts`, { params });
  }

  dismissAlert(id: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/alerts/${id}/dismiss`, {});
  }

  getVerifyQueue(params: { days?: number; location?: string; status?: string } = {}): Observable<{ data: VerifyQueueRow[]; total: number }> {
    let p = new HttpParams();
    if (params.days) p = p.set('days', params.days);
    if (params.location) p = p.set('location', params.location);
    if (params.status) p = p.set('status', params.status);
    return this.http.get<{ data: VerifyQueueRow[]; total: number }>(`${this.base}/verify-queue`, { params: p });
  }

  runVerification(checkIds: number[]): Observable<{ ok: boolean; verified: number }> {
    return this.http.post<{ ok: boolean; verified: number }>(`${this.base}/verify-queue/run`, { checkIds });
  }

  createPriorAuthFromCheck(checkId: number): Observable<{ authId: number; serviceCodes: string }> {
    return this.http.post<{ authId: number; serviceCodes: string }>(
      `${this.base}/checks/${checkId}/create-prior-auth`, {}
    );
  }
}
