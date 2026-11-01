// src/app/pages/claim-queue/services/claim.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { delay, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ClaimDetail, ClaimFilters, ClaimRow } from '../models/claim.models';

export interface ClaimHistoryItem {
  type: 'status' | 'note' | 'escalation' | 'step_completion' | 'event' | 'sla';
  date: string;
  action: string;
  performedBy: string;
  role?: string;
  status?: string;
  progress?: number;
  balance?: number;
  eventSource?: 'history' | 'event' | 'sla';
  metadata?: Record<string, any>;
  resolved?: boolean;
}

interface QueueRowDto {
  Priority?: number;
  PatientName: string;
  ClaimID: string;
  PayerName: string;
  SubmittedDate: string;
  Charged: number;
  InsuranceBalance: number;
  Issue: string;
  AgingDays: number;
  ProgressPercent: number;
  AssignedToName?: string | null;
  SlaStatus?: 'OVERDUE' | 'URGENT' | 'WARNING' | 'OK';
  DaysUntilSla?: number | null;
  SlaDeadline?: string | null;
  ProviderName?: string | null;
  Location?: string | null;
  Status?: string | null;
  DateOfService?: string | null;
  AccountNumber?: string | null;
  IssueDescription?: string | null;
  EscalationReason?: string | null;
}

interface ApiResponse<T> {
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  criticalCount?: number;
  page: number;
  pageSize: number;
}

interface PaginatedApiResponse<T> {
  message: string;
  data: T[];
  totalCount: number;
  criticalCount?: number;
  page: number;
  pageSize: number;
}

interface ClaimInformationRow {
  PatientName: string | null;
  SubscriberName: string | null;
  SubscriberID: string | null;
  PracticeLocation: string | null;
  Provider: string | null;
  NPI: string | null;
  TaxID: string | null;
  DOB?: string | null;
  DateOfService: string | null;
  ReceivedDate: string | null;
  AgingDays: number | null;
  PaymentDate: string | null;
  DepositAmount: number | null;
  DepositCheckNo: string | null;
  DepositCleared: string | null;

  PayerName: string | null;
  RemittanceMethod: string | null;
  PaymentMethod: string | null;
  Network: string | null;
  PlaceOfService: string | null;
  ReasonCode: string | null;

  InsuranceBalDue: number | null;
  PatientBalDue: number | null;

  PrimaryIns: string | null;
  SecondaryIns: string | null;
  TertiaryIns: string | null;

  AssignedTo: string | number | null;
  AssignedUserName: string | null;
  ClaimNote: string | null;
}

interface ClaimInformationResponse {
  message: string;
  data: ClaimInformationRow[] | null;
}

interface ClaimDetailTableRowDto {
  DOS: string | null;
  ProcCode: string | null;
  ProcDescription?: string | null;
  Charge: number | null;
  InsPaid: number | null;
  Allowed: number | null;
  ContractualAdjustment: number | null;
  TransactionAdjustment: number | null;
  PatientResp: number | null;
  Deductible: number | null;
  Copay: number | null;
  Coins: number | null;
  ReasonCode: string | null;
}

interface ClaimDetailTableResponse {
  message: string;
  data: ClaimDetailTableRowDto[] | null;
}

