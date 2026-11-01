import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { SelectionModel } from '@angular/cdk/collections';
import { MatTableDataSource } from '@angular/material/table';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import {
  ReconIqService,
  PatientBalanceRow,
  PatientStatementFilters,
  StatementBatchStatus,
} from '../../../core/services/recon-iq.service';

type AgingBucket = '0_30' | '31_60' | '61_90' | '90_plus' | 'all';

@Component({
    selector: 'app-patient-statements-generation',
    templateUrl: './patient-statements-generation.component.html',
    styleUrls: ['./patient-statements-generation.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PatientStatementsGenerationComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = false;
  generating = false;
  error = false;
  successMessage = '';

  activeBatch: StatementBatchStatus | null = null;
  recentBatches: StatementBatchStatus[] = [];
  showRecentBatches = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  filterForm!: FormGroup;

  page = 1;
  pageSize = 25;
  totalRows = 0;
  totalPages = 0;

  readonly displayedColumns = [
    'select',
    'patientName',
    'patientAccount',
    'location',
    'balanceDue',
    'aging0_30',
    'aging31_60',
    'aging61_90',
    'aging90Plus',
    'lastStatementDate',
  ];

  dataSource = new MatTableDataSource<PatientBalanceRow>([]);
  selection = new SelectionModel<PatientBalanceRow>(true, []);

  readonly agingBucketOptions: { value: AgingBucket; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: '0_30', label: '0\u201330 days' },
    { value: '31_60', label: '31\u201360 days' },
    { value: '61_90', label: '61\u201390 days' },
    { value: '90_plus', label: '90+ days' },
  ];

  constructor(
    private readonly fb: FormBuilder,
    private readonly reconIq: ReconIqService,
    readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadRecentBatches();
    this.filterForm = this.fb.group({
      from: [null],
      to: [null],
      minBalance: [5],
      agingBucket: ['all' as AgingBucket],
    });

    this.filterForm.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.page = 1;
        this.selection.clear();
        this.load();
      });

    this.load();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadRecentBatches(): void {
    this.reconIq.getRecentBatches().pipe(takeUntil(this.destroy$)).subscribe({
      next: r => { this.recentBatches = r.batches; this.cdr.markForCheck(); },
    });
  }

  private startPolling(batchId: string): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      this.reconIq.getBatchStatus(batchId).pipe(takeUntil(this.destroy$)).subscribe({
        next: status => {
          this.activeBatch = status;
          this.cdr.markForCheck();
          if (status.status === 'completed' || status.status === 'failed') {
            this.stopPolling();
            this.loadRecentBatches();
          }
        },
      });
    }, 5000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  batchProgress(): number {
    if (!this.activeBatch || !this.activeBatch.totalPatients) return 0;
    return Math.round((this.activeBatch.completedCount / this.activeBatch.totalPatients) * 100);
  }

  load(): void {
    const f = this.filterForm.value;
    this.loading = true;
    this.error = false;
    this.cdr.markForCheck();

    const filters: PatientStatementFilters & { page: number; pageSize: number } = {
      page: this.page,
      pageSize: this.pageSize,
      minBalance: f.minBalance ?? 5,
      agingBucket: f.agingBucket !== 'all' ? f.agingBucket : undefined,
      from: f.from ? this.toIsoDate(f.from) : undefined,
      to: f.to ? this.toIsoDate(f.to) : undefined,
    };

    this.reconIq
      .getPatientBalances(filters)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.dataSource.data = res.rows;
          this.totalRows = res.pagination.totalRows;
          this.totalPages = res.pagination.totalPages;
          this.page = res.pagination.page;
          this.selection.clear();
          this.error = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = true;
          this.cdr.markForCheck();
        },
      });
  }

  resetFilters(): void {
    this.filterForm.setValue({ from: null, to: null, minBalance: 5, agingBucket: 'all' });
    this.page = 1;
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.load();
  }

  isAllSelected(): boolean {
    return (
      this.dataSource.data.length > 0 &&
      this.selection.selected.length === this.dataSource.data.length
    );
  }

  toggleAllRows(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.dataSource.data.forEach((row) => this.selection.select(row));
    }
    this.cdr.markForCheck();
  }

  trackById(_: number, row: PatientBalanceRow): number {
    return row.patientId;
  }

  get selectedCount(): number {
    return this.selection.selected.length;
  }

  generateStatements(): void {
    if (this.selection.selected.length === 0) return;

    this.generating = true;
    this.successMessage = '';
    this.error = false;
    this.cdr.markForCheck();

    const patientIds = this.selection.selected.map((r) => r.patientId);

    this.reconIq
      .generateStatementBatch({ patientIds })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.generating = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.successMessage = `${res.queued} statement${res.queued === 1 ? '' : 's'} queued.`;
          this.activeBatch = {
            batchId: res.batchId, status: 'queued',
            totalPatients: res.queued, completedCount: 0, errorCount: 0,
            requestedBy: '', startedAt: null, completedAt: null,
            downloadUrl: null, createdAt: new Date().toISOString(),
          };
          this.selection.clear();
          this.startPolling(res.batchId);
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = true;
          this.cdr.markForCheck();
        },
      });
  }

  downloadPdf(row: PatientBalanceRow): void {
    const url = this.reconIq.getStatementPdfUrl(String(row.patientId));
    window.open(url, '_blank');
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(n);
  }

  private toIsoDate(val: unknown): string {
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return String(val).slice(0, 10);
  }
}
