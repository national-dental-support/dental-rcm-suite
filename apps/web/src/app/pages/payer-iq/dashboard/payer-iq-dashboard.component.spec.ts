import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef, NgZone } from '@angular/core';
import { FormBuilder, FormControl } from '@angular/forms';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { PayerIqDashboardComponent, NonPaymentNode, PayerDetailsNode } from './payer-iq-dashboard.component';
import { PayerIqService } from '../../../core/services/payer-iq.service';
import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { PayerIqStore, PayerIqDashboardData } from '../../../store/payer-iq/payer-iq.store';

describe('PayerIqDashboardComponent', () => {
  let component: PayerIqDashboardComponent;
  let fixture: ComponentFixture<PayerIqDashboardComponent>;

  let dashboardData$: BehaviorSubject<PayerIqDashboardData | null>;
  let dashboardLoading$: BehaviorSubject<boolean>;
  let applied$: Subject<any>;
  let mockPayerIqStore: any;

  const mockPayerIqService = {
    getChargeAmount: jasmine.createSpy().and.returnValue(of({ data: [] })),
    getPayerMixReimbursementPayment: jasmine.createSpy().and.returnValue(of({ data: [] })),
    getPayerMixPatientVolume: jasmine.createSpy().and.returnValue(of({ data: [] })),
    getPayerMixCptVolume: jasmine.createSpy().and.returnValue(of({ data: [] })),
    getForecastingPayerPayments: jasmine.createSpy().and.returnValue(of({ data: [] })),
    getCptNonPayment: jasmine.createSpy().and.returnValue(of({ payerRollup: [], cptRollup: [], lineItems: [] })),
    getPayerDetails: jasmine.createSpy().and.returnValue(of({ data: [] })),
  };

  const mockCdr = {
    markForCheck: jasmine.createSpy('markForCheck'),
    detectChanges: jasmine.createSpy('detectChanges'),
  };

  beforeEach(async () => {
    dashboardData$ = new BehaviorSubject<PayerIqDashboardData | null>(null);
    dashboardLoading$ = new BehaviorSubject<boolean>(false);
    applied$ = new BehaviorSubject<any>({});

    mockPayerIqStore = {
      dashboardData$: dashboardData$.asObservable(),
      dashboardLoading$: dashboardLoading$.asObservable(),
      reloadDashboard: jasmine.createSpy('reloadDashboard'),
      loadDashboard: jasmine.createSpy('loadDashboard'),
    };

    await TestBed.configureTestingModule({
      declarations: [PayerIqDashboardComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        FormBuilder,
        { provide: PayerIqService, useValue: mockPayerIqService },
        { provide: ChangeDetectorRef, useValue: mockCdr },
        { provide: PayerIqFiltersStore, useValue: { applied$: applied$.asObservable(), value: {} } },
        { provide: PayerIqStore, useValue: mockPayerIqStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PayerIqDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // --- Creation & Init ---------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have filtersForm initialized with all controls', () => {
    expect(component.filtersForm).toBeTruthy();
    expect(component.filtersForm.controls.startDate).toBeTruthy();
    expect(component.filtersForm.controls.endDate).toBeTruthy();
    expect(component.filtersForm.controls.payers).toBeTruthy();
    expect(component.filtersForm.controls.plans).toBeTruthy();
    expect(component.filtersForm.controls.leaseNetworks).toBeTruthy();
    expect(component.filtersForm.controls.providers).toBeTruthy();
  });

  it('should have column configs initialized', () => {
    expect(component.payerNonPaymentColumns.length).toBeGreaterThan(0);
    expect(component.payerDetailsColumns.length).toBeGreaterThan(0);
    expect(component.cdtPerformanceColumns.length).toBeGreaterThan(0);
  });

  it('should set isLoadingDashboard when dashboardLoading$ emits', () => {
    dashboardLoading$.next(true);
    expect(component.isLoadingDashboard).toBeTrue();

    dashboardLoading$.next(false);
    expect(component.isLoadingDashboard).toBeFalse();
  });

  it('should call store.reloadDashboard when filters are applied', () => {
    const filters = { startDate: null, endDate: null, payers: ['Aetna'], plans: [], leaseNetworks: [], providers: [], locations: [] };
    (applied$ as BehaviorSubject<any>).next(filters);
    expect(mockPayerIqStore.reloadDashboard).toHaveBeenCalledWith(filters);
  });

  // --- ngOnDestroy -------------------------------------------------

  it('ngOnDestroy should complete the destroy subject', () => {
    // Just verify it doesn't throw
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // --- Date range label --------------------------------------------

  it('dateRangeLabel should return "All" when no dates set', () => {
    expect(component.dateRangeLabel).toBe('All');
  });

  it('dateRangeLabel should format when both dates set', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31);
    component.filtersForm.controls.startDate.setValue(start);
    component.filtersForm.controls.endDate.setValue(end);
    const label = component.dateRangeLabel;
    expect(label).toContain(start.toLocaleDateString());
    expect(label).toContain(end.toLocaleDateString());
  });

  it('dateRangeLabel should handle only start date', () => {
    component.filtersForm.controls.startDate.setValue(new Date(2026, 0, 1));
    const label = component.dateRangeLabel;
    expect(label).toContain('\u2026');
  });

  it('dateRangeLabel should handle only end date', () => {
    component.filtersForm.controls.endDate.setValue(new Date(2026, 0, 31));
    const label = component.dateRangeLabel;
    expect(label).toContain('\u2026');
  });

  // --- Array labels ------------------------------------------------

  it('payerLabel should return "All" when empty', () => {
    expect(component.payerLabel).toBe('All');
  });

  it('payerLabel should return count when values selected', () => {
    component.filtersForm.controls.payers.setValue(['Aetna', 'Cigna']);
    expect(component.payerLabel).toBe('2 selected');
  });

  it('planLabel should return "All" when empty', () => {
    expect(component.planLabel).toBe('All');
  });

  it('planLabel should return count when values selected', () => {
    component.filtersForm.controls.plans.setValue(['PPO']);
    expect(component.planLabel).toBe('1 selected');
  });

  it('leaseLabel should return "All" when empty', () => {
    expect(component.leaseLabel).toBe('All');
  });

  it('leaseLabel should return count when values selected', () => {
    component.filtersForm.controls.leaseNetworks.setValue(['Zelis', 'DenteMax']);
    expect(component.leaseLabel).toBe('2 selected');
  });

  it('providerLabel should return "All" when empty', () => {
    expect(component.providerLabel).toBe('All');
  });

  it('providerLabel should return count when values selected', () => {
    component.filtersForm.controls.providers.setValue(['Dr. Jones']);
    expect(component.providerLabel).toBe('1 selected');
  });

  // --- isSelected --------------------------------------------------

  it('isSelected should return true when value is in control', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.isSelected(component.filtersForm.controls.payers, 'Aetna')).toBeTrue();
  });

  it('isSelected should return false when value is not in control', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.isSelected(component.filtersForm.controls.payers, 'Cigna')).toBeFalse();
  });

  it('isSelected should handle null control value', () => {
    component.filtersForm.controls.payers.setValue(null as any);
    expect(component.isSelected(component.filtersForm.controls.payers, 'Aetna')).toBeFalse();
  });

  // --- toggleArrayValue --------------------------------------------

  it('toggleArrayValue should add value when checked', () => {
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', true);
    expect(component.filtersForm.controls.payers.value).toContain('Aetna');
  });

  it('toggleArrayValue should remove value when unchecked', () => {
    component.filtersForm.controls.payers.setValue(['Aetna', 'Cigna']);
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', false);
    expect(component.filtersForm.controls.payers.value).not.toContain('Aetna');
    expect(component.filtersForm.controls.payers.value).toContain('Cigna');
  });

  it('toggleArrayValue should not duplicate when adding existing value', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', true);
    expect(component.filtersForm.controls.payers.value.filter((v: string) => v === 'Aetna').length).toBe(1);
  });

  it('toggleArrayValue should mark control dirty', () => {
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', true);
    expect(component.filtersForm.controls.payers.dirty).toBeTrue();
  });

  // --- clearControl ------------------------------------------------

  it('clearControl should reset an array control to empty', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    component.clearControl('payers');
    expect(component.filtersForm.controls.payers.value).toEqual([]);
  });

  it('clearControl should reset a date control to null', () => {
    component.filtersForm.controls.startDate.setValue(new Date());
    component.clearControl('startDate');
    expect(component.filtersForm.controls.startDate.value).toBeNull();
  });

  it('clearControl should mark control dirty', () => {
    component.clearControl('payers');
    expect(component.filtersForm.controls.payers.dirty).toBeTrue();
  });

  // --- clearDateRange ----------------------------------------------

  it('clearDateRange should reset both date controls', () => {
    component.filtersForm.controls.startDate.setValue(new Date());
    component.filtersForm.controls.endDate.setValue(new Date());
    component.clearDateRange();
    expect(component.filtersForm.controls.startDate.value).toBeNull();
    expect(component.filtersForm.controls.endDate.value).toBeNull();
  });

  it('clearDateRange should mark both controls dirty', () => {
    component.clearDateRange();
    expect(component.filtersForm.controls.startDate.dirty).toBeTrue();
    expect(component.filtersForm.controls.endDate.dirty).toBeTrue();
  });

  // --- applyFilters ------------------------------------------------

  it('applyFilters should log filters', () => {
    spyOn(console, 'log');
    component.applyFilters();
    expect(console.log).toHaveBeenCalledWith('Apply filters', jasmine.any(Object));
  });

  // --- onTrendWindowChange -----------------------------------------

  it('onTrendWindowChange should update trendWindow$ with valid value', () => {
    // Just verify it doesn't throw
    expect(() => component.onTrendWindowChange('1week' as any)).not.toThrow();
  });

  it('onTrendWindowChange should do nothing for falsy value', () => {
    expect(() => component.onTrendWindowChange('' as any)).not.toThrow();
  });

  // --- childrenAccessor / getNonPaymentChildren --------------------

  it('childrenAccessor should return children array', () => {
    const node = { children: [{ id: '1', nodeType: 'payer', label: 'x' }] } as any;
    expect(component.childrenAccessor(node)).toEqual(node.children);
  });

  it('childrenAccessor should return empty array when no children', () => {
    expect(component.childrenAccessor({} as any)).toEqual([]);
  });

  it('getNonPaymentChildren should return children array', () => {
    const node = { children: [{ id: '1', nodeType: 'payer' }] } as any;
    expect(component.getNonPaymentChildren(node)).toEqual(node.children);
  });

  it('getNonPaymentChildren should return empty array when no children', () => {
    expect(component.getNonPaymentChildren({} as any)).toEqual([]);
  });

  // --- Pie slice drill-down ----------------------------------------

  it('onPieSliceClicked should not drill down for non-Other labels', () => {
    component.chargesDrilled = false;
    component.onPieSliceClicked('charges', 'Aetna');
    expect(component.chargesDrilled).toBeFalse();
  });

  it('onPieSliceClicked charges should drill into Other', () => {
    // Seed the private "all" data via applyDashboardData
    const data = buildMockDashboardData(8);
    dashboardData$.next(data);
    fixture.detectChanges();

    component.onPieSliceClicked('charges', 'Other');
    expect(component.chargesDrilled).toBeTrue();
    // Should show items beyond the top 5
    expect(component.payerMixCharges.length).toBeGreaterThan(0);
  });

  it('onPieSliceClicked payments should drill into Other', () => {
    const data = buildMockDashboardData(8);
    dashboardData$.next(data);
    fixture.detectChanges();

    component.onPieSliceClicked('payments', 'Other');
    expect(component.paymentsDrilled).toBeTrue();
  });

  it('onPieSliceClicked patient should drill into Other', () => {
    const data = buildMockDashboardData(8);
    dashboardData$.next(data);
    fixture.detectChanges();

    component.onPieSliceClicked('patient', 'Other');
    expect(component.patientDrilled).toBeTrue();
  });

  it('onPieSliceClicked cpt should drill into Other', () => {
    const data = buildMockDashboardData(8);
    dashboardData$.next(data);
    fixture.detectChanges();

    component.onPieSliceClicked('cpt', 'Other');
    expect(component.cptDrilled).toBeTrue();
  });

  // --- resetPieDrilldown -------------------------------------------

  it('resetPieDrilldown charges should reset drilled state', () => {
    component.chargesDrilled = true;
    component.resetPieDrilldown('charges');
    expect(component.chargesDrilled).toBeFalse();
  });

  it('resetPieDrilldown payments should reset drilled state', () => {
    component.paymentsDrilled = true;
    component.resetPieDrilldown('payments');
    expect(component.paymentsDrilled).toBeFalse();
  });

  it('resetPieDrilldown patient should reset drilled state', () => {
    component.patientDrilled = true;
    component.resetPieDrilldown('patient');
    expect(component.patientDrilled).toBeFalse();
  });

  it('resetPieDrilldown cpt should reset drilled state', () => {
    component.cptDrilled = true;
    component.resetPieDrilldown('cpt');
    expect(component.cptDrilled).toBeFalse();
  });

  // --- exportPieCsv ------------------------------------------------

  it('exportPieCsv should trigger a download', () => {
    const mockLink = { href: '', download: '', click: jasmine.createSpy('click') };
    spyOn(document, 'createElement').and.returnValue(mockLink as any);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.exportPieCsv('test.csv', [{ label: 'Aetna', value: 100 }]);
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toBe('test.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('exportPieCsv should handle data with commas and quotes', () => {
    const mockLink = { href: '', download: '', click: jasmine.createSpy('click') };
    spyOn(document, 'createElement').and.returnValue(mockLink as any);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.exportPieCsv('test.csv', [
      { label: 'Payer, Inc.', value: 100 },
      { label: 'Payer "Best"', value: 200 },
    ]);
    expect(mockLink.click).toHaveBeenCalled();
  });

  // --- exportForecastCsv -------------------------------------------

  it('exportForecastCsv should trigger a download', () => {
    const mockLink = { href: '', download: '', click: jasmine.createSpy('click') };
    spyOn(document, 'createElement').and.returnValue(mockLink as any);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.forecastSeries = [
      { name: 'Actuals', data: [100, 200, null] },
      { name: 'Forecast', data: [100, 200, 300] },
    ];
    component.forecastCategories = ['Jan 26', 'Feb 26', 'Mar 26'];

    component.exportForecastCsv();
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toBe('payer-iq-forecast.csv');
  });

  it('exportForecastCsv should handle null data points', () => {
    const mockLink = { href: '', download: '', click: jasmine.createSpy('click') };
    spyOn(document, 'createElement').and.returnValue(mockLink as any);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.forecastSeries = [{ name: 'Actuals', data: [null, null] }];
    component.forecastCategories = ['Jan', 'Feb'];

    component.exportForecastCsv();
    expect(mockLink.click).toHaveBeenCalled();
  });

  // --- applyDashboardData via store --------------------------------

  it('should apply dashboard data when store emits', () => {
    const data = buildMockDashboardData(3);
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.payerMixCharges.length).toBeGreaterThan(0);
    expect(component.chargesDrilled).toBeFalse();
    expect(component.paymentsDrilled).toBeFalse();
    expect(component.patientDrilled).toBeFalse();
    expect(component.cptDrilled).toBeFalse();
  });

  it('should collapse small pie data into Other when more than 5 payers', () => {
    const data = buildMockDashboardData(8);
    dashboardData$.next(data);
    fixture.detectChanges();

    // Should have top 5 + Other = 6
    const hasOther = component.payerMixCharges.some(d => d.label === 'Other');
    expect(hasOther).toBeTrue();
    expect(component.payerMixCharges.length).toBe(6);
  });

  it('should not add Other when 5 or fewer payers', () => {
    const data = buildMockDashboardData(4);
    dashboardData$.next(data);
    fixture.detectChanges();

    const hasOther = component.payerMixCharges.some(d => d.label === 'Other');
    expect(hasOther).toBeFalse();
  });

  it('should handle empty dashboard data gracefully', () => {
    const data = buildEmptyDashboardData();
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.payerMixCharges).toEqual([]);
    expect(component.forecastSeries).toEqual([]);
    expect(component.forecastCategories).toEqual([]);
    expect(component.nonPaymentTree).toEqual([]);
    expect(component.payerDetailsTree).toEqual([]);
  });

  it('should build forecast series from dashboard data', () => {
    const data = buildMockDashboardDataWithForecast();
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.forecastSeries.length).toBe(2);
    expect(component.forecastCategories.length).toBe(7);
    expect((component.forecastSeries[0] as any).name).toBe('Actuals');
    expect((component.forecastSeries[1] as any).name).toBe('Forecast');
  });

  it('should build non-payment tree from dashboard data', () => {
    const data = buildMockDashboardDataWithNonPayment();
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.nonPaymentTree.length).toBe(1);
    expect(component.nonPaymentTree[0].nodeType).toBe('payer');
    expect(component.nonPaymentTree[0].payer).toBe('Delta Dental');
    expect(component.nonPaymentTree[0].children!.length).toBe(1);
    expect(component.nonPaymentTree[0].children![0].nodeType).toBe('cpt');
    expect(component.nonPaymentTree[0].children![0].children!.length).toBe(1);
    expect(component.nonPaymentTree[0].children![0].children![0].nodeType).toBe('claim');
  });

  it('should build payer details tree from API rows', () => {
    const data = buildMockDashboardDataWithPayerDetails();
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.payerDetailsTree.length).toBe(1);
    expect(component.payerDetailsTree[0].label).toBe('Commercial');
    expect(component.payerDetailsTree[0].children!.length).toBe(1);
    expect(component.payerDetailsTree[0].children![0].label).toBe('Payer Direct');
    expect(component.payerDetailsTree[0].children![0].children!.length).toBe(1);
  });

  it('should filter PLAN rows not under Commercial/Payer Direct', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: {
        data: [
          { SortLevel: 1, LevelType: 'CATEGORY', Category: 'Government', GroupName: null, PayerName: null, PlanName: null, TotalCharges: 1000, Claims: 10 },
          { SortLevel: 2, LevelType: 'GROUP', Category: 'Government', GroupName: 'Medicare', PayerName: null, PlanName: null, TotalCharges: 1000, Claims: 10 },
          // This PLAN row under Government should be filtered out
          { SortLevel: 4, LevelType: 'PLAN', Category: 'Government', GroupName: 'Medicare', PayerName: 'Aetna', PlanName: 'PPO', TotalCharges: 500, Claims: 5 },
        ],
      },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    // The tree should have Government category but no plan children
    const govNode = component.payerDetailsTree.find(n => n.label === 'Government');
    expect(govNode).toBeTruthy();
    // Medicare group should have no payer children with plans
    const medicareGroup = govNode!.children!.find(n => n.label === 'Medicare');
    expect(medicareGroup).toBeTruthy();
    // No payer nodes since the PAYER row was missing, only the filtered PLAN row
    expect(medicareGroup!.children!.length).toBe(0);
  });

  // --- payerDetailsRowClass ----------------------------------------

  it('payerDetailsRowClass should return category class for Commercial', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'group', label: 'Commercial',
    } as PayerDetailsNode);
    expect(result).toContain('pd-row--category');
    expect(result).toContain('pd-row--category-commercial');
  });

  it('payerDetailsRowClass should return category class for Government', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'group', label: 'Government',
    } as PayerDetailsNode);
    expect(result).toContain('pd-row--category');
    expect(result).toContain('pd-row--category-government');
  });

  it('payerDetailsRowClass should return category class for LeaseNetwork', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'group', label: 'LeaseNetwork',
    } as PayerDetailsNode);
    expect(result).toContain('pd-row--category');
    expect(result).toContain('pd-row--category-leasenetwork');
  });

  it('payerDetailsRowClass should return group class for sub-groups', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'group', label: 'Payer Direct', category: 'Commercial',
    } as PayerDetailsNode);
    expect(result).toContain('pd-row--group');
    expect(result).toContain('pd-row--group-commercial');
  });

  it('payerDetailsRowClass should return group class with empty category', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'group', label: 'SomeGroup',
    } as PayerDetailsNode);
    expect(result).toContain('pd-row--group');
  });

  it('payerDetailsRowClass should return payer class', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'payer', label: 'Aetna',
    } as PayerDetailsNode);
    expect(result).toBe('pd-row--payer');
  });

  it('payerDetailsRowClass should return plan class', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'plan', label: 'PPO',
    } as PayerDetailsNode);
    expect(result).toBe('pd-row--plan');
  });

  it('payerDetailsRowClass should return empty string for unknown nodeType', () => {
    const result = component.payerDetailsRowClass({
      id: '1', nodeType: 'unknown' as any, label: 'x',
    } as PayerDetailsNode);
    expect(result).toBe('');
  });

  // --- Column accessors --------------------------------------------

  describe('payerNonPaymentColumns accessors', () => {
    it('label accessor should return payer name for payer node', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      const result = col.accessor!({ nodeType: 'payer', payer: 'Delta' } as any);
      expect(result).toBe('Delta');
    });

    it('label accessor should return CPT prefix for cpt node', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      const result = col.accessor!({ nodeType: 'cpt', cptCode: 'D1110' } as any);
      expect(result).toBe('CPT: D1110');
    });

    it('label accessor should return Claim prefix for claim node', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      const result = col.accessor!({ nodeType: 'claim', claimId: 'CL123' } as any);
      expect(result).toBe('Claim: CL123');
    });

    it('label accessor should handle missing values', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      expect(col.accessor!({ nodeType: 'payer' } as any)).toBe('');
      expect(col.accessor!({ nodeType: 'cpt' } as any)).toBe('CPT: ');
      expect(col.accessor!({ nodeType: 'claim' } as any)).toBe('Claim: ');
    });

    it('totalCharges accessor should return value or null', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
      expect(col.accessor!({ totalCharges: 1000 } as any)).toBe(1000);
      expect(col.accessor!({} as any)).toBeNull();
    });

    it('totalCharges displayFormatter should format currency or dash', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
      expect(col.displayFormatter!(1000, {} as any)).toContain('1,000');
      expect(col.displayFormatter!(null, {} as any)).toBe('\u2014');
    });

    it('claims accessor should return value for payer/cpt nodes', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
      expect(col.accessor!({ nodeType: 'payer', claims: 50 } as any)).toBe(50);
      expect(col.accessor!({ nodeType: 'cpt', claims: 30 } as any)).toBe(30);
      expect(col.accessor!({ nodeType: 'claim', claims: 1 } as any)).toBeNull();
    });

    it('claims displayFormatter should format or dash', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
      expect(col.displayFormatter!(1000, {} as any)).toBe('1,000');
      expect(col.displayFormatter!(null, {} as any)).toBe('\u2014');
    });
  });

  describe('payerDetailsColumns accessors', () => {
    it('label accessor should return label', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'label')!;
      expect(col.accessor!({ label: 'Commercial' } as any)).toBe('Commercial');
    });

    it('totalCharges accessor should return value or null', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
      expect(col.accessor!({ totalCharges: 5000 } as any)).toBe(5000);
      expect(col.accessor!({} as any)).toBeNull();
    });

    it('claims accessor should return value or null', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
      expect(col.accessor!({ claims: 42 } as any)).toBe(42);
      expect(col.accessor!({} as any)).toBeNull();
    });
  });

  describe('cdtPerformanceColumns formatters', () => {
    it('variancePercent displayFormatter should format percent', () => {
      const col = component.cdtPerformanceColumns.find(c => c.id === 'variancePercent')!;
      expect(col.displayFormatter!(12.345, {} as any)).toBe('12.3%');
      expect(col.displayFormatter!('foo', {} as any)).toBe('\u2014');
    });

    it('totalClaims displayFormatter should format number', () => {
      const col = component.cdtPerformanceColumns.find(c => c.id === 'totalClaims')!;
      expect(col.displayFormatter!(5000, {} as any)).toContain('5,000');
      expect(col.displayFormatter!('foo', {} as any)).toBe('\u2014');
    });

    it('totalCharges displayFormatter should format currency', () => {
      const col = component.cdtPerformanceColumns.find(c => c.id === 'totalCharges')!;
      expect(col.displayFormatter!(1234, {} as any)).toContain('1,234');
      expect(col.displayFormatter!('foo', {} as any)).toBe('\u2014');
    });
  });

  // --- Forecast trend data -----------------------------------------

  it('should handle forecast data with anchorStr from rows', () => {
    const data = buildMockDashboardDataWithForecast();
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.forecastCategories.length).toBe(7);
    // Actuals should have nulls for future months
    const actualsData = (component.forecastSeries[0] as any).data;
    expect(actualsData[4]).toBeNull();
    expect(actualsData[5]).toBeNull();
    expect(actualsData[6]).toBeNull();
  });

  // --- Non-payment tree edge cases ---------------------------------

  it('should handle non-payment data with empty payer name', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: {
        payerRollup: [{ PayerName: 'Aetna', TotalCharges: 1000, ClaimsCount: 10, RolledUpLines: 5 }],
        cptRollup: [{ PayerName: '', ProcedureCode: 'D1110', TotalCharges: 500, ClaimsCount: 5, RolledUpLines: 2 }],
        lineItems: [],
      },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    // Tree should have the payer but no cpt children (empty payer name filtered)
    expect(component.nonPaymentTree.length).toBe(1);
    expect(component.nonPaymentTree[0].children!.length).toBe(0);
  });

  it('should sort cpt nodes by TotalCharges descending', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: {
        payerRollup: [{ PayerName: 'Aetna', TotalCharges: 3000, ClaimsCount: 30, RolledUpLines: 10 }],
        cptRollup: [
          { PayerName: 'Aetna', ProcedureCode: 'D0120', TotalCharges: 500, ClaimsCount: 5, RolledUpLines: 2 },
          { PayerName: 'Aetna', ProcedureCode: 'D1110', TotalCharges: 2000, ClaimsCount: 20, RolledUpLines: 7 },
        ],
        lineItems: [],
      },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    const children = component.nonPaymentTree[0].children!;
    expect(children[0].cptCode).toBe('D1110'); // higher charges first
    expect(children[1].cptCode).toBe('D0120');
  });

  it('should sort line items by Balance descending', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: {
        payerRollup: [{ PayerName: 'Aetna', TotalCharges: 3000, ClaimsCount: 30, RolledUpLines: 10 }],
        cptRollup: [{ PayerName: 'Aetna', ProcedureCode: 'D1110', TotalCharges: 2000, ClaimsCount: 20, RolledUpLines: 7 }],
        lineItems: [
          { PayerName: 'Aetna', ProcedureCode: 'D1110', ClaimID: 'CL1', TotalCharges: 100, AmountPaid: 50, Balance: 50 },
          { PayerName: 'Aetna', ProcedureCode: 'D1110', ClaimID: 'CL2', TotalCharges: 200, AmountPaid: 50, Balance: 150 },
        ],
      },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    const lines = component.nonPaymentTree[0].children![0].children!;
    expect(lines[0].claimId).toBe('CL2'); // higher balance first
    expect(lines[1].claimId).toBe('CL1');
  });

  // --- Payer details tree edge cases -------------------------------

  it('should handle LeaseNetwork category with networkName', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: {
        data: [
          { SortLevel: 1, LevelType: 'CATEGORY', Category: 'LeaseNetwork', GroupName: null, PayerName: null, PlanName: null, TotalCharges: 5000, Claims: 50 },
          { SortLevel: 2, LevelType: 'GROUP', Category: 'LeaseNetwork', GroupName: 'Zelis', PayerName: null, PlanName: null, TotalCharges: 3000, Claims: 30 },
          { SortLevel: 3, LevelType: 'PAYER', Category: 'LeaseNetwork', GroupName: 'Zelis', PayerName: 'Delta Dental', PlanName: null, TotalCharges: 3000, Claims: 30 },
        ],
      },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    const leaseNode = component.payerDetailsTree.find(n => n.label === 'LeaseNetwork');
    expect(leaseNode).toBeTruthy();
    const zelisGroup = leaseNode!.children![0];
    expect(zelisGroup.networkName).toBe('Zelis');
    const payerNode = zelisGroup.children![0];
    expect(payerNode.networkName).toBe('Zelis');
  });

  it('should handle payer details with plan drilldown under Commercial/Payer Direct', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: {
        data: [
          { SortLevel: 1, LevelType: 'CATEGORY', Category: 'Commercial', GroupName: null, PayerName: null, PlanName: null, TotalCharges: 10000, Claims: 100 },
          { SortLevel: 2, LevelType: 'GROUP', Category: 'Commercial', GroupName: 'Payer Direct', PayerName: null, PlanName: null, TotalCharges: 8000, Claims: 80 },
          { SortLevel: 3, LevelType: 'PAYER', Category: 'Commercial', GroupName: 'Payer Direct', PayerName: 'Delta Dental', PlanName: null, TotalCharges: 8000, Claims: 80 },
          { SortLevel: 4, LevelType: 'PLAN', Category: 'Commercial', GroupName: 'Payer Direct', PayerName: 'Delta Dental', PlanName: 'PPO Basic', TotalCharges: 5000, Claims: 50 },
          { SortLevel: 4, LevelType: 'PLAN', Category: 'Commercial', GroupName: 'Payer Direct', PayerName: 'Delta Dental', PlanName: 'DHMO', TotalCharges: 3000, Claims: 30 },
        ],
      },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    const commNode = component.payerDetailsTree[0];
    const pdGroup = commNode.children![0];
    const payerNode = pdGroup.children![0];
    expect(payerNode.children!.length).toBe(2);
    // Should be sorted alphabetically
    expect(payerNode.children![0].label).toBe('DHMO');
    expect(payerNode.children![1].label).toBe('PPO Basic');
  });

  // --- Pie data shaping edge cases ---------------------------------

  it('should filter out rows with empty payer names in charge pie data', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [
        { PayerName: '', TotalCharges: 100 },
        { PayerName: 'Aetna', TotalCharges: 200 },
      ] as any },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.payerMixCharges.length).toBe(1);
    expect(component.payerMixCharges[0].label).toBe('Aetna');
  });

  it('should filter out rows with zero values in charge pie data', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [
        { PayerName: 'Aetna', TotalCharges: 0 },
        { PayerName: 'Cigna', TotalCharges: 500 },
      ] as any },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.payerMixCharges.length).toBe(1);
    expect(component.payerMixCharges[0].label).toBe('Cigna');
  });

  it('should aggregate CPT volume by payer', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [
        { PayerName: 'Aetna', ProcedureCode: 'D1110', ChargeRowCount: 10 },
        { PayerName: 'Aetna', ProcedureCode: 'D0120', ChargeRowCount: 20 },
        { PayerName: 'Cigna', ProcedureCode: 'D1110', ChargeRowCount: 15 },
      ] as any },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    // Aetna should have 30 (10+20), Cigna 15
    expect(component.payerMixCptVolumeApi.length).toBe(2);
    const aetna = component.payerMixCptVolumeApi.find(d => d.label === 'Aetna');
    expect(aetna!.value).toBe(30);
  });

  it('should handle payment pie data with alternative field names', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [
        { payername: 'Aetna', totalPayments: 500 },
      ] as any },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.payerMixPaymentsApi.length).toBe(1);
    expect(component.payerMixPaymentsApi[0].value).toBe(500);
  });

  it('should handle patient volume pie data with PatientEncounter field', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [
        { PayerName: 'Aetna', PatientEncounter: 100 },
      ] as any },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();

    expect(component.payerMixPatientVolumeApi.length).toBe(1);
    expect(component.payerMixPatientVolumeApi[0].value).toBe(100);
  });

  // --- Demo lists --------------------------------------------------

  it('should have demo payers list', () => {
    expect(component.payers.length).toBe(5);
    expect(component.payers).toContain('Aetna');
  });

  it('should have demo plans list', () => {
    expect(component.plans.length).toBe(4);
  });

  it('should have demo leaseNetworks list', () => {
    expect(component.leaseNetworks.length).toBe(4);
  });

  it('should have demo providers list', () => {
    expect(component.providers.length).toBe(4);
  });

  // --- Null dashboard data ignored ---------------------------------

  it('should ignore null dashboard data emission', () => {
    dashboardData$.next(null);
    fixture.detectChanges();
    // Should not throw; fields should remain at defaults
    expect(component.payerMixCharges).toEqual([]);
  });

  // --- Column accessor/displayFormatter coverage --------------------

  it('payerNonPaymentColumns label accessor for payer node', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
    const result = (col.accessor as any)({ nodeType: 'payer', payer: 'Aetna' });
    expect(result).toBe('Aetna');
  });

  it('payerNonPaymentColumns label accessor for payer node with no payer', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
    const result = (col.accessor as any)({ nodeType: 'payer' });
    expect(result).toBe('');
  });

  it('payerNonPaymentColumns label accessor for cpt node', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
    const result = (col.accessor as any)({ nodeType: 'cpt', cptCode: 'D1110' });
    expect(result).toContain('D1110');
  });

  it('payerNonPaymentColumns label accessor for cpt node with no code', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
    const result = (col.accessor as any)({ nodeType: 'cpt' });
    expect(result).toContain('CPT:');
  });

  it('payerNonPaymentColumns label accessor for claim node', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
    const result = (col.accessor as any)({ nodeType: 'claim', claimId: 'CL001' });
    expect(result).toContain('Claim: CL001');
  });

  it('payerNonPaymentColumns label accessor for claim node with no claimId', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
    const result = (col.accessor as any)({ nodeType: 'claim' });
    expect(result).toContain('Claim:');
  });

  it('payerNonPaymentColumns totalCharges accessor returns null when not a number', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
    const result = (col.accessor as any)({ totalCharges: 'foo' });
    expect(result).toBeNull();
  });

  it('payerNonPaymentColumns totalCharges accessor returns value when number', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
    const result = (col.accessor as any)({ totalCharges: 5000 });
    expect(result).toBe(5000);
  });

  it('payerNonPaymentColumns totalCharges displayFormatter returns dash for null', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
    expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
  });

  it('payerNonPaymentColumns totalCharges displayFormatter returns formatted for number', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
    const result = col.displayFormatter!(1000, {} as any);
    expect(result).toContain('1,000');
  });

  it('payerNonPaymentColumns claims accessor returns null for claim nodeType', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
    const result = (col.accessor as any)({ nodeType: 'claim', claims: 5 });
    expect(result).toBeNull();
  });

  it('payerNonPaymentColumns claims accessor returns value for payer nodeType', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
    const result = (col.accessor as any)({ nodeType: 'payer', claims: 10 });
    expect(result).toBe(10);
  });

  it('payerNonPaymentColumns claims accessor returns null when claims not a number', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
    const result = (col.accessor as any)({ nodeType: 'payer', claims: undefined });
    expect(result).toBeNull();
  });

  it('payerNonPaymentColumns claims displayFormatter returns dash for null', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
    expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
  });

  it('payerNonPaymentColumns claims displayFormatter returns formatted for number', () => {
    const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
    const result = col.displayFormatter!(42, {} as any);
    expect(result).toBe('42');
  });

  it('payerDetailsColumns totalCharges accessor returns null when not number', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
    const result = (col.accessor as any)({ totalCharges: 'n/a', label: 'Aetna', nodeType: 'payer', category: null });
    expect(result).toBeNull();
  });

  it('payerDetailsColumns totalCharges accessor returns number value', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
    const result = (col.accessor as any)({ totalCharges: 2000, label: 'Aetna', nodeType: 'payer', category: null });
    expect(result).toBe(2000);
  });

  it('payerDetailsColumns totalCharges displayFormatter returns dash for null', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
    expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
  });

  it('payerDetailsColumns totalCharges displayFormatter formats value', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
    expect(col.displayFormatter!(5000, {} as any)).toContain('5,000');
  });

  it('payerDetailsColumns claims accessor returns null when not number', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
    const result = (col.accessor as any)({ claims: undefined, label: 'Aetna', nodeType: 'payer', category: null });
    expect(result).toBeNull();
  });

  it('payerDetailsColumns claims accessor returns value', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
    const result = (col.accessor as any)({ claims: 7, label: 'Aetna', nodeType: 'payer', category: null });
    expect(result).toBe(7);
  });

  it('payerDetailsColumns claims displayFormatter returns dash for null', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
    expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
  });

  it('payerDetailsColumns claims displayFormatter formats number', () => {
    const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
    expect(col.displayFormatter!(15, {} as any)).toBe('15');
  });

  // --- cdtPerformanceColumns displayFormatters ----------------------

  it('cdtPerformanceColumns variancePercent formatter formats number', () => {
    const col = component.cdtPerformanceColumns.find(c => c.id === 'variancePercent')!;
    const result = col.displayFormatter!(12.5, {} as any);
    expect(result).toBe('12.5%');
  });

  it('cdtPerformanceColumns variancePercent formatter returns dash for non-number', () => {
    const col = component.cdtPerformanceColumns.find(c => c.id === 'variancePercent')!;
    expect(col.displayFormatter!('x' as any, {} as any)).toBe('\u2014');
  });

  // --- payerDetailsRowClass -----------------------------------------

  it('payerDetailsRowClass returns category class for Commercial', () => {
    const cls = component.payerDetailsRowClass({ nodeType: 'group', label: 'Commercial', category: null } as any);
    expect(cls).toContain('pd-row--category');
    expect(cls).toContain('commercial');
  });

  it('payerDetailsRowClass returns category class for Government', () => {
    const cls = component.payerDetailsRowClass({ nodeType: 'group', label: 'Government', category: null } as any);
    expect(cls).toContain('pd-row--category');
    expect(cls).toContain('government');
  });

  it('payerDetailsRowClass returns category class for LeaseNetwork', () => {
    const cls = component.payerDetailsRowClass({ nodeType: 'group', label: 'LeaseNetwork', category: null } as any);
    expect(cls).toContain('pd-row--category');
  });

  it('payerDetailsRowClass returns group class for non-category group', () => {
    const cls = component.payerDetailsRowClass({ nodeType: 'group', label: 'SomeGroup', category: 'commercial' } as any);
    expect(cls).toContain('pd-row--group');
  });

  it('payerDetailsRowClass returns payer class for payer node', () => {
    const cls = component.payerDetailsRowClass({ nodeType: 'payer', label: 'Aetna', category: null } as any);
    expect(cls).toBe('pd-row--payer');
  });

  it('payerDetailsRowClass returns plan class for plan node', () => {
    const cls = component.payerDetailsRowClass({ nodeType: 'plan', label: 'PPO', category: null } as any);
    expect(cls).toBe('pd-row--plan');
  });

  it('payerDetailsRowClass returns empty for unknown node type', () => {
    const cls = component.payerDetailsRowClass({ nodeType: 'unknown' as any, label: 'X', category: null } as any);
    expect(cls).toBe('');
  });

  // --- CPT volume with alternative field names ----------------------

  it('should handle CPT volume with lowercase chargeRowCount', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: {
        data: [{ payername: 'MetLife', ProcedureCode: 'D0330', chargeRowCount: 25 }] as any,
      },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();
    const metlife = component.payerMixCptVolumeApi.find(d => d.label === 'MetLife');
    expect(metlife?.value).toBe(25);
  });

  it('should skip CPT volume rows with empty payer name', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: {
        data: [
          { PayerName: '', ChargeRowCount: 5 },
          { PayerName: 'Aetna', ChargeRowCount: 10 },
        ] as any,
      },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();
    expect(component.payerMixCptVolumeApi.length).toBe(1);
    expect(component.payerMixCptVolumeApi[0].label).toBe('Aetna');
  });

  it('should aggregate CPT volume for same payer across multiple rows', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: {
        data: [
          { PayerName: 'Cigna', ProcedureCode: 'D1110', ChargeRowCount: 5 },
          { PayerName: 'Cigna', ProcedureCode: 'D0120', ChargeRowCount: 8 },
        ] as any,
      },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();
    const cigna = component.payerMixCptVolumeApi.find(d => d.label === 'Cigna');
    expect(cigna?.value).toBe(13);
  });

  // --- Forecast with no anchor date --------------------------------

  it('should build forecast with no nowMonthStart field', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: {
        data: [{ payer: 1, '3_months_ago': 100, '2_months_ago': 200, '1_month_ago': 300, now: 400,
                 '1_month_future': 350, '2_month_future': 360, '3_month_future': 370,
                 '3_months_ago_forecast': 90, '2_months_ago_forecast': 190, '1_months_ago_forecast': 290 }] as any,
      },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();
    expect(component.forecastSeries.length).toBe(2);
    expect(component.forecastCategories.length).toBe(7);
  });

  // --- Payment pie fallback to TotalCharges -------------------------

  it('should fall back to TotalCharges in payment pie data', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: {
        data: [{ PayerName: 'Guardian', TotalCharges: 300 }] as any,
      },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();
    const guardian = component.payerMixPaymentsApi.find(d => d.label === 'Guardian');
    expect(guardian?.value).toBe(300);
  });

  // --- Patient volume fallback to totalPatients ---------------------

  it('should fall back to totalPatients field in patient volume', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: { data: [] },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: {
        data: [{ payername: 'MetLife', totalPatients: 75 }] as any,
      },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();
    const metlife = component.payerMixPatientVolumeApi.find(d => d.label === 'MetLife');
    expect(metlife?.value).toBe(75);
  });

  // --- collapseSmall with exactly 5 items having "other" value 0 ----

  it('should not add Other when remaining items sum to 0', () => {
    const data: PayerIqDashboardData = {
      chargeAmount: {
        data: [
          { PayerName: 'P1', TotalCharges: 5000 },
          { PayerName: 'P2', TotalCharges: 4000 },
          { PayerName: 'P3', TotalCharges: 3000 },
          { PayerName: 'P4', TotalCharges: 2000 },
          { PayerName: 'P5', TotalCharges: 1000 },
          { PayerName: 'P6', TotalCharges: 0 },
        ] as any,
      },
      payerMixReimbursement: { data: [] },
      payerMixPatientVolume: { data: [] },
      payerMixCptVolume: { data: [] },
      forecasting: { data: [] },
      cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
      payerDetails: { data: [] },
    };
    dashboardData$.next(data);
    fixture.detectChanges();
    // P6 is filtered out before collapse since value=0, so only 5 remain
    const hasOther = component.payerMixCharges.some(d => d.label === 'Other');
    expect(hasOther).toBeFalse();
  });

  // --- payerNonPaymentColumns accessors - null branches --------------------

  describe('payerNonPaymentColumns accessors', () => {
    it('label column returns empty string when payer is null for payer nodeType', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      expect(col.accessor!({ nodeType: 'payer', payer: null } as any)).toBe('');
    });

    it('label column returns CPT with empty string when cptCode is null', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      expect(col.accessor!({ nodeType: 'cpt', cptCode: null } as any)).toBe('CPT: ');
    });

    it('label column returns Claim with empty string when claimId is null', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      expect(col.accessor!({ nodeType: 'claim', claimId: null } as any)).toBe('Claim: ');
    });

    it('label column returns payer value when set', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      expect(col.accessor!({ nodeType: 'payer', payer: 'Aetna' } as any)).toBe('Aetna');
    });

    it('label column returns CPT code when cptCode is set', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'label')!;
      expect(col.accessor!({ nodeType: 'cpt', cptCode: 'D1110' } as any)).toBe('CPT: D1110');
    });

    it('totalCharges accessor returns null when totalCharges is not a number', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
      expect(col.accessor!({ nodeType: 'payer', totalCharges: null } as any)).toBeNull();
    });

    it('totalCharges accessor returns value when totalCharges is a number', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
      expect(col.accessor!({ nodeType: 'payer', totalCharges: 5000 } as any)).toBe(5000);
    });

    it('totalCharges displayFormatter returns \u2014 when null', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
      expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
    });

    it('totalCharges displayFormatter returns formatted currency when not null', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'totalCharges')!;
      const result = col.displayFormatter!(5000 as any, {} as any);
      expect(result).toContain('5,000');
    });

    it('claims accessor returns null for claim nodeType', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
      expect(col.accessor!({ nodeType: 'claim', claims: 5 } as any)).toBeNull();
    });

    it('claims accessor returns value for payer nodeType when claims is a number', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
      expect(col.accessor!({ nodeType: 'payer', claims: 50 } as any)).toBe(50);
    });

    it('claims accessor returns null for payer nodeType when claims is not a number', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
      expect(col.accessor!({ nodeType: 'payer', claims: null } as any)).toBeNull();
    });

    it('claims displayFormatter returns \u2014 when null', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
      expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
    });

    it('claims displayFormatter returns formatted number when not null', () => {
      const col = component.payerNonPaymentColumns.find(c => c.id === 'claims')!;
      expect(col.displayFormatter!(50 as any, {} as any)).toBe('50');
    });
  });

  // --- payerDetailsColumns accessors - null branches ------------------------

  describe('payerDetailsColumns accessors', () => {
    it('totalCharges accessor returns null when not a number', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
      expect(col.accessor!({ label: 'A', totalCharges: null } as any)).toBeNull();
    });

    it('totalCharges accessor returns value when a number', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
      expect(col.accessor!({ label: 'A', totalCharges: 8000 } as any)).toBe(8000);
    });

    it('totalCharges displayFormatter returns \u2014 when null', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'totalCharges')!;
      expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
    });

    it('claims accessor returns null when not a number', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
      expect(col.accessor!({ label: 'A', claims: null } as any)).toBeNull();
    });

    it('claims accessor returns value when a number', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
      expect(col.accessor!({ label: 'A', claims: 80 } as any)).toBe(80);
    });

    it('claims displayFormatter returns \u2014 when null', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
      expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
    });

    it('claims displayFormatter returns formatted number when not null', () => {
      const col = component.payerDetailsColumns.find(c => c.id === 'claims')!;
      expect(col.displayFormatter!(80 as any, {} as any)).toBe('80');
    });
  });

  // --- applyDashboardData with null fields ----------------------------------

  describe('applyDashboardData with null data fields', () => {
    it('should handle null chargeAmount.data', () => {
      dashboardData$.next({
        chargeAmount: { data: null } as any,
        payerMixReimbursement: { data: [] },
        payerMixPatientVolume: { data: [] },
        payerMixCptVolume: { data: [] },
        forecasting: { data: [] },
        cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
        payerDetails: { data: [] },
      });
      fixture.detectChanges();
      expect(component.payerMixCharges).toEqual([]);
    });

    it('should handle null payerDetails.data', () => {
      dashboardData$.next({
        chargeAmount: { data: [] },
        payerMixReimbursement: { data: [] },
        payerMixPatientVolume: { data: [] },
        payerMixCptVolume: { data: [] },
        forecasting: { data: [] },
        cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
        payerDetails: { data: null } as any,
      });
      fixture.detectChanges();
      expect(component.payerDetailsTree).toEqual([]);
    });

    it('should handle null forecasting.data', () => {
      dashboardData$.next({
        chargeAmount: { data: [] },
        payerMixReimbursement: { data: [] },
        payerMixPatientVolume: { data: [] },
        payerMixCptVolume: { data: [] },
        forecasting: { data: null } as any,
        cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
        payerDetails: { data: [] },
      });
      fixture.detectChanges();
      expect(component.forecastSeries).toBeDefined();
    });
  });

  // --- cdtPerformanceColumns displayFormatters ------------------------------

  describe('cdtPerformanceColumns displayFormatters', () => {
    it('variancePercent column should format as percent when number', () => {
      const col = component.cdtPerformanceColumns.find(c => c.id === 'variancePercent')!;
      expect(col.displayFormatter!(15.5 as any, {} as any)).toBe('15.5%');
    });

    it('variancePercent column should return \u2014 when not a number', () => {
      const col = component.cdtPerformanceColumns.find(c => c.id === 'variancePercent')!;
      expect(col.displayFormatter!(null as any, {} as any)).toBe('\u2014');
    });

    it('variancePercent column should return \u2014 for string', () => {
      const col = component.cdtPerformanceColumns.find(c => c.id === 'variancePercent')!;
      expect(col.displayFormatter!('N/A' as any, {} as any)).toBe('\u2014');
    });
  });

  // --- dateRangeLabel branches ----------------------------------------------

  describe('dateRangeLabel', () => {
    it('returns "All" when both start and end are null', () => {
      component.filtersForm.patchValue({ startDate: null, endDate: null });
      expect(component.dateRangeLabel).toBe('All');
    });

    it('returns range with both dates when both set', () => {
      component.filtersForm.patchValue({ startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') });
      expect(component.dateRangeLabel).toContain('\u2013');
    });

    it('returns range with ellipsis when startDate is null but endDate set', () => {
      component.filtersForm.patchValue({ startDate: null, endDate: new Date('2025-12-31') });
      expect(component.dateRangeLabel).toContain('\u2026');
    });

    it('returns range with ellipsis when endDate is null but startDate set', () => {
      component.filtersForm.patchValue({ startDate: new Date('2025-01-01'), endDate: null });
      expect(component.dateRangeLabel).toContain('\u2026');
    });
  });

  // --- filter label helpers -------------------------------------------------

  describe('filter label getters', () => {
    it('payerLabel returns "All" when empty', () => {
      component.filtersForm.patchValue({ payers: [] });
      expect(component.payerLabel).toBe('All');
    });

    it('payerLabel returns count when items selected', () => {
      component.filtersForm.patchValue({ payers: ['Aetna', 'BCBS'] });
      expect(component.payerLabel).toBe('2 selected');
    });

    it('planLabel returns "All" when null', () => {
      component.filtersForm.patchValue({ plans: null });
      expect(component.planLabel).toBe('All');
    });

    it('leaseLabel returns count when set', () => {
      component.filtersForm.patchValue({ leaseNetworks: ['Zelis'] });
      expect(component.leaseLabel).toBe('1 selected');
    });

    it('providerLabel returns "All" when empty', () => {
      component.filtersForm.patchValue({ providers: [] });
      expect(component.providerLabel).toBe('All');
    });
  });

  // --- toPatientVolumePieData: fallback field paths ------------------------

  it('should use payername fallback when PayerName is missing in patient volume', () => {
    const data = buildEmptyDashboardData();
    data.payerMixPatientVolume = {
      data: [
        { payername: 'Aetna', patientEncounter: 100 } as any,  // PayerName absent -> falls to payername
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPatientVolumeApi.some((d: any) => d.label === 'Aetna')).toBeTrue();
  });

  it('should use patientEncounter fallback when PatientEncounter missing', () => {
    const data = buildEmptyDashboardData();
    data.payerMixPatientVolume = {
      data: [
        { PayerName: 'BCBS', patientEncounter: 50 } as any,  // PatientEncounter absent -> patientEncounter
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPatientVolumeApi.some((d: any) => d.label === 'BCBS')).toBeTrue();
  });

  it('should use TotalPatients fallback in patient volume', () => {
    const data = buildEmptyDashboardData();
    data.payerMixPatientVolume = {
      data: [
        { PayerName: 'Cigna', TotalPatients: 75 } as any,
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPatientVolumeApi.some((d: any) => d.label === 'Cigna')).toBeTrue();
  });

  it('should use totalPatients fallback in patient volume', () => {
    const data = buildEmptyDashboardData();
    data.payerMixPatientVolume = {
      data: [
        { PayerName: 'Humana', totalPatients: 60 } as any,
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPatientVolumeApi.some((d: any) => d.label === 'Humana')).toBeTrue();
  });

  it('should skip patient volume rows with no payer name', () => {
    const data = buildEmptyDashboardData();
    data.payerMixPatientVolume = {
      data: [
        { PatientEncounter: 50 } as any,  // no PayerName, no payername -> label='' -> filtered out
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPatientVolumeApi.length).toBe(0);
  });

  it('should skip patient volume rows with 0 value', () => {
    const data = buildEmptyDashboardData();
    data.payerMixPatientVolume = {
      data: [
        { PayerName: 'Aetna', PatientEncounter: 0 } as any,  // value=0 -> filtered
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPatientVolumeApi.length).toBe(0);
  });

  // --- toCptVolumePieData: fallback field paths ------------------------

  it('should use payername fallback when PayerName missing in cpt volume', () => {
    const data = buildEmptyDashboardData();
    data.payerMixCptVolume = {
      data: [
        { payername: 'Delta', ChargeRowCount: 30 } as any,
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixCptVolumeApi.some((d: any) => d.label === 'Delta')).toBeTrue();
  });

  it('should use chargeRowCount fallback when ChargeRowCount missing in cpt volume', () => {
    const data = buildEmptyDashboardData();
    data.payerMixCptVolume = {
      data: [
        { PayerName: 'United', chargeRowCount: 20 } as any,
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixCptVolumeApi.some((d: any) => d.label === 'United')).toBeTrue();
  });

  it('should aggregate cpt volume when same payer appears multiple times', () => {
    const data = buildEmptyDashboardData();
    data.payerMixCptVolume = {
      data: [
        { PayerName: 'Aetna', ChargeRowCount: 10 } as any,
        { PayerName: 'Aetna', ChargeRowCount: 20 } as any,
      ]
    };
    dashboardData$.next(data);
    const aetna = component.payerMixCptVolumeApi.find((d: any) => d.label === 'Aetna');
    expect(aetna?.value).toBe(30);
  });

  it('should skip cpt volume rows with empty payer or non-finite count', () => {
    const data = buildEmptyDashboardData();
    data.payerMixCptVolume = {
      data: [
        { PayerName: '', ChargeRowCount: 10 } as any,        // empty payer -> skip
        { PayerName: 'Aetna', ChargeRowCount: NaN } as any,  // NaN count -> skip
        { PayerName: 'BCBS', ChargeRowCount: -5 } as any,    // negative count -> skip
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixCptVolumeApi.length).toBe(0);
  });

  // --- toPaymentsPieData: fallback field paths -----------------------------

  it('should use payername and totalPayments fallbacks in payments pie', () => {
    const data = buildEmptyDashboardData();
    data.payerMixReimbursement = {
      data: [
        { payername: 'OptumRx', totalPayments: 500 } as any,  // lowercase fields
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPaymentsApi.some((d: any) => d.label === 'OptumRx')).toBeTrue();
  });

  it('should use TotalCharges fallback in payments pie when other fields missing', () => {
    const data = buildEmptyDashboardData();
    data.payerMixReimbursement = {
      data: [
        { PayerName: 'Cigna', TotalCharges: 800 } as any,  // TotalCharges as fallback
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPaymentsApi.some((d: any) => d.label === 'Cigna')).toBeTrue();
  });

  it('should use totalCharges as last fallback in payments pie', () => {
    const data = buildEmptyDashboardData();
    data.payerMixReimbursement = {
      data: [
        { PayerName: 'Humana', totalCharges: 300 } as any,
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixPaymentsApi.some((d: any) => d.label === 'Humana')).toBeTrue();
  });

  // --- toChargesPieData: fallback field paths ------------------------------

  it('should use payername fallback in charges pie when PayerName missing', () => {
    const data = buildEmptyDashboardData();
    data.chargeAmount = {
      data: [
        { payername: 'TestPayer', totalCharges: 1000 } as any,
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixCharges.some((d: any) => d.label === 'TestPayer')).toBeTrue();
  });

  it('should use totalCharges fallback in charges pie', () => {
    const data = buildEmptyDashboardData();
    data.chargeAmount = {
      data: [
        { PayerName: 'BlueCross', totalCharges: 2000 } as any,  // lowercase fallback
      ]
    };
    dashboardData$.next(data);
    expect(component.payerMixCharges.some((d: any) => d.label === 'BlueCross')).toBeTrue();
  });
});

// --- Test data builders ------------------------------------------

function buildMockDashboardData(payerCount: number): PayerIqDashboardData {
  const payers = Array.from({ length: payerCount }, (_, i) => `Payer${i + 1}`);
  return {
    chargeAmount: {
      data: payers.map((p, i) => ({ PayerName: p, TotalCharges: (payerCount - i) * 1000 })),
    },
    payerMixReimbursement: {
      data: payers.map((p, i) => ({ payername: p, totalPayments: (payerCount - i) * 800 })) as any,
    },
    payerMixPatientVolume: {
      data: payers.map((p, i) => ({ PayerName: p, PatientEncounter: (payerCount - i) * 50 })) as any,
    },
    payerMixCptVolume: {
      data: payers.map((p, i) => ({ PayerName: p, ProcedureCode: 'D1110', ChargeRowCount: (payerCount - i) * 30 })) as any,
    },
    forecasting: { data: [] },
    cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
    payerDetails: { data: [] },
  };
}

function buildEmptyDashboardData(): PayerIqDashboardData {
  return {
    chargeAmount: { data: [] },
    payerMixReimbursement: { data: [] },
    payerMixPatientVolume: { data: [] },
    payerMixCptVolume: { data: [] },
    forecasting: { data: [] },
    cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
    payerDetails: { data: [] },
  };
}

function buildMockDashboardDataWithForecast(): PayerIqDashboardData {
  return {
    chargeAmount: { data: [] },
    payerMixReimbursement: { data: [] },
    payerMixPatientVolume: { data: [] },
    payerMixCptVolume: { data: [] },
    forecasting: {
      data: [
        {
          payer: 1,
          nowMonthStart: '2026-03-01',
          '3_months_ago': 1000,
          '2_months_ago': 1100,
          '1_month_ago': 1200,
          now: 1300,
          '1_month_future': 1250,
          '2_month_future': 1300,
          '3_month_future': 1350,
          '3_months_ago_forecast': 950,
          '2_months_ago_forecast': 1050,
          '1_months_ago_forecast': 1150,
        },
      ] as any,
    },
    cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
    payerDetails: { data: [] },
  };
}

function buildMockDashboardDataWithNonPayment(): PayerIqDashboardData {
  return {
    chargeAmount: { data: [] },
    payerMixReimbursement: { data: [] },
    payerMixPatientVolume: { data: [] },
    payerMixCptVolume: { data: [] },
    forecasting: { data: [] },
    cptNonPayment: {
      payerRollup: [
        { PayerName: 'Delta Dental', TotalCharges: 5000, ClaimsCount: 50, RolledUpLines: 10 },
      ],
      cptRollup: [
        { PayerName: 'Delta Dental', ProcedureCode: 'D1110', TotalCharges: 3000, ClaimsCount: 30, RolledUpLines: 5 },
      ],
      lineItems: [
        { PayerName: 'Delta Dental', ProcedureCode: 'D1110', ClaimID: 'CL001', TotalCharges: 100, AmountPaid: 50, Balance: 50 },
      ],
    },
    payerDetails: { data: [] },
  };
}

function buildMockDashboardDataWithPayerDetails(): PayerIqDashboardData {
  return {
    chargeAmount: { data: [] },
    payerMixReimbursement: { data: [] },
    payerMixPatientVolume: { data: [] },
    payerMixCptVolume: { data: [] },
    forecasting: { data: [] },
    cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] },
    payerDetails: {
      data: [
        { SortLevel: 1, LevelType: 'CATEGORY', Category: 'Commercial', GroupName: null, PayerName: null, PlanName: null, TotalCharges: 10000, Claims: 100 },
        { SortLevel: 2, LevelType: 'GROUP', Category: 'Commercial', GroupName: 'Payer Direct', PayerName: null, PlanName: null, TotalCharges: 8000, Claims: 80 },
        { SortLevel: 3, LevelType: 'PAYER', Category: 'Commercial', GroupName: 'Payer Direct', PayerName: 'Aetna', PlanName: null, TotalCharges: 8000, Claims: 80 },
      ],
    },
  };
}
