// src/app/pages/analytics/payer-mix/payer-mix.component.ts
import {ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, combineLatest, firstValueFrom, map, Subject, Subscription, take, takeUntil, skip } from 'rxjs';
import { ThemeService } from '../../../core/services/theme.service';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexLegend, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis } from 'ng-apexcharts';
import { Filters } from '../../../core/models/payer-mix.models';
import { PayerMixStore } from '../../../core/stores/payer-mix.store';
import { FilterDialogConfig, FilterField, SelectField } from '../../../core/models/filter-dialog.model';
import { FilterDialogService } from '../../../shared/components/filter-dialog/filter-dialog.service';
import { HorizontalBarDatum } from '../../../shared/components/horizontal-bar-chart/horizontal-bar-chart.component';
import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import { CsvExportService } from '../../../core/services/csv-export.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis | ApexYAxis[];
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  fill?: ApexFill;
  colors?: string[];
};

interface PayerCollectionRow {
  insuranceName: string;
  totalCollections: number;
  insuranceCollections: number;
  patientCollections: number;
  insurancePct: number;
  patientPct: number;
  claim: number;
}

interface PayerCollectionPage {
  rows: PayerCollectionRow[];
  total: number;
  pageIndex: number;
  pageSize: number;
  startIndex: number; // zero-based
  endIndex: number;   // exclusive
  maxPage: number;
}

