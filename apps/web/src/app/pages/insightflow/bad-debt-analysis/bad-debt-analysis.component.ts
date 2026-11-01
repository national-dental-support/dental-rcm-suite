import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  InsightflowService,
  BadDebtData,
} from '../../../core/services/insight-flow.service';
import {
  ApexChart, ApexNonAxisChartSeries, ApexAxisChartSeries,
  ApexXAxis, ApexDataLabels, ApexTooltip, ApexStroke, ApexPlotOptions,
  ApexLegend, ApexFill, ApexYAxis,
} from 'ng-apexcharts';

@Component({
  selector: 'app-bad-debt-analysis',
  templateUrl: './bad-debt-analysis.component.html',
  styleUrls: ['./bad-debt-analysis.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadDebtAnalysisComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  data: BadDebtData | null = null;

  // Bar chart: write-offs by payer
  payerChartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
    plotOptions: ApexPlotOptions;
    fill: ApexFill;
  } = {
    series: [],
    chart: { type: 'bar', height: 320, toolbar: { show: false }, fontFamily: 'inherit' },
    xaxis: { categories: [] },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    fill: { colors: ['#7c4dff'] },
  };

  // Pie chart: age bucket breakdown
  ageChartOptions: {
    series: ApexNonAxisChartSeries;
    chart: ApexChart;
    labels: string[];
    legend: ApexLegend;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
  } = {
    series: [],
    chart: { type: 'pie', height: 280, fontFamily: 'inherit' },
    labels: [],
    legend: { position: 'bottom' },
    dataLabels: { enabled: true },
    tooltip: { y: { formatter: (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) } },
  };

  // Line chart: monthly trend
  trendChartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    stroke: ApexStroke;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
    yaxis: ApexYAxis;
  } = {
    series: [],
    chart: { type: 'line', height: 260, toolbar: { show: false }, fontFamily: 'inherit' },
    xaxis: { categories: [] },
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) } },
    yaxis: { labels: { formatter: (val: number) => val === 0 ? '' : '$' + (val / 1000).toFixed(0) + 'k' } },
  };

  readonly payerColumns = ['payer', 'writeOffAmount', 'claimCount'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.loading = true;
    this.error = false;
    this.svc.getBadDebt().pipe(takeUntil(this.destroy$)).subscribe({
      next: d => {
        this.data = d;
        this.buildCharts(d);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private buildCharts(d: BadDebtData): void {
    // Payer bar chart
    this.payerChartOptions = {
      ...this.payerChartOptions,
      series: [{ name: 'Write-Off Amount', data: d.byPayer.map(r => r.writeOffAmount) }],
      xaxis: { categories: d.byPayer.map(r => r.payer) },
    };

    // Age bucket pie chart
    this.ageChartOptions = {
      ...this.ageChartOptions,
      series: d.byAgeBucket.map(r => r.writeOffAmount),
      labels: d.byAgeBucket.map(r => r.ageBucket + ' days'),
    };

    // Monthly trend line chart
    this.trendChartOptions = {
      ...this.trendChartOptions,
      series: [{ name: 'Write-Offs', data: d.monthlyTrend.map(r => r.writeOffAmount) }],
      xaxis: { categories: d.monthlyTrend.map(r => r.month) },
    };
  }
}
