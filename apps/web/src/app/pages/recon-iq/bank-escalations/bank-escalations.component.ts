import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { BankEscalationRow, BankEscalationStats, ReconIqService } from '../../../core/services/recon-iq.service';

const ISSUE_TYPES = ['amount_mismatch', 'missing_deposit', 'duplicate', 'unauthorized', 'other'];
const PRIORITIES  = ['low', 'medium', 'high', 'critical'];

@Component({
    selector: 'app-bank-escalations',
    templateUrl: './bank-escalations.component.html',
    styleUrls: ['./bank-escalations.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class BankEscalationsComponent implements OnInit {
  issueTypes = ISSUE_TYPES;
  priorities = PRIORITIES;

  rows: BankEscalationRow[] = [];
  stats: BankEscalationStats = { total: 0, open: 0, investigating: 0, resolved: 0 };
  loading = true;
  total = 0;
  page = 1;
  pageSize = 25;
  totalPages = 1;

  filterStatus   = '';
  filterPriority = '';

  showNewForm = false;
  newIssueType   = '';
  newDescription = '';
  newPriority    = 'medium';
  newDepositId   = '';
  submitting = false;

  constructor(
    private readonly svc: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadRows();
  }

  loadStats(): void {
    this.svc.getBankEscalationStats().subscribe({
      next: (s) => { this.stats = s; this.cdr.markForCheck(); },
      error: (e) => console.error('[BankEscalations] stats error', e),
    });
  }

  loadRows(page = 1): void {
    this.loading = true;
    this.page = page;
    this.cdr.markForCheck();

    this.svc.getBankEscalations({
      status:   this.filterStatus   || undefined,
      priority: this.filterPriority || undefined,
      page,
      pageSize: this.pageSize,
    }).subscribe({
      next: (res) => {
        this.rows = res.rows;
        this.total = res.total;
        this.totalPages = res.totalPages;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        console.error('[BankEscalations] list error', e);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  applyFilters(): void {
    this.loadRows(1);
  }

  clearFilters(): void {
    this.filterStatus = '';
    this.filterPriority = '';
    this.loadRows(1);
  }

  openNewForm(): void {
    this.showNewForm = true;
    this.newIssueType = '';
    this.newDescription = '';
    this.newPriority = 'medium';
    this.newDepositId = '';
  }

  cancelNew(): void {
    this.showNewForm = false;
  }

  submitNew(): void {
    if (!this.newIssueType) return;
    this.submitting = true;
    this.cdr.markForCheck();

    this.svc.createBankEscalation({
      issueType:     this.newIssueType,
      description:   this.newDescription || undefined,
      priority:      this.newPriority,
      bankDepositId: this.newDepositId || undefined,
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.showNewForm = false;
        this.loadStats();
        this.loadRows(1);
      },
      error: (e) => {
        console.error('[BankEscalations] create error', e);
        this.submitting = false;
        this.cdr.markForCheck();
      },
    });
  }

  setStatus(row: BankEscalationRow, status: string): void {
    this.svc.updateBankEscalation(row.id, { status }).subscribe({
      next: () => { this.loadStats(); this.loadRows(this.page); },
      error: (e) => console.error('[BankEscalations] update error', e),
    });
  }

  setPriority(row: BankEscalationRow, priority: string): void {
    this.svc.updateBankEscalation(row.id, { priority }).subscribe({
      next: () => this.loadRows(this.page),
      error: (e) => console.error('[BankEscalations] update error', e),
    });
  }

  resolve(row: BankEscalationRow): void {
    const notes = prompt('Resolution notes (optional):');
    if (notes === null) return;
    this.svc.updateBankEscalation(row.id, { status: 'resolved', resolutionNotes: notes || undefined }).subscribe({
      next: () => { this.loadStats(); this.loadRows(this.page); },
      error: (e) => console.error('[BankEscalations] resolve error', e),
    });
  }

  priorityClass(priority: string): string {
    const map: Record<string, string> = {
      critical: 'badge--critical',
      high:     'badge--high',
      medium:   'badge--medium',
      low:      'badge--low',
    };
    return `badge ${map[priority] ?? ''}`;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      open:          'badge--open',
      investigating: 'badge--investigating',
      resolved:      'badge--resolved',
      dismissed:     'badge--dismissed',
    };
    return `badge ${map[status] ?? ''}`;
  }
}
