import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface FollowupRule {
  id: number;
  name: string;
  payerId: number | null;
  daysWithoutResponse: number;
  autoGenerateTask: boolean;
  autoGenerateAppeal: boolean;
  notifySpecialist: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface FollowupTask {
  id: number;
  claimId: string;
  ruleId: number;
  ruleName: string;
  payerName: string;
  chargeAmt: number;
  daysSinceSubmission: number;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  completedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class PayerFollowupService {
  private base = `${environment.server.baseUrl}/api/automation/payer-followup`;

  constructor(private http: HttpClient) {}

  listRules() {
    return this.http.get<FollowupRule[]>(`${this.base}/rules`);
  }

  createRule(rule: Partial<FollowupRule>) {
    return this.http.post<{ id: number }>(`${this.base}/rules`, rule);
  }

  updateRule(id: number, rule: Partial<FollowupRule>) {
    return this.http.put<{ success: boolean }>(`${this.base}/rules/${id}`, rule);
  }

  deleteRule(id: number) {
    return this.http.delete<{ success: boolean }>(`${this.base}/rules/${id}`);
  }

  listTasks(status?: string) {
    const params: any = {};
    if (status) params.status = status;
    return this.http.get<FollowupTask[]>(`${this.base}/tasks`, { params });
  }

  completeTask(id: number) {
    return this.http.post<{ success: boolean }>(`${this.base}/tasks/${id}/complete`, {});
  }
}
