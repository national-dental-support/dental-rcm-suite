import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../../core/services/theme.service';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexStroke,
  ApexXAxis,
  ApexYAxis,
  ApexTooltip,
  ApexLegend,
  ApexGrid,
  ApexMarkers,
  ChartComponent,
} from 'ng-apexcharts';
import { TrendsPoint, ArTrendRow } from '../../../core/models/ar-types';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis | ApexYAxis[];
  tooltip: ApexTooltip;
  legend: ApexLegend;
  grid: ApexGrid;
  colors?: string[];
  markers?: ApexMarkers;
};

@Component({
    selector: 'app-line-chart',
    templateUrl: './line-chart.component.html',
    styleUrls: ['./line-chart.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class LineChartComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('chartRef', { static: true }) chartRef!: ChartComponent;

  @Input() title?: string;

  /** Accepts either [{date,value}] or [{month,total_0_30,...}] */
  @Input() data: (TrendsPoint | ArTrendRow)[] = [];

  /** Explicit control for callers like Recon-IQ dashboard */
  @Input() seriesOverride?: ApexAxisChartSeries;
  @Input() categoriesOverride?: string[];

  /** Optional: default tooltip formatter when NOT overridden */
  @Input() tooltipAsCurrency = true;

  /**
   * Power-user escape hatch:
   * - supports multi-yaxis, tooltip array formatters, colors, markers, legend position, etc.
   * - shallow merged + a few safe deep merges for xaxis/tooltip/yaxis
   */
  @Input() optionsOverride?: Partial<ChartOptions>;

  hasData = false;

  chartOptions: Partial<ChartOptions> = {
    chart: { type: 'line', height: 320, animations: { enabled: true }, toolbar: { show: true } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: { type: 'category', categories: [] },
    yaxis: { labels: { formatter: (v) => this.abbr(v as number) } },
    tooltip: {
      x: { show: true },
      y: { formatter: (v) => (this.tooltipAsCurrency ? this.asCurrency(v as number) : this.asNumber(v as number)) },
    },
    legend: { show: true, position: 'bottom' },
    grid: { strokeDashArray: 3 },
    series: [],
  };

  private ro?: ResizeObserver;
  private rafPending = false;
  private destroyed: boolean;
  private themeSub?: Subscription;

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.chartColors$.subscribe(colors => {
      if (!this.optionsOverride?.colors) {
        (this.chartOptions as any).colors = colors;
        this.kickApex();
      }
    });
  }

  ngAfterViewInit(): void {
    // If the chart is created while hidden (mat-tab, etc.), it may be width=0.
    // Observe size changes and refresh when it becomes visible.
    this.installResizeObserver();
    this.kickApex();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.ro?.disconnect();
    this.themeSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 1) Build a base config from overrides OR from data
    const hasExplicitOverrides =
      (this.seriesOverride?.length ?? 0) > 0 && (this.categoriesOverride?.length ?? 0) > 0;

    if (hasExplicitOverrides) {
      this.chartOptions = {
        ...this.chartOptions,
        xaxis: { ...(this.chartOptions.xaxis || {}), type: 'category', categories: this.categoriesOverride },
        series: this.seriesOverride,
      };
    } else if ('data' in changes) {
      const pts = (this.data ?? []).filter(Boolean) as any[];
      if (pts.length === 0) {
        this.chartOptions = { ...this.chartOptions, series: [], xaxis: { categories: [] } };
      } else {
        const isBucketed = 'total_0_30' in pts[0] || 'month' in pts[0];

        if (isBucketed) {
          const rows = pts as ArTrendRow[];
          const categories = rows.map((r) => this.prettyMonth(r.month));

          const s0 = rows.map((r) => Number(r.total_0_30) || 0);
          const s1 = rows.map((r) => Number(r.total_31_60) || 0);
          const s2 = rows.map((r) => Number(r.total_61_90) || 0);
          const s3 = rows.map((r) => Number(r.total_over_90) || 0);

          this.chartOptions = {
            ...this.chartOptions,
            xaxis: { ...(this.chartOptions.xaxis || {}), type: 'category', categories },
            series: [
              { name: '< 30 Days', data: s0 },
              { name: '31-60 Days', data: s1 },
              { name: '61-90 Days', data: s2 },
              { name: '> 90 Days', data: s3 },
            ],
          };
        } else {
          const rows = pts as TrendsPoint[];
          const categories = rows.map((r) => r.date);
          const values = rows.map((r) => Number(r.value) || 0);

          this.chartOptions = {
            ...this.chartOptions,
            xaxis: { ...(this.chartOptions.xaxis || {}), type: 'category', categories },
            series: [{ name: 'Trend', data: values }],
          };
        }
      }
    }

    // 2) Apply optionsOverride LAST so Recon-IQ can fully control tooltip/yaxis/colors/etc.
    if (this.optionsOverride) {
      this.chartOptions = {
        ...this.chartOptions,
        ...this.optionsOverride,
        // safe deep-ish merges
        xaxis: { ...(this.chartOptions.xaxis || {}), ...(this.optionsOverride.xaxis || {}) },
        tooltip: { ...(this.chartOptions.tooltip || {}), ...(this.optionsOverride.tooltip || {}) },
        // if caller supplies yaxis array, use it
        yaxis: (this.optionsOverride.yaxis ?? this.chartOptions.yaxis) as any,
      };
    }

    // Update no-data state
    this.hasData = (this.chartOptions.series ?? []).some((s: any) => s?.data?.length > 0);

    // Re-render chart whenever inputs change (noop if view not yet initialized)
    this.kickApex();
  }

   /** Forces ApexCharts to apply categories/series even if initial render was at width 0. */
  private kickApex(): void {
  if (this.destroyed || !this.chartRef) return;

  if (this.rafPending) return;
  this.rafPending = true;

  this.zone.runOutsideAngular(() => {
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.destroyed || !this.chartRef) return;

      const series = (this.chartOptions.series ?? []) as any;
      const categories = (this.chartOptions.xaxis as any)?.categories ?? [];

      // If chart is still width=0 (hidden tab), wait for ResizeObserver to retrigger
      const el = (this.chartRef as any)?.el as HTMLElement | undefined;
      if (el && el.getBoundingClientRect().width === 0) return;

      // Build a SAFE options object: only set keys that exist
      const opts: any = {
        // Always provide chart + xaxis at minimum (Apex is happiest)
        chart: this.chartOptions.chart ?? { type: 'line', height: 320 },
        xaxis: { ...(this.chartOptions.xaxis as any), categories },
      };

      // Merge override LAST, but only if present
      if (this.optionsOverride) {
        // shallow merge is fine here; we override specific keys below anyway
        Object.assign(opts, this.optionsOverride);
      }

      // Now add optional keys ONLY if defined
      if (this.chartOptions.yaxis) opts.yaxis = this.chartOptions.yaxis as any;
      if (this.chartOptions.tooltip) opts.tooltip = this.chartOptions.tooltip as any;
      if (this.chartOptions.stroke) opts.stroke = this.chartOptions.stroke as any;
      if (this.chartOptions.legend) opts.legend = this.chartOptions.legend as any;
      if (this.chartOptions.grid) opts.grid = this.chartOptions.grid as any;
      if (this.chartOptions.markers) opts.markers = this.chartOptions.markers as any;

      // Critical: do NOT write colors unless it's a real array
      if (Array.isArray((this.chartOptions as any).colors)) {
        opts.colors = (this.chartOptions as any).colors;
      } else if (Array.isArray((this.optionsOverride as any)?.colors)) {
        // if override has colors, keep them
        opts.colors = (this.optionsOverride as any).colors;
      }

      console.log('[line-chart] apply', {
      width: (this.chartRef as any)?.el?.getBoundingClientRect?.().width,
      hasColors: Array.isArray((opts as any).colors),
      seriesLen: series?.length,
      catsLen: categories?.length,
    });

      // Apply options + series
      this.chartRef.updateOptions(opts, false, true);
      this.chartRef.updateSeries(series, true);
    });
  });
}


  private installResizeObserver(): void {
    const el = (this.chartRef as any)?.el as HTMLElement | undefined;
    const host = el?.closest('.rp-line-chart') as HTMLElement | null;
    if (!host || typeof ResizeObserver === 'undefined') return;

    this.ro = new ResizeObserver(() => this.kickApex());
    this.ro.observe(host);
  }

  private abbr(v: number): string {
    const n = Math.abs(v);
    if (n >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return `${v.toFixed(0)}`;
  }

  private asNumber(v: number): string {
    return Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  private asCurrency(v: number): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return `$${Math.round(v).toLocaleString('en-US')}`;
    }
  }

  private prettyMonth(yyyyMm: string): string {
    const [y, m] = (yyyyMm || '').split('-').map(Number);
    if (!y || !m) return yyyyMm || '';
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
  }
  
  /** Safe public refresh for parent components */
  refresh(): void {
    if (!this.chartRef) return;

    const series = (this.chartOptions.series ?? []) as any;
    const categories = (this.chartOptions.xaxis as any)?.categories ?? [];

    // Run outside Angular to avoid extra CD churn
    this.zone.runOutsideAngular(() => {
      // 2 RAFs is intentional: first lets layout settle, second applies chart update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // IMPORTANT: do not push undefined keys
          const opts: any = {
            chart: this.chartOptions.chart ?? { type: 'line', height: 320 },
            xaxis: { ...(this.chartOptions.xaxis as any), categories },
          };

          if (this.chartOptions.yaxis) opts.yaxis = this.chartOptions.yaxis;
          if (this.chartOptions.tooltip) opts.tooltip = this.chartOptions.tooltip;
          if (this.chartOptions.stroke) opts.stroke = this.chartOptions.stroke;
          if (this.chartOptions.legend) opts.legend = this.chartOptions.legend;
          if (this.chartOptions.grid) opts.grid = this.chartOptions.grid;
          if (this.chartOptions.markers) opts.markers = this.chartOptions.markers;

          // only set colors if it is an actual array
          const colors = (this.chartOptions as any).colors;
          if (Array.isArray(colors)) opts.colors = colors;

          this.chartRef.updateOptions(opts, false, true);
          this.chartRef.updateSeries(series, true);
        });
      });
    });
  }
}