@Component({
    selector: 'app-payer-mix',
    templateUrl: './payer-mix.component.html',
    styleUrls: ['./payer-mix.component.scss'],
    providers: [PayerMixStore],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PayerMixComponent implements OnInit, OnDestroy {
  loading$ = this.store.loading$;
  totalsInsurance$ = this.store.totalsInsurance$;
  totalsPatient$   = this.store.totalsPatient$;
  chips$ = this.store.filters$.pipe(map(f => this.filtersToChips(f)));
     payersIncreasingChart$ = this.store.payersIncreasing$.pipe(
    map((rows): HorizontalBarDatum[] =>
      (rows || []).map(r => ({
        label: r.insuranceName || `Payer ${r.insuranceId ?? ''}`,
        value: r.chargeDelta ?? 0,
      }))
    )
  );

  payersDecreasingChart$ = this.store.payersDecreasing$.pipe(
    map((rows): HorizontalBarDatum[] =>
      (rows || []).map(r => ({
        label: r.insuranceName || `Payer ${r.insuranceId ?? ''}`,
        value: r.chargeDelta ?? 0,
      }))
    )
  );

  proceduresIncreasingChart$ = this.store.proceduresIncreasing$.pipe(
    map((rows): HorizontalBarDatum[] =>
      (rows || []).map(r => ({
        label: r.procedureCode,
        value: r.chargeDelta ?? 0,
      }))
    )
  );

  proceduresDecreasingChart$ = this.store.proceduresDecreasing$.pipe(
    map((rows): HorizontalBarDatum[] =>
      (rows || []).map(r => ({
        label: r.procedureCode,
        value: r.chargeDelta ?? 0,
      }))
    )
  );

   payerCollectionDetails$ = this.store.payerCollectionDetails$.pipe(
    map(rows =>
      (rows ?? []).map((r: any): PayerCollectionRow => ({
        insuranceName: r.InsuranceName ?? r.insuranceName ?? 'Unknown/Self-Pay',
        totalCollections: r.TotalCollections ?? r.totalCollections ?? 0,
        insuranceCollections: r.InsuranceCollections ?? r.insuranceCollections ?? 0,
        patientCollections: r.PatientCollections ?? r.patientCollections ?? 0,
        insurancePct: r.InsurancePercentage ?? r.insurancePercentage ?? 0,
        patientPct: r.PatientPercentage ?? r.patientPercentage ?? 0,
        claim: r.Claim ?? r.claim ?? 0,
      }))
    )
  );

   // --- pagination state (client-side) ---
  private pageIndexSubject = new BehaviorSubject<number>(0);
  private pageSizeSubject  = new BehaviorSubject<number>(10);

  pageIndex$ = this.pageIndexSubject.asObservable();
  pageSize$  = this.pageSizeSubject.asObservable();

  payerCollectionPage$ = combineLatest([
    this.payerCollectionDetails$,
    this.pageIndex$,
    this.pageSize$,
  ]).pipe(
    map(([rows, pageIndex, pageSize]): PayerCollectionPage => {
      const total = rows.length;
      const maxPage = total > 0 ? Math.floor((total - 1) / pageSize) : 0;
      const safeIndex = Math.min(pageIndex, maxPage);
      const startIndex = safeIndex * pageSize;
      const endIndex = Math.min(startIndex + pageSize, total);
      const pageRows = rows.slice(startIndex, endIndex);

      return {
        rows: pageRows,
        total,
        pageIndex: safeIndex,
        pageSize,
        startIndex,
        endIndex,
        maxPage,
      };
    })
  );

  // optional: if you want to change page size later
  setPageSize(size: number) {
    this.pageSizeSubject.next(size);
    this.pageIndexSubject.next(0);
  }

   private formatCurrency(value: any): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    // matches your pipe: '1.0-0' (no decimals)
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  private formatPercentFrom0to100(value: any): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const ratio = n / 100;
    // matches your pipe: percent:'1.1-1'
    return (ratio).toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }


  goPrev(page: PayerCollectionPage) {
    if (page.pageIndex > 0) {
      this.pageIndexSubject.next(page.pageIndex - 1);
    }
  }

  goNext(page: PayerCollectionPage) {
    if (page.pageIndex < page.maxPage) {
      this.pageIndexSubject.next(page.pageIndex + 1);
    }
  }

  /** Totals row (bottom "Total" line in Figma) */
  payerCollectionTotals$ = this.payerCollectionDetails$.pipe(
    map(rows => rows.reduce(
      (acc, r) => ({
        totalCollections: acc.totalCollections + r.totalCollections,
        insuranceCollections: acc.insuranceCollections + r.insuranceCollections,
        patientCollections: acc.patientCollections + r.patientCollections,
        claim: acc.claim + r.claim,
      }),
      { totalCollections: 0, insuranceCollections: 0, patientCollections: 0, claim: 0 }
    ))
  );

payerCollectionColumns: AdvancedTableColumnConfig[] = [
    {
      id: 'insuranceName',
      header: 'Payer Category',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '260px',
      includeInGlobalSearch: true,
      accessor: (r) => r.insuranceName,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: false, // or true if using groups
      }
    },
    {
      id: 'totalCollections',
      header: 'Total Collections',
      type: 'number',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '170px',
      accessor: (r) => r.totalCollections,
      displayFormatter: (v) => this.formatCurrency(v),
    },
    {
      id: 'insuranceCollections',
      header: 'Insurance Collections',
      type: 'number',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '190px',
      accessor: (r) => r.insuranceCollections,
      displayFormatter: (v) => this.formatCurrency(v),
    },
    {
      id: 'patientCollections',
      header: 'Patient Collections',
      type: 'number',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '180px',
      accessor: (r) => r.patientCollections,
      displayFormatter: (v) => this.formatCurrency(v),
    },
    {
      id: 'insurancePct',
      header: 'Insurance Percentage',
      type: 'number',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '180px',
      accessor: (r) => r.insurancePct,
      // row.insurancePct is 0..100; convert to 0..1 for display
      displayFormatter: (v) => this.formatPercentFrom0to100(v),
    },
    {
      id: 'patientPct',
      header: 'Patient Percentage',
      type: 'number',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '170px',
      accessor: (r) => r.patientPct,
      displayFormatter: (v) => this.formatPercentFrom0to100(v),
    },
    {
      id: 'claim',
      header: 'Claim',
      type: 'number',
      sortable: true,
      filterable: true,
      align: 'end',
      width: '140px',
      accessor: (r) => r.claim,
      displayFormatter: (v) => this.formatCurrency(v),
    },
  ];

  comboOpts?: ChartOptions;
  lineOpts?: ChartOptions;
  sub?: Subscription;
  totals: any | null = null; // ideally type this to your totals model
  private destroy$ = new Subject<void>();
  constructor(
    private store: PayerMixStore,
    private filterDialog: FilterDialogService,
    private themeService: ThemeService,
    private csvExport: CsvExportService,
    private globalFiltersStore: GlobalFiltersStore,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Apply initial global filters
    const gf = this.globalFiltersStore.value;
    this.applyGlobalFilters(gf);

    // React to future global filter changes
    this.globalFiltersStore.applied$.pipe(
      skip(1),
      takeUntil(this.destroy$),
    ).subscribe(filters => this.applyGlobalFilters(filters));

    this.sub = combineLatest([
      this.store.collectionTrends$,
      this.themeService.theme$,
    ]).pipe(takeUntil(this.destroy$)).subscribe(([points, theme]) => {
      const categories    = points.map(p => p.monthLabel);
      const insuranceBars = points.map(p => p.insuranceCollection);
      const patientBars   = points.map(p => p.patientCollection);
      const insuranceLine = points.map(p => p.insuranceTrend ?? null);

      const formatShort = (val: number) => this.formatShort(val);

      this.comboOpts = {
        chart: {
          type: 'line',
          height: 365,
          toolbar: { show: false },
          zoom: { enabled: false },
          selection: { enabled: false },
        },
        xaxis: { categories },
        yaxis: [{
          title: { text: 'Collection Amount ($)' },
          labels: { formatter: (value: number) => `$${formatShort(value)}` },
        }],
        dataLabels: { enabled: false },
        stroke: { width: [0, 0, 3] },
        colors: [theme.chart_color_1, theme.chart_color_2, theme.chart_color_3],
        series: [
          { name: 'Insurance Collections', type: 'column', data: insuranceBars },
          { name: 'Patient Collections',   type: 'column', data: patientBars },
          { name: 'Insurance Trend',       type: 'line',   data: insuranceLine },
        ],
        legend: { show: true },
        tooltip: {
          shared: true,
          intersect: false,
          y: { formatter: (value: number) => `$${formatShort(value)}` },
        },
      };

      this.lineOpts = {
        chart: {
          type: 'line',
          height: 365,
          toolbar: { show: false },
          zoom: { enabled: false },
          selection: { enabled: false },
        },
        xaxis: { categories },
        yaxis: [{
          title: { text: 'Collection Amount ($)' },
          labels: { formatter: (value: number) => `$${formatShort(value)}` },
        }],
        dataLabels: { enabled: false },
        stroke: { width: 3, curve: 'smooth' },
        colors: [theme.chart_color_1, theme.chart_color_2],
        series: [
          { name: 'Insurance Collection Amount', data: insuranceBars },
          { name: 'Patient Collection Amount', data: patientBars }
        ],
        legend: { show: true },
        tooltip: {
          shared: true,
          intersect: false,
          y: { formatter: (value: number) => `$${formatShort(value)}` },
        },
      };
    });

 this.payerCollectionTotals$
      .pipe(takeUntil(this.destroy$))
      .subscribe(t => { this.totals = t; this.cdr.markForCheck(); });
  }

   ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.sub?.unsubscribe();
  }

  private applyGlobalFilters(gf: import('../../../shared/components/global-filters/global-filters.models').GlobalFiltersValue): void {
    const loc = gf.location;
    const patch: Partial<Filters> = {
      provider:        gf.providers.length ? gf.providers : 'all',
      practice_groups: loc.scope === 'group'    ? (loc as any).groups
                     : loc.scope === 'practice' ? (loc as any).practices
                     : 'all',
      location:        loc.scope === 'location' ? (loc as any).locations : 'all',
      payer:           gf.payers?.length ? gf.payers : 'all',
    };
    if (gf.startDate || gf.endDate) {
      patch.payment_received = {
        start_date: gf.startDate ? gf.startDate.toISOString().slice(0, 10) : '',
        end_date:   gf.endDate   ? gf.endDate.toISOString().slice(0, 10)   : '',
      };
    } else {
      patch.payment_received = { start_date: '', end_date: '' };
    }
    this.store.patchFilters(patch);
  }

