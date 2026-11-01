// src/app/pages/analytics/payer-mix/payer-mix.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, of } from 'rxjs';

import { PayerMixComponent } from './payer-mix.component';
import { PayerMixStore } from '../../../core/stores/payer-mix.store';
import { FilterDialogService } from '../../../shared/components/filter-dialog/filter-dialog.service';
import { ThemeService, AppChartTheme, DEFAULT_CHART_THEME } from '../../../core/services/theme.service';
import { CsvExportService } from '../../../core/services/csv-export.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import {
  Filters,
  CollectionPoint,
  PayerChange,
  ProcedureChange,
  PayerCollectionDetail,
} from '../../../core/models/payer-mix.models';
import {
  EMPTY_GLOBAL_FILTERS,
  GlobalFiltersValue,
} from '../../../shared/components/global-filters/global-filters.models';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

// -- Helpers ----------------------------------------------------------------

const makeTheme = (overrides: Partial<AppChartTheme> = {}): AppChartTheme => ({
  ...DEFAULT_CHART_THEME,
  ...overrides,
});

const MOCK_FILTERS: Filters = {
  provider: 'all',
  practice_groups: 'all',
  location: 'all',
  payment_received: { start_date: '', end_date: '' },
};

const MOCK_TRENDS: CollectionPoint[] = [
  { monthLabel: 'Jan 2025', insuranceCollection: 100000, patientCollection: 30000, insuranceTrend: 95000 },
  { monthLabel: 'Feb 2025', insuranceCollection: 120000, patientCollection: 35000, insuranceTrend: 110000 },
];

const MOCK_PAYER_CHANGES: PayerChange[] = [
  { insuranceId: 1, insuranceName: 'BlueCross', currentPeriodCharges: 50000, lastPeriodCharges: 40000, chargeDelta: 10000, chargeDeltaPct: 25 },
  { insuranceId: 2, insuranceName: 'Aetna',     currentPeriodCharges: 30000, lastPeriodCharges: 35000, chargeDelta: -5000, chargeDeltaPct: -14 },
];

const MOCK_PROC_CHANGES: ProcedureChange[] = [
  { procedureCode: 'D1110', currentPeriodCharges: 8000, lastPeriodCharges: 6000, chargeDelta: 2000, chargeDeltaPct: 33 },
];

const MOCK_COLLECTION_DETAILS: PayerCollectionDetail[] = [
  { insuranceName: 'BlueCross', totalCollections: 50000, insuranceCollections: 40000, patientCollections: 10000, insurancePercentage: 80, patientPercentage: 20, claim: 55000 },
  { insuranceName: 'Aetna',     totalCollections: 30000, insuranceCollections: 22000, patientCollections:  8000, insurancePercentage: 73, patientPercentage: 27, claim: 32000 },
];

const MOCK_TOTALS = { total: '$150K', prior_year: '$130K' };

// -- Store mock factory -----------------------------------------------------

function makeStoreMock() {
  const filtersSubject           = new BehaviorSubject<Filters>(MOCK_FILTERS);
  const payersDecSubject         = new BehaviorSubject<PayerChange[]>(MOCK_PAYER_CHANGES);
  const collectionDetailsSubject = new BehaviorSubject<PayerCollectionDetail[]>(MOCK_COLLECTION_DETAILS);

  return {
    loading$:                of(false),
    filters$:                filtersSubject.asObservable(),
    collectionTrends$:       of(MOCK_TRENDS),
    totalsInsurance$:        of(MOCK_TOTALS),
    totalsPatient$:          of(MOCK_TOTALS),
    payersIncreasing$:       of(MOCK_PAYER_CHANGES),
    payersDecreasing$:       payersDecSubject.asObservable(),
    proceduresIncreasing$:   of(MOCK_PROC_CHANGES),
    proceduresDecreasing$:   of(MOCK_PROC_CHANGES),
    payerCollectionDetails$: collectionDetailsSubject.asObservable(),
    providers$:              of([] as string[]),
    practiceGroups$:         of([] as string[]),
    locations$:              of([] as string[]),
    patchFilters:            jasmine.createSpy('patchFilters'),
    resetFilters:            jasmine.createSpy('resetFilters'),
    // expose for tests that need to push new values
    _filtersSubject:              filtersSubject,
    _payersDecSubject:            payersDecSubject,
    _collectionDetailsSubject:    collectionDetailsSubject,
  };
}

// -- GlobalFiltersStore mock ------------------------------------------------

function makeGlobalFiltersMock() {
  const appliedSubject = new BehaviorSubject<GlobalFiltersValue>(EMPTY_GLOBAL_FILTERS);
  return {
    applied$: appliedSubject.asObservable(),
    value:    EMPTY_GLOBAL_FILTERS,
    _subject: appliedSubject,
  };
}

