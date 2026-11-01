import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  InsightflowService,
  CycleTimeData,
} from '../../../core/services/insight-flow.service';
import {
  ApexChart, ApexAxisChartSeries, ApexXAxis,
  ApexDataLabels, ApexTooltip, ApexStroke, ApexPlotOptions, ApexFill, ApexYAxis,
} from 'ng-apexcharts';

@Component({
  selector: 'app-cycle-time',
  templateUrl: './cycle-time.component.html',
  styleUrls: ['./cycle-time.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CycleTimeComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  data: CycleTimeData | null = null;

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
    tooltip: { y: { formatter: (v: number) => v.toFixed(1) + ' days' } },
    yaxis: { labels: { formatter: (val: number) => val === 0 ? '' : Math.round(val) + 'd' } },
  };

  // Bar chart: payers
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
    tooltip: { y: { formatter: (v: number) => v.toFixed(1) + ' days' } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    fill: { colors: ['#00b0ff'] },
  };

  readonly payerColumns = ['payer', 'avgDays', 'claimCount', 'pctOnTime'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.loading = true;
    this.error = false;
    this.svc.getCycleTime().pipe(takeUntil(this.destroy$)).subscribe({
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

  private buildCharts(d: CycleTimeData): void {
    this.trendChartOptions = {
      ...this.trendChartOptions,
      series: [{ name: 'Avg Cycle Days', data: d.monthlyTrend.map(r => r.avgCycleDays) }],
      xaxis: { categories: d.monthlyTrend.map(r => r.month) },
    };

    this.payerChartOptions = {
      ...this.payerChartOptions,
      series: [{ name: 'Avg Days', data: d.slowestPayers.map(r => r.avgDays) }],
      xaxis: { categories: d.slowestPayers.map(r => r.payer) },
    };
  }
}
