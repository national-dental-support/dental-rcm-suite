import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexPlotOptions,
  ApexTooltip,
  ApexXAxis,
} from 'ng-apexcharts';
import { Subscription, skip, take } from 'rxjs';
import { AppChartTheme } from '../../../core/services/theme.service';
import {
  DenialFilterParams,
  DenialKpis,
  DenialReason,
  DenialTrendPoint,
  DenialCodeRow,
  DenialClaimRow,
  DenialManagementService,
} from '../../../core/services/denial-management.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ChartOptions } from '../../../shared/components/line-chart/line-chart.component';
import { CsvExportService } from '../../../core/services/csv-export.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { DenialIqStore } from '../../../store/denial-iq/denial-iq.store';

type PeriodKey =
  | 'All time'
  | 'Last 30 days'
  | 'Last 90 days'
  | 'Last 6 months'
  | 'Last 12 months'
  | 'MTD'
  | 'QTD'
  | 'YTD'
  | 'This year';

type BarOpts = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  grid: ApexGrid;
  fill: ApexFill;
};

interface Kpi {
  label: string;
  value: number;
  format: 'count' | 'money' | 'percent';
  deltaPct: number;
  targetText?: string;
  invertTrend: boolean;
  tooltip?: string;
}

@Component({
    selector: 'app-denial-management',
    templateUrl: './denial-management.component.html',
    styleUrls: ['./denial-management.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DenialManagementComponent implements OnInit, OnDestroy {
  periodLabel = 'This year';
  loading = true;
  error = false;
  lastupdated = new Date();

  private sub = new Subscription();
  private pageEnteredAt = 0;
  private dataLoadStart = 0;

  // -- Line chart (app-line-chart via seriesOverride/categoriesOverride) -----
  lineSeries: ApexAxisChartSeries = [];
  lineCategories: string[] = [];
  lineChartOverride!: Partial<ChartOptions>;

  // -- Grouped bar chart (apx-chart, two series) ----------------------------
  barOpts: Partial<BarOpts> = {};

  // -- KPI cards -------------------------------------------------------------
  kpis: Kpi[] = [];

  currentReasons: DenialReason[] = [];
  private lastGlobalPayers: string[] = [];

  reasonSortCol: 'Reason' | 'CurrentAmount' | 'PreviousAmount' = 'CurrentAmount';
  reasonSortDir: 'asc' | 'desc' = 'desc';

  get sortedReasons(): DenialReason[] {
    const col = this.reasonSortCol;
    const dir = this.reasonSortDir === 'asc' ? 1 : -1;
    return [...this.currentReasons].sort((a, b) => {
      const av = a[col] ?? 0; const bv = b[col] ?? 0;
      return typeof av === 'string' ? av.localeCompare(String(bv)) * dir : (Number(av) - Number(bv)) * dir;
    });
  }

  sortReasonsBy(col: 'Reason' | 'CurrentAmount' | 'PreviousAmount'): void {
    if (this.reasonSortCol === col) {
      this.reasonSortDir = this.reasonSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.reasonSortCol = col; this.reasonSortDir = 'desc';
    }
    this.cdr.markForCheck();
  }

  reasonSortIcon(col: 'Reason' | 'CurrentAmount' | 'PreviousAmount'): string {
    if (this.reasonSortCol !== col) return 'unfold_more';
    return this.reasonSortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // -- Drill-down state for expandable "Top Preventable Denials" table -----
  /** Groupings that are currently expanded */
  expandedGroupings = new Set<string>();
  /** Cached CARC/RARC breakdown keyed by grouping */
  codesByGrouping: Record<string, DenialCodeRow[]> = {};
  /** Loading state per grouping */
  codesLoading: Record<string, boolean> = {};
  /** Expanded (CARC|RARC) keys */
  expandedCodes = new Set<string>();
  /** Cached claims keyed by 'CARC|RARC' */
  claimsByCode: Record<string, DenialClaimRow[]> = {};
  /** Loading state per code key */
  claimsLoading: Record<string, boolean> = {};

  constructor(
    private denialStore: DenialIqStore,
    private cdr: ChangeDetectorRef,
    private analytics: AnalyticsService,
    private themeService: ThemeService,
    private csvExport: CsvExportService,
    private globalFiltersStore: GlobalFiltersStore,
    private denialSvc: DenialManagementService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.pageEnteredAt = Date.now();
    this.analytics.track('page_view', { page: 'denial_management' });

    // Subscribe to theme changes and reactively rebuild chart options
    this.sub.add(
      this.themeService.theme$.subscribe(t => {
        this.lineChartOverride = this.buildLineChartOverride(t);
        this.barOpts = this.buildBarOpts(t, this.currentReasons);
        this.cdr.markForCheck();
      })
    );

    // Subscribe to store - single reactive data source for all filter/period changes
    this.sub.add(
      this.denialStore.dashboard$.subscribe(slice => {
        this.loading = slice.loading;
        this.error   = !!slice.error;
        if (slice.data) {
          this.applyTrend(slice.data.trend);
          this.applyKpis(slice.data.kpis);
          this.applyReasons(slice.data.reasons);
          this.lastupdated = slice.cachedAt ? new Date(slice.cachedAt) : new Date();
          this.analytics.track('denial_management_data_loaded', { loadDurationMs: Date.now() - this.dataLoadStart });
        }
        if (slice.error) {
          this.analytics.track('denial_management_data_load_failed', { error: slice.error });
          this.analytics.trackError({ errorType: 'component', message: `Denial Management data load failed: ${slice.error}` });
        }
        this.cdr.markForCheck();
      })
    );

    // Trigger initial store load (uses cached data if fresh, fetches otherwise)
    this.dataLoadStart = Date.now();
    this.lastGlobalPayers = this.globalFiltersStore.value.payers ?? [];
    this.denialStore.loadDashboard(this.globalFiltersStore.value);

    // Force reload when global filters change
    this.sub.add(
      this.globalFiltersStore.applied$.pipe(skip(1)).subscribe(filters => {
        this.dataLoadStart = Date.now();
        this.lastGlobalPayers = filters.payers ?? [];
        this.periodLabel = 'All time';
        this.denialStore.reloadDashboard(filters);
      })
    );
  }

  ngOnDestroy(): void {
    this.analytics.track('page_exit', { page: 'denial_management', durationMs: Date.now() - this.pageEnteredAt });
    this.sub.unsubscribe();
  }

  exportTrend(): void {
    const series = this.lineSeries as any[];
    const chargesSeries = series.find(s => s.name === 'Total Denied Charges');
    const claimsSeries  = series.find(s => s.name === 'Total Denied Claims');
    const rows = this.lineCategories.map((period, i) => [
      period,
      chargesSeries?.data[i] ?? '',
      claimsSeries?.data[i] ?? '',
    ]);
    this.csvExport.download(
      `denial-trend_${this.today()}.csv`,
      ['Period', 'Total Denied Charges ($)', 'Total Denied Claims (#)'],
      rows,
    );
  }

  exportTopReasons(): void {
    const range = this.buildDateRange(this.periodLabel as PeriodKey);
    const fp: DenialFilterParams = { start: range.from, end: range.to, payers: this.lastGlobalPayers };
    this.denialSvc.getTopReasons(fp, true).pipe(take(1)).subscribe({
      next: reasons => {
        if (!reasons.length) {
          this.snack.open('No data to export', 'Dismiss', { duration: 3000 });
          return;
        }
        const rows = reasons.map(r => [r.Reason, r.CurrentAmount, r.PreviousAmount]);
        this.csvExport.download(
          `denial-top-reasons_${this.today()}.csv`,
          ['Reason', 'Current Amount ($)', 'Previous Amount ($)'],
          rows,
        );
      },
      error: () => this.snack.open('Export failed \u2014 please try again', 'Dismiss', { duration: 4000 }),
    });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // -- apply API responses ---------------------------------------------------

  private applyTrend(trend: DenialTrendPoint[]): void {
    this.lineCategories = trend.map(p => this.formatPeriodLabel(p.PeriodLabel));
    this.lineSeries = [
      { name: 'Total Denied Charges', data: trend.map(p => p.DeniedCharges) },
      { name: 'Total Denied Claims',  data: trend.map(p => p.DeniedClaims)  },
    ];
  }

  private applyKpis(kpis: DenialKpis | null): void {
    if (!kpis) return;
    this.kpis = [
      { label: 'Total Denied Claims',  value: kpis.currentDeniedClaims,  format: 'count',   deltaPct: kpis.deltaClaimsYoy,       invertTrend: true,  tooltip: 'Total number of claims denied by payers in the selected period. Compared to the same period in the prior year.' },
      { label: 'Total Denied Charges', value: kpis.currentDeniedCharges, format: 'money',   deltaPct: kpis.deltaChargesYoy,      invertTrend: true,  tooltip: 'Total dollar value of charges on denied claims in the selected period. Represents gross revenue at risk.' },
      { label: 'Denial Rate',          value: kpis.denialRate,           format: 'percent', deltaPct: kpis.deltaDenialRateYoy,   invertTrend: true,  targetText: 'Target: <5%',  tooltip: 'Percentage of submitted claims that were denied. Calculated as denied claims \u00F7 total submitted claims. Industry benchmark is under 5%.' },
      { label: 'Recovery Rate',        value: kpis.recoveryRate,         format: 'percent', deltaPct: 0,                        invertTrend: false, targetText: 'Target: >90%', tooltip: 'Percentage of denied claims that were successfully appealed and paid. Target is above 90%.' },
    ];
  }

  // -- Drill-down (expandable table) ----------------------------------------

  /** Collapse any open drill-downs (called when filters/reasons change) */
  private resetDrilldowns(): void {
    this.expandedGroupings.clear();
    this.expandedCodes.clear();
    this.codesByGrouping = {};
    this.claimsByCode = {};
    this.codesLoading = {};
    this.claimsLoading = {};
  }

  toggleGrouping(grouping: string): void {
    if (this.expandedGroupings.has(grouping)) {
      this.expandedGroupings.delete(grouping);
      this.cdr.markForCheck();
      return;
    }
    this.expandedGroupings.add(grouping);
    // Collapse any previously expanded code rows so we don't show stale drill-downs
    if (!this.codesByGrouping[grouping]) {
      this.codesLoading[grouping] = true;
      this.cdr.markForCheck();
      this.denialSvc
        .getCodesForGrouping(grouping, this.globalFiltersStore.value)
        .subscribe({
          next: (rows) => {
            this.codesByGrouping[grouping] = rows;
            this.codesLoading[grouping] = false;
            this.cdr.markForCheck();
          },
          error: () => {
            this.codesByGrouping[grouping] = [];
            this.codesLoading[grouping] = false;
            this.cdr.markForCheck();
          },
        });
    } else {
      this.cdr.markForCheck();
    }
  }

  toggleCode(carc: string, rarc: string | null): void {
    const key = `${carc}|${rarc ?? ''}`;
    if (this.expandedCodes.has(key)) {
      this.expandedCodes.delete(key);
      this.cdr.markForCheck();
      return;
    }
    this.expandedCodes.add(key);
    if (!this.claimsByCode[key]) {
      this.claimsLoading[key] = true;
      this.cdr.markForCheck();
      this.denialSvc
        .getClaimsForCode(carc, rarc, this.globalFiltersStore.value)
        .subscribe({
          next: (rows) => {
            this.claimsByCode[key] = rows;
            this.claimsLoading[key] = false;
            this.cdr.markForCheck();
          },
          error: () => {
            this.claimsByCode[key] = [];
            this.claimsLoading[key] = false;
            this.cdr.markForCheck();
          },
        });
    } else {
      this.cdr.markForCheck();
    }
  }

  isGroupingExpanded(grouping: string): boolean {
    return this.expandedGroupings.has(grouping);
  }

  isCodeExpanded(carc: string, rarc: string | null): boolean {
    return this.expandedCodes.has(`${carc}|${rarc ?? ''}`);
  }

  codeKey(carc: string, rarc: string | null): string {
    return `${carc}|${rarc ?? ''}`;
  }

  formatCode(carc: string, rarc: string | null): string {
    return rarc ? `${carc} + ${rarc}` : carc;
  }

  trackByCode(_idx: number, r: DenialCodeRow): string {
    return `${r.carcCode}|${r.rarcCode ?? ''}`;
  }

  trackByClaim(_idx: number, r: DenialClaimRow): string {
    return r.claimId;
  }

  trackByReason(_idx: number, r: DenialReason): string {
    return r.Reason;
  }

  private applyReasons(reasons: DenialReason[]): void {
    this.currentReasons = reasons;
    this.barOpts = this.buildBarOpts(this.themeService.snapshot(), reasons);
    // Reset drill-down caches whenever the top-level reasons change (e.g. filters applied)
    this.resetDrilldowns();
  }

  // -- KPI helpers for app-data-card -----------------------------------------

  kpiValue(k: Kpi): string {
    return this.fmt(k.value, k.format);
  }

  kpiSubtitle(k: Kpi): string {
    if (k.deltaPct === 0) return k.targetText ?? '';
    const sign = k.deltaPct > 0 ? '+' : '';
    return `${sign}${Math.abs(k.deltaPct).toFixed(1)}% vs prior year${k.targetText ? '  \u00B7  ' + k.targetText : ''}`;
  }

  kpiTrendDirection(k: Kpi): 'up' | 'down' {
    return k.deltaPct >= 0 ? 'up' : 'down';
  }

  kpiTrendColor(k: Kpi): 'green' | 'red' {
    const improving = k.invertTrend ? k.deltaPct <= 0 : k.deltaPct >= 0;
    return improving ? 'green' : 'red';
  }

  // -- other helpers ---------------------------------------------------------

  fmt(value: number, format: Kpi['format']): string {
    switch (format) {
      case 'money':   return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      case 'percent': return (value * 100).toFixed(1) + '%';
      default:        return value.toLocaleString();
    }
  }

  trackByLabel(_index: number, k: Kpi) { return k.label; }

  setPeriod(key: PeriodKey): void {
    this.periodLabel = key;
    this.analytics.track('denial_management_period_selected', { period: key });

    const range = this.buildDateRange(key);
    const fp: DenialFilterParams = {
      start: range.from,
      end: range.to,
      payers: this.lastGlobalPayers,
    };

    this.dataLoadStart = Date.now();
    // Store emits loading state which the dashboard$ subscription will reflect
    this.denialStore.reloadByParams(fp);
  }

  private buildDateRange(key: PeriodKey): { from: string | null; to: string | null } {
    if (key === 'All time') return { from: null, to: null };

    const today = new Date();
    const fmt = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    let fromDate: Date;
    const toDate = today;

    switch (key) {
      case 'Last 30 days':
        fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
        break;
      case 'Last 90 days':
        fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 90);
        break;
      case 'Last 6 months':
        fromDate = new Date(today.getFullYear(), today.getMonth() - 6, 1);
        break;
      case 'Last 12 months':
        fromDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
        break;
      case 'MTD':
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'QTD':
        fromDate = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
        break;
      case 'YTD':
        fromDate = new Date(today.getFullYear(), 0, 1);
        break;
      case 'This year':
        fromDate = new Date(today.getFullYear(), 0, 1);
        return { from: fmt(fromDate), to: fmt(new Date(today.getFullYear(), 11, 31)) };
    }

    return { from: fmt(fromDate), to: fmt(toDate) };
  }

  get formattedLastUpdated(): string {
    const d = this.lastupdated;
    const datePart = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
    const timePart = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .format(d).replace('AM', 'a.m.').replace('PM', 'p.m.');
    const tzPart = new Intl.DateTimeFormat('en-US', { timeZoneName: 'long' })
      .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? '';
    return `${datePart} \u00B7 ${timePart} ${tzPart}`;
  }

  // -- chart config builders -------------------------------------------------

  private buildLineChartOverride(t: AppChartTheme): Partial<ChartOptions> {
    return {
      yaxis: [
        {
          title: { text: 'Charges ($)' },
          labels: { formatter: (v: number) => `$${Math.round(v / 1000)}k` },
        },
        {
          opposite: true,
          title: { text: 'Claims (#)' },
          labels: { formatter: (v: number) => `${Math.round(v)}` },
          min: 0,
        },
      ],
      stroke: { width: [3, 3], curve: 'smooth' },
      markers: { size: 0 },
      legend: { position: 'top' },
      dataLabels: { enabled: false },
      tooltip: {
        shared: true,
        y: [
          { formatter: (v?: number) => (v ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) },
          { formatter: (v?: number) => `${v ?? 0}` },
        ],
      } as any,
      grid: { strokeDashArray: 3 },
      colors: [t.chart_color_1, t.chart_color_3],
    };
  }

  private buildBarOpts(t: AppChartTheme, reasons: DenialReason[]): Partial<BarOpts> {
    const base: Partial<BarOpts> = {
      chart: { type: 'bar', height: 420, toolbar: { show: false }, stacked: false },
      series: [
        { name: 'Current',  data: reasons.map(r => r.CurrentAmount) },
        { name: 'Previous', data: reasons.map(r => r.PreviousAmount) },
      ],
      xaxis: {
        categories: reasons.map(r => r.Reason),
        labels: { formatter: (v: string) => v },
        min: 0,
      },
      plotOptions: { bar: { horizontal: true, barHeight: '60%', dataLabels: { position: 'center' } } },
      dataLabels: {
        enabled: true,
        formatter: (v: number) => `$${Math.round(v / 100) / 10}k`,
        style: { colors: ['#fff', '#fff'] },
      },
      legend: { position: 'top' },
      tooltip: {
        y: { formatter: (v?: number) => (v ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) },
      },
      grid: { strokeDashArray: 3 },
      fill: { opacity: 0.9, colors: [t.chart_color_1, t.chart_color_2] },
    };
    return base;
  }

  private formatPeriodLabel(iso: string): string {
    const [year, month] = iso.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date) + ` '${year.slice(2)}`;
  }
}
