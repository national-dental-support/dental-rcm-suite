// src/app/pages/analytics/ar/ar.component.ts
import { Component, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, Subject, of } from 'rxjs';
import { map, shareReplay, switchMap, take, takeUntil, skip, catchError } from 'rxjs/operators';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { GlobalFiltersValue } from '../../../shared/components/global-filters/global-filters.models';
import { CsvExportService } from '../../../core/services/csv-export.service';

import {
  FilterDialogConfig,
  FilterField,
  SelectField,
} from '../../../core/models/filter-dialog.model';
import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import { FilterDialogService } from '../../../shared/components/filter-dialog/filter-dialog.service';
import { ArDataService } from '../../../core/services/ar-data.service';
import { LocationsService } from '../../../core/services/ar-locations.service';
import {
  ArData,
  AgingDetail,
  ArSort,
  Filters,
  DateRange,
  ArTrendRow,
} from '../../../core/models/ar-types';

type Chip = { key: keyof Filters; label: string };
type AnyDateRange = Record<string, any>;
type TableBlock = {
  columns: {
    key: string;
    label?: string;
    type?: 'text' | 'number' | 'currency';
  }[];
  rows: Array<Record<string, any>>;
};

type ArView = ArData & {
  // newly-referenced but optional UI fields
  lastUpdated?: string | Date;
  deltaDaysInAR?: number;

  // optional sections added by the new UI
  specialtyData?: { details: any[] };
  daysInARByPractice?: TableBlock;
  breakdown?: TableBlock;
  distribution?: TableBlock;
};

type TrendWindow = '30d' | '60d' | '90d';

