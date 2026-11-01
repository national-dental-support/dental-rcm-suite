import { Component, EventEmitter, Input, OnInit, OnDestroy, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ApexNonAxisChartSeries,
  ApexChart,
  ApexResponsive,
  ApexLegend,
  ApexDataLabels,
  ApexTooltip,
  ApexPlotOptions,
} from 'ng-apexcharts';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
    selector: 'app-pie-chart',
    template: `
    @if (series.length > 0) {
      <apx-chart
        [series]="series"
        [chart]="chart"
        [labels]="labels"
        [colors]="colors"
        [responsive]="responsive"
        [legend]="legend"
        [dataLabels]="dataLabels"
        [plotOptions]="plotOptions"
        [tooltip]="tooltip">
      </apx-chart>
    } @else {
      <div style="display:flex;align-items:center;justify-content:center;min-height:200px;border-radius:8px;background:#f3f4f6;color:rgba(0,0,0,0.45);font-size:14px;font-style:italic;opacity:0.75;">
        No data available at this time
      </div>
    }
    `,
    standalone: false
})
export class PieChartComponent implements OnInit, OnDestroy {
  series: ApexNonAxisChartSeries = [];
  labels: string[] = [];
  colors: string[] = [];

  @Input() chartId = '';
  @Input() isCurrency = false;

  @Output() sliceClicked = new EventEmitter<string>();

  chart: ApexChart = {
    type: 'donut',
    height: 400,
    events: {
      dataPointSelection: (_event: any, _ctx: any, config: any) => {
        const idx: number = config.dataPointIndex;
        if (idx >= 0 && idx < this.labels.length) {
          this.sliceClicked.emit(this.labels[idx]);
        }
      },
    },
  };

  legend: ApexLegend = {
    position: 'bottom',
    fontSize: '11px',
    itemMargin: { horizontal: 6, vertical: 2 },
    labels: { colors: '#374151' },
    formatter: (label: string) => label.length > 18 ? label.slice(0, 18) + '\u2026' : label,
  };

  dataLabels: ApexDataLabels = {
    enabled: true,
    formatter: (_val: number, opts: any) => {
      const pct = opts.w.globals.seriesPercent[opts.seriesIndex];
      const p = Array.isArray(pct) ? pct[0] : pct;
      if (p < 5) return '';
      const label: string = opts.w.globals.labels[opts.seriesIndex] ?? '';
      return label ? `${label}\n${p.toFixed(0)}%` : p.toFixed(0) + '%';
    },
    style: { fontSize: '11px', fontWeight: '600', colors: ['#fff'] },
    dropShadow: { enabled: false },
  };

  plotOptions: ApexPlotOptions = {
    pie: {
      donut: {
        size: '58%',
        labels: {
          show: true,
          total: {
            show: true,
            label: 'Total',
            fontSize: '12px',
            fontWeight: '600',
            color: '#555',
            formatter: (w: any) => {
              const sum: number = w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0);
              if (!this.isCurrency) return String(sum);
              return this.money.format(sum);
            },
          },
          value: {
            fontSize: '14px',
            fontWeight: '700',
            color: '#333',
            formatter: (val: string) => {
              const num = parseFloat(val);
              if (!this.isCurrency) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
              if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(2) + 'M';
              if (num >= 1_000)     return '$' + (num / 1_000).toFixed(2) + 'K';
              return '$' + num.toFixed(2);
            },
          },
        },
      },
    },
  };

  responsive: ApexResponsive[] = [
    { breakpoint: 480, options: { chart: { width: 300 } } }
  ];

  tooltip: ApexTooltip = {
    y: {
      formatter: (value: number) => {
        if (this.isCurrency) return this.money.format(value);
        return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
  };

  private readonly OTHER_COLOR = '#94a3b8'; // slate-400 - neutral gray for aggregated "Other" slice
  private themeColors: string[] = [];
  private themeSub?: Subscription;

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.chartColors$.subscribe(colors => {
      this.themeColors = colors;
      this.applyColors();
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  @Input() set data(value: any) {
    const arr = Array.isArray(value)
      ? value
      : Array.isArray(value?.data)
      ? value.data
      : [];

    if (arr.length && typeof arr[0] === 'object') {
      this.labels = arr.map((x: any) => String(x?.label ?? ''));
      this.series = arr.map((x: any) => Number(x?.value ?? 0));
    } else {
      this.labels = arr.map((_x: any, i: number) => `${i + 1}`);
      this.series = arr.map((x: any) => Number(x ?? 0));
    }
    this.applyColors();
  }

  private applyColors(): void {
    const lastLabel = this.labels[this.labels.length - 1];
    if (lastLabel === 'Other' && this.labels.length > 1) {
      const namedCount = this.labels.length - 1;
      this.colors = [...this.themeColors.slice(0, namedCount), this.OTHER_COLOR];
    } else {
      this.colors = [...this.themeColors];
    }
  }

  private money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
