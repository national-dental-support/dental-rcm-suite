import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PayerMixStore } from './payer-mix.store';
import { PayerMixService } from '../services/payer-mix.service';
import { Filters, Totals, CollectionPoint, PayerChange, ProcedureChange, PayerCollectionDetail } from '../models/payer-mix.models';

const MOCK_FILTERS: Filters = {
  provider: 'all',
  practice_groups: 'all',
  location: 'all',
  payment_received: { start_date: '', end_date: '' },
};

const MOCK_TOTALS: Totals = { total: '$100K', prior_year: '$90K', all_time: '$500K' };

const MOCK_TRENDS: CollectionPoint[] = [
  { monthLabel: 'Jan 2025', insuranceCollection: 10000, patientCollection: 2000, insuranceTrend: 10000 },
];

const MOCK_PAYER_CHANGES: PayerChange[] = [
  { insuranceId: 1, insuranceName: 'BCBS', currentPeriodCharges: 50000, lastPeriodCharges: 40000, chargeDelta: 10000, chargeDeltaPct: 25 },
  { insuranceId: 2, insuranceName: 'Aetna', currentPeriodCharges: 30000, lastPeriodCharges: 35000, chargeDelta: -5000, chargeDeltaPct: -14 },
  { insuranceId: 3, insuranceName: 'UHC', currentPeriodCharges: 20000, lastPeriodCharges: 18000, chargeDelta: 2000, chargeDeltaPct: 11 },
  { insuranceId: 4, insuranceName: 'Cigna', currentPeriodCharges: 15000, lastPeriodCharges: 14000, chargeDelta: 1000, chargeDeltaPct: 7 },
  { insuranceId: 5, insuranceName: 'Humana', currentPeriodCharges: 12000, lastPeriodCharges: 11000, chargeDelta: 1000, chargeDeltaPct: 9 },
  { insuranceId: 6, insuranceName: 'Medicaid', currentPeriodCharges: 8000, lastPeriodCharges: 7500, chargeDelta: 500, chargeDeltaPct: 7 },
  { insuranceId: 7, insuranceName: 'Medicare', currentPeriodCharges: 5000, lastPeriodCharges: 4800, chargeDelta: 200, chargeDeltaPct: 4 },
  { insuranceId: 8, insuranceName: 'Other', currentPeriodCharges: 3000, lastPeriodCharges: 3100, chargeDelta: -100, chargeDeltaPct: -3 },
];

const MOCK_PROC_CHANGES: ProcedureChange[] = [
  { procedureCode: 'D1110', currentPeriodCharges: 8000, lastPeriodCharges: 6000, chargeDelta: 2000, chargeDeltaPct: 33 },
];

const MOCK_COLLECTION_DETAILS: PayerCollectionDetail[] = [
  { insuranceName: 'BCBS', totalCollections: 50000, insuranceCollections: 40000, patientCollections: 10000, insurancePercentage: 80, patientPercentage: 20, claim: 55000 },
];

function makeApiSpy(): jasmine.SpyObj<any> {
  const spy = jasmine.createSpyObj('PayerMixService', [
    'getCollectionTrends',
    'getInsuranceTotals',
    'getPatientTotals',
    'getPayersIncreasing',
    'getPayersDecreasing',
    'getProceduresIncreasing',
    'getProceduresDecreasing',
    'getPayerCollectionDetails',
  ]);
  spy.getCollectionTrends.and.returnValue(of(MOCK_TRENDS));
  spy.getInsuranceTotals.and.returnValue(of(MOCK_TOTALS));
  spy.getPatientTotals.and.returnValue(of(MOCK_TOTALS));
  spy.getPayersIncreasing.and.returnValue(of(MOCK_PAYER_CHANGES));
  spy.getPayersDecreasing.and.returnValue(of(MOCK_PAYER_CHANGES));
  spy.getProceduresIncreasing.and.returnValue(of(MOCK_PROC_CHANGES));
  spy.getProceduresDecreasing.and.returnValue(of(MOCK_PROC_CHANGES));
  spy.getPayerCollectionDetails.and.returnValue(of(MOCK_COLLECTION_DETAILS));
  return spy;
}

