import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { forkJoin } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import {
  ReconIqService,
  ReconReportFilters,
  ReconReportSummary,
  ReconReportPayerRow,
  ReconReportTrendRow,
  ReconReportInTransitRow,
  ReconIqEraEobPaymentResponse,
} from '../../core/services/recon-iq.service';
import {
  ReconIqMatchStatsResponse,
  DenialsNonPaymentsResponseDto,
  ReconIqDashboardFilters,
} from '../../core/models/recon-iq.models';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../store.models';

export interface ReconDashboardData {
  matchStats: ReconIqMatchStatsResponse;
  deniedTrend: DenialsNonPaymentsResponseDto;
  eraEobPayment: ReconIqEraEobPaymentResponse;
}

/** Mirror the actual API response shapes from recon-iq.service.ts. */
export interface ReconReportData {
  summary: ReconReportSummary;
  byPayer: { rows: ReconReportPayerRow[] };
  trend:   { rows: ReconReportTrendRow[] };
  inTransit: { rows: ReconReportInTransitRow[]; total: number };
}

/** 5-minute TTL for dashboard; 10-minute TTL for reconciliation report. */
const DASHBOARD_TTL = 5 * 60 * 1000;
const REPORT_TTL    = 10 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ReconIqStore {
  private readonly _dashboard$ = new BehaviorSubject<StoreSlice<ReconDashboardData>>(emptySlice());
  private readonly _report$    = new BehaviorSubject<StoreSlice<ReconReportData>>(emptySlice());

  // -- Dashboard --------------------------------------------------------------
  readonly dashboard$         = this._dashboard$.asObservable();
  readonly dashboardData$     = this._dashboard$.pipe(map(s => s.data), distinctUntilChanged());
  readonly dashboardLoading$  = this._dashboard$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly dashboardError$    = this._dashboard$.pipe(map(s => s.error), distinctUntilChanged());

  // -- Reconciliation Report --------------------------------------------------
  readonly report$         = this._report$.asObservable();
  readonly reportData$     = this._report$.pipe(map(s => s.data), distinctUntilChanged());
  readonly reportLoading$  = this._report$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly reportError$    = this._report$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(private reconService: ReconIqService) {}

  /** Load all 3 dashboard charts. Cached 5 min; pass force=true to bypass. */
  loadDashboard(filters?: ReconIqDashboardFilters, force = false): void {
    if (!force && isFresh(this._dashboard$.value, DASHBOARD_TTL)) return;

    this._dashboard$.next(loadingSlice(this._dashboard$.value));

    forkJoin({
      matchStats:    this.reconService.getMatchStats(filters),
      deniedTrend:   this.reconService.getDeniedClaimsAndNonPaymentsTrend({ ...filters }),
      eraEobPayment: this.reconService.getEraEobPayment({ ...filters }),
    }).subscribe({
      next:  data => this._dashboard$.next(loadedSlice(data)),
      error: err  => this._dashboard$.next(
        errorSlice(this._dashboard$.value, err?.message ?? 'Failed to load recon dashboard'),
      ),
    });
  }

  reloadDashboard(filters?: ReconIqDashboardFilters): void {
    this.loadDashboard(filters, true);
  }

  /**
   * Load reconciliation report (summary + by-payer + trend + in-transit).
   * Cached 10 min; pass force=true to bypass.
   */
  loadReport(filters: ReconReportFilters, force = false): void {
    if (!force && isFresh(this._report$.value, REPORT_TTL)) return;

    this._report$.next(loadingSlice(this._report$.value));

    forkJoin({
      summary:   this.reconService.getReconReportSummary(filters),
      byPayer:   this.reconService.getReconReportByPayer(filters),
      trend:     this.reconService.getReconReportMonthlyTrend(filters),
      inTransit: this.reconService.getReconReportInTransit(filters),
    }).subscribe({
      next:  data => this._report$.next(loadedSlice(data)),
      error: err  => this._report$.next(
        errorSlice(this._report$.value, err?.message ?? 'Failed to load reconciliation report'),
      ),
    });
  }

  reloadReport(filters: ReconReportFilters): void {
    this.loadReport(filters, true);
  }

  get dashboardSnapshot(): ReconDashboardData | null {
    return this._dashboard$.value.data;
  }

  get reportSnapshot(): ReconReportData | null {
    return this._report$.value.data;
  }
}
