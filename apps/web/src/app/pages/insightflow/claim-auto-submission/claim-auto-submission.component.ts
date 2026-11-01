import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-claim-auto-submission',
  templateUrl: './claim-auto-submission.component.html',
  styleUrls: ['./claim-auto-submission.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimAutoSubmissionComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  rules: any[] = [];
  queue: any[] = [];
  stats: any = null;
  activeTab = 0;

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
      rules: this.svc.getAutoSubmitRules(),
      queue: this.svc.getAutoSubmitQueue(),
      stats: this.svc.getAutoSubmitStats(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.rules = res.rules;
        this.queue = res.queue;
        this.stats = res.stats;
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

  toggleRule(rule: any): void {
    this.svc.toggleAutoSubmitRule(rule.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        rule.enabled = res.enabled;
        this.cdr.markForCheck();
      },
    });
  }

  trackById(_: number, item: any): any { return item.id || item.claimId; }
}
