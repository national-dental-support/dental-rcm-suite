import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { forkJoin } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  DenialManagementService,
  DenialTrendPoint,
  DenialKpis,
  DenialReason,
  DenialFilterParams,
} from '../../core/services/denial-management.service';
import { BenchmarkingService } from '../../core/services/benchmarking.service';
import { InsightflowService, InsightflowKpiData } from '../../core/services/insight-flow.service';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../store.models';
import { GlobalFiltersValue } from '../../shared/components/global-filters/global-filters.models';

// -- Executive Summary types (mirrors executive-summary.component.ts) ----------
type Status   = 'green' | 'yellow' | 'red';
type Severity = 'critical' | 'warning' | 'info';
type Priority = 'high' | 'medium' | 'low';
interface ActionItem   { priority: Priority; label: string; link: string; product: string; }
interface SectionAlert { severity: Severity; message: string; actions: ActionItem[]; }
interface KpiItem      { key: string; label: string; value: number | null; format: 'number' | 'currency' | 'percent'; }
interface SummarySection {
  slug: string; label: string; status: Status; kpis: KpiItem[]; alerts: SectionAlert[];
  topPayers?: { payerName: string; denialRate: number; deniedCount: number; totalCount: number }[];
  topReasons?: { reason: string; currentAmount: number; previousAmount: number }[];
}
interface CrossProductInsight {
  severity: Severity; products: string[]; title: string; detail: string; actions: ActionItem[];
}
export interface ExecSummaryResponse {
  generatedAt: string;
  overallStatus: Status;
  criticalCount: number;
  warningCount: number;
  okCount: number;
  sections: Record<string, SummarySection>;
  crossProductInsights: CrossProductInsight[];
  actionQueue: ActionItem[];
}

export interface DenialKpisData {
  trend: DenialTrendPoint[];
  kpis: DenialKpis;
  reasons: DenialReason[];
}

/** TTLs: exec summary 5 min, denial KPIs 5 min, telemetry KPIs 5 min, benchmarking 30 min. */
const EXEC_TTL           = 5  * 60 * 1000;
const DENIAL_KPIS_TTL    = 5  * 60 * 1000;
const TELEMETRY_KPIS_TTL = 5  * 60 * 1000;
const BENCHMARK_TTL      = 30 * 60 * 1000;


@Injectable({ providedIn: 'root' })
export class InsightflowStore {
  private _execSummarySub?: Subscription;
  private readonly _execSummary$    = new BehaviorSubject<StoreSlice<ExecSummaryResponse>>(emptySlice());
  private readonly _denialKpis$     = new BehaviorSubject<StoreSlice<DenialKpisData>>(emptySlice());
  private readonly _telemetryKpis$  = new BehaviorSubject<StoreSlice<InsightflowKpiData>>(emptySlice());
  private readonly _benchmarking$   = new BehaviorSubject<StoreSlice<any>>(emptySlice());


  // -- Executive Summary ------------------------------------------------------
  readonly execSummary$        = this._execSummary$.asObservable();
  readonly execSummaryData$    = this._execSummary$.pipe(map(s => s.data), distinctUntilChanged());
  readonly execSummaryLoading$ = this._execSummary$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly execSummaryError$   = this._execSummary$.pipe(map(s => s.error), distinctUntilChanged());

  // -- Denial KPIs -----------------------------------------------------------
  readonly denialKpis$        = this._denialKpis$.asObservable();
  readonly denialKpisData$    = this._denialKpis$.pipe(map(s => s.data), distinctUntilChanged());
  readonly denialKpisLoading$ = this._denialKpis$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly denialKpisError$   = this._denialKpis$.pipe(map(s => s.error), distinctUntilChanged());

  // -- Telemetry KPIs (Revenue Cycle) ----------------------------------------
  readonly telemetryKpis$        = this._telemetryKpis$.asObservable();
  readonly telemetryKpisData$    = this._telemetryKpis$.pipe(map(s => s.data), distinctUntilChanged());
  readonly telemetryKpisLoading$ = this._telemetryKpis$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly telemetryKpisError$   = this._telemetryKpis$.pipe(map(s => s.error), distinctUntilChanged());

  // -- Benchmarking ----------------------------------------------------------
  readonly benchmarking$        = this._benchmarking$.asObservable();
  readonly benchmarkingData$    = this._benchmarking$.pipe(map(s => s.data), distinctUntilChanged());
  readonly benchmarkingLoading$ = this._benchmarking$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly benchmarkingError$   = this._benchmarking$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(
    private http: HttpClient,
    private denialService: DenialManagementService,
    private benchmarkingService: BenchmarkingService,
    private insightflowService: InsightflowService,
  ) {}

