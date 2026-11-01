import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClearinghouseConnection {
  id: number;
  name: string;
  provider: string;
  apiUrl?: string;
  username?: string;
  isActive: boolean;
  lastSyncAt?: string;
  syncInterval: number;
  customerId?: number;
  createdAt: string;
}

export interface ClearinghouseProvider {
  id: string;
  name: string;
  fields: string[];
}

export interface ClearinghouseLogEntry {
  id: number;
  action: string;
  claimId?: string;
  status: string;
  errorMessage?: string;
  durationMs: number;
  createdAt: string;
  connectionName: string;
  provider: string;
}

export interface ClaimStatusResult {
  claimId: string;
  status: string;
  carcCode?: string;
  chargeAmount: number;
  dateOfService?: string;
  checkedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ClearinghouseService {
  private base = `${environment.server.baseUrl}/api/integrations/clearinghouse`;

  constructor(private http: HttpClient) {}

  listConnections(): Observable<ClearinghouseConnection[]> {
    return this.http.get<ClearinghouseConnection[]>(`${this.base}/connections`);
  }

  createConnection(data: Partial<ClearinghouseConnection> & {
    apiKey?: string; apiSecret?: string;
  }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/connections`, data);
  }

  updateConnection(id: number, data: Partial<ClearinghouseConnection> & {
    apiKey?: string; apiSecret?: string;
  }): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.base}/connections/${id}`, data);
  }

  deleteConnection(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/connections/${id}`);
  }

  testConnection(id: number): Observable<{ success: boolean; provider: string; message: string }> {
    return this.http.post<{ success: boolean; provider: string; message: string }>(
      `${this.base}/test/${id}`, {}
    );
  }

  checkClaimStatus(connectionId: number, claimId: string): Observable<ClaimStatusResult> {
    return this.http.post<ClaimStatusResult>(`${this.base}/check-status`, { connectionId, claimId });
  }

  getLogs(days = 30): Observable<ClearinghouseLogEntry[]> {
    const params = new HttpParams().set('days', days.toString());
    return this.http.get<ClearinghouseLogEntry[]>(`${this.base}/logs`, { params });
  }

  getProviders(): Observable<ClearinghouseProvider[]> {
    return this.http.get<ClearinghouseProvider[]>(`${this.base}/providers`);
  }
}
