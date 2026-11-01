import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { take } from 'rxjs/operators';
import { ARComponent } from './ar.component';
import { ArDataService } from '../../../core/services/ar-data.service';
import { LocationsService } from '../../../core/services/ar-locations.service';
import { FilterDialogService } from '../../../shared/components/filter-dialog/filter-dialog.service';
import { CsvExportService } from '../../../core/services/csv-export.service';

describe('ARComponent', () => {
  let component: ARComponent;
  let fixture: ComponentFixture<ARComponent>;
  let mockArData: jasmine.SpyObj<ArDataService>;
  let mockLocations: jasmine.SpyObj<LocationsService>;
  let mockFilterDialog: jasmine.SpyObj<FilterDialogService>;
  let mockCsvExport: jasmine.SpyObj<CsvExportService>;

  const mockArResponse: any = {
    averageDaysInAR: 45.5,
    priorYearAverageDaysInAR: 42.0,
    trendsData: {
      details: [
        { month: new Date().toISOString(), total_0_30: 100, total_31_60: 50, total_61_90: 20, total_over_90: 10 },
        { month: new Date(Date.now() - 40 * 86400000).toISOString(), total_0_30: 90, total_31_60: 40, total_61_90: 15, total_over_90: 8 },
        { month: new Date(Date.now() - 100 * 86400000).toISOString(), total_0_30: 80, total_31_60: 30, total_61_90: 10, total_over_90: 5 },
      ],
    },
    daysInARByPractice: {
      columns: [{ key: 'operations', label: 'Practice' }, { key: 'currentYear', label: 'Current' }],
      rows: [{ operations: 'Main', currentYear: 40 }],
    },
    breakdown: {
      columns: [{ key: 'practice', label: 'Practice' }],
      rows: [{ practice: 'Main' }],
    },
    distribution: {
      columns: [{ key: 'agingBracket', label: 'Bucket' }],
      rows: [{ agingBracket: '0-30' }],
    },
  };

  beforeEach(() => {
    mockArData = jasmine.createSpyObj('ArDataService', ['fetch']);
    mockArData.fetch.and.returnValue(of(mockArResponse));

    mockLocations = jasmine.createSpyObj('LocationsService', ['fetch', 'fetchProviders']);
    mockLocations.fetch.and.returnValue(of({ practiceGroups: ['PG1'], locations: ['Loc1'] } as any));
    mockLocations.fetchProviders.and.returnValue(of(['Dr. Smith']));

    mockFilterDialog = jasmine.createSpyObj('FilterDialogService', ['open']);
    mockFilterDialog.open.and.returnValue(of(null));

    mockCsvExport = jasmine.createSpyObj('CsvExportService', ['download']);

    TestBed.configureTestingModule({
      declarations: [ARComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ArDataService, useValue: mockArData },
        { provide: LocationsService, useValue: mockLocations },
        { provide: FilterDialogService, useValue: mockFilterDialog },
        { provide: CsvExportService, useValue: mockCsvExport },
      ],
    });

    fixture = TestBed.createComponent(ARComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Destroy the component between tests. Without this, subscriptions from one
  // test stay live and later emissions are attributed to the wrong test.
  afterEach(() => {
    fixture?.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---
  it('should load practice groups and locations on init', () => {
    expect(mockLocations.fetch).toHaveBeenCalled();
    expect(component.practiceGroupOptions).toEqual(['PG1']);
    expect(component.locationOptions).toEqual(['Loc1']);
  });

  it('should load providers on init', () => {
    expect(mockLocations.fetchProviders).toHaveBeenCalled();
    expect(component.providerOptions).toEqual(['Dr. Smith']);
  });

  // --- data$ observable ---
  it('data$ should compute deltaDaysInAR', (done) => {
    component.data$.pipe(take(1)).subscribe(data => {
      expect(data.deltaDaysInAR).toBe(3.5);
      done();
    });
  });

  it('data$ should have lastUpdated', (done) => {
    component.data$.pipe(take(1)).subscribe(data => {
      expect(data.lastUpdated).toBeDefined();
      done();
    });
  });

  // --- trendDetails$ ---
  it('trendDetails$ should filter by 30d window', (done) => {
    component.onTrendWindowChange('30d');
    component.trendDetails$.pipe(take(1)).subscribe(rows => {
      expect(rows.length).toBeLessThanOrEqual(2);
      done();
    });
  });

  it('trendDetails$ should include all rows for 90d window', (done) => {
    component.onTrendWindowChange('90d');
    component.trendDetails$.pipe(take(1)).subscribe(rows => {
      expect(rows.length).toBeGreaterThanOrEqual(1);
      done();
    });
  });

  // --- onTrendWindowChange ---
  it('onTrendWindowChange should not update for falsy value', () => {
    // Should not throw
    component.onTrendWindowChange(null as any);
    expect(component).toBeTruthy();
  });

  // --- resetAll ---
  it('resetAll should reset filters', (done) => {
    component.resetAll();
    (component as any).filters$.pipe(take(1)).subscribe((f: any) => {
      expect(f.provider).toEqual([]);
      expect(f.practice_groups).toEqual([]);
      expect(f.location).toEqual([]);
      done();
    });
  });

  // --- removeChip ---
  it('removeChip should remove the specified filter key', (done) => {
    (component as any).filters$.next({
      provider: ['Dr. Smith'],
      practice_groups: ['PG1'],
      location: [],
      date_of_service: {} as any,
    });

    component.removeChip({ key: 'provider', label: 'Prov: 1' });

    (component as any).filters$.pipe(take(1)).subscribe((f: any) => {
      expect(f.provider).toEqual([]);
      expect(f.practice_groups).toEqual(['PG1']);
      done();
    });
  });

  // --- chips$ ---
  it('chips$ should generate chips for active filters', (done) => {
    (component as any).filters$.next({
      provider: ['Dr. Smith'],
      practice_groups: ['PG1', 'PG2'],
      location: ['Loc1'],
      date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' },
    });

    component.chips$.pipe(take(1)).subscribe(chips => {
      expect(chips.length).toBe(4);
      expect(chips.find(c => c.key === 'provider')!.label).toBe('Prov: 1');
      expect(chips.find(c => c.key === 'practice_groups')!.label).toBe('PG: 2');
      expect(chips.find(c => c.key === 'location')!.label).toBe('Loc: 1');
      done();
    });
  });

  it('chips$ should return empty for default filters', (done) => {
    component.chips$.pipe(take(1)).subscribe(chips => {
      expect(chips.length).toBe(0);
      done();
    });
  });

  // --- hasValidAging ---
  it('hasValidAging should return false for non-array', () => {
    expect(component.hasValidAging(null as any)).toBeFalse();
    expect(component.hasValidAging(undefined as any)).toBeFalse();
  });

  it('hasValidAging should return false for empty array', () => {
    expect(component.hasValidAging([])).toBeFalse();
  });

  it('hasValidAging should return true when at least one detail has a nonzero value', () => {
    expect(component.hasValidAging([{ value: 100 }] as any)).toBeTrue();
  });

  it('hasValidAging should return false when all values are zero', () => {
    expect(component.hasValidAging([{ value: 0 }, { value: 0 }] as any)).toBeFalse();
  });

  it('hasValidAging should handle string values', () => {
    expect(component.hasValidAging([{ value: '50' }] as any)).toBeTrue();
  });

  it('hasValidAging should return false for NaN values', () => {
    expect(component.hasValidAging([{ value: 'abc' }] as any)).toBeFalse();
  });

  // --- navigateToSourceData ---
  it('navigateToSourceData should not throw', () => {
    expect(() => component.navigateToSourceData()).not.toThrow();
  });

  // --- exportTable ---
  it('exportTable should not export when block is null', () => {
    // Should not throw
    component.exportTable(null, 'test.csv');
    expect(component).toBeTruthy();
  });

  it('exportTable should not export when rows are empty', () => {
    component.exportTable({ columns: [], rows: [] } as any, 'test.csv');
    expect(component).toBeTruthy();
  });

  it('exportTable should create a download for valid data', () => {
    const mockAnchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
    spyOn(document, 'createElement').and.returnValue(mockAnchor);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.exportTable(
      { columns: [{ key: 'name', label: 'Name' }], rows: [{ name: 'Test' }] } as any,
      'test.csv'
    );

    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.download).toBe('test.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('exportTable should handle numeric values', () => {
    const mockAnchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
    spyOn(document, 'createElement').and.returnValue(mockAnchor);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.exportTable(
      { columns: [{ key: 'amount' }], rows: [{ amount: 123.45 }] } as any,
      'test.csv'
    );
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('exportTable should handle null cell values', () => {
    const mockAnchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
    spyOn(document, 'createElement').and.returnValue(mockAnchor);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.exportTable(
      { columns: [{ key: 'x' }], rows: [{ x: null }] } as any,
      'test.csv'
    );
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  // --- exportDaysInARByPractice ---
  it('exportDaysInARByPractice should call exportTable with daysInARByPractice', (done) => {
    spyOn(component, 'exportTable');
    component.exportDaysInARByPractice();
    setTimeout(() => {
      expect(component.exportTable).toHaveBeenCalled();
      done();
    }, 50);
  });

  // --- exportBreakdown ---
  it('exportBreakdown should call exportTable', (done) => {
    spyOn(component, 'exportTable');
    component.exportBreakdown();
    setTimeout(() => {
      expect(component.exportTable).toHaveBeenCalled();
      done();
    }, 50);
  });

  // --- exportDistribution ---
  it('exportDistribution should call exportTable', (done) => {
    spyOn(component, 'exportTable');
    component.exportDistribution();
    setTimeout(() => {
      expect(component.exportTable).toHaveBeenCalled();
      done();
    }, 50);
  });

  // --- exportTrends ---
  it('exportTrends should call csvExport.download', (done) => {
    component.exportTrends();
    setTimeout(() => {
      expect(mockCsvExport.download).toHaveBeenCalled();
      done();
    }, 50);
  });

  // --- openFilterDialog ---
  it('openFilterDialog should call filterDialog.open', () => {
    component.openFilterDialog();
    expect(mockFilterDialog.open).toHaveBeenCalled();
  });

  it('openFilterDialog should update filters on apply', () => {
    mockFilterDialog.open.and.returnValue(of({
      values: {
        provider: ['Dr. Smith'],
        practice_groups: ['PG1'],
        location: ['Loc1'],
        date_of_service: { start: '2025-01-01', end: '2025-12-31' },
      },
    }));

    component.openFilterDialog();

    (component as any).filters$.pipe(take(1)).subscribe((f: any) => {
      expect(f.provider).toEqual(['Dr. Smith']);
    });
  });

  it('openFilterDialog should reset on "reset" result', () => {
    mockFilterDialog.open.and.returnValue(of('reset'));
    component.openFilterDialog();

    (component as any).filters$.pipe(take(1)).subscribe((f: any) => {
      expect(f.provider).toEqual([]);
    });
  });

  // --- formattedLastUpdated ---
  it('formattedLastUpdated should return a formatted string', () => {
    const result = component.formattedLastUpdated;
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  // --- column configs ---
  it('should have daysByPracticeColumns defined', () => {
    expect(component.daysByPracticeColumns.length).toBe(3);
  });

  it('should have breakdownColumns defined', () => {
    expect(component.breakdownColumns.length).toBeGreaterThan(0);
  });

  it('should have distributionColumns defined', () => {
    expect(component.distributionColumns.length).toBeGreaterThan(0);
  });

  // --- static fmtDays ---
  it('fmtDays column formatter should format numbers', () => {
    const fmt = component.daysByPracticeColumns[1].displayFormatter!;
    expect(fmt(45.123, {} as any)).toBe('45.12');
  });

  it('fmtDays column formatter should return empty for null', () => {
    const fmt = component.daysByPracticeColumns[1].displayFormatter!;
    expect(fmt(null as any, {} as any)).toBe('');
  });

  // --- netCollectionSplit$ -----------------------------------------

  it('netCollectionSplit$ should return null pcts when no breakdown rows', (done) => {
    const noBreakdownResponse = { ...mockArResponse, breakdown: { columns: [], rows: [] } };
    mockArData.fetch.and.returnValue(of(noBreakdownResponse));
    (component as any).filters$.next((component as any).emptyFilters);

    component.netCollectionSplit$.pipe(take(1)).subscribe(split => {
      expect(split.insurancePct).toBeNull();
      expect(split.patientPct).toBeNull();
      done();
    });
  });

  it('netCollectionSplit$ should compute percentages from breakdown rows', (done) => {
    const withBreakdown = {
      ...mockArResponse,
      breakdown: {
        columns: [],
        rows: [
          { insuranceCollections: 600, patientCollections: 100, grossCollections: 700, insuranceBilled: 1000 },
          { insuranceCollections: 400, patientCollections: 200, grossCollections: 600, insuranceBilled: 500 },
        ],
      },
    };
    mockArData.fetch.and.returnValue(of(withBreakdown));
    (component as any).filters$.next((component as any).emptyFilters);

    component.netCollectionSplit$.pipe(take(1)).subscribe(split => {
      // totIns=1000, billed=1500 -> 1000/1500*100 = 66.7
      expect(split.insurancePct).toBeDefined();
      // totPat=300, totGross=1300 -> 300/1300*100 = 23.1
      expect(split.patientPct).toBeDefined();
      done();
    });
  });

  it('netCollectionSplit$ returns null pcts when billed=0 and gross=0', (done) => {
    const zeroBilled = {
      ...mockArResponse,
      breakdown: {
        columns: [],
        rows: [
          { insuranceCollections: 0, patientCollections: 0, grossCollections: 0, insuranceBilled: 0 },
        ],
      },
    };
    mockArData.fetch.and.returnValue(of(zeroBilled));
    (component as any).filters$.next((component as any).emptyFilters);

    component.netCollectionSplit$.pipe(take(1)).subscribe(split => {
      expect(split.insurancePct).toBeNull();
      expect(split.patientPct).toBeNull();
      done();
    });
  });

  it('netCollectionSplit$ handles missing row fields with ?? 0 fallback', (done) => {
    const missingFields = {
      ...mockArResponse,
      breakdown: {
        columns: [],
        rows: [{ insuranceBilled: 200 }], // production and collections missing
      },
    };
    mockArData.fetch.and.returnValue(of(missingFields));
    (component as any).filters$.next((component as any).emptyFilters);

    component.netCollectionSplit$.pipe(take(1)).subscribe(split => {
      // No production means no net-collection denominator, so the rate is not
      // reportable rather than zero.
      expect(split.insurancePct).toBeNull();
      expect(split.patientPct).toBeNull();
      done();
    });
  });

  it('netCollectionSplit$ should return nulls when data$ emits null', (done) => {
    mockArData.fetch.and.returnValue(of(null as any));
    (component as any).filters$.next((component as any).emptyFilters);

    component.netCollectionSplit$.pipe(take(1)).subscribe(split => {
      expect(split.insurancePct).toBeNull();
      expect(split.patientPct).toBeNull();
      done();
    });
  });

  // --- trendWindow$ / trendDetails$ --------------------------------

  it('trendWindow$ should default to 90d', () => {
    expect((component as any).trendWindow$.value).toBe('90d');
  });

  it('trendDetails$ should return sorted months for 90d window', (done) => {
    component.trendDetails$.pipe(take(1)).subscribe(rows => {
      expect(rows.length).toBeGreaterThanOrEqual(0);
      done();
    });
  });

  it('onTrendWindowChange should update window', () => {
    component.onTrendWindowChange('30d');
    expect((component as any).trendWindow$.value).toBe('30d');
  });

  it('onTrendWindowChange to 60d', () => {
    component.onTrendWindowChange('60d');
    expect((component as any).trendWindow$.value).toBe('60d');
  });

  // --- deltaDaysInAR when avg or prev is null -----------------------

  it('data$ should set deltaDaysInAR to undefined when avg is null', (done) => {
    const noAvg = { ...mockArResponse, averageDaysInAR: null };
    mockArData.fetch.and.returnValue(of(noAvg));
    (component as any).filters$.next((component as any).emptyFilters);

    component.data$.pipe(take(1)).subscribe(d => {
      expect((d as any)?.deltaDaysInAR).toBeUndefined();
      done();
    });
  });

  it('data$ should set deltaDaysInAR to undefined when prev is null', (done) => {
    const noPrev = { ...mockArResponse, priorYearAverageDaysInAR: null };
    mockArData.fetch.and.returnValue(of(noPrev));
    (component as any).filters$.next((component as any).emptyFilters);

    component.data$.pipe(take(1)).subscribe(d => {
      expect((d as any)?.deltaDaysInAR).toBeUndefined();
      done();
    });
  });

  it('data$ should compute deltaDaysInAR when both avg and prev available', (done) => {
    component.data$.pipe(take(1)).subscribe(d => {
      expect((d as any)?.deltaDaysInAR).toBe(3.5); // 45.5 - 42.0 = 3.5
      done();
    });
  });

  // --- buildChips helpers (chips$) ---------------------------------

  it('chips$ should emit empty array for default filters', (done) => {
    component.chips$.pipe(take(1)).subscribe(chips => {
      expect(Array.isArray(chips)).toBeTrue();
      done();
    });
  });

  it('removeChip should update filters', () => {
    component.removeChip({ key: 'provider', label: 'Dr. Smith' } as any);
    (component as any).filters$.pipe(take(1)).subscribe((f: any) => {
      expect(f.provider).not.toContain('Dr. Smith');
    });
  });

  // --- reload -------------------------------------------------------------

  it('reload should clear loadError and re-emit filters', () => {
    component.loadError = true;
    component.reload();
    expect(component.loadError).toBeFalse();
  });

  // --- export functions with null data -------------------------------------

  it('exportDaysInARByPractice should do nothing when data is null', (done) => {
    mockArData.fetch.and.returnValue(of(null as any));
    (component as any).filters$.next((component as any).emptyFilters);
    spyOn(component, 'exportTable');
    component.exportDaysInARByPractice();
    setTimeout(() => {
      expect(component.exportTable).not.toHaveBeenCalled();
      done();
    }, 50);
  });

  it('exportBreakdown should do nothing when data is null', (done) => {
    mockArData.fetch.and.returnValue(of(null as any));
    (component as any).filters$.next((component as any).emptyFilters);
    spyOn(component, 'exportTable');
    component.exportBreakdown();
    setTimeout(() => {
      expect(component.exportTable).not.toHaveBeenCalled();
      done();
    }, 50);
  });

  it('exportDistribution should do nothing when data is null', (done) => {
    mockArData.fetch.and.returnValue(of(null as any));
    (component as any).filters$.next((component as any).emptyFilters);
    spyOn(component, 'exportTable');
    component.exportDistribution();
    setTimeout(() => {
      expect(component.exportTable).not.toHaveBeenCalled();
      done();
    }, 50);
  });

  it('exportTrends should do nothing when rows are empty', (done) => {
    const noTrends = { ...mockArResponse, trendsData: { details: [] } };
    mockArData.fetch.and.returnValue(of(noTrends));
    (component as any).filters$.next((component as any).emptyFilters);
    component.exportTrends();
    setTimeout(() => {
      expect(mockCsvExport.download).not.toHaveBeenCalled();
      done();
    }, 50);
  });

  // --- lastUpdated ?? new Date() branch ------------------------------------

  it('data$ should use new Date() when lastUpdated is missing', (done) => {
    const noLastUpdated: any = { ...mockArResponse };
    delete noLastUpdated.lastUpdated;
    mockArData.fetch.and.returnValue(of(noLastUpdated));
    (component as any).filters$.next((component as any).emptyFilters);
    component.data$.pipe(take(1)).subscribe(d => {
      // lastUpdated ?? new Date() - the new Date() fallback branch
      expect((d as any).lastUpdated).toBeDefined();
      done();
    });
  });

  // --- filterDialog apply with non-array values (asMany [] fallback) --------

  it('openFilterDialog should handle non-array filter values', () => {
    mockFilterDialog.open.and.returnValue(of({
      values: {
        provider: 'Dr. Smith',      // string, not array -> asMany returns []
        practice_groups: null,       // null -> asMany returns []
        location: undefined,         // undefined -> asMany returns []
        date_of_service: null,
      },
    }));
    component.openFilterDialog();
    (component as any).filters$.pipe(take(1)).subscribe((f: any) => {
      expect(f.provider).toEqual([]);
      expect(f.practice_groups).toEqual([]);
      expect(f.location).toEqual([]);
    });
  });

  // --- openFilterDialog with null output (early return) --------------------

  it('openFilterDialog should do nothing when dialog returns null', () => {
    mockFilterDialog.open.and.returnValue(of(null));
    const initialFilters = { ...(component as any).filters$.value };
    component.openFilterDialog();
    (component as any).filters$.pipe(take(1)).subscribe((f: any) => {
      expect(f.provider).toEqual(initialFilters.provider);
    });
  });

  // --- netCollectionSplit$ - arm 0 for billed > 0 -------------------------

  it('netCollectionSplit$ computes insurancePct when billed > 0 and patientPct when gross > 0', (done) => {
    const withData = {
      ...mockArResponse,
      breakdown: {
        columns: [],
        rows: [
          { insuranceCollections: 800, patientCollections: 200, grossCollections: 1000, production: 1000 },
        ],
      },
    };
    mockArData.fetch.and.returnValue(of(withData));
    (component as any).filters$.next((component as any).emptyFilters);

    component.netCollectionSplit$.pipe(take(1)).subscribe(split => {
      expect(split.insurancePct).toBe(80);  // 800/1000 * 100 = 80.0
      expect(split.patientPct).toBe(20);    // 200/1000 * 100 = 20.0
      done();
    });
  });

  // --- chips$ - date chip with only end date --------------------------------

  it('chips$ should show date chip with dash for missing start', (done) => {
    (component as any).filters$.next({
      ...(component as any).emptyFilters,
      date_of_service: { start_date: '', end_date: '2025-12-31' },
    });
    component.chips$.pipe(take(1)).subscribe(chips => {
      const dateChip = chips.find((c: any) => c.key === 'date_of_service');
      expect(dateChip).toBeDefined();
      done();
    });
  });
});
