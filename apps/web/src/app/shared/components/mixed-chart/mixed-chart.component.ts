import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  TemplateRef,
} from '@angular/core';
import { Subscription } from 'rxjs';

import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexMarkers,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  ApexStates,
  ApexTheme,
} from 'ng-apexcharts';

import {
  RpMixedChartConfig,
  RpMixedChartValueFormat,
  RpMixedSeries,
} from './mixed-chart.models';

import { ThemeService } from '../../../core/services/theme.service';

@Component({
    selector: 'rp-mixed-chart',
    templateUrl: './mixed-chart.component.html',
    styleUrls: ['./mixed-chart.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class MixedChartComponent implements OnInit, OnChanges, OnDestroy {
  /** REQUIRED config */
  @Input() cfg!: RpMixedChartConfig;

  /** Optional: show a title above chart */
  @Input() title?: string;

  /** Optional: when true, show simple debug info */
  @Input() debug = false;

  @Input() headerActions?: TemplateRef<unknown>;

  // ---- Apex bindings ----
  series: ApexAxisChartSeries = [];

  chart: ApexChart = {
    type: 'line',
    height: 320,
    toolbar: { show: false },
  };
  colors: string[] = [];
  xaxis: ApexXAxis = { categories: [] };

  // Apex supports either a single axis or multiple axes
  yaxis: ApexYAxis | ApexYAxis[] = [{ decimalsInFloat: 0 }];

  stroke: ApexStroke = { width: [0, 3], curve: 'smooth' };
  markers: ApexMarkers = { size: 0 };
  plotOptions: ApexPlotOptions = { bar: { columnWidth: '26%', horizontal: false } };
  dataLabels: ApexDataLabels = { enabled: false };
  fill: ApexFill = { opacity: [0.85, 1] };

  grid: ApexGrid = {
    strokeDashArray: 3,
    borderColor: 'rgba(17, 24, 39, 0.10)',
    padding: { left: 8, right: 8, top: 8, bottom: 0 },
  };

  legend: ApexLegend = {
    show: true,
    position: 'top',
    horizontalAlign: 'left',
    fontSize: '12px',
    itemMargin: { horizontal: 10, vertical: 6 },
    markers: { width: 10, height: 10, radius: 10 },
  };

  tooltip: ApexTooltip = { shared: true, intersect: false };

  // Highcharts-ish interaction defaults
  states: ApexStates = {
    normal: { filter: { type: 'none' } },
    hover: { filter: { type: 'lighten', value: 0.06 } },
    active: { filter: { type: 'none' } },
  };

  theme: ApexTheme = {
    mode: 'light',
  };

  // empty-state convenience
  hasAnyData = true;

  private themeColors: string[] = [];
  private themeSub?: Subscription;

  constructor(private themeService: ThemeService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.chartColors$.subscribe(colors => {
      this.themeColors = colors;
      if (this.cfg) {
        this.rebuildOptions();
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cfg']) {
      this.rebuildOptions();
    }
  }

  private rebuildOptions(): void {
    const cfg = this.cfg;

    // Defensive defaults
    const categories = cfg?.categories ?? [];
    const inputSeries = (cfg?.series ?? []) as RpMixedSeries[];

    this.colors = (cfg?.colors?.length ? cfg.colors : this.themeColors);

    // Safety: if caller provides fewer colors than series, cycle them
    if (this.colors.length < inputSeries.length) {
      const base = [...this.colors];
      while (this.colors.length < inputSeries.length) {
        this.colors.push(base[this.colors.length % base.length]);
      }
    }
    // Determine if chart is empty (all values null/undefined/0-length)
    this.hasAnyData = this.computeHasAnyData(inputSeries);

    // Identify series types
    const columnSeriesIndexes = inputSeries
      .map((s, i) => (s?.type === 'column' ? i : -1))
      .filter((i) => i >= 0);

    const lineIndexes = inputSeries
      .map((s, i) => (s?.type === 'line' ? i : -1))
      .filter((i) => i >= 0);

    const hasStackedColumns = columnSeriesIndexes.length >= 2;

    // ---- Series mapping ----
    // Force all column series into the same stack group so they truly stack together.
    // ng-apexcharts typings don't include `group`, so we add it via `as any`.
    this.series = inputSeries.map((s) => {
      const isColumn = s.type === 'column';
      return {
        name: s.name,
        type: s.type as any,
        data: (s.data ?? []).map((v) => (v === undefined ? null : v)),
        ...(isColumn ? ({ group: 'bar-stack' } as any) : {}),
      };
    });

    // ---- Chart ----
    const callerStacked = cfg?.chart?.stacked; // boolean | undefined
    const stacked = callerStacked ?? hasStackedColumns;

    // Spread caller overrides FIRST, then enforce mixed-chart requirements after.
    this.chart = {
      height: cfg?.height ?? 320,
      toolbar: { show: false },
      animations: { enabled: true, speed: 250 },
      zoom: { enabled: false },
      fontFamily: 'inherit',
      foreColor: 'rgba(17, 24, 39, 0.75)',
      ...cfg?.chart,
      // Enforce mixed chart base requirements
      stacked,
      type: 'line',
    } as ApexChart;

    // [ok] ApexCharts runtime supports this; ng-apexcharts 1.8.0 typings do not.
    (this.chart as any).stackOnlyBar = true;
    // ---- X Axis ----
    this.xaxis = {
      categories,
      tickAmount: Math.min(categories.length || 0, 12),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        trim: true,
        style: { fontSize: '12px' } as any,
      },
      ...cfg?.xaxis,
    };

    // ---- Plot Options (bars) ----
const cfgBar = cfg?.plotOptions?.bar ?? {};

this.plotOptions = {
  ...cfg?.plotOptions,
  bar: {
    horizontal: false,
    columnWidth: '26%',
    borderRadius: 4,
    borderRadiusApplication: 'end',
    borderRadiusWhenStacked: 'last',
    ...cfgBar, // [ok] cfg overrides defaults (including columnWidth)
  },
};

    // ---- Data labels ----
    this.dataLabels = { enabled: false, ...cfg?.dataLabels };

    // ---- Fill (soft bars, crisp lines) ----
    this.fill = {
      opacity: [0.75, 0.75, 1, 1, 1],
      ...cfg?.fill,
    };

    // ---- Grid (subtle) ----
    this.grid = {
      strokeDashArray: 3,
      borderColor: 'rgba(17, 24, 39, 0.10)',
      padding: { left: 8, right: 8, top: 8, bottom: 0 },
      ...cfg?.grid,
    };

    // ---- Legend (Highcharts-like) ----
    this.legend = {
  show: true,
  position: 'top',
  horizontalAlign: 'center',   // [ok] center the legend
  fontSize: '12px',
  markers: {
    width: 10,
    height: 10,
    radius: 10,
  },
  itemMargin: {
    horizontal: 12,
    vertical: 4,
  },
  ...cfg?.legend,
};


    // ---- Y Axis ----
    // If caller supplies dual axes, use them. Otherwise default to a single axis.
    this.yaxis = cfg?.yAxis ?? [
      {
        decimalsInFloat: 0,
        labels: { style: { fontSize: '12px' } as any },
      },
    ];

    // [ok] Fix for ng-apexcharts 1.8.0 typing limitations:
    // When caller provides 2 axes (amounts + counts), bind column series to axis[0]
    // and line series to axis[1] so series never "fall off" a missing y-axis index.
    // This also keeps stacking correct (all columns on same axis).
    this.yaxis = this.bindSeriesToDualAxes(this.yaxis, inputSeries);
        this.yaxis = this.applyDynamicLineAxisBounds(
      this.yaxis,
      inputSeries,
      lineIndexes
    );

    // ---- Stroke (bars 0, lines 3) ----
    this.stroke = {
      width: inputSeries.map((s) => (s.type === 'column' ? 0 : 3)),
      curve: 'smooth',
      ...cfg?.stroke,
    };

    // Add dash pattern so second line trend is dashed (solid + dashed = clear)
    // [ok] Make all lines solid
(this.stroke as any).dashArray = inputSeries.map(() => 0);


    // ---- Markers (off by default, show on hover) ----
    // Keep chart clean; show markers only on hover.
    this.markers = {
      size: inputSeries.map(() => 0),
      hover: { size: 5, sizeOffset: 2 },
      ...cfg?.markers,
    };

    // ---- Theme / states (caller can override) ----
    this.theme = { mode: 'light', ...this.theme, ...(cfg as any)?.theme };
    this.states = { ...this.states, ...(cfg as any)?.states };

    // ---- Tooltip ----
    const formats = cfg?.seriesFormats ?? [];
    this.tooltip = {
      shared: true,
      intersect: false,
      y: {
        formatter: (value: number, opts?: any) => {
          if (value === null || value === undefined || Number.isNaN(value)) return '';
          const idx = opts?.seriesIndex ?? 0;
          const fmt = formats[idx] ?? 'number';
          return this.formatValue(value, fmt);
        },
      },
      ...cfg?.tooltip,
    };

    (this.tooltip as any).x = {
  formatter: (_val: any, opts: any) => {
    const idx = opts?.dataPointIndex ?? -1;
    const cat = (categories?.[idx] ?? '') as string;
    return cat || '';
  },
};

    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log('[rp-mixed-chart] categories:', categories);
      // eslint-disable-next-line no-console
      console.log('[rp-mixed-chart] series (input):', inputSeries);
      // eslint-disable-next-line no-console
      console.log('[rp-mixed-chart] series (apex):', this.series);
      // eslint-disable-next-line no-console
      console.log('[rp-mixed-chart] stacked:', stacked);
      // eslint-disable-next-line no-console
      console.log('[rp-mixed-chart] columnSeriesIndexes:', columnSeriesIndexes);
      // eslint-disable-next-line no-console
      console.log('[rp-mixed-chart] lineIndexes:', lineIndexes);

      console.log('[rp-mixed-chart] yaxis (final):', this.yaxis);
    }
  }

  private bindSeriesToDualAxes(
    yaxis: ApexYAxis | ApexYAxis[],
    series: RpMixedSeries[]
  ): ApexYAxis | ApexYAxis[] {
    if (!Array.isArray(yaxis) || yaxis.length < 2) return yaxis;

    const columnNames = series.filter(s => s.type === 'column').map(s => s.name);
    const lineNames = series.filter(s => s.type !== 'column').map(s => s.name);

    // only apply when it's truly mixed
    if (!columnNames.length || !lineNames.length) return yaxis;

    const next = [...yaxis] as any[];

    // Apex supports seriesName array, but typings in 1.8.0 say string.
    next[0] = { ...next[0], seriesName: columnNames };
    next[1] = { ...next[1], seriesName: lineNames };

    return next as ApexYAxis[];
  }

  private computeHasAnyData(series: RpMixedSeries[]): boolean {
    if (!series?.length) return false;
    for (const s of series) {
      if (!s?.data?.length) continue;
      if (s.data.some((v) => v !== null && v !== undefined)) return true;
    }
    return false;
  }

  private formatValue(value: number, fmt: RpMixedChartValueFormat): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '';

    switch (fmt) {
      case 'currency':
        return value.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        });
      case 'percent':
        return `${(value * 100).toFixed(1)}%`;
      case 'number':
        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
      case 'none':
      default:
        return String(value);
    }
  }

  private applyDynamicLineAxisBounds(
  yaxis: ApexYAxis | ApexYAxis[],
  inputSeries: RpMixedSeries[],
  lineIndexes: number[]
): ApexYAxis | ApexYAxis[] {
  // Only apply when caller provides dual axes (bars left, lines right).
  if (!Array.isArray(yaxis) || yaxis.length < 2) return yaxis;
  if (!lineIndexes?.length) return yaxis;

  // Gather all numeric points from all line series
  const lineValues: number[] = [];
  for (const idx of lineIndexes) {
    const s = inputSeries[idx];
    for (const v of s?.data ?? []) {
      if (typeof v === 'number' && Number.isFinite(v)) lineValues.push(v);
    }
  }
  if (!lineValues.length) return yaxis;

  const rawMin = Math.min(...lineValues);
  const rawMax = Math.max(...lineValues);

  // Handle flat line case
  if (rawMin === rawMax) {
    const step = this.niceStep(rawMax || 1);
    const min = Math.max(0, rawMin - step);
    const max = rawMax + step;
    return this.setAxisBounds(yaxis, 1, min, max, 5);
  }

  // Padding so the line doesn't hug edges
  const range = rawMax - rawMin;
  const paddedMin = Math.max(0, rawMin - range * 0.1);
  const paddedMax = rawMax + range * 0.15;

  // Choose a human-friendly step and align bounds to it
  const step = this.niceStep((paddedMax - paddedMin) / 5);
  const min = Math.floor(paddedMin / step) * step;
  const max = Math.ceil(paddedMax / step) * step;

  // Keep 5-7 ticks depending on step/range
  const tickAmount = Math.min(7, Math.max(5, Math.round((max - min) / step)));

  return this.setAxisBounds(yaxis, 1, min, max, tickAmount);
}

private setAxisBounds(
  axes: ApexYAxis[],
  axisIndex: number,
  min: number,
  max: number,
  tickAmount: number
): ApexYAxis[] {
  const next = [...axes];
  next[axisIndex] = {
    ...next[axisIndex],
    min,
    max,
    tickAmount,
  };
  return next;
}

/**
 * Convert a rough step to a "nice" step: 1, 2, 2.5, 5, 10 * power-of-10
 * Good for counts and currency.
 */
private niceStep(roughStep: number): number {
  const s = Math.abs(roughStep);
  if (!Number.isFinite(s) || s === 0) return 1;

  const pow = Math.pow(10, Math.floor(Math.log10(s)));
  const n = s / pow;

  let nice: number;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 2.5) nice = 2.5;
  else if (n <= 5) nice = 5;
  else nice = 10;

  return nice * pow;
}

}
