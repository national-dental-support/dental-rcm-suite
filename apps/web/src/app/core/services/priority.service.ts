import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PriorityWeights {
  aging: number;
  value: number;
  deadline: number;
  workload: number;
}

export interface PriorityStats {
  totalScored: number;
  lastRunAt: string | null;
  avgScore: number;
  maxScore: number;
  minScore: number;
}

export interface PriorityDistribution {
  high: number;
  medium: number;
  low: number;
}

export interface PrioritySettings {
  weights: PriorityWeights;
  enabled: boolean;
  stats: PriorityStats;
  distribution: PriorityDistribution;
}

export interface TopPriorityClaim {
  claimId: string;
  priorityScore: number;
  agingComponent: number;
  valueComponent: number;
  deadlineComponent: number;
  workloadComponent: number;
  recalculatedAt: string;
  chargeAmt: number;
  agingDays: number;
  carcCode: string;
  claimStatus: string;
  assignedTo: string;
  assignedRole: string;
  patientName: string;
}

@Injectable({ providedIn: 'root' })
export class PriorityService {
  private base = `${environment.server.baseUrl}/admin/priority`;

  constructor(private http: HttpClient) {}

  getSettings(): Observable<PrioritySettings> {
    return this.http.get<PrioritySettings>(`${this.base}/settings`);
  }

  updateSettings(body: { weights?: PriorityWeights; enabled?: boolean }): Observable<any> {
    return this.http.put(`${this.base}/settings`, body);
  }

  triggerRecalculate(): Observable<{ message: string; scored: number }> {
    return this.http.post<{ message: string; scored: number }>(`${this.base}/recalculate`, {});
  }

  getTopClaims(limit = 50): Observable<{ data: TopPriorityClaim[] }> {
    return this.http.get<{ data: TopPriorityClaim[] }>(`${this.base}/top-claims`, { params: { limit: limit.toString() } });
  }
}
