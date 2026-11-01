import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Filters,
  Totals,
  CollectionPoint,
  PayerCollectionDetail,
  ProcedureChange,
  PayerChange,
} from '../../core/models/payer-mix.models';

// Matches the new SQL result shape from /collection-trends
interface TrendsRow {
  Month: string;                 // "yyyy-MM"
  PatientCollections: number | null;
  InsuranceCollections: number | null;
  TotalCollections: number | null;
  PatientPct: number | null;
  InsurancePct: number | null;
}

interface RawPayerChangeRow {
  InsuranceID: number | null;
  InsuranceName: string | null;
  CurrentPeriodCharges: number | null;
  LastPeriodCharges: number | null;
  ChargeDelta: number | null;
  ChargeDeltaPct: number | null;
}

interface RawProcedureChangeRow {
  ProcedureCode: string;
  CurrentPeriodCharges: number | null;
  LastPeriodCharges: number | null;
  ChargeDelta: number | null;
  ChargeDeltaPct: number | null;
}

interface RawPayerCollectionDetailRow {
  InsuranceName: string | null;
  TotalCollections: number | null;
  InsuranceCollections: number | null;
  PatientCollections: number | null;
  InsurancePercentage: number | null;
  PatientPercentage: number | null;
  Claim: number | null;
}
// Matches the new totals endpoints: { total: number, formatted: string }
interface TotalsApiResponse {
  total: number;
  formatted: string;
}

@Injectable({ providedIn: 'root' })
export class PayerMixService {
  private base = `${(environment.server.baseUrl || '/api').replace(/\/+$/,'')}/analytics/payer-mix`;

  constructor(private http: HttpClient) {}

  /** Insurance total card */
  getInsuranceTotals(filters: Filters) {
    return this.http
      .post<any>(`${this.base}/insurance-collections`, { filters })
      .pipe(
        map(api => {
          const formatted = api?.formatted ? `$${api.formatted}` : '--';
          const priorFormatted = api?.prior_year_formatted ? `$${api.prior_year_formatted}` : '--';
          const allTimeFormatted = api?.all_time_formatted ? `$${api.all_time_formatted}` : '--';
          const totals: Totals = {
            total: formatted,
            prior_year: priorFormatted,
            all_time: allTimeFormatted,
          };
          return totals;
        }),
        catchError(() =>
          of({ total: '--', prior_year: '--', all_time: '--' } as Totals)
        )
      );
  }

  /** Patient total card */
  getPatientTotals(filters: Filters) {
    return this.http
      .post<any>(`${this.base}/patient-collections`, { filters })
      .pipe(
        map(api => {
          const formatted = api?.formatted ? `$${api.formatted}` : '--';
          const priorFormatted = api?.prior_year_formatted ? `$${api.prior_year_formatted}` : '--';
          const allTimeFormatted = api?.all_time_formatted ? `$${api.all_time_formatted}` : '--';
          const totals: Totals = {
            total: formatted,
            prior_year: priorFormatted,
            all_time: allTimeFormatted,
          };
          return totals;
        }),
        catchError(() =>
          of({ total: '--', prior_year: '--', all_time: '--' } as Totals)
        )
      );
  }

  /** Bar chart + trend line */
  getCollectionTrends(filters: Filters) {
    return this.http
      .post<TrendsRow[]>(`${this.base}/collection-trends`, { filters })
      .pipe(
        map(rows => this.mapTrends(rows ?? [])),
        catchError(() => of([] as CollectionPoint[]))
      );
  }

  /** Map SQL rows into chart-friendly points */
  private mapTrends(rows: TrendsRow[]): CollectionPoint[] {
    const pts: CollectionPoint[] = rows.map(r => {
      const insurance = r.InsuranceCollections ?? 0;
      const patient   = r.PatientCollections ?? 0;

      return {
        monthLabel: this.monthToLabel(r.Month),
        insuranceCollection: insurance,
        patientCollection: patient,
        // Start trend as same as insurance; we smooth below
        insuranceTrend: insurance,
      };
    });

    // optional: smooth the line a bit (3-point simple moving average)
    const sma = (arr: number[], w = 3) =>
      arr.map((_, i) => {
        const from = Math.max(0, i - (w - 1));
        const slice = arr.slice(from, i + 1);
        const sum = slice.reduce((a, b) => a + b, 0);
        return +(sum / slice.length).toFixed(2);
      });

    const trend = sma(pts.map(p => p.insuranceTrend ?? 0), 3);
    return pts.map((p, i) => ({ ...p, insuranceTrend: trend[i] }));
  }

