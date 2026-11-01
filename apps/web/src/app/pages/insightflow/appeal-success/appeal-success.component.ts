import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-appeal-success',
  templateUrl: './appeal-success.component.html',
  styleUrls: ['./appeal-success.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppealSuccessComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;

  stats: any = null;
  payerRows: any[] = [];
  carcRows: any[] = [];
  trendRows: any[] = [];

  activeSubTab: 'payer' | 'carc' = 'payer';

  barChartOptions: any = {};
  trendChartOptions: any = {};

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = false;
    forkJoin({
      stats:   this.svc.getAppealSuccessStats(),
      payers:  this.svc.getAppealSuccessByPayer(),
      carc:    this.svc.getAppealSuccessByCaRC(),
      trend:   this.svc.getAppealSuccessTrend(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.stats     = res.stats;
        this.payerRows = res.payers;
        this.carcRows  = res.carc;
        this.trendRows = res.trend;
        this.buildCharts();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error   = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private buildCharts(): void {
    const sorted  = [...this.payerRows].sort((a, b) => a.winRate - b.winRate);
    const colors  = sorted.map(p => p.winRate >= 60 ? '#4caf50' : p.winRate >= 40 ? '#ffa726' : '#ef5350');

    this.barChartOptions = {
      series: [{ name: 'Win Rate %', data: sorted.map(p => p.winRate) }],
      chart:  { type: 'bar', height: 320, toolbar: { show: false }, background: 'transparent' },
      plotOptions: { bar: { horizontal: true, barHeight: '60%', distributed: true } },
      colors,
      dataLabels: { enabled: true, formatter: (v: number) => `${v}%`, style: { colors: ['#fff'], fontSize: '12px' } },
      xaxis: { categories: sorted.map(p => p.payer), labels: { style: { colors: '#555' } }, max: 100 },
      yaxis: { labels: { style: { colors: '#555' } } },
      legend: { show: false },
      grid: { borderColor: '#e5e7eb' },
      tooltip: { theme: 'light', y: { formatter: (v: number) => `${v}%` } },
    };

    this.trendChartOptions = {
      series: [
        { name: 'Won',  data: this.trendRows.map(r => r.won) },
        { name: 'Lost', data: this.trendRows.map(r => r.appeals - r.won) },
      ],
      chart:  { type: 'bar', height: 260, stacked: true, toolbar: { show: false }, background: 'transparent' },
      colors: ['#4caf50', '#ef5350'],
      xaxis:  { categories: this.trendRows.map(r => r.month), labels: { style: { colors: '#555' }, rotate: -30 } },
      yaxis:  { labels: { style: { colors: '#555' } } },
      legend: { labels: { colors: '#555' } },
      grid:   { borderColor: '#e5e7eb' },
      tooltip: { theme: 'light' },
      dataLabels: { enabled: false },
    };
  }

  winRateColor(rate: number): string {
    if (rate >= 60) return '#4caf50';
    if (rate >= 40) return '#ffa726';
    return '#ef5350';
  }

  trendIcon(trend: string): string {
    const map: Record<string, string> = { improving: 'trending_up', stable: 'trending_flat', declining: 'trending_down' };
    return map[trend] ?? 'trending_flat';
  }

  trendColor(trend: string): string {
    const map: Record<string, string> = { improving: '#4caf50', stable: '#ffa726', declining: '#ef5350' };
    return map[trend] ?? '#bbb';
  }

  trackByPayer(_: number, row: any): string { return row.payer; }
  trackByCarc(_: number, row: any): string  { return row.carcCode; }
}
