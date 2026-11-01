import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AiAlert {
  id: number;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  ai_explanation?: string;
  recommended_actions?: string;
  dismissed: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class AiAlertsService {
  private base = `${environment.server.baseUrl}/api/ai/alerts`;
  private _alerts$ = new BehaviorSubject<AiAlert[]>([]);
  readonly alerts$ = this._alerts$.asObservable();

  get alertCount(): number {
    return this._alerts$.value.filter(a => !a.dismissed).length;
  }

  constructor(private http: HttpClient) {}

  load(): Observable<{ data: AiAlert[] }> {
    return this.http.get<{ data: AiAlert[] }>(this.base).pipe(
      tap(res => this._alerts$.next(res.data || [])),
    );
  }

  dismiss(id: number): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.base}/${id}/dismiss`, {}).pipe(
      tap(() => {
        const updated = this._alerts$.value.map(a => a.id === id ? { ...a, dismissed: true } : a);
        this._alerts$.next(updated);
      }),
    );
  }

  runDetection(): Observable<{ detected: number; alerts: AiAlert[] }> {
    return this.http.post<{ detected: number; alerts: AiAlert[] }>(`${this.base}/run`, {});
  }

  createAlertRule(rule: { alertType: string; threshold: number; notifyEmail?: string }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/rules`, rule);
  }
}
