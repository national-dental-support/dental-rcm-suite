import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatMenuModule } from '@angular/material/menu';
import { of } from 'rxjs';
import { DenialManagementComponent } from './denial-management.component';
import { DenialIqStore } from '../../../store/denial-iq/denial-iq.store';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { ThemeService } from '../../../core/services/theme.service';
import { CsvExportService } from '../../../core/services/csv-export.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { DenialManagementService } from '../../../core/services/denial-management.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('DenialManagementComponent', () => {
  let component: DenialManagementComponent;
  let fixture: ComponentFixture<DenialManagementComponent>;
  let mockCsvExport: jasmine.SpyObj<CsvExportService>;

  const mockTheme = {
    chart_color_1: '#1976d2',
    chart_color_2: '#ff9800',
    chart_color_3: '#4caf50',
    chart_color_4: '#9c27b0',
    chart_color_5: '#f44336',
  };

  const mockDashboardData = {
    trend: [
      { PeriodLabel: '2026-01', DeniedCharges: 5000, DeniedClaims: 10 },
      { PeriodLabel: '2026-02', DeniedCharges: 6000, DeniedClaims: 12 },
    ],
    kpis: {
      currentDeniedClaims: 50,
      currentDeniedCharges: 100000,
      denialRate: 0.08,
      recoveryRate: 0.85,
      deltaClaimsYoy: -5,
      deltaChargesYoy: -3.2,
      deltaDenialRateYoy: -1.1,
    },
    reasons: [
      { Reason: 'Missing Info', CurrentAmount: 30000, PreviousAmount: 25000 },
      { Reason: 'Auth Required', CurrentAmount: 20000, PreviousAmount: 22000 },
    ],
  };

  const mockDenialStore = {
    dashboard$: of({ data: mockDashboardData, loading: false, error: null, cachedAt: Date.now() }),
    loadDashboard: jasmine.createSpy('loadDashboard'),
    reloadDashboard: jasmine.createSpy('reloadDashboard'),
    reloadByParams: jasmine.createSpy('reloadByParams'),
  };

  const mockGlobalFiltersStore = {
    applied$: of({ payers: [], location: { scope: 'all' } }),
    value: { payers: [], location: { scope: 'all' } },
  };

  const mockDenialSvc = {
    getCodesForGrouping: jasmine.createSpy('getCodesForGrouping').and.returnValue(of([{ carcCode: 'CO-4', rarcCode: null, ClaimCount: 5, CurrentAmount: 1000, PreviousAmount: 900 }])),
    getClaimsForCode: jasmine.createSpy('getClaimsForCode').and.returnValue(of([{ claimId: 'CL51234', patientName: 'John Doe', payerName: 'BlueCross', providerName: 'Dr. Smith', dateOfService: '2025-01-15', chargeAmount: 500 }])),
    // exportTopReasons() re-queries the service for the full, unpaged set.
    getTopReasons: jasmine.createSpy('getTopReasons').and.returnValue(of([
      { Reason: 'CO-4 Missing modifier', CurrentAmount: 1000, PreviousAmount: 900 },
    ])),
  };

  beforeEach(async () => {
    mockCsvExport = jasmine.createSpyObj('CsvExportService', ['download']);

    await TestBed.configureTestingModule({
    declarations: [DenialManagementComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [MatMenuModule],
    providers: [
        { provide: DenialIqStore, useValue: mockDenialStore },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => { } } },
        { provide: AnalyticsService, useValue: { track: () => { }, trackError: () => { } } },
        { provide: ThemeService, useValue: { theme$: of(mockTheme), snapshot: () => mockTheme } },
        { provide: CsvExportService, useValue: mockCsvExport },
        { provide: GlobalFiltersStore, useValue: mockGlobalFiltersStore },
        {
            provide: DenialManagementService,
            useValue: mockDenialSvc,
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(DenialManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load dashboard from store on init', () => {
    expect(mockDenialStore.loadDashboard).toHaveBeenCalled();
    expect(component.loading).toBeFalse();
  });

  it('should populate KPIs from dashboard data', () => {
    expect(component.kpis.length).toBe(4);
    expect(component.kpis[0].label).toBe('Total Denied Claims');
    expect(component.kpis[0].value).toBe(50);
  });

  it('should populate line series from trend data', () => {
    expect(component.lineSeries.length).toBe(2);
    expect(component.lineCategories.length).toBe(2);
  });

  it('should populate bar chart reasons', () => {
    expect(component.currentReasons.length).toBe(2);
  });

  it('fmt should format money values', () => {
    const result = component.fmt(50000, 'money');
    expect(result).toContain('$');
    expect(result).toContain('50,000');
  });

  it('fmt should format percent values', () => {
    expect(component.fmt(0.123, 'percent')).toBe('12.3%');
  });

  it('fmt should format count values', () => {
    const result = component.fmt(1234, 'count');
    expect(result).toContain('1,234');
  });

  it('kpiValue should return formatted value', () => {
    const kpi = { label: 'Test', value: 5000, format: 'money' as const, deltaPct: 0, invertTrend: false };
    const result = component.kpiValue(kpi);
    expect(result).toContain('$');
  });

  it('kpiSubtitle should show delta when non-zero', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: -5.2, invertTrend: true };
    const result = component.kpiSubtitle(kpi);
    expect(result).toContain('5.2%');
    expect(result).toContain('vs prior year');
  });

  it('kpiSubtitle should show targetText when deltaPct is 0', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: 0, invertTrend: false, targetText: 'Target: >90%' };
    expect(component.kpiSubtitle(kpi)).toBe('Target: >90%');
  });

  it('kpiSubtitle should return empty string when deltaPct is 0 and no targetText', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: 0, invertTrend: false };
    expect(component.kpiSubtitle(kpi)).toBe('');
  });

  it('kpiSubtitle should include targetText when deltaPct is non-zero and targetText is set', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: 3.5, invertTrend: false, targetText: 'Target: <5%' };
    const result = component.kpiSubtitle(kpi);
    expect(result).toContain('Target: <5%');
    expect(result).toContain('+');
  });

  it('kpiTrendDirection should return up for positive delta', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: 5, invertTrend: false };
    expect(component.kpiTrendDirection(kpi)).toBe('up');
  });

  it('kpiTrendDirection should return up for zero delta', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: 0, invertTrend: false };
    expect(component.kpiTrendDirection(kpi)).toBe('up');
  });

  it('kpiTrendDirection should return down for negative delta', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: -5, invertTrend: false };
    expect(component.kpiTrendDirection(kpi)).toBe('down');
  });

  it('kpiTrendColor should return green when improving (inverted, negative delta)', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: -5, invertTrend: true };
    expect(component.kpiTrendColor(kpi)).toBe('green');
  });

  it('kpiTrendColor should return red when worsening (inverted, positive delta)', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: 5, invertTrend: true };
    expect(component.kpiTrendColor(kpi)).toBe('red');
  });

  it('kpiTrendColor should return green when not inverted and positive delta', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: 5, invertTrend: false };
    expect(component.kpiTrendColor(kpi)).toBe('green');
  });

  it('kpiTrendColor should return red when not inverted and negative delta', () => {
    const kpi = { label: 'Test', value: 50, format: 'count' as const, deltaPct: -5, invertTrend: false };
    expect(component.kpiTrendColor(kpi)).toBe('red');
  });

  it('setPeriod should call store reloadByParams', () => {
    component.setPeriod('Last 30 days');
    expect(component.periodLabel).toBe('Last 30 days');
    expect(mockDenialStore.reloadByParams).toHaveBeenCalled();
  });

  it('setPeriod All time should send null start/end', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('All time');
    expect(mockDenialStore.reloadByParams).toHaveBeenCalledWith(jasmine.objectContaining({ start: null, end: null }));
  });

  it('setPeriod Last 90 days should send a date range', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('Last 90 days');
    const args = mockDenialStore.reloadByParams.calls.mostRecent().args[0];
    expect(args.start).toBeTruthy();
    expect(args.end).toBeTruthy();
  });

  it('setPeriod Last 6 months should send date range', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('Last 6 months');
    const args = mockDenialStore.reloadByParams.calls.mostRecent().args[0];
    expect(args.start).toBeTruthy();
  });

  it('setPeriod Last 12 months should send date range', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('Last 12 months');
    const args = mockDenialStore.reloadByParams.calls.mostRecent().args[0];
    expect(args.start).toBeTruthy();
  });

  it('setPeriod MTD should send date range starting on 1st of month', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('MTD');
    const args = mockDenialStore.reloadByParams.calls.mostRecent().args[0];
    expect(args.start).toMatch(/-01$/);
  });

  it('setPeriod QTD should send date range', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('QTD');
    const args = mockDenialStore.reloadByParams.calls.mostRecent().args[0];
    expect(args.start).toBeTruthy();
  });

  it('setPeriod YTD should send date range starting Jan 1', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('YTD');
    const args = mockDenialStore.reloadByParams.calls.mostRecent().args[0];
    expect(args.start).toMatch(/-01-01$/);
  });

  it('setPeriod This year should use Dec 31 as end date', () => {
    mockDenialStore.reloadByParams.calls.reset();
    component.setPeriod('This year');
    const args = mockDenialStore.reloadByParams.calls.mostRecent().args[0];
    expect(args.end).toMatch(/-12-31$/);
  });

  it('exportTrend should call csvExport.download', () => {
    component.exportTrend();
    expect(mockCsvExport.download).toHaveBeenCalled();
    const args = mockCsvExport.download.calls.mostRecent().args;
    expect(args[0]).toContain('denial-trend_');
    expect(args[1]).toEqual(['Period', 'Total Denied Charges ($)', 'Total Denied Claims (#)']);
  });

  it('exportTopReasons should call csvExport.download', () => {
    component.exportTopReasons();
    expect(mockCsvExport.download).toHaveBeenCalled();
    const args = mockCsvExport.download.calls.mostRecent().args;
    expect(args[0]).toContain('denial-top-reasons_');
  });

  it('trackByLabel should return label', () => {
    const kpi = { label: 'MyKpi', value: 1, format: 'count' as const, deltaPct: 0, invertTrend: false };
    expect(component.trackByLabel(0, kpi)).toBe('MyKpi');
  });

  it('formattedLastUpdated should return non-empty string', () => {
    expect(component.formattedLastUpdated.length).toBeGreaterThan(0);
  });

  // -- Drill-down: toggleGrouping ---------------------------------------------

  describe('toggleGrouping()', () => {
    it('should expand a grouping and fetch codes when not cached', () => {
      mockDenialSvc.getCodesForGrouping.calls.reset();
      component.toggleGrouping('CO-4');
      expect(component.isGroupingExpanded('CO-4')).toBeTrue();
      expect(mockDenialSvc.getCodesForGrouping).toHaveBeenCalledWith('CO-4', jasmine.anything());
      expect(component.codesByGrouping['CO-4'].length).toBe(1);
    });

    it('should collapse a grouping that is already expanded', () => {
      component.expandedGroupings.add('CO-4');
      component.toggleGrouping('CO-4');
      expect(component.isGroupingExpanded('CO-4')).toBeFalse();
    });

    it('should use cached codes and not fetch again on second expand', () => {
      // Expand once
      component.toggleGrouping('CO-4');
      const firstCount = mockDenialSvc.getCodesForGrouping.calls.count();

      // Collapse
      component.toggleGrouping('CO-4');
      expect(component.isGroupingExpanded('CO-4')).toBeFalse();

      // Expand again - cache hit
      component.toggleGrouping('CO-4');
      expect(mockDenialSvc.getCodesForGrouping.calls.count()).toBe(firstCount); // no new calls
    });

    it('should handle getCodesForGrouping error', () => {
      const { throwError } = require('rxjs');
      mockDenialSvc.getCodesForGrouping.and.returnValue(throwError(() => new Error('err')));
      component.toggleGrouping('CO-16');
      expect(component.codesByGrouping['CO-16']).toEqual([]);
      expect(component.codesLoading['CO-16']).toBeFalse();
      // restore
      mockDenialSvc.getCodesForGrouping.and.returnValue(of([{ carcCode: 'CO-4', rarcCode: null, ClaimCount: 5, CurrentAmount: 1000, PreviousAmount: 900 }]));
    });
  });

  // -- Drill-down: toggleCode -------------------------------------------------

  describe('toggleCode()', () => {
    it('should expand a code and fetch claims when not cached', () => {
      mockDenialSvc.getClaimsForCode.calls.reset();
      component.toggleCode('CO-4', null);
      expect(component.isCodeExpanded('CO-4', null)).toBeTrue();
      expect(mockDenialSvc.getClaimsForCode).toHaveBeenCalledWith('CO-4', null, jasmine.anything());
    });

    it('should collapse a code that is already expanded', () => {
      component.expandedCodes.add('CO-4|');
      component.toggleCode('CO-4', null);
      expect(component.isCodeExpanded('CO-4', null)).toBeFalse();
    });

    it('should use cached claims on second expand', () => {
      // Expand once
      component.toggleCode('CO-4', 'M79');
      const firstCount = mockDenialSvc.getClaimsForCode.calls.count();

      // Collapse then expand again
      component.toggleCode('CO-4', 'M79');
      component.toggleCode('CO-4', 'M79');
      expect(mockDenialSvc.getClaimsForCode.calls.count()).toBe(firstCount);
    });

    it('should handle getClaimsForCode error', () => {
      const { throwError } = require('rxjs');
      mockDenialSvc.getClaimsForCode.and.returnValue(throwError(() => new Error('err')));
      component.toggleCode('CO-99', null);
      const key = 'CO-99|';
      expect(component.claimsByCode[key]).toEqual([]);
      expect(component.claimsLoading[key]).toBeFalse();
      // restore
      mockDenialSvc.getClaimsForCode.and.returnValue(of([]));
    });
  });

  // -- Helper methods --------------------------------------------------------

  describe('formatCode()', () => {
    it('should return CARC only when rarc is null', () => {
      expect(component.formatCode('CO-4', null)).toBe('CO-4');
    });

    it('should return CARC + RARC when both are present', () => {
      expect(component.formatCode('CO-4', 'M79')).toBe('CO-4 + M79');
    });
  });

  describe('codeKey()', () => {
    it('should return CARC|RARC when rarc is present', () => {
      expect(component.codeKey('CO-4', 'M79')).toBe('CO-4|M79');
    });

    it('should return CARC| when rarc is null', () => {
      expect(component.codeKey('CO-4', null)).toBe('CO-4|');
    });
  });

  describe('isGroupingExpanded()', () => {
    it('should return false when grouping not expanded', () => {
      expect(component.isGroupingExpanded('CO-4')).toBeFalse();
    });

    it('should return true when grouping is expanded', () => {
      component.expandedGroupings.add('CO-4');
      expect(component.isGroupingExpanded('CO-4')).toBeTrue();
    });
  });

  describe('isCodeExpanded()', () => {
    it('should return false when code not expanded', () => {
      expect(component.isCodeExpanded('CO-4', null)).toBeFalse();
    });

    it('should return true when code is expanded', () => {
      component.expandedCodes.add('CO-4|');
      expect(component.isCodeExpanded('CO-4', null)).toBeTrue();
    });
  });

  describe('trackByCode()', () => {
    it('should return CARC|RARC key', () => {
      const row = { carcCode: 'CO-4', rarcCode: 'M79', ClaimCount: 5, CurrentAmount: 1000, PreviousAmount: 900 };
      expect(component.trackByCode(0, row)).toBe('CO-4|M79');
    });

    it('should return CARC| when rarcCode is null', () => {
      const row = { carcCode: 'CO-4', rarcCode: null, ClaimCount: 5, CurrentAmount: 1000, PreviousAmount: 900 };
      expect(component.trackByCode(0, row)).toBe('CO-4|');
    });
  });

  describe('trackByClaim()', () => {
    it('should return claim id', () => {
      const row = { claimId: 'CL51234', patientName: null, payerName: null, providerName: null, dateOfService: null, chargeAmount: 0 };
      expect(component.trackByClaim(0, row)).toBe('CL51234');
    });
  });

  describe('trackByReason()', () => {
    it('should return reason string', () => {
      const row = { Reason: 'CO-4', CurrentAmount: 1000, PreviousAmount: 900 };
      expect(component.trackByReason(0, row)).toBe('CO-4');
    });
  });
});
