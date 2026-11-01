import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { BehaviorSubject, forkJoin, Observable, of } from 'rxjs';
import { map, switchMap, startWith, take, catchError } from 'rxjs/operators';

import { FilterDialogService } from '../../../shared/components/filter-dialog/filter-dialog.service';
import { FilterDialogClose, FilterDialogConfig, FilterDialogResult, FilterField, SelectField } from '../../../core/models/filter-dialog.model';
import { MedicareDashboardDataService } from '../../../core/services/medicare-dashboard-data.service';
import { Filters } from '../../../core/models/medicare-dashboard.types';

/** ==== Chart input contracts expected by your shared chart components ==== */
export interface BarChartInput {
  categories: string[];
  series: Array<{ name: string; data: number[]; type?: 'line' | 'column' }>;
}
type PieChartInput = any[];

/** ==== Sentinels / helpers ==== */
const EMPTY_BAR: BarChartInput = {
  categories: [],
  // ApexCharts is happier if there is at least one series object
  series: [{ name: '\u2014', data: [] }],
};
const EMPTY_PIE: PieChartInput = [{ label: '\u2014', value: 0 }];

const EMPTY_FILTERS: Filters = {
  practice_groups: 'all',
  location: 'all',
  provider: 'all',
  date_of_service: { start_date: '', end_date: '' },
};

const BUCKET_ORDER = [
  '$0-$49', '$50-$99', '$100-$199', '$200-$299', '$300-$399', '$400-$499', 'Over $500'
];

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.valueOf())
    ? String(iso ?? '')
    : d.toLocaleString(undefined, { month: 'short', year: 'numeric' }); // e.g., "Jan 2025"
}

