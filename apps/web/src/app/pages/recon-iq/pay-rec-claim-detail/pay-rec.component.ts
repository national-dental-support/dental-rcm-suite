import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, Subject, combineLatest, firstValueFrom, merge } from 'rxjs';
import { map, scan, shareReplay, startWith, switchMap, tap, takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';

import { AdvancedTableColumnConfig, TableFilterState } from '../../../shared/components/advanced-table/advanced-table.models';
import { BankAccountConnection, ReconIqService } from '../../../core/services/recon-iq.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { ReconIqWindowService } from '../../../core/services/recon-iq-window.service';
import { PdfService } from '../../../core/services/pdf.service';
import { PAY_REC_FILTER_CONFIG, PayRecFilters } from '../recon-iq-filter-dialog/recon-iq-filter.config';
import { EraPostingConfirmDialogComponent } from './era-posting-confirm-dialog/era-posting-confirm-dialog.component';

import { ReconIqLocationFilter } from '../../../core/models/recon-iq.models';

type ClaimDto = {
  claimId: string;
  dateClaimSubmitted: string;
  amount: number;
  claimStatus: string;
};

type EobDto = {
  eobId: string;
  eobDate: string;
  totalAmount: number;
  locationName: string;
  taxId: string;
  claimsWithMoneyCount: number;
  claimsZeroOpenCount: number;
  postingStatus: string;
  claims: ClaimDto[];
};

// ---------- Table Row Types ----------

type PayRecClaimRow = {
  id: string;
  rowType: 'claim';
  parentEobId: string;

  // projected into table columns
  eobId: string;         // show claim id here
  date: string;          // claim submitted date
  amount: string;        // claim amount formatted
  locationTaxId: string; // claim status
  claimsWithMoney: string;
  numberClaimsZeroOpen: string;

  // PM status
  pmPosted: boolean;

  // originals (optional)
  claimId: string;
  dateClaimSubmitted: string;
  claimAmountRaw: number;
  claimStatus: string;
};

type PayRecEobRow = {
  id: string;
  rowType: 'eob';

  eobId: string;
  date: string;
  amount: string;
  locationTaxId: string;
  locationName: string;
  taxId: string;
  claimsWithMoney: number;
  numberClaimsZeroOpen: number;
  pmPosted: boolean;

  // children
  claims: PayRecClaimRow[];
};

type PayRecRow = PayRecEobRow | PayRecClaimRow;

// ---------- Action Events ----------

type PmAction =
  | { type: 'init'; rows: PayRecEobRow[] }
  | { type: 'claim_toggled'; eobId: string; claimId: string }
  | { type: 'eob_posted'; eobId: string }
  | { type: 'bulk_posted'; eobIds: string[] };

type FilterChip = { key: keyof PayRecFilters; label: string; value: string };

type PmUiState = {
postedClaimIds: Set<string>;
hiddenEobIds: Set<string>;
};

@Component({
    selector: 'app-pay-rec',
    templateUrl: './pay-rec.component.html',
    styleUrls: ['./pay-rec.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PayRecClaimDetailComponent implements OnInit {
  enableNestedRows = true;
  childIndentPx = 18;
  showFilters = false;
  activeFilterCount = 0;
  initialFilters: PayRecFilters;
  readonly payRecFilterConfig = PAY_REC_FILTER_CONFIG;

  // [ok] initial filter state (this will also drive initial load)
  readonly filters$ = new BehaviorSubject<PayRecFilters>({
    eobId: '',
    amount: '',
    locationTaxId: '',
    date: '',
  });

  private readonly destroy$ = new Subject<void>();

  // 1) Cmdbar search (parent-controlled global search)
  readonly search$ = new BehaviorSubject<string>('');

  // 2) Filter form state (panel filters)
  readonly filtersForm$ = new BehaviorSubject<PayRecFilters>({
    eobId: '',
    date: '',
    amount: '',
    locationTaxId: '',
  });

  // Derived: active count
  readonly activeFilterCount$ = this.filtersForm$.pipe(
    map((f) => Object.values(f ?? {}).filter((v) => !!String(v ?? '').trim()).length),
    startWith(0),
    shareReplay(1)
  );

  // [ok] Table filter state (what rp-advanced-table consumes)
  readonly tableFilterState$: Observable<TableFilterState> = this.filtersForm$.pipe(
    map((f) => this.toReconciliationTableFilterState(f)),
    shareReplay(1)
  );

  get activeFilters(): FilterChip[] {
    const f = this.currentFilters ?? ({} as PayRecFilters);

    const map: Array<[keyof PayRecFilters, string]> = [
      ['eobId', 'EOB ID'],
      ['date', 'Date'],
      ['amount', 'Amount'],
      ['locationTaxId', 'Location/Tax ID'],
    ];

    return map
      .map(([key, label]) => {
        const raw = (f as any)[key];
        const value = raw?.toString().trim();
        return value ? { key, label, value } : null;
      })
      .filter(Boolean) as FilterChip[];
  }

  // tell rp-advanced-table where children live:
  readonly childrenAccessor = (row: PayRecRow): PayRecRow[] => {
    if ((row as PayRecEobRow).rowType === 'eob') return (row as PayRecEobRow).claims ?? [];
    return [];
  };

  private readonly money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });

  payRecColumns: AdvancedTableColumnConfig<any>[] = [
    {
      id: 'eobId',
      header: 'EOB ID / Claim ID',
      type: 'text',
      sortable: true,
      filterable: true,
      includeInGlobalSearch: true,
      accessor: (r: PayRecRow) => r.eobId,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'date',
      header: 'Date',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'end',
      includeInGlobalSearch: true,
      accessor: (r: PayRecRow) => r.date,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'amount',
      header: 'Amount',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'end',
      includeInGlobalSearch: true,
      accessor: (r: PayRecRow) => r.amount,
    },
    {
      id: 'locationTaxId',
      header: 'Location-TaxID / Claim Status)',
      type: 'custom',
      sortable: true,
      filterable: true,
      align: 'start',
      includeInGlobalSearch: true,
      accessor: (r: PayRecRow) => r.locationTaxId,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'claimsWithMoney',
      header: 'Claims With Money',
      align: 'center',
      type: 'text',
      sortable: true,
      filterable: true,
      accessor: (r: PayRecRow) => (r.rowType === 'eob' ? r.claimsWithMoney : ''),
    },
    {
      id: 'numberClaimsZeroOpen',
      header: 'Number Claims Zero Open',
      type: 'text',
      sortable: true,
      filterable: true,
      align: 'center',
      accessor: (r: PayRecRow) => (r.rowType === 'eob' ? r.numberClaimsZeroOpen : ''),
    },
    {
      id: 'action',
      header: '',
      type: 'custom',
      align: 'end',
      width: '310px',
      includeInGlobalSearch: false,
    },
  ];



  
  // ---------- State wiring ----------
 private claimKey(eobId: string, claimId: string): string {
  return `CLM:${eobId}:${claimId}`;
}

private readonly pmAction$ = new Subject<PmAction>();

private readonly pmUiState$: Observable<PmUiState> = this.pmAction$.pipe(
  startWith({ type: 'init', rows: [] } as PmAction),
  scan((state: PmUiState, action: PmAction): PmUiState => {
    const postedClaimIds = new Set<string>(state.postedClaimIds);
    const hiddenEobIds = new Set<string>(state.hiddenEobIds);

    switch (action.type) {
      case 'init':
          return { postedClaimIds: new Set<string>(), hiddenEobIds: new Set<string>() };

      case 'claim_toggled': {
        const key = this.claimKey(action.eobId, action.claimId);

        if (postedClaimIds.has(key)) {
          postedClaimIds.delete(key);
        } else {
          postedClaimIds.add(key);
        }

        // safety: if user toggles a claim, ensure EOB isn't hidden
        hiddenEobIds.delete(action.eobId);

        return { postedClaimIds, hiddenEobIds };
      }

      case 'eob_posted': {
        hiddenEobIds.add(action.eobId);

        // Optional cleanup: remove claim keys for that EOB
        for (const key of Array.from(postedClaimIds)) {
          // key is string because postedClaimIds is Set<string>
          if (key.startsWith(`CLM:${action.eobId}:`)) {
            postedClaimIds.delete(key);
          }
        }

        return { postedClaimIds, hiddenEobIds };
      }

      case 'bulk_posted': {
        for (const eobId of action.eobIds) {
          hiddenEobIds.add(eobId);
          for (const key of Array.from(postedClaimIds)) {
            if (key.startsWith(`CLM:${eobId}:`)) {
              postedClaimIds.delete(key);
            }
          }
        }
        return { postedClaimIds, hiddenEobIds };
      }

      default:
        return state;
    }
  }, { postedClaimIds: new Set<string>(), hiddenEobIds: new Set<string>() }),
  shareReplay(1)
);
  

  /**
   * [ok] Names-only global filter payload (NO IDs)
   */
  private getReconIqReconciliationQueryFilters(): {
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

  private readonly initRows$ = this.filters$.pipe(
    switchMap((f) => {
      const common = this.getReconIqReconciliationQueryFilters();

      const params = {
        page: 1,
        pageSize: 25,
        search: '',
        ...common,
        // bankName: f.bankName,
        // accountNumber: f.accountNumber,
      };

      console.log('[PayRec] getPaymentReconciliation params', params);

      return this.reconIqService.getPaymentReconciliation(params as any);
    }),
    tap((res) => console.log('[PayRec] reconciliation response', res)),
    map((res: any) => (res.rows ?? []) as EobDto[]),
    map((rowsFromApi) => {
      const mapped: PayRecEobRow[] = rowsFromApi.map((eob) => {
        const lt = this.splitLocationAndTaxId(eob.locationName, eob.taxId);

        const parent: PayRecEobRow = {
          id: `EOB:${eob.eobId}`,
          rowType: 'eob',
          eobId: eob.eobId,
          date: eob.eobDate,
          amount: this.money.format(eob.totalAmount ?? 0),

          locationTaxId: lt.taxId ? `${lt.location} / ${lt.taxId}` : lt.location,

          locationName: lt.location,
          taxId: lt.taxId,

          claimsWithMoney: eob.claimsWithMoneyCount ?? 0,
          numberClaimsZeroOpen: eob.claimsZeroOpenCount ?? 0,
          pmPosted: false,
          claims: [],
        };

        const children: PayRecClaimRow[] = (eob.claims ?? []).map((c, i) => ({
          id: `CLM:${eob.eobId}:${c.claimId}:${i}`,
          rowType: 'claim',
          parentEobId: eob.eobId,

          eobId: `\u21B3 ${c.claimId}`,
          date: c.dateClaimSubmitted,
          amount: this.money.format(c.amount ?? 0),
          locationTaxId: c.claimStatus ?? '',
          claimsWithMoney: '',
          numberClaimsZeroOpen: '',

          pmPosted: false,

          claimId: c.claimId,
          dateClaimSubmitted: c.dateClaimSubmitted,
          claimAmountRaw: c.amount ?? 0,
          claimStatus: c.claimStatus ?? '',
        }));

        parent.claims = children;
        return parent;
      });

      return { type: 'init', rows: mapped } as PmAction;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** Emits an EOB ID whenever the user clicks the action button */
  // private readonly removeRow$ = new Subject<string>();

  // private readonly removedIds$ = this.removeRow$.pipe(
  //   scan((set, id) => {
  //     const next = new Set(set);
  //     next.add(id);
  //     return next;
  //   }, new Set<string>()),
  //   startWith(new Set<string>()),
  //   shareReplay({ bufferSize: 1, refCount: true })
  // );

  private readonly rowsFromApi$: Observable<PayRecEobRow[]> = this.globalFiltersStore.applied$.pipe(
    startWith(this.globalFiltersStore.value),

    // [ok] Reset PM UI state whenever global filters are (re)applied
    tap(() => {
      this.pmAction$.next({ type: 'init', rows: [] } as any);
    }),

    switchMap(() => {
      const common = this.getReconIqReconciliationQueryFilters();
      return this.reconIqService.getPaymentReconciliation({
        page: 1,
        pageSize: 25,
        search: '',
        ...common,
      } as any);
    }),
    tap((res) => console.log('[PayRec] reconciliation response', res)),
    map((res: any) =>
      (res.rows ?? []).map((eob: EobDto) => {
        const lt = this.splitLocationAndTaxId(eob.locationName, eob.taxId);

        const parent: PayRecEobRow = {
          id: `EOB:${eob.eobId}`,
          rowType: 'eob',
          eobId: eob.eobId,
          date: eob.eobDate,
          amount: this.money.format(eob.totalAmount ?? 0),

          locationTaxId: lt.taxId ? `${lt.location} / ${lt.taxId}` : lt.location,

          locationName: lt.location,
          taxId: lt.taxId,

          claimsWithMoney: eob.claimsWithMoneyCount ?? 0,
          numberClaimsZeroOpen: eob.claimsZeroOpenCount ?? 0,
          pmPosted: false,
          claims: [],
        };

        const children: PayRecClaimRow[] = (eob.claims ?? []).map((c, i) => ({
          id: `CLM:${eob.eobId}:${c.claimId}:${i}`,
          rowType: 'claim',
          parentEobId: eob.eobId,

          eobId: `\u21B3 ${c.claimId}`,
          date: c.dateClaimSubmitted,
          amount: this.money.format(c.amount ?? 0),
          locationTaxId: c.claimStatus ?? '',
          claimsWithMoney: '',
          numberClaimsZeroOpen: '',

          pmPosted: false,

          claimId: c.claimId,
          dateClaimSubmitted: c.dateClaimSubmitted,
          claimAmountRaw: c.amount ?? 0,
          claimStatus: c.claimStatus ?? '',
        }));

        parent.claims = children;
        return parent;
      })
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** [ok] Table rows now always reload on global filter changes */
  readonly payRecRows$: Observable<PayRecEobRow[]> = combineLatest([
  this.rowsFromApi$,
  this.pmUiState$,
]).pipe(
  map(([eobs, ui]) => {
    return eobs
      // [ok] hide EOB + children once posted
      .filter(eob => !ui.hiddenEobIds.has(eob.eobId))
      .map(eob => {
        const claims = (eob.claims ?? []).map(c => {
          const key = this.claimKey(eob.eobId, c.claimId);
          return { ...c, pmPosted: ui.postedClaimIds.has(key) };
        });

        const allClaimsPosted = claims.length > 0 && claims.every(c => c.pmPosted);

        // EOB button "green" should represent readiness OR an explicit posted state?
        // Your requirement: EOB toggles green when clicked (and then disappears).
        // So while visible, we can show it green only AFTER click.
        // Since it disappears immediately on click, pmPosted doesn't matter much,
        // but we'll keep it red until click.
        return {
          ...eob,
          claims,
          pmPosted: false, // visible EOB is never "posted" because it disappears when posted
        };
      });
  }),
  shareReplay(1)
);

  isLoading: boolean;
  reconciliationGlobalSearch: string;
  filterValue: string;
  currentFilters: any;
  reconciliationTableFilterState = { global: '', columns: {} as any };

  selectedEobIds = new Set<string>();

  // Bank account selection for posting
  bankAccounts: BankAccountConnection[] = [];
  selectedBankAccountId: number | null = null;
  showBankAccountPicker = false;

  isSelected(eobId: string): boolean {
    return this.selectedEobIds.has(eobId);
  }

  toggleEobSelection(eobId: string): void {
    if (this.selectedEobIds.has(eobId)) {
      this.selectedEobIds.delete(eobId);
    } else {
      this.selectedEobIds.add(eobId);
    }
    this.cdr.markForCheck();
  }

  get selectedCount(): number {
    return this.selectedEobIds.size;
  }

  async postSelected(): Promise<void> {
    if (!this.selectedEobIds.size) return;
    const ids = [...this.selectedEobIds];
    const bankAccount = this.bankAccounts.find(a => a.id === this.selectedBankAccountId);
    const confirmed = await firstValueFrom(
      this.dialog.open(EraPostingConfirmDialogComponent, {
        width: '420px',
        data: { eobCount: ids.length, bankAccountName: bankAccount ? (bankAccount.nickname ?? bankAccount.bank_name) : undefined },
      }).afterClosed()
    );
    if (!confirmed) return;
    try {
      await firstValueFrom(this.reconIqService.bulkPostWithBank(ids, this.selectedBankAccountId ?? undefined));
      this.pmAction$.next({ type: 'bulk_posted', eobIds: ids });
      this.selectedEobIds = new Set<string>();
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PayRec] bulk post failed', err);
    }
  }

  async postAllReady(): Promise<void> {
    const rows = await firstValueFrom(this.payRecRows$);
    const ids = rows.filter(r => this.isEobReady(r)).map(r => r.eobId);
    if (!ids.length) return;
    const bankAccount = this.bankAccounts.find(a => a.id === this.selectedBankAccountId);
    const confirmed = await firstValueFrom(
      this.dialog.open(EraPostingConfirmDialogComponent, {
        width: '420px',
        data: { eobCount: ids.length, bankAccountName: bankAccount ? (bankAccount.nickname ?? bankAccount.bank_name) : undefined },
      }).afterClosed()
    );
    if (!confirmed) return;
    try {
      await firstValueFrom(this.reconIqService.bulkPostWithBank(ids, this.selectedBankAccountId ?? undefined));
      this.pmAction$.next({ type: 'bulk_posted', eobIds: ids });
      this.selectedEobIds = new Set([...this.selectedEobIds].filter(id => !ids.includes(id)));
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PayRec] post all ready failed', err);
    }
  }

  constructor(
    private readonly reconIqService: ReconIqService,
    private readonly reconIqWindow: ReconIqWindowService,
    private pdfService: PdfService,
    private cdr: ChangeDetectorRef,
    private globalFiltersStore: GlobalFiltersStore,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.reconIqService.getBankAccountConnections().subscribe({
      next: (r) => {
        this.bankAccounts = r.accounts.filter(a => a.is_active);
        if (this.bankAccounts.length === 1) this.selectedBankAccountId = this.bankAccounts[0].id;
        this.cdr.markForCheck();
      },
    });
  }

  onPayRecAction(e: { actionId: string; row: PayRecRow }): void {
    if (e.actionId !== 'manual-post') return;
    if (e.row.rowType !== 'eob') return;

    const clickedEobId = e.row.eobId;
    console.log('[PayRec] manual-post clicked \u2192 removing EOB (and nested claims)', clickedEobId);

    // this.removeRow$.next(clickedEobId);
  }

  // ---------- UI logic for PM button ----------

  isClaimPosted(row: PayRecRow): boolean {
    return row.rowType === 'claim' ? row.pmPosted : false;
  }

  isEobReady(row: PayRecRow): boolean {
    if (row.rowType !== 'eob') return false;
    return (row.claims ?? []).length > 0 && row.claims.every((c) => c.pmPosted);
  }

  isPmButtonDisabled(row: PayRecRow): boolean {
    if (row.rowType === 'claim') return false;
    return !this.isEobReady(row);
  }

  pmButtonClass(row: PayRecRow): string[] {
    const classes = ['pm-btn'];

    if (row.rowType === 'claim') {
      classes.push(row.pmPosted ? 'pm-btn--green' : 'pm-btn--red');
      if (row.pmPosted) classes.push('pm-btn--disabled');
      return classes;
    }

    const ready = this.isEobReady(row);
    classes.push(ready ? 'pm-btn--green' : 'pm-btn--red');
    if (!ready) classes.push('pm-btn--disabled');
    return classes;
  }

 onPmButtonClick(row: PayRecRow, event?: MouseEvent): void {
  event?.stopPropagation();

  if (row.rowType === 'claim') {
    // [ok] toggles red <-> green
    this.pmAction$.next({ type: 'claim_toggled', eobId: row.parentEobId, claimId: row.claimId });
    return;
  }

  // EOB: only works when all claims are green
  if (!this.isEobReady(row)) return;

  // [ok] now "posting" means removing the EOB + children from the table
  this.pmAction$.next({ type: 'eob_posted', eobId: row.eobId });
}


  private lastEobObjectUrl: string | null = null;

onViewEobClick(row: PayRecRow, event?: MouseEvent): void {
  console.debug('[PayRec] onViewEobClick', { rowType: row.rowType, row });
  event?.stopPropagation();
  if (row.rowType !== 'eob') return;

  //  Open/reuse the popup *synchronously* while we're still in the click stack
  this.reconIqWindow.open(
    'eob',
    'Recon-IQ \u2022 EOB Viewer',
    `<p style="padding:16px">Loading EOB PDF\u2026</p>`
  );

  void this.fetchPdfAndUpdateEobWindow(row as PayRecEobRow);
}

private async fetchPdfAndUpdateEobWindow(row: PayRecEobRow): Promise<void> {
  try {
    this.isLoading = true;
    const claimId = row.eobId;
    const html = await firstValueFrom(this.pdfService.getEobHtml(claimId));
    this.reconIqWindow.open('eob', 'Recon-IQ \u2022 EOB Viewer', html);
  } catch (err) {
    console.error('Failed to load EOB', err);
    this.reconIqWindow.open(
      'eob',
      'Recon-IQ \u2022 EOB Viewer',
      `<p style="padding:16px;color:#b91c1c">Failed to load EOB. Please try again.</p>`
    );
  } finally {
    this.isLoading = false;
    this.cdr.detectChanges();
  }
}


  onViewClaimClick(row: PayRecRow, event?: MouseEvent): void {
    event?.stopPropagation();
    if (row.rowType !== 'claim') return;
    const claimId = (row as PayRecClaimRow).claimId;

    this.reconIqWindow.open(
      'cms1500',
      `Recon-IQ \u2022 Claim ${claimId}`,
      `<p style="padding:16px">Loading claim\u2026</p>`
    );

    void this.fetchCms1500(claimId);
  }

  private async fetchCms1500(claimId: string): Promise<void> {
    try {
      const html = await firstValueFrom(this.reconIqService.getCms1500Html(claimId));
      this.reconIqWindow.open('cms1500', `Recon-IQ \u2022 Claim ${claimId}`, html);
    } catch (err) {
      console.error('[PayRec] Failed to load CMS 1500', err);
      this.reconIqWindow.open(
        'cms1500',
        `Recon-IQ \u2022 Claim ${claimId}`,
        `<p style="padding:16px;color:#b91c1c">Failed to load claim. Please try again.</p>`
      );
    }
  }

  getLocation(value: string): string {
    if (!value) return '';
    const idx = value.lastIndexOf(' / ');
    return idx >= 0 ? value.slice(0, idx).trim() : value;
  }

  getTaxId(value: string): string {
    if (!value) return '';
    const idx = value.lastIndexOf(' / ');
    return idx >= 0 ? value.slice(idx + 3).trim() : '';
  }

  onFiltersChange(next: PayRecFilters): void {
    console.log('[PayRec] filtersChange', next);
    this.pmAction$.next({ type: 'init', rows: [] } as any);
    this.filters$.next({ ...this.filters$.value, ...next });
  }

  onFiltersReset(): void {
    console.log('[PayRec] filtersReset');

    this.pmAction$.next({ type: 'init', rows: [] } as any);
    this.filters$.next({ eobId: '', amount: '', locationTaxId: '', date: '' });
    this.filtersForm$.next({ eobId: '', amount: '', locationTaxId: '', date: '' });
  }

  clearReconciliationSearch(): void {
    this.reconciliationGlobalSearch = '';
    this.cdr.markForCheck();
  }

  onReconciliationSearchChanged(value: string): void {
    const next = (value ?? '').toString();
    this.search$.next(next);
    this.cdr.markForCheck();
  }

  onFiltersChanged(f: PayRecFilters) {
    this.reconciliationTableFilterState = this.toReconciliationTableFilterState(f);
  }

  async exportCsv(): Promise<void> {
    const eobs = await firstValueFrom(this.payRecRows$);
    const rows: string[][] = [
      ['EOB ID', 'Date', 'Amount', 'Location / Tax ID', 'Claims w/ Money', 'Claims Zero Open', 'PM Posted'],
    ];
    for (const eob of eobs) {
      rows.push([eob.eobId, eob.date, eob.amount, eob.locationTaxId, String(eob.claimsWithMoney), String(eob.numberClaimsZeroOpen), eob.pmPosted ? 'Yes' : 'No']);
      for (const c of eob.claims ?? []) {
        rows.push([`  ${c.claimId}`, c.dateClaimSubmitted, String(c.claimAmountRaw), c.claimStatus, '', '', c.pmPosted ? 'Yes' : 'No']);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onFilterReset(): void {
    this.filtersForm$.next({
      eobId: '',
      date: '',
      amount: '',
      locationTaxId: '',
    });
    this.search$.next('');
    this.filters$.next({
      eobId: '',
      date: '',
      amount: '',
      locationTaxId: '',
    });
    this.showFilters = false;
    this.cdr.markForCheck();
  }

  applyFilter(value: string): void {
    this.filterValue = value;
    this.currentFilters = { ...this.currentFilters };
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  onReconciliationGlobalSearchInput(event: Event): void {
    this.reconciliationGlobalSearch = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  onReconciliationFiltersChanged(next: PayRecFilters): void {
    console.log('[PayRec] filtersChange', next);
    this.filtersForm$.next({
      ...this.filtersForm$.value,
      ...next,
    });
    this.filters$.next({
      ...this.filters$.value,
      ...next,
    });
    this.cdr.markForCheck();
  }

  private toReconciliationTableFilterState(f: PayRecFilters): TableFilterState {
    const mk = (value?: string) =>
      value?.toString().trim()
        ? { operator: 'contains', value: value.toString().trim() }
        : { operator: null, value: '', value2: '', selectedValues: [] };

    return {
      global: '',
      columns: {
        eobId: mk(f.eobId),
        date: mk(f.date),
        amount: mk(f.amount),
        locationTaxId: mk(f.locationTaxId),
      } as any,
    };
  }

  removeFilterChip(chip: FilterChip): void {
    const next = { ...this.filtersForm$.value, [chip.key]: '' } as PayRecFilters;
    this.filtersForm$.next(next);
    this.filters$.next(next);
    this.cdr.markForCheck();
  }

  onTableFilterStateChanged(state: TableFilterState): void {
    const col = (id: keyof PayRecFilters): string => {
      const s: any = (state?.columns as any)?.[id];
      const v = (s?.value ?? '').toString().trim();
      return s?.operator && v ? v : '';
    };

    const next: PayRecFilters = {
      eobId: col('eobId'),
      date: col('date'),
      amount: col('amount'),
      locationTaxId: col('locationTaxId'),
    };

    this.filtersForm$.next(next);

    console.log('[PayRec] synced table->form filters', next);

    this.cdr.markForCheck();
  }

  private splitLocationAndTaxId(locationName: string, taxId: string) {
    const locRaw = (locationName ?? '').trim();
    const taxRaw = (taxId ?? '').trim();

    if (taxRaw) return { location: locRaw, taxId: taxRaw };

    const m = locRaw.match(/^(.*?)(?:\s*-\s*)(\d{2}-\d{7})\s*$/);
    if (m) return { location: m[1].trim(), taxId: m[2].trim() };

    return { location: locRaw, taxId: '' };
  }
}
