import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { CommonModule } from '@angular/common';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { ReconIQDashboardComponent } from './recon-iq-dashboard.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

// ---------------------------------------------------------------------------
// Minimal response factories - include all required fields from the real types
// ---------------------------------------------------------------------------

function makeMatchStatsResponse() {
  return {
    message: 'ok',
    asOf: '2026-01-15T10:00:00.000Z',
    filters: {} as any,
    stats: [
      { key: 'payment_eob_matched',     label: 'Payment ERA Matched',       value: 120, route: '/era-eob' },
      { key: 'payments_without_eob',    label: 'Payments Without ERA',       value: 30,  route: '/payments' },
      { key: 'eob_without_payments',    label: 'ERA Without Payments',       value: 15,  route: '/era' },
      { key: 'escalated_bank_issues',   label: 'Escalated Bank Issues',      value: 5,   route: '/bank' },
      { key: 'fully_reconciled_posted', label: 'Fully Reconciled & Posted',  value: 80,  route: null as any },
    ],
  };
}

function makeDeniedTrendResponse(empty = false) {
  return {
    message: 'ok',
    asOf: '2026-01-15T10:00:00.000Z',
    filters: { interval: 'month' as const },
    series: empty ? [] : [
      { period: '2025-10', denialsAmount: 5000,  nonPaymentsCount: 10 },
      { period: '2025-11', denialsAmount: 7500,  nonPaymentsCount: 15 },
      { period: '2025-12', denialsAmount: 6000,  nonPaymentsCount: 12 },
    ],
  };
}

