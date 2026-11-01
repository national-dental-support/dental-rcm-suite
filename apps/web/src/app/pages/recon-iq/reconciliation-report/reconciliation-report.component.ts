import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import {
  ReconIqService,
  ReconReportSummary,
  ReconReportPayerRow,
  ReconReportProviderRow,
  ReconReportTrendRow,
  ReconReportInTransitRow,
  ReconReportFilters,
  ReconReportFilterOptions,
  PostingAuditRow,
} from '../../../core/services/recon-iq.service';
import { ReconIqStore } from '../../../store/recon-iq/recon-iq.store';

@Component({
    selector: 'app-reconciliation-report',
    templateUrl: './reconciliation-report.component.html',
    styleUrls: ['./reconciliation-report.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconciliationReportComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('inTransitSort') inTransitSort!: MatSort;
  private readonly destroy$ = new Subject<void>();

  loading = true;
  error = false;

  summary: ReconReportSummary | null = null;
  payerRows: ReconReportPayerRow[] = [];
  trendRows: ReconReportTrendRow[] = [];

  inTransitLoading = false;
  showInTransit = false;
  inTransitSearch = '';
  inTransitDs = new MatTableDataSource<ReconReportInTransitRow>([]);
  readonly inTransitCols = ['remittanceFileId', 'fileDate', 'location', 'payerName', 'claimCount', 'amount', 'daysAged'];

  activeSection: 'overview' | 'payers' | 'provider' | 'trend' | 'audit' = 'overview';

  providerRows: ReconReportProviderRow[] = [];
  providerLoading = false;

  auditRows: PostingAuditRow[] = [];
  auditLoading = false;
  auditPage = 1;
  auditTotalPages = 1;
  auditTotal = 0;

  exportingDetail = false;

  filters: ReconReportFilters = { months: 6, location: '', payer: '', postStatus: 'all' };
  filterOptions: ReconReportFilterOptions = { locations: [], payers: [] };
  filtersOpen = false;

  readonly monthOptions = [
    { value: 3,  label: '3 months' },
    { value: 6,  label: '6 months' },
    { value: 12, label: '12 months' },
    { value: 24, label: '24 months' },
  ];

  constructor(
    private svc: ReconIqService,
    private reconIqStore: ReconIqStore,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.svc.getReconFilterOptions().subscribe({
      next: opts => { this.filterOptions = opts; this.cdr.markForCheck(); },
    });

    this.reconIqStore.report$.pipe(takeUntil(this.destroy$)).subscribe(slice => {
      this.loading = slice.loading;
      this.error = !!slice.error;
      if (slice.data) {
        this.summary   = slice.data.summary;
        this.payerRows = slice.data.byPayer.rows;
        this.trendRows = slice.data.trend.rows;
        // populate in-transit table if data is available
        if (slice.data.inTransit?.rows?.length) {
          this.inTransitDs.data = slice.data.inTransit.rows;
          this.inTransitDs.sort = this.inTransitSort;
        }
      }
      this.cdr.markForCheck();
    });

    this.reconIqStore.loadReport(this.filters);
  }

  ngAfterViewInit(): void {
    this.inTransitDs.sort = this.inTransitSort;
  }

  get activeFilterCount(): number {
    let n = 0;
    if (this.filters.months !== 6)         n++;
    if (this.filters.location)             n++;
    if (this.filters.payer)               n++;
    if (this.filters.postStatus !== 'all') n++;
    return n;
  }

  loadData(): void {
    this.inTransitDs.data = [];
    this.inTransitSearch  = '';
    this.showInTransit    = false;
    this.providerRows     = [];
    this.auditRows        = [];
    this.reconIqStore.reloadReport(this.filters);
  }

  applyFilters(): void {
    this.filtersOpen = false;
    this.loadData();
  }

  resetFilters(): void {
    this.filters = { months: 6, location: '', payer: '', postStatus: 'all' };
    this.filtersOpen = false;
    this.loadData();
  }

  toggleInTransit(): void {
    this.showInTransit = !this.showInTransit;
    // In-transit data is already loaded by the store's loadReport()
    if (this.showInTransit) {
      const data = this.reconIqStore.reportSnapshot;
      if (data?.inTransit?.rows?.length && !this.inTransitDs.data.length) {
        this.inTransitDs.data = data.inTransit.rows;
        this.inTransitDs.sort = this.inTransitSort;
      }
    }
    this.cdr.markForCheck();
  }

  applyInTransitSearch(value: string): void {
    this.inTransitDs.filter = value.trim().toLowerCase();
  }

  formatCurrency(val: number): string {
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (val >= 1_000)     return '$' + (val / 1_000).toFixed(0) + 'K';
    return '$' + val.toFixed(0);
  }

  get matchRatio(): number {
    if (!this.summary) return 0;
    const total = this.summary.matchedCount + this.summary.unmatchedPayments + this.summary.unmatchedEOBs;
    if (!total) return 0;
    return Math.round((this.summary.matchedCount / total) * 100);
  }

  get postingRate(): number {
    if (!this.summary || !this.summary.matchedCount) return 0;
    return Math.round((this.summary.postedCount / this.summary.matchedCount) * 100);
  }

  denialClass(rate: number): string {
    if (rate >= 15) return 'rate-high';
    if (rate >= 5)  return 'rate-med';
    return 'rate-ok';
  }

  diffClass(diff: number): string {
    if (Math.abs(diff) === 0)  return 'diff-ok';
    if (Math.abs(diff) < 5000) return 'diff-warn';
    return 'diff-high';
  }

  agedClass(days: number): string {
    if (days > 30) return 'rate-high';
    if (days > 14) return 'rate-med';
    return '';
  }

  downloadCsv(): void {
    let rows: string[][] = [];
    let filename = 'reconciliation-report';

    if (this.activeSection === 'overview' && this.summary) {
      filename = 'recon-overview';
      rows = [
        ['Metric', 'Value'],
        ['Reconciled Count',   String(this.summary.matchedCount)],
        ['Reconciled Amount',  String(this.summary.matchedAmount)],
        ['Unposted',           String(this.summary.unpostedCount)],
        ['Unmatched Payments', String(this.summary.unmatchedPayments)],
        ['Unmatched EOBs',     String(this.summary.unmatchedEOBs)],
        ['Denial Rate (%)',    String(this.summary.denialRate)],
        ['Bank Tx Count',      String(this.summary.bankTxCount)],
        ['Bank Tx Total',      String(this.summary.bankTxTotal)],
        ['PMS Tx Count',       String(this.summary.pmsTxCount)],
        ['PMS Tx Total',       String(this.summary.pmsTxTotal)],
        ['Bank vs PMS Diff',   String(this.summary.bankPmsDiff)],
        ['In Transit Count',   String(this.summary.inTransitCount)],
        ['In Transit Total',   String(this.summary.inTransitTotal)],
      ];
    } else if (this.activeSection === 'payers') {
      filename = 'recon-by-payer';
      rows = [
        ['Payer', 'Remittances', 'Total Amount', 'Avg Amount', 'Linked Claims', 'Denied', 'Denial Rate %'],
        ...this.payerRows.map(r => [
          r.payerName, String(r.remittanceCount), String(r.totalAmount),
          String(r.avgAmount), String(r.linkedClaims), String(r.deniedClaims), String(r.denialRate),
        ]),
      ];
    } else if (this.activeSection === 'trend') {
      filename = 'recon-monthly-trend';
      rows = [
        ['Period', 'Reconciled', 'Amount', 'Claims', 'Denied', 'Denial Rate %', 'Posted'],
        ...this.trendRows.map(r => [
          r.period, String(r.reconcileCount), String(r.reconcileAmount),
          String(r.claimCount), String(r.deniedCount), String(r.denialRate), String(r.postedCount),
        ]),
      ];
    } else if (this.activeSection === 'provider') {
      filename = 'recon-by-provider';
      rows = [
        ['Provider', 'Remittances', 'Total Amount', 'Avg Amount', 'Linked Claims', 'Denied', 'Denial Rate %'],
        ...this.providerRows.map(r => [
          r.providerName, String(r.remittanceCount), String(r.totalAmount),
          String(r.avgAmount), String(r.linkedClaims), String(r.deniedClaims), String(r.denialRate),
        ]),
      ];
    } else if (this.activeSection === 'audit') {
      filename = 'posting-audit';
      rows = [
        ['Remittance ID', 'EOB Date', 'Payer', 'Location', 'Claims', 'Posted By', 'Posted Date'],
        ...this.auditRows.map(r => [
          r.remittanceFileId, r.eobDate, r.payerName, r.location,
          String(r.claimCount), r.postedBy, r.postedDate,
        ]),
      ];
    }

    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  loadByProvider(): void {
    this.activeSection = 'provider';
    if (this.providerRows.length) return;
    this.providerLoading = true;
    this.cdr.markForCheck();
    this.svc.getReconReportByProvider(this.filters).subscribe({
      next: r => { this.providerRows = r.rows; this.providerLoading = false; this.cdr.markForCheck(); },
      error: () => { this.providerLoading = false; this.cdr.markForCheck(); },
    });
  }

  loadPostingAudit(page = 1): void {
    this.activeSection = 'audit';
    this.auditLoading = true;
    this.auditPage = page;
    this.cdr.markForCheck();
    this.svc.getPostingAudit({ page, pageSize: 25 }).subscribe({
      next: r => {
        this.auditRows = r.rows;
        this.auditTotal = r.total;
        this.auditTotalPages = r.totalPages;
        this.auditLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.auditLoading = false; this.cdr.markForCheck(); },
    });
  }

  exportDetailCsv(): void {
    if (this.exportingDetail) return;
    this.exportingDetail = true;
    this.cdr.markForCheck();
    this.svc.exportReconDetailCsv(this.filters).subscribe({
      next: (csv) => {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `recon-detail-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportingDetail = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.exportingDetail = false;
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