@Injectable({ providedIn: 'root' })
export class ClaimService {
   //  Base URLs that match your Express mounts
  private readonly specialistBase =
    `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;
  private readonly managerBase =
    `${environment.server.baseUrl}/denial-iq/manager-view/claim-queue`;
  constructor(private http: HttpClient) {}

  // === existing dummy AR rows (can delete later) ============================
  private arRows: ClaimRow[] = [ /* ... your dummy data unchanged ... */ ];

  private managerRows: ClaimRow[] = [ /* ... can be removed once API is live */ ];

  // // Shared filter logic for legacy `list()`
  // private applyFilters(list: ClaimRow[], filters?: ClaimFilters): ClaimRow[] {
  //   if (!filters) return list;
  //   let out = list;

  //   if (filters.search) {
  //     const q = filters.search.toLowerCase();
  //     out = out.filter((r) => {
  //       const client = r.client ?? '';
  //       const payer = (r.payer as string | undefined) ?? '';
  //       const issue = (r.issueCode as string | undefined) ?? '';

  //       return (
  //         r.id.toLowerCase().includes(q) ||
  //         r.patient.toLowerCase().includes(q) ||
  //         client.toLowerCase().includes(q) ||
  //         payer.toLowerCase().includes(q) ||
  //         issue.toLowerCase().includes(q)
  //       );
  //     });
  //   }

  //   if (filters.status?.length) {
  //     out = out.filter((r) => filters.status!.includes(r.status));
  //   }

  //   if (filters.client) {
  //     out = out.filter((r) => r.client === filters.client);
  //   }

  //   if (filters.assignedTo) {
  //     out = out.filter((r) => r.assignedTo === filters.assignedTo);
  //   }

  //   return out;
  // }

  /** Legacy AR list (kept for now) */
  list(filters?: ClaimFilters): Observable<ClaimRow[]> {
    return of(this.applyFilters(this.arRows, filters)).pipe(delay(250));
  }

  // ---------------------------------------------------------------------------
  // AR SPECIALIST API
  // ---------------------------------------------------------------------------

  getArMyQueue(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/my-queue`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  getArEscalations(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/escalations`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  getArUnassigned(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/unassigned`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  getArAllClaims(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/all-claims`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  getArAwaitingAdjudication(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/awaiting-adjudication`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  getArNotSubmitted(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/not-submitted`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  exportQueueAllRows(tab: string, search?: string): Observable<ClaimRow[]> {
    let params = new HttpParams().set('tab', tab);
    if (search?.trim()) params = params.set('search', search.trim());
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/export`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res).data));
  }

  // === MANAGER QUEUE API ===================================================

  getManagerEscalations(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.managerBase}/escalations`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  getManagerUnassigned(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.managerBase}/unassigned`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  getManagerAllClaims(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.managerBase}/all-claims`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  // === Claim Detail - still using dummy for now ============================

 detail(id: string): Observable<ClaimDetail> {
  const params = new HttpParams().set('claimId', id);
  const url = `${environment.server.baseUrl}/denial-iq/claim-detail`;

  const DEFAULTS = {
    patient: 'Unknown patient',
    payer: 'Unknown payer',
    provider: '',

    subscriberName: '',
    subscriberId: '',
    practiceLocation: '',
    providerName: '',
    npi: '',
    taxId: '',

    remitMethod: '',
    paymentMethod: '',
    network: '',
    placeOfService: '',

    insuranceBalanceDue: 0,
    patientBalanceDue: 0,
    primaryIns: '',
    secondaryIns: 'None',
    tertiaryIns: 'None',
  } as const;

  return this.http
    .get<ClaimInformationResponse>(url, { params })
    .pipe(
      map((res) => {
        const row: ClaimInformationRow | undefined = res.data?.[0];

        // If nothing comes back at all, still return a fully usable object
        if (!row) {
          return {
            id,
            patient: DEFAULTS.patient,
            payer: DEFAULTS.payer,
            provider: DEFAULTS.provider,
            lineItems: [],
          } as ClaimDetail;
        }

        // derive a couple of "chain" defaults (primaryIns falls back to payer)
        const payer = row.PayerName ?? DEFAULTS.payer;
        const primaryIns =
          row.PrimaryIns ??
          payer ??
          DEFAULTS.primaryIns;

        const detail: ClaimDetail = {
          // core identity
          id,
          patient: row.PatientName?.trim() || row.SubscriberName?.trim() || DEFAULTS.patient,

          // optional identity info
          dob: row.DOB ? new Date(row.DOB) : undefined,

          payer,
          provider: row.Provider ?? DEFAULTS.provider,

          subscriberName: row.SubscriberName?.trim() || row.PatientName?.trim() || DEFAULTS.subscriberName,
          subscriberId: row.SubscriberID ?? DEFAULTS.subscriberId,
          practiceLocation: row.PracticeLocation ?? DEFAULTS.practiceLocation,
          providerName: row.Provider ?? DEFAULTS.providerName,
          npi: row.NPI ?? DEFAULTS.npi,
          taxId: row.TaxID ?? DEFAULTS.taxId,

          // dates / aging card
          dateOfService: row.DateOfService
            ? new Date(row.DateOfService)
            : undefined,
          receivedDate: row.ReceivedDate
            ? new Date(row.ReceivedDate)
            : undefined,
          agingDays: row.AgingDays ?? undefined,
          paymentDate: row.PaymentDate
            ? new Date(row.PaymentDate)
            : undefined,
          depositAmount: row.DepositAmount != null ? Number(row.DepositAmount) : undefined,
          depositCheckNumber: row.DepositCheckNo ?? undefined,
          depositCleared: row.DepositCleared
            ? new Date(row.DepositCleared)
            : undefined,

          // payer card
          remitMethod: row.RemittanceMethod ?? DEFAULTS.remitMethod,
          paymentMethod: row.PaymentMethod ?? DEFAULTS.paymentMethod,
          network: row.Network ?? DEFAULTS.network,
          placeOfService: row.PlaceOfService ?? DEFAULTS.placeOfService,
          reasonCode: row.ReasonCode ?? '',

          // balances / insurance card
          insuranceBalanceDue:
            row.InsuranceBalDue != null
              ? Number(row.InsuranceBalDue)
              : DEFAULTS.insuranceBalanceDue,
          patientBalanceDue:
            row.PatientBalDue != null
              ? Number(row.PatientBalDue)
              : DEFAULTS.patientBalanceDue,
          primaryIns,
          secondaryIns: row.SecondaryIns ?? DEFAULTS.secondaryIns,
          tertiaryIns: row.TertiaryIns ?? DEFAULTS.tertiaryIns,

          assignedUserName: row.AssignedUserName ?? null,
          assignedTo: row.AssignedTo ? String(row.AssignedTo) : null,

          // remediation / notes - you're hard-coding most of this for demo anyway
          remediationClaimId: id, // or `c.remediationClaimId` if backend adds it later
          remediationProcedure: 'All Procedures',

          notes: row.ClaimNote ?? '',

          // line items - still being wired from /detail-table later
          lineItems: [],
        };

        return detail;
      })
    );
}

  saveNotes(id: string, notes: string): Observable<void> {
    return of(void 0).pipe(delay(300));
  }

  // === Claim Lifecycle Actions ================================================

  private readonly claimDetailBase = `${environment.server.baseUrl}/denial-iq/claim-detail`;

  startWork(claimId: string): Observable<{ message: string; claimHistoryId: string }> {
    return this.http.post<{ message: string; claimHistoryId: string }>(
      `${this.claimDetailBase}/start-work`, { claimId }
    );
  }

  closeClaim(claimId: string, progress?: number, claimStatus?: string, closeReason?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.claimDetailBase}/close`, { claimId, progress, claimStatus, closeReason }
    );
  }

  escalateClaim(claimId: string, reason?: string): Observable<{ message: string; managerId: number }> {
    return this.http.post<{ message: string; managerId: number }>(
      `${this.claimDetailBase}/escalate`, { claimId, reason }
    );
  }

  assignClaim(claimId: string, assignToUserId?: number): Observable<{ message: string; assignedTo: number }> {
    return this.http.post<{ message: string; assignedTo: number }>(
      `${this.claimDetailBase}/assign`, { claimId, assignToUserId }
    );
  }

  getAssignableUsers(): Observable<{ id: number; name: string; role: string }[]> {
    return this.http.get<{ data: { id: number; name: string; role: string }[] }>(
      `${this.claimDetailBase}/assignable-users`
    ).pipe(map(r => r.data));
  }

  unassignClaim(claimId: string): Observable<{ message: string; rowsAffected: number }> {
    return this.http.post<{ message: string; rowsAffected: number }>(
      `${this.claimDetailBase}/unassign`, { claimId }
    );
  }

  closeClaimAdjudicated(claimId: string, progress?: number, closeReason?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.claimDetailBase}/close-adjudicated`, { claimId, progress, closeReason }
    );
  }

  getArPendingQueue(filters?: ClaimFilters, page = 0, pageSize = 25): Observable<PaginatedResponse<ClaimRow>> {
    const params = this.buildParams(filters, page, pageSize);
    return this.http
      .get<PaginatedApiResponse<QueueRowDto>>(`${this.specialistBase}/pending`, { params })
      .pipe(map((res) => this.mapPaginatedQueue(res)));
  }

  // === Claim Activity History ================================================

  getClaimHistory(claimId: string): Observable<ClaimHistoryItem[]> {
    const params = new HttpParams().set('claimId', claimId);
    return this.http
      .get<{ message: string; data: ClaimHistoryItem[] }>(`${this.claimDetailBase}/history`, { params })
      .pipe(map((res) => res.data || []));
  }

  exportClaimHistory(claimId: string): Observable<Blob> {
    const params = new HttpParams().set('claimId', claimId);
    return this.http.get(`${this.claimDetailBase}/history/export`, { params, responseType: 'blob' });
  }

  // === Auto-Assignment ======================================================

  autoAssign(limit?: number): Observable<{ message: string; count: number; assignments: any[] }> {
    return this.http.post<{ message: string; count: number; assignments: any[] }>(
      `${this.claimDetailBase}/auto-assign`, { limit }
    );
  }

  // === Bulk Claim Operations ================================================

  bulkAssign(claimIds: string[], assignToUserId?: number): Observable<{ message: string; count: number }> {
    return this.http.post<{ message: string; count: number }>(
      `${this.claimDetailBase}/bulk-assign`, { claimIds, assignToUserId }
    );
  }

  bulkEscalate(claimIds: string[], reason?: string): Observable<{ message: string; count: number; managerId: number }> {
    return this.http.post<{ message: string; count: number; managerId: number }>(
      `${this.claimDetailBase}/bulk-escalate`, { claimIds, reason }
    );
  }

  bulkClose(claimIds: string[], claimStatus?: string): Observable<{ message: string; closed: number; skipped: number }> {
    return this.http.post<{ message: string; closed: number; skipped: number }>(
      `${this.claimDetailBase}/bulk-close`, { claimIds, claimStatus }
    );
  }

  bulkReassign(claimIds: string[], toUserId: number): Observable<{ message: string; count: number }> {
    return this.http.post<{ message: string; count: number }>(
      `${this.claimDetailBase}/bulk-reassign`, { claimIds, toUserId }
    );
  }

  // === helpers ============================================================

  private mapPaginatedQueue(res: PaginatedApiResponse<QueueRowDto>): PaginatedResponse<ClaimRow> {
    return {
      data: (res.data || []).map((d) => this.mapQueueRow(d)),
      totalCount: res.totalCount ?? 0,
      criticalCount: res.criticalCount,
      page: res.page ?? 0,
      pageSize: res.pageSize ?? 25,
    };
  }

  private mapQueueRow(dto: QueueRowDto): ClaimRow {
    return {
      id: dto.ClaimID,
      patient: dto.PatientName,
      payer: dto.PayerName,
      submittedDate: dto.SubmittedDate,
      charged: dto.Charged,
      insBalance: dto.InsuranceBalance,
      issueCode: dto.Issue,
      agingDays: dto.AgingDays,
      progress: dto.ProgressPercent,
      priority: dto.Priority,
      assignedTo: dto.AssignedToName ?? undefined,
      providerName: dto.ProviderName ?? undefined,
      location: dto.Location ?? undefined,
      status: dto.Status ?? undefined,
      // legacy / future fields:
      balance: dto.InsuranceBalance,
      SlaStatus: dto.SlaStatus,
      daysUntilSla: dto.DaysUntilSla ?? null,
      slaDeadline: dto.SlaDeadline ?? null,
      dateOfService: dto.DateOfService ?? null,
      accountNumber: dto.AccountNumber ?? null,
      issueDescription: dto.IssueDescription ?? null,
      escalationReason: dto.EscalationReason ?? null,
    };
  }

  private buildParams(filters?: ClaimFilters, page?: number, pageSize?: number): HttpParams {
    let params = new HttpParams();

    if (page != null) params = params.set('page', page.toString());
    if (pageSize != null) params = params.set('pageSize', pageSize.toString());

    if (!filters) return params;

    if (filters.search) params = params.set('search', filters.search);
    if (filters.status && filters.status.length) {
      params = params.set('status', filters.status.join(','));
    }
    if (filters.client) params = params.set('client', filters.client);
    if (filters.assignedTo !== undefined) {
      params = params.set('assignedTo', filters.assignedTo);
    }
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);

    return params;
  }

  private applyFilters(list: ClaimRow[], filters?: ClaimFilters): ClaimRow[] {
    if (!filters) return list;
    let out = list;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter((r) => {
        const client = r.client ?? '';
        const payer = (r.payer as string | undefined) ?? '';
        const issue = (r.issueCode as string | undefined) ?? '';

        return (
          r.id.toLowerCase().includes(q) ||
          r.patient.toLowerCase().includes(q) ||
          client.toLowerCase().includes(q) ||
          payer.toLowerCase().includes(q) ||
          issue.toLowerCase().includes(q)
        );
      });
    }

    if (filters.status?.length) {
      out = out.filter((r) => filters.status!.includes(r.status));
    }

    if (filters.client) {
      out = out.filter((r) => r.client === filters.client);
    }

    if (filters.assignedTo) {
      out = out.filter((r) => r.assignedTo === filters.assignedTo);
    }

    return out;
  }

  getClaimDetailTable(id: string): Observable<ClaimDetail['lineItems']> {
  const params = new HttpParams().set('claimId', id);
  const url = `${environment.server.baseUrl}/denial-iq/claim-detail/detail-table`;

  return this.http
    .get<ClaimDetailTableResponse>(url, { params })
    .pipe(
      map(res => (res.data || []).map((dto): any => ({
        dos: dto.DOS ? new Date(dto.DOS) : undefined,
        cpt: dto.ProcCode ?? '',
        cptDescription: dto.ProcDescription ?? undefined,
        charge: dto.Charge ?? 0,
        insurancePaid: dto.InsPaid ?? 0,
        allowed: dto.Allowed ?? 0,
        contractualAdj: dto.ContractualAdjustment ?? 0,
        transactionAdj: dto.TransactionAdjustment ?? 0,
        patientResp: dto.PatientResp ?? 0,
        deductible: dto.Deductible ?? 0,
        copay: dto.Copay ?? 0,
        coins: dto.Coins ?? 0,
        reasonCode: dto.ReasonCode ?? '',
      })))
    );
}
}
