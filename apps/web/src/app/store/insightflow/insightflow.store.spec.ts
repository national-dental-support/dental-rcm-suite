import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { take } from 'rxjs/operators';
import { InsightflowStore, ExecSummaryResponse, DenialKpisData } from './insightflow.store';
import {
  DenialManagementService,
  DenialTrendPoint,
  DenialKpis,
  DenialReason,
} from '../../core/services/denial-management.service';
import { BenchmarkingService, BenchmarkComparison } from '../../core/services/benchmarking.service';
import { InsightflowService, InsightflowKpiData } from '../../core/services/insight-flow.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const mockTelemetryKpis: InsightflowKpiData = {
  period: { window: 'year', start: '2026-01-01', end: '2026-12-31' },
  grossCollectionRate: 0.95,
  netCollectionRate: 0.97,
  selfPayCollectionRate: 0.65,
  denialRate: 0.08,
  firstPassRate: 0.92,
  daysInAR: 38,
  avgDaysToPayment: 24,
  avgDaysToDenial: 11,
  avgDaysToWriteOff: 75,
  arAging90PlusPct: 0.18,
  writeOffRate: 0.03,
  cleanClaimRate: 0.94,
  costToCollect: 0.045,
  denialOverturnRate: 0.55,
  avgReimbursementPerClaim: 320,
};

const mockExecSummary: ExecSummaryResponse = {
  generatedAt: '2026-03-12T00:00:00Z',
  overallStatus: 'green',
  criticalCount: 0,
  warningCount: 1,
  okCount: 4,
  sections: {},
  crossProductInsights: [],
  actionQueue: [],
};

const mockTrend: DenialTrendPoint[] = [{ PeriodLabel: '2026-01', DeniedClaims: 20, DeniedCharges: 5000 } as DenialTrendPoint];
const mockKpis: DenialKpis = {
  currentDeniedClaims: 20, currentDeniedCharges: 5000, denialRate: 0.1,
  recoveryRate: 0.4, deltaClaimsYoy: 0.05, deltaChargesYoy: 0.03, deltaDenialRateYoy: -0.01,
} as DenialKpis;
const mockReasons: DenialReason[] = [{ Reason: 'CO-4', CurrentAmount: 3000, PreviousAmount: 2000 } as DenialReason];

const mockDenialKpisData: DenialKpisData = {
  trend: mockTrend,
  kpis: mockKpis,
  reasons: mockReasons,
};

const mockBenchmarking = {
  comparisons: [{ metric: 'denial_rate', practiceValue: 0.08 } as BenchmarkComparison],
  generatedAt: '2026-03-12',
};

