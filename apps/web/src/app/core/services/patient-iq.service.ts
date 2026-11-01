import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AgingBucket {
  label: string;
  amount: number;
  percent: number;
}

export interface PaymentPlanSummary {
  active: number;
  onTrack: number;
  behind: number;
  completedThisMonth: number;
}

export interface PatientIqDashboard {
  totalOutstanding: number;
  percentCurrent: number;
  avgArDays: number;
  activePlanCount: number;
  agingBuckets: AgingBucket[];
  paymentPlanSummary: PaymentPlanSummary;
}

export interface PatientBalance {
  id: number;
  customer_id: number;
  patient_name: string;
  patient_dob: string | null;
  account_number: string;
  location_name: string;
  balance_current: number;
  balance_30: number;
  balance_60: number;
  balance_90: number;
  balance_120_plus: number;
  total_balance: number;
  last_statement_date: string | null;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  status: string;
  updated_at: string;
}

export interface PatientStatement {
  id: number;
  customer_id: number;
  patient_name: string;
  account_number: string;
  amount_due: number;
  statement_date: string;
  due_date: string;
  sent_via: string;
  status: string;
  paid_amount: number | null;
  paid_date: string | null;
  created_at: string;
}

export interface PaymentPlan {
  id: number;
  customer_id: number;
  patient_name: string;
  account_number: string;
  location_name: string;
  total_amount: number;
  paid_amount: number;
  installment_amount: number;
  frequency: string;
  start_date: string;
  end_date: string;
  status: string;
  created_by: string;
  created_at: string;
}

export interface PaymentPlanPayment {
  id: number;
  plan_id: number;
  due_date: string;
  paid_date: string | null;
  amount_due: number;
  amount_paid: number | null;
  status: string;
}

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BalanceFilters {
  status?: string;
  location?: string;
  accountNumber?: string;
  patientName?: string;
  page?: number;
  pageSize?: number;
}

