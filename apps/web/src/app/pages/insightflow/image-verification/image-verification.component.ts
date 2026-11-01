import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-image-verification',
  templateUrl: './image-verification.component.html',
  styleUrls: ['./image-verification.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageVerificationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  queue: any[] = [];
  filteredQueue: any[] = [];
  stats: any = null;
  filterStatus = '';
  rejectingId: string | null = null;
  rejectReason = '';

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
      queue: this.svc.getImageVerificationQueue(),
      stats: this.svc.getImageVerificationStats(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.queue = res.queue;
        this.stats = res.stats;
        this.applyFilter();
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

  applyFilter(): void {
    if (!this.filterStatus) {
      this.filteredQueue = [...this.queue];
    } else {
      this.filteredQueue = this.queue.filter(q => q.status === this.filterStatus);
    }
    this.cdr.markForCheck();
  }

  onFilterChange(val: string): void {
    this.filterStatus = val;
    this.applyFilter();
  }

  verify(item: any): void {
    this.svc.verifyClaimImage(item.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        item.status = 'verified';
        this.applyFilter();
      },
    });
  }

  startReject(claimId: string): void {
    this.rejectingId = claimId;
    this.rejectReason = '';
    this.cdr.markForCheck();
  }

  confirmReject(item: any): void {
    this.svc.rejectClaimImage(item.claimId, this.rejectReason).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        item.status = 'rejected';
        this.rejectingId = null;
        this.applyFilter();
      },
    });
  }

  cancelReject(): void {
    this.rejectingId = null;
    this.cdr.markForCheck();
  }

  statusColor(status: string): string {
    const map: Record<string, string> = { pending: '#ffa726', verified: '#66bb6a', rejected: '#ef5350' };
    return map[status] ?? '#bdbdbd';
  }

  attachmentIcon(type: string): string {
    const map: Record<string, string> = { xray: 'radiography', perio: 'medical_services', photo: 'photo_camera', doc: 'description' };
    return map[type] ?? 'attachment';
  }

  trackById(_: number, item: any): any { return item.claimId; }
}