describe('InsightflowStore', () => {
  let store: InsightflowStore;
  let httpMock: HttpTestingController;
  let denialSvc: jasmine.SpyObj<DenialManagementService>;
  let benchSvc: jasmine.SpyObj<BenchmarkingService>;
  let insightflowSvc: jasmine.SpyObj<InsightflowService>;

  beforeEach(() => {
    denialSvc = jasmine.createSpyObj<DenialManagementService>('DenialManagementService', [
      'getTrend', 'getKpis', 'getTopReasons',
    ]);
    benchSvc = jasmine.createSpyObj<BenchmarkingService>('BenchmarkingService', ['getComparison']);
    insightflowSvc = jasmine.createSpyObj<InsightflowService>('InsightflowService', ['getKpis']);

    TestBed.configureTestingModule({
    imports: [],
    providers: [
        InsightflowStore,
        { provide: DenialManagementService, useValue: denialSvc },
        { provide: BenchmarkingService, useValue: benchSvc },
        { provide: InsightflowService, useValue: insightflowSvc },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});
    store = TestBed.inject(InsightflowStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // -- Exec Summary --

  it('should start with null execSummarySnapshot', () => {
    expect(store.execSummarySnapshot).toBeNull();
  });

  it('should load executive summary via HTTP', fakeAsync(() => {
    store.loadExecSummary();
    const req = httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'));
    req.flush(mockExecSummary);
    tick();

    expect(store.execSummarySnapshot).toEqual(mockExecSummary);
  }));

  it('should emit loading states for exec summary', fakeAsync(() => {
    const states: boolean[] = [];
    store.execSummaryLoading$.pipe(take(3)).subscribe(l => states.push(l));

    store.loadExecSummary();
    const req = httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'));
    req.flush(mockExecSummary);
    tick();

    expect(states).toEqual([false, true, false]);
  }));

  it('should cache exec summary within TTL', fakeAsync(() => {
    store.loadExecSummary();
    httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary')).flush(mockExecSummary);
    tick();

    store.loadExecSummary(); // cached - no second request
    httpMock.expectNone(r => r.url.includes('/insightflow/executive-summary'));
  }));

  it('should bypass cache with force=true', fakeAsync(() => {
    store.loadExecSummary();
    httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary')).flush(mockExecSummary);
    tick();

    store.loadExecSummary(undefined, true);
    httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary')).flush(mockExecSummary);
    tick();
  }));

  it('should set error on exec summary failure', fakeAsync(() => {
    store.loadExecSummary();
    httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'))
      .flush('Server error', { status: 500, statusText: 'Internal Server Error' });
    tick();

    let error: string | null = null;
    store.execSummaryError$.subscribe(e => error = e);
    expect(error).toBeTruthy();
  }));

  // -- Denial KPIs --

  it('should load denial KPIs via forkJoin', fakeAsync(() => {
    denialSvc.getTrend.and.returnValue(of(mockTrend));
    denialSvc.getKpis.and.returnValue(of(mockKpis));
    denialSvc.getTopReasons.and.returnValue(of(mockReasons));

    store.loadDenialKpis();
    tick();

    let data: DenialKpisData | null = null;
    store.denialKpisData$.subscribe(d => data = d);
    expect(data).toEqual(mockDenialKpisData);
  }));

  it('should cache denial KPIs within TTL', fakeAsync(() => {
    denialSvc.getTrend.and.returnValue(of(mockTrend));
    denialSvc.getKpis.and.returnValue(of(mockKpis));
    denialSvc.getTopReasons.and.returnValue(of(mockReasons));

    store.loadDenialKpis();
    tick();
    store.loadDenialKpis();
    tick();

    expect(denialSvc.getTrend).toHaveBeenCalledTimes(1);
  }));

  it('reloadDenialKpis should bypass cache', fakeAsync(() => {
    denialSvc.getTrend.and.returnValue(of(mockTrend));
    denialSvc.getKpis.and.returnValue(of(mockKpis));
    denialSvc.getTopReasons.and.returnValue(of(mockReasons));

    store.loadDenialKpis();
    tick();
    store.reloadDenialKpis();
    tick();

    expect(denialSvc.getTrend).toHaveBeenCalledTimes(2);
  }));

  it('should set error on denial KPIs failure', fakeAsync(() => {
    denialSvc.getTrend.and.returnValue(throwError(() => new Error('timeout')));
    denialSvc.getKpis.and.returnValue(of(mockKpis));
    denialSvc.getTopReasons.and.returnValue(of(mockReasons));

    store.loadDenialKpis();
    tick();

    let error: string | null = null;
    store.denialKpisError$.subscribe(e => error = e);
    expect(error).toBeTruthy();
  }));

  // -- Benchmarking --

  it('should load benchmarking via service', fakeAsync(() => {
    benchSvc.getComparison.and.returnValue(of(mockBenchmarking));

    store.loadBenchmarking();
    tick();

    let data: any = null;
    store.benchmarkingData$.subscribe(d => data = d);
    expect(data).toEqual(mockBenchmarking);
  }));

  it('should cache benchmarking within TTL', fakeAsync(() => {
    benchSvc.getComparison.and.returnValue(of(mockBenchmarking));

    store.loadBenchmarking();
    tick();
    store.loadBenchmarking();
    tick();

    expect(benchSvc.getComparison).toHaveBeenCalledTimes(1);
  }));

  it('should set error on benchmarking failure', fakeAsync(() => {
    benchSvc.getComparison.and.returnValue(throwError(() => new Error('fail')));

    store.loadBenchmarking();
    tick();

    let error: string | null = null;
    store.benchmarkingError$.subscribe(e => error = e);
    expect(error).toBeTruthy();
  }));

  // -- Telemetry KPIs --

  it('should load telemetry KPIs via InsightflowService', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));

    store.loadTelemetryKpis(undefined, false, true);
    tick();

    let data: InsightflowKpiData | null = null;
    store.telemetryKpisData$.subscribe(d => data = d);
    expect(data).toEqual(mockTelemetryKpis);
    expect(insightflowSvc.getKpis).toHaveBeenCalledWith(jasmine.any(String), jasmine.any(String), false, [], [], []);
  }));

  it('should cache telemetry KPIs within TTL', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));

    store.loadTelemetryKpis(undefined, false, true);
    tick();
    store.loadTelemetryKpis(undefined, false, false); // cached
    tick();

    expect(insightflowSvc.getKpis).toHaveBeenCalledTimes(1);
  }));

  it('reloadTelemetryKpis should bypass cache', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));

    store.loadTelemetryKpis(undefined, false, true);
    tick();
    store.reloadTelemetryKpis();
    tick();

    expect(insightflowSvc.getKpis).toHaveBeenCalledTimes(2);
  }));

  it('should pass yoy param to service', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));

    store.loadTelemetryKpis(undefined, true, true);
    tick();

    expect(insightflowSvc.getKpis).toHaveBeenCalledWith(jasmine.any(String), jasmine.any(String), true, [], [], []);
  }));

  it('should set error on telemetry KPIs failure', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(throwError(() => new Error('network error')));

    store.loadTelemetryKpis(undefined, false, true);
    tick();

    let error: string | null = null;
    store.telemetryKpisError$.subscribe(e => error = e);
    expect(error).toBeTruthy();
  }));

  it('should emit loading states for telemetry KPIs', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));
    const states: boolean[] = [];
    store.telemetryKpisLoading$.pipe(take(3)).subscribe(l => states.push(l));

    store.loadTelemetryKpis(undefined, false, true);
    tick();

    expect(states).toEqual([false, true, false]);
  }));

  // -- loadExecSummary with filters ------------------------------------------

  it('loadExecSummary uses startDate/endDate from filters when provided', fakeAsync(() => {
    const filters: any = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      payers: ['Aetna'],
      providers: ['Dr. A'],
      location: { scope: 'enterprise' },
    };
    store.loadExecSummary(filters);
    const req = httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'));
    expect(req.request.urlWithParams).toContain('start=2025-01-01');
    req.flush(mockExecSummary);
    tick();
  }));

  it('loadExecSummary appends payers and providers to params', fakeAsync(() => {
    const filters: any = {
      payers: ['Aetna', 'Cigna'],
      providers: ['Dr. B'],
      location: { scope: 'enterprise' },
    };
    store.loadExecSummary(filters);
    const req = httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'));
    expect(req.request.urlWithParams).toContain('payers=Aetna');
    req.flush(mockExecSummary);
    tick();
  }));

  it('loadExecSummary handles location scope=location', fakeAsync(() => {
    const filters: any = {
      payers: [],
      providers: [],
      location: { scope: 'location', locations: ['Loc1'] },
    };
    store.loadExecSummary(filters);
    const req = httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'));
    expect(req.request.urlWithParams).toContain('locations=Loc1');
    req.flush(mockExecSummary);
    tick();
  }));

  it('loadExecSummary handles location scope=practice', fakeAsync(() => {
    const filters: any = {
      payers: [],
      providers: [],
      location: { scope: 'practice', practices: ['PracticeA'] },
    };
    store.loadExecSummary(filters);
    const req = httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'));
    expect(req.request.urlWithParams).toContain('practices=PracticeA');
    req.flush(mockExecSummary);
    tick();
  }));

  it('loadExecSummary handles location scope=group', fakeAsync(() => {
    const filters: any = {
      payers: [],
      providers: [],
      location: { scope: 'group', groups: ['GroupA'] },
    };
    store.loadExecSummary(filters);
    const req = httpMock.expectOne(r => r.url.includes('/insightflow/executive-summary'));
    expect(req.request.urlWithParams).toContain('groups=GroupA');
    req.flush(mockExecSummary);
    tick();
  }));

  // -- loadDenialKpis with filters --------------------------------------------

  it('loadDenialKpis uses startDate/endDate from filters', fakeAsync(() => {
    denialSvc.getTrend.and.returnValue(of(mockTrend));
    denialSvc.getKpis.and.returnValue(of(mockKpis));
    denialSvc.getTopReasons.and.returnValue(of(mockReasons));

    const filters: any = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      payers: ['BlueCross'],
    };
    store.loadDenialKpis(filters);
    tick();

    const callArgs = denialSvc.getTrend.calls.mostRecent().args[0];
    expect(callArgs.start).toBe('2025-01-01');
    expect(callArgs.end).toBe('2025-12-31');
    expect(callArgs.payers).toEqual(['BlueCross']);
  }));

  // -- loadTelemetryKpis with filters ----------------------------------------

  it('loadTelemetryKpis uses startDate/endDate and location from filters', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));

    const filters: any = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      payers: ['Aetna'],
      providers: ['Dr. C'],
      location: { scope: 'location', locations: ['LocA'] },
    };
    store.loadTelemetryKpis(filters, false, true);
    tick();

    expect(insightflowSvc.getKpis).toHaveBeenCalledWith(
      '2025-01-01', '2025-12-31', false, ['Aetna'], ['Dr. C'], ['LocA']
    );
  }));

  it('loadTelemetryKpis uses ?? [] for non-location scope', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));

    const filters: any = {
      payers: ['Aetna'],
      providers: [],
      location: { scope: 'enterprise' },
    };
    store.loadTelemetryKpis(filters, false, true);
    tick();

    const callArgs = insightflowSvc.getKpis.calls.mostRecent().args;
    expect(callArgs[5]).toEqual([]); // locations should be []
  }));

  // -- loadBenchmarking with filters -----------------------------------------

  it('loadBenchmarking uses startDate/endDate from filters', fakeAsync(() => {
    benchSvc.getComparison.and.returnValue(of(mockBenchmarking));

    const filters: any = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      payers: [],
      providers: [],
      location: { scope: 'enterprise' },
    };
    store.loadBenchmarking(filters);
    tick();

    const callArgs = benchSvc.getComparison.calls.mostRecent().args;
    expect(callArgs[0]).toBe('2025-01-01');
    expect(callArgs[1]).toBe('2025-12-31');
  }));

  it('loadBenchmarking handles location scope=location', fakeAsync(() => {
    benchSvc.getComparison.and.returnValue(of(mockBenchmarking));

    const filters: any = {
      payers: [],
      providers: [],
      location: { scope: 'location', locations: ['LocB'] },
    };
    store.loadBenchmarking(filters);
    tick();

    const callArgs = benchSvc.getComparison.calls.mostRecent().args;
    expect(callArgs[4]).toEqual(['LocB']);
  }));

  // -- clear() ---------------------------------------------------------------

  it('clear() should reset all slices to null', fakeAsync(() => {
    insightflowSvc.getKpis.and.returnValue(of(mockTelemetryKpis));
    store.loadTelemetryKpis(undefined, false, true);
    tick();

    store.clear();

    let data: any = 'not-null';
    store.telemetryKpisData$.subscribe(d => data = d);
    expect(data).toBeNull();
  }));
});
