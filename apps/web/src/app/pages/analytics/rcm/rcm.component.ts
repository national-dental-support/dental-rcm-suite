import {ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  combineLatest,
  firstValueFrom,
  forkJoin,
  map,
  of,
  shareReplay,
  skip,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { GlobalFiltersValue } from '../../../shared/components/global-filters/global-filters.models';
import { FormBuilder, FormGroup } from '@angular/forms';

import { MatSort, Sort } from '@angular/material/sort';
import {
  DateRange,
  Filters,
  ManyOrAll,
  RcmRecord,
  SortState,
} from '../../../core/models/rcm.models';
import { RcmService } from '../../../core/services/rcm.service';
import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';

/** Reusable filter-dialog types + component */
import {
  FilterDialogConfig,
  FilterDialogResult,
  FilterField,
  SelectField,
} from '../../../core/models/filter-dialog.model';
import { FilterDialogComponent } from '../../../shared/components/filter-dialog/filter-dialog.component';

import {
  ClaimValueByStatusDto,
  ClaimAmountsByPracticeDto,
  CollectionAdjustmentTrendDto,
  ClaimAmountsByPayerDto,
  ClaimValuesByTypeDto,
  ClaimsCountByLocationGroupDto,
  RcmLookups
} from '../../../core/models/rcm.models';

import {
  ApexAxisChartSeries,
  ApexChart,
  ApexPlotOptions,
  ApexDataLabels,
  ApexXAxis,
  ApexYAxis,
  ApexGrid,
  ApexLegend,
  ApexStroke,
  ApexTooltip
} from 'ng-apexcharts';
import { HorizontalBarDatum } from '../../../shared/components/horizontal-bar-chart/horizontal-bar-chart.component';
import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import ExcelJS from 'exceljs';
import { ThemeService } from '../../../core/services/theme.service';

type DisplayRow = {
  id?: number | string;
  location: string;
  name?: string;
  charges: number;
  insuranceSubmitted: number;
  netCollections: number;
  adjustments: number;
  outstandingBalance: number;
  netCollectionPct: number | null;
  refunds: number;
  subRows?: DisplayRow[];
  _expanded?: boolean;
};

export type RcmChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  plotOptions?: ApexPlotOptions;
  dataLabels?: ApexDataLabels;
  xaxis?: ApexXAxis;
  yaxis?: ApexYAxis | ApexYAxis[];
  grid?: ApexGrid;
  legend?: ApexLegend;
  stroke?: ApexStroke;
  tooltip?: ApexTooltip;
};

