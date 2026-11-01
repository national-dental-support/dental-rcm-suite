import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ComplianceDashboard {
  training: {
    total: number;
    completed: number;
    overdue: number;
    complianceRate: number;
  };
  security: {
    failedLogins30d: number;
    uniqueFailedUsers: number;
    lockedAccounts: number;
    dormantAccounts: number;
  };
  users: {
    total: number;
    disabled: number;
    locked: number;
    dormant: number;
  };
  auditActivity: { action: string; cnt: number }[];
  generatedAt: string;
}

export interface AccessReviewUser {
  uid: number;
  name: string;
  Email: string;
  Role: number;
  lastLogin: string | null;
  disabled: boolean;
  archived: boolean;
  activityCount30d: number;
}

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private base = `${environment.server.baseUrl}/api/admin/compliance`;

  constructor(private http: HttpClient) {}

  getDashboard() {
    return this.http.get<ComplianceDashboard>(`${this.base}/dashboard`);
  }

  getAccessReview() {
    return this.http.get<AccessReviewUser[]>(`${this.base}/access-review`);
  }
}
