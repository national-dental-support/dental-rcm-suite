import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WorkflowCondition {
  field: string;     // 'agingDays' | 'payerName' | 'reasonCode' | 'chargeAmount' | 'claimStatus'
  operator: string;  // '>' | '<' | '>=' | '<=' | '=' | '!=' | 'contains'
  value: string;
}

export interface WorkflowAction {
  actionType: string; // 'auto-escalate' | 'add-note'
  params: Record<string, any>;
}

export interface WorkflowRule {
  id?: number;
  name: string;
  description: string;
  matchType: 'all' | 'any';
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvaluateResult {
  message: string;
  actionsExecuted: number;
  results: { claimId: string; ruleName: string }[];
}

@Injectable({ providedIn: 'root' })
export class WorkflowRulesService {
  private baseUrl = `${environment.server.baseUrl}/denial-iq/workflow-rules`;

  constructor(private http: HttpClient) {}

  list(): Observable<WorkflowRule[]> {
    return this.http.get<{ message: string; data: WorkflowRule[] }>(this.baseUrl)
      .pipe(map(res => res.data || []));
  }

  create(rule: Partial<WorkflowRule>): Observable<{ id: number }> {
    return this.http.post<{ message: string; data: { id: number } }>(this.baseUrl, rule)
      .pipe(map(res => res.data));
  }

  update(id: number, rule: Partial<WorkflowRule>): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}`, rule);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  evaluate(): Observable<EvaluateResult> {
    return this.http.post<EvaluateResult>(`${this.baseUrl}/evaluate`, {});
  }
}