@Component({
    selector: 'app-rcm',
    templateUrl: './rcm.component.html',
    styleUrls: ['./rcm.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RcmComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  expandedRowId: number | string | null = null;
  expandedRow: any | null = null;
  isDetailRow = (_index: number, row: any) => row.id === this.expandedRowId;
  pageIndex = 0;
  pageSize = 25;

  private page$ = new BehaviorSubject<number>(this.pageIndex);
  private pageSize$ = new BehaviorSubject<number>(this.pageSize);

  /** ====== Filters form (kept as-is for the API layer) ====== */
  form: FormGroup = this.fb.group({
    provider: <ManyOrAll>'all',
    practice_groups: <ManyOrAll>'all',
    location: <ManyOrAll>'all',
    date_of_service: <DateRange>{ start_date: '', end_date: '' },
    payer: <ManyOrAll>'all',
  });

  /** Seed the filters stream with valid defaults (avoid {} typing errors) */
  private appliedFilters$ = new BehaviorSubject<Filters>({
    provider: 'all',
    practice_groups: 'all',
    location: 'all',
    date_of_service: { start_date: '', end_date: '' },
  });

  /** Sort state */
  private sort$ = new BehaviorSubject<SortState>({ column: '', direction: 'desc' });

  isLoading$ = new BehaviorSubject<boolean>(false);

  // ---------- lookups ----------
  lookups$: Observable<RcmLookups> = this.appliedFilters$.pipe(
    switchMap((f) =>
      this.rcm.getLookups(f.practice_groups ?? 'all').pipe(
        catchError((err) => {
          console.error('[RCM] lookups failed', err);
          return of({ providers: [], practiceGroups: [], locations: [] });
        })
      )
    ),
    shareReplay(1)
  );

  providers$ = this.lookups$.pipe(map((x) => x.providers ?? []));
  practiceGroups$ = this.lookups$.pipe(map((x) => x.practiceGroups ?? []));
  locations$ = this.lookups$.pipe(map((x) => x.locations ?? []));
claimValueByStatus$ = this.appliedFilters$.pipe(
  switchMap((filters) => this.rcm.getClaimValueByStatus(filters)),
  shareReplay(1)
);

claimAmountsByPractice$ = this.appliedFilters$.pipe(
  switchMap((filters) => this.rcm.getClaimAmountsByPractice(filters)),
  shareReplay(1)
);

collectionAdjustmentTrends$ = this.appliedFilters$.pipe(
  switchMap((filters) => this.rcm.getCollectionAdjustmentTrends(filters)),
  shareReplay(1)
);

claimAmountsByPayer$ = this.appliedFilters$.pipe(
  switchMap((filters) => this.rcm.getClaimAmountsByPayer(filters)),
  shareReplay(1)
);

claimValuesByType$ = this.appliedFilters$.pipe(
  switchMap((filters) => this.rcm.getClaimValuesByType(filters)),
  shareReplay(1)
);
  // ---------- open reusable Filter Dialog ----------
  async openFilterDialog(): Promise<void> {
    const [providers, practiceGroups, locations] = await firstValueFrom(
      combineLatest([this.providers$, this.practiceGroups$, this.locations$]).pipe(
        take(1)
      )
    );

    const current = this.form.getRawValue();

    const toArray = (v: any) => (Array.isArray(v) ? v : (v === 'all' || v == null ? [] : [v]));

    // Build FilterField[] for the generic dialog
    const fields: FilterField[] = [
  {
    key: 'practice_groups', label: 'Practice Group', type: 'multiselect', allowClear: true,
    options: () => this.toSelectOptions(practiceGroups),
  } as SelectField<string>,
  {
    key: 'location', label: 'Location', type: 'multiselect', allowClear: true,
    options: () => this.toSelectOptions(locations),
  } as SelectField<string>,
  {
    key: 'provider', label: 'Provider', type: 'multiselect', allowClear: true,
    options: () => this.toSelectOptions(providers),
  } as SelectField<string>,

  //  this is the key to alignment: give the date-range 8 columns
  { key: 'date_of_service', label: 'Date of Service', type: 'date-range', span: 8 },
];


    // Initial values for the dialog (convert to {start, end})
    const ds = current.date_of_service ?? { start_date: '', end_date: '' };

const config: FilterDialogConfig = {
  title: 'Filters',
  fields,
  initial: {
    practice_groups: toArray(current.practice_groups),
    location: toArray(current.location),
    provider: toArray(current.provider),
    date_of_service: {
      start: ds.start_date ? new Date(ds.start_date) : null,
      end:   ds.end_date   ? new Date(ds.end_date)   : null,
    },
    // [blocked] removed payment_received
  },
  gridColumns: 12,
  labels: { apply: 'Apply', cancel: 'Cancel', reset: 'Reset' },
};

    const ref = this.dialog.open<FilterDialogComponent, FilterDialogConfig, FilterDialogResult>(
      FilterDialogComponent,
      {
        width: '900px',
        data: config,
        autoFocus: false,
        restoreFocus: false,
      }
    );

    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;

    const v = result.values ?? {};

    // Map dialog result back to our RCM form model
    this.form.patchValue({
      practice_groups: this.toStringArray(v.practice_groups),
      location:        this.toStringArray(v.location),
      provider:        this.toStringArray(v.provider),
      date_of_service: {
        start_date: v.date_of_service?.start ?? '',
        end_date:   v.date_of_service?.end   ?? '',
      },
    });

    this.applyFilters();
  }

  // ---------- KPIs ----------
  kpis$ = this.appliedFilters$.pipe(
    tap(() => this.isLoading$.next(true)),
    switchMap((filters) =>
      forkJoin({
        claims: this.rcm.getClaimsCount(filters),
        gp: this.rcm.getGrossProduction(filters),
        cr: this.rcm.getCollectionRate(filters),
      })
    ),
    tap(() => this.isLoading$.next(false)),
    shareReplay(1)
  );

// ---- Claims KPI (matches { months, trend, latestCount }) ----
claimsCount$ = this.kpis$.pipe(
  map((k) => {
    const c: any = k.claims ?? {};
    return c.latestCount ?? null;
  })
);

claimsMonths$ = this.kpis$.pipe(
  map((k) => {
    const c: any = k.claims ?? {};
    return (c.months ?? []) as Array<{ month: string; count: number }>;
  })
);

claimsTrend$ = this.kpis$.pipe(
  map((k) => {
    const c: any = k.claims ?? {};
    return (c.trend ?? 'flat') as 'up' | 'down' | 'flat';
  })
);

// ---- Gross Production KPI (matches { months, trend, latestAmount }) ----
grossProduction$ = this.kpis$.pipe(
  map((k) => {
    const gp: any = k.gp ?? {};
    return gp.latestAmount ?? null;
  })
);

grossProductionMonths$ = this.kpis$.pipe(
  map((k) => {
    const gp: any = k.gp ?? {};
    return (gp.months ?? []) as Array<{ month: string; amount: number }>;
  })
);

grossProductionTrend$ = this.kpis$.pipe(
  map((k) => {
    const gp: any = k.gp ?? {};
    return (gp.trend ?? 'flat') as 'up' | 'down' | 'flat';
  })
);

// ---- Closed Claim Collection Rate KPI (matches { months, trend, latestRate }) ----
collectionRate$ = this.kpis$.pipe(
  map((k) => {
    const cr: any = k.cr ?? {};
    return cr.latestRate ?? null;
  })
);

closedClaimMonths$ = this.kpis$.pipe(
  map((k) => {
    const cr: any = k.cr ?? {};
    return (cr.months ?? []) as Array<{ month: string; rate: number | null }>;
  })
);

closedClaimTrend$ = this.kpis$.pipe(
  map((k) => {
    const cr: any = k.cr ?? {};
    return (cr.trend ?? 'flat') as 'up' | 'down' | 'flat';
  })
);

  // ---------- Table ----------
  private tableResp$ = combineLatest([this.appliedFilters$, this.sort$, this.page$, this.pageSize$]).pipe(
    tap(() => this.isLoading$.next(true)),
    switchMap(([filters, sort, page, pageSize]) =>
      this.rcm.getRevenueByPractice(filters, sort, page, pageSize)
    ),
    tap(() => this.isLoading$.next(false)),
    shareReplay(1)
  );

  table$ = this.tableResp$.pipe(
  map((res: any) => {
    const rows = Array.isArray(res)
      ? res
      : res?.data ?? res?.rows ?? [];
    return this.toDisplayRows(rows);
  }),
);

totalRows$ = this.tableResp$.pipe(
  map((res: any) => {
    if (Array.isArray(res)) {
      return res.length;
    }
    return (
      res?.pagination?.totalRecords ??
      res?.totalRows ??
      (res?.data?.length ?? 0)
    );
  })
);

  /** TrackBy used in the template */
  trackById = (_: number, r: DisplayRow) => r.id ?? r.location;

 private money = (v: any) => (Number(v) || 0);
private pct = (v: any) => (Number(v) || 0);

columns: AdvancedTableColumnConfig<DisplayRow>[] = [
  {
    id: 'location',
    header: 'Practice/Provider',
    type: 'text',
    sortable: true,
    filterable: true,
    width: '220px',
    accessor: (r) => r.location || '\u2014',
    filterConfig: {
      supportsValueList: true,
      supportsGroupValues: false,
    },
  },
  {
    id: 'charges',
    header: 'Charges',
    type: 'number',
    sortable: true,
    align: 'end',
    displayFormatter: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.money(v)),
    accessor: (r) => r.charges,
  },
  {
    id: 'insuranceSubmitted',
    header: 'Insurance Submitted',
    type: 'number',
    sortable: true,
    align: 'end',
    displayFormatter: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.money(v)),
    accessor: (r) => r.insuranceSubmitted,
  },
  {
    id: 'netCollections',
    header: 'Net Collections',
    type: 'number',
    sortable: true,
    align: 'end',
    displayFormatter: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.money(v)),
    accessor: (r) => r.netCollections,
  },
  {
    id: 'adjustments',
    header: 'Adjustments',
    type: 'number',
    sortable: true,
    align: 'end',
    displayFormatter: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.money(v)),
    accessor: (r) => r.adjustments,
  },
  {
    id: 'outstandingBalance',
    header: 'Outstanding Balance',
    type: 'number',
    sortable: true,
    align: 'end',
    displayFormatter: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.money(v)),
    accessor: (r) => r.outstandingBalance,
  },
  {
    id: 'netCollectionPct',
    header: 'Net Collection %',
    type: 'number',
    sortable: true,
    align: 'end',
    displayFormatter: (v) => v == null ? '\u2014' : `${this.pct(v).toFixed(2)}%`,
    accessor: (r) => r.netCollectionPct,
  },
  {
    id: 'refunds',
    header: 'Refunds',
    type: 'number',
    sortable: true,
    align: 'end',
    displayFormatter: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.money(v)),
    accessor: (r) => r.refunds,
  },
];

