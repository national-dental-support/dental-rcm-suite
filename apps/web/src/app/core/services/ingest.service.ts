import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IngestConfig {
  id: number;
  customer_id: number;
  name: string;
  ingest_type: 'claim' | 'era' | 'eft' | 'eob';
  source_type: 'folder' | 'api';
  folder_path: string | null;
  file_extensions: string | null;
  api_json_schema: string | null;
  payer_id: number | null;
  poll_interval_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngestRun {
  id: number;
  config_id: number | null;
  config_name: string | null;
  customer_id: number;
  ingest_type: string;
  source_file: string | null;
  triggered_by: string;
  status: 'pending' | 'processing' | 'success' | 'partial' | 'error';
  records_found: number;
  records_inserted: number;
  records_failed: number;
  error_detail: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface IngestRunsResponse {
  rows: IngestRun[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class IngestService {
  private readonly base = `${environment.server.baseUrl}/ingest`;

  constructor(private http: HttpClient) {}

  listConfigs(): Observable<{ data: IngestConfig[] }> {
    return this.http.get<{ data: IngestConfig[] }>(`${this.base}/config`);
  }

  createConfig(body: Partial<IngestConfig>): Observable<{ data: IngestConfig }> {
    return this.http.post<{ data: IngestConfig }>(`${this.base}/config`, body);
  }

  updateConfig(id: number, body: Partial<IngestConfig>): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.base}/config/${id}`, body);
  }

  deleteConfig(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/config/${id}`);
  }

  listRuns(params: { type?: string; status?: string; page?: number; limit?: number }): Observable<IngestRunsResponse> {
    let p = new HttpParams();
    if (params.type)   p = p.set('type',   params.type);
    if (params.status) p = p.set('status', params.status);
    if (params.page != null)  p = p.set('page',  String(params.page));
    if (params.limit != null) p = p.set('limit', String(params.limit));
    return this.http.get<IngestRunsResponse>(`${this.base}/runs`, { params: p });
  }

  getRun(id: number): Observable<IngestRun> {
    return this.http.get<IngestRun>(`${this.base}/runs/${id}`);
  }

  uploadEra(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.base}/upload/era`, fd);
  }

  uploadClaim(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.base}/upload/claim`, fd);
  }

  uploadEob(claimId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.base}/upload/eob?claimId=${encodeURIComponent(claimId)}`, fd);
  }

  postJsonClaim(payload: object): Observable<any> {
    return this.http.post(`${this.base}/api/claim`, payload);
  }

  postJsonEft(payload: object): Observable<any> {
    return this.http.post(`${this.base}/api/eft`, payload);
  }

  getSchema(type: 'claim' | 'eft' | 'eob'): Observable<object> {
    return this.http.get<object>(`${this.base}/schema/${type}`);
  }
}
