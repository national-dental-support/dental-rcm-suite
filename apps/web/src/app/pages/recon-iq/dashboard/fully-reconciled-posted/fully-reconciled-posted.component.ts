import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ReconIqService } from '../../../../core/services/recon-iq.service';
import { GlobalFiltersStore } from '../../../../shared/components/global-filters/global-filters.store';
import {
  FullyReconciledClaimDto,
  FullyReconciledLocationDto,
  FullyReconciledPaymentsRowDto,
} from '../../../../core/models/recon-iq.models';

@Component({
    selector: 'app-fully-reconciled-posted',
    templateUrl: './fully-reconciled-posted.component.html',
    styleUrls: ['./fully-reconciled-posted.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class FullyReconciledPostedComponent implements OnInit {
  loading = false;
  error = false;

  private allRows: FullyReconciledPaymentsRowDto[] = [];
  rows: FullyReconciledPaymentsRowDto[] = [];

  searchTerm = '';
  sortField: string = 'postedDate';
  sortDir: 'asc' | 'desc' = 'desc';

  page = 1;
  readonly pageSize = 25;
  get total()      { return this.rows.length; }
  get totalPages() { return Math.ceil(this.total / this.pageSize); }
  get pageFrom()   { return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1; }
  get pageTo()     { return Math.min(this.page * this.pageSize, this.total); }
  get pageRows()   { return this.rows.slice((this.page - 1) * this.pageSize, this.page * this.pageSize); }

  // Summary tiles
  get totalFiles()   { return this.rows.length; }
  get sumEra()       { return this.rows.reduce((s, r) => s + r.amountFullEra, 0); }
  get sumDeposited() { return this.rows.reduce((s, r) => s + r.amountDeposited, 0); }
  get sumCharge()    { return this.rows.reduce((s, r) => s + r.totalCharge, 0); }
  get sumPaid()      { return this.rows.reduce((s, r) => s + r.totalPaid, 0); }

  avgReimbRate(): string {
    return this.sumCharge ? ((this.sumPaid / this.sumCharge) * 100).toFixed(1) : '0.0';
  }

  // Expanded row state
  expandedId: string | null = null;
  claimsMap      = new Map<string, FullyReconciledClaimDto[]>();
  locBreakdownMap = new Map<string, FullyReconciledLocationDto[]>();
  claimsLoading  = new Set<string>();

  constructor(
    private reconIqService: ReconIqService,
    private cdr: ChangeDetectorRef,
    private globalFiltersStore: GlobalFiltersStore,
  ) {}

  ngOnInit(): void {
    this.globalFiltersStore.applied$.subscribe(() => this.load());
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.error = false;
    this.expandedId = null;
    this.cdr.markForCheck();

    const gf = this.globalFiltersStore.value;
    const from = gf?.startDate ? (gf.startDate as Date).toISOString().slice(0, 10) : undefined;
    const to   = gf?.endDate   ? (gf.endDate   as Date).toISOString().slice(0, 10) : undefined;

    this.reconIqService.getFullyPaidAndReconciledPayments({
      page: 1, pageSize: 5000, from, to,
    }).subscribe({
      next: (res: any) => {
        this.allRows = (res?.rows ?? []) as FullyReconciledPaymentsRowDto[];
        this.applyFilters();
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

  // -- Row expand / collapse ----------------------------------------------------
  toggleExpand(row: FullyReconciledPaymentsRowDto): void {
    if (this.expandedId === row.reconciledId) {
      this.expandedId = null;
      this.cdr.markForCheck();
      return;
    }
    this.expandedId = row.reconciledId;
    if (!this.claimsMap.has(row.reconciledId)) {
      this.loadClaims(row.reconciledId);
    }
    this.cdr.markForCheck();
  }

  private loadClaims(fileId: string): void {
    this.claimsLoading.add(fileId);
    this.cdr.markForCheck();
    this.reconIqService.getFullyReconciledClaims(fileId).subscribe({
      next: (res: any) => {
        this.claimsMap.set(fileId, res.claims ?? []);
        this.locBreakdownMap.set(fileId, res.byLocation ?? []);
        this.claimsLoading.delete(fileId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.claimsMap.set(fileId, []);
        this.locBreakdownMap.set(fileId, []);
        this.claimsLoading.delete(fileId);
        this.cdr.markForCheck();
      },
    });
  }

  // -- Sorting ------------------------------------------------------------------
  sort(field: string): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = ['postedDate', 'fileDate', 'depositDate'].includes(field) ? 'desc' : 'asc';
    }
    this.applyFilters();
    this.cdr.markForCheck();
  }

  sortIcon(field: string): string {
    if (this.sortField !== field) return 'unfold_more';
    return this.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // -- Search -------------------------------------------------------------------
  onSearch(term: string): void {
    this.searchTerm = term;
    this.page = 1;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  private applyFilters(): void {
    const s = this.searchTerm.trim().toLowerCase();
    const result = s
      ? this.allRows.filter(r =>
          r.reconciledId.toLowerCase().includes(s) ||
          r.payerName.toLowerCase().includes(s) ||
          r.practiceLocation.toLowerCase().includes(s) ||
          r.bankName.toLowerCase().includes(s) ||
          r.postedBy.toLowerCase().includes(s)
        )
      : [...this.allRows];

    const f = this.sortField as keyof FullyReconciledPaymentsRowDto;
    const dir = this.sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      const av = a[f] ?? '', bv = b[f] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    this.rows = result;
    this.page = 1;
  }

  goPage(delta: number): void {
    this.page = Math.max(1, Math.min(this.totalPages, this.page + delta));
    this.cdr.markForCheck();
  }

  // -- Claim aggregates ---------------------------------------------------------
  claimTotal(claims: FullyReconciledClaimDto[], field: keyof FullyReconciledClaimDto): number {
    return claims.reduce((s, c) => s + (Number(c[field]) || 0), 0);
  }

  // -- Helpers ------------------------------------------------------------------
  locations(row: FullyReconciledPaymentsRowDto): string[] {
    if (row.locationList) return row.locationList.split('|').filter(Boolean);
    return row.practiceLocation ? [row.practiceLocation] : [];
  }

  variance(row: FullyReconciledPaymentsRowDto): number {
    return row.amountFullEra - row.amountDeposited;
  }

  reimbRate(row: FullyReconciledPaymentsRowDto): string {
    if (!row.totalCharge) return '0.0';
    return ((row.totalPaid / row.totalCharge) * 100).toFixed(1);
  }

  varianceClass(v: number): string {
    if (Math.abs(v) < 0.01) return 'var--zero';
    return v < 0 ? 'var--neg' : 'var--pos';
  }

  fmt(n: number | null | undefined): string {
    return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  fmtDate(d: string): string {
    if (!d) return '\u2014';
    const [y, m, day] = d.split('-');
    return `${m}/${day}/${y}`;
  }
}
