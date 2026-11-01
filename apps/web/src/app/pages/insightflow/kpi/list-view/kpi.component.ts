// src/app/pages/insightflow/kpi/kpi.component.ts
import { Component, OnInit, OnDestroy, TrackByFunction } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Subject, switchMap, skip, takeUntil, tap } from 'rxjs';
import { KpiFilters, KpiItem } from '../kpi.models';
import { GlobalFiltersStore } from '../../../../shared/components/global-filters/global-filters.store';
import { GlobalFiltersValue } from '../../../../shared/components/global-filters/global-filters.models';
import { KpiService } from '../kpi.service';
import { KpiFilterDialogComponent } from '../filter-dialog/kpi-filter-dialog.component';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { CsvExportService } from '../../../../core/services/csv-export.service';

@Component({
    selector: 'app-kpi',
    templateUrl: './kpi.component.html',
    styleUrls: ['./kpi.component.scss'],
    standalone: false
})
export class KpiComponent implements OnInit, OnDestroy {
  filters$ = new BehaviorSubject<KpiFilters>({
    practice: 'All',
    location: 'All',
    provider: null,
    timeframe: 'Past 12 months',
    rag: 'All'
  });

  tabIndex = 0; // 0: Past 12 months, 1: YTD

  loading = true;

  readonly kpis$ = this.filters$.pipe(
    tap(() => this.loading = true),
    switchMap(f => this.kpiSvc.getList(f)),
    tap(() => this.loading = false),
  );

  lastupdated = new Date();

  private pageEnteredAt = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private kpiSvc: KpiService,
    private dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private analytics: AnalyticsService,
    private csvExport: CsvExportService,
    private globalFiltersStore: GlobalFiltersStore,
  ) {}

  ngOnInit(): void {
    this.pageEnteredAt = Date.now();
    this.analytics.track('page_view', { page: 'kpi_list' });

    // Apply initial global filters
    this.applyGlobalFilters(this.globalFiltersStore.value);

    // React to future global filter changes
    this.globalFiltersStore.applied$.pipe(
      skip(1),
      takeUntil(this.destroy$),
    ).subscribe(gf => this.applyGlobalFilters(gf));
  }

  ngOnDestroy(): void {
    this.analytics.track('page_exit', { page: 'kpi_list', durationMs: Date.now() - this.pageEnteredAt });
    this.destroy$.next();
    this.destroy$.complete();
  }

  private applyGlobalFilters(gf: GlobalFiltersValue): void {
    const loc = gf.location;
    const current = this.filters$.value;

    const practice: string = loc.scope === 'group'    && (loc as any).groups?.length    ? (loc as any).groups[0]
                           : loc.scope === 'practice' && (loc as any).practices?.length ? (loc as any).practices[0]
                           : 'All';

    const location: string = loc.scope === 'location' && (loc as any).locations?.length
      ? (loc as any).locations[0]
      : 'All';

    const provider: string | null = gf.providers.length ? gf.providers[0] : null;
    const payer: string[] = gf.payers?.length ? gf.payers : [];

    const patch: Partial<KpiFilters> = { practice, location, provider, payer };

    if (gf.startDate || gf.endDate) {
      patch.from      = gf.startDate ? gf.startDate.toISOString().slice(0, 10) : undefined;
      patch.to        = gf.endDate   ? gf.endDate.toISOString().slice(0, 10)   : undefined;
      patch.timeframe = 'Custom';
    } else {
      patch.from      = undefined;
      patch.to        = undefined;
      patch.timeframe = 'Past 12 months';
    }

    this.filters$.next({ ...current, ...patch });
  }

  openFilters(): void {
    this.analytics.track('kpi_filter_dialog_opened', { currentFilters: this.filters$.value });
    const ref = this.dialog.open(KpiFilterDialogComponent, {
      width: '920px',
      data: this.filters$.value
    });
    ref.afterClosed().subscribe((v: KpiFilters | undefined) => {
      if (v) {
        this.filters$.next(v);
        this.tabIndex = v.timeframe === 'YTD' ? 1 : 0;
        this.analytics.track('kpi_filter_applied', { filters: v });
      }
    });
  }

  clearAll(): void {
    this.filters$.next({
      practice: 'All',
      location: 'All',
      provider: null,
      timeframe: 'Past 12 months',
      rag: 'All'
    });
    this.tabIndex = 0;
    this.analytics.track('kpi_filters_cleared', {});
  }

  onTabChange(idx: number): void {
    this.tabIndex = idx;
    const current = this.filters$.value;
    const timeframe = idx === 0 ? 'Past 12 months' : 'YTD';
    this.filters$.next({ ...current, timeframe });
    this.analytics.track('kpi_tab_changed', { tabIndex: idx, timeframe });
  }

  viewDetails(item: KpiItem) {
    this.analytics.track('kpi_item_clicked', { slug: item.slug, title: item.title, rag: item.rag });
    this.router.navigate([item.slug], { relativeTo: this.route });
  }

  trackByItem: TrackByFunction<KpiItem> = (_i, it) => it.slug;

  async exportKpis(): Promise<void> {
    const kpis = await firstValueFrom(this.kpis$);
    const rows = (kpis ?? []).map(k => [
      k.slug,
      k.title,
      k.value,
      k.unit ?? '',
      k.rag,
      k.benchmark ?? '',
      k.thresholds.redMax,
      k.thresholds.amberMax,
    ]);
    this.csvExport.download(
      `kpis_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Slug', 'Title', 'Value', 'Unit', 'RAG', 'Benchmark', 'Red Max', 'Amber Max'],
      rows,
    );
  }

  // clamp the marker position for crazy values (negative, >100, etc.)
  markerPosition(item: KpiItem): number {
    if (item.value == null) return 0;
    const { min, max } = item.thresholds;
    const denom = max - min || 1;
    const raw = 100 * (item.value - min) / denom;
    return Math.max(0, Math.min(100, raw));
  }
}
