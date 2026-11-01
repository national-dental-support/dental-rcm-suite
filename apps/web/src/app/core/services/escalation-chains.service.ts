import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface EscalationLevel {
  id?: number;
  chainId?: number;
  levelOrder: number;
  targetRole: string;
  slaHours: number;
  notifyAtPct: number;
  description: string | null;
}

export interface EscalationChain {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  levels: EscalationLevel[];
}

export interface SlaClaimRow {
  claimId: string;
  patientName: string;
  assignedTo: string;
  assignedRole: string;
  claimStatus: string;
  carcCode: string;
  balanceDue: number;
  hoursOpen: number;
  slaHours: number;
  slaStatus: 'breached' | 'warning' | 'ok';
  hoursRemaining: number;
}

export interface SlaSummary {
  breached: number;
  warning: number;
  ok: number;
  total: number;
}

export interface SlaStatusResponse {
  data: SlaClaimRow[];
  summary: SlaSummary;
}

export interface AutoEscalateResponse {
  message: string;
  escalated: number;
}

@Injectable({ providedIn: 'root' })
export class EscalationChainsService {
  private base = `${environment.server.baseUrl}/admin/escalation`;

  constructor(private http: HttpClient) {}

  listChains(): Observable<EscalationChain[]> {
    return this.http.get<{ data: EscalationChain[] }>(`${this.base}/chains`)
      .pipe(map(r => r.data ?? []));
  }

  createChain(body: { name: string; description?: string; levels: Partial<EscalationLevel>[] }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/chains`, body);
  }

  updateChain(id: number, body: { name: string; description?: string; isActive: boolean; levels: Partial<EscalationLevel>[] }): Observable<any> {
    return this.http.put(`${this.base}/chains/${id}`, body);
  }

  deleteChain(id: number): Observable<any> {
    return this.http.delete(`${this.base}/chains/${id}`);
  }

  getSlaStatus(): Observable<SlaStatusResponse> {
    return this.http.get<SlaStatusResponse>(`${this.base}/sla-status`);
  }

  triggerAutoEscalate(): Observable<AutoEscalateResponse> {
    return this.http.post<AutoEscalateResponse>(`${this.base}/check-sla`, {});
  }
}
