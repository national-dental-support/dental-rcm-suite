import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ScorecardRow {
  staffId: number;
  staffName: string;
  role: string;
  claimsDone: number;
  revenueRecovered: number;
  firstTouchRate: number | null;
  avgMinutesPerClaim: number;
  avgDaysToResolve: number;
  currentQueue: number;
  claimsGoal: number | null;
  revenueGoal: number | null;
  firstTouchGoal: number | null;
  avgDaysGoal: number | null;
}

export interface GoalRow {
  id: number;
  staffId: number;
  staffName: string;
  period: string;
  claimsGoal: number | null;
  revenueGoal: number | null;
  firstTouchGoal: number | null;
  avgDaysGoal: number | null;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ScorecardsService {
  private base = `${environment.server.baseUrl}/admin/scorecards`;

  constructor(private http: HttpClient) {}

  getScorecards(period = 'weekly'): Observable<ScorecardRow[]> {
    return this.http.get<{ data: ScorecardRow[] }>(`${this.base}`, { params: { period } })
      .pipe(map(r => r.data ?? []));
  }

  getGoals(period = 'weekly'): Observable<GoalRow[]> {
    return this.http.get<{ data: GoalRow[] }>(`${this.base}/goals`, { params: { period } })
      .pipe(map(r => r.data ?? []));
  }

  setGoals(body: {
    staffId: number; period: string;
    claimsGoal?: number | null; revenueGoal?: number | null;
    firstTouchGoal?: number | null; avgDaysGoal?: number | null;
  }): Observable<any> {
    return this.http.put(`${this.base}/goals`, body);
  }
}
