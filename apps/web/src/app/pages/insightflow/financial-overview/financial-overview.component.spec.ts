import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { FinancialOverviewComponent } from './financial-overview.component';
import { InsightflowService } from '../../../core/services/insight-flow.service';
import { InsightflowStore } from '../../../store/insightflow/insightflow.store';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

describe('FinancialOverviewComponent', () => {
  let component: FinancialOverviewComponent;
  let fixture: ComponentFixture<FinancialOverviewComponent>;
  let mockService: jasmine.SpyObj<InsightflowService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockFiltersStore = {
    applied$: of({ location: { scope: 'all' }, payers: [] }),
    value: { location: { scope: 'all' }, payers: [] },
  };

  const mockInsightflowStore = {
    telemetryKpis$: of({ data: null, loading: false, error: null, cachedAt: null }),
    reloadTelemetryKpis: jasmine.createSpy('reloadTelemetryKpis'),
  };

  beforeEach(async () => {
    mockService = jasmine.createSpyObj('InsightflowService', [
      'getFinancialOverview',
      'getWriteOffs',
      'getWriteOffAnomalies',
      'getClaimVelocity',
      'getStalledClaims',
    ]);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    mockService.getFinancialOverview.and.returnValue(of({
      todayProduction: 1000,
      mtdProduction: 50000,
      ytdProduction: 600000,
      mtdCollections: 45000,
      outstandingAR: 120000,
      mtdWriteOffs: 5000,
      productionArrow: 'up',
      trend: [{ Month: '2026-01', Production: 100000 }],
    } as any));
    mockService.getWriteOffs.and.returnValue(of({
      byProvider: [],
      byType: [],
      summary: { GrandTotal: 0 },
    }));
    mockService.getWriteOffAnomalies.and.returnValue(of({ anomalies: [] }));
    mockService.getClaimVelocity.and.returnValue(of({
      overall: { AvgDays: 30, MinDays: 5, MaxDays: 90, TotalClaims: 100 },
      byPayer: [],
    }));
    mockService.getStalledClaims.and.returnValue(of({ claims: [], total: 0 }));

    await TestBed.configureTestingModule({
      declarations: [FinancialOverviewComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: InsightflowService, useValue: mockService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
        { provide: GlobalFiltersStore, useValue: mockFiltersStore },
        { provide: InsightflowStore, useValue: mockInsightflowStore },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FinancialOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load financial data on init', () => {
    expect(mockService.getFinancialOverview).toHaveBeenCalled();
    expect(component.loading).toBeFalse();
    expect(component.data).toBeTruthy();
  });

  it('should compute maxTrend from trend data', () => {
    expect(component.maxTrend).toBe(100000);
  });

  it('should load write-off data on init', () => {
    expect(mockService.getWriteOffs).toHaveBeenCalled();
    expect(component.woLoading).toBeFalse();
  });

  it('should load claim velocity data on init', () => {
    expect(mockService.getClaimVelocity).toHaveBeenCalled();
    expect(component.cvLoading).toBeFalse();
    expect(component.cvOverall).toBeTruthy();
  });

  it('should load stalled claims on init', () => {
    expect(mockService.getStalledClaims).toHaveBeenCalled();
    expect(component.stalledLoading).toBeFalse();
  });

  it('should reload stalled claims when loadStalled is called', () => {
    mockService.getStalledClaims.calls.reset();
    component.loadStalled();
    expect(mockService.getStalledClaims).toHaveBeenCalledWith(30, 1, 15, jasmine.any(Array), jasmine.any(Array), jasmine.any(Array));
  });

  it('should have default stalledThreshold of 30', () => {
    expect(component.stalledThreshold).toBe(30);
  });

  // -- formatMonth --------------------------------------------------------

  describe('formatMonth()', () => {
    it('should format 2026-01 as Jan \'26', () => {
      expect(component.formatMonth('2026-01')).toBe("Jan '26");
    });

    it('should format 2025-12 as Dec \'25', () => {
      expect(component.formatMonth('2025-12')).toBe("Dec '25");
    });

    it('should format 2025-06 as Jun \'25', () => {
      expect(component.formatMonth('2025-06')).toBe("Jun '25");
    });
  });

  // -- kpiRag -------------------------------------------------------------

  describe('kpiRag()', () => {
    it('should return rag-none for null value', () => {
      const card: any = { value: null, good: 'high', thresholds: { green: 0.95, amber: 0.90 }, format: 'percent', label: 'Test' };
      expect(component.kpiRag(card)).toBe('rag-none');
    });

    it('should return rag-green for high-good card at or above the benchmark', () => {
      const card: any = { value: 0.97, good: 'high', benchmark: 0.95, format: 'percent', label: 'Test' };
      expect(component.kpiRag(card)).toBe('rag-green');
    });

    it('should return rag-amber for high-good card just below the benchmark', () => {
      const card: any = { value: 0.92, good: 'high', benchmark: 0.95, format: 'percent', label: 'Test' };
      expect(component.kpiRag(card)).toBe('rag-amber');
    });

    it('should return rag-red for high-good card well below the benchmark', () => {
      const card: any = { value: 0.80, good: 'high', benchmark: 0.95, format: 'percent', label: 'Test' };
      expect(component.kpiRag(card)).toBe('rag-red');
    });

    it('should return rag-green for low-good card at or below the benchmark', () => {
      const card: any = { value: 30, good: 'low', benchmark: 35, format: 'days', label: 'Test' };
      expect(component.kpiRag(card)).toBe('rag-green');
    });

    it('should return rag-amber for low-good card just above the benchmark', () => {
      const card: any = { value: 40, good: 'low', benchmark: 35, format: 'days', label: 'Test' };
      expect(component.kpiRag(card)).toBe('rag-amber');
    });

    it('should return rag-red for low-good card well above the benchmark', () => {
      const card: any = { value: 60, good: 'low', benchmark: 35, format: 'days', label: 'Test' };
      expect(component.kpiRag(card)).toBe('rag-red');
    });
  });

  // -- onStalledPage ------------------------------------------------------

  describe('onStalledPage()', () => {
    it('should update stalledPage and reload', () => {
      mockService.getStalledClaims.calls.reset();
      component.onStalledPage({ pageIndex: 1, pageSize: 30 });
      expect(component.stalledPage).toBe(2);
      expect(component.stalledPageSize).toBe(30);
      expect(mockService.getStalledClaims).toHaveBeenCalledWith(30, 2, 30, jasmine.any(Array), jasmine.any(Array), jasmine.any(Array));
    });
  });

  // -- loadKpis -----------------------------------------------------------

  describe('loadKpis()', () => {
    it('should call store.reloadTelemetryKpis', () => {
      (mockInsightflowStore.reloadTelemetryKpis as jasmine.Spy).calls.reset();
      component.loadKpis();
      expect(mockInsightflowStore.reloadTelemetryKpis).toHaveBeenCalled();
    });
  });

  // -- ngOnDestroy --------------------------------------------------------

  describe('ngOnDestroy()', () => {
    it('should complete the destroy$ subject', () => {
      let completed = false;
      (component as any).destroy$.subscribe({ complete: () => (completed = true) });
      component.ngOnDestroy();
      expect(completed).toBeTrue();
    });
  });

  // -- buildKpiCards - phase 2 expanded KPIs (conditional push branches) --

  describe('buildKpiCards()', () => {
    it('should build the six benchmark KPI cards', () => {
      const kpiData: any = {
        grossCollectionRate: 0.95,
        netCollectionRate: 0.96,
        selfPayCollectionRate: 0.65,
        denialRate: 0.04,
        firstPassRate: 0.92,
        daysInAR: 32,
        avgDaysToPayment: 28,
        avgDaysToDenial: 12,
        avgDaysToWriteOff: 55,
        arAging90PlusPct: 0.10,
        writeOffRate: 0.03,
        cleanClaimRate: 0.96,
        costToCollect: 0.03,
        denialOverturnRate: 0.65,
        avgReimbursementPerClaim: 250,
        yoy: null,
      };
      const cards = (component as any).buildKpiCards(kpiData);
      const labels = cards.map((c: any) => c.label);
      expect(labels).toEqual([
        'Net Collection Rate',
        'Gross Collection Rate',
        'Write-Off Rate',
        'Self-Pay Collection',
        'Days in A/R',
        'Cost to Collect',
      ]);
      // Every card carries the benchmark that kpiRag grades against.
      cards.forEach((c: any) => expect(c.benchmark).toBeDefined());
    });

    it('should drop cards whose value is null', () => {
      const kpiData: any = {
        grossCollectionRate: 0.95,
        netCollectionRate: 0.96,
        selfPayCollectionRate: 0.65,
        denialRate: 0.04,
        firstPassRate: 0.92,
        daysInAR: 32,
        avgDaysToPayment: 28,
        avgDaysToDenial: 12,
        avgDaysToWriteOff: 55,
        arAging90PlusPct: null,
        writeOffRate: null,
        cleanClaimRate: null,
        costToCollect: null,
        denialOverturnRate: null,
        avgReimbursementPerClaim: null,
        yoy: null,
      };
      const cards = (component as any).buildKpiCards(kpiData);
      // writeOffRate and costToCollect are null here, so only the four cards
      // with values survive the filter.
      const labels = cards.map((c: any) => c.label);
      expect(labels).toEqual([
        'Net Collection Rate',
        'Gross Collection Rate',
        'Self-Pay Collection',
        'Days in A/R',
      ]);
      expect(cards.every((c: any) => c.value != null)).toBeTrue();
    });

    it('should include yoyValue from kpiData.yoy when present', () => {
      const kpiData: any = {
        grossCollectionRate: 0.95,
        netCollectionRate: 0.96,
        selfPayCollectionRate: 0.65,
        denialRate: 0.04,
        firstPassRate: 0.92,
        daysInAR: 32,
        avgDaysToPayment: 28,
        avgDaysToDenial: 12,
        avgDaysToWriteOff: 55,
        arAging90PlusPct: null,
        writeOffRate: null,
        cleanClaimRate: null,
        costToCollect: null,
        denialOverturnRate: null,
        avgReimbursementPerClaim: null,
        yoy: { grossCollectionRate: 0.90, netCollectionRate: 0.91, denialRate: 0.06 },
      };
      const cards = (component as any).buildKpiCards(kpiData);
      const grossCard = cards.find((c: any) => c.label === 'Gross Collection Rate');
      expect(grossCard.yoyValue).toBe(0.90);
    });
  });

  // -- loadFinancials error path ------------------------------------------

  describe('loadFinancials() error path', () => {
    it('should set loading to false on error', () => {
      const { throwError } = require('rxjs');
      mockService.getFinancialOverview.and.returnValue(throwError(() => new Error('fail')));
      component.loadFinancials();
      expect(component.loading).toBeFalse();
    });
  });

  // -- loadClaimVelocity error path --------------------------------------

  describe('loadClaimVelocity() error path', () => {
    it('should set cvLoading to false on error', () => {
      const { throwError } = require('rxjs');
      mockService.getClaimVelocity.and.returnValue(throwError(() => new Error('fail')));
      component.loadClaimVelocity();
      expect(component.cvLoading).toBeFalse();
    });
  });

  // -- loadStalled error path --------------------------------------------

  describe('loadStalled() error path', () => {
    it('should set stalledLoading to false on error', () => {
      const { throwError } = require('rxjs');
      mockService.getStalledClaims.and.returnValue(throwError(() => new Error('fail')));
      component.loadStalled();
      expect(component.stalledLoading).toBeFalse();
    });
  });
});
