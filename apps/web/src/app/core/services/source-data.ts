import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiDataItem {
  claim_id?: number;
  patient?: string | null;
  patient_id?: string | null;
  dos_aging?: string | null;
  days_ago?: number | null;
  provider?: string | null;
  location?: string | null;
  payer?: string | null;
  code?: string | null;
  cpt_category?: string | null;
  submitted?: number | null;
  contracted?: number | null;
  insurance_paid?: number | null;
  patient_paid?: number | null;
  total_paid?: number | null;
  ar_balance?: number | null;
  payment_date?: string | null;
  carc?: string | null;
}

export interface SourceDataPagination {
  totalRecords: number;
  page: number;
  limit: number;
}

export interface SourceDataResponse {
  data: ApiDataItem[];
  pagination: SourceDataPagination;
  error?: any;
}

export interface SourceDataRequest {
  customer_id: string;
  location_ids: Array<string | number>;
  page: number;
  limit?: number;
  filters?: any;
  sort?: { column: string; direction: 'asc' | 'desc' };
}

@Injectable({ providedIn: 'root' })
export class SourceDataService {
  private base = `${environment.server.baseUrl}/analytics/source-data`;

  constructor(private http: HttpClient) {}

  get(req: SourceDataRequest): Observable<SourceDataResponse> {
    return this.http.post<SourceDataResponse>(`${this.base}`, req);
  }

  export(req: SourceDataRequest): Observable<Blob> {
    return this.http.post(`${this.base}/export`, req, { responseType: 'blob' }).pipe(
      map((b) => new Blob([b], { type: 'text/csv' }))
    );
  }
}