// If you already have defaultSort elsewhere, keep yours and delete this.
// defaultSort = { active: 'charges', direction: 'desc' as const };

// Child rows live under `row.children` (matches your toDisplayRows() output)
childrenAccessor = (row: any) => (Array.isArray(row?.subRows) ? row.subRows : []);

// Optional perf shortcut (advanced-table uses this if provided)
hasChildrenAccessor = (row: any) => (row?.subRows?.length ?? 0) > 0;

// Hook this to your existing export logic

  // -- Theme ------------------------------------------------------
  /** Primary chart color sourced from ThemeService */
  readonly primaryColor$ = this.themeService.primaryColor$;
  /** All 5 chart colors - used for multi-series charts */
  readonly chartColors$ = this.themeService.chartColors$;

// 1) Horizontal bar (Claim Amounts, Claim Value by Status, etc.)
public horizontalBarBase: Partial<RcmChartOptions> = {
  chart: {
    type: 'bar',
    toolbar: { show: false },
    height: 280
  },
  plotOptions: {
    bar: {
      horizontal: true,
      barHeight: '45%',
      borderRadius: 6,
      dataLabels: {
        position: 'center'
      }
    }
  },
  dataLabels: {
    enabled: true,
    style: {
      fontSize: '11px',
      fontWeight: '700'
    },
    formatter: (val: any) => {
      const n = Number(val) || 0;
      if (!n) return '';
      if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
      if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
      return `$${n.toFixed(0)}`;
    }
  },
  grid: {
    borderColor: '#E5E7EB',
    xaxis: { lines: { show: true } },
    yaxis: { lines: { show: false } }
  },
  xaxis: {
    labels: {
      style: {
        fontSize: '11px',
        colors: '#9CA3AF'
      }
    },
    axisBorder: { show: false },
    axisTicks: { show: false }
  },
  yaxis: {
    labels: {
      style: {
        fontSize: '12px',
        fontWeight: 600,
        colors: '#4B5563'
      }
    }
  },
  legend: { show: false },
  tooltip: {
    y: {
      formatter: (val: any) => {
        const n = Number(val) || 0;
        return n.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        });
      }
    }
  }
};

