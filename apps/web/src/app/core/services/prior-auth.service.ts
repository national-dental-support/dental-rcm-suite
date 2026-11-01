import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PriorAuthStatus = 'pending' | 'submitted' | 'approved' | 'denied' | 'cancelled';

export interface PriorAuthRow {
  AuthId: number;
  ClaimId: string | null;
  PatientName: string;
  ProviderName: string | null;
  PayerName: string | null;
  ServiceType: string | null;
  ServiceCodes: string | null;
  RequestDate: string;
  DecisionDate: string | null;
  ExpirationDate: string | null;
  Status: PriorAuthStatus;
  AuthorizationNumber: string | null;
  DenialReason: string | null;
  Notes: string | null;
  CreatedByEmail: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface PriorAuthListResponse {
  data: PriorAuthRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatePriorAuthPayload {
  claimId?: string;
  patientName: string;
  providerName?: string;
  payerName?: string;
  serviceType?: string;
  serviceCodes?: string;
  requestDate?: string;
  expirationDate?: string;
  notes?: string;
}

export interface PriorAuthFilters {
  status?: PriorAuthStatus | '';
  patientName?: string;
  payerName?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class PriorAuthService {
  private readonly base = `${environment.server.baseUrl}/prior-auth`;

  constructor(private http: HttpClient) {}

  list(filters: PriorAuthFilters = {}): Observable<PriorAuthListResponse> {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.patientName) params = params.set('patientName', filters.patientName);
    if (filters.payerName) params = params.set('payerName', filters.payerName);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.page != null) params = params.set('page', String(filters.page));
    if (filters.pageSize != null) params = params.set('pageSize', String(filters.pageSize));
    return this.http.get<PriorAuthListResponse>(this.base, { params });
  }

  get(id: number): Observable<PriorAuthRow> {
    return this.http.get<PriorAuthRow>(`${this.base}/${id}`);
  }

  create(payload: CreatePriorAuthPayload): Observable<{ authId: number }> {
    return this.http.post<{ authId: number }>(this.base, payload);
  }

  update(id: number, payload: Partial<CreatePriorAuthPayload & { authorizationNumber?: string }>): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.base}/${id}`, payload);
  }

  submit(id: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${id}/submit`, {});
  }

  approve(id: number, payload: { authorizationNumber?: string; decisionDate?: string; expirationDate?: string; notes?: string }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${id}/approve`, payload);
  }

  deny(id: number, payload: { denialReason: string; decisionDate?: string; notes?: string }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${id}/deny`, payload);
  }

  cancel(id: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${id}/cancel`, {});
  }
}
