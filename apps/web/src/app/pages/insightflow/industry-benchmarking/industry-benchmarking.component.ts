import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Router } from '@angular/router';
import { BenchmarkComparison } from '../../../core/services/benchmarking.service';
import { InsightflowStore } from '../../../store/insightflow/insightflow.store';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

@Component({
    selector: 'rp-industry-benchmarking',
    templateUrl: './industry-benchmarking.component.html',
    styleUrls: ['./industry-benchmarking.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class IndustryBenchmarkingComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  comparisons: BenchmarkComparison[] = [];
  generatedAt = '';
  loading = false;
  error = false;

  readonly metricRouteMap: Record<string, string> = {
    denial_rate:       '/app/insightflow/view/denials',
    collection_rate:   '/app/insightflow/view/summary',
    first_pass_rate:   '/app/insightflow/view/denials',
    days_ar:           '/app/insightflow/view/ar',
    clean_claim_rate:  '/app/insightflow/view/denials',
    underpayment_rate: '/app/payer-iq/underpayments',
    appeal_success:    '/app/insightflow/view/appeal-success',
    net_collection:    '/app/insightflow/view/summary',
    write_off_rate:    '/app/recon-iq/finance-summary',
  };

  constructor(
    private insightflowStore: InsightflowStore,
    private cdr: ChangeDetectorRef,
    private globalFilters: GlobalFiltersStore,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.insightflowStore.benchmarking$.pipe(takeUntil(this.destroy$)).subscribe(slice => {
      this.loading = slice.loading;
      this.error = !!slice.error;
      if (slice.data) {
        this.comparisons = slice.data.comparisons;
        this.generatedAt = slice.data.generatedAt;
      }
      this.cdr.markForCheck();
    });

    this.globalFilters.applied$.pipe(takeUntil(this.destroy$)).subscribe(filters => {
      this.insightflowStore.loadBenchmarking(filters, true);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getPerformanceColor(c: BenchmarkComparison): string {
    if (c.percentile >= 75) return '#00e676';
    if (c.percentile >= 50) return '#ffb74d';
    return '#ff5252';
  }

  getPerformanceLabel(c: BenchmarkComparison): string {
    if (c.percentile >= 75) return 'Top Quartile';
    if (c.percentile >= 50) return 'Above Average';
    if (c.percentile >= 25) return 'Below Average';
    return 'Bottom Quartile';
  }

  navigateToBenchmark(c: BenchmarkComparison): void {
    const route = this.metricRouteMap[c.metric];
    if (route) this.router.navigate([route]);
  }

  formatValue(val: number, unit: string): string {
    if (unit === '%') return val.toFixed(1) + '%';
    if (unit === '$') return '$' + val.toLocaleString();
    if (unit === 'days') return val.toFixed(0) + ' days';
    return val.toString();
  }
}