// 2) Combo chart for Collection & Adjustment Trends
public collectionTrendOptions: Partial<RcmChartOptions> = {
  chart: {
    type: 'line',
    height: 280,
    toolbar: { show: false }
  },
  stroke: {
    width: [0, 0, 3],
    curve: 'smooth'
  },
  plotOptions: {
    bar: {
      columnWidth: '45%',
      borderRadius: 4
    }
  },
  dataLabels: {
    enabled: false
  },
  legend: {
    position: 'top',
    horizontalAlign: 'left',
    fontSize: '11px',
    markers: { radius: 4 }
  },
  grid: {
    borderColor: '#E5E7EB',
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } }
  },
  xaxis: {
    type: 'category',
    labels: {
      style: {
        fontSize: '11px',
        colors: '#9CA3AF'
      }
    },
    axisBorder: { show: false },
    axisTicks: { show: false }
  },
  yaxis: [
    {
      seriesName: 'Collections',
      title: { text: 'Collections / Adjustments' },
      labels: {
        formatter: (val: any) => {
          const n = Number(val) || 0;
          if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
          if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
          return `$${n.toFixed(0)}`;
        },
        style: { fontSize: '10px', colors: '#9CA3AF' }
      }
    },
    {
      seriesName: 'Collections',
      show: false,
    },
    {
      seriesName: 'Collection Rate',
      opposite: true,
      min: 0,
      max: 100,
      title: { text: 'Collection Rate' },
      labels: {
        formatter: (val: any) => `${(Number(val) || 0).toFixed(0)}%`,
        style: { fontSize: '10px', colors: '#9CA3AF' }
      }
    }
  ]
};

claimAmountsByPracticeHBar$ = this.claimAmountsByPractice$.pipe(
  map(rows =>
    (rows ?? []).map(r => ({
      label: r.Practice ?? r.Practice ?? r.Practice ?? 'Unknown',
      value: Number(
        r.TotalClaimAmount ??
        r.TotalClaimAmount ??
        r.TotalClaimAmount ??
        r.TotalClaimAmount ??
        0
      )
    })) as HorizontalBarDatum[]
  )
);