function makeEraEobResponse(empty = false) {
  return {
    message: 'ok',
    asOf: '2026-01-15T10:00:00.000Z',
    filters: { interval: 'month' as const },
    series: empty ? [] : [
      {
        period: '2025-10',
        eraEobPaymentAmount: 20000,
        patientResponsibilityAmount: 5000,
        adjustmentsAmount: 1000,
        unmatchedPaymentsNoEobCount: 3,
        unmatchedNoPaymentToEobCount: 2,
      },
      {
        period: '2025-11',
        eraEobPaymentAmount: 22000,
        patientResponsibilityAmount: 4800,
        adjustmentsAmount: 900,
        unmatchedPaymentsNoEobCount: 4,
        unmatchedNoPaymentToEobCount: 1,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

describe('ReconIQDashboardComponent', () => {
  let component: ReconIQDashboardComponent;
  let fixture: ComponentFixture<ReconIQDashboardComponent>;

  let reconIqSpy: jasmine.SpyObj<ReconIqService>;
  let routerSpy: jasmine.SpyObj<Router>;

  // Controllable applied$ stream
  let appliedSubject: BehaviorSubject<any>;

  // Minimal GlobalFiltersStore mock
  let mockGlobalFiltersStore: any;

  /** Call after fixture.detectChanges() to prevent queueMicrotask chart calls from crashing. */
  function mockDenialsChart() {
    (component as any).denialsChart = {
      updateOptions: jasmine.createSpy('updateOptions').and.returnValue(Promise.resolve()),
      updateSeries:  jasmine.createSpy('updateSeries').and.returnValue(Promise.resolve()),
    };
  }

  beforeEach(async () => {
    appliedSubject = new BehaviorSubject<any>(null);

    mockGlobalFiltersStore = {
      applied$: appliedSubject.asObservable(),
      get value() { return null; },
    };

    reconIqSpy = jasmine.createSpyObj<ReconIqService>('ReconIqService', [
      'getMatchStats',
      'getDeniedClaimsAndNonPaymentsTrend',
      'getEraEobPayment',
    ]);

    reconIqSpy.getMatchStats.and.returnValue(of(makeMatchStatsResponse() as any));
    reconIqSpy.getDeniedClaimsAndNonPaymentsTrend.and.returnValue(of(makeDeniedTrendResponse() as any));
    reconIqSpy.getEraEobPayment.and.returnValue(of(makeEraEobResponse() as any));

    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);
    routerSpy.navigate.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      declarations: [ReconIQDashboardComponent],
      imports: [CommonModule, MatMenuModule, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ReconIqService,     useValue: reconIqSpy },
        { provide: Router,             useValue: routerSpy },
        { provide: GlobalFiltersStore, useValue: mockGlobalFiltersStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconIQDashboardComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    if (!appliedSubject.closed) {
      appliedSubject.complete();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Component creation
  // -------------------------------------------------------------------------
  it('should create', () => {
    // detectChanges triggers ngOnInit + ViewChild binding; mock chart AFTER binding
    fixture.detectChanges();
    mockDenialsChart();
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. ngOnInit calls all three loaders
  // -------------------------------------------------------------------------
  it('should call getMatchStats, getDeniedClaimsAndNonPaymentsTrend and getEraEobPayment on init', () => {
    fixture.detectChanges();
    mockDenialsChart();
    expect(reconIqSpy.getMatchStats).toHaveBeenCalledTimes(1);
    expect(reconIqSpy.getDeniedClaimsAndNonPaymentsTrend).toHaveBeenCalledTimes(1);
    expect(reconIqSpy.getEraEobPayment).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 3. KPIs are populated from getMatchStats response
  // -------------------------------------------------------------------------
  it('should populate kpis from getMatchStats response', () => {
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.kpis).toBeTruthy();
    expect(component.kpis!.paymentEraMatched).toBe(120);
    expect(component.kpis!.paymentsWithoutEra).toBe(30);
    expect(component.kpis!.eraWithoutPayments).toBe(15);
    expect(component.kpis!.escalatedBankIssues).toBe(5);
    expect(component.kpis!.fullyReconciledPosted).toBe(80);
  });

  // -------------------------------------------------------------------------
  // 4. denialsState is 'loaded' when trend data comes back
  // -------------------------------------------------------------------------
  it('should set denialsState to loaded on successful trend response', () => {
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.denialsState).toBe('loaded');
  });

  // -------------------------------------------------------------------------
  // 5. denialsState is 'empty' when trend series is empty
  // -------------------------------------------------------------------------
  it('should set denialsState to empty when trend series is empty', () => {
    reconIqSpy.getDeniedClaimsAndNonPaymentsTrend.and.returnValue(of(makeDeniedTrendResponse(true) as any));
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.denialsState).toBe('empty');
  });

  // -------------------------------------------------------------------------
  // 6. denialsState is 'error' when trend call fails
  // -------------------------------------------------------------------------
  it('should set denialsState to error when trend call throws', () => {
    reconIqSpy.getDeniedClaimsAndNonPaymentsTrend.and.returnValue(throwError(() => new Error('network error')));
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.denialsState).toBe('error');
  });

  // -------------------------------------------------------------------------
  // 7. paymentSourcesState is 'loaded' when ERA/EOB data comes back
  // -------------------------------------------------------------------------
  it('should set paymentSourcesState to loaded on successful era/eob response', () => {
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.paymentSourcesState).toBe('loaded');
  });

  // -------------------------------------------------------------------------
  // 8. paymentSourcesState is 'empty' when ERA/EOB series is empty
  // -------------------------------------------------------------------------
  it('should set paymentSourcesState to empty when era/eob series is empty', () => {
    reconIqSpy.getEraEobPayment.and.returnValue(of(makeEraEobResponse(true) as any));
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.paymentSourcesState).toBe('empty');
    expect(component.mixedCfg).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 9. paymentSourcesState is 'error' when ERA/EOB call fails
  // -------------------------------------------------------------------------
  it('should set paymentSourcesState to error when era/eob call throws', () => {
    reconIqSpy.getEraEobPayment.and.returnValue(throwError(() => new Error('server error')));
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.paymentSourcesState).toBe('error');
    expect(component.mixedCfg).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 10. mixedCfg is built from ERA/EOB data
  // -------------------------------------------------------------------------
  it('should build mixedCfg with 5 series from era/eob response', () => {
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.mixedCfg).toBeTruthy();
    expect(component.mixedCfg!.series.length).toBe(5);
    expect(component.mixedCfg!.categories.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 11. KPIs default to zeros on getMatchStats error
  // -------------------------------------------------------------------------
  it('should default kpis to zeros when getMatchStats throws', () => {
    reconIqSpy.getMatchStats.and.returnValue(throwError(() => new Error('match stats error')));
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.kpis).toBeTruthy();
    expect(component.kpis!.paymentEraMatched).toBe(0);
    expect(component.kpis!.fullyReconciledPosted).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 12. setPeriod updates periodLabel and reloads denials trend
  // -------------------------------------------------------------------------
  it('should reload denied claims trend when setPeriod is called', () => {
    fixture.detectChanges();
    mockDenialsChart();
    reconIqSpy.getDeniedClaimsAndNonPaymentsTrend.calls.reset();

    component.setPeriod('Last 30 days');
    // re-mock after setPeriod triggers a new detectChanges cycle
    mockDenialsChart();

    expect(reconIqSpy.getDeniedClaimsAndNonPaymentsTrend).toHaveBeenCalledTimes(1);
    expect(component.periodLabel).toBe('Last 30 days');
  });

  // -------------------------------------------------------------------------
  // 13. setPaymentSourcesPeriod updates label and reloads ERA/EOB
  // -------------------------------------------------------------------------
  it('should reload era/eob payment when setPaymentSourcesPeriod is called', () => {
    fixture.detectChanges();
    mockDenialsChart();
    reconIqSpy.getEraEobPayment.calls.reset();

    component.setPaymentSourcesPeriod('Last 6 months');
    mockDenialsChart();

    expect(reconIqSpy.getEraEobPayment).toHaveBeenCalledTimes(1);
    expect(component.paymentSourcesLabel).toBe('Last 6 months');
  });

  // -------------------------------------------------------------------------
  // 14. Global filter applied$ triggers reload of all three loaders
  // -------------------------------------------------------------------------
  it('should reload all data when global filters are applied', fakeAsync(() => {
    fixture.detectChanges();
    mockDenialsChart();

    reconIqSpy.getMatchStats.calls.reset();
    reconIqSpy.getDeniedClaimsAndNonPaymentsTrend.calls.reset();
    reconIqSpy.getEraEobPayment.calls.reset();

    appliedSubject.next({
      startDate: new Date('2025-01-01'),
      endDate:   new Date('2025-12-31'),
      payers: [],
      providers: [],
      location: null,
    });

    // Re-mock before microtasks run so queueMicrotask chart calls don't crash
    mockDenialsChart();
    tick();

    expect(reconIqSpy.getMatchStats).toHaveBeenCalledTimes(1);
    expect(reconIqSpy.getDeniedClaimsAndNonPaymentsTrend).toHaveBeenCalledTimes(1);
    expect(reconIqSpy.getEraEobPayment).toHaveBeenCalledTimes(1);
  }));

  // -------------------------------------------------------------------------
  // 15. Global filter with null value is ignored
  // -------------------------------------------------------------------------
  it('should ignore null applied filter events', fakeAsync(() => {
    fixture.detectChanges();
    mockDenialsChart();
    reconIqSpy.getMatchStats.calls.reset();

    // The BehaviorSubject already emitted null during init (which ngOnInit ignores)
    // Push another null explicitly - the subscription guard (if (!gf) return) skips it
    appliedSubject.next(null);
    mockDenialsChart();
    tick();

    expect(reconIqSpy.getMatchStats).not.toHaveBeenCalled();
  }));

  // -------------------------------------------------------------------------
  // 16. Navigation helpers call router.navigate
  // -------------------------------------------------------------------------
  it('onPostedCardClick should navigate to fully-reconciled-posted', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.onPostedCardClick();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/recon-iq/fully-reconciled-posted']);
  });

  it('onNeedsMatching should navigate to matching', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.onNeedsMatching();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/recon-iq/matching']);
  });

  it('onNeedsReconciliation should navigate to payment-reconciliation', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.onNeedsReconciliation();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/recon-iq/payment-reconciliation']);
  });

  // -------------------------------------------------------------------------
  // 17. toCardValue formats numbers with locale string
  // -------------------------------------------------------------------------
  it('toCardValue should format number as locale string', () => {
    fixture.detectChanges();
    mockDenialsChart();
    expect(component.toCardValue(1234567)).toBe('1,234,567');
  });

  // -------------------------------------------------------------------------
  // 18. ngOnDestroy completes the destroy subject without errors
  // -------------------------------------------------------------------------
  it('should destroy without errors', () => {
    fixture.detectChanges();
    mockDenialsChart();
    expect(() => fixture.destroy()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Additional: setPeriod for all period types
  // -------------------------------------------------------------------------
  it('setPeriod All time should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('All time');
    expect(component.periodLabel).toBe('All time');
  });

  it('setPeriod Last 90 days should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('Last 90 days');
    expect(component.periodLabel).toBe('Last 90 days');
  });

  it('setPeriod Last 6 months should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('Last 6 months');
    expect(component.periodLabel).toBe('Last 6 months');
  });

  it('setPeriod Last 12 months should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('Last 12 months');
    expect(component.periodLabel).toBe('Last 12 months');
  });

  it('setPeriod MTD should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('MTD');
    expect(component.periodLabel).toBe('MTD');
  });

  it('setPeriod QTD should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('QTD');
    expect(component.periodLabel).toBe('QTD');
  });

  it('setPeriod YTD should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('YTD');
    expect(component.periodLabel).toBe('YTD');
  });

  it('setPeriod This year should update periodLabel', () => {
    fixture.detectChanges();
    mockDenialsChart();
    component.setPeriod('This year');
    expect(component.periodLabel).toBe('This year');
  });

  // -------------------------------------------------------------------------
  // Additional: toKpiCard for various keys
  // -------------------------------------------------------------------------
  it('toKpiCard for fully_reconciled_posted should return specific route', () => {
    fixture.detectChanges();
    mockDenialsChart();
    const result = (component as any).toKpiCard({ key: 'fully_reconciled_posted', label: 'FR', value: 5, route: null });
    expect(result.route).toBe('/app/recon-iq/fully-reconciled-posted');
    expect(result.hasChevron).toBeTrue();
  });

  it('toKpiCard for other key with route should build route from s.route', () => {
    fixture.detectChanges();
    mockDenialsChart();
    const result = (component as any).toKpiCard({ key: 'payments_without_eob', label: 'P', value: 10, route: '/payments' });
    expect(result.route).toBe('/app/recon-iq/payments');
    expect(result.hasChevron).toBeFalse();
  });

  it('toKpiCard for key with no route should set route to undefined', () => {
    fixture.detectChanges();
    mockDenialsChart();
    const result = (component as any).toKpiCard({ key: 'some_key', label: 'K', value: 3, route: null });
    expect(result.route).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Additional: ngOnInit with global filter dates
  // -------------------------------------------------------------------------
  it('ngOnInit should use global filter startDate/endDate when provided', () => {
    // Save original and redefine the value getter temporarily
    const originalDescriptor = Object.getOwnPropertyDescriptor(mockGlobalFiltersStore, 'value')!;
    Object.defineProperty(mockGlobalFiltersStore, 'value', {
      get: () => ({ startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') }),
      configurable: true,
    });

    const newFixture = TestBed.createComponent(ReconIQDashboardComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    Object.defineProperty(mockGlobalFiltersStore, 'value', originalDescriptor);

    expect(newComponent).toBeTruthy();
    newFixture.destroy();
  });

  // -------------------------------------------------------------------------
  // Additional: buildDenialsSubtitle with asOfIso override
  // -------------------------------------------------------------------------
  it('buildDenialsSubtitle should use asOfIso when provided', () => {
    fixture.detectChanges();
    mockDenialsChart();
    const range = (component as any).denialsRange;
    const result = (component as any).buildDenialsSubtitle(range, '2025-06-01T12:00:00.000Z');
    expect(result).toContain('Updated');
    expect(result).toBeTruthy();
  });
});
