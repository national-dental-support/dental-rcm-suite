import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TimeTrackingSummary {
  activeSpecialists: number;
  totalClaimsWorked: number;
  totalHoursWorked: number;
  avgMinutesPerClaim: number;
  avgDailyHoursPerSpecialist: number;
  avgUtilizationPct: number;
  periodDays: number;
}

export interface UtilizationRow {
  staffId: number;
  staffName: string;
  daysActive: number;
  avgDailyMinutes: number;
  minDailyMinutes: number;
  maxDailyMinutes: number;
  totalMinutes: number;
  avgSessionsPerDay: number;
  utilizationPct: number;
}

export interface TimeSinkRow {
  carcCode: string;
  claimCount: number;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  totalMinutes: number;
  teamAvgMinutes: number;
  diffFromAvg: number;
  diffPct: number;
}

export interface PayerTimeRow {
  payerId: number;
  payerName: string;
  claimCount: number;
  avgMinutes: number;
  totalMinutes: number;
  totalHours: number;
  teamAvgMinutes: number;
  diffFromAvg: number;
}

export interface BenchmarkRow {
  staffId: number;
  staffName: string;
  claimsWorked: number;
  daysActive: number;
  totalHours: number;
  avgMinPerClaim: number;
  teamAvgMinPerClaim: number;
  diffFromTeam: number;
  diffPct: number;
  claimsPerDay: number;
  utilizationPct: number;
  speedPercentile: number;
}

export interface TrendPoint {
  date: string;
  activeStaff: number;
  claimsWorked: number;
  totalHours: number;
  avgMinPerClaim: number;
}

@Injectable({ providedIn: 'root' })
export class TimeTrackingService {
  private base = `${environment.server.baseUrl}/admin/time-tracking`;

  constructor(private http: HttpClient) {}

  getSummary(days = 30): Observable<TimeTrackingSummary> {
    return this.http.get<TimeTrackingSummary>(`${this.base}/summary`, { params: { days } });
  }

  getUtilization(days = 14): Observable<UtilizationRow[]> {
    return this.http.get<UtilizationRow[]>(`${this.base}/utilization`, { params: { days } });
  }

  getTimeSinks(days = 30, limit = 15): Observable<TimeSinkRow[]> {
    return this.http.get<TimeSinkRow[]>(`${this.base}/time-sinks`, { params: { days, limit } });
  }

  getByPayer(days = 30): Observable<PayerTimeRow[]> {
    return this.http.get<PayerTimeRow[]>(`${this.base}/by-payer`, { params: { days } });
  }

  getBenchmarks(days = 30): Observable<BenchmarkRow[]> {
    return this.http.get<BenchmarkRow[]>(`${this.base}/benchmarks`, { params: { days } });
  }

  getTrend(days = 30): Observable<TrendPoint[]> {
    return this.http.get<TrendPoint[]>(`${this.base}/trend`, { params: { days } });
  }
}
