import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../../core/services/theme.service';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'ng-apexcharts';

export interface HorizontalBarDatum {
  label: string;  // e.g. "Accepted"
  value: number;  // e.g. 767999.30
}

export type HorizontalBarChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  tooltip: ApexTooltip;
  fill?: ApexFill;
  stroke?: ApexStroke;
  grid?: ApexGrid;
  colors?: string[];
};

@Component({
    selector: 'app-horizontal-bar-chart',
    templateUrl: './horizontal-bar-chart.component.html',
    styleUrls: ['./horizontal-bar-chart.component.scss'],
    standalone: false
})
export class HorizontalBarChartComponent implements OnInit, OnChanges, OnDestroy {
  @Input() data: HorizontalBarDatum[] | null = [];
  @Input() currency = true;
  @Input() baseRowHeight = 40;
  /** Optional color override. When omitted, defaults to the active theme's primary color. */
  @Input() barColor?: string;

  chartOptions?: Partial<HorizontalBarChartOptions>;

  private activeBarColor = '#93c5fd';
  private themeSub?: Subscription;

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.primaryColor$.subscribe(color => {
      this.activeBarColor = this.barColor ?? color;
      this.buildOptions();
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('data' in changes || 'barColor' in changes) {
      this.activeBarColor = this.barColor ?? this.themeService.snapshot().chart_color_1;
      this.buildOptions();
    }
  }

  private buildOptions(): void {
    const rows = Array.isArray(this.data) ? this.data : [];

    if (!rows.length) {
      this.chartOptions = undefined;
      return;
    }

    const labels = rows.map(r => r?.label ?? '');
    const values = rows.map(r => Number(r?.value ?? 0));

    const count = rows.length;
    const height = Math.max(200, this.baseRowHeight * count);

    this.chartOptions = {
      chart: {
        type: 'bar',
        height,
        toolbar: { show: true },
        zoom: { enabled: true },
      },

      series: [
        {
          name: '',
          data: values,
        },
      ],

plotOptions: {
  bar: {
    horizontal: true,
    barHeight: '55%',
    distributed: false,   // one color for all bars
  },
},
fill: {
  colors: [this.activeBarColor],
},
colors: [this.activeBarColor],
      // In horizontal mode, categories on xaxis become the vertical (left) labels
      xaxis: {
        categories: labels,
        labels: {
          style: {
            fontSize: '14px',
            fontWeight: 500,
            colors: '#4b5563',
          },
          // formats the bottom numeric tick marks
          formatter: (val: any) => {
            const n = Number(val);
            if (isNaN(n)) return String(val);
            return this.currency
              ? this.formatCurrencyShort(n)
              : this.formatShort(n);
          },
        },
        axisTicks: { show: false },
        axisBorder: { show: false },
      },

      // Category axis (left side) - just show the status name, no numeric formatting
      yaxis: {
        labels: {
          show: true,
        },
        axisTicks: { show: false },
        axisBorder: { show: false },
      },

      grid: {
        borderColor: '#e5e7eb',
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },

      dataLabels: {
        enabled: true,
        textAnchor: 'start',
        offsetX: 16,
        style: {
          fontSize: '14px',
          fontWeight: 600,
          colors: ['#4b5563'],
        },
        background: {
          enabled: false,
        },
        formatter: (value: any) => {
          const num = Number(value) || 0;
          return this.currency
            ? this.formatCurrencyShort(num)
            : this.formatShort(num);
        },
        dropShadow: { enabled: false },
      },

      tooltip: {
        y: {
          formatter: (value: any) => {
            const num = Number(value) || 0;
            return this.currency
              ? this.formatCurrencyShort(num)
              : this.formatShort(num);
          },
        },
      },

      stroke: { width: 0 },
    };
  }

  private formatCurrencyShort(value: number | null | undefined): string {
    if (value == null) return '$0';
    return `$${this.formatShort(value)}`;
  }

  private formatShort(value: number | null | undefined): string {
    if (value == null || isNaN(value as any)) return '0';

    const abs = Math.abs(value);
    let result: string;

    if (abs >= 1_000_000_000) {
      result = (value / 1_000_000_000).toFixed(1) + 'B';
    } else if (abs >= 1_000_000) {
      result = (value / 1_000_000).toFixed(1) + 'M';
    } else if (abs >= 1_000) {
      result = (value / 1_000).toFixed(1) + 'K';
    } else {
      result = value.toFixed(0);
    }

    return result.replace(/\.0([KMB])$/, '$1');
  }
}
