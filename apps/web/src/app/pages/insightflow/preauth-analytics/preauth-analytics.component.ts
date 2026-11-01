import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  InsightflowService,
  PreauthAnalyticsData,
} from '../../../core/services/insight-flow.service';
import {
  ApexChart, ApexAxisChartSeries, ApexXAxis,
  ApexDataLabels, ApexTooltip, ApexStroke, ApexPlotOptions, ApexFill, ApexYAxis,
} from 'ng-apexcharts';

@Component({
  selector: 'app-preauth-analytics',
  templateUrl: './preauth-analytics.component.html',
  styleUrls: ['./preauth-analytics.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreauthAnalyticsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  data: PreauthAnalyticsData | null = null;

  // Bar chart: approval rate by payer (sorted worst to best)
  payerChartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
    plotOptions: ApexPlotOptions;
    fill: ApexFill;
  } = {
    series: [],
    chart: { type: 'bar', height: 340, toolbar: { show: false }, fontFamily: 'inherit' },
    xaxis: { categories: [] },
    yaxis: { min: 0, max: 100, labels: { formatter: (v: number) => v.toFixed(0) + '%' } },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => v.toFixed(1) + '%' } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    fill: { colors: ['#43a047'] },
  };

  // Line chart: monthly approval rate trend
  trendChartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis;
    stroke: ApexStroke;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
  } = {
    series: [],
    chart: { type: 'line', height: 240, toolbar: { show: false }, fontFamily: 'inherit' },
    xaxis: { categories: [] },
    yaxis: { min: 0, max: 100, labels: { formatter: (v: number) => v.toFixed(0) + '%' } },
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => v.toFixed(1) + '%' } },
  };

  readonly procedureColumns = ['procedureCode', 'totalClaims', 'approvalRate', 'denialRate'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.loading = true;
    this.error = false;
    this.svc.getPreauthAnalytics().pipe(takeUntil(this.destroy$)).subscribe({
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

  private buildCharts(d: PreauthAnalyticsData): void {
    this.payerChartOptions = {
      ...this.payerChartOptions,
      series: [{ name: 'Approval Rate', data: d.byPayer.map(r => r.approvalRate) }],
      xaxis: { categories: d.byPayer.map(r => r.payer) },
    };

    this.trendChartOptions = {
      ...this.trendChartOptions,
      series: [{ name: 'Approval Rate', data: d.monthlyTrend.map(r => r.approvalRate) }],
      xaxis: { categories: d.monthlyTrend.map(r => r.month) },
    };
  }

  ragClass(rate: number): string {
    if (rate >= 90) return 'rag-green';
    if (rate >= 75) return 'rag-amber';
    return 'rag-red';
  }
}
