import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ScheduledReport {
  id?: number;
  name: string;
  reportType: string;
  frequency: string;
  recipients: string;
  isActive: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdBy?: string;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ScheduledReportsService {
  private baseUrl = `${environment.server.baseUrl}/insightflow/scheduled-reports`;

  constructor(private http: HttpClient) {}

  list(): Observable<ScheduledReport[]> {
    return this.http.get<{ data: ScheduledReport[] }>(this.baseUrl)
      .pipe(map(res => res.data || []));
  }

  create(report: Partial<ScheduledReport>): Observable<{ id: number }> {
    return this.http.post<{ data: { id: number } }>(this.baseUrl, report)
      .pipe(map(res => res.data));
  }

  update(id: number, report: Partial<ScheduledReport>): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}`, report);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  runNow(id: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/${id}/run`, {});
  }
}
