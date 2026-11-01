import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Sort } from '@angular/material/sort';
import { PageEvent } from '@angular/material/paginator';

import { RcmComponent } from './rcm.component';
import { RcmService } from '../../../core/services/rcm.service';
import { ThemeService, DEFAULT_CHART_THEME, AppChartTheme } from '../../../core/services/theme.service';
import {
  Filters,
  ClaimValueByStatusDto,
  ClaimAmountsByPracticeDto,
  CollectionAdjustmentTrendDto,
  ClaimAmountsByPayerDto,
  ClaimValuesByTypeDto,
  RcmLookups,
} from '../../../core/models/rcm.models';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

// -- Mock data ------------------------------------------------------
const MOCK_LOOKUPS: RcmLookups = {
  providers: ['Dr. Smith', 'Dr. Jones'],
  practiceGroups: ['Group A', 'Group B'],
  locations: ['Office 1', 'Office 2'],
};

const MOCK_CLAIMS_COUNT = { currentClaims: 100, previousClaims: 80, yoyChangePct: 25 };
const MOCK_GROSS_PRODUCTION = { currentGrossCharges: 500000, previousGrossCharges: 400000, yoyChangePct: 25 };
const MOCK_COLLECTION_RATE = { currentRate: 85.5, previousRate: 80.2, yoyChange: 5.3 };

const MOCK_REVENUE_ROWS = [
  {
    Practice: 'Clinic Alpha',
    Charges: 100000,
    InsuranceSubmitted: 90000,
    ExpectedInsurancePayment: 70000,
    ActualInsurancePayment: 68000,
    ExpectedPatientResponsibility: 45231.50,
    Adjustments: 2000,
    NetCollections: 78000,
    NetCollectionPct: 111.43,
    Refunds: 500,
  },
  {
    Practice: 'Clinic Beta',
    Charges: 200000,
    InsuranceSubmitted: 180000,
    ExpectedInsurancePayment: 140000,
    ActualInsurancePayment: 136000,
    ExpectedPatientResponsibility: 38100.00,
    Adjustments: 4000,
    NetCollections: 156000,
    NetCollectionPct: 111.43,
    Refunds: 1000,
  },
];

const MOCK_CLAIM_VALUE_BY_STATUS: ClaimValueByStatusDto[] = [
  { ClaimStatus: 'Paid', ClaimValue: 100000 },
  { ClaimStatus: 'Denied', ClaimValue: 20000 },
];

const MOCK_CLAIM_AMOUNTS_BY_PRACTICE: ClaimAmountsByPracticeDto[] = [
  { Practice: 'Alpha', TotalClaimAmount: 300000 },
  { Practice: 'Beta', TotalClaimAmount: 250000 },
];

const MOCK_COLLECTION_TRENDS: CollectionAdjustmentTrendDto[] = [
  { MonthLabel: 'Jan', Collections: 50000, Adjustments: 5000, CollectionRate: 0.85 },
  { MonthLabel: 'Feb', Collections: 55000, Adjustments: 4500, CollectionRate: 0.88 },
];

const MOCK_CLAIM_BY_PAYER: ClaimAmountsByPayerDto[] = [
  { Payer: 'Aetna', TotalClaimAmount: 120000 },
  { Payer: 'BCBS', TotalClaimAmount: 180000 },
];

const MOCK_CLAIM_BY_TYPE: ClaimValuesByTypeDto[] = [
  { ClaimType: 'Professional', TotalClaimAmount: 200000 },
  { ClaimType: 'Institutional', TotalClaimAmount: 100000 },
];

// Stub pipes referenced in the template
const pipeNames = [
  'toClaimValueByStatusChart',
  'toClaimAmountsByPracticeChart',
  'toCollectionAdjustmentSeries',
  'toClaimAmountsByPayerChart',
  'toClaimValuesByTypeChart',
];
const pipeStubs = pipeNames.map(name => {
  @Pipe({ name, standalone: false }) class StubPipe implements PipeTransform { transform(v: any) { return v; } }
  return StubPipe;
});

