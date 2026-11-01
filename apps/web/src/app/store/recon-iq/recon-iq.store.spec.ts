import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { take } from 'rxjs/operators';
import { ReconIqStore, ReconDashboardData, ReconReportData } from './recon-iq.store';
import {
  ReconIqService,
  ReconReportFilters,
  ReconReportSummary,
  ReconReportPayerRow,
  ReconReportTrendRow,
  ReconReportInTransitRow,
  ReconIqEraEobPaymentResponse,
} from '../../core/services/recon-iq.service';
import {
  ReconIqMatchStatsResponse,
  DenialsNonPaymentsResponseDto,
} from '../../core/models/recon-iq.models';

const mockMatchStats = { matched: 100, unmatched: 10 } as unknown as ReconIqMatchStatsResponse;
const mockDeniedTrend = { data: [] } as unknown as DenialsNonPaymentsResponseDto;
const mockEraEob = { data: [] } as unknown as ReconIqEraEobPaymentResponse;

const mockDashboard: ReconDashboardData = {
  matchStats: mockMatchStats,
  deniedTrend: mockDeniedTrend,
  eraEobPayment: mockEraEob,
};

const mockSummary = { totalClaims: 500, matchedClaims: 450 } as unknown as ReconReportSummary;
const mockByPayer = { rows: [{ payerName: 'Aetna', total: 100 }] as unknown as ReconReportPayerRow[] };
const mockTrend = { rows: [{ month: '2026-01', total: 200 }] as unknown as ReconReportTrendRow[] };
const mockInTransit = { rows: [] as ReconReportInTransitRow[], total: 0 };

const mockReport: ReconReportData = {
  summary: mockSummary,
  byPayer: mockByPayer,
  trend: mockTrend,
  inTransit: mockInTransit,
};

const defaultFilters: ReconReportFilters = { months: 1, location: '', payer: '', postStatus: 'all' } as ReconReportFilters;

describe('ReconIqStore', () => {
  let store: ReconIqStore;
  let svc: jasmine.SpyObj<ReconIqService>;

  beforeEach(() => {
    svc = jasmine.createSpyObj<ReconIqService>('ReconIqService', [
      'getMatchStats', 'getDeniedClaimsAndNonPaymentsTrend', 'getEraEobPayment',
      'getReconReportSummary', 'getReconReportByPayer', 'getReconReportMonthlyTrend', 'getReconReportInTransit',
    ]);

    TestBed.configureTestingModule({
      providers: [
        ReconIqStore,
        { provide: ReconIqService, useValue: svc },
      ],
    });
    store = TestBed.inject(ReconIqStore);
  });

  function setupDashboardSuccess() {
    svc.getMatchStats.and.returnValue(of(mockMatchStats));
    svc.getDeniedClaimsAndNonPaymentsTrend.and.returnValue(of(mockDeniedTrend));
    svc.getEraEobPayment.and.returnValue(of(mockEraEob));
  }

  function setupReportSuccess() {
    svc.getReconReportSummary.and.returnValue(of(mockSummary));
    svc.getReconReportByPayer.and.returnValue(of(mockByPayer));
    svc.getReconReportMonthlyTrend.and.returnValue(of(mockTrend));
    svc.getReconReportInTransit.and.returnValue(of(mockInTransit));
  }

  // -- Dashboard --

  it('should start with null dashboard snapshot', () => {
    expect(store.dashboardSnapshot).toBeNull();
  });

  it('should load dashboard data', fakeAsync(() => {
    setupDashboardSuccess();
    store.loadDashboard();
    tick();

    expect(store.dashboardSnapshot).toEqual(mockDashboard);
  }));

  it('should emit loading states for dashboard', fakeAsync(() => {
    setupDashboardSuccess();
    const states: boolean[] = [];
    store.dashboardLoading$.pipe(take(3)).subscribe(l => states.push(l));

    store.loadDashboard();
    tick();

    expect(states).toEqual([false, true, false]);
  }));

  it('should cache dashboard within TTL', fakeAsync(() => {
    setupDashboardSuccess();
    store.loadDashboard();
    tick();
    store.loadDashboard();
    tick();

    expect(svc.getMatchStats).toHaveBeenCalledTimes(1);
  }));

  it('should bypass cache with force=true', fakeAsync(() => {
    setupDashboardSuccess();
    store.loadDashboard();
    tick();
    store.loadDashboard(undefined, true);
    tick();

    expect(svc.getMatchStats).toHaveBeenCalledTimes(2);
  }));

  it('reloadDashboard should bypass cache', fakeAsync(() => {
    setupDashboardSuccess();
    store.loadDashboard();
    tick();
    store.reloadDashboard();
    tick();

    expect(svc.getMatchStats).toHaveBeenCalledTimes(2);
  }));

  it('should set dashboard error on failure', fakeAsync(() => {
    svc.getMatchStats.and.returnValue(throwError(() => new Error('fail')));
    svc.getDeniedClaimsAndNonPaymentsTrend.and.returnValue(of(mockDeniedTrend));
    svc.getEraEobPayment.and.returnValue(of(mockEraEob));

    store.loadDashboard();
    tick();

    let error: string | null = null;
    store.dashboardError$.subscribe(e => error = e);
    expect(error).toBeTruthy();
  }));

  // -- Report --

  it('should start with null report snapshot', () => {
    expect(store.reportSnapshot).toBeNull();
  });

  it('should load report data', fakeAsync(() => {
    setupReportSuccess();
    store.loadReport(defaultFilters);
    tick();

    expect(store.reportSnapshot).toEqual(mockReport);
  }));

  it('should emit loading states for report', fakeAsync(() => {
    setupReportSuccess();
    const states: boolean[] = [];
    store.reportLoading$.pipe(take(3)).subscribe(l => states.push(l));

    store.loadReport(defaultFilters);
    tick();

    expect(states).toEqual([false, true, false]);
  }));

  it('should cache report within TTL', fakeAsync(() => {
    setupReportSuccess();
    store.loadReport(defaultFilters);
    tick();
    store.loadReport(defaultFilters);
    tick();

    expect(svc.getReconReportSummary).toHaveBeenCalledTimes(1);
  }));

  it('reloadReport should bypass cache', fakeAsync(() => {
    setupReportSuccess();
    store.loadReport(defaultFilters);
    tick();
    store.reloadReport(defaultFilters);
    tick();

    expect(svc.getReconReportSummary).toHaveBeenCalledTimes(2);
  }));

  it('should set report error on failure', fakeAsync(() => {
    svc.getReconReportSummary.and.returnValue(throwError(() => new Error('db timeout')));
    svc.getReconReportByPayer.and.returnValue(of(mockByPayer));
    svc.getReconReportMonthlyTrend.and.returnValue(of(mockTrend));
    svc.getReconReportInTransit.and.returnValue(of(mockInTransit));

    store.loadReport(defaultFilters);
    tick();

    let error: string | null = null;
    store.reportError$.subscribe(e => error = e);
    expect(error).toBeTruthy();
  }));
});
