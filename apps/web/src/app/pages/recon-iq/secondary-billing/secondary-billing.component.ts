import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ReconIqService, SecondaryBillingRow } from '../../../core/services/recon-iq.service';

type StatusFilter = 'all' | 'pending' | 'submitted' | 'posted';

@Component({
    selector: 'app-secondary-billing',
    templateUrl: './secondary-billing.component.html',
    styleUrls: ['./secondary-billing.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SecondaryBillingComponent implements OnInit {
  rows: SecondaryBillingRow[] = [];
  loading = true;
  error = false;

  // filters
  statusFilter: StatusFilter = 'pending';
  secondaryPayerFilter = '';
  locationFilter = '';

  // derived payer list for filter dropdown
  secondaryPayers: string[] = [];

  // selection
  selected = new Set<number>();

  // bulk action state
  submitting = false;

  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all',       label: 'All'       },
    { value: 'pending',   label: 'Pending'   },
    { value: 'submitted', label: 'Submitted' },
    { value: 'posted',    label: 'Posted'    },
  ];

  readonly displayedColumns = [
    'select',
    'claimId',
    'patientName',
    'dateOfService',
    'chargeAmt',
    'primaryPayerName',
    'primaryPaidAmt',
    'primaryAdjustmentAmt',
    'patientRespAmt',
    'secondaryPayerName',
    'secondaryBillAmt',
    'status',
  ];

  constructor(
    private readonly svc: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = false;
    this.selected.clear();
    this.cdr.markForCheck();

    this.svc.getSecondaryBillingQueue({
      status: this.statusFilter,
      secondaryPayer: this.secondaryPayerFilter,
      location: this.locationFilter,
    }).subscribe({
      next: (resp) => {
        this.rows = resp.rows ?? [];
        // build payer dropdown from loaded data
        const payerSet = new Set(this.rows.map(r => r.secondaryPayerName).filter(Boolean));
        this.secondaryPayers = Array.from(payerSet).sort();
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
    this.load();
  }

  clearFilters(): void {
    this.statusFilter = 'pending';
    this.secondaryPayerFilter = '';
    this.locationFilter = '';
    this.load();
  }

  // -- Selection --------------------------------------------------------------

  get pendingRows(): SecondaryBillingRow[] {
    return this.rows.filter(r => r.status === 'pending');
  }

  get allPendingSelected(): boolean {
    const pending = this.pendingRows;
    return pending.length > 0 && pending.every(r => this.selected.has(r.id));
  }

  toggleAll(): void {
    if (this.allPendingSelected) {
      this.pendingRows.forEach(r => this.selected.delete(r.id));
    } else {
      this.pendingRows.forEach(r => this.selected.add(r.id));
    }
    this.cdr.markForCheck();
  }

  toggleRow(id: number): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
    this.cdr.markForCheck();
  }

  // -- Bulk submit ------------------------------------------------------------

  markSubmitted(): void {
    if (!this.selected.size || this.submitting) return;
    this.submitting = true;
    this.cdr.markForCheck();

    this.svc.markSecondarySubmitted(Array.from(this.selected)).subscribe({
      next: () => {
        this.submitting = false;
        this.load();
      },
      error: () => {
        this.submitting = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Helpers ----------------------------------------------------------------

  statusLabel(status: string): string {
    switch (status) {
      case 'pending':   return 'Pending';
      case 'submitted': return 'Submitted';
      case 'posted':    return 'Posted';
      default:          return status;
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'pending':   return 'status-pending';
      case 'submitted': return 'status-submitted';
      case 'posted':    return 'status-posted';
      default:          return '';
    }
  }

  countByStatus(status: string): number {
    return this.rows.filter(r => r.status === status).length;
  }

  totalSecondaryBillAmt(): number {
    return this.rows.reduce((sum, r) => sum + (r.secondaryBillAmt ?? 0), 0);
  }

  trackById(_: number, row: SecondaryBillingRow): number {
    return row.id;
  }
}