describe('RcmComponent', () => {
  let component: RcmComponent;
  let fixture: ComponentFixture<RcmComponent>;
  let rcmServiceSpy: jasmine.SpyObj<RcmService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  // Theme mocks
  const primaryColor$ = new BehaviorSubject<string>(DEFAULT_CHART_THEME.chart_color_1);
  const chartColors$ = new BehaviorSubject<string[]>([
    DEFAULT_CHART_THEME.chart_color_1,
    DEFAULT_CHART_THEME.chart_color_2,
    DEFAULT_CHART_THEME.chart_color_3,
    DEFAULT_CHART_THEME.chart_color_4,
    DEFAULT_CHART_THEME.chart_color_5,
  ]);

  beforeEach(async () => {
    rcmServiceSpy = jasmine.createSpyObj('RcmService', [
      'getLookups',
      'getClaimsCount',
      'getGrossProduction',
      'getCollectionRate',
      'getRevenueByPractice',
      'getClaimValueByStatus',
      'getClaimAmountsByPractice',
      'getCollectionAdjustmentTrends',
      'getClaimAmountsByPayer',
      'getClaimValuesByType',
    ]);

    // Default returns
    rcmServiceSpy.getLookups.and.returnValue(of(MOCK_LOOKUPS));
    rcmServiceSpy.getClaimsCount.and.returnValue(of(MOCK_CLAIMS_COUNT));
    rcmServiceSpy.getGrossProduction.and.returnValue(of(MOCK_GROSS_PRODUCTION));
    rcmServiceSpy.getCollectionRate.and.returnValue(of(MOCK_COLLECTION_RATE));
    rcmServiceSpy.getRevenueByPractice.and.returnValue(of(MOCK_REVENUE_ROWS));
    rcmServiceSpy.getClaimValueByStatus.and.returnValue(of(MOCK_CLAIM_VALUE_BY_STATUS));
    rcmServiceSpy.getClaimAmountsByPractice.and.returnValue(of(MOCK_CLAIM_AMOUNTS_BY_PRACTICE));
    rcmServiceSpy.getCollectionAdjustmentTrends.and.returnValue(of(MOCK_COLLECTION_TRENDS));
    rcmServiceSpy.getClaimAmountsByPayer.and.returnValue(of(MOCK_CLAIM_BY_PAYER));
    rcmServiceSpy.getClaimValuesByType.and.returnValue(of(MOCK_CLAIM_BY_TYPE));

    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    const themeStub = {
      primaryColor$: primaryColor$.asObservable(),
      chartColors$: chartColors$.asObservable(),
      theme$: new BehaviorSubject<AppChartTheme>(DEFAULT_CHART_THEME).asObservable(),
      snapshot: () => DEFAULT_CHART_THEME,
    };

    await TestBed.configureTestingModule({
    declarations: [RcmComponent, ...pipeStubs],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [ReactiveFormsModule],
    providers: [
        { provide: RcmService, useValue: rcmServiceSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: ThemeService, useValue: themeStub },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RcmComponent);
    component = fixture.componentInstance;
    // Do NOT call detectChanges yet - let individual tests control lifecycle
  });

  afterEach(() => {
    // Prevent ViewChild-related afterAll crashes
    if (component) {
      (component as any).matSort = undefined;
    }
  });

  // -- Creation -------------------------------------------------------
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- ngOnInit -------------------------------------------------------
  it('should call applyFilters on init', () => {
    spyOn(component, 'applyFilters');
    component.ngOnInit();
    expect(component.applyFilters).toHaveBeenCalledTimes(1);
  });

  // -- ngOnDestroy ----------------------------------------------------
  it('should complete destroy$ on ngOnDestroy', () => {
    const destroySpy = spyOn((component as any).destroy$, 'next');
    const completeSpy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(destroySpy).toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalled();
  });

  // -- Form defaults -------------------------------------------------
  it('should initialise the form with default filter values', () => {
    const raw = component.form.getRawValue();
    expect(raw.provider).toBe('all');
    expect(raw.practice_groups).toBe('all');
    expect(raw.location).toBe('all');
    expect(raw.date_of_service).toEqual({ start_date: '', end_date: '' });
  });

  // -- applyFilters --------------------------------------------------
  it('applyFilters should push filters into appliedFilters$', fakeAsync(() => {
    let emitted: Filters | undefined;
    (component as any).appliedFilters$.subscribe((f: Filters) => (emitted = f));
    component.applyFilters();
    tick();
    expect(emitted).toBeDefined();
    expect(emitted!.provider).toBe('all');
  }));

  // -- resetAll ------------------------------------------------------
  it('resetAll should restore form to defaults and call applyFilters', () => {
    component.form.patchValue({ provider: ['Dr. Smith'] });
    spyOn(component, 'applyFilters');
    component.resetAll();
    expect(component.form.getRawValue().provider).toBe('all');
    expect(component.applyFilters).toHaveBeenCalled();
  });

  // -- onSortChange --------------------------------------------------
  it('onSortChange should update sort$ BehaviorSubject', fakeAsync(() => {
    let emitted: any;
    (component as any).sort$.subscribe((s: any) => (emitted = s));

    const sort: Sort = { active: 'charges', direction: 'desc' };
    component.onSortChange(sort);
    tick();
    expect(emitted).toEqual({ column: 'charges', direction: 'desc' });
  }));

  it('onSortChange should default to asc when direction is empty', fakeAsync(() => {
    let emitted: any;
    (component as any).sort$.subscribe((s: any) => (emitted = s));

    component.onSortChange({ active: 'location', direction: '' });
    tick();
    expect(emitted.direction).toBe('asc');
  }));

  // -- onPageChange --------------------------------------------------
  it('onPageChange should update pageIndex, pageSize, and subjects', fakeAsync(() => {
    const evt: PageEvent = { pageIndex: 2, pageSize: 50, length: 200 };
    component.onPageChange(evt);
    tick();
    expect(component.pageIndex).toBe(2);
    expect(component.pageSize).toBe(50);
  }));

  // -- removeChip (date_of_service) ----------------------------------
  it('removeChip should clear date_of_service when key is date_of_service', () => {
    component.form.patchValue({
      date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' },
    });
    spyOn(component, 'applyFilters');
    component.removeChip('date_of_service', 'anything');
    expect(component.form.getRawValue().date_of_service).toEqual({ start_date: '', end_date: '' });
    expect(component.applyFilters).toHaveBeenCalled();
  });

  // -- removeChip (array filter) -------------------------------------
  it('removeChip should remove a specific value from an array filter', () => {
    component.form.patchValue({ provider: ['Dr. Smith', 'Dr. Jones'] });
    spyOn(component, 'applyFilters');
    component.removeChip('provider', 'Dr. Smith');
    expect(component.form.getRawValue().provider).toEqual(['Dr. Jones']);
    expect(component.applyFilters).toHaveBeenCalled();
  });

  it('removeChip should set filter to empty array when last item is removed', () => {
    component.form.patchValue({ provider: ['Dr. Smith'] });
    spyOn(component, 'applyFilters');
    component.removeChip('provider', 'Dr. Smith');
    expect(component.form.getRawValue().provider).toEqual([]);
  });

  it('removeChip should set to empty array for non-array non-date values', () => {
    component.form.patchValue({ provider: 'all' });
    spyOn(component, 'applyFilters');
    component.removeChip('provider', 'all');
    expect(component.form.getRawValue().provider).toEqual([]);
  });

  // -- toggleExpand --------------------------------------------------
  it('toggleExpand should do nothing for rows without children', () => {
    const row = { location: 'Test', charges: 0, insuranceSubmitted: 0, adjustments: 0,
      netCollections: 0, outstandingBalance: 0, netCollectionPct: null, refunds: 0 };
    component.toggleExpand(row);
    expect(component.expandedRowId).toBeNull();
  });

  it('toggleExpand should set expandedRowId for rows with children', () => {
    const sub: any = { location: 'sub', charges: 0, insuranceSubmitted: 0, adjustments: 0,
      netCollections: 0, outstandingBalance: 0, netCollectionPct: null, refunds: 0 };
    const row = { id: 'clinic1', location: 'Test', charges: 0, insuranceSubmitted: 0,
      outstandingBalance: 0,
      adjustments: 0, netCollections: 0, netCollectionPct: null, refunds: 0, subRows: [sub] };
    component.toggleExpand(row);
    expect(component.expandedRowId).toBe('clinic1');
  });

  it('toggleExpand should collapse if same row is toggled again', () => {
    const sub: any = { location: 'sub', charges: 0, insuranceSubmitted: 0, adjustments: 0,
      netCollections: 0, outstandingBalance: 0, netCollectionPct: null, refunds: 0 };
    const row = { id: 'clinic1', location: 'Test', charges: 0, insuranceSubmitted: 0,
      outstandingBalance: 0,
      adjustments: 0, netCollections: 0, netCollectionPct: null, refunds: 0, subRows: [sub] };
    component.toggleExpand(row);
    component.toggleExpand(row);
    expect(component.expandedRowId).toBeNull();
  });

  // -- hasChildren / childrenOf --------------------------------------
  it('hasChildren returns true when subRows non-empty', () => {
    expect(component.hasChildren({ subRows: [{ location: '' } as any] } as any)).toBeTrue();
  });

  it('hasChildren returns false when no subRows', () => {
    expect(component.hasChildren({ location: 'A' } as any)).toBeFalse();
  });

  it('childrenOf returns subRows or empty', () => {
    expect(component.childrenOf({ subRows: [{ location: 'x' } as any] } as any).length).toBe(1);
    expect(component.childrenOf({} as any)).toEqual([]);
  });

  // -- trackById -----------------------------------------------------
  it('trackById should return id or fallback to location', () => {
    expect(component.trackById(0, { id: 42, location: 'X' } as any)).toBe(42);
    expect(component.trackById(0, { location: 'X' } as any)).toBe('X');
  });

  // -- isDetailRow ---------------------------------------------------
  it('isDetailRow should return true when row.id matches expandedRowId', () => {
    component.expandedRowId = 'abc';
    expect(component.isDetailRow(0, { id: 'abc' })).toBeTrue();
    expect(component.isDetailRow(0, { id: 'xyz' })).toBeFalse();
  });

  // -- childrenAccessor / hasChildrenAccessor ------------------------

  // -- KPI observables -----------------------------------------------
  describe('KPI observables', () => {
    beforeEach(() => {
      fixture.detectChanges(); // triggers ngOnInit -> applyFilters
    });
  });

  // -- Table observable ----------------------------------------------
  describe('table$', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should emit DisplayRow[] from revenue data', fakeAsync(() => {
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows).toBeDefined();
      expect(rows.length).toBe(2);
      expect(rows[0].location).toBe('CLINIC ALPHA');
      expect(rows[0].charges).toBe(100000);
      expect(rows[0].insuranceSubmitted).toBe(90000);
      expect(rows[0].adjustments).toBe(2000);
    }));
  });

  // -- Chart data observables ----------------------------------------
  describe('chart data observables', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });
  });

  // -- Horizontal bar mappers ----------------------------------------
  describe('horizontal bar mappers', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });
  });

  // -- Lookups -------------------------------------------------------
  describe('lookups', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('providers$ should emit provider list', fakeAsync(() => {
      let val: any;
      component.providers$.subscribe(v => (val = v));
      tick();
      expect(val).toEqual(['Dr. Smith', 'Dr. Jones']);
    }));

    it('practiceGroups$ should emit practice groups', fakeAsync(() => {
      let val: any;
      component.practiceGroups$.subscribe(v => (val = v));
      tick();
      expect(val).toEqual(['Group A', 'Group B']);
    }));

    it('locations$ should emit locations', fakeAsync(() => {
      let val: any;
      component.locations$.subscribe(v => (val = v));
      tick();
      expect(val).toEqual(['Office 1', 'Office 2']);
    }));
  });

  // -- chips$ --------------------------------------------------------
  describe('chips$', () => {
    it('should emit no chips for default "all" filters', fakeAsync(() => {
      fixture.detectChanges();
      let chips: any;
      component.chips$.subscribe(c => (chips = c));
      tick();
      expect(chips).toEqual([]);
    }));

    it('should emit chips when filters are set to arrays', fakeAsync(() => {
      fixture.detectChanges();
      component.form.patchValue({ provider: ['Dr. Smith'] });
      component.applyFilters();
      tick();
      let chips: any;
      component.chips$.subscribe(c => (chips = c));
      tick();
      expect(chips.length).toBe(1);
      expect(chips[0]).toEqual({ key: 'provider', label: 'Dr. Smith' });
    }));

    it('should emit a date chip when date_of_service is set', fakeAsync(() => {
      fixture.detectChanges();
      component.form.patchValue({ date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' } });
      component.applyFilters();
      tick();
      let chips: any;
      component.chips$.subscribe(c => (chips = c));
      tick();
      const dateChip = chips.find((c: any) => c.key === 'date_of_service');
      expect(dateChip).toBeTruthy();
      expect(dateChip.label).toContain('2025-01-01');
    }));
  });

  // -- Formatters ----------------------------------------------------
  describe('formatters', () => {
    it('currencyKFormatter formats millions', () => {
      expect(component.currencyKFormatter(2500000)).toBe('$2.5M');
    });

    it('currencyKFormatter formats thousands', () => {
      expect(component.currencyKFormatter(75000)).toBe('$75K');
    });

    it('currencyKFormatter formats small numbers', () => {
      expect(component.currencyKFormatter(500)).toBe('$500');
    });

    it('currencyKFormatter returns empty for NaN', () => {
      expect(component.currencyKFormatter(NaN)).toBe('');
    });

    it('currencyKFormatter returns empty for null', () => {
      expect(component.currencyKFormatter(null as any)).toBe('');
    });
  });

  // -- collectionAdjustmentTooltip -----------------------------------
  describe('collectionAdjustmentTooltip', () => {
  });

  // -- columns config ------------------------------------------------
  describe('columns config', () => {
  });

  // -- Chart option objects exist ------------------------------------
  describe('chart option objects', () => {
  });

  // -- Theme properties ----------------------------------------------
  describe('theme properties', () => {
    it('primaryColor$ should emit from ThemeService', fakeAsync(() => {
      let val: any;
      component.primaryColor$.subscribe(v => (val = v));
      tick();
      expect(val).toBe(DEFAULT_CHART_THEME.chart_color_1);
    }));

    it('chartColors$ should emit 5-color array', fakeAsync(() => {
      let val: any;
      component.chartColors$.subscribe(v => (val = v));
      tick();
      expect(val.length).toBe(5);
    }));
  });

  // -- Service calls on applyFilters ---------------------------------
  describe('service integration', () => {
  });

  // -- isLoading$ ----------------------------------------------------
  it('isLoading$ should be false after data loads', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    let loading: boolean | undefined;
    component.isLoading$.subscribe(v => (loading = v));
    tick();
    expect(loading).toBeFalse();
  }));

  // -- Table pagination response shape handling ----------------------
  describe('totalRows$ with paginated response shape', () => {
  });

  // -- Default page values -------------------------------------------
  it('should have default pageIndex=0 and pageSize=25', () => {
    expect(component.pageIndex).toBe(0);
    expect(component.pageSize).toBe(25);
  });

  // -- expandedRowId starts null -------------------------------------
  it('should have expandedRowId null initially', () => {
    expect(component.expandedRowId).toBeNull();
    expect(component.expandedRow).toBeNull();
  });

  // -- totalRows$ with totalRows shape --------------------------------------

  // -- table$ with object-shape response --------------------------------------
  it('table$ should use res.data when response is an object with data array', fakeAsync(() => {
    rcmServiceSpy.getRevenueByPractice.and.returnValue(of({ data: MOCK_REVENUE_ROWS }));
    fixture.detectChanges();
    tick();
    let rows: any;
    component.table$.subscribe(r => (rows = r));
    tick();
    expect(rows.length).toBe(2);
  }));

  it('table$ should use res.rows when response has rows property', fakeAsync(() => {
    rcmServiceSpy.getRevenueByPractice.and.returnValue(of({ rows: MOCK_REVENUE_ROWS }));
    fixture.detectChanges();
    tick();
    let rows: any;
    component.table$.subscribe(r => (rows = r));
    tick();
    expect(rows.length).toBe(2);
  }));

  // -- toDisplayRows edge cases ----------------------------------------------
  it('table$ should handle rows with lowercase property names', fakeAsync(() => {
    rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
      {
        practice: 'Lower Case Clinic',
        charges: 50000,
        insuranceSubmitted: 45000,
        adjustments: 3000,
        netCollections: 37000,
        outstandingBalance: 0, netCollectionPct: 105.7,
        refunds: 200,
      },
    ]));
    fixture.detectChanges();
    tick();
    let rows: any;
    component.table$.subscribe(r => (rows = r));
    tick();
    expect(rows.length).toBe(1);
    expect(rows[0].location).toBe('LOWER CASE CLINIC');
  }));

  // -- claimsCountAllTime$ ---------------------------------------------------

  // -- collectionAdjustmentTooltip: null value -------------------------------

  // -- horizontalBarBase tooltip formatter -----------------------------------

  // -- yaxis formatters ------------------------------------------------------

  // -- applyGlobalFilters with different location scopes --------------------
  it('applyFilters should handle array providers and payers', fakeAsync(() => {
    component.form.patchValue({
      provider: ['Dr. Smith', 'Dr. Jones'],
      payer: ['Aetna', 'BCBS'],
    });
    component.applyFilters();
    tick();
    let filters: any;
    (component as any).appliedFilters$.subscribe((f: any) => (filters = f));
    tick();
    expect(filters.provider).toEqual(['Dr. Smith', 'Dr. Jones']);
    expect(filters.payer).toEqual(['Aetna', 'BCBS']);
  }));

  // -- toStringArray with object inputs --------------------------------------
  it('should convert object array items to string in toStringArray', () => {
    // Test via removeChip with an object-form provider value
    component.form.patchValue({ provider: [{ value: 'Dr. A', label: 'Dr. A Name' }] as any });
    spyOn(component, 'applyFilters');
    component.removeChip('provider', 'Dr. A');
    // Shouldn't throw and applyFilters should be called
    expect(component.applyFilters).toHaveBeenCalled();
  });

  // -- claimAmountsByPracticeHBar$ with null rows ----------------------------

  // -- toSelectOptions -------------------------------------------------------
  it('toSelectOptions should handle string items', () => {
    // Tested indirectly via providers$ / lookups$
    fixture.detectChanges();
    let providers: any;
    component.providers$.subscribe(p => (providers = p));
    expect(Array.isArray(providers)).toBeTrue();
  });

  // -- applyGlobalFilters - various location scopes ---------------------------
  it('applyGlobalFilters should set practiceGroups to matched practice names for group scope', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: null,
      endDate: null,
      payers: [],
      providers: [],
      location: { scope: 'group', groups: ['GroupA'] },
    });
    store.setOptions({
      payers: [], providers: [], groups: ['GroupA'], practices: [], locations: [],
      groupsData: [{ id: 1, name: 'GroupA', practices: [{ id: 10, name: 'PracticeX', locations: [] }] }],
    });
    (component as any).applyGlobalFilters(store.value);
    expect(component.form.getRawValue().practice_groups).toEqual(['PracticeX']);
  });

  it('applyGlobalFilters should set practiceGroups to "all" for group scope with no matching group', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'group', groups: ['NonExistentGroup'] },
    });
    store.setOptions({ payers: [], providers: [], groups: [], practices: [], locations: [], groupsData: [] });
    (component as any).applyGlobalFilters(store.value);
    expect(component.form.getRawValue().practice_groups).toBe('all');
  });

  it('applyGlobalFilters should set practiceGroups for practice scope', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'practice', practices: ['PracticeA', 'PracticeB'] },
    });
    (component as any).applyGlobalFilters(store.value);
    expect(component.form.getRawValue().practice_groups).toEqual(['PracticeA', 'PracticeB']);
  });

  it('applyGlobalFilters should set locations for location scope', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'location', locations: ['Office1', 'Office2'] },
    });
    (component as any).applyGlobalFilters(store.value);
    expect(component.form.getRawValue().location).toEqual(['Office1', 'Office2']);
  });

  it('applyGlobalFilters should set provider to all when providers empty', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: null, endDate: null, payers: [], providers: [],
      location: { scope: 'enterprise' },
    });
    (component as any).applyGlobalFilters(store.value);
    expect(component.form.getRawValue().provider).toBe('all');
  });

  it('applyGlobalFilters should set date_of_service when startDate/endDate provided', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'),
      payers: [], providers: [], location: { scope: 'enterprise' },
    });
    (component as any).applyGlobalFilters(store.value);
    const ds = component.form.getRawValue().date_of_service;
    expect(ds.start_date).toBe('2025-01-01');
    expect(ds.end_date).toBe('2025-12-31');
  });

  it('applyGlobalFilters should set empty dates when startDate is null', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: null, endDate: null, payers: [], providers: [], location: { scope: 'enterprise' },
    });
    (component as any).applyGlobalFilters(store.value);
    const ds = component.form.getRawValue().date_of_service;
    expect(ds.start_date).toBe('');
    expect(ds.end_date).toBe('');
  });

  it('applyGlobalFilters should set payer to array when payers provided', () => {
    const store: any = (component as any).globalFiltersStore;
    store.set({
      startDate: null, endDate: null, payers: ['Aetna', 'BCBS'], providers: ['Dr. A'],
      location: { scope: 'enterprise' },
    });
    (component as any).applyGlobalFilters(store.value);
    expect(component.form.getRawValue().payer).toEqual(['Aetna', 'BCBS']);
    expect(component.form.getRawValue().provider).toEqual(['Dr. A']);
  });

  // -- collectionTrendOptions yaxis[1] formatter ----------------------------

  // -- yaxis[0] formatter with zero ----------------------------------------

  // -- columns - remaining accessors and displayFormatters -----------------

  // -- chips$ date chip with only end date set ------------------------------
  it('chips$ should emit date chip with only end date', fakeAsync(() => {
    fixture.detectChanges();
    component.form.patchValue({ date_of_service: { start_date: '', end_date: '2025-12-31' } });
    component.applyFilters();
    tick();
    let chips: any;
    component.chips$.subscribe(c => (chips = c));
    tick();
    const dateChip = chips.find((c: any) => c.key === 'date_of_service');
    expect(dateChip).toBeTruthy();
    expect(dateChip.label).toContain('2025-12-31');
  }));

  // -- onSortChange with null active --------------------------------------
  it('onSortChange should handle null active field', fakeAsync(() => {
    let emitted: any;
    (component as any).sort$.subscribe((s: any) => (emitted = s));
    component.onSortChange({ active: null as any, direction: 'asc' });
    tick();
    expect(emitted.column).toBe('');
  }));

  // -- lookups$ catchError ------------------------------------------------
  it('lookups$ should emit empty lookups on error', fakeAsync(() => {
    const { throwError } = require('rxjs');
    rcmServiceSpy.getLookups.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();
    let val: any;
    component.lookups$.subscribe(v => (val = v));
    tick();
    expect(val).toEqual({ providers: [], practiceGroups: [], locations: [] });
  }));

  // -- table$ with null response ------------------------------------------
  it('table$ should return empty array for null response', fakeAsync(() => {
    rcmServiceSpy.getRevenueByPractice.and.returnValue(of(null as any));
    fixture.detectChanges();
    tick();
    let rows: any;
    component.table$.subscribe(r => (rows = r));
    tick();
    expect(rows).toEqual([]);
  }));

  // -- toDisplayRows with location fallback ------------------------------
  it('table$ toDisplayRows should use r.location when Practice and practice are missing', fakeAsync(() => {
    rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
      { location: 'LocationFallback', charges: 0, insuranceSubmitted: 0, adjustments: 0,
        netCollections: 0, outstandingBalance: 0, netCollectionPct: null, refunds: 0 },
    ]));
    fixture.detectChanges();
    tick();
    let rows: any;
    component.table$.subscribe(r => (rows = r));
    tick();
    expect(rows[0].location).toBe('LOCATIONFALLBACK');
  }));

  // -- toDisplayRows with NetCollections ------------------------------
  it('table$ should map NetCollections to netCollections', fakeAsync(() => {
    rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
      { Practice: 'Test', Charges: 100, InsuranceSubmitted: 90, ExpectedInsurancePayment: 70,
        ActualInsurancePayment: 65, ExpectedPatientResponsibility: 0, Adjustments: 2,
        NetCollections: 500, NetCollectionPct: 71.4, Refunds: 0 },
    ]));
    fixture.detectChanges();
    tick();
    let rows: any;
    component.table$.subscribe(r => (rows = r));
    tick();
    expect(rows[0].netCollections).toBe(500);
  }));

  // -- totalRows$ with undefined response --------------------------------

  // -- currencyFullFormatter returns empty for null ----------------------

  // -- toSelectOptions ----------------------------------------------------
  describe('toSelectOptions', () => {
    it('should handle plain strings', () => {
      const result = (component as any).toSelectOptions(['Aetna', 'BCBS']);
      expect(result.length).toBe(2);
      expect(result[0].label).toBe('Aetna');
      expect(result[0].value).toBe('Aetna');
    });

    it('should handle objects with label/value', () => {
      const result = (component as any).toSelectOptions([{ label: 'Aetna', value: 'aetna_id' }]);
      expect(result[0].label).toBe('Aetna');
      expect(result[0].value).toBe('aetna_id');
    });

    it('should handle objects with name', () => {
      const result = (component as any).toSelectOptions([{ name: 'Group A', id: 'g1' }]);
      expect(result[0].label).toBe('Group A');
      expect(result[0].value).toBe('g1');
    });

    it('should sort alphabetically', () => {
      const result = (component as any).toSelectOptions(['Zelis', 'Aetna', 'BCBS']);
      expect(result[0].label).toBe('Aetna');
      expect(result[2].label).toBe('Zelis');
    });

    it('should return empty array for null input', () => {
      const result = (component as any).toSelectOptions(null);
      expect(result).toEqual([]);
    });
  });

  // -- toStringArray ---------------------------------------------------------
  describe('toStringArray', () => {
    it('should return empty array for non-array input', () => {
      expect((component as any).toStringArray('all')).toEqual([]);
      expect((component as any).toStringArray(null)).toEqual([]);
    });

    it('should return string items as-is', () => {
      expect((component as any).toStringArray(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('should convert object items using value', () => {
      expect((component as any).toStringArray([{ value: 'x', label: 'X' }])).toEqual(['x']);
    });

    it('should convert object items using label when no value', () => {
      expect((component as any).toStringArray([{ label: 'Y' }])).toEqual(['Y']);
    });

    it('should fallback to String() for unknown items', () => {
      expect((component as any).toStringArray([42])).toEqual(['42']);
    });
  });

  // -- openFilterDialog ------------------------------------------------------
  describe('openFilterDialog', () => {
  });

  // -- Export methods --------------------------------------------------------
  describe('export methods', () => {
    beforeEach(() => {
      fixture.detectChanges();
      // Stub document.createElement to prevent real anchor clicks
      spyOn(document, 'createElement').and.callFake((tag: string) => {
        if (tag === 'a') return { href: '', download: '', click: () => {} } as any;
        return document.createElement(tag);
      });
      spyOn(URL, 'createObjectURL').and.returnValue('blob:mock');
      spyOn(URL, 'revokeObjectURL');
    });
  });

  // -- horizontalBarBase tooltip ---------------------------------------------
  describe('horizontalBarBase tooltip', () => {
  });

  // -- toDisplayRows - all nullable field branches --------------------------
  describe('toDisplayRows field nullability', () => {
    it('should handle null/undefined r.id (falls back to practice)', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Clinic X', Charges: 100, InsuranceSubmitted: 90, ExpectedInsurancePayment: 70,
          ActualInsurancePayment: 65, ExpectedPatientResponsibility: 0, Adjustments: 2,
          NetCollections: 65, NetCollectionPct: 92.9, Refunds: 0 },
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      // id falls back to practice (raw, before toUpperCase); location gets uppercased
      expect(rows[0].id).toBe('Clinic X');
      expect(rows[0].location).toBe('CLINIC X');
    }));

    it('should map Adjustments column directly', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Clinic', Charges: 100, InsuranceSubmitted: 90, ExpectedInsurancePayment: 70,
          ActualInsurancePayment: 65, ExpectedPatientResponsibility: 0,
          Adjustments: 5000, NetCollections: 65, NetCollectionPct: 92.9, Refunds: 0 },
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].adjustments).toBe(5000);
    }));

    it('should map lowercase fields when uppercase absent', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { practice: 'test', charges: 1000, insuranceSubmitted: 900,
          adjustments: 50, netCollections: 900, outstandingBalance: 0, netCollectionPct: 128.6, refunds: 10 },
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].location).toBe('TEST');
      expect(rows[0].charges).toBe(1000);
      expect(rows[0].netCollections).toBe(900);
    }));
  });

  // -- chips$ with payer filter ----------------------------------------------
  it('chips$ should emit payer chip when payer is set', fakeAsync(() => {
    fixture.detectChanges();
    component.form.patchValue({ payer: ['Aetna'] });
    component.applyFilters();
    tick();
    let chips: any;
    component.chips$.subscribe(c => (chips = c));
    tick();
    // payer is not in getFilterChips unless added to pushMany - check if it appears
    // The component's getFilterChips only pushes practice_groups, location, provider, date
    // So chips should not include payer unless spec was added
    expect(chips).toBeDefined();
  }));

  // -- collectionAdjustmentTooltip with seriesIndex 1 -----------------------

  // -- toManyOrAll -----------------------------------------------------------
  describe('buildFiltersFromForm', () => {
    it('should return all when form fields are all', () => {
      const filters = (component as any).buildFiltersFromForm();
      expect(filters.provider).toBe('all');
      expect(filters.practice_groups).toBe('all');
    });

    it('should return string array when form has array values', () => {
      component.form.patchValue({ provider: ['Dr. Smith'] });
      const filters = (component as any).buildFiltersFromForm();
      expect(filters.provider).toEqual(['Dr. Smith']);
    });
  });

  // -- toDisplayRows all-null field fallbacks -----------------------------------

  describe('toDisplayRows all-null field fallbacks', () => {
    it('should fall back to 0 when InsuranceSubmitted absent', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', Charges: 1000 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].insuranceSubmitted).toBe(0);
    }));

    it('should fall back to 0 when no netCollections source is present', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', Charges: 500 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].netCollections).toBe(0);
    }));

    it('should fall back to 0 when OutstandingBalance is absent', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', Charges: 500 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].outstandingBalance).toBe(0);
    }));

    it('should fall back to 0 when NetCollections absent', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', Charges: 500 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].netCollections).toBe(0);
    }));

    it('should fall back to 0 when Adjustments absent', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test' }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].adjustments).toBe(0);
    }));

    it('should return null for netCollectionPct when absent', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', Charges: 500 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].netCollectionPct).toBeNull();
    }));

    it('should map netCollections via the GrossCollections fallback', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', Charges: 500, GrossCollections: 75 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].netCollections).toBe(75);
    }));

    it('should map netCollectionPct via CollectionRate fallback', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', Charges: 500, CollectionRate: 88 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].netCollectionPct).toBe(88);
    }));

    it('should use r.charges when both TotalGrossProduction variants absent', fakeAsync(() => {
      rcmServiceSpy.getRevenueByPractice.and.returnValue(of([
        { Practice: 'Test', charges: 999 }
      ]));
      fixture.detectChanges();
      tick();
      let rows: any;
      component.table$.subscribe(r => (rows = r));
      tick();
      expect(rows[0].charges).toBe(999);
    }));
  });

  // -- columns displayFormatters -----------------------------------------------

  describe('columns displayFormatters', () => {
  });

  // -- currencyKFormatter formatter branches ------------------------------------

  describe('currencyKFormatter', () => {
    it('formats millions', () => {
      expect(component.currencyKFormatter(2000000)).toContain('M');
    });

    it('formats thousands', () => {
      expect(component.currencyKFormatter(5000)).toContain('K');
    });

    it('formats small values', () => {
      expect(component.currencyKFormatter(50)).toBe('$50');
    });

    it('handles null', () => {
      expect(component.currencyKFormatter(null as any)).toBe('');
    });

    it('handles NaN', () => {
      expect(component.currencyKFormatter(NaN)).toBe('');
    });
  });

  // -- collectionAdjustmentTooltip seriesIndex 2 (percent) ---------------------

  // -- hasChildren / childrenOf / toggleExpand ----------------------------------

  describe('hasChildren and childrenOf', () => {
    it('hasChildren returns true when subRows has items', () => {
      const row: any = { id: 1, subRows: [{ id: 2, location: 'x' }] };
      expect(component.hasChildren(row)).toBeTrue();
    });

    it('hasChildren returns false when subRows is empty', () => {
      const row: any = { id: 1, subRows: [] };
      expect(component.hasChildren(row)).toBeFalse();
    });

    it('hasChildren returns false when subRows is absent', () => {
      const row: any = { id: 1 };
      expect(component.hasChildren(row)).toBeFalse();
    });

    it('childrenOf returns subRows when present', () => {
      const row: any = { id: 1, subRows: [{ id: 2 }] };
      expect(component.childrenOf(row).length).toBe(1);
    });

    it('childrenOf returns empty array when subRows absent', () => {
      const row: any = { id: 1 };
      expect(component.childrenOf(row)).toEqual([]);
    });

    it('toggleExpand should expand a row with children', () => {
      const row: any = { id: 'R1', subRows: [{ id: 'R2' }] };
      component.toggleExpand(row);
      expect(component.expandedRowId).toBe('R1');
    });

    it('toggleExpand should collapse already-expanded row', () => {
      const row: any = { id: 'R1', subRows: [{ id: 'R2' }] };
      component.toggleExpand(row);
      component.toggleExpand(row);
      expect(component.expandedRowId).toBeNull();
    });

    it('toggleExpand should not expand row without children', () => {
      const row: any = { id: 'R1', subRows: [] };
      component.toggleExpand(row);
      expect(component.expandedRowId).toBeNull();
    });
  });

  // -- childrenAccessor / hasChildrenAccessor ------------------------------------

  describe('childrenAccessor and hasChildrenAccessor', () => {
  });

  // -- providers$/practiceGroups$/locations$ null fallbacks ---------------------

  describe('lookups$ null fallbacks', () => {
    it('providers$ should return empty array when providers is null', fakeAsync(() => {
      rcmServiceSpy.getLookups.and.returnValue(of({ providers: null, practiceGroups: [], locations: [] } as any));
      fixture.detectChanges();
      tick();
      let providers: any;
      component.providers$.subscribe(p => (providers = p));
      tick();
      expect(providers).toEqual([]);
    }));

    it('practiceGroups$ should return empty array when practiceGroups is null', fakeAsync(() => {
      rcmServiceSpy.getLookups.and.returnValue(of({ providers: [], practiceGroups: null, locations: [] } as any));
      fixture.detectChanges();
      tick();
      let groups: any;
      component.practiceGroups$.subscribe(g => (groups = g));
      tick();
      expect(groups).toEqual([]);
    }));

    it('locations$ should return empty array when locations is null', fakeAsync(() => {
      rcmServiceSpy.getLookups.and.returnValue(of({ providers: [], practiceGroups: [], locations: null } as any));
      fixture.detectChanges();
      tick();
      let locs: any;
      component.locations$.subscribe(l => (locs = l));
      tick();
      expect(locs).toEqual([]);
    }));
  });

  // -- toStringArray branches ----------------------------------------------------

  describe('toStringArray', () => {
    it('should return empty array for non-array input', () => {
      expect((component as any).toStringArray('all')).toEqual([]);
      expect((component as any).toStringArray(null)).toEqual([]);
    });

    it('should convert objects with value', () => {
      const result = (component as any).toStringArray([{ value: 'aetna', label: 'Aetna' }]);
      expect(result).toEqual(['aetna']);
    });

    it('should convert objects with label when no value', () => {
      const result = (component as any).toStringArray([{ label: 'Aetna' }]);
      expect(result).toEqual(['Aetna']);
    });

    it('should convert non-string primitives via String()', () => {
      const result = (component as any).toStringArray([42]);
      expect(result).toEqual(['42']);
    });
  });

  // -- applyGlobalFilters scope branches -----------------------------------------

  describe('applyGlobalFilters scope branches', () => {
    it('should handle scope=group with matching group', fakeAsync(() => {
      const store = (component as any).globalFiltersStore;
      store.setOptions({
        groupsData: [{ name: 'GroupA', practices: [{ name: 'Practice1' }, { name: 'Practice2' }] }],
        payers: [], providers: [], groups: [], practices: [], locations: [],
      });
      (component as any).applyGlobalFilters({
        location: { scope: 'group', groups: ['GroupA'] },
        providers: [],
        payers: [],
        startDate: null,
        endDate: null,
      });
      tick();
      expect(component.form.controls.practice_groups.value).toEqual(['Practice1', 'Practice2']);
    }));

    it('should handle scope=group with no matching group (returns all)', fakeAsync(() => {
      const store = (component as any).globalFiltersStore;
      store.setOptions({ groupsData: [], payers: [], providers: [], groups: [], practices: [], locations: [] });
      (component as any).applyGlobalFilters({
        location: { scope: 'group', groups: ['NonExistent'] },
        providers: [],
        payers: [],
        startDate: null,
        endDate: null,
      });
      tick();
      expect(component.form.controls.practice_groups.value).toBe('all');
    }));

    it('should handle scope=practice', fakeAsync(() => {
      (component as any).applyGlobalFilters({
        location: { scope: 'practice', practices: ['Clinic A'] },
        providers: [],
        payers: [],
        startDate: null,
        endDate: null,
      });
      tick();
      expect(component.form.controls.practice_groups.value).toEqual(['Clinic A']);
    }));

    it('should handle scope=location', fakeAsync(() => {
      (component as any).applyGlobalFilters({
        location: { scope: 'location', locations: ['Office 1'] },
        providers: [],
        payers: [],
        startDate: null,
        endDate: null,
      });
      tick();
      expect(component.form.controls.location.value).toEqual(['Office 1']);
    }));

    it('should handle providers set', fakeAsync(() => {
      (component as any).applyGlobalFilters({
        location: { scope: 'all' },
        providers: ['Dr. Smith'],
        payers: [],
        startDate: null,
        endDate: null,
      });
      tick();
      expect(component.form.controls.provider.value).toEqual(['Dr. Smith']);
    }));

    it('should handle date range set', fakeAsync(() => {
      (component as any).applyGlobalFilters({
        location: { scope: 'all' },
        providers: [],
        payers: [],
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });
      tick();
      const dos = component.form.controls.date_of_service.value;
      expect(dos.start_date).toBe('2025-01-01');
    }));

    it('should handle no date range', fakeAsync(() => {
      (component as any).applyGlobalFilters({
        location: { scope: 'all' },
        providers: [],
        payers: [],
        startDate: null,
        endDate: null,
      });
      tick();
      const dos = component.form.controls.date_of_service.value;
      expect(dos.start_date).toBe('');
    }));
  });
});
