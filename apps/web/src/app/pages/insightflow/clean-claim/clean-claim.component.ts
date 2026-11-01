import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-clean-claim',
  templateUrl: './clean-claim.component.html',
  styleUrls: ['./clean-claim.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CleanClaimComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  issues: any[] = [];
  stats: any = null;
  chartOptions: any = {};
  fixingAll = false;

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
      issues: this.svc.getCleanClaimIssues(),
      stats: this.svc.getCleanClaimStats(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.issues = res.issues;
        this.stats = res.stats;
        this.buildChart();
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

  buildChart(): void {
    const errors = this.issues.filter(i => i.severity === 'error').length;
    const warnings = this.issues.filter(i => i.severity === 'warning').length;
    const infos = this.issues.filter(i => i.severity === 'info').length;
    this.chartOptions = {
      series: [errors, warnings, infos],
      chart: { type: 'donut', height: 220 },
      labels: ['Errors', 'Warnings', 'Info'],
      colors: ['#ef5350', '#ffa726', '#42a5f5'],
      legend: { position: 'bottom', labels: { colors: '#fff' } },
      plotOptions: { pie: { donut: { size: '60%' } } },
    };
  }

  autoFix(issue: any): void {
    if (!issue.autoFixable) return;
    this.svc.autoFixClaims([issue.claimId]).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        issue.autoFixed = true;
        this.cdr.markForCheck();
      },
    });
  }

  fixAll(): void {
    const fixable = this.issues.filter(i => i.autoFixable && !i.autoFixed);
    if (!fixable.length) return;
    this.fixingAll = true;
    this.svc.autoFixClaims(fixable.map(i => i.claimId)).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        fixable.forEach(i => (i.autoFixed = true));
        this.fixingAll = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.fixingAll = false;
        this.cdr.markForCheck();
      },
    });
  }

  severityColor(sev: string): string {
    const map: Record<string, string> = { error: '#ef5350', warning: '#ffa726', info: '#42a5f5' };
    return map[sev] ?? '#bdbdbd';
  }

  autoFixableCount(): number {
    return this.issues.filter(i => i.autoFixable && !i.autoFixed).length;
  }

  trackById(_: number, item: any): any { return item.claimId; }
}