@Component({
    selector: 'app-ar',
    templateUrl: './ar.component.html',
    styleUrls: ['./ar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ARComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  // An "empty" Filters object that satisfies your type

  lastupdated = new Date();
  loadError = false;
  private readonly emptyFilters: Filters = {
    provider: [],
    practice_groups: [],
    location: [],
    date_of_service: {} as unknown as DateRange,
  };

  private readonly filters$ = new BehaviorSubject<Filters>(this.emptyFilters);
  private readonly sort$ = new BehaviorSubject<ArSort>({});
  private readonly trendWindow$ = new BehaviorSubject<TrendWindow>('90d');

  practiceGroupOptions: string[] = [];
  locationOptions: string[] = [];
  providerOptions: string[] = [];

  readonly data$: Observable<ArView | null> = combineLatest([
    this.filters$,
    this.sort$,
  ]).pipe(
    switchMap(([f, s]) => this.arData.fetch(f, s).pipe(
      catchError(() => {
        this.loadError = true;
        return of(null);
      }),
    )),
    map((d): ArView | null => {
      if (!d) return null;
      this.loadError = false;
      const anyD = d as any;
      const lastUpdated: Date | string = anyD?.lastUpdated ?? new Date();
      const avg = d?.averageDaysInAR;
      const prev = d?.priorYearAverageDaysInAR;

      const delta =
        avg != null && prev != null
          ? Math.round(((avg as number) - (prev as number)) * 10) / 10
          : undefined;

      return {
        ...(anyD as ArView),
        lastUpdated,
        deltaDaysInAR: delta,
      };
    }),
    shareReplay(1)
  );

  // #88: Aggregate Patient vs Insurance collections across breakdown rows
  readonly netCollectionSplit$: Observable<{ insurancePct: number | null; patientPct: number | null; }> = this.data$.pipe(
    map((d) => {
      const rows: any[] = (d as any)?.breakdown?.rows ?? [];
      if (!rows.length) return { insurancePct: null, patientPct: null };

      const totIns    = rows.reduce((s, r) => s + (r.insuranceCollections ?? 0), 0);
      const totPat    = rows.reduce((s, r) => s + (r.patientCollections ?? 0), 0);
      const totGross  = rows.reduce((s, r) => s + (r.grossCollections ?? 0), 0);
      const totProd   = rows.reduce((s, r) => s + (r.production ?? 0), 0);
      const totColAdj = rows.reduce((s, r) => s + (r.collectionAdjustment ?? 0), 0);
      const totProdAdj= rows.reduce((s, r) => s + (r.productionAdjustment ?? 0), 0);

      // Industry-standard net collection rate: collections / (production - adjustments)
      const netDenominator = totProd - totColAdj - totProdAdj;
      const insurancePct = netDenominator > 0
        ? Math.min(100, Math.round((totIns / netDenominator) * 1000) / 10)
        : null;

      // Patient share: patient collections as % of gross
      const patientPct = totGross > 0
        ? Math.round((totPat / totGross) * 1000) / 10
        : null;

      return { insurancePct, patientPct };
    }),
  );

  // derived AR Trends data based on window (30/60/90d)
  readonly trendDetails$: Observable<ArTrendRow[]> = combineLatest([
    this.data$,
    this.trendWindow$,
  ]).pipe(
    map(([data, win]) => {
      const details: ArTrendRow[] = (data?.trendsData?.details ??
        []) as ArTrendRow[];
      if (!details.length) return [];

      // Monthly data: convert the day window to a month count and slice
      // the most recent N months from whatever data the API returned.
      // A day-based cutoff anchored to today silently hides all data older
      // than that window (e.g. 2025 records when today is 2026).
      const monthCount = win === '30d' ? 1 : win === '60d' ? 2 : 3;
      const sorted = [...details].sort((a, b) => a.month.localeCompare(b.month));
      return sorted.slice(-monthCount);
    }),
    shareReplay(1)
  );

  readonly chips$: Observable<Chip[]> = this.filters$.pipe(
    map((f) => this.buildChips(f))
  );

  private static readonly fmtDays = (v: any): string =>
    v != null && !Number.isNaN(Number(v)) ? Number(v).toFixed(2) : '';

  readonly daysByPracticeColumns: AdvancedTableColumnConfig<any>[] = [
    { id: 'operations',  header: 'Practice',            type: 'text',   propertyPath: 'operations' },
    { id: 'currentYear', header: 'Days in AR (Past 12 Months)', type: 'number', propertyPath: 'currentYear',  displayFormatter: ARComponent.fmtDays },
    { id: 'previousYear',header: 'Days in AR (All Time)',       type: 'number', propertyPath: 'previousYear', displayFormatter: ARComponent.fmtDays },
  ];

  // #87: Net Collection Rate moved after adjustment columns so readers see
  // the inputs (Production Adj, Collection Adj) before the derived metric.
  readonly breakdownColumns: AdvancedTableColumnConfig<any>[] = [
    { id: 'practice',             header: 'Practice',              type: 'text',     propertyPath: 'practice' },
    { id: 'numCollections',       header: '# Collections',         type: 'number',   propertyPath: 'numCollections' },
    { id: 'insuranceBilled',      header: 'Insurance Billed',      type: 'number',   propertyPath: 'insuranceBilled' },
    { id: 'grossCollections',     header: 'Gross Collections',     type: 'currency', propertyPath: 'grossCollections' },
    { id: 'productionAdjustment', header: 'Production Adj.',       type: 'currency', propertyPath: 'productionAdjustment' },
    { id: 'collectionAdjustment', header: 'Collection Adj.',       type: 'currency', propertyPath: 'collectionAdjustment' },
    { id: 'refund',               header: 'Refund',                type: 'currency', propertyPath: 'refund' },
    // Net Collection Rate appears after all adjustment inputs (#87)
    { id: 'collectionRate',       header: 'Net Collection Rate',   type: 'number',   propertyPath: 'collectionRate', displayFormatter: (v: any) => v != null ? `${Number(v).toFixed(1)}%` : '' },
    // #88: Patient vs Insurance split columns
    { id: 'insuranceCollections', header: 'Insurance Collections', type: 'currency', propertyPath: 'insuranceCollections' },
    { id: 'patientCollections',   header: 'Patient Collections',   type: 'currency', propertyPath: 'patientCollections' },
  ];

  readonly distributionColumns: AdvancedTableColumnConfig<any>[] = [
    { id: 'agingBracket',       header: 'Age Bucket',              type: 'text',     propertyPath: 'agingBracket' },
    { id: 'numAccts0_1000',     header: '# Accts $0\u2013$1,000',       type: 'number',   propertyPath: 'numAccts0_1000' },
    { id: 'arBalance0_1000',    header: 'AR $0\u2013$1,000',            type: 'currency', propertyPath: 'arBalance0_1000' },
    { id: 'numAccts1001_2000',  header: '# Accts $1,001\u2013$2,000',   type: 'number',   propertyPath: 'numAccts1001_2000' },
    { id: 'arBalance1001_2000', header: 'AR $1,001\u2013$2,000',        type: 'currency', propertyPath: 'arBalance1001_2000' },
    { id: 'numAcctsGT2000',     header: '# Accts > $2,000',        type: 'number',   propertyPath: 'numAcctsGT2000' },
    { id: 'arBalanceGT2000',    header: 'AR > $2,000',             type: 'currency', propertyPath: 'arBalanceGT2000' },
    { id: 'totalAccts',         header: 'Total # Accts',           type: 'number',
      accessor: (r: any) => (r.numAccts0_1000 ?? 0) + (r.numAccts1001_2000 ?? 0) + (r.numAcctsGT2000 ?? 0) },
    { id: 'totalAR',            header: 'Total AR',                type: 'currency',
      accessor: (r: any) => (r.arBalance0_1000 ?? 0) + (r.arBalance1001_2000 ?? 0) + (r.arBalanceGT2000 ?? 0) },
  ];

  constructor(
    private arData: ArDataService,
    private locations: LocationsService,
    private filterDialog: FilterDialogService,
    private csvExport: CsvExportService,
    private globalFiltersStore: GlobalFiltersStore,
  ) {}

  // ---------------- Lifecycle ----------------

  ngOnInit(): void {
    // Apply initial global filters
    this.applyGlobalFilters(this.globalFiltersStore.value);

    // React to future global filter changes
    this.globalFiltersStore.applied$.pipe(
      skip(1),
      takeUntil(this.destroy$),
    ).subscribe(gf => this.applyGlobalFilters(gf));

    // load practice groups + locations (lookup endpoint)
    this.locations.fetch([]).subscribe((res) => {
      this.practiceGroupOptions = res.practiceGroups ?? [];
      this.locationOptions = res.locations ?? [];
    });

    // whenever filters change, refresh provider options
    this.filters$.pipe(takeUntil(this.destroy$)).subscribe((f) => {
      this.locations.fetchProviders(f).subscribe((providers) => {
        this.providerOptions = providers ?? [];
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private applyGlobalFilters(gf: GlobalFiltersValue): void {
    const loc = gf.location;
    const patch: Partial<Filters> = {
      provider:        gf.providers.length ? gf.providers : [],
      practice_groups: loc.scope === 'group'    ? (loc as any).groups
                     : loc.scope === 'practice' ? (loc as any).practices
                     : [],
      location:        loc.scope === 'location' ? (loc as any).locations : [],
      payer:           gf.payers.length ? gf.payers : undefined,
    };
    patch.date_of_service = {
      start_date: gf.startDate ? gf.startDate.toISOString().slice(0, 10) : '',
      end_date:   gf.endDate   ? gf.endDate.toISOString().slice(0, 10)   : '',
    };
    this.filters$.next({ ...this.emptyFilters, ...patch });
  }

   get formattedLastUpdated(): string {
  const d = this.lastupdated;

  const datePart = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(d)
    .replace('AM', 'a.m.')
    .replace('PM', 'p.m.');

  const tzPart = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'long',
  })
    .formatToParts(d)
    .find(p => p.type === 'timeZoneName')?.value ?? '';

  return `${datePart} \u00B7 ${timePart} ${tzPart}`;
}
  // ---------------- UI handlers ----------------

  openFilterDialog(): void {
    this.openFilters();
  }

  onTrendWindowChange(value: TrendWindow) {
    if (!value) return;
    this.trendWindow$.next(value);
  }

  resetAll() {
    this.filters$.next(this.emptyFilters);
  }

  reload(): void {
    this.loadError = false;
    const current = this.filters$.value;
    this.filters$.next({ ...current });
  }

  removeChip(chip: Chip) {
    const f = { ...this.filters$.value } as any;
    delete f[chip.key];
    this.filters$.next({ ...this.emptyFilters, ...f });
  }

  navigateToSourceData() {
    console.log('View Table clicked', this.filters$.value);
  }

  exportTable(block: TableBlock | null | undefined, filename: string): void {
    if (!block || !block.rows?.length) return;

    const cols = block.columns || [];
    const headers = cols.map((c) =>
      (c.label || c.key).replace(/"/g, '""')
    );

    const csvRows: string[] = [];
    csvRows.push(headers.join(','));

    for (const row of block.rows) {
      const cells = cols.map((c) => {
        const value = row[c.key];
        if (value == null) return '';

        if (typeof value === 'number') {
          return String(value);
        }

        const s = String(value).replace(/"/g, '""');
        return `"${s}"`;
      });
      csvRows.push(cells.join(','));
    }

    const blob = new Blob([csvRows.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportDaysInARByPractice(): void {
  this.data$.pipe(take(1)).subscribe((data) => {
    if (!data) return;
    this.exportTable(
      data.daysInARByPractice as TableBlock,
      'days-in-ar-by-practice.csv'
    );
  });
}

exportBreakdown(): void {
  this.data$.pipe(take(1)).subscribe((data) => {
    if (!data) return;
    this.exportTable(
      data.breakdown as TableBlock,
      'ar-collections-breakdown.csv'
    );
  });
}

exportDistribution(): void {
  this.data$.pipe(take(1)).subscribe((data) => {
    if (!data) return;
    this.exportTable(
      data.distribution as TableBlock,
      'ar-distribution.csv'
    );
  });
}

exportTrends(): void {
  this.trendDetails$.pipe(take(1)).subscribe((rows) => {
    if (!rows?.length) return;
    const csvRows = rows.map(r => [r.month, r.total_0_30, r.total_31_60, r.total_61_90, r.total_over_90]);
    this.csvExport.download(
      `ar-trends_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Month', '0\u201330 Days', '31\u201360 Days', '61\u201390 Days', 'Over 90 Days'],
      csvRows,
    );
  });
}
  // ---------------- Filters dialog ----------------

  private openFilters(): void {
    const cur = this.filters$.value;

    const toArray = (v: string[] | undefined) =>
      Array.isArray(v) ? v : [];

    const fields: FilterField[] = [
      <SelectField<string>>{
        key: 'practice_groups',
        label: 'Practice Group',
        type: 'multiselect',
        allowClear: true,
        options: () =>
          this.practiceGroupOptions.map((v) => ({
            label: v,
            value: v,
          })),
      },
      <SelectField<string>>{
        key: 'location',
        label: 'Location',
        type: 'multiselect',
        allowClear: true,
        options: () =>
          this.locationOptions.map((v) => ({
            label: v,
            value: v,
          })),
      },
      <SelectField<string>>{
        key: 'provider',
        label: 'Provider',
        type: 'multiselect',
        allowClear: true,
        options: () =>
          this.providerOptions.map((v) => ({
            label: v,
            value: v,
          })),
      },
      {
        key: 'date_of_service',
        label: 'Date of Service',
        type: 'date-range',
        span: 8,
      },
    ];

    const config: FilterDialogConfig = {
      title: 'Filters',
      fields,
      gridColumns: 12,
      initial: {
        practice_groups: toArray(cur.practice_groups),
        location: toArray(cur.location),
        provider: toArray(cur.provider),
        date_of_service: {
          start: cur.date_of_service?.start_date
            ? new Date(cur.date_of_service.start_date)
            : null,
          end: cur.date_of_service?.end_date
            ? new Date(cur.date_of_service.end_date)
            : null,
        },
      },
      labels: { apply: 'Apply', cancel: 'Cancel', reset: 'Reset' },
    };

    this.filterDialog.open(config).subscribe((out) => {
      if (!out) return;

      if (out === 'reset') {
        this.filters$.next(this.emptyFilters);
        return;
      }

      const v = (out as any).values ?? {};

      const asMany = (arr: any): string[] =>
        Array.isArray(arr) ? (arr as string[]) : [];

      this.filters$.next({
        provider: asMany(v.provider),
        practice_groups: asMany(v.practice_groups),
        location: asMany(v.location),
        date_of_service: {
          start_date: v.date_of_service?.start ?? '',
          end_date: v.date_of_service?.end ?? '',
        },
      });
    });
  }

  // ---------------- Helpers ----------------

  hasValidAging(details: AgingDetail[]): boolean {
    if (!Array.isArray(details)) return false;

    return details.some((d) => {
      const raw = (d as any)?.value;
      const v = typeof raw === 'string' ? Number(raw) : raw;
      return v != null && !Number.isNaN(v) && v !== 0;
    });
  }

  private buildChips(f: Filters): Chip[] {
    const chips: Chip[] = [];
    if (f.practice_groups?.length)
      chips.push({
        key: 'practice_groups',
        label: `PG: ${f.practice_groups.length}`,
      });
    if (f.location?.length)
      chips.push({ key: 'location', label: `Loc: ${f.location.length}` });
    if (f.provider?.length)
      chips.push({ key: 'provider', label: `Prov: ${f.provider.length}` });

    const s = this.getRangeStart(f.date_of_service);
    const e = this.getRangeEnd(f.date_of_service);
    if (s || e) {
      const sTxt = s ? new Date(s).toLocaleDateString() : '\u2014';
      const eTxt = e ? new Date(e).toLocaleDateString() : '\u2014';
      chips.push({
        key: 'date_of_service',
        label: `Date ${sTxt} \u2192 ${eTxt}`,
      });
    }
    return chips;
  }

  private getRangeStart(r: AnyDateRange | null | undefined) {
    if (!r) return null;
    return r.start ?? r.from ?? r.start_date ?? null;
  }

  private getRangeEnd(r: AnyDateRange | null | undefined) {
    if (!r) return null;
    return r.end ?? r.to ?? r.end_date ?? null;
  }

}
