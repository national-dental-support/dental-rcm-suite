// src/app/pages/insightflow/kpi/detail-view/kpi-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { KpiFilters, KpiItem, KpiTrendPoint } from '../kpi.models';
import { KpiService } from '../kpi.service';
import { KpiFilterDialogComponent } from '../filter-dialog/kpi-filter-dialog.component';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { CsvExportService } from '../../../../core/services/csv-export.service';

@Component({
    selector: 'app-kpi-detail',
    templateUrl: './kpi-detail.component.html',
    styleUrls: ['./kpi-detail.component.scss'],
    standalone: false
})
export class KpiDetailComponent implements OnInit, OnDestroy {
  private filters$ = new BehaviorSubject<KpiFilters>({
    practice: 'All', location: 'All', provider: null, timeframe: 'Past month', rag: 'All'
  });

  readonly detail$ = combineLatest([this.route.paramMap, this.filters$]).pipe(
    switchMap(([params, filters]) => this.kpiSvc.getDetail(params.get('slug')!, filters))
  );

  private slug = '';
  private pageEnteredAt = 0;

  constructor(
    private kpiSvc: KpiService,
    private route: ActivatedRoute,
    private location: Location,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private analytics: AnalyticsService,
    private csvExport: CsvExportService,
  ) {}

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.pageEnteredAt = Date.now();
    this.analytics.track('page_view', { page: 'kpi_detail', slug: this.slug });
  }

  ngOnDestroy(): void {
    this.analytics.track('page_exit', { page: 'kpi_detail', slug: this.slug, durationMs: Date.now() - this.pageEnteredAt });
  }

  back() {
    this.analytics.track('kpi_detail_back_clicked', { slug: this.slug });
    this.location.back();
  }

  openFilters() {
    this.analytics.track('kpi_detail_filter_dialog_opened', { slug: this.slug });
    const ref = this.dialog.open(KpiFilterDialogComponent, {
      width: '920px',
      data: this.filters$.value
    });
    ref.afterClosed().subscribe((v: KpiFilters | undefined) => {
      if (v) {
        this.filters$.next(v);
        this.analytics.track('kpi_detail_filter_applied', { slug: this.slug, filters: v });
      }
    });
  }

  markerPosition(item: KpiItem): number {
    if (item.value == null) return 0;
    const { min, max } = item.thresholds;
    const denom = max - min || 1;
    const raw = 100 * (item.value - min) / denom;
    return Math.max(0, Math.min(100, raw));
  }

  mapQuarterlyTrend(points: KpiTrendPoint[] | null | undefined) {
    return (points ?? []).map(p => ({
      date: p.label,
      value: Number(p.value) || 0,
    }));
  }

  quarterCategories(points: KpiTrendPoint[] | null | undefined): string[] {
    return (points ?? []).map(p => p.label);
  }

  async exportTrend(): Promise<void> {
    try {
      const detail = await firstValueFrom(this.detail$);
      const points = detail?.trendQuarterly ?? [];
      if (!points.length) {
        this.snack.open('No trend data to export', 'Dismiss', { duration: 3000 });
        return;
      }
      const rows = points.map(p => [p.label, p.value]);
      this.csvExport.download(
        `kpi-${this.slug}-trend_${new Date().toISOString().slice(0, 10)}.csv`,
        ['Period', 'Value'],
        rows,
      );
    } catch {
      this.snack.open('Export failed \u2014 please try again', 'Dismiss', { duration: 4000 });
    }
  }

  quarterSeries(points: KpiTrendPoint[] | null | undefined): { name: string; data: number[] }[] {
    return [
      {
        name: 'Quarterly',
        data: (points ?? []).map(p => Number(p.value) || 0),
      },
    ];
  }
}
