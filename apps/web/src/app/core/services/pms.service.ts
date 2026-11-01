import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PMSConnection {
  id: number;
  name: string;
  pmsType: string;
  apiUrl?: string;
  username?: string;
  databasePath?: string;
  isActive: boolean;
  syncDirection: string;
  lastImportAt?: string;
  lastExportAt?: string;
  syncInterval: number;
  autoImportClaims: boolean;
  autoExportNotes: boolean;
  autoExportPayments: boolean;
  customerId?: number;
  createdAt: string;
}

export interface PMSProvider {
  id: string;
  name: string;
  vendor: string;
  fields: string[];
  capabilities: string[];
}

export interface PMSSyncLogEntry {
  id: number;
  direction: string;
  syncType: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage?: string;
  durationMs: number;
  createdAt: string;
  connectionName: string;
  pmsType: string;
}

export interface PMSFieldMapping {
  id: number;
  entityType: string;
  pmsField: string;
  rcmField: string;
  transform?: string;
  isActive: boolean;
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsFailed: number;
  direction: string;
  syncType: string;
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class PMSService {
  private base = `${environment.server.baseUrl}/api/integrations/pms`;

  constructor(private http: HttpClient) {}

  listConnections(): Observable<PMSConnection[]> {
    return this.http.get<PMSConnection[]>(`${this.base}/connections`);
  }

  createConnection(data: Partial<PMSConnection> & {
    apiKey?: string; apiSecret?: string;
  }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/connections`, data);
  }

  updateConnection(id: number, data: Partial<PMSConnection> & {
    apiKey?: string; apiSecret?: string;
  }): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.base}/connections/${id}`, data);
  }

  deleteConnection(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/connections/${id}`);
  }

  testConnection(id: number): Observable<{ success: boolean; pmsType: string; message: string }> {
    return this.http.post<{ success: boolean; pmsType: string; message: string }>(
      `${this.base}/test/${id}`, {}
    );
  }

  triggerSync(id: number, direction: string, syncType: string): Observable<SyncResult> {
    return this.http.post<SyncResult>(`${this.base}/sync/${id}`, { direction, syncType });
  }

  getLogs(days = 30): Observable<PMSSyncLogEntry[]> {
    const params = new HttpParams().set('days', days.toString());
    return this.http.get<PMSSyncLogEntry[]>(`${this.base}/logs`, { params });
  }

  getFieldMappings(connectionId: number): Observable<PMSFieldMapping[]> {
    return this.http.get<PMSFieldMapping[]>(`${this.base}/field-mappings/${connectionId}`);
  }

  saveFieldMapping(connectionId: number, data: Partial<PMSFieldMapping>): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/field-mappings/${connectionId}`, data);
  }

  deleteFieldMapping(mappingId: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/field-mappings/mapping/${mappingId}`);
  }

  getProviders(): Observable<PMSProvider[]> {
    return this.http.get<PMSProvider[]>(`${this.base}/providers`);
  }
}
