import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import {
  AdvancedTableColumnConfig,
  ColumnFilterState,
  TableFilterState,
} from '../../../shared/components/advanced-table/advanced-table.models';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { forkJoin, Subject, of, BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { catchError, finalize, map, shareReplay, startWith, takeUntil } from 'rxjs/operators';

import {
  MatchingConfirmDialogComponent,
  MatchingConfirmDialogData,
} from './matching-confirm-dialog/matching-confirm-dialog.component';
import {
  PaymentsWithNoEobRowDto,
  EobsWithNoPaymentRowDto,
  ReconIqLocationFilter,
} from '../../../core/models/recon-iq.models';
import { ReconIqService, MatchedPairRow, MatchSuggestionRow } from '../../../core/services/recon-iq.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { ReconIqWindowService } from '../../../core/services/recon-iq-window.service';
import { MATCHING_CONFIG, MatchingFilters } from '../recon-iq-filter-dialog/recon-iq-filter.config';

type PaymentNoEobRow = {
  paymentId: string;
  value: string;
  date: string;
  payer: string;
  type: string;
  amount: string;
  bankFeedId?: string;
};

type EobNoPaymentRow = {
  eobId: string;
  value: string;
  date: string;
  payer: string;
  type: string;
  amount: string;
};

type FilterChip = { key: keyof MatchingFilters; label: string; value: string };

@Component({
    selector: 'app-matching',
    templateUrl: './matching.component.html',
    styleUrls: ['./matching.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class MatchingComponent implements OnInit, OnDestroy {
  isLoading = false;

  paymentsNoEobData: PaymentNoEobRow[] = [];
  eobNoPaymentsData: EobNoPaymentRow[] = [];

  selectedPayment: PaymentNoEobRow | null = null;
  selectedEob: EobNoPaymentRow | null = null;

  readonly matchingFilterConfig = MATCHING_CONFIG;

  private readonly destroy$ = new Subject<void>();

  readonly search$ = new BehaviorSubject<string>('');
  readonly paymentsNoEobData$ = new BehaviorSubject<PaymentNoEobRow[]>([]);
  readonly eobNoPaymentsData$ = new BehaviorSubject<EobNoPaymentRow[]>([]);

  readonly filtersForm$ = new BehaviorSubject<MatchingFilters>({
    date: '',
    amount: '',
    paymentId: '',
    payer: '',
    type: '',
    value: '',
    eobId: '',
  });

  private norm(v: any): string {
    return (v ?? '').toString().trim().toLowerCase();
  }

  private contains(hay: any, needle: any): boolean {
    const n = this.norm(needle);
    if (!n) return true;
    return this.norm(hay).includes(n);
  }

  readonly filteredEobNoPayments$ = combineLatest([
    this.eobNoPaymentsData$,
    this.filtersForm$,
    this.search$,
  ]).pipe(
    map(([rows, f, search]) => {
      const s = this.norm(search);

      return (rows ?? []).filter((r) => {
        const globalOk =
          !s ||
          this.norm(r.eobId).includes(s) ||
          this.norm(r.value).includes(s) ||
          this.norm(r.date).includes(s) ||
          this.norm(r.payer).includes(s) ||
          this.norm(r.type).includes(s) ||
          this.norm(r.amount).includes(s);

        if (!globalOk) return false;

        return (
          this.contains(r.eobId, f.eobId) &&
          this.contains(r.value, f.value) &&
          this.contains(r.date, f.date) &&
          this.contains(r.payer, f.payer) &&
          this.contains(r.type, f.type) &&
          this.contains(r.amount, f.amount)
        );
      });
    }),
    shareReplay(1)
  );

  readonly filteredPaymentsNoEob$ = combineLatest([
    this.paymentsNoEobData$,
    this.filtersForm$,
    this.search$,
  ]).pipe(
    map(([rows, f, search]) => {
      const s = this.norm(search);

      return (rows ?? []).filter((r) => {
        const globalOk =
          !s ||
          this.norm(r.paymentId).includes(s) ||
          this.norm(r.value).includes(s) ||
          this.norm(r.date).includes(s) ||
          this.norm(r.payer).includes(s) ||
          this.norm(r.type).includes(s) ||
          this.norm(r.amount).includes(s);

        if (!globalOk) return false;

        return (
          this.contains(r.paymentId, f.paymentId) &&
          this.contains(r.value, f.value) &&
          this.contains(r.date, f.date) &&
          this.contains(r.payer, f.payer) &&
          this.contains(r.type, f.type) &&
          this.contains(r.amount, f.amount)
        );
      });
    }),
    shareReplay(1)
  );

  readonly activeFilterCount$ = this.filtersForm$.pipe(
    map((f) => Object.values(f ?? {}).filter((v) => !!String(v ?? '').trim()).length),
    startWith(0),
    shareReplay(1)
  );

  mk(v?: string): ColumnFilterState {
    const val = (v ?? '').trim();
    return val
      ? { operator: 'contains', value: val, value2: '', selectedValues: [] }
      : { operator: null, value: '', value2: '', selectedValues: [] };
  }

  readonly tableFilterState$: Observable<TableFilterState> = this.filtersForm$.pipe(
    map((f) => ({
      global: '',
      columns: {
        paymentId: this.mk(f.paymentId),
        value: this.mk(f.value),
        date: this.mk(f.date),
        payer: this.mk(f.payer),
        type: this.mk(f.type),
        amount: this.mk(f.amount),
      },
    })),
    shareReplay(1)
  );

  private toMatchingTableFilterState(f: MatchingFilters, search: string = ''): TableFilterState {
    const mk = (value?: string): ColumnFilterState => {
      const v = (value ?? '').trim();
      return v
        ? { operator: 'contains', value: v, value2: '', selectedValues: [] }
        : { operator: null, value: '', value2: '', selectedValues: [] };
    };

    return {
      global: (search ?? '').trim(),
      columns: {
        paymentId: mk(f.paymentId),
        value: mk(f.value),
        date: mk(f.date),
        payer: mk(f.payer),
        type: mk(f.type),
        amount: mk(f.amount),
      },
    };
  }

  get activeFilters(): FilterChip[] {
    const f = this.currentFilters ?? ({} as MatchingFilters);

    const map: Array<[keyof MatchingFilters, string]> = [
      ['paymentId', 'Payment Id'],
      ['payer', 'Payer'],
      ['eobId', 'EOB/ERA Id'],
      ['value', 'Reference Id'],
      ['type', 'Type'],
      ['date', 'Date'],
      ['amount', 'Amount'],
    ];

    return map
      .map(([key, label]) => {
        const raw = (f as any)[key];
        const value = raw?.toString().trim();
        return value ? { key, label, value } : null;
      })
      .filter(Boolean) as FilterChip[];
  }

  get activeFilterCount(): number {
    const f = this.currentFilters ?? {};
    return Object.entries(f).filter(([_, v]) => (v ?? '').toString().trim().length > 0).length;
  }

  // ===== Columns =====
  paymentsNoEob: AdvancedTableColumnConfig<PaymentNoEobRow>[] = [
    {
      id: 'select',
      header: '',
      type: 'text',
      sortable: false,
      filterable: false,
      width: '48px',
      accessor: () => '',
      includeInGlobalSearch: false,
    },
    {
      id: 'paymentId',
      header: 'Payment ID',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '260px',
      includeInGlobalSearch: true,
      accessor: (r) => r.paymentId,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'bankFeedId',
      header: 'Bank Feed ID',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '150px',
      accessor: (r) => r.bankFeedId ?? '\u2014',
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'value',
      header: 'Reference ID',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '170px',
      accessor: (r) => r.value,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'date',
      header: 'Date',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '190px',
      accessor: (r) => r.date,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'payer',
      header: 'Payer',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '180px',
      accessor: (r) => r.payer,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'type',
      header: 'Type',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '180px',
      accessor: (r) => r.type,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'amount',
      header: 'Amount',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '170px',
      accessor: (r) => r.amount,
      filterConfig: { supportsValueList: false, supportsGroupValues: false },
    },
    {
      id: 'actions',
      header: '',
      type: 'text',
      sortable: false,
      filterable: false,
      width: '170px',
      align: 'end',
      accessor: () => '',
      includeInGlobalSearch: false,
    },
  ];

  eobNoPayments: AdvancedTableColumnConfig<EobNoPaymentRow>[] = [
    {
      id: 'select',
      header: '',
      type: 'text',
      sortable: false,
      filterable: false,
      width: '48px',
      accessor: () => '',
      includeInGlobalSearch: false,
    },
    {
      id: 'eobId',
      header: 'EOB/ERA ID',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '260px',
      includeInGlobalSearch: true,
      accessor: (r) => r.eobId,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    { id: 'date', header: 'Date', type: 'text', sortable: true, filterable: true, align: 'end', width: '190px', accessor: (r) => r.date, filterConfig: { supportsValueList: true, supportsGroupValues: false } },
    { id: 'payer', header: 'Payer', type: 'text', sortable: true, filterable: true, align: 'end', width: '180px', accessor: (r) => r.payer, filterConfig: { supportsValueList: true, supportsGroupValues: false } },
    { id: 'type', header: 'Type', type: 'text', sortable: true, filterable: true, align: 'end', width: '180px', accessor: (r) => r.type, filterConfig: { supportsValueList: true, supportsGroupValues: false } },
    { id: 'amount', header: 'Amount', type: 'text', sortable: true, filterable: true, align: 'end', width: '170px', accessor: (r) => r.amount, filterConfig: { supportsValueList: false, supportsGroupValues: false } },
    {
      id: 'actions',
      header: '',
      type: 'text',
      sortable: false,
      filterable: false,
      width: '170px',
      align: 'end',
      accessor: () => '',
      includeInGlobalSearch: false,
    },
  ];

  paymentRowClassFn = (row: PaymentNoEobRow) =>
    this.selectedPayment?.paymentId === row.paymentId ? 'rp-row--selected' : null;

  eobRowClassFn = (row: EobNoPaymentRow) =>
    this.selectedEob?.eobId === row.eobId ? 'rp-row--selected' : null;

  showFilters: boolean;
  readonly initialTableFilterState: TableFilterState = { global: '', columns: {} };

  readonly filters$ = new BehaviorSubject<MatchingFilters>({
    date: '',
    amount: '',
    paymentId: '',
    payer: '',
    type: '',
    value: '',
  });

  matchingGlobalSearch: string;

  matchingTableFilterState: TableFilterState = { global: '', columns: {} };

  currentFilters: MatchingFilters = {
    paymentId: '',
    value: '',
    date: '',
    payer: '',
    type: '',
    amount: '',
  };

  filterValue: string;

  @Input() initialFilters: MatchingFilters | null = null;

  @Output() filtersChange = new EventEmitter<MatchingFilters>();
  @Output() reset = new EventEmitter<void>();

  constructor(
    private readonly dialog: MatDialog,
    private readonly reconIqService: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
    private readonly reconWindows: ReconIqWindowService,
    private readonly globalFiltersStore: GlobalFiltersStore,
    private readonly snackBar: MatSnackBar,
    private readonly router: Router,
  ) {}

  goToPaymentReconciliation(): void {
    this.router.navigate(['/app/recon-iq/payment-reconciliation']);
  }

  ngOnInit(): void {
    // initial load
    this.loadMatchingTables();

    // reload on global filters apply
    this.globalFiltersStore.applied$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadMatchingTables();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * [ok] Names-only global filter payload (NO IDs).
   */
  private getReconIqMatchingQueryFilters(): {
    from?: string;
    to?: string;
    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  } {
    const gf = this.globalFiltersStore.value;

    const from = gf?.startDate ? (gf.startDate as Date).toISOString().slice(0, 10) : undefined;
    const to = gf?.endDate ? (gf.endDate as Date).toISOString().slice(0, 10) : undefined;

    return {
      from,
      to,
      payers: gf?.payers ?? [],
      providers: gf?.providers ?? [],
      location: gf?.location as ReconIqLocationFilter | undefined,
    };
  }

  private loadMatchingTables(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    const page = 1;
    const pageSize = 25;

    const common = this.getReconIqMatchingQueryFilters();

    forkJoin({
      payments: this.reconIqService.getPaymentsWithNoEob({ page, pageSize, ...common }),
      eobs: this.reconIqService.getEobsWithNoPayment({ page, pageSize, ...common }),
    })
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.error('[Recon-IQ Matching] Failed to load tables', err);
          this.ngZone.run(() => {
            this.paymentsNoEobData$.next([]);
            this.eobNoPaymentsData$.next([]);
            this.cdr.markForCheck();
          });
          return of(null);
        }),
        finalize(() => {
          this.ngZone.run(() => {
            this.isLoading = false;
            this.cdr.markForCheck();
          });
        })
      )
      .subscribe((result) => {
        if (!result) return;

        this.ngZone.run(() => {
          const payments = (result.payments?.rows ?? []).map((r) => this.mapPaymentDto(r));
          this.paymentsNoEobData$.next(payments);

          const eobs = (result.eobs?.rows ?? []).map((r) => this.mapEobDto(r));
          this.eobNoPaymentsData$.next(eobs);

          console.debug('[Recon-IQ Matching] payments rows:', result.payments?.rows?.length ?? 0);
          console.debug('[Recon-IQ Matching] eobs rows:', result.eobs?.rows?.length ?? 0);

          this.cdr.markForCheck();
        });
      });
  }

  private mapPaymentDto(r: PaymentsWithNoEobRowDto): PaymentNoEobRow {
    return {
      paymentId: r.paymentId,
      value: r.value,
      date: r.paymentDate,
      payer: r.payerName,
      type: r.paymentType,
      amount: this.toMoney(r.amount),
      bankFeedId: r.bankFeedId,
    };
  }

  private mapEobDto(r: EobsWithNoPaymentRowDto): EobNoPaymentRow {
    return {
      eobId: r.eobId,
      value: r.value,
      date: r.eobDate,
      payer: r.payerName,
      type: r.eobType,
      amount: this.toMoney(r.amount),
    };
  }

  private toMoney(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
  }

  onViewPayment(row: PaymentNoEobRow, ev?: MouseEvent): void {
    ev?.stopPropagation();

    this.reconWindows.openPaymentWindow({
      paymentId: row.paymentId,
      referenceId: row.value,
      date: row.date,
      payer: row.payer,
      type: row.type,
      amount: row.amount,
    });
  }

  onViewEobEra(row: EobNoPaymentRow, ev?: MouseEvent): void {
    ev?.stopPropagation();

    this.reconWindows.openEobWindow({
      eobId:       row.eobId,
      referenceId: row.value,
      date:        row.date,
      payer:       row.payer,
      type:        row.type,
      amount:      row.amount,
    });
  }

  onPaymentSelected(row: PaymentNoEobRow): void {
    this.selectedPayment = this.selectedPayment?.paymentId === row.paymentId ? null : row;
    this.cdr.markForCheck();
  }

  onEobSelected(row: EobNoPaymentRow): void {
    this.selectedEob = this.selectedEob?.eobId === row.eobId ? null : row;
    this.cdr.markForCheck();
  }

  onMatchSelected(): void {
    if (!this.selectedPayment || !this.selectedEob) return;

    const data: MatchingConfirmDialogData = {
      payment: this.selectedPayment,
      eob: this.selectedEob,
    };

    const ref = this.dialog.open(MatchingConfirmDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      autoFocus: false,
      data,
    });

    ref.afterClosed().subscribe((confirmed: boolean) => {
      if (!confirmed) return;
      this.applyMatch();
    });
  }

  private applyMatch(): void {
    if (!this.selectedPayment || !this.selectedEob) return;

    const paymentId = this.selectedPayment.paymentId;
    const eobId = this.selectedEob.eobId;

    this.reconIqService.applyMatch(paymentId, eobId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          console.log('[Recon-IQ Matching] match persisted:', result);

          // remove matched rows from streams
          const nextPayments = (this.paymentsNoEobData$.value ?? []).filter((p) => p.paymentId !== paymentId);
          const nextEobs = (this.eobNoPaymentsData$.value ?? []).filter((e) => e.eobId !== eobId);

          this.paymentsNoEobData$.next(nextPayments);
          this.eobNoPaymentsData$.next(nextEobs);

          this.selectedPayment = null;
          this.selectedEob = null;
          if (this.showMatchedPanel) this.loadMatchedPairs();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[Recon-IQ Matching] match failed:', err);
          this.cdr.markForCheck();
        },
      });
  }

  clearSelections(): void {
    this.selectedPayment = null;
    this.selectedEob = null;
    this.cdr.markForCheck();
  }

  get canMatch(): boolean {
    return !!this.selectedPayment && !!this.selectedEob;
  }

  onFiltersChange(next: MatchingFilters): void {
    console.log('[Matching] filtersChange', next);
    this.filters$.next({ ...this.filters$.value, ...next });
  }

  onFiltersReset(): void {
    console.log('[Matching] filtersReset');
    this.filters$.next({ amount: '', date: '', payer: '', paymentId: '', type: '', value: '' });
  }

  clearEncounterSearch(): void {
    this.matchingGlobalSearch = '';
    this.cdr.markForCheck();
  }

  onMatchingSearchChanged(value: string): void {
    const next = (value ?? '').toString();
    this.search$.next(next);
    this.cdr.markForCheck();
  }

  onFilterReset(): void {
    this.filtersForm$.next({
      paymentId: '',
      value: '',
      eobId: '',
      date: '',
      payer: '',
      type: '',
      amount: '',
    });
    this.search$.next('');
    this.cdr.markForCheck();
  }

  applyFilter(value: string): void {
    this.filterValue = value;
    this.currentFilters = { ...this.currentFilters };
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  onMatchingGlobalSearchInput(event: Event): void {
    this.matchingGlobalSearch = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  onMatchingFiltersChanged(next: MatchingFilters): void {
    this.filtersForm$.next({ ...this.filtersForm$.value, ...next });
    this.cdr.markForCheck();
  }

  removeFilterChip(chip: FilterChip): void {
    const next = { ...this.filtersForm$.value, [chip.key]: '' } as MatchingFilters;
    this.filtersForm$.next(next);
    this.cdr.markForCheck();
  }

  matchedPairs: MatchedPairRow[] = [];
  matchedLoading = false;
  showMatchedPanel = false;

  loadMatchedPairs(): void {
    this.matchedLoading = true;
    this.cdr.markForCheck();
    this.reconIqService.getMatchedPairs().pipe(takeUntil(this.destroy$)).subscribe({
      next: r => { this.matchedPairs = r.rows; this.matchedLoading = false; this.cdr.markForCheck(); },
      error: () => { this.matchedLoading = false; this.cdr.markForCheck(); },
    });
  }

  toggleMatchedPanel(): void {
    this.showMatchedPanel = !this.showMatchedPanel;
    if (this.showMatchedPanel && !this.matchedPairs.length) this.loadMatchedPairs();
  }

  unmatch(pair: MatchedPairRow): void {
    const reason = prompt(`Unmatch reason for ${pair.reconciliationId}:`);
    if (reason === null) return; // cancelled

    this.reconIqService.unmatch(pair.reconciliationId, reason).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.matchedPairs = this.matchedPairs.filter(p => p.reconciliationId !== pair.reconciliationId);
        // Return the items to their unmatched tables by refreshing
        this.loadMatchingTables();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[Matching] unmatch failed', err);
      },
    });
  }

  exportCsv(): void {
    const payments = this.paymentsNoEobData$.value ?? [];
    const eobs = this.eobNoPaymentsData$.value ?? [];

    const rows: string[][] = [
      ['Table', 'ID', 'Reference ID', 'Date', 'Payer', 'Type', 'Amount'],
      ...payments.map(r => ['Payment', r.paymentId, r.value, r.date, r.payer, r.type, r.amount]),
      ...eobs.map(r => ['EOB', r.eobId, r.value, r.date, r.payer, r.type, r.amount]),
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matching-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -- Auto-Match Suggestions ---------------------------------------------------
  suggestions: MatchSuggestionRow[] = [];
  suggestionsLoading = false;
  showSuggestionsPanel = false;

  toggleSuggestionsPanel(): void {
    this.showSuggestionsPanel = !this.showSuggestionsPanel;
    if (this.showSuggestionsPanel && !this.suggestions.length) this.loadSuggestions();
  }

  loadSuggestions(): void {
    this.suggestionsLoading = true;
    this.cdr.markForCheck();
    this.reconIqService.getSuggestions().pipe(takeUntil(this.destroy$)).subscribe({
      next: r => { this.suggestions = r.rows; this.suggestionsLoading = false; this.cdr.markForCheck(); },
      error: () => { this.suggestionsLoading = false; this.cdr.markForCheck(); },
    });
  }

  generateSuggestions(): void {
    this.suggestionsLoading = true;
    this.cdr.markForCheck();
    this.reconIqService.generateSuggestions().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadSuggestions(),
      error: () => { this.suggestionsLoading = false; this.cdr.markForCheck(); },
    });
  }

  acceptSuggestion(s: MatchSuggestionRow): void {
    this.reconIqService.acceptSuggestion(s.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.suggestions = this.suggestions.filter(x => x.id !== s.id);
        this.paymentsNoEobData$.next(this.paymentsNoEobData$.value.filter(p => p.paymentId !== s.bankDepositId));
        this.eobNoPaymentsData$.next(this.eobNoPaymentsData$.value.filter(e => e.eobId !== s.remittanceFileId));
        this.cdr.markForCheck();
      },
      error: (err) => console.error('[Matching] acceptSuggestion failed', err),
    });
  }

  rejectSuggestion(s: MatchSuggestionRow): void {
    this.reconIqService.rejectSuggestion(s.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.suggestions = this.suggestions.filter(x => x.id !== s.id);
        this.cdr.markForCheck();
        const ref = this.snackBar.open('Match rejected \u2014 bank escalation created.', 'View Escalation', { duration: 6000 });
        ref.onAction().subscribe(() => this.router.navigate(['/app/recon-iq/admin']));
      },
      error: (err) => console.error('[Matching] rejectSuggestion failed', err),
    });
  }

  autoAcceptHighConfidence(): void {
    const count = this.suggestions.filter(s => s.confidenceScore >= 80).length;
    if (!count) return;
    if (!confirm(`Auto-accept ${count} suggestion(s) with \u226580% confidence?`)) return;
    this.reconIqService.autoAcceptSuggestions(80).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.loadMatchingTables(); this.loadSuggestions(); },
      error: (err) => console.error('[Matching] autoAccept failed', err),
    });
  }

  confidenceClass(score: number): string {
    if (score >= 80) return 'conf-bar--green';
    if (score >= 60) return 'conf-bar--yellow';
    return 'conf-bar--red';
  }

  onTableFilterStateChanged(state: TableFilterState): void {
    const read = (key: keyof MatchingFilters): string => {
      const s = (state?.columns as any)?.[key] as ColumnFilterState | undefined;
      const v = (s?.value ?? '').toString().trim();
      return s?.operator && v ? v : '';
    };

    const next: MatchingFilters = {
      paymentId: read('paymentId'),
      value: read('value'),
      eobId: read('eobId'),
      date: read('date'),
      payer: read('payer'),
      type: read('type'),
      amount: read('amount'),
    };

    const prev = this.filtersForm$.value;
    const same =
      prev.paymentId === next.paymentId &&
      prev.value === next.value &&
      prev.date === next.date &&
      prev.payer === next.payer &&
      prev.type === next.type &&
      prev.amount === next.amount &&
      prev.eobId === next.eobId;

    if (same) return;

    this.filtersForm$.next(next);
    this.cdr.markForCheck();
  }
}