describe('PayerMixStore', () => {
  let store: PayerMixStore;
  let apiSpy: jasmine.SpyObj<any>;

  beforeEach(() => {
    apiSpy = makeApiSpy();
    TestBed.configureTestingModule({
      providers: [
        PayerMixStore,
        { provide: PayerMixService, useValue: apiSpy },
      ],
    });
    store = TestBed.inject(PayerMixStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('filters$ should emit initial empty filters', fakeAsync(() => {
    let filters: Filters | undefined;
    store.filters$.subscribe(f => (filters = f));
    tick();
    expect(filters).toBeDefined();
    expect(filters!.provider).toBe('all');
    expect(filters!.practice_groups).toBe('all');
  }));

  it('loading$ should emit false after data loads', fakeAsync(() => {
    let loading: boolean | undefined;
    store.loading$.subscribe(l => (loading = l));
    tick();
    expect(loading).toBeFalse();
  }));

  it('collectionTrends$ should emit trends from API', fakeAsync(() => {
    let trends: CollectionPoint[] | undefined;
    store.collectionTrends$.subscribe(t => (trends = t));
    tick();
    expect(trends).toEqual(MOCK_TRENDS);
  }));

  it('totalsInsurance$ should emit insurance totals from API', fakeAsync(() => {
    let totals: Totals | undefined;
    store.totalsInsurance$.subscribe(t => (totals = t));
    tick();
    expect(totals).toEqual(MOCK_TOTALS);
  }));

  it('totalsPatient$ should emit patient totals from API', fakeAsync(() => {
    let totals: Totals | undefined;
    store.totalsPatient$.subscribe(t => (totals = t));
    tick();
    expect(totals).toEqual(MOCK_TOTALS);
  }));

  it('payersIncreasing$ should slice to max 7 results', fakeAsync(() => {
    let rows: PayerChange[] | undefined;
    store.payersIncreasing$.subscribe(r => (rows = r));
    tick();
    // MOCK_PAYER_CHANGES has 8, slice to 7
    expect(rows!.length).toBe(7);
  }));

  it('payersDecreasing$ should slice to max 7 results', fakeAsync(() => {
    let rows: PayerChange[] | undefined;
    store.payersDecreasing$.subscribe(r => (rows = r));
    tick();
    expect(rows!.length).toBe(7);
  }));

  it('proceduresIncreasing$ should emit procedure changes from API', fakeAsync(() => {
    let rows: ProcedureChange[] | undefined;
    store.proceduresIncreasing$.subscribe(r => (rows = r));
    tick();
    expect(rows!.length).toBe(1);
    expect(rows![0].procedureCode).toBe('D1110');
  }));

  it('proceduresDecreasing$ should emit procedure changes from API', fakeAsync(() => {
    let rows: ProcedureChange[] | undefined;
    store.proceduresDecreasing$.subscribe(r => (rows = r));
    tick();
    expect(rows!.length).toBe(1);
  }));

  it('payerCollectionDetails$ should emit collection details from API', fakeAsync(() => {
    let rows: PayerCollectionDetail[] | undefined;
    store.payerCollectionDetails$.subscribe(r => (rows = r));
    tick();
    expect(rows!.length).toBe(1);
    expect(rows![0].insuranceName).toBe('BCBS');
  }));

  it('providers$ should emit empty array', fakeAsync(() => {
    let providers: string[] | undefined;
    store.providers$.subscribe(p => (providers = p));
    tick();
    expect(providers).toEqual([]);
  }));

  it('practiceGroups$ should emit empty array', fakeAsync(() => {
    let groups: string[] | undefined;
    store.practiceGroups$.subscribe(g => (groups = g));
    tick();
    expect(groups).toEqual([]);
  }));

  it('locations$ should emit empty array', fakeAsync(() => {
    let locs: string[] | undefined;
    store.locations$.subscribe(l => (locs = l));
    tick();
    expect(locs).toEqual([]);
  }));

  it('patchFilters should update filters and trigger new data fetch', fakeAsync(() => {
    // Subscribe to data$ to trigger the switchMap pipeline
    let emitCount = 0;
    const sub = store.data$.subscribe(() => emitCount++);
    tick();
    const countBefore = emitCount;
    store.patchFilters({ provider: ['Dr. Smith'] });
    tick();
    sub.unsubscribe();
    expect(emitCount).toBeGreaterThan(countBefore);
  }));

  it('patchFilters should merge with existing filters', fakeAsync(() => {
    store.patchFilters({ provider: ['Dr. Jones'] });
    tick();
    let filters: Filters | undefined;
    store.filters$.subscribe(f => (filters = f)).unsubscribe();
    expect(filters!.provider).toEqual(['Dr. Jones']);
    expect(filters!.practice_groups).toBe('all'); // unchanged
  }));

  it('resetFilters should restore empty/all filters', fakeAsync(() => {
    store.patchFilters({ provider: ['Dr. Smith'] });
    tick();
    store.resetFilters();
    tick();
    let filters: Filters | undefined;
    store.filters$.subscribe(f => (filters = f)).unsubscribe();
    expect(filters!.provider).toBe('all');
  }));

  it('payersIncreasing$ emits empty array when API returns null-ish data', fakeAsync(() => {
    apiSpy.getPayersIncreasing.and.returnValue(of(null as any));
    // Re-create store to pick up new spy
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PayerMixStore,
        { provide: PayerMixService, useValue: apiSpy },
      ],
    });
    const store2 = TestBed.inject(PayerMixStore);
    let rows: PayerChange[] | undefined;
    store2.payersIncreasing$.subscribe(r => (rows = r));
    tick();
    expect(rows).toEqual([]);
  }));
});
