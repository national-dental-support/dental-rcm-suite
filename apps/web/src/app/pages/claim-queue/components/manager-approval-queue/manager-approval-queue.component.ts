import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  DenialManagementService,
  ClaimApprovalRecord,
} from '../../../../core/services/denial-management.service';

@Component({
    selector: 'app-manager-approval-queue',
    templateUrl: './manager-approval-queue.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ManagerApprovalQueueComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  records: ClaimApprovalRecord[] = [];
  loading = true;
  error = '';

  reviewingId: number | null = null;
  reviewerNotes = '';
  showRejectForm = false;

  columns = ['claimId', 'submittedBy', 'submittedAt', 'adjustmentCode', 'adjustmentAmount', 'status', 'actions'];

  parseSnapshot(record: ClaimApprovalRecord): { type?: string; adjustment_amount?: number; adjustment_code?: string; notes?: string } {
    try {
      return (record as any).package_snapshot
        ? JSON.parse((record as any).package_snapshot)
        : {};
    } catch { return {}; }
  }

  isAdjustmentRequest(record: ClaimApprovalRecord): boolean {
    return this.parseSnapshot(record).type === 'transactional_adjustment';
  }

  reopen(record: ClaimApprovalRecord): void {
    this.denialSvc.recallApproval(record.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.snack.open(`Adjustment request reopened for ${record.claim_id}`, '', { duration: 3000 });
        this.loadAll();
      },
      error: () => this.snack.open('Failed to reopen \u2014 try again.', '', { duration: 3000 }),
    });
  }

  loadAll(): void {
    this.loading = true;
    this.error = '';
    this.denialSvc.listApprovals().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.records = data; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'Failed to load approvals.'; this.loading = false; this.cdr.markForCheck(); },
    });
  }

  constructor(
    private denialSvc: DenialManagementService,
    private router: Router,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  loadPending(): void {
    this.loadAll();
  }

  openClaim(claimId: string): void {
    this.router.navigate(['/app/denial-iq/claim-queue', claimId]);
  }

  startReview(record: ClaimApprovalRecord): void {
    this.reviewingId = record.id;
    this.reviewerNotes = '';
    this.showRejectForm = false;
    this.cdr.markForCheck();
  }

  cancelReview(): void {
    this.reviewingId = null;
    this.showRejectForm = false;
    this.cdr.markForCheck();
  }

  approve(record: ClaimApprovalRecord): void {
    this.denialSvc
      .reviewApproval(record.id, 'approved', '')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snack.open(`Claim ${record.claim_id} approved.`, '', { duration: 3000 });
          this.reviewingId = null;
          this.loadPending();
        },
        error: () => {
          this.snack.open('Approval failed \u2014 try again.', '', { duration: 3000 });
        },
      });
  }

  reject(record: ClaimApprovalRecord): void {
    if (!this.reviewerNotes.trim()) {
      this.showRejectForm = true;
      this.cdr.markForCheck();
      return;
    }
    this.denialSvc
      .reviewApproval(record.id, 'rejected', this.reviewerNotes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snack.open(`Claim ${record.claim_id} rejected.`, '', { duration: 3000 });
          this.reviewingId = null;
          this.showRejectForm = false;
          this.loadPending();
        },
        error: () => {
          this.snack.open('Rejection failed \u2014 try again.', '', { duration: 3000 });
        },
      });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'approved': return 'status--approved';
      case 'rejected': return 'status--rejected';
      case 'recalled': return 'status--recalled';
      default: return 'status--pending';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