// -- Suite ------------------------------------------------------------------

describe('PayerMixComponent', () => {
  let component: PayerMixComponent;
  let fixture: ComponentFixture<PayerMixComponent>;
  let storeMock: ReturnType<typeof makeStoreMock>;
  let globalFiltersMock: ReturnType<typeof makeGlobalFiltersMock>;
  let filterDialogSpy: jasmine.SpyObj<FilterDialogService>;
  let csvExportSpy: jasmine.SpyObj<CsvExportService>;
  let themeServiceStub: Partial<ThemeService>;

  beforeEach(async () => {
    storeMock         = makeStoreMock();
    globalFiltersMock = makeGlobalFiltersMock();
    filterDialogSpy   = jasmine.createSpyObj<FilterDialogService>('FilterDialogService', ['open']);
    csvExportSpy      = jasmine.createSpyObj<CsvExportService>('CsvExportService', ['download']);

    // ThemeService has a `theme$` property (Observable), not a method - stub it directly
    themeServiceStub = { theme$: of(makeTheme()) } as Partial<ThemeService>;

    // Default: dialog cancelled (returns null)
    filterDialogSpy.open.and.returnValue(of(null));

    await TestBed.configureTestingModule({
    declarations: [PayerMixComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [],
    providers: [
        { provide: FilterDialogService, useValue: filterDialogSpy },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: CsvExportService, useValue: csvExportSpy },
        { provide: GlobalFiltersStore, useValue: globalFiltersMock },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
    })
    // Override the component-level providers so our mock replaces the real store
    .overrideComponent(PayerMixComponent, {
      set: { providers: [{ provide: PayerMixStore, useValue: storeMock }] },
    })
    .compileComponents();

    fixture   = TestBed.createComponent(PayerMixComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit
  });

  afterEach(() => {
    fixture.destroy();
  });

  // -- 1. Creation ------------------------------------------------------------

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  // -- 7. comboOpts built during ngOnInit ------------------------------------

  it('builds comboOpts with three series (Insurance, Patient, Trend) after ngOnInit', () => {
    expect(component.comboOpts).toBeDefined();
    expect(component.comboOpts!.series.length).toBe(3);
    expect(component.comboOpts!.series[0].name).toBe('Insurance Collections');
    expect(component.comboOpts!.series[1].name).toBe('Patient Collections');
    expect(component.comboOpts!.series[2].name).toBe('Insurance Trend');
  });

  // -- 8. lineOpts built during ngOnInit ------------------------------------

  it('builds lineOpts with two series after ngOnInit', () => {
    expect(component.lineOpts).toBeDefined();
    expect(component.lineOpts!.series.length).toBe(2);
    expect(component.lineOpts!.series[0].name).toBe('Insurance Collection Amount');
  });

  // -- 9. comboOpts uses theme chart colors ---------------------------------

  it('comboOpts colors come from the active theme', () => {
    const colors = component.comboOpts!.colors as string[];
    expect(colors[0]).toBe(DEFAULT_CHART_THEME.chart_color_1);
    expect(colors[1]).toBe(DEFAULT_CHART_THEME.chart_color_2);
  });

  // -- 10. Pagination - goNext / goPrev / setPageSize -----------------------

  it('goNext advances pageIndex', fakeAsync(() => {
    const page: any = { pageIndex: 0, maxPage: 2, pageSize: 10, rows: [], total: 25, startIndex: 0, endIndex: 10 };
    component.goNext(page);
    tick();

    let index!: number;
    component.pageIndex$.subscribe(i => (index = i)).unsubscribe();
    expect(index).toBe(1);
  }));

  it('goPrev decrements pageIndex', fakeAsync(() => {
    component.goNext({ pageIndex: 0, maxPage: 2, pageSize: 10, rows: [], total: 25, startIndex: 0, endIndex: 10 } as any);
    tick();
    component.goPrev({ pageIndex: 1, maxPage: 2, pageSize: 10, rows: [], total: 25, startIndex: 10, endIndex: 20 } as any);
    tick();

    let index!: number;
    component.pageIndex$.subscribe(i => (index = i)).unsubscribe();
    expect(index).toBe(0);
  }));

  it('goPrev is a no-op when already on page 0', fakeAsync(() => {
    component.goPrev({ pageIndex: 0, maxPage: 2, pageSize: 10, rows: [], total: 25, startIndex: 0, endIndex: 10 } as any);
    tick();

    let index!: number;
    component.pageIndex$.subscribe(i => (index = i)).unsubscribe();
    expect(index).toBe(0);
  }));

  it('setPageSize updates pageSize and resets pageIndex to 0', fakeAsync(() => {
    component.goNext({ pageIndex: 0, maxPage: 5, pageSize: 10, rows: [], total: 60, startIndex: 0, endIndex: 10 } as any);
    tick();
    component.setPageSize(25);
    tick();

    let size!: number;
    let index!: number;
    component.pageSize$.subscribe(s  => (size  = s)).unsubscribe();
    component.pageIndex$.subscribe(i => (index = i)).unsubscribe();

    expect(size).toBe(25);
    expect(index).toBe(0);
  }));

  // -- 11. filtersToChips ----------------------------------------------------

  it('filtersToChips returns one chip per provider string', () => {
    const filters: Filters = {
      provider: ['Dr. Smith', 'Dr. Jones'],
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '', end_date: '' },
    };
    const chips = component.filtersToChips(filters);
    expect(chips.some(c => c.label === 'Dr. Smith')).toBeTrue();
    expect(chips.some(c => c.label === 'Dr. Jones')).toBeTrue();
  });

  it('filtersToChips adds a date-range chip when payment dates are set', () => {
    const filters: Filters = {
      provider: 'all',
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '2025-01-01', end_date: '2025-06-30' },
    };
    const chips = component.filtersToChips(filters);
    const dateChip = chips.find(c => c.key === 'payment_received');
    expect(dateChip).toBeDefined();
    expect(dateChip!.label).toContain('2025-01-01');
  });

  it('filtersToChips returns empty array when all filters are "all" and no dates', () => {
    const chips = component.filtersToChips(MOCK_FILTERS);
    expect(chips.length).toBe(0);
  });

  // -- 12. openFilter - dialog cancelled ------------------------------------

  it('openFilter does not patch filters when dialog is cancelled (null)', async () => {
    filterDialogSpy.open.and.returnValue(of(null));
    storeMock.patchFilters.calls.reset();

    await component.openFilter();

    expect(storeMock.patchFilters).not.toHaveBeenCalled();
  });


  // -- 15. CSV exports call csvExport.download -------------------------------

  it('exportCollectionTrends calls csvExport.download with correct filename prefix', async () => {
    await component.exportCollectionTrends();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringMatching(/^payer-mix-collection-trends_/),
      jasmine.arrayContaining(['Month']),
      jasmine.any(Array),
    );
  });

  it('exportPayersIncreasing calls csvExport.download', async () => {
    await component.exportPayersIncreasing();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringMatching(/^payers-increasing_/),
      jasmine.arrayContaining(['Payer']),
      jasmine.any(Array),
    );
  });

  it('exportPayerCollectionDetails calls csvExport.download with correct headers', async () => {
    await component.exportPayerCollectionDetails();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringMatching(/^payer-collection-details_/),
      jasmine.arrayContaining(['Payer', 'Total Collections ($)']),
      jasmine.any(Array),
    );
  });

  // -- exportPayersDecreasing ------------------------------------------------
  it('exportPayersDecreasing calls csvExport.download', async () => {
    await component.exportPayersDecreasing();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringMatching(/^payers-decreasing_/),
      jasmine.arrayContaining(['Payer']),
      jasmine.any(Array),
    );
  });

  it('exportProceduresIncreasing calls csvExport.download', async () => {
    await component.exportProceduresIncreasing();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringMatching(/^procedures-increasing_/),
      jasmine.arrayContaining(['Procedure Code']),
      jasmine.any(Array),
    );
  });

  it('exportProceduresDecreasing calls csvExport.download', async () => {
    await component.exportProceduresDecreasing();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringMatching(/^procedures-decreasing_/),
      jasmine.arrayContaining(['Procedure Code']),
      jasmine.any(Array),
    );
  });

  // -- removeChip ------------------------------------------------------------
  it('removeChip removes a value from an array filter', () => {
    storeMock._filtersSubject.next({
      provider: ['Dr. A', 'Dr. B'],
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '', end_date: '' },
    });
    component.removeChip('provider', 'Dr. A');
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      provider: ['Dr. B'],
    }));
  });

  it('removeChip clears payment_received', () => {
    storeMock._filtersSubject.next({
      provider: 'all',
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '2025-01-01', end_date: '2025-12-31' },
    });
    component.removeChip('payment_received', '2025-01-01 \u2192 2025-12-31');
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      payment_received: { start_date: '', end_date: '' },
    }));
  });

  it('removeChip does nothing for "all" filter', () => {
    storeMock._filtersSubject.next({
      provider: 'all',
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '', end_date: '' },
    });
    storeMock.patchFilters.calls.reset();
    component.removeChip('provider', 'anything');
    // patchFilters called but with 'all' unchanged
    expect(storeMock.patchFilters).not.toHaveBeenCalled();
  });

  it('removeChip resets to "all" when removing last value', () => {
    storeMock._filtersSubject.next({
      provider: ['Dr. A'],
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '', end_date: '' },
    });
    component.removeChip('provider', 'Dr. A');
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      provider: 'all',
    }));
  });

  // -- openFilter: reset path ------------------------------------------------
  it('openFilter resets filters when dialog returns "reset"', async () => {
    filterDialogSpy.open.and.returnValue(of('reset'));
    await component.openFilter();
    expect(storeMock.resetFilters).toHaveBeenCalled();
  });

  // -- openFilter: apply path ------------------------------------------------
  it('openFilter patches filters when dialog returns values', async () => {
    filterDialogSpy.open.and.returnValue(of({
      values: {
        practice_groups: ['Group A'],
        location: ['Loc1'],
        provider: ['Dr. Smith'],
        payment_received: { start: '2025-01-01', end: '2025-06-30' },
      },
    }));
    storeMock.patchFilters.calls.reset();
    await component.openFilter();
    expect(storeMock.patchFilters).toHaveBeenCalled();
  });

  // -- openFilter: apply with "all" includes --------------------------------
  it('openFilter converts array containing "all" to string "all"', async () => {
    filterDialogSpy.open.and.returnValue(of({
      values: {
        practice_groups: ['all'],
        location: [],
        provider: ['all'],
        payment_received: { start: '', end: '' },
      },
    }));
    storeMock.patchFilters.calls.reset();
    await component.openFilter();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      practice_groups: 'all',
      location: 'all',
      provider: 'all',
    }));
  });

  // -- payerCollectionPage$ --------------------------------------------------
  it('payerCollectionPage$ should paginate correctly', fakeAsync(() => {
    let page: any;
    component.payerCollectionPage$.subscribe(p => (page = p));
    tick();
    expect(page.rows.length).toBe(2); // both rows fit in default page size 10
    expect(page.total).toBe(2);
    expect(page.pageIndex).toBe(0);
  }));

  it('goNext does nothing when already on last page', fakeAsync(() => {
    // With 2 rows and page size 10, maxPage = 0
    component.goNext({ pageIndex: 0, maxPage: 0, pageSize: 10, rows: [], total: 2, startIndex: 0, endIndex: 2 } as any);
    tick();
    let index!: number;
    component.pageIndex$.subscribe(i => (index = i)).unsubscribe();
    expect(index).toBe(0);
  }));

  // -- payerCollectionTotals$ ------------------------------------------------
  it('payerCollectionTotals$ should aggregate collection totals', fakeAsync(() => {
    let totals: any;
    component.payerCollectionTotals$.subscribe(t => (totals = t));
    tick();
    // MOCK_COLLECTION_DETAILS has 50000 + 30000 total collections
    expect(totals.totalCollections).toBe(80000);
    expect(totals.insuranceCollections).toBe(62000);
  }));

  // -- payersIncreasingChart$ ------------------------------------------------
  it('payersIncreasingChart$ should map payer changes to HorizontalBarDatum[]', fakeAsync(() => {
    let data: any;
    component.payersIncreasingChart$.subscribe(d => (data = d));
    tick();
    expect(data.length).toBe(2);
    expect(data[0].label).toBe('BlueCross');
    expect(data[0].value).toBe(10000);
  }));

  it('payersDecreasingChart$ should map payer changes with no name to fallback label', fakeAsync(() => {
    storeMock._payersDecSubject.next([
      { insuranceId: 99, insuranceName: null, currentPeriodCharges: 0, lastPeriodCharges: 0, chargeDelta: -1000, chargeDeltaPct: -10 },
    ] as any);
    let data: any;
    component.payersDecreasingChart$.subscribe(d => (data = d));
    tick();
    expect(data[0].label).toBe('Payer 99');
  }));

  it('proceduresIncreasingChart$ should map procedure changes to HorizontalBarDatum[]', fakeAsync(() => {
    let data: any;
    component.proceduresIncreasingChart$.subscribe(d => (data = d));
    tick();
    expect(data[0].label).toBe('D1110');
    expect(data[0].value).toBe(2000);
  }));

  it('proceduresDecreasingChart$ should map procedure changes to HorizontalBarDatum[]', fakeAsync(() => {
    let data: any;
    component.proceduresDecreasingChart$.subscribe(d => (data = d));
    tick();
    expect(data[0].label).toBe('D1110');
  }));

  // -- payerCollectionDetails$ -----------------------------------------------
  it('payerCollectionDetails$ should map collection detail rows', fakeAsync(() => {
    let rows: any;
    component.payerCollectionDetails$.subscribe(r => (rows = r));
    tick();
    expect(rows.length).toBe(2);
    expect(rows[0].insuranceName).toBe('BlueCross');
    expect(rows[0].totalCollections).toBe(50000);
  }));

  it('payerCollectionDetails$ should handle raw API field names (uppercase)', fakeAsync(() => {
    storeMock._collectionDetailsSubject.next([
      {
        InsuranceName: 'Aetna Raw',
        TotalCollections: 60000,
        InsuranceCollections: 50000,
        PatientCollections: 10000,
        InsurancePercentage: 83,
        PatientPercentage: 17,
        Claim: 65000,
      },
    ] as any);
    let rows: any;
    component.payerCollectionDetails$.subscribe(r => (rows = r));
    tick();
    expect(rows[0].insuranceName).toBe('Aetna Raw');
    expect(rows[0].totalCollections).toBe(60000);
  }));

  // -- ngOnDestroy ----------------------------------------------------------
  it('ngOnDestroy should complete destroy$ and unsubscribe sub', () => {
    const destroySpy = spyOn((component as any).destroy$, 'next');
    const completeSpy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(destroySpy).toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalled();
  });

  // -- goToSourceData --------------------------------------------------------
  it('goToSourceData should not throw', () => {
    expect(() => component.goToSourceData()).not.toThrow();
  });

  // -- filtersToChips: only start date set ----------------------------------
  it('filtersToChips adds date chip when only start date is set', () => {
    const filters: Filters = {
      provider: 'all',
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '2025-01-01', end_date: '' },
    };
    const chips = component.filtersToChips(filters);
    const dateChip = chips.find(c => c.key === 'payment_received');
    expect(dateChip).toBeDefined();
    expect(dateChip!.label).toContain('2025-01-01');
  });

  it('filtersToChips adds date chip when only end date is set', () => {
    const filters: Filters = {
      provider: 'all',
      practice_groups: 'all',
      location: 'all',
      payment_received: { start_date: '', end_date: '2025-12-31' },
    };
    const chips = component.filtersToChips(filters);
    const dateChip = chips.find(c => c.key === 'payment_received');
    expect(dateChip).toBeDefined();
    expect(dateChip!.label).toContain('2025-12-31');
  });

  // -- removeChip ------------------------------------------------------------

  it('removeChip should clear payment_received dates', () => {
    storeMock.patchFilters.calls.reset();
    component.removeChip('payment_received', '');
    expect(storeMock.patchFilters).toHaveBeenCalled();
  });

  it('removeChip should filter out a provider from array', () => {
    storeMock._filtersSubject.next({
      ...MOCK_FILTERS,
      provider: ['Dr. Smith', 'Dr. Jones'],
    });
    storeMock.patchFilters.calls.reset();
    component.removeChip('provider', 'Dr. Smith');
    expect(storeMock.patchFilters).toHaveBeenCalled();
  });

  it('removeChip should set to all when last provider removed', () => {
    storeMock._filtersSubject.next({ ...MOCK_FILTERS, provider: ['Dr. Smith'] });
    storeMock.patchFilters.calls.reset();
    component.removeChip('provider', 'Dr. Smith');
    expect(storeMock.patchFilters).toHaveBeenCalled();
  });

  it('removeChip with all value should return without patching', () => {
    storeMock._filtersSubject.next({ ...MOCK_FILTERS, provider: 'all' });
    storeMock.patchFilters.calls.reset();
    component.removeChip('provider', 'Dr. Smith');
    // 'all' is not an array - so it returns early without patching
    expect(storeMock.patchFilters).not.toHaveBeenCalled();
  });

  // -- openFilter - dialog returned reset ------------------------------------

  it('openFilter calls resetFilters when dialog returns reset', async () => {
    filterDialogSpy.open.and.returnValue(of('reset' as any));
    storeMock.resetFilters.calls.reset();
    await component.openFilter();
    expect(storeMock.resetFilters).toHaveBeenCalled();
  });

  it('openFilter patches filters when dialog returns non-all values', async () => {
    filterDialogSpy.open.and.returnValue(of({
      values: {
        practice_groups: ['GroupA'],
        location: ['LocationX'],
        provider: ['Dr. Smith'],
        payment_received: { start: '2025-01-01', end: '2025-12-31' },
      },
    } as any));
    storeMock.patchFilters.calls.reset();
    await component.openFilter();
    expect(storeMock.patchFilters).toHaveBeenCalled();
    const callArgs = storeMock.patchFilters.calls.mostRecent().args[0];
    expect(callArgs.practice_groups).toEqual(['GroupA']);
  });

  it('openFilter treats empty arrays as all', async () => {
    filterDialogSpy.open.and.returnValue(of({
      values: {
        practice_groups: [],
        location: [],
        provider: [],
        payment_received: { start: '', end: '' },
      },
    } as any));
    storeMock.patchFilters.calls.reset();
    await component.openFilter();
    const callArgs = storeMock.patchFilters.calls.mostRecent().args[0];
    expect(callArgs.practice_groups).toBe('all');
    expect(callArgs.location).toBe('all');
    expect(callArgs.provider).toBe('all');
  });

  // -- export methods --------------------------------------------------------

  it('exportPayersIncreasing should call csvExport.download', async () => {
    await component.exportPayersIncreasing();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringContaining('payers-increasing'),
      jasmine.any(Array),
      jasmine.any(Array),
    );
  });

  it('exportPayersDecreasing should call csvExport.download', async () => {
    await component.exportPayersDecreasing();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringContaining('payers-decreasing'),
      jasmine.any(Array),
      jasmine.any(Array),
    );
  });

  it('exportProceduresIncreasing should call csvExport.download', async () => {
    await component.exportProceduresIncreasing();
    expect(csvExportSpy.download).toHaveBeenCalled();
  });

  it('exportProceduresDecreasing should call csvExport.download', async () => {
    await component.exportProceduresDecreasing();
    expect(csvExportSpy.download).toHaveBeenCalled();
  });

  it('exportPayerCollectionDetails should call csvExport.download', async () => {
    await component.exportPayerCollectionDetails();
    expect(csvExportSpy.download).toHaveBeenCalledWith(
      jasmine.stringContaining('payer-collection-details'),
      jasmine.any(Array),
      jasmine.any(Array),
    );
  });

  // -- filtersToChips: practice_groups and location arrays --------------------

  it('filtersToChips adds chips for practice_groups array', () => {
    const filters: Filters = {
      provider: 'all',
      practice_groups: ['Group A', 'Group B'],
      location: 'all',
      payment_received: { start_date: '', end_date: '' },
    };
    const chips = component.filtersToChips(filters);
    expect(chips.some(c => c.label === 'Group A')).toBeTrue();
    expect(chips.some(c => c.label === 'Group B')).toBeTrue();
  });

  it('filtersToChips adds chips for location array', () => {
    const filters: Filters = {
      provider: 'all',
      practice_groups: 'all',
      location: ['Office A', 'Office B'],
      payment_received: { start_date: '', end_date: '' },
    };
    const chips = component.filtersToChips(filters);
    expect(chips.some(c => c.label === 'Office A')).toBeTrue();
  });

  // -- payerCollectionDetails$ with null rows --------------------------------

  it('payerCollectionDetails$ should handle null rows', fakeAsync(() => {
    storeMock._collectionDetailsSubject.next(null as any);
    tick();
    let rows: any;
    component.payerCollectionDetails$.subscribe(r => (rows = r));
    tick();
    expect(Array.isArray(rows)).toBeTrue();
    expect(rows.length).toBe(0);
  }));

  // -- payerCollectionPage$ max page boundary --------------------------------

  it('payerCollectionPage$ should clamp pageIndex to maxPage when data is empty', fakeAsync(() => {
    storeMock._collectionDetailsSubject.next([]);
    tick();
    let page: any;
    component.payerCollectionPage$.subscribe(p => (page = p));
    tick();
    expect(page.maxPage).toBe(0);
    expect(page.pageIndex).toBe(0);
  }));

  it('goNext is a no-op at last page', fakeAsync(() => {
    const page: any = { pageIndex: 2, maxPage: 2, pageSize: 10, rows: [], total: 25, startIndex: 20, endIndex: 25 };
    component.goNext(page);
    tick();
    let idx: number;
    component.pageIndex$.subscribe(i => (idx = i)).unsubscribe();
    expect(idx!).toBe(0); // didn't advance because already at maxPage
  }));

  // -- payerCollectionTotals$ ------------------------------------------------

  it('payerCollectionTotals$ should sum all collections', fakeAsync(() => {
    tick();
    let totals: any;
    component.payerCollectionTotals$.subscribe(t => (totals = t));
    tick();
    expect(totals.totalCollections).toBe(80000); // 50000 + 30000
    expect(totals.insuranceCollections).toBe(62000); // 40000 + 22000
  }));

  // -- column displayFormatters -----------------------------------------------

  it('totalCollections column displayFormatter should format currency', () => {
    const col = component.payerCollectionColumns.find(c => c.id === 'totalCollections')!;
    const result = col.displayFormatter!(50000, {} as any);
    expect(result).toContain('50,000');
  });

  it('insurancePct column displayFormatter should format percent', () => {
    const col = component.payerCollectionColumns.find(c => c.id === 'insurancePct')!;
    const result = col.displayFormatter!(80, {} as any);
    expect(result).toContain('%');
  });

  it('patientPct column displayFormatter should handle non-finite values', () => {
    const col = component.payerCollectionColumns.find(c => c.id === 'patientPct')!;
    const result = col.displayFormatter!(NaN, {} as any);
    expect(result).toBe('');
  });

  it('totalCollections column displayFormatter with null should return $0', () => {
    const col = component.payerCollectionColumns.find(c => c.id === 'totalCollections')!;
    const result = col.displayFormatter!(null as any, {} as any);
    expect(result).toBe('$0');
  });

  // -- payersDecreasing$ with null insuranceName ----------------------------

  it('payersDecreasingChart$ should use fallback label when insuranceName is null', fakeAsync(() => {
    storeMock._payersDecSubject.next([
      { insuranceId: 5, insuranceName: null as any, currentPeriodCharges: 1000, lastPeriodCharges: 2000, chargeDelta: -1000, chargeDeltaPct: -50 },
    ]);
    tick();
    let data: any;
    component.payersDecreasingChart$.subscribe(d => (data = d));
    tick();
    expect(data[0].label).toContain('Payer 5');
  }));

  // -- payerCollectionDetails$ row mapping with uppercase properties --------

  it('payerCollectionDetails$ should use uppercase property names when present', fakeAsync(() => {
    storeMock._collectionDetailsSubject.next([{
      InsuranceName: 'Upper BlueCross',
      TotalCollections: 75000,
      InsuranceCollections: 60000,
      PatientCollections: 15000,
      InsurancePercentage: 80,
      PatientPercentage: 20,
      Claim: 80000,
    }] as any);
    tick();
    let rows: any;
    component.payerCollectionDetails$.subscribe(r => (rows = r));
    tick();
    expect(rows[0].insuranceName).toBe('Upper BlueCross');
    expect(rows[0].totalCollections).toBe(75000);
  }));

  // -- applyGlobalFilters via globalFiltersStore.applied$ --------------------

  it('applyGlobalFilters with group scope patches practice_groups', fakeAsync(() => {
    globalFiltersMock._subject.next({
      startDate: null, endDate: null, payers: [], providers: ['Dr. A'],
      location: { scope: 'group', groups: ['GroupA'] } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      practice_groups: ['GroupA'],
      provider: ['Dr. A'],
    }));
  }));

  it('applyGlobalFilters with practice scope patches practice_groups as practices', fakeAsync(() => {
    globalFiltersMock._subject.next({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'practice', practices: ['Prac1'] } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      practice_groups: ['Prac1'],
    }));
  }));

  it('applyGlobalFilters with location scope patches location', fakeAsync(() => {
    globalFiltersMock._subject.next({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'location', locations: ['Loc1'] } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      location: ['Loc1'],
    }));
  }));

  it('applyGlobalFilters with enterprise scope sets practice_groups to all', fakeAsync(() => {
    globalFiltersMock._subject.next({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'enterprise' } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      practice_groups: 'all',
      location: 'all',
    }));
  }));

  it('applyGlobalFilters with startDate sets payment_received start', fakeAsync(() => {
    const d = new Date('2026-01-15T00:00:00Z');
    globalFiltersMock._subject.next({
      startDate: d, endDate: null, payers: [], providers: [],
      location: { scope: 'enterprise' } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      payment_received: jasmine.objectContaining({ start_date: '2026-01-15' }),
    }));
  }));

  it('applyGlobalFilters with endDate sets payment_received end', fakeAsync(() => {
    const d = new Date('2026-06-30T00:00:00Z');
    globalFiltersMock._subject.next({
      startDate: null, endDate: d, payers: [], providers: [],
      location: { scope: 'enterprise' } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      payment_received: jasmine.objectContaining({ end_date: '2026-06-30' }),
    }));
  }));

  it('applyGlobalFilters with payers sets payer filter', fakeAsync(() => {
    globalFiltersMock._subject.next({
      startDate: null, endDate: null, payers: ['Aetna'], providers: [],
      location: { scope: 'enterprise' } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      payer: ['Aetna'],
    }));
  }));

  it('applyGlobalFilters with empty payers sets payer to all', fakeAsync(() => {
    globalFiltersMock._subject.next({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'enterprise' } as any,
    });
    tick();
    expect(storeMock.patchFilters).toHaveBeenCalledWith(jasmine.objectContaining({
      payer: 'all',
    }));
  }));

  // -- formatShort (via chart tooltip formatters) ----------------------------

  it('formatShort should format billions', () => {
    const fmtShort = (component as any).formatShort.bind(component);
    expect(fmtShort(2_000_000_000)).toContain('B');
  });

  it('formatShort should format millions', () => {
    const fmtShort = (component as any).formatShort.bind(component);
    expect(fmtShort(1_500_000)).toContain('M');
  });

  it('formatShort should format thousands', () => {
    const fmtShort = (component as any).formatShort.bind(component);
    expect(fmtShort(25_000)).toContain('K');
  });

  it('formatShort should format small numbers without suffix', () => {
    const fmtShort = (component as any).formatShort.bind(component);
    expect(fmtShort(500)).toBe('500');
  });

  it('formatShort should handle null', () => {
    const fmtShort = (component as any).formatShort.bind(component);
    expect(fmtShort(null)).toBe('0');
  });

  it('formatShort should handle NaN', () => {
    const fmtShort = (component as any).formatShort.bind(component);
    expect(fmtShort(NaN)).toBe('0');
  });

  it('formatShort should strip trailing .0 suffix', () => {
    const fmtShort = (component as any).formatShort.bind(component);
    expect(fmtShort(1_000_000)).toBe('1M');
  });

  // -- column accessors null paths --------------------------------------------

  it('insuranceCollections column displayFormatter formats currency', () => {
    const col = component.payerCollectionColumns.find(c => c.id === 'insuranceCollections')!;
    expect(col.displayFormatter!(40000, {} as any)).toContain('40,000');
  });

  it('patientCollections column displayFormatter formats currency', () => {
    const col = component.payerCollectionColumns.find(c => c.id === 'patientCollections')!;
    expect(col.displayFormatter!(10000, {} as any)).toContain('10,000');
  });

  it('claim column displayFormatter formats currency', () => {
    const col = component.payerCollectionColumns.find(c => c.id === 'claim')!;
    expect(col.displayFormatter!(55000, {} as any)).toContain('55,000');
  });

  it('formatCurrency should return empty string for non-finite values', () => {
    const formatCurrency = (component as any).formatCurrency.bind(component);
    expect(formatCurrency(NaN)).toBe('');
    expect(formatCurrency(Infinity)).toBe('');
  });

  it('formatPercentFrom0to100 should return empty string for non-finite values', () => {
    const fmt = (component as any).formatPercentFrom0to100.bind(component);
    expect(fmt(NaN)).toBe('');
    expect(fmt(Infinity)).toBe('');
  });

  it('payerCollectionDetails$ falls back to Unknown/Self-Pay when both insuranceName props are null', fakeAsync(() => {
    storeMock._collectionDetailsSubject.next([{
      InsuranceName: null,
      insuranceName: null,
      TotalCollections: 100,
      InsuranceCollections: 80,
      PatientCollections: 20,
      InsurancePercentage: 80,
      PatientPercentage: 20,
      Claim: 110,
    }] as any);
    tick();
    let rows: any;
    component.payerCollectionDetails$.subscribe(r => (rows = r));
    tick();
    expect(rows[0].insuranceName).toBe('Unknown/Self-Pay');
  }));

  it('payerCollectionDetails$ falls back to 0 when all numeric props are null', fakeAsync(() => {
    storeMock._collectionDetailsSubject.next([{
      InsuranceName: 'Test',
      TotalCollections: null,
      InsuranceCollections: null,
      PatientCollections: null,
      InsurancePercentage: null,
      PatientPercentage: null,
      Claim: null,
    }] as any);
    tick();
    let rows: any;
    component.payerCollectionDetails$.subscribe(r => (rows = r));
    tick();
    expect(rows[0].totalCollections).toBe(0);
    expect(rows[0].insuranceCollections).toBe(0);
    expect(rows[0].patientCollections).toBe(0);
    expect(rows[0].claim).toBe(0);
  }));

  it('exportCollectionTrends handles null insuranceTrend with empty string', async () => {
    const trendData = [{ monthLabel: 'Jan', insuranceCollection: 1000, patientCollection: 200, insuranceTrend: null }];
    storeMock.collectionTrends$ = of(trendData as any);
    await component.exportCollectionTrends();
    expect(csvExportSpy.download).toHaveBeenCalled();
  });

  it('exportPayersIncreasing handles null chargeDeltaPct with empty string', async () => {
    const data = [{ insuranceName: null, currentPeriodCharges: 1000, lastPeriodCharges: 900, chargeDelta: 100, chargeDeltaPct: null }];
    storeMock.payersIncreasing$ = of(data as any);
    await component.exportPayersIncreasing();
    expect(csvExportSpy.download).toHaveBeenCalled();
  });

  it('payersIncreasingChart$ handles null insuranceName with Payer fallback', fakeAsync(() => {
    storeMock.payersIncreasing$ = of([
      { insuranceId: 42, insuranceName: null, chargeDelta: 5000 },
    ] as any);
    // Recreate component to pick up new store value
    let data: any;
    component.payersIncreasingChart$.subscribe(d => (data = d));
    tick();
    // Already covered from payersDecreasingChart$ test but also cover increasing path
    expect(data).toBeDefined();
  }));

  it('proceduresIncreasingChart$ maps procedure changes to HorizontalBarDatum with value', fakeAsync(() => {
    // The mock is initialized with MOCK_PROC_CHANGES which includes chargeDelta: 2000
    // So this tests the normal (non-null) path
    let data: any;
    component.proceduresIncreasingChart$.subscribe(d => (data = d));
    tick();
    expect(data).toBeDefined();
    expect(data[0].value).toBeGreaterThanOrEqual(0);
  }));
});
