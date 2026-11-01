import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminAuditEntry {
  id: number;
  actor_id: string;
  actor_role: string;
  action: string;
  target_id: string | null;
  before_state: string | null;
  after_state: string | null;
  ip_address: string | null;
  session_id: string | null;
  timestamp: string;
  created_at: string;
}

export interface AnalyticsEvent {
  id: number;
  session_id: string;
  user_id: string;
  url: string;
  timestamp: string;
  event_name: string;
  properties: string | null;
  created_at: string;
}

export interface AnalyticsError {
  id: number;
  session_id: string;
  user_id: string;
  url: string | null;
  timestamp: string;
  error_type: string;
  message: string;
  stack: string | null;
  http_status: number | null;
  http_method: string | null;
  http_url: string | null;
  created_at: string;
}

export interface AuditLogParams {
  actor?: string;
  target?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminLogsService {
  private readonly base = `${environment.server.baseUrl}/admin/logs`;
  private readonly auditBase = `${environment.server.baseUrl}/admin/audit-log`;

  constructor(private http: HttpClient) {}

  getEvents(limit = 500): Observable<AnalyticsEvent[]> {
    return this.http
      .get<{ data: AnalyticsEvent[] }>(`${this.base}/events?limit=${limit}`)
      .pipe(map(r => r.data ?? []));
  }

  getErrors(limit = 500): Observable<AnalyticsError[]> {
    return this.http
      .get<{ data: AnalyticsError[] }>(`${this.base}/errors?limit=${limit}`)
      .pipe(map(r => r.data ?? []));
  }

  fetchAuditLog(params: AuditLogParams = {}): Observable<AdminAuditEntry[]> {
    const query = new URLSearchParams();
    if (params.actor)  query.set('actor',  params.actor);
    if (params.target) query.set('target', params.target);
    if (params.action) query.set('action', params.action);
    if (params.from)   query.set('from',   params.from);
    if (params.to)     query.set('to',     params.to);
    query.set('limit', String(params.limit ?? 500));
    return this.http
      .get<{ data: AdminAuditEntry[] }>(`${this.auditBase}?${query.toString()}`)
      .pipe(map(r => r.data ?? []));
  }
}
