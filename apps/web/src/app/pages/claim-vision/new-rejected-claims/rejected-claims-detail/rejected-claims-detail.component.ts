import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort } from '@angular/material/sort';
import {
  NewConfirmMarkCompleteData,
  NewConfirmMarkCompleteDialogComponent,
} from '../confirm-mark-complete-dialog/confirm-mark-complete-dialog.component';

import {
  ClaimVisionBatch,
  ClaimVisionClaimDetail,
  ClaimStatus,
  ClaimVisionService,
} from '../../../../core/services/claim-vision.service';

@Component({
    selector: 'app-rejected-claims-detail',
    templateUrl: './rejected-claims-detail.component.html',
    styleUrls: ['./rejected-claims-detail.component.scss'],
    standalone: false
})
export class NewRejectedClaimsDetailComponent implements OnInit, AfterViewInit {
  batchId!: string;
  batch!: ClaimVisionBatch | undefined;

  allClaims: ClaimVisionClaimDetail[] = [];
  dataSource = new MatTableDataSource<ClaimVisionClaimDetail>();
  displayedColumns = ['priority', 'patient', 'dos', 'submittedDate', 'payer', 'charged', 'insBalance', 'aging', 'status', 'actions'];

  showCompleted = false;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private route: ActivatedRoute,
    private claimVision: ClaimVisionService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.batchId = this.route.snapshot.paramMap.get('id')!;
    const ruleId = this.route.snapshot.queryParamMap.get('ruleId') || undefined;
    const batchWeekStart = this.route.snapshot.queryParamMap.get('batchWeekStart') || undefined;

    // Load header batch info
    this.claimVision.getRejectedClaims().subscribe({
      next: (batches) => {
        this.batch = batches.find((b) => b.id === this.batchId);
      },
      error: (err) => {
        console.error('Failed to load Claim Vision batches', err);
      },
    });

    // Load detail rows with the batch-specific ruleId and week
    this.claimVision.getRejectedClaimsDetail(this.batchId, ruleId, batchWeekStart).subscribe({
      next: (claims) => {
        this.allClaims = claims ?? [];
        this.refreshTable();
      },
      error: (err) => {
        console.error('Failed to load Claim Vision rejected claims detail', err);
      },
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  get submissionDate(): string {
    return this.batch?.submittedDate ?? '';
  }

  get rejectionMessageHeader(): string {
    return this.batch?.rejectionMessage ?? '';
  }

  // stub remedy text for demo (from Figma)
  get remedyHeader(): string {
    return 'Review Diagnosis Code on Claim and enter the correct DX Code.';
  }

  toggleShowCompleted(checked: boolean): void {
    this.showCompleted = checked;
    this.refreshTable();
  }

  private refreshTable(): void {
    const rows = this.showCompleted
      ? this.allClaims
      : this.allClaims.filter((c) => c.status !== 'Completed');

    this.dataSource.data = rows;
  }

  markAsComplete(row: ClaimVisionClaimDetail): void {
    const idx = this.allClaims.findIndex((c) => c.id === row.id);
    if (idx === -1) return;

    const current = this.allClaims[idx];

    // Already completed -> revert to original (mark as not complete)
    if (current.status === 'Completed') {
      const newStatus: ClaimStatus = 'Not complete';
      this.claimVision.updateRejectedClaimStatus(current.rejectedClaimId, newStatus).subscribe({
        next: () => {
          this.allClaims[idx] = { ...current, status: newStatus };
          this.refreshTable();
          this.snack.open(`Claim: ${row.patient} \u2013 Marked as incomplete`, 'Close', {
            duration: 3000, horizontalPosition: 'right', verticalPosition: 'top',
          });
        },
        error: () => {
          this.snack.open('Failed to update claim status', 'OK', { duration: 3000 });
        },
      });
      return;
    }

    // Not completed yet -> confirm and mark as Completed
    const dialogRef = this.dialog.open<
      NewConfirmMarkCompleteDialogComponent,
      NewConfirmMarkCompleteData,
      boolean
    >(NewConfirmMarkCompleteDialogComponent, {
      width: '360px',
      data: { patientName: row.patient },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;

      const newStatus: ClaimStatus = 'Completed';
      this.claimVision.updateRejectedClaimStatus(current.rejectedClaimId, newStatus).subscribe({
        next: () => {
          this.allClaims[idx] = { ...current, status: newStatus };
          this.refreshTable();
          this.snack.open(`Claim: ${row.patient} \u2013 Completed`, 'Close', {
            duration: 3000, horizontalPosition: 'right', verticalPosition: 'top',
          });
        },
        error: () => {
          this.snack.open('Failed to update claim status', 'OK', { duration: 3000 });
        },
      });
    });
  }

  agingClass(days?: number): string {
    if (!days || days < 0) return 'aging-ok';
    if (days >= 30) return 'aging-danger';
    if (days >= 15) return 'aging-warning';
    return 'aging-ok';
  }

  statusClass(status: string): string {
    return status === 'Completed' ? 'status-complete' : 'status-pending';
  }

  goBack(): void {
    this.router.navigate(['/app/claim-vision/rejected-claims']);
  }
}
