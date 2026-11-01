import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ComplianceService, ComplianceDashboard, AccessReviewUser } from '../../../core/services/compliance.service';

@Component({
    selector: 'rp-compliance-admin',
    templateUrl: './compliance.component.html',
    styleUrls: ['./compliance.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ComplianceAdminComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  view: 'dashboard' | 'access-review' = 'dashboard';
  dashboard: ComplianceDashboard | null = null;
  accessReview: AccessReviewUser[] = [];
  loading = false;

  constructor(private svc: ComplianceService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboard(): void {
    this.loading = true;
    this.svc.getDashboard().pipe(takeUntil(this.destroy$)).subscribe(d => {
      this.dashboard = d;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  loadAccessReview(): void {
    this.loading = true;
    this.svc.getAccessReview().pipe(takeUntil(this.destroy$)).subscribe(r => {
      this.accessReview = r;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  switchView(v: 'dashboard' | 'access-review'): void {
    this.view = v;
    if (v === 'access-review') this.loadAccessReview();
    else this.loadDashboard();
  }

  getRoleName(role: number): string {
    const map: Record<number, string> = { 0: 'User', 1: 'AR Specialist', 2: 'Manager', 3: 'Training Admin', 4: 'Admin', 5: 'Super Admin' };
    return map[role] || 'Unknown';
  }

  getComplianceColor(rate: number): string {
    return rate >= 90 ? '#00e676' : rate >= 70 ? '#ffb74d' : '#ff5252';
  }
}
