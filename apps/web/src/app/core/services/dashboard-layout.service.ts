import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  DashboardLayout,
  DashboardLayoutConfig,
  DashboardLayoutsResponse,
} from '../models/dashboard-layout.model';

@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  private readonly base = '/api/insightflow/my/dashboard-layouts';
  private readonly ACTIVE_ID_KEY = 'insightflow_active_layout_id';

  constructor(private http: HttpClient) {}

  getLayouts(): Observable<DashboardLayoutsResponse> {
    return this.http.get<DashboardLayoutsResponse>(this.base);
  }

  createLayout(body: {
    name: string;
    config: DashboardLayoutConfig;
    isDefault: boolean;
  }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.base, body);
  }

  updateLayout(
    id: number,
    body: Partial<{ name: string; config: DashboardLayoutConfig; isDefault: boolean }>,
  ): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}`, body);
  }

  deleteLayout(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  setActiveLayout(id: number | null): Observable<void> {
    return this.http.put<void>(`${this.base}/active`, { id }).pipe(
      tap(() => {
        if (id != null) {
          localStorage.setItem(this.ACTIVE_ID_KEY, String(id));
        } else {
          localStorage.removeItem(this.ACTIVE_ID_KEY);
        }
      }),
    );
  }

  getCachedActiveId(): number | null {
    const v = localStorage.getItem(this.ACTIVE_ID_KEY);
    return v ? parseInt(v, 10) : null;
  }
}
