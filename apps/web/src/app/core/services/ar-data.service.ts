// src/app/core/services/ar-data.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AgingDetail,
  ArData,
  ArSort,
  Filters,
  ArTrendRow,
  ArDaysByPracticeRes,
} from '../models/ar-types';

interface ArSpecialtyRes {
  total?: string | number;
  details?: Array<{ category?: string; value?: string | number; percentage?: string | number }>;
}

interface ArSummaryRes {
  ar_aging?: {
    total?: string | number;
    details?: Array<{ category?: string; value?: string | number; percentage?: string | number }>;
  };
  ar_trends?: {
    details?: Array<{
      month?: string;
      total_0_30?: string | number;
      total_31_60?: string | number;
      total_61_90?: string | number;
      total_over_90?: string | number;
    }>;
  };
  ar_specialty?: ArSpecialtyRes;   //  add this
  [key: string]: any;
}

interface ArBalanceRes {
  total?: string | number;        // e.g. "$1.70M"
  prior_year?: string | number;   // e.g. "$573.47K"
  last_12_months?: string | number;
  [key: string]: any;
}

interface ArDaysRes {
  total?: string | number;        // e.g. "118"
  prior_year?: string | number;   // e.g. "40"
  last_12_months?: string | number;
  [key: string]: any;
}

interface ArCollectionsBreakdownRow {
  id: string;
  name: string;
  collectionCount: string;
  patientCollections: string;
  insuranceCollections: string;
  grossCollections: string;
  productionAdjustment: string | null;
  collectionAdjustment?: string | null;
  arBalance: string;
  // subRows omitted for now
}

interface ArCollectionsBreakdownRes {
  data: Array<{
    practice: string;
    numCollections: number;
    insuranceCollections: number;
    patientCollections: number;
    grossCollections: number;
    collectionRate: number | null;
    productionAdjustment: number;
    collectionAdjustment: number;
    refund: number;
    insuranceBilled: number;
    production: number;
  }>;
  pagination?: {
    currentPage: number;
    pageSize: number;
    totalRecords: number;
  };
}

interface ArDistributionRow {
  AgingBracket: string;
  NumAccts_LT0: number;
  ARBalance_LT0: number;
  NumAccts_0_1000: number;
  ARBalance_0_1000: number;
  NumAccts_1001_2000: number;
  ARBalance_1001_2000: number;
  NumAccts_GT2000: number;
  ARBalance_GT2000: number;
}

interface ArDistributionRes {
  rows: ArDistributionRow[];
}

@Injectable({ providedIn: 'root' })
export class ArDataService {
  private readonly base = environment.server.baseUrl; // '/api'

  constructor(private http: HttpClient) {}

