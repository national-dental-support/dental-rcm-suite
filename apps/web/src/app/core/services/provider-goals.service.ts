import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ProviderGoalRow {
  id?: number;
  providerName: string;
  dailyProductionGoal: number | null;
  weeklyProductionGoal: number | null;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ProviderGoalsService {
  private base = `${environment.server.baseUrl}/admin/provider-goals`;

  constructor(private http: HttpClient) {}

  getGoals(): Observable<ProviderGoalRow[]> {
    return this.http.get<{ data: ProviderGoalRow[] }>(this.base)
      .pipe(map(r => r.data ?? []));
  }

  setGoal(body: { providerName: string; dailyProductionGoal: number | null; weeklyProductionGoal: number | null }): Observable<any> {
    return this.http.put(this.base, body);
  }

  deleteGoal(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