claimAmountsByPayerHBar$ = this.claimAmountsByPayer$.pipe(
  map(rows =>
    (rows ?? []).map(r => ({
      label: r.Payer ?? r.Payer ?? r.Payer ?? 'Unknown',
      value: Number(
        r.TotalClaimAmount ??
        r.TotalClaimAmount ??
        r.TotalClaimAmount ??
        r.TotalClaimAmount ??
        0
      )
    })) as HorizontalBarDatum[]
  )
);

  @ViewChild(MatSort) matSort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private rcm: RcmService,
    private dialog: MatDialog,
    private globalFiltersStore: GlobalFiltersStore,
    private cdr: ChangeDetectorRef,
    readonly themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    // Apply initial global filters then seed the first fetch
    this.applyGlobalFilters(this.globalFiltersStore.value);

    // React to future global filter changes
    this.globalFiltersStore.applied$.pipe(
      skip(1),
      takeUntil(this.destroy$),
    ).subscribe(gf => this.applyGlobalFilters(gf));
  }

  private applyGlobalFilters(gf: GlobalFiltersValue): void {
    const loc = gf.location;
    let practiceGroups: string[] | 'all' = 'all';
    let locations: string[] | 'all' = 'all';

    if (loc.scope === 'group') {
      // Cascade group names -> child practice names so backend can resolve via LocationNameMapping
      const groupsData = this.globalFiltersStore.options.groupsData ?? [];
      const practiceNames = (loc as any).groups.flatMap((gName: string) => {
        const g = groupsData.find((x: any) => x.name === gName);
        return g ? g.practices.map((p: any) => p.name as string) : [];
      });
      practiceGroups = practiceNames.length ? practiceNames : 'all';
    } else if (loc.scope === 'practice') {
      practiceGroups = (loc as any).practices;
    } else if (loc.scope === 'location') {
      locations = (loc as any).locations;
    }

    this.form.patchValue({
      provider:        gf.providers.length ? gf.providers : 'all',
      practice_groups: practiceGroups,
      location:        locations,
      payer:           gf.payers.length ? gf.payers : 'all',
      date_of_service: (gf.startDate || gf.endDate) ? {
        start_date: gf.startDate ? gf.startDate.toISOString().slice(0, 10) : '',
        end_date:   gf.endDate   ? gf.endDate.toISOString().slice(0, 10)   : '',
      } : { start_date: '', end_date: '' },
    });
    this.applyFilters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------- UI actions ----------
  applyFilters(): void {
    const f = this.buildFiltersFromForm();
    this.appliedFilters$.next(f);
    this.cdr.detectChanges();
  }

  resetAll(): void {
    this.form.reset({
      provider: 'all',
      practice_groups: 'all',
      location: 'all',
      date_of_service: { start_date: '', end_date: '' },
    });
    this.applyFilters();
  }

  chips$ = this.appliedFilters$.pipe(map((f) => this.getFilterChips(f)));

  removeChip(key: keyof Filters, label: string): void {
    const value = this.form.get(key as string)?.value as ManyOrAll | DateRange | undefined;

    if (key === 'date_of_service') {
      this.form.patchValue({ [key]: { start_date: '', end_date: '' } });
    } else if (Array.isArray(value)) {
      const next = value.filter((v) => v !== label);
      this.form.patchValue({ [key]: next.length ? next : [] });
    } else {
      this.form.patchValue({ [key]: [] });
    }
    this.applyFilters();
  }

  onSortChange(sort: Sort): void {
    const column = sort.active ?? '';
    const direction = (sort.direction || 'asc') as 'asc' | 'desc';
    this.sort$.next({ column, direction });
  }

  // ---------- Helpers ----------

  currencyKFormatter = (val: number) => {
  if (val == null || isNaN(val)) return '';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
};

currencyFullFormatter = (val: number) => {
  if (val == null || isNaN(val)) return '';
  return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

percentFormatter = (val: number) => {
  if (val == null || isNaN(val)) return '';
  return `${val.toFixed(0)}%`;
};

// Used by the Collection & Adjustment Trends combo chart
collectionAdjustmentTooltip = {
  shared: true,
  intersect: false,
  y: {
    formatter: (value: number, opts: any) => {
      const seriesIndex = opts.seriesIndex;
      // series index 2 is the line: Collection Rate (%)
      if (seriesIndex === 2) {
        return this.percentFormatter(value);
      }
      // series 0 & 1 are money
      return this.currencyFullFormatter(value);
    }
  }
};


  hasChildren = (row: DisplayRow) =>
    Array.isArray(row?.subRows) && row.subRows.length > 0;

  childrenOf = (row: DisplayRow) => (row?.subRows ?? []) as DisplayRow[];

  toggleExpand(row: DisplayRow): void {
    if (!this.hasChildren(row)) return;
    this.expandedRowId = this.expandedRowId === row.id ? null : (row.id ?? null);
  }

 private buildFiltersFromForm(): Filters {
  const raw = this.form.getRawValue() as any;
  return {
    provider:        this.toManyOrAll(raw.provider),
    practice_groups: this.toManyOrAll(raw.practice_groups),
    location:        this.toManyOrAll(raw.location),
    payer:           this.toManyOrAll(raw.payer),
    date_of_service: raw.date_of_service ?? { start_date: '', end_date: '' },
  };
}

  private toDisplayRows(rows: any[]): DisplayRow[] {
  const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const toNumOrNull = (v: any): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;

  return (rows ?? []).map((r: any) => {
    const practice = r.Practice ?? r.practice ?? r.location;

    return {
      id: r.id ?? practice,
      location: this.toTitleCase(practice),
      charges: toNum(r.Charges ?? r.charges ?? r.TotalGrossProduction ?? r.totalGrossProduction),
      insuranceSubmitted: toNum(r.InsuranceSubmitted ?? r.insuranceSubmitted ?? r.InsuranceBilled ?? r.insuranceBilled),
      netCollections: toNum(r.NetCollections ?? r.netCollections ?? r.GrossCollections ?? r.grossCollections),
      adjustments: toNum(r.Adjustments ?? r.adjustments ?? r.CollectionAdjustment ?? r.collectionAdjustment),
      outstandingBalance: toNum(r.OutstandingBalance ?? r.outstandingBalance),
      netCollectionPct: toNumOrNull(r.NetCollectionPct ?? r.netCollectionPct ?? r.CollectionRate ?? r.collectionRate),
      refunds: toNum(r.Refunds ?? r.refunds ?? r.Refund ?? r.refund),
      subRows: [],
    };
  });
}

  private toTitleCase(str: string): string {
    return (str ?? '').toUpperCase();
  }

 private getFilterChips(f: Filters) {
  const chips: { key: keyof Filters; label: string }[] = [];
  const pushMany = (key: keyof Filters, val?: 'all' | string[]) => {
    if (Array.isArray(val) && val.length) {
      val.forEach(x => chips.push({ key, label: x }));
    }
  };
  pushMany('practice_groups', f.practice_groups);
  pushMany('location',        f.location);
  pushMany('provider',        f.provider);

  const ds = f.date_of_service;
  if (ds?.start_date || ds?.end_date) {
    chips.push({ key: 'date_of_service', label: `${ds.start_date ?? ''} \u2014 ${ds.end_date ?? ''}` });
  }
  return chips;
}

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.page$.next(this.pageIndex);
    this.pageSize$.next(this.pageSize);
  }

  private toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x: any) =>
    typeof x === 'string' ? x : (x?.value ?? x?.label ?? String(x))
  );
}

