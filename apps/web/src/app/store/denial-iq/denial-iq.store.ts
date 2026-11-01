import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { forkJoin } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import {
  DenialManagementService,
  DenialTrendPoint,
  DenialKpis,
  DenialReason,
  DenialFilterParams,
} from '../../core/services/denial-management.service';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../store.models';
import { GlobalFiltersValue } from '../../shared/components/global-filters/global-filters.models';

export interface DenialDashboardData {
  trend: DenialTrendPoint[];
  kpis: DenialKpis;
  reasons: DenialReason[];
}

/** 5-minute TTL for denial dashboard data. */
const DASHBOARD_TTL = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class DenialIqStore {
  private readonly _dashboard$ = new BehaviorSubject<StoreSlice<DenialDashboardData>>(emptySlice());

  readonly dashboard$  = this._dashboard$.asObservable();
  readonly data$       = this._dashboard$.pipe(map(s => s.data), distinctUntilChanged());
  readonly loading$    = this._dashboard$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly error$      = this._dashboard$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(private denialService: DenialManagementService) {}

  /**
   * Load or refresh the denial dashboard data.
   * Caches for 5 minutes with the given filters as the cache key.
   * Pass force=true to bypass cache (e.g. after manual filter apply).
   */
  loadDashboard(filters?: GlobalFiltersValue, force = false): void {
    if (!force && isFresh(this._dashboard$.value, DASHBOARD_TTL)) return;

    this._dashboard$.next(loadingSlice(this._dashboard$.value));

    const params = this.buildParams(filters);

    forkJoin({
      trend:   this.denialService.getTrend(params),
      kpis:    this.denialService.getKpis(params),
      reasons: this.denialService.getTopReasons(params),
    }).subscribe({
      next: data => this._dashboard$.next(loadedSlice(data)),
      error: err => this._dashboard$.next(
        errorSlice(this._dashboard$.value, err?.message ?? 'Failed to load denial data'),
      ),
    });
  }

  /** Force reload when filters change (always bypasses cache). */
  reloadDashboard(filters?: GlobalFiltersValue): void {
    this.loadDashboard(filters, true);
  }

  /**
   * Reload using raw DenialFilterParams - used by period-picker (setPeriod)
   * where date range is constructed independently of GlobalFiltersValue.
   * Always bypasses cache since period-specific data should not be shared.
   */
  reloadByParams(params: DenialFilterParams): void {
    this._dashboard$.next(loadingSlice(this._dashboard$.value));
    forkJoin({
      trend:   this.denialService.getTrend(params),
      kpis:    this.denialService.getKpis(params),
      reasons: this.denialService.getTopReasons(params),
    }).subscribe({
      next: data => this._dashboard$.next(loadedSlice(data)),
      error: err => this._dashboard$.next(
        errorSlice(this._dashboard$.value, err?.message ?? 'Failed to load denial data'),
      ),
    });
  }

  /** Synchronous snapshot. */
  get dashboardSnapshot(): DenialDashboardData | null {
    return this._dashboard$.value.data;
  }

  private buildParams(filters?: GlobalFiltersValue): DenialFilterParams {
    if (!filters) return {};
    const loc = filters.location;
    return {
      start:     filters.startDate ? filters.startDate.toISOString().slice(0, 10) : null,
      end:       filters.endDate   ? filters.endDate.toISOString().slice(0, 10)   : null,
      payers:    filters.payers ?? [],
      providers: filters.providers ?? [],
      locations: loc?.scope === 'location' ? (loc as any).locations ?? [] : [],
      practices: loc?.scope === 'practice' ? (loc as any).practices
               : loc?.scope === 'group'    ? (loc as any).groups
               : [],
    };
  }
}
