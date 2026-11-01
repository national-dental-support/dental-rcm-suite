import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-billing-optimization',
  templateUrl: './billing-optimization.component.html',
  styleUrls: ['./billing-optimization.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingOptimizationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  recommendations: any[] = [];
  filteredRecs: any[] = [];
  stats: any = null;

  filterCategory = '';
  filterPriority = '';

  readonly categories = ['Procedure Coding', 'Modifier Missing', 'Place of Service', 'Fee Schedule', 'Bundling'];
  readonly priorities = ['high', 'medium', 'low'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    forkJoin({
      recs: this.svc.getBillingRecommendations(),
      stats: this.svc.getBillingStats(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.recommendations = res.recs;
        this.stats = res.stats;
        this.applyFilters();
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

  applyFilters(): void {
    this.filteredRecs = this.recommendations.filter(r => {
      if (this.filterCategory && r.category !== this.filterCategory) return false;
      if (this.filterPriority && r.priority !== this.filterPriority) return false;
      return true;
    });
    this.cdr.markForCheck();
  }

  onCategoryChange(val: string): void {
    this.filterCategory = val;
    this.applyFilters();
  }

  onPriorityChange(val: string): void {
    this.filterPriority = val;
    this.applyFilters();
  }

  applyRec(rec: any): void {
    this.svc.updateBillingRecStatus(rec.id, 'applied').pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        rec.status = 'applied';
        this.applyFilters();
      },
    });
  }

  dismissRec(rec: any): void {
    this.svc.updateBillingRecStatus(rec.id, 'dismissed').pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        rec.status = 'dismissed';
        this.applyFilters();
      },
    });
  }

  priorityColor(priority: string): string {
    const map: Record<string, string> = { high: 'warn', medium: 'accent', low: 'primary' };
    return map[priority] ?? 'primary';
  }

  statusColor(status: string): string {
    const map: Record<string, string> = { new: '#42a5f5', applied: '#66bb6a', dismissed: '#bdbdbd' };
    return map[status] ?? '#bdbdbd';
  }

  trackById(_: number, item: any): any { return item.id; }
}