export interface StatementFilters {
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PlanFilters {
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateStatementPayload {
  patientName: string;
  accountNumber?: string;
  amountDue: number;
  statementDate?: string;
  dueDate?: string;
  sentVia?: string;
}

export interface CreatePlanPayload {
  patientName: string;
  accountNumber?: string;
  locationName?: string;
  totalAmount: number;
  installmentAmount: number;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  createdBy?: string;
}

// Propensity
export interface PropensityScore {
  patientId: number;
  accountNumber: string;
  patientName: string;
  totalBalance: number;
  score: 'high' | 'medium' | 'low';
  scoreLabel: 'Likely to Pay' | 'Moderate Risk' | 'High Risk';
  lastPaymentDate: string | null;
  daysSincePayment: number | null;
}

export interface PropensityAggregate {
  highCount: number;
  mediumCount: number;
  lowCount: number;
  highTotal: number;
  mediumTotal: number;
  lowTotal: number;
  totalAtRisk: number;
}

export interface PropensityResponse {
  data: PropensityScore[];
  aggregate: PropensityAggregate;
}

// Communications
export interface CommLogEntry {
  id: number;
  patient_name: string;
  account_number: string;
  method: 'email' | 'sms' | 'mail';
  recipient_address: string | null;
  subject: string | null;
  amount_due: number | null;
  status: 'delivered' | 'failed' | 'pending';
  sent_at: string;
}

export interface SendCommPayload {
  accountNumber: string;
  patientName: string;
  method: 'email' | 'sms' | 'mail';
  recipientAddress?: string;
  subject?: string;
  body?: string;
  amountDue?: number;
}

// Collections
export interface CollectionRecord {
  id: number;
  patient_name: string;
  account_number: string;
  total_balance: number;
  balance_120_plus: number;
  days_since_payment: number;
  escalation_status: 'eligible' | 'escalated' | 'resolved';
  agency_name: string | null;
  notes: string | null;
  escalated_at: string | null;
}

// Guarantors
export interface GuarantorMember {
  accountNumber: string;
  patientName: string;
  totalBalance: number;
  status: string;
}

export interface GuarantorGroup {
  guarantorName: string;
  accountCount: number;
  totalBalance: number;
  oldestBalance: string | null;
  accountsWith120Plus: number;
  members: GuarantorMember[];
}

@Injectable({ providedIn: 'root' })
export class PatientIqService {
  private readonly base = '/api/patient-iq';

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<PatientIqDashboard> {
    return this.http.get<PatientIqDashboard>(`${this.base}/dashboard`);
  }

  getBalances(filters: BalanceFilters = {}): Observable<PagedResult<PatientBalance>> {
    let params = new HttpParams();
    if (filters.status)        params = params.set('status',         filters.status);
    if (filters.location)      params = params.set('location',       filters.location);
    if (filters.accountNumber) params = params.set('account_number', filters.accountNumber);
    if (filters.patientName)   params = params.set('patient_name',   filters.patientName);
    if (filters.page !== undefined)     params = params.set('page',     filters.page);
    if (filters.pageSize !== undefined) params = params.set('pageSize', filters.pageSize);
    return this.http.get<PagedResult<PatientBalance>>(`${this.base}/balances`, { params });
  }

  getStatements(filters: StatementFilters = {}): Observable<PagedResult<PatientStatement>> {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.from)   params = params.set('from',   filters.from);
    if (filters.to)     params = params.set('to',     filters.to);
    if (filters.page !== undefined)     params = params.set('page',     filters.page);
    if (filters.pageSize !== undefined) params = params.set('pageSize', filters.pageSize);
    return this.http.get<PagedResult<PatientStatement>>(`${this.base}/statements`, { params });
  }

  createStatement(payload: CreateStatementPayload): Observable<PatientStatement> {
    return this.http.post<PatientStatement>(`${this.base}/statements`, payload);
  }

  getPaymentPlans(filters: PlanFilters = {}): Observable<PagedResult<PaymentPlan>> {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.page !== undefined)     params = params.set('page',     filters.page);
    if (filters.pageSize !== undefined) params = params.set('pageSize', filters.pageSize);
    return this.http.get<PagedResult<PaymentPlan>>(`${this.base}/payment-plans`, { params });
  }

  createPaymentPlan(payload: CreatePlanPayload): Observable<PaymentPlan> {
    return this.http.post<PaymentPlan>(`${this.base}/payment-plans`, payload);
  }

  getPlanPayments(planId: number): Observable<PaymentPlanPayment[]> {
    return this.http.get<PaymentPlanPayment[]>(`${this.base}/payment-plans/${planId}/payments`);
  }

  recordPayment(planId: number, paymentId: number, amountPaid?: number, paidDate?: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/payment-plans/${planId}/payments/${paymentId}/record`, { amountPaid, paidDate });
  }

  // Propensity
  getPropensity(): Observable<PropensityResponse> {
    return this.http.get<PropensityResponse>(`${this.base}/propensity`);
  }

  // Communications
  getCommLog(): Observable<CommLogEntry[]> {
    return this.http.get<CommLogEntry[]>(`${this.base}/communications`);
  }

  sendComm(payload: SendCommPayload): Observable<{ ok: boolean; id: number }> {
    return this.http.post<{ ok: boolean; id: number }>(`${this.base}/communications`, payload);
  }

  // Collections
  getCollections(status?: string): Observable<CollectionRecord[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<CollectionRecord[]>(`${this.base}/collections`, { params });
  }

  escalateCollection(id: number, agencyName: string, notes: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/collections/${id}/escalate`, { agencyName, notes });
  }

  resolveCollection(id: number, notes: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/collections/${id}/resolve`, { notes });
  }

  // Guarantors
  getGuarantors(search?: string): Observable<GuarantorGroup[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<GuarantorGroup[]>(`${this.base}/guarantors`, { params });
  }
}