  fetch(filters: Filters, sort: ArSort): Observable<ArData> {
  const body = { filters, sort };

  // Critical endpoints - errors propagate so the component can show an error state
  const summary$ = this.http
    .post<ArSummaryRes>(`${this.base}/analytics/ar/ar-summary`, body);

  const balance$ = this.http
    .post<ArBalanceRes>(`${this.base}/analytics/ar/ar-balance`, body);

  const days$ = this.http
    .post<ArDaysRes>(`${this.base}/analytics/ar/ar-days`, body);

  const breakdown$ = this.http
    .post<ArCollectionsBreakdownRes>(
      `${this.base}/analytics/ar/ar-collections-breakdown`,
      body
    )
    .pipe(catchError(() => of({ data: [] } as ArCollectionsBreakdownRes)));

    const distribution$ = this.http
      .post<ArDistributionRes>(`${this.base}/analytics/ar/ar-distribution`, body)
      .pipe(catchError(() => of({ rows: [] } as ArDistributionRes)));

    const daysByPractice$ = this.http
      .post<ArDaysByPracticeRes>(`${this.base}/analytics/ar/ar-days-by-practice`, body)
      .pipe(catchError(() => of({ rows: [] } as ArDaysByPracticeRes)));

  return forkJoin([summary$, balance$, days$, breakdown$, distribution$, daysByPractice$]).pipe(
  map(([summary, balance, days, breakdownRes, distributionRes, daysByPracticeRes]) => {
    const arBalance = this.toNumber(balance?.total);
    const priorYearARBalance = this.toNumber(balance?.prior_year);
    const last12MonthsARBalance = this.toNumber(balance?.last_12_months);

    const averageDaysInAR = this.toNumber(days?.total);
    const priorYearAverageDaysInAR = this.toNumber(days?.prior_year);
    const last12MonthsDaysInAR = days?.last_12_months != null ? this.toNumber(days.last_12_months) : null;

    const aging = this.normalizeAgingFromSummary(summary?.ar_aging);
    const agingData = aging.details.length
      ? { total: aging.total, details: aging.details }
      : null;

    const trendsData = {
      details: this.normalizeTrendsFromSummary(summary?.ar_trends),
    };

    const specialtyDetailsRaw = summary?.ar_specialty?.details ?? [];
    const specialtyTotal = this.toNumber(summary?.ar_specialty?.total);

    const specialtyData =
      specialtyDetailsRaw.length > 0
        ? {
            total: specialtyTotal,
            details: specialtyDetailsRaw.map((d) => ({
              label: d.category,
              category: d.category,
              value: this.toNumber(d.value),
              percentage: this.toNumber(d.percentage),
            })),
          }
        : null;

    const distribution = this.buildDistributionTable(distributionRes?.rows ?? []);

    const breakdownRows = (breakdownRes?.data ?? []).map((r) => ({
      practice: r.practice,
      numCollections: r.numCollections,
      insuranceCollections: r.insuranceCollections,
      patientCollections: r.patientCollections,
      grossCollections: r.grossCollections,
      collectionRate: r.collectionRate,
      productionAdjustment: r.productionAdjustment,
      collectionAdjustment: r.collectionAdjustment,
      refund: r.refund,
      insuranceBilled: r.insuranceBilled,
      production: r.production,
    }));

    const breakdown =
      breakdownRows.length > 0
        ? {
            columns: [
              { key: 'practice', label: 'Practice', type: 'text' },
              { key: 'numCollections', label: '# Collections', type: 'number' },
              {
                key: 'insuranceCollections',
                label: 'Insurance Collections',
                type: 'currency',
              },
              {
                key: 'patientCollections',
                label: 'Patient Collections',
                type: 'currency',
              },
              {
                key: 'grossCollections',
                label: 'Gross Collections',
                type: 'currency',
              },
              {
                key: 'collectionRate',
                label: 'Collection Rate',
                type: 'number',
              },
              {
                key: 'productionAdjustment',
                label: 'Production Adj.',
                type: 'currency',
              },
              {
                key: 'collectionAdjustment',
                label: 'Collection Adj.',
                type: 'currency',
              },
              { key: 'refund', label: 'Refund', type: 'currency' },
              {
                key: 'insuranceBilled',
                label: 'Insurance Billed',
                type: 'number',
              },
            ],
            rows: breakdownRows,
          }
        : null;

         const daysByPracticeRows = daysByPracticeRes?.rows ?? [];

    const daysInARByPractice =
      daysByPracticeRows.length > 0
        ? {
            columns: [
              { key: 'operations',   label: 'Practice',                    type: 'text' },
              { key: 'currentYear',  label: 'Days in AR (Past 12 Months)', type: 'number' },
              { key: 'previousYear', label: 'Days in AR (All Time)',        type: 'number' },
            ],
            rows: daysByPracticeRows,
          }
        : null;

    return {
      arBalance,
      last12MonthsARBalance,
      priorYearARBalance,
      averageDaysInAR,
      last12MonthsDaysInAR,
      priorYearAverageDaysInAR,
      agingData,
      trendsData,
      providers: [],
      breakdown,
      distribution,
      specialtyData,
      daysInARByPractice
      
    } as ArData & { breakdown: any; distribution: any; daysInARByPractice: any };
  })
);
}

  // ---------- helpers ----------

  /** Parse "$1.70M", "$573,471.11", "14392.04", "-0.00" into numbers. */
  private toNumber(input: string | number | null | undefined): number {
    if (input == null) return 0;
    if (typeof input === 'number') return isFinite(input) ? input : 0;

    let s = String(input).trim();
    if (!s) return 0;

    const suffix = s.match(/([MK])\b/i)?.[1]?.toUpperCase() ?? '';
    s = s.replace(/[,$%\s]/g, '').replace(/^\$/, '').replace(/[MK]$/i, '');
    const base = parseFloat(s);
    if (!isFinite(base)) return 0;

    const factor = suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
    return base * factor;
  }

