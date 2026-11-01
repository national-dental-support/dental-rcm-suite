import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { take } from 'rxjs/operators';
import { DenialIqStore, DenialDashboardData } from './denial-iq.store';
import {
  DenialManagementService,
  DenialTrendPoint,
  DenialKpis,
  DenialReason,
  DenialFilterParams,
} from '../../core/services/denial-management.service';

const mockTrend: DenialTrendPoint[] = [
  { PeriodLabel: '2026-01', DeniedClaims: 40, DeniedCharges: 12000 } as DenialTrendPoint,
];
const mockKpis: DenialKpis = {
  currentDeniedClaims: 40, currentDeniedCharges: 12000, denialRate: 0.12,
  recoveryRate: 0.5, deltaClaimsYoy: 0.1, deltaChargesYoy: 0.05, deltaDenialRateYoy: -0.02,
} as DenialKpis;
const mockReasons: DenialReason[] = [
  { Reason: 'CO-16', CurrentAmount: 5000, PreviousAmount: 3000 } as DenialReason,
];

const mockDashboard: DenialDashboardData = {
  trend: mockTrend,
  kpis: mockKpis,
  reasons: mockReasons,
};

function setupSuccess(svc: jasmine.SpyObj<DenialManagementService>) {
  svc.getTrend.and.returnValue(of(mockTrend));
  svc.getKpis.and.returnValue(of(mockKpis));
  svc.getTopReasons.and.returnValue(of(mockReasons));
}

describe('DenialIqStore', () => {
  let store: DenialIqStore;
  let svc: jasmine.SpyObj<DenialManagementService>;

  beforeEach(() => {
    svc = jasmine.createSpyObj<DenialManagementService>('DenialManagementService', [
      'getTrend', 'getKpis', 'getTopReasons',
    ]);

    TestBed.configureTestingModule({
      providers: [
        DenialIqStore,
        { provide: DenialManagementService, useValue: svc },
      ],
    });
    store = TestBed.inject(DenialIqStore);
  });

  it('should start with empty slice', () => {
    expect(store.dashboardSnapshot).toBeNull();
  });

  it('should emit loading then loaded on loadDashboard', fakeAsync(() => {
    setupSuccess(svc);
    const loadingStates: boolean[] = [];
    store.loading$.pipe(take(3)).subscribe(l => loadingStates.push(l));

    store.loadDashboard();
    tick();

    expect(loadingStates).toEqual([false, true, false]);
    expect(store.dashboardSnapshot).toEqual(mockDashboard);
  }));

  it('should cache data within TTL and skip second load', fakeAsync(() => {
    setupSuccess(svc);
    store.loadDashboard();
    tick();

    store.loadDashboard(); // should be skipped (TTL)
    tick();

    expect(svc.getTrend).toHaveBeenCalledTimes(1);
  }));

  it('should bypass cache when force=true', fakeAsync(() => {
    setupSuccess(svc);
    store.loadDashboard();
    tick();

    store.loadDashboard(undefined, true);
    tick();

    expect(svc.getTrend).toHaveBeenCalledTimes(2);
  }));

  it('reloadDashboard should always bypass cache', fakeAsync(() => {
    setupSuccess(svc);
    store.loadDashboard();
    tick();

    store.reloadDashboard();
    tick();

    expect(svc.getTrend).toHaveBeenCalledTimes(2);
  }));

  it('should set error on failure', fakeAsync(() => {
    svc.getTrend.and.returnValue(throwError(() => new Error('Network error')));
    svc.getKpis.and.returnValue(of(mockKpis));
    svc.getTopReasons.and.returnValue(of(mockReasons));

    let error: string | null = null;
    store.error$.subscribe(e => error = e);

    store.loadDashboard();
    tick();

    expect(error).toBeTruthy();
    expect(store.dashboardSnapshot).toBeNull();
  }));

  it('should pass filters to service as DenialFilterParams', fakeAsync(() => {
    setupSuccess(svc);
    const filters = {
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
      payers: ['Aetna'],
    } as any;

    store.loadDashboard(filters);
    tick();

    const passedParams = svc.getTrend.calls.mostRecent().args[0] as DenialFilterParams;
    expect(passedParams.start).toBe('2026-01-01');
    expect(passedParams.end).toBe('2026-01-31');
    expect(passedParams.payers).toEqual(['Aetna']);
  }));

  it('should pass empty params when no filters given', fakeAsync(() => {
    setupSuccess(svc);
    store.loadDashboard();
    tick();

    expect(svc.getTrend).toHaveBeenCalledWith({});
  }));

  it('reloadByParams should call service with raw params', fakeAsync(() => {
    setupSuccess(svc);
    const params: DenialFilterParams = { start: '2026-02-01', end: '2026-02-28', payers: [] };

    store.reloadByParams(params);
    tick();

    expect(svc.getTrend).toHaveBeenCalledWith(params);
    expect(store.dashboardSnapshot).toEqual(mockDashboard);
  }));

  it('reloadByParams should set error on failure', fakeAsync(() => {
    svc.getTrend.and.returnValue(throwError(() => new Error('Timeout')));
    svc.getKpis.and.returnValue(of(mockKpis));
    svc.getTopReasons.and.returnValue(of(mockReasons));

    store.reloadByParams({ start: '2026-01-01' });
    tick();

    let error: string | null = null;
    store.error$.subscribe(e => error = e);

    expect(error).toBeTruthy();
  }));

  it('data$ should emit null then data', fakeAsync(() => {
    setupSuccess(svc);
    const values: (DenialDashboardData | null)[] = [];
    store.data$.pipe(take(2)).subscribe(d => values.push(d));

    store.loadDashboard();
    tick();

    expect(values).toEqual([null, mockDashboard]);
  }));
});