/** Build ManyOrAll exactly as the API expects */
private toManyOrAll(input: unknown): 'all' | string[] {
  const arr = this.toStringArray(input);
  return arr.length ? arr : 'all';

}

private toSelectOptions(input: any[]): Array<{ label: string; value: string }> {
  const labelOf = (x: any) =>
    (x?.label ?? x?.name ?? x?.display ?? x?.provider ?? x?.providerName ??
     x?.location ?? x?.practice_group ?? x?.title ?? x ?? '').toString();
  const valueOf = (x: any) =>
    (x?.value ?? x?.id ?? x?.code ?? labelOf(x)).toString();

  return (input ?? [])
    .map(x => ({ label: labelOf(x), value: valueOf(x) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async exportRevenueByPractice(): Promise<void> {
    try {
      const rows = await firstValueFrom(this.table$);

      if (!rows?.length) {
        console.log('[Revenue by Practice] export: no rows to export');
        return;
      }

      const exportRows = rows.map(r => ({
        'Practice/Provider': r.location ?? '',
        'Charges': this.toNumber(r.charges),
        'Insurance Submitted': this.toNumber(r.insuranceSubmitted),
        'Net Collections': this.toNumber(r.netCollections),
        'Adjustments': this.toNumber(r.adjustments),
        'Outstanding Balance': this.toNumber(r.outstandingBalance),
        'Net Collection (%)': r.netCollectionPct ?? '',
        'Refunds': this.toNumber(r.refunds),
      }));

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Revenue by Practice');

      ws.columns = [
        { header: 'Practice/Provider',   key: 'Practice/Provider',   width: 32 },
        { header: 'Charges',             key: 'Charges',             width: 14 },
        { header: 'Insurance Submitted', key: 'Insurance Submitted', width: 20 },
        { header: 'Net Collections',     key: 'Net Collections',     width: 18 },
        { header: 'Adjustments',         key: 'Adjustments',         width: 14 },
        { header: 'Outstanding Balance', key: 'Outstanding Balance', width: 18 },
        { header: 'Net Collection (%)',  key: 'Net Collection (%)',  width: 18 },
        { header: 'Refunds',             key: 'Refunds',             width: 12 },
      ];

      ws.addRows(exportRows);

      // Currency cols: B-F, H (1-based: 2,3,4,5,6,8); Percent col: G (7)
      const currencyCols = [2, 3, 4, 5, 6, 8];
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return;
        currencyCols.forEach(c => {
          const cell = row.getCell(c);
          if (cell.value !== null && cell.value !== '') cell.numFmt = '$#,##0.00';
        });
        const pctCell = row.getCell(7);
        if (pctCell.value !== null && pctCell.value !== '') pctCell.numFmt = '0.00';
      });

      const stamp = new Date().toISOString().slice(0, 10);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `revenue-by-practice_${stamp}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Revenue by Practice] export failed:', err);
    }
  }

  private toNumber(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async exportClaimValueByStatus(): Promise<void> {
    try {
      const data = await firstValueFrom(this.claimValueByStatus$);
      if (!data?.length) return;
      const rows = data.map((r: ClaimValueByStatusDto) => ({
        'Claim Status': r.ClaimStatus,
        'Claim Value': this.toNumber(r.ClaimValue),
      }));
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Claim Value by Status');
      ws.columns = [
        { header: 'Claim Status', key: 'Claim Status', width: 30 },
        { header: 'Claim Value',  key: 'Claim Value',  width: 16 },
      ];
      ws.addRows(rows);
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return;
        const cell = row.getCell(2);
        if (cell.value !== null && cell.value !== '') cell.numFmt = '$#,##0.00';
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `claim-value-by-status_${this.todayStamp()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[RCM] exportClaimValueByStatus failed:', err);
    }
  }

  async exportClaimAmountsByPractice(): Promise<void> {
    try {
      const data = await firstValueFrom(this.claimAmountsByPractice$);
      if (!data?.length) return;
      const rows = data.map((r: ClaimAmountsByPracticeDto) => ({
        'Practice': r.Practice,
        'Total Claim Amount': this.toNumber(r.TotalClaimAmount),
      }));
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Claim Amounts by Practice');
      ws.columns = [
        { header: 'Practice',           key: 'Practice',           width: 32 },
        { header: 'Total Claim Amount', key: 'Total Claim Amount', width: 20 },
      ];
      ws.addRows(rows);
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return;
        const cell = row.getCell(2);
        if (cell.value !== null && cell.value !== '') cell.numFmt = '$#,##0.00';
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `claim-amounts-by-practice_${this.todayStamp()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[RCM] exportClaimAmountsByPractice failed:', err);
    }
  }

  async exportCollectionAdjustmentTrends(): Promise<void> {
    try {
      const data = await firstValueFrom(this.collectionAdjustmentTrends$);
      if (!data?.length) return;
      const rows = data.map((r: CollectionAdjustmentTrendDto) => ({
        'Month': r.MonthLabel,
        'Collections': this.toNumber(r.Collections),
        'Adjustments': this.toNumber(r.Adjustments),
        'Collection Rate (%)': +(this.toNumber(r.CollectionRate) * 100).toFixed(2),
      }));
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Collection Trends');
      ws.columns = [
        { header: 'Month',               key: 'Month',               width: 16 },
        { header: 'Collections',         key: 'Collections',         width: 16 },
        { header: 'Adjustments',         key: 'Adjustments',         width: 16 },
        { header: 'Collection Rate (%)', key: 'Collection Rate (%)', width: 22 },
      ];
      ws.addRows(rows);
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return;
        [2, 3].forEach(c => {
          const cell = row.getCell(c);
          if (cell.value !== null && cell.value !== '') cell.numFmt = '$#,##0.00';
        });
        const d = row.getCell(4);
        if (d.value !== null && d.value !== '') d.numFmt = '0.00';
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `collection-adjustment-trends_${this.todayStamp()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[RCM] exportCollectionAdjustmentTrends failed:', err);
    }
  }

  async exportClaimAmountsByPayer(): Promise<void> {
    try {
      const data = await firstValueFrom(this.claimAmountsByPayer$);
      if (!data?.length) return;
      const rows = data.map((r: ClaimAmountsByPayerDto) => ({
        'Payer': r.Payer,
        'Total Claim Amount': this.toNumber(r.TotalClaimAmount),
      }));
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Claim Amounts by Payer');
      ws.columns = [
        { header: 'Payer',              key: 'Payer',              width: 36 },
        { header: 'Total Claim Amount', key: 'Total Claim Amount', width: 20 },
      ];
      ws.addRows(rows);
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return;
        const cell = row.getCell(2);
        if (cell.value !== null && cell.value !== '') cell.numFmt = '$#,##0.00';
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `claim-amounts-by-payer_${this.todayStamp()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[RCM] exportClaimAmountsByPayer failed:', err);
    }
  }

  async exportClaimValuesByType(): Promise<void> {
    try {
      const data = await firstValueFrom(this.claimValuesByType$);
      if (!data?.length) return;
      const rows = data.map((r: ClaimValuesByTypeDto) => ({
        'Claim Type': r.ClaimType ?? 'Unknown',
        'Total Claim Amount': this.toNumber(r.TotalClaimAmount),
      }));
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Claim Values by Type');
      ws.columns = [
        { header: 'Claim Type',         key: 'Claim Type',         width: 30 },
        { header: 'Total Claim Amount', key: 'Total Claim Amount', width: 20 },
      ];
      ws.addRows(rows);
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return;
        const cell = row.getCell(2);
        if (cell.value !== null && cell.value !== '') cell.numFmt = '$#,##0.00';
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `claim-values-by-type_${this.todayStamp()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[RCM] exportClaimValuesByType failed:', err);
    }
  }

  async exportClaimsData(): Promise<void> {
    try {
      const filters = await firstValueFrom(this.appliedFilters$);

      const claimsResponse = await firstValueFrom(this.rcm.getClaimsCountByLocationGroup(filters));
      const dailyData = claimsResponse?.daily ?? [];
      const monthlyData = claimsResponse?.monthly ?? [];

      if (!dailyData.length && !monthlyData.length) {
        console.log('[Claims Data] export: no data to export');
        return;
      }

      const sortedDailyData = [...dailyData].sort((a, b) => {
        if (a.Location !== b.Location) return a.Location.localeCompare(b.Location);
        return (a.Day ?? '').localeCompare(b.Day ?? '');
      });

      const sortedMonthlyData = [...monthlyData].sort((a, b) => {
        if (a.Location !== b.Location) return a.Location.localeCompare(b.Location);
        return (a.Month ?? '').localeCompare(b.Month ?? '');
      });

      const dailyRows = sortedDailyData.map(item => ({
        Location: item.Location,
        Group: item.GroupKey ?? 'All',
        Day: item.Day ? item.Day.slice(0, 10) : '',
        'Claims Count': item.ClaimsCount,
      }));

      const monthlyRows = sortedMonthlyData.map(item => ({
        Location: item.Location,
        Group: item.GroupKey ?? 'All',
        Month: item.Month ? item.Month.slice(0, 10) : '',
        'Claims Count': item.ClaimsCount,
      }));

      const workbook = new ExcelJS.Workbook();

      const dailyWs = workbook.addWorksheet('Daily Claims');
      dailyWs.columns = [
        { header: 'Location',     key: 'Location',     width: 24 },
        { header: 'Group',        key: 'Group',        width: 18 },
        { header: 'Day',          key: 'Day',          width: 14 },
        { header: 'Claims Count', key: 'Claims Count', width: 14 },
      ];
      dailyWs.addRows(dailyRows);

      const monthlyWs = workbook.addWorksheet('Monthly Claims');
      monthlyWs.columns = [
        { header: 'Location',     key: 'Location',     width: 24 },
        { header: 'Group',        key: 'Group',        width: 18 },
        { header: 'Month',        key: 'Month',        width: 14 },
        { header: 'Claims Count', key: 'Claims Count', width: 14 },
      ];
      monthlyWs.addRows(monthlyRows);

      const stamp = this.todayStamp();
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `claims-data_${stamp}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Claims Data] export failed:', err);
    }
  }

  private todayStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // applyNumberFormats removed - number formatting now applied inline via ExcelJS cell.numFmt
}