  private monthToLabel(yyyyDashMm: string): string {
    // expects "YYYY-MM"
    const [y, m] = yyyyDashMm.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, 1);
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric' }); // e.g., "Oct 2025"
  }

  getPayersIncreasing(filters: Filters) {
    return this.http
      .post<RawPayerChangeRow[]>(`${this.base}/payers-increasing-production`, { filters })
      .pipe(
        map(rows =>
          (rows ?? []).map<PayerChange>(r => ({
            insuranceId: r.InsuranceID ?? null,
            insuranceName: r.InsuranceName ?? null,
            currentPeriodCharges: r.CurrentPeriodCharges ?? 0,
            lastPeriodCharges: r.LastPeriodCharges ?? 0,
            chargeDelta: r.ChargeDelta ?? 0,
            chargeDeltaPct: r.ChargeDeltaPct ?? null,
          }))
        ),
        catchError(() => of([] as PayerChange[]))
      );
  }

  getPayersDecreasing(filters: Filters) {
    return this.http
      .post<RawPayerChangeRow[]>(`${this.base}/payers-decreasing-production`, { filters })
      .pipe(
        map(rows =>
          (rows ?? []).map<PayerChange>(r => ({
            insuranceId: r.InsuranceID ?? null,
            insuranceName: r.InsuranceName ?? null,
            currentPeriodCharges: r.CurrentPeriodCharges ?? 0,
            lastPeriodCharges: r.LastPeriodCharges ?? 0,
            chargeDelta: r.ChargeDelta ?? 0,
            chargeDeltaPct: r.ChargeDeltaPct ?? null,
          }))
        ),
        catchError(() => of([] as PayerChange[]))
      );
  }

 getProceduresIncreasing(filters: Filters) {
  return this.http
    .post<RawProcedureChangeRow[]>(`${this.base}/procedures-increasing-production`, { filters })
    .pipe(
      // temporary debug
      // tap(rows => console.log('procedures increasing rows', rows)),
      map(rows =>
        (rows ?? []).map<ProcedureChange>(r => ({
          procedureCode: r.ProcedureCode,
          currentPeriodCharges: r.CurrentPeriodCharges ?? 0,
          lastPeriodCharges: r.LastPeriodCharges ?? 0,
          chargeDelta: r.ChargeDelta ?? 0,
          chargeDeltaPct: r.ChargeDeltaPct ?? null,
        }))
      ),
      catchError(err => {
        console.error('getProceduresIncreasing error', err);
        return of([] as ProcedureChange[]);
      })
    );
}

  getProceduresDecreasing(filters: Filters) {
    return this.http
      .post<RawProcedureChangeRow[]>(`${this.base}/procedures-decreasing-production`, { filters })
      .pipe(
        map(rows =>
          (rows ?? []).map<ProcedureChange>(r => ({
            procedureCode: r.ProcedureCode,
            currentPeriodCharges: r.CurrentPeriodCharges ?? 0,
            lastPeriodCharges: r.LastPeriodCharges ?? 0,
            chargeDelta: r.ChargeDelta ?? 0,
            chargeDeltaPct: r.ChargeDeltaPct ?? null,
          }))
        ),
        catchError(() => of([] as ProcedureChange[]))
      );
  }

  getPayerCollectionDetails(filters: Filters) {
    return this.http
      .post<RawPayerCollectionDetailRow[]>(`${this.base}/payer-collection-details`, { filters })
      .pipe(
        map(rows =>
          (rows ?? []).map<PayerCollectionDetail>(r => ({
            insuranceName: r.InsuranceName ?? null,
            totalCollections: r.TotalCollections ?? 0,
            insuranceCollections: r.InsuranceCollections ?? 0,
            patientCollections: r.PatientCollections ?? 0,
            insurancePercentage: r.InsurancePercentage ?? null,
            patientPercentage: r.PatientPercentage ?? null,
            claim: r.Claim ?? 0,
          }))
        ),
        catchError(() => of([] as PayerCollectionDetail[]))
      );
  }
}
