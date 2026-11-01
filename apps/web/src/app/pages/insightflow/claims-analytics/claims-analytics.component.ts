import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  InsightflowService,
  ClaimsAnalyticsData,
} from '../../../core/services/insight-flow.service';
import { CsvExportService } from '../../../core/services/csv-export.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ApexChart, ApexNonAxisChartSeries, ApexAxisChartSeries,
  ApexXAxis, ApexDataLabels, ApexTooltip, ApexStroke, ApexLegend,
} from 'ng-apexcharts';

@Component({
  selector: 'app-claims-analytics',
  templateUrl: './claims-analytics.component.html',
  styleUrls: ['./claims-analytics.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimsAnalyticsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  data: ClaimsAnalyticsData | null = null;

  startDate = '';
  endDate = '';

  // Pie chart: payer mix
  payerPieOptions: {
    series: ApexNonAxisChartSeries;
    chart: ApexChart;
    labels: string[];
    legend: ApexLegend;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
  } = {
    series: [],
    chart: { type: 'pie', height: 300, fontFamily: 'inherit' },
    labels: [],
    legend: { position: 'bottom' },
    dataLabels: { enabled: true },
    tooltip: { y: { formatter: (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) } },
  };

  // Dual line chart: monthly billed vs paid
  trendChartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    stroke: ApexStroke;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
    legend: ApexLegend;
  } = {
    series: [],
    chart: { type: 'line', height: 280, toolbar: { show: false }, fontFamily: 'inherit' },
    xaxis: { categories: [] },
    stroke: { curve: 'smooth', width: [2, 2] },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) } },
    legend: { position: 'top' },
  };

  readonly procedureColumns = ['procedureCode', 'procedureDescription', 'claimCount', 'avgFee', 'totalRevenue'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
    private csvExport: CsvExportService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.loading = true;
    this.error = false;
    this.svc.getClaimsAnalytics(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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

  private buildCharts(d: ClaimsAnalyticsData): void {
    this.payerPieOptions = {
      ...this.payerPieOptions,
      series: d.payerMix.map(r => r.totalPaid),
      labels: d.payerMix.map(r => r.payer),
    };

    this.trendChartOptions = {
      ...this.trendChartOptions,
      series: [
        { name: 'Total Billed', data: d.monthlyTrend.map(r => r.totalBilled) },
        { name: 'Total Paid',   data: d.monthlyTrend.map(r => r.totalPaid)   },
      ],
      xaxis: { categories: d.monthlyTrend.map(r => r.month) },
    };
  }

  applyFilter(): void {
    this.load();
  }

  exportProcedures(): void {
    try {
      const procs = this.data?.topProcedures ?? [];
      if (!procs.length) {
        this.snack.open('No procedure data to export', 'Dismiss', { duration: 3000 });
        return;
      }
      const rows = procs.map(p => [p.procedureCode, p.procedureDescription, p.claimCount, p.avgFee, p.totalRevenue]);
      this.csvExport.download('claims-analytics-procedures.csv',
        ['Procedure Code', 'Description', 'Claim Count', 'Avg Fee ($)', 'Total Revenue ($)'],
        rows,
      );
    } catch {
      this.snack.open('Export failed \u2014 please try again', 'Dismiss', { duration: 4000 });
    }
  }
}
