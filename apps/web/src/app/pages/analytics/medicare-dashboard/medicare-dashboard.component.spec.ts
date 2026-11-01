import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { MedicareDashboardComponent, BarChartInput } from './medicare-dashboard.component';
import { FilterDialogService } from '../../../shared/components/filter-dialog/filter-dialog.service';
import { MedicareDashboardDataService } from '../../../core/services/medicare-dashboard-data.service';
import { Filters } from '../../../core/models/medicare-dashboard.types';

const EMPTY_FILTERS: Filters = {
  practice_groups: 'all',
  location: 'all',
  provider: 'all',
  date_of_service: { start_date: '', end_date: '' },
};

describe('MedicareDashboardComponent', () => {
  let component: MedicareDashboardComponent;
  let fixture: ComponentFixture<MedicareDashboardComponent>;
  let dataSvc: jasmine.SpyObj<MedicareDashboardDataService>;
  let filterSvc: jasmine.SpyObj<FilterDialogService>;

  beforeEach(async () => {
    dataSvc = jasmine.createSpyObj<MedicareDashboardDataService>('MedicareDashboardDataService', [
      'getPracticeGroups',
      'getLocations',
      'getProviders',
      'getCptAndClaimCounts',
      'getChargesVsMedicare',
      'getPaymentsVsMedicare',
      'getUncollectedMedicarePerClaim',
      'getUncollectedMCRPerClaim',
      'getUncollectedMedicarePerClaimMix',
      'getMedicareByCptGroup',
      'getUncollectedMedicareByCptGroup',
    ]);

    filterSvc = jasmine.createSpyObj<FilterDialogService>('FilterDialogService', ['open']);

    // Default stubs
    dataSvc.getPracticeGroups.and.returnValue(of(['GroupA', 'GroupB']));
    dataSvc.getLocations.and.returnValue(of(['Loc1', 'Loc2']));
    dataSvc.getProviders.and.returnValue(of(['ProvA']));
    dataSvc.getCptAndClaimCounts.and.returnValue(of([]));
    dataSvc.getChargesVsMedicare.and.returnValue(of([]));
    dataSvc.getPaymentsVsMedicare.and.returnValue(of([]));
    dataSvc.getUncollectedMedicarePerClaim.and.returnValue(of([]));
    dataSvc.getUncollectedMCRPerClaim.and.returnValue(of([]));
    dataSvc.getUncollectedMedicarePerClaimMix.and.returnValue(of([]));
    dataSvc.getMedicareByCptGroup.and.returnValue(of([]));
    dataSvc.getUncollectedMedicareByCptGroup.and.returnValue(of([]));
    filterSvc.open.and.returnValue(of(null as any));

    await TestBed.configureTestingModule({
      declarations: [MedicareDashboardComponent],
      providers: [
        { provide: FilterDialogService, useValue: filterSvc },
        { provide: MedicareDashboardDataService, useValue: dataSvc },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MedicareDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit
  });

  // ---- 1. Creation ----
  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  // ---- 2. ngOnInit loads practice groups from service ----
  it('should load practice groups on init', () => {
    expect(dataSvc.getPracticeGroups).toHaveBeenCalled();
    expect(component.practiceGroups).toEqual(['GroupA', 'GroupB']);
  });

  // ---- 3. ngOnInit fetches locations using empty array when practice_groups is "all" ----
  it('should load locations on init with empty practice-group array when filter is "all"', () => {
    expect(dataSvc.getLocations).toHaveBeenCalledWith([]);
    expect(component.locations).toEqual(['Loc1', 'Loc2']);
  });

  // ---- 4. showCard flags default to false ----
  it('should initialise all showCard flags to false', () => {
    expect(component.showCard1).toBeFalse();
    expect(component.showCard4).toBeFalse();
    expect(component.showCard8).toBeFalse();
  });

  // ---- 5. chips$ emits empty array for default EMPTY_FILTERS ----
  it('chips$ should emit an empty array when no filters are active', fakeAsync(() => {
    let chips: any[] | undefined;
    component.chips$.subscribe(c => (chips = c));
    tick();
    expect(chips).toEqual([]);
  }));

  // ---- 6. chips$ emits chips when filters have values ----
  it('chips$ should emit chips for each active filter value', fakeAsync(() => {
    (component as any).filtersSubject.next({
      ...EMPTY_FILTERS,
      practice_groups: ['GroupA'],
      location: ['Loc1'],
    });
    let chips: any[] | undefined;
    component.chips$.subscribe(c => (chips = c));
    tick();
    expect(chips).toContainEqual(jasmine.objectContaining({ key: 'practice_groups', label: 'GroupA' }));
    expect(chips).toContainEqual(jasmine.objectContaining({ key: 'location', label: 'Loc1' }));
  }));

  // ---- 7. chips$ includes date chip when dates are set ----
  it('chips$ should include a date chip when date_of_service is set', fakeAsync(() => {
    (component as any).filtersSubject.next({
      ...EMPTY_FILTERS,
      date_of_service: { start_date: '2025-01-01', end_date: '2025-06-30' },
    });
    let chips: any[] | undefined;
    component.chips$.subscribe(c => (chips = c));
    tick();
    const dateChip = chips!.find(c => c.key === 'date_of_service');
    expect(dateChip).toBeDefined();
    expect(dateChip.label).toContain('2025-01-01');
  }));

  // ---- 8. removeChip reduces a multi-value filter ----
  it('removeChip should remove a single value from an array filter', () => {
    const filtersSubject = (component as any).filtersSubject;
    filtersSubject.next({ ...EMPTY_FILTERS, location: ['North', 'South'] });
    component.removeChip('location', 'North');
    expect(filtersSubject.value.location).toEqual(['South']);
  });

  // ---- 9. removeChip resets to "all" when list becomes empty ----
  it('removeChip should set filter to "all" when last value is removed', () => {
    const filtersSubject = (component as any).filtersSubject;
    filtersSubject.next({ ...EMPTY_FILTERS, provider: ['ProvA'] });
    component.removeChip('provider', 'ProvA');
    expect(filtersSubject.value.provider).toBe('all');
  });

  // ---- 10. removeChip clears date_of_service ----
  it('removeChip should reset date_of_service to empty strings', () => {
    const filtersSubject = (component as any).filtersSubject;
    filtersSubject.next({
      ...EMPTY_FILTERS,
      date_of_service: { start_date: '2025-01-01', end_date: '2025-06-30' },
    });
    component.removeChip('date_of_service', 'some-label');
    expect(filtersSubject.value.date_of_service).toEqual({ start_date: '', end_date: '' });
  });

  // ---- 11. titlePrefix helpers ----
  it('titlePrefixT13M should return "Last 13 Months \u2014"', () => {
    expect(component.titlePrefixT13M(EMPTY_FILTERS)).toBe('Last 13 Months \u2014');
  });

  it('titlePrefixT12M should return "Last 12 Months \u2014"', () => {
    expect(component.titlePrefixT12M(EMPTY_FILTERS)).toBe('Last 12 Months \u2014');
  });

  // ---- 12. openFilters - reset path resets filtersSubject ----
  it('openFilters: "reset" result resets all filters to defaults', fakeAsync(() => {
    (component as any).filtersSubject.next({
      practice_groups: ['GroupA'],
      location: ['Loc1'],
      provider: ['ProvA'],
      date_of_service: { start_date: '2025-01-01', end_date: '2025-06-30' },
    });
    filterSvc.open.and.returnValue(of('reset'));
    component.openFilters();
    tick();

    const cur: Filters = (component as any).filtersSubject.value;
    expect(cur.practice_groups).toBe('all');
    expect(cur.location).toBe('all');
    expect(cur.provider).toBe('all');
    expect(cur.date_of_service).toEqual({ start_date: '', end_date: '' });
  }));

  // ---- 13. openFilters - apply path updates filtersSubject and reloads lookups ----
  it('openFilters: applying values updates filters and reloads location/provider lookups', fakeAsync(() => {
    const result = {
      values: {
        practice_groups: ['GroupB'],
        location: ['Loc2'],
        provider: ['ProvA'],
        date_of_service: { start: '2025-01-01', end: '2025-03-31' },
      },
    };
    filterSvc.open.and.returnValue(of(result as any));
    dataSvc.getLocations.calls.reset();
    dataSvc.getProviders.calls.reset();

    component.openFilters();
    tick();

    const cur: Filters = (component as any).filtersSubject.value;
    expect(cur.practice_groups).toEqual(['GroupB']);
    expect(cur.location).toEqual(['Loc2']);
    expect(cur.date_of_service.start_date).toBe('2025-01-01');
    expect(dataSvc.getLocations).toHaveBeenCalled();
    expect(dataSvc.getProviders).toHaveBeenCalled();
  }));

  // ---- 14. cptAndClaimCountsChart$ maps pre-shaped backend payload ----
  it('cptAndClaimCountsChart$ should map a pre-shaped series/categories payload', fakeAsync(() => {
    const shaped = {
      categories: ['Jan 2025', 'Feb 2025'],
      series: [{ name: 'Claims', type: 'column', data: [10, 20] }],
    };
    dataSvc.getCptAndClaimCounts.and.returnValue(of(shaped));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result).toBeTruthy();
    expect(result!.categories).toEqual(['Jan 2025', 'Feb 2025']);
    expect(result!.series[0].name).toBe('Claims');
    expect(result!.series[0].data).toEqual([10, 20]);
  }));

  // ---- 15. uncollectedMCRPerClaimPie$ passes through array responses unchanged ----
  it('uncollectedMCRPerClaimPie$ should pass through an array API response as-is', fakeAsync(() => {
    const pieData = [{ label: 'A', value: 100 }, { label: 'B', value: 200 }];
    dataSvc.getUncollectedMCRPerClaim.and.returnValue(of(pieData));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.uncollectedMCRPerClaimPie$.subscribe(v => (result = v));
    tick();

    expect(result).toEqual(pieData);
  }));

  // ---- 16. asBar - array with date_of_service field (time-series shape) ----
  it('cptAndClaimCountsChart$ should map array with claims_count and cpt_count', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of([
      { date_of_service: '2025-01-01', claims_count: 10, cpt_count: 30, cpt_per_claim: 3 },
      { date_of_service: '2025-02-01', claims_count: 12, cpt_count: 36, cpt_per_claim: 3 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series.some(s => s.name === 'Claims')).toBeTrue();
    expect(result!.series.some(s => s.name === 'CPT Codes')).toBeTrue();
    expect(result!.series.some(s => s.name === 'CPT per Claim')).toBeTrue();
  }));

  it('chargesVsMedicareChart$ should map array with billed and medicare_allowable', fakeAsync(() => {
    dataSvc.getChargesVsMedicare.and.returnValue(of([
      { date_of_service: '2025-01-01', billed: 50000, medicare_allowable: 40000, percent_of_charges: 80 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.chargesVsMedicareChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series.some(s => s.name === 'Billed')).toBeTrue();
    expect(result!.series.some(s => s.name === 'Medicare Allowable')).toBeTrue();
    expect(result!.series.some(s => s.name === '% of Charges')).toBeTrue();
  }));

  it('paymentsVsMedicareChart$ should map array with payments and uncollected', fakeAsync(() => {
    dataSvc.getPaymentsVsMedicare.and.returnValue(of([
      { date_of_service: '2025-01-01', payments: 35000, uncollected: 5000, percent_of_payments: 87 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.paymentsVsMedicareChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series.some(s => s.name === 'Payments')).toBeTrue();
    expect(result!.series.some(s => s.name === 'Uncollected')).toBeTrue();
    expect(result!.series.some(s => s.name === '% of Payments')).toBeTrue();
  }));

  it('uncollectedMedicarePerClaimStacked$ should map bucket-keyed array', fakeAsync(() => {
    dataSvc.getUncollectedMedicarePerClaim.and.returnValue(of([
      { date_of_service: '2025-01-01', '$0-$49': 100, '$50-$99': 50, '$100-$199': 30 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.uncollectedMedicarePerClaimStacked$.subscribe(v => (result = v));
    tick();

    expect(result!.series.some(s => s.name === '$0-$49')).toBeTrue();
    expect(result!.series.some(s => s.name === '$50-$99')).toBeTrue();
  }));

  it('cptAndClaimCountsChart$ should return empty bar chart for empty array', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of([]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.categories).toEqual([]);
    expect(result!.series).toEqual([]);
  }));

  // ---- 17. asBar - fallback (total_uncollected_for_month) ----
  it('should map total_uncollected_for_month fallback shape', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of([
      { date_of_service: '2025-01-01', total_uncollected_for_month: 12000 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series[0].name).toBe('Uncollected');
    expect(result!.series[0].data[0]).toBe(12000);
  }));

  // ---- 18. asBar - array without date_of_service (uses index as category) ----
  it('should use index as category when date_of_service is missing', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of([
      { claims_count: 5, cpt_count: 15 },
      { claims_count: 7, cpt_count: 21 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.categories).toEqual(['1', '2']);
  }));

  // ---- 19. asPie - object map with bucket ordering ----
  it('medicareByCptGroupPie$ should convert object map with bucket keys to ordered items', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of({
      '$0-$49':   { amount: 100, percentage: 20 },
      '$50-$99':  { amount: 200, percentage: 40 },
      '$100-$199': { amount: 150, percentage: 30 },
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    expect(result!.length).toBeGreaterThan(0);
    // First item should be '$0-$49' since we follow BUCKET_ORDER
    expect(result![0].name).toBe('$0-$49');
  }));

  // ---- 20. asPie - simple key:number object map ----
  it('medicareByCptGroupPie$ should convert simple key:number map sorted by value desc', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of({
      'Category A': 500,
      'Category B': 300,
      'Category C': 700,
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    expect(result![0].name).toBe('Category C'); // 700 is largest
    expect(result![0].value).toBe(700);
  }));

  // ---- 21. asPie - non-bucket object with complex values sorted by value desc ----
  it('asPie should sort non-bucket object entries by value desc', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of({
      'GroupX': { amount: 600, percentage: 60 },
      'GroupY': { amount: 400, percentage: 40 },
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    expect(result![0].name).toBe('GroupX'); // 600 > 400
    expect(result![0].value).toBe(600);
  }));

  // ---- 22. asPie - fallback for non-object/non-array ----
  it('medicareByCptGroupPie$ should return empty array for null response', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of(null as any));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    expect(result).toEqual([]);
  }));

  // ---- 23. catchError in charts ----
  it('cptAndClaimCountsChart$ should emit EMPTY_BAR on HTTP error', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(throwError(() => new Error('Network error')));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.categories).toEqual([]);
  }));

  // ---- 24. removeChip calls refreshDependentLookups when not date key ----
  it('removeChip should call getLocations when removing a non-date filter', () => {
    const filtersSubject = (component as any).filtersSubject;
    filtersSubject.next({ ...EMPTY_FILTERS, provider: ['ProvA', 'ProvB'] });
    dataSvc.getLocations.calls.reset();

    component.removeChip('provider', 'ProvA');

    // refreshDependentLookups(next, alsoProviders=true) since key !== date_of_service
    expect(dataSvc.getLocations).toHaveBeenCalled();
  });

  it('removeChip should NOT call getProviders when removing date_of_service filter', () => {
    const filtersSubject = (component as any).filtersSubject;
    filtersSubject.next({
      ...EMPTY_FILTERS,
      date_of_service: { start_date: '2025-01-01', end_date: '2025-06-30' },
    });
    dataSvc.getProviders.calls.reset();

    component.removeChip('date_of_service', 'some-label');

    // alsoProviders=false when key === 'date_of_service'
    expect(dataSvc.getProviders).not.toHaveBeenCalled();
  });

  // ---- 25. navigateToSourceData ----
  it('navigateToSourceData should not throw', () => {
    expect(() => component.navigateToSourceData()).not.toThrow();
  });

  // ---- 26. showCard flag defaults ----
  it('all showCard flags should be false by default', () => {
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(n => {
      expect((component as any)[`showCard${n}`]).toBeFalse();
    });
  });

  // ---- asBar: pre-shaped payload null/missing branches ----

  it('asBar should use "Series N" fallback when series name is missing', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of({
      categories: ['Jan'],
      series: [{ data: [10] }], // no name
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series[0].name).toBe('Series 1');
  }));

  it('asBar should use "column" type when series type is neither line nor column', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of({
      categories: ['Jan'],
      series: [{ name: 'Test', type: 'bar', data: [5] }], // type 'bar' is not 'line' or 'column'
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series[0].type).toBe('column');
  }));

  it('asBar should handle series with type "line"', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of({
      categories: ['Jan'],
      series: [{ name: 'Trend', type: 'line', data: [5] }],
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series[0].type).toBe('line');
  }));

  it('asBar should replace null data values with null in pre-shaped payload', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of({
      categories: ['Jan', 'Feb'],
      series: [{ name: 'S', type: 'column', data: [null, 20] }],
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series[0].data[0]).toBeNull();
    expect(result!.series[0].data[1]).toBe(20);
  }));

  it('asBar should handle null category in pre-shaped payload', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of({
      categories: [null, 'Feb'],
      series: [{ name: 'S', type: 'column', data: [10, 20] }],
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.categories[0]).toBe('');
    expect(result!.categories[1]).toBe('Feb');
  }));

  it('asBar should handle pre-shaped series with no data array', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of({
      categories: ['Jan'],
      series: [{ name: 'S', type: 'column', data: null }], // no data
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series[0].data).toEqual([]);
  }));

  it('asBar should return empty bar for array with rows missing recognized keys', fakeAsync(() => {
    // Rows with no claims_count, cpt_count, billed, etc. and no bucket keys and no total_uncollected
    dataSvc.getCptAndClaimCounts.and.returnValue(of([
      { date_of_service: '2025-01-01', some_other_field: 42 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    // Should fall through to final empty fallback
    expect(result!.categories).toEqual([]);
    expect(result!.series).toEqual([]);
  }));

  it('asBar should handle claims row with null fields (??0 paths)', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of([
      { date_of_service: '2025-01-01', claims_count: null, cpt_count: null, cpt_per_claim: null },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series.find(s => s.name === 'Claims')!.data[0]).toBe(0);
    expect(result!.series.find(s => s.name === 'CPT per Claim')!.data[0]).toBe(0);
  }));

  it('asBar should handle billed row with null fields (??0 paths)', fakeAsync(() => {
    dataSvc.getChargesVsMedicare.and.returnValue(of([
      { date_of_service: '2025-01-01', billed: null, medicare_allowable: null, percent_of_charges: null },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.chargesVsMedicareChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series.find(s => s.name === 'Billed')!.data[0]).toBe(0);
    expect(result!.series.find(s => s.name === 'Medicare Allowable')!.data[0]).toBe(0);
  }));

  it('asBar should handle billed without percent_of_charges (hasPctChg=false)', fakeAsync(() => {
    dataSvc.getChargesVsMedicare.and.returnValue(of([
      { date_of_service: '2025-01-01', billed: 1000, medicare_allowable: 800 },  // no percent_of_charges
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.chargesVsMedicareChart$.subscribe(v => (result = v));
    tick();

    // hasPctChg is false, so '% of Charges' series should not be present
    expect(result!.series.find(s => s.name === '% of Charges')).toBeUndefined();
  }));

  it('asBar should handle payments row with null fields', fakeAsync(() => {
    dataSvc.getPaymentsVsMedicare.and.returnValue(of([
      { date_of_service: '2025-01-01', payments: null, uncollected: null, percent_of_payments: null },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.paymentsVsMedicareChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series.find(s => s.name === 'Payments')!.data[0]).toBe(0);
    expect(result!.series.find(s => s.name === 'Uncollected')!.data[0]).toBe(0);
  }));

  it('asBar should handle payments without percent_of_payments', fakeAsync(() => {
    dataSvc.getPaymentsVsMedicare.and.returnValue(of([
      { date_of_service: '2025-01-01', payments: 35000, uncollected: 5000 },  // no percent_of_payments
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.paymentsVsMedicareChart$.subscribe(v => (result = v));
    tick();

    expect(result!.series.find(s => s.name === '% of Payments')).toBeUndefined();
  }));

  it('asBar should handle bucket row with null fields', fakeAsync(() => {
    dataSvc.getUncollectedMedicarePerClaim.and.returnValue(of([
      { date_of_service: '2025-01-01', '$0-$49': null, '$50-$99': null },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.uncollectedMedicarePerClaimStacked$.subscribe(v => (result = v));
    tick();

    expect(result!.series.find(s => s.name === '$0-$49')!.data[0]).toBe(0);
  }));

  // ---- monthLabel invalid date branch ----

  it('asBar: monthLabel should handle invalid date string gracefully', fakeAsync(() => {
    dataSvc.getCptAndClaimCounts.and.returnValue(of([
      { date_of_service: 'not-a-valid-date', claims_count: 5, cpt_count: 10 },
    ]));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: BarChartInput | undefined;
    component.cptAndClaimCountsChart$.subscribe(v => (result = v));
    tick();

    // monthLabel with invalid date returns the raw string
    expect(result!.categories[0]).toBe('not-a-valid-date');
  }));

  // ---- asPie: object with no object-value entries but numeric values ----

  it('asPie should convert simple key:number map including bucket-ordered items', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of({
      '$0-$49': 100,
      '$50-$99': 200,
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    // Both keys are in BUCKET_ORDER so should be bucket-ordered
    expect(result!.find((i: any) => i.name === '$0-$49')).toBeTruthy();
  }));

  it('asPie should return empty array for non-array non-object input', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of(42 as any));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    expect(result).toEqual([]);
  }));

  it('asPie should handle object with no numeric or object values (returns empty)', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of({ key: 'string-value' } as any));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    expect(result).toEqual([]);
  }));

  it('asPie val?.amount ?? val?.value ?? 0 branch: use val.value when amount missing', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of({
      'GroupA': { value: 500, percentage: 50 }, // no amount field
      'GroupB': { amount: 300, percentage: 30 },
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    const groupA = result!.find((i: any) => i.name === 'GroupA');
    expect(groupA.value).toBe(500);
  }));

  it('asPie val?.amount ?? val?.value ?? 0 branch: use 0 when both amount and value missing', fakeAsync(() => {
    dataSvc.getMedicareByCptGroup.and.returnValue(of({
      'GroupA': { percentage: 50 }, // no amount, no value
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    const groupA = result!.find((i: any) => i.name === 'GroupA');
    expect(groupA.value).toBe(0);
  }));

  it('asPie should handle isBucket=false branch for non-bucket keys with object values', fakeAsync(() => {
    // non-bucket keys so isBucket=false -> sort by value desc
    dataSvc.getMedicareByCptGroup.and.returnValue(of({
      'CPT Group A': { amount: 300, percentage: 30 },
      'CPT Group B': { amount: 700, percentage: 70 },
    }));
    (component as any).filtersSubject.next({ ...EMPTY_FILTERS });

    let result: any[] | undefined;
    component.medicareByCptGroupPie$.subscribe(v => (result = v));
    tick();

    expect(result![0].name).toBe('CPT Group B');
    expect(result![0].value).toBe(700);
  }));

  // ---- openFilters: asMany function ----

  it('openFilters: asMany should return "all" for empty array', fakeAsync(() => {
    filterSvc.open.and.returnValue(of({
      values: {
        practice_groups: [],  // empty array -> asMany returns 'all'
        location: ['Loc1'],
        provider: ['ProvA'],
        date_of_service: { start: '', end: '' },
      },
    } as any));

    component.openFilters();
    tick();

    const cur = (component as any).filtersSubject.value;
    expect(cur.practice_groups).toBe('all');
    expect(cur.location).toEqual(['Loc1']);
  }));

  it('openFilters: asMany should return array for non-empty array', fakeAsync(() => {
    filterSvc.open.and.returnValue(of({
      values: {
        practice_groups: ['GroupA', 'GroupB'],
        location: null,  // null -> asMany returns 'all'
        provider: [],
        date_of_service: { start: '2025-01-01', end: '2025-06-30' },
      },
    } as any));

    component.openFilters();
    tick();

    const cur = (component as any).filtersSubject.value;
    expect(cur.practice_groups).toEqual(['GroupA', 'GroupB']);
    expect(cur.location).toBe('all');
    expect(cur.provider).toBe('all');
  }));

  // ---- chips$: date with only start_date or only end_date ----

  it('chips$ should include date chip with em-dash when only start_date is set', fakeAsync(() => {
    (component as any).filtersSubject.next({
      ...EMPTY_FILTERS,
      date_of_service: { start_date: '2025-01-01', end_date: '' },
    });
    let chips: any[] | undefined;
    component.chips$.subscribe(c => (chips = c));
    tick();
    const dateChip = chips!.find(c => c.key === 'date_of_service');
    expect(dateChip).toBeDefined();
    expect(dateChip.label).toContain('\u2014');
  }));

  it('chips$ should include provider chips', fakeAsync(() => {
    (component as any).filtersSubject.next({
      ...EMPTY_FILTERS,
      provider: ['Dr. Smith', 'Dr. Jones'],
    });
    let chips: any[] | undefined;
    component.chips$.subscribe(c => (chips = c));
    tick();
    const provChips = chips!.filter(c => c.key === 'provider');
    expect(provChips.length).toBe(2);
  }));
});