  /** Returns a default start date string N months before today. */
  private defaultStart(monthsBack: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsBack);
    return d.toISOString().slice(0, 10);
  }

  private todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Load executive summary. Cached 5 min. */
  loadExecSummary(filters?: GlobalFiltersValue, force = false): void {
    if (!force && isFresh(this._execSummary$.value, EXEC_TTL)) return;

    const start = filters?.startDate ? filters.startDate.toISOString().slice(0, 10) : this.defaultStart(12);
    const end   = filters?.endDate   ? filters.endDate.toISOString().slice(0, 10)   : this.todayStr();
    const params = new URLSearchParams({ start, end });
    (filters?.payers   ?? []).forEach(p => params.append('payers',    p));
    (filters?.providers ?? []).forEach(p => params.append('providers', p));
    const loc = filters?.location;
    if (loc?.scope === 'location')  (loc as any).locations.forEach((l: string) => params.append('locations', l));
    if (loc?.scope === 'practice')  (loc as any).practices.forEach((p: string) => params.append('practices', p));
    if (loc?.scope === 'group')     (loc as any).groups.forEach((g: string)    => params.append('groups',    g));
    const url = `${environment.server.baseUrl}/insightflow/executive-summary?${params.toString()}`;

    this._execSummarySub?.unsubscribe();
    this._execSummary$.next(loadingSlice(this._execSummary$.value));

    // On demo start the serverless DB may still be resuming; the backend returns 503
    // { code:'DB_WARMING', retryable:true }. Stay in the LOADING state and retry with a
    // short backoff instead of showing the terminal "Failed to load" banner. Only after
    // retries are exhausted do we surface an error.
    const maxRetries = 6;      // ~6 x 4s = up to ~24s of DB-warming tolerance
    const retryDelayMs = 4000;
    const attempt = (n: number): void => {
      this._execSummarySub = this.http.get<ExecSummaryResponse>(url).subscribe({
        next:  data => this._execSummary$.next(loadedSlice(data)),
        error: err  => {
          const warming = err?.status === 503 || err?.error?.code === 'DB_WARMING' || err?.error?.retryable === true;
          if (warming && n < maxRetries) {
            this._execSummary$.next(loadingSlice(this._execSummary$.value));
            this._execSummarySub = timer(retryDelayMs).subscribe(() => attempt(n + 1));
            return;
          }
          this._execSummary$.next(
            errorSlice(this._execSummary$.value, err?.error?.message ?? err?.message ?? 'Failed to load executive summary'),
          );
        },
      });
    };
    attempt(0);
  }

  /** Load denial KPI data (trend + KPIs + top reasons). Cached 5 min. */
  loadDenialKpis(filters?: GlobalFiltersValue, force = false): void {
    if (!force && isFresh(this._denialKpis$.value, DENIAL_KPIS_TTL)) return;

    this._denialKpis$.next(loadingSlice(this._denialKpis$.value));

    const params: DenialFilterParams = {
      start:  filters?.startDate ? filters.startDate.toISOString().slice(0, 10) : this.defaultStart(12),
      end:    filters?.endDate   ? filters.endDate.toISOString().slice(0, 10)   : this.todayStr(),
      payers: filters?.payers ?? [],
    };

    forkJoin({
      trend:   this.denialService.getTrend(params),
      kpis:    this.denialService.getKpis(params),
      reasons: this.denialService.getTopReasons(params),
    }).subscribe({
      next:  data => this._denialKpis$.next(loadedSlice(data)),
      error: err  => this._denialKpis$.next(
        errorSlice(this._denialKpis$.value, err?.message ?? 'Failed to load denial KPIs'),
      ),
    });
  }

  reloadDenialKpis(filters?: GlobalFiltersValue): void {
    this.loadDenialKpis(filters, true);
  }

  /** Load telemetry KPIs (revenue cycle). Cached 5 min. */
  loadTelemetryKpis(filters?: GlobalFiltersValue, yoy = false, force = false): void {
    if (!force && isFresh(this._telemetryKpis$.value, TELEMETRY_KPIS_TTL)) return;

    const start = filters?.startDate ? filters.startDate.toISOString().slice(0, 10) : this.defaultStart(12);
    const end   = filters?.endDate   ? filters.endDate.toISOString().slice(0, 10)   : this.todayStr();
    const payers = filters?.payers ?? [];
    const providers = filters?.providers ?? [];
    const loc = filters?.location;
    const locations = loc?.scope === 'location' ? (loc as any).locations ?? [] : [];

    this._telemetryKpis$.next(loadingSlice(this._telemetryKpis$.value));
    this.insightflowService.getKpis(start, end, yoy, payers, providers, locations).subscribe({
      next:  data => this._telemetryKpis$.next(loadedSlice(data)),
      error: err  => this._telemetryKpis$.next(
        errorSlice(this._telemetryKpis$.value, err?.message ?? 'Failed to load telemetry KPIs'),
      ),
    });
  }

  reloadTelemetryKpis(filters?: GlobalFiltersValue, yoy = false): void {
    this.loadTelemetryKpis(filters, yoy, true);
  }

  /** Load benchmarking comparison. Cached 30 min. */
  loadBenchmarking(filters?: GlobalFiltersValue, force = false): void {
    if (!force && isFresh(this._benchmarking$.value, BENCHMARK_TTL)) return;

    const start = filters?.startDate ? filters.startDate.toISOString().slice(0, 10) : this.defaultStart(12);
    const end   = filters?.endDate   ? filters.endDate.toISOString().slice(0, 10)   : this.todayStr();
    const payers = filters?.payers ?? [];
    const providers = filters?.providers ?? [];
    const loc = filters?.location;
    const locations = loc?.scope === 'location' ? (loc as any).locations ?? [] : [];

    this._benchmarking$.next(loadingSlice(this._benchmarking$.value));
    this.benchmarkingService.getComparison(start, end, payers, providers, locations).subscribe({
      next:  data => this._benchmarking$.next(loadedSlice(data)),
      error: err  => this._benchmarking$.next(
        errorSlice(this._benchmarking$.value, err?.message ?? 'Failed to load benchmarking'),
      ),
    });
  }

  get execSummarySnapshot(): ExecSummaryResponse | null {
    return this._execSummary$.value.data;
  }

  /** Clear all cached data - call on logout or persona switch. */
  clear(): void {
    this._execSummary$.next(emptySlice());
    this._denialKpis$.next(emptySlice());
    this._telemetryKpis$.next(emptySlice());
    this._benchmarking$.next(emptySlice());
  }
}