async openFilter(): Promise<void> {
  // If you have quick access to current filters, use it; otherwise keep defaults.
  // (Don't block opening the dialog.)
  const fields: FilterField[] = [
    {
      key: 'practice_groups',
      label: 'Practice Group',
      type: 'multiselect',
      // leave allowClear false so "-" is hidden
      options: () => this.store.practiceGroups$.pipe(
        map(list => (list ?? []).slice().sort().map(v => ({ label: v, value: v })))
      ),
    } as SelectField<string>,

    {
      key: 'location',
      label: 'Location',
      type: 'multiselect',
      options: () => this.store.locations$.pipe(
        map(list => (list ?? []).slice().sort().map(v => ({ label: v, value: v })))
      ),
    } as SelectField<string>,

    {
      key: 'provider',
      label: 'Provider',
      type: 'multiselect',
      options: () => this.store.providers$.pipe(
        map(list => (list ?? []).slice().sort().map(v => ({ label: v, value: v })))
      ),
    } as SelectField<string>,

    { key: 'payment_received', label: 'Payment Received', type: 'date-range', span: 8 },
  ];

  const config: FilterDialogConfig = {
    title: 'Filters',
    fields,
    initial: {
      practice_groups: ['all'],
      location: ['all'],
      provider: ['all'],
      payment_received: { start: null, end: null },
    },
    gridColumns: 12,
    labels: { apply: 'Apply', cancel: 'Cancel', reset: 'Reset' },
  };

  const out = await firstValueFrom(this.filterDialog.open(config));
  if (!out) return;
  if (out === 'reset') { this.store.resetFilters(); return; }

  const v = out.values ?? {};
  const asAll = (arr: any[]) =>
    !Array.isArray(arr) || arr.length === 0 || arr.includes('all') ? 'all' : arr;

  this.store.patchFilters({
    practice_groups: asAll(v.practice_groups),
    location: asAll(v.location),
    provider: asAll(v.provider),
    payment_received: {
      start_date: v.payment_received?.start ?? '',
      end_date:   v.payment_received?.end   ?? '',
    },
  });
}

  removeChip(key: keyof Filters, value: string) {
    // emulate your React handleResetChip
    this.store.filters$.pipe(map(f => {
      const next: Filters = { ...f };
      if (key === 'payment_received') {
        next.payment_received = { start_date: '', end_date: '' };
      } else {
        const cur = (next[key] ?? 'all') as any;
        if (cur === 'all') return next;
        const filtered = (cur as string[]).filter((x: string) => x !== value);
        next[key] = filtered.length ? filtered : 'all';
      }
      this.store.patchFilters(next);
      return next;
    })).subscribe().unsubscribe();
  }

  filtersToChips(f: Filters): Array<{ key: keyof Filters; label: string }> {
    const chips: Array<{ key: keyof Filters; label: string }> = [];
    const pushList = (key: keyof Filters, v?: any) => {
      if (!v || v === 'all' || (Array.isArray(v) && v.length === 0)) return;
      (v as string[]).forEach(x => chips.push({ key, label: x }));
    };
    pushList('practice_groups', f.practice_groups);
    pushList('location',        f.location);
    pushList('provider',        f.provider);

    const s = f.payment_received?.start_date || '';
    const e = f.payment_received?.end_date || '';
    if (s || e) chips.push({ key: 'payment_received', label: `Payment Received: ${s || '\u2014'} \u2192 ${e || '\u2014'}` });
    return chips;
  }

  goToSourceData() {
    // matches your subnav + reload pattern
    // TODO: route to Source Data tab and trigger refresh logic
  }

  async exportCollectionTrends(): Promise<void> {
    const points = await firstValueFrom(this.store.collectionTrends$);
    const rows = (points ?? []).map(p => [p.monthLabel, p.insuranceCollection, p.patientCollection, p.insuranceTrend ?? '']);
    this.csvExport.download(
      `payer-mix-collection-trends_${this.todayStamp()}.csv`,
      ['Month', 'Insurance Collections ($)', 'Patient Collections ($)', 'Insurance Trend'],
      rows,
    );
  }

  async exportPayersIncreasing(): Promise<void> {
    const rows_data = await firstValueFrom(this.store.payersIncreasing$);
    const rows = (rows_data ?? []).map(r => [r.insuranceName ?? '', r.currentPeriodCharges, r.lastPeriodCharges, r.chargeDelta, r.chargeDeltaPct ?? '']);
    this.csvExport.download(
      `payers-increasing_${this.todayStamp()}.csv`,
      ['Payer', 'Current Period ($)', 'Last Period ($)', 'Delta ($)', 'Delta (%)'],
      rows,
    );
  }

  async exportPayersDecreasing(): Promise<void> {
    const rows_data = await firstValueFrom(this.store.payersDecreasing$);
    const rows = (rows_data ?? []).map(r => [r.insuranceName ?? '', r.currentPeriodCharges, r.lastPeriodCharges, r.chargeDelta, r.chargeDeltaPct ?? '']);
    this.csvExport.download(
      `payers-decreasing_${this.todayStamp()}.csv`,
      ['Payer', 'Current Period ($)', 'Last Period ($)', 'Delta ($)', 'Delta (%)'],
      rows,
    );
  }

  async exportProceduresIncreasing(): Promise<void> {
    const rows_data = await firstValueFrom(this.store.proceduresIncreasing$);
    const rows = (rows_data ?? []).map(r => [r.procedureCode, r.currentPeriodCharges, r.lastPeriodCharges, r.chargeDelta, r.chargeDeltaPct ?? '']);
    this.csvExport.download(
      `procedures-increasing_${this.todayStamp()}.csv`,
      ['Procedure Code', 'Current Period ($)', 'Last Period ($)', 'Delta ($)', 'Delta (%)'],
      rows,
    );
  }

  async exportProceduresDecreasing(): Promise<void> {
    const rows_data = await firstValueFrom(this.store.proceduresDecreasing$);
    const rows = (rows_data ?? []).map(r => [r.procedureCode, r.currentPeriodCharges, r.lastPeriodCharges, r.chargeDelta, r.chargeDeltaPct ?? '']);
    this.csvExport.download(
      `procedures-decreasing_${this.todayStamp()}.csv`,
      ['Procedure Code', 'Current Period ($)', 'Last Period ($)', 'Delta ($)', 'Delta (%)'],
      rows,
    );
  }

  async exportPayerCollectionDetails(): Promise<void> {
    const rows_data = await firstValueFrom(this.payerCollectionDetails$);
    const rows = (rows_data ?? []).map(r => [
      r.insuranceName,
      r.totalCollections,
      r.insuranceCollections,
      r.patientCollections,
      r.insurancePct,
      r.patientPct,
      r.claim,
    ]);
    this.csvExport.download(
      `payer-collection-details_${this.todayStamp()}.csv`,
      ['Payer', 'Total Collections ($)', 'Insurance Collections ($)', 'Patient Collections ($)', 'Insurance %', 'Patient %', 'Claim ($)'],
      rows,
    );
  }

  private todayStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private formatShort(value: number | null | undefined): string {
  if (value == null || isNaN(value as any)) return '0';

  const abs = Math.abs(value);
  let result: string;

  if (abs >= 1_000_000_000) {
    result = (value / 1_000_000_000).toFixed(1) + 'B';
  } else if (abs >= 1_000_000) {
    result = (value / 1_000_000).toFixed(1) + 'M';
  } else if (abs >= 1_000) {
    result = (value / 1_000).toFixed(1) + 'K';
  } else {
    result = value.toFixed(0);
  }

  // Strip trailing ".0"
  return result.replace(/\.0([KMB])$/, '$1');
}
 
}
