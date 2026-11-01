import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { KpiItem, KpiDetail, KpiFilters } from './kpi.models';

@Injectable({ providedIn: 'root' })
export class KpiService {
  private base = '/api/analytics/kpis';

  constructor(private http: HttpClient) {}

  getList(filters: KpiFilters): Observable<KpiItem[]> {
    return this.http.post<KpiItem[]>(`${this.base}/list`, filters);
  }

  getDetail(slug: string, filters: KpiFilters): Observable<KpiDetail> {
    return this.http.post<KpiDetail>(`${this.base}/detail/${slug}`, filters);
  }
}
