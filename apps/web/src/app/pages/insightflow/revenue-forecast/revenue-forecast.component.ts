import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { GlobalFiltersValue } from '../../../shared/components/global-filters/global-filters.models';
import {
  RevenueForecastService,
  ForecastFilters,
} from '../../../core/services/revenue-forecast.service';
import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';

interface CollectionRow {
  month: string;
  collections: number;
  charges: number;
  denialRate: number;
  confidence: number | null;
  type: 'Historical' | 'Forecast';
}

interface ArAgingRow {
  period: string;
  ar0to30: number;
  ar31to60: number;
  ar61to90: number;
  ar90plus: number;
}

@Component({
    selector: 'app-revenue-forecast',
    templateUrl: './revenue-forecast.component.html',
    styleUrls: ['./revenue-forecast.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RevenueForecastComponent implements OnInit, OnDestroy {
  loading = true;
  error = false;

  collectionsRows: CollectionRow[] = [];
  arAgingRows: ArAgingRow[] = [];
  denialRows: any[] = [];

  private destroy$ = new Subject<void>();

  collectionsColumns: AdvancedTableColumnConfig<CollectionRow>[] = [
    { id: 'month',      header: 'Month',       type: 'text',     sortable: true, width: '120px', accessor: r => r.month },
    { id: 'type',       header: 'Type',        type: 'text',     sortable: true, width: '110px', accessor: r => r.type },
    { id: 'collections', header: 'Collections', type: 'currency', sortable: true, align: 'end', sortAccessor: r => r.collections, accessor: r => r.collections },
    { id: 'charges',    header: 'Charges',     type: 'currency', sortable: true, align: 'end', sortAccessor: r => r.charges,     accessor: r => r.charges },
    { id: 'denialRate', header: 'Denial Rate', type: 'text',     sortable: true, align: 'end', sortAccessor: r => r.denialRate,  accessor: r => `${(r.denialRate ?? 0).toFixed(1)}%` },
    { id: 'confidence', header: 'Confidence',  type: 'text',     sortable: true, align: 'end', sortAccessor: r => r.confidence ?? -1, accessor: r => r.confidence == null ? '\u2014' : `${((r.confidence) * 100).toFixed(0)}%` },
  ];

  arAgingColumns: AdvancedTableColumnConfig<ArAgingRow>[] = [
    { id: 'period',   header: 'Period',      type: 'text',     width: '180px', accessor: r => r.period },
    { id: 'ar0to30',  header: '0\u201330 Days',   type: 'currency', sortable: true, align: 'end', sortAccessor: r => r.ar0to30,  accessor: r => r.ar0to30  },
    { id: 'ar31to60', header: '31\u201360 Days',  type: 'currency', sortable: true, align: 'end', sortAccessor: r => r.ar31to60, accessor: r => r.ar31to60 },
    { id: 'ar61to90', header: '61\u201390 Days',  type: 'currency', sortable: true, align: 'end', sortAccessor: r => r.ar61to90, accessor: r => r.ar61to90 },
    { id: 'ar90plus', header: '90+ Days',    type: 'currency', sortable: true, align: 'end', sortAccessor: r => r.ar90plus,  accessor: r => r.ar90plus  },
  ];

  denialColumns: AdvancedTableColumnConfig<any>[] = [
    { id: 'payer',                header: 'Payer',             type: 'text',     sortable: true, filterable: true, accessor: r => r.payer },
    { id: 'totalClaims',          header: 'Total Claims',      type: 'number',   sortable: true, align: 'end', accessor: r => r.totalClaims },
    { id: 'deniedClaims',         header: 'Denied Claims',     type: 'number',   sortable: true, align: 'end', accessor: r => r.deniedClaims },
    { id: 'denialRate',           header: 'Denial Rate',       type: 'text',     sortable: true, align: 'end', sortAccessor: r => r.denialRate, accessor: r => `${(r.denialRate ?? 0).toFixed(1)}%` },
    { id: 'atRiskAmount',         header: 'At-Risk Amount',    type: 'currency', sortable: true, align: 'end', sortAccessor: r => r.atRiskAmount, accessor: r => r.atRiskAmount },
    { id: 'projectedDenials30Day', header: 'Projected (30d)',  type: 'number',   sortable: true, align: 'end', accessor: r => r.projectedDenials30Day },
  ];

  constructor(
    private svc: RevenueForecastService,
    private globalFiltersStore: GlobalFiltersStore,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    setTimeout(() => this.loadData(this.globalFiltersStore.value), 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(gf?: GlobalFiltersValue): void {
    this.loading = true;
    this.error = false;
    this.cdr.markForCheck();

    const filters = this.buildFilters(gf ?? this.globalFiltersStore.value);

    forkJoin({
      collections: this.svc.forecastCollections(filters).pipe(catchError(() => of(null))),
      arAging:     this.svc.forecastArAging(filters).pipe(    catchError(() => of(null))),
      denialTrend: this.svc.forecastDenialTrend(filters).pipe(catchError(() => of(null))),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        const c = res.collections;
        this.collectionsRows = c ? [
          ...c.historical.map(h => ({ month: h.month, collections: h.collections, charges: h.charges, denialRate: h.denialRate, confidence: null as null, type: 'Historical' as const })),
          ...c.forecast.map(f => ({ month: f.month, collections: f.predictedCollections, charges: f.predictedCharges, denialRate: f.predictedDenialRate, confidence: f.confidence, type: 'Forecast' as const })),
        ] : [];
        const a = res.arAging;
        this.arAgingRows = a ? [
          { period: 'Current',         ar0to30: a.current.ar0to30 ?? 0,      ar31to60: a.current.ar31to60 ?? 0,      ar61to90: a.current.ar61to90 ?? 0,      ar90plus: a.current.ar90plus ?? 0      },
          { period: '30-Day Forecast', ar0to30: a.forecast30day.ar0to30,      ar31to60: a.forecast30day.ar31to60,      ar61to90: a.forecast30day.ar61to90,      ar90plus: a.forecast30day.ar90plus      },
          { period: '60-Day Forecast', ar0to30: a.forecast60day.ar0to30,      ar31to60: a.forecast60day.ar31to60,      ar61to90: a.forecast60day.ar61to90,      ar90plus: a.forecast60day.ar90plus      },
        ] : [];
        this.denialRows  = res.denialTrend?.payers ?? [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = true;
        this.cdr.markForCheck();
      },
    });
  }

  private buildFilters(gf: GlobalFiltersValue): ForecastFilters {
    const loc = gf.location;
    const groupsData = this.globalFiltersStore.options.groupsData ?? [];

    let practiceGroups: string[] | 'all' = 'all';
    let location: string[] | 'all' = 'all';

    if (loc.scope === 'group') {
      const names = (loc as any).groups.flatMap((gName: string) => {
        const g = groupsData.find((x: any) => x.name === gName);
        return g ? g.practices.map((p: any) => p.name as string) : [];
      });
      practiceGroups = names.length ? names : 'all';
    } else if (loc.scope === 'practice') {
      practiceGroups = (loc as any).practices;
    } else if (loc.scope === 'location') {
      location = (loc as any).locations;
    }

    return {
      practice_groups: practiceGroups,
      location,
      provider: gf.providers.length ? gf.providers : 'all',
      payer:    gf.payers.length    ? gf.payers    : 'all',
      date_of_service: {
        start_date: gf.startDate ? gf.startDate.toISOString().slice(0, 10) : '',
        end_date:   gf.endDate   ? gf.endDate.toISOString().slice(0, 10)   : '',
      },
    };
  }
}