@Component({
    selector: 'app-medicare-dashboard',
    templateUrl: './medicare-dashboard.component.html',
    styleUrls: ['./medicare-dashboard.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class MedicareDashboardComponent implements OnInit {
  /** ========================= Lookups ========================= */
  // populated in ngOnInit; safe fallbacks keep the dialog usable
  practiceGroups: string[] = [];
  locations: string[] = [];
  providers: string[] = [];

  /** ========================= Filters state ========================= */
  private filtersSubject = new BehaviorSubject<Filters>(EMPTY_FILTERS);
  filters$ = this.filtersSubject.asObservable();

  /** Chips shown in the header */
  chips$: Observable<Array<{ key: keyof Filters; label: string }>> = this.filters$.pipe(
    map((f) => this.buildChips(f))
  );

  /** ========================= Lazy card flags used by template ========================= */
  showCard1 = false; showCard2 = false; showCard3 = false; showCard4 = false;
  showCard5 = false; showCard6 = false; showCard7 = false; showCard8 = false;

  /** ========================= Charts wired to your service ========================= */
 cptAndClaimCountsChart$ = this.filters$.pipe(
  switchMap(f => this.data.getCptAndClaimCounts(f).pipe(
    map(r => this.asBar(r)),
    startWith(EMPTY_BAR),
    catchError(() => of(EMPTY_BAR))
  ))
);

chargesVsMedicareChart$ = this.filters$.pipe(
  switchMap(f => this.data.getChargesVsMedicare(f).pipe(
    map(r => this.asBar(r)),
    startWith(EMPTY_BAR),
    catchError(() => of(EMPTY_BAR))
  ))
);

paymentsVsMedicareChart$ = this.filters$.pipe(
  switchMap(f => this.data.getPaymentsVsMedicare(f).pipe(
    map(r => this.asBar(r)),
    startWith(EMPTY_BAR),
    catchError(() => of(EMPTY_BAR))
  ))
);

uncollectedMedicarePerClaimStacked$ = this.filters$.pipe(
  switchMap(f => this.data.getUncollectedMedicarePerClaim(f).pipe(
    map(r => this.asBar(r)),
    startWith(EMPTY_BAR),
    catchError(() => of(EMPTY_BAR))
  ))
);

uncollectedMCRPerClaimPie$ = this.filters$.pipe(
  switchMap(f => this.data.getUncollectedMCRPerClaim(f).pipe(
    map(r => this.asPie(r)),
    startWith(EMPTY_PIE),
    catchError(() => of(EMPTY_PIE))
  ))
);

medicareByCptGroupPie$ = this.filters$.pipe(
  switchMap(f => this.data.getMedicareByCptGroup(f).pipe(
    map(r => this.asPie(r)),
    startWith(EMPTY_PIE),
    catchError(() => of(EMPTY_PIE))
  ))
);

uncollectedMedicarePerClaimMixChart$ = this.filters$.pipe(
  switchMap(f => this.data.getUncollectedMedicarePerClaimMix(f).pipe(
    map(r => this.asBar(r)),
    startWith(EMPTY_BAR),
    catchError(() => of(EMPTY_BAR))
  ))
);

uncollectedMedicareByCptGroupPie$ = this.filters$.pipe(
  switchMap(f => this.data.getUncollectedMedicareByCptGroup(f).pipe(
    map(r => this.asPie(r)),
    startWith(EMPTY_PIE),
    catchError(() => of(EMPTY_PIE))
  ))
);

  constructor(
    private filterDialog: FilterDialogService,
    private data: MedicareDashboardDataService
  ) {}

  ngOnInit(): void {
    // Initial lookups; keep simple and resilient
    this.data.getPracticeGroups().subscribe((pg) => (this.practiceGroups = pg ?? []));
    this.refreshDependentLookups(this.filtersSubject.value);
  }

  /** ========================= Open reusable Filter Dialog ========================= */
openFilters(): void {
  const cur = this.filtersSubject.value;
  const toArray = (v: 'all' | string[]) => Array.isArray(v) ? v : [];

  const fields: FilterField[] = [
    <SelectField<string>>{
      key: 'practice_groups', label: 'Practice Group', type: 'multiselect', allowClear: true,
      options: () => this.practiceGroups.map(v => ({ label: v, value: v })),
    },
    <SelectField<string>>{
      key: 'location', label: 'Location', type: 'multiselect', allowClear: true,
      options: () => this.locations.map(v => ({ label: v, value: v })),
    },
    <SelectField<string>>{
      key: 'provider', label: 'Provider', type: 'multiselect', allowClear: true,
      options: () => this.providers.map(v => ({ label: v, value: v })),
    },
    { key: 'date_of_service', label: 'Date of Service', type: 'date-range', span: 8 }, // <- important
  ];

  const config: FilterDialogConfig = {
    title: 'Filters',
    fields,
    gridColumns: 12, // <- important
    initial: {
      practice_groups: toArray(cur.practice_groups),
      location: toArray(cur.location),
      provider: toArray(cur.provider),
      date_of_service: {
        start: cur.date_of_service?.start_date ? new Date(cur.date_of_service.start_date) : null,
        end:   cur.date_of_service?.end_date   ? new Date(cur.date_of_service.end_date)   : null,
      },
    },
    labels: { apply: 'Apply', cancel: 'Cancel', reset: 'Reset' },
  };

  this.filterDialog.open(config).subscribe(out => {
    if (!out) return;
    if (out === 'reset') {
      this.filtersSubject.next({
        practice_groups: 'all', location: 'all', provider: 'all',
        date_of_service: { start_date: '', end_date: '' },
      });
      return;
    }
    const v = out.values ?? {};
   const asMany = (val: unknown): 'all' | string[] =>
  Array.isArray(val) && val.length ? (val as string[]) : 'all';

// build the new filters with correct types
const next: Filters = {
  practice_groups: asMany(v.practice_groups),
  location:        asMany(v.location),
  provider:        asMany(v.provider),
  date_of_service: {
    start_date: v.date_of_service?.start ?? '',
    end_date:   v.date_of_service?.end   ?? '',
  },
};

this.filtersSubject.next(next);
this.refreshDependentLookups(next, true);
  });
}

  /** ========================= Template helpers ========================= */
  removeChip(key: keyof Filters, label: string): void {
    const cur = this.filtersSubject.value;
    const next: Filters = { ...cur };

    if (key === 'date_of_service') {
      next.date_of_service = { start_date: '', end_date: '' };
    } else {
      const list = Array.isArray(cur[key]) ? ([...cur[key]] as string[]) : [];
      const filtered = list.filter((x) => x !== label);
      (next as any)[key] = filtered.length ? filtered : 'all';
    }

    this.filtersSubject.next(next);
    this.refreshDependentLookups(next, /*alsoProviders*/ key !== 'date_of_service');
  }

  navigateToSourceData(): void {
    console.log('[MedicareDashboard] View Table clicked with filters:', this.filtersSubject.value);
    // TODO: route to your source-data table if needed
  }

  titlePrefixT13M(_f: Filters): string { return 'Last 13 Months \u2014'; }
  titlePrefixT12M(_f: Filters): string { return 'Last 12 Months \u2014'; }

  /** ========================= Private helpers ========================= */
  /** Refresh lookups that depend on current filters */
  private refreshDependentLookups(f: Filters, alsoProviders = false) {
    const sub1 = this.data
      .getLocations(Array.isArray(f.practice_groups) ? f.practice_groups : [])
      .subscribe((locs) => (this.locations = locs ?? []));
    let sub2 = { add() {}, unsubscribe() {} } as any;
    if (alsoProviders) {
      sub2 = this.data.getProviders(f).subscribe((prov) => (this.providers = prov ?? []));
    }
    return { add: (..._a: any[]) => {}, unsubscribe: () => { sub1.unsubscribe(); if (sub2?.unsubscribe) sub2.unsubscribe(); } };
  }

  private buildChips(f: Filters): Array<{ key: keyof Filters; label: string }> {
    const chips: Array<{ key: keyof Filters; label: string }> = [];
    const push = (key: keyof Filters, v: any) => {
      if (Array.isArray(v) && v.length) v.forEach((x) => chips.push({ key, label: x }));
    };
    push('practice_groups', f.practice_groups);
    push('location', f.location);
    push('provider', f.provider);

    const s = f.date_of_service?.start_date;
    const e = f.date_of_service?.end_date;
    if (s || e) chips.push({ key: 'date_of_service', label: `${s || '\u2014'} \u2192 ${e || '\u2014'}` });
    return chips;
  }

  /** Defensive mappers in case the API shape shifts a bit */
private asBar = (raw: any): BarChartInput => {
  // If backend already returns chart shape, keep supporting it
  if (raw && Array.isArray(raw.series) && Array.isArray(raw.categories)) {
    return {
      categories: raw.categories.map((x: any) => String(x ?? '')),
      series: raw.series.map((s: any, i: number) => ({
        name: s?.name ?? `Series ${i + 1}`,
        type: (s?.type === 'line' || s?.type === 'column') ? s.type : 'column',
        data: Array.isArray(s?.data) ? s.data.map((v: any) => (v == null ? null : Number(v))) : [],
      })),
    };
  }

  // ------------- Generic time-series array from API -------------
  if (Array.isArray(raw) && raw.length) {
    // Sort chronologically by date_of_service if present
    const sorted = [...raw].sort((a, b) => {
      const da = new Date(a?.date_of_service ?? 0).valueOf();
      const db = new Date(b?.date_of_service ?? 0).valueOf();
      return da - db;
    });

    const hasDate = sorted[0] && 'date_of_service' in sorted[0];

    const categories = hasDate
      ? sorted.map(r => monthLabel(r.date_of_service))
      : sorted.map((_, i) => String(i + 1));

    const row0 = sorted[0] ?? {};
    const keys = Object.keys(row0);

    // Detect stacked bucketed payload (your sample)
    const bucketKeys = keys.filter(
      k => BUCKET_ORDER.includes(k)
    );

    if (bucketKeys.length) {
      const ordered = BUCKET_ORDER.filter(k => bucketKeys.includes(k));
      const series = ordered.map(name => ({
        name,
        type: 'column' as const,
        data: sorted.map(r => Number(r?.[name] ?? 0)),
      }));
      return { categories, series };
    }

    // Detect well-known time-series shapes
    const hasClaims = 'claims_count' in row0;
    const hasCpt    = 'cpt_count' in row0;
    const hasCptPer = 'cpt_per_claim' in row0;

    if (hasClaims || hasCpt) {
      const series = [
        hasClaims && { name: 'Claims', type: 'column' as const, data: sorted.map(r => Number(r?.claims_count ?? 0)) },
        hasCpt    && { name: 'CPT Codes', type: 'column' as const, data: sorted.map(r => Number(r?.cpt_count ?? 0)) },
        hasCptPer && { name: 'CPT per Claim', type: 'line' as const, data: sorted.map(r => Number(r?.cpt_per_claim ?? 0)) },
      ].filter(Boolean) as BarChartInput['series'];
      return { categories, series };
    }

    const hasBilled = 'billed' in row0;
    const hasAllow  = 'medicare_allowable' in row0;
    const hasPctChg = 'percent_of_charges' in row0;

    if (hasBilled || hasAllow) {
      const series = [
        hasBilled && { name: 'Billed', type: 'column' as const, data: sorted.map(r => Number(r?.billed ?? 0)) },
        hasAllow  && { name: 'Medicare Allowable', type: 'column' as const, data: sorted.map(r => Number(r?.medicare_allowable ?? 0)) },
        hasPctChg && { name: '% of Charges', type: 'line' as const, data: sorted.map(r => Number(r?.percent_of_charges ?? 0)) },
      ].filter(Boolean) as BarChartInput['series'];
      return { categories, series };
    }

    const hasPayments   = 'payments' in row0;
    const hasUncollect  = 'uncollected' in row0;
    const hasPctPay     = 'percent_of_payments' in row0;

    if (hasAllow || hasPayments || hasUncollect) {
      const series = [
        hasAllow    && { name: 'Medicare Allowable', type: 'column' as const, data: sorted.map(r => Number(r?.medicare_allowable ?? 0)) },
        hasPayments && { name: 'Payments', type: 'column' as const, data: sorted.map(r => Number(r?.payments ?? 0)) },
        hasUncollect&& { name: 'Uncollected', type: 'column' as const, data: sorted.map(r => Number(r?.uncollected ?? 0)) },
        hasPctPay   && { name: '% of Payments', type: 'line' as const, data: sorted.map(r => Number(r?.percent_of_payments ?? 0)) },
      ].filter(Boolean) as BarChartInput['series'];
      return { categories, series };
    }

    // Fallback: single total series if present
    if ('total_uncollected_for_month' in row0) {
      return {
        categories,
        series: [{
          name: 'Uncollected',
          type: 'column',
          data: sorted.map(r => Number(r?.total_uncollected_for_month ?? 0)),
        }],
      };
    }
  }

  // Final fallback: empty
  return { categories: [], series: [] };
};

private asPie = (raw: any): any[] => {
  // Pass-through for already-correct shapes
  if (Array.isArray(raw)) return raw;

  // Convert object maps like:
  // { "Group A": { amount: 123, percentage: 45 }, ... }
  if (raw && typeof raw === 'object') {
    const entries = Object.entries(raw)
      .filter(([k, v]) => v != null && typeof v === 'object');

    if (entries.length) {
      // Prefer known bucket ordering; otherwise sort by value desc
      const asItems = entries.map(([name, val]: [string, any]) => ({
        name,
        label: name,                     // support both props (depends on your PieChartComponent)
        value: Number(val?.amount ?? val?.value ?? 0),
        percentage: Number(val?.percentage ?? 0),
      }));

      const isBucket = asItems.every(i => BUCKET_ORDER.includes(i.name));
      return (isBucket
        ? BUCKET_ORDER.map(n => asItems.find(i => i.name === n) || { name: n, label: n, value: 0 })
        : asItems.sort((a, b) => b.value - a.value)
      );
    }

    // If it's a simple key:number map
    const simple = Object.entries(raw)
      .filter(([, v]) => typeof v === 'number')
      .map(([name, value]) => ({ name, label: name, value: Number(value) }));

    if (simple.length) {
      const isBucket = simple.every(i => BUCKET_ORDER.includes(i.name));
      return isBucket
        ? BUCKET_ORDER.map(n => simple.find(i => i.name === n) || { name: n, label: n, value: 0 })
        : simple.sort((a, b) => b.value - a.value);
    }
  }

  // Fallback
  return [];
};
}