 private normalizeAgingFromSummary(raw?: {
  total?: string | number;
  details?: Array<{
    category?: string;
    value?: string | number;
    percentage?: string | number;
  }>;
}): { total: number; details: AgingDetail[] } {
  if (!raw) {
    return { total: 0, details: [] };
  }

  const totalNum = this.toNumber(raw.total);

  const details: AgingDetail[] = (raw.details ?? [])
    .map((d) => {
      const valueNum = this.toNumber(d.value);
      const pctNum = this.toNumber(d.percentage);
      const cat = d.category ?? '';

      return {
        //  AgingDetail requires label
        label: cat,
        //  keep category too if your chart uses it
        category: cat,
        //  always positive for charting, works for + or - inputs
        value: Math.abs(valueNum),
        percentage: pctNum,
      } as AgingDetail;
    })
    // optional: drop zero buckets so they don't render as tiny slices
    .filter((d) => d.value !== 0);

  return {
    total: Math.abs(totalNum),
    details,
  };
}

  private normalizeTrendsFromSummary(trends?: ArSummaryRes['ar_trends']): ArTrendRow[] {
    const rows = trends?.details ?? [];
    return rows
      .map((r) => ({
        month: String(r?.month ?? ''),
        total_0_30: this.toNumber(r?.total_0_30),
        total_31_60: this.toNumber(r?.total_31_60),
        total_61_90: this.toNumber(r?.total_61_90),
        total_over_90: this.toNumber(r?.total_over_90),
      }))
      .filter((r) => !!r.month);
  }

  private normalizeSpecialtyFromSummary(
  specialty?: ArSpecialtyRes
): { total: number; details: AgingDetail[] } {
  const total = this.toNumber(specialty?.total);
  const details: AgingDetail[] = (specialty?.details ?? []).map((d) => {
    const value = this.toNumber(d?.value);
    const pct = this.toNumber(d?.percentage);
    return {
      label: (d?.category ?? '\u2014') as string,
      value,
      percentage: pct,
    };
  });

  const computedTotal = total || details.reduce((sum, x) => sum + x.value, 0);
  if (computedTotal > 0) {
    details.forEach((d) => {
      if (!d.percentage && d.value != null) {
        d.percentage = +((d.value / computedTotal) * 100).toFixed(2);
      }
    });
  }

  return { total: computedTotal, details };
}

private buildDistributionTable(rows: ArDistributionRow[]): {
    columns: { key: string; label?: string; type?: 'text' | 'number' | 'currency' }[];
    rows: any[];
  } | null {
    if (!rows || !rows.length) return null;

    const columns = [
      { key: 'agingBracket', label: 'Age Bucket', type: 'text' as const },

      { key: 'numAcctsLT0', label: '# Accts < $0', type: 'number' as const },
      { key: 'arBalanceLT0', label: 'AR < $0', type: 'currency' as const },

      { key: 'numAccts0_1000', label: '# Accts $0\u2013$1,000', type: 'number' as const },
      { key: 'arBalance0_1000', label: 'AR $0\u2013$1,000', type: 'currency' as const },

      { key: 'numAccts1001_2000', label: '# Accts $1,001\u2013$2,000', type: 'number' as const },
      { key: 'arBalance1001_2000', label: 'AR $1,001\u2013$2,000', type: 'currency' as const },

      { key: 'numAcctsGT2000', label: '# Accts > $2,000', type: 'number' as const },
      { key: 'arBalanceGT2000', label: 'AR > $2,000', type: 'currency' as const },
    ];

    const mappedRows = rows.map((r) => ({
      agingBracket: r.AgingBracket ?? '',

      numAcctsLT0: r.NumAccts_LT0 ?? 0,
      arBalanceLT0: r.ARBalance_LT0 ?? 0,

      numAccts0_1000: r.NumAccts_0_1000 ?? 0,
      arBalance0_1000: r.ARBalance_0_1000 ?? 0,

      numAccts1001_2000: r.NumAccts_1001_2000 ?? 0,
      arBalance1001_2000: r.ARBalance_1001_2000 ?? 0,

      numAcctsGT2000: r.NumAccts_GT2000 ?? 0,
      arBalanceGT2000: r.ARBalance_GT2000 ?? 0,
    }));

    return { columns, rows: mappedRows };
  }
}
