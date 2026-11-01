import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { StrategyComponent } from './strategy.component';
import { PayerIqService } from '../../../core/services/payer-iq.service';

describe('StrategyComponent', () => {
  let component: StrategyComponent;
  let fixture: ComponentFixture<StrategyComponent>;
  let mockPayerIqService: jasmine.SpyObj<PayerIqService>;

  beforeEach(async () => {
    mockPayerIqService = jasmine.createSpyObj('PayerIqService', [
      'getStrategyContractOptions',
      'getBuilderInfo',
    ]);
    mockPayerIqService.getStrategyContractOptions.and.returnValue(of({ data: [] } as any));
    mockPayerIqService.getBuilderInfo.and.returnValue(of({ summary: {}, rows: [] } as any));

    await TestBed.configureTestingModule({
      declarations: [StrategyComponent],
      imports: [ReactiveFormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: PayerIqService, useValue: mockPayerIqService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StrategyComponent);
    component = fixture.componentInstance;
    // Do NOT call fixture.detectChanges() - the template binds mat-select via
    // formControlName which requires Material value accessors we don't import.
    // Call ngOnInit() directly to initialise all component logic without rendering.
    component.ngOnInit();
  });

  // -- Creation & init -----------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with contractId and timeWindow controls', () => {
    expect(component.form).toBeTruthy();
    expect(component.form.get('contractId')).toBeTruthy();
    expect(component.form.get('timeWindow')).toBeTruthy();
  });

  it('should default timeWindow to "12m"', () => {
    expect(component.form.get('timeWindow')!.value).toBe('12m');
  });

  it('should default contractId to null', () => {
    expect(component.form.get('contractId')!.value).toBeNull();
  });

  it('should call getStrategyContractOptions on init', () => {
    expect(mockPayerIqService.getStrategyContractOptions).toHaveBeenCalled();
  });

  it('should set loadingContracts to false after contract options load', () => {
    expect(component.loadingContracts).toBeFalse();
  });

  // -- Contract options loading --------------------------------------

  it('should map contract options from API response', () => {
    mockPayerIqService.getStrategyContractOptions.and.returnValue(of({
      data: [
        { PayerContractID: 1, ContractPlanName: 'Plan A' },
        { PayerContractID: 2, ContractPlanName: 'Plan B' },
      ],
    } as any));
    component['loadContractOptions']();
    expect(component.contractOptions.length).toBe(2);
    expect(component.contractOptions.some(o => o.display.includes('Plan A'))).toBeTrue();
  });

  it('should deduplicate contract options by id', () => {
    mockPayerIqService.getStrategyContractOptions.and.returnValue(of({
      data: [
        { PayerContractID: 1, ContractPlanName: 'Plan A' },
        { PayerContractID: 1, ContractPlanName: 'Plan A Duplicate' },
      ],
    } as any));
    component['loadContractOptions']();
    expect(component.contractOptions.length).toBe(1);
  });

  it('should skip entries with invalid PayerContractID', () => {
    mockPayerIqService.getStrategyContractOptions.and.returnValue(of({
      data: [
        { PayerContractID: null, ContractPlanName: 'Bad' },
        { PayerContractID: 'abc', ContractPlanName: 'Also Bad' },
        { PayerContractID: 3, ContractPlanName: 'Good' },
      ],
    } as any));
    component['loadContractOptions']();
    expect(component.contractOptions.length).toBe(1);
    expect(component.contractOptions[0].id).toBe(3);
  });

  it('should use fallback name "Contract N" when ContractPlanName is empty', () => {
    mockPayerIqService.getStrategyContractOptions.and.returnValue(of({
      data: [{ PayerContractID: 5, ContractPlanName: '' }],
    } as any));
    component['loadContractOptions']();
    expect(component.contractOptions[0].contractName).toBe('Contract 5');
  });

  it('should clear contractId when selected value is no longer in loaded options', () => {
    component.form.get('contractId')!.setValue(999, { emitEvent: false });
    mockPayerIqService.getStrategyContractOptions.and.returnValue(of({
      data: [{ PayerContractID: 1, ContractPlanName: 'Plan A' }],
    } as any));
    component['loadContractOptions']();
    expect(component.form.get('contractId')!.value).toBeNull();
  });

  it('should set contractOptions to empty array and loadingContracts to false on error', () => {
    mockPayerIqService.getStrategyContractOptions.and.returnValue(throwError(() => new Error('network fail')));
    component['loadContractOptions']();
    expect(component.contractOptions).toEqual([]);
    expect(component.loadingContracts).toBeFalse();
  });

  it('should sort contract options alphabetically by display', () => {
    mockPayerIqService.getStrategyContractOptions.and.returnValue(of({
      data: [
        { PayerContractID: 2, ContractPlanName: 'Zebra Plan' },
        { PayerContractID: 1, ContractPlanName: 'Alpha Plan' },
      ],
    } as any));
    component['loadContractOptions']();
    expect(component.contractOptions[0].contractName).toBe('Alpha Plan');
    expect(component.contractOptions[1].contractName).toBe('Zebra Plan');
  });

  // -- loadBaseline via combineLatest --------------------------------

  it('should call getBuilderInfo when a valid contractId is set', fakeAsync(() => {
    mockPayerIqService.getBuilderInfo.calls.reset();
    mockPayerIqService.getBuilderInfo.and.returnValue(of({
      summary: { underpaymentCount: 10, underpaymentDollars: 5000, avgPaymentLagDays: 14, totalDenials: 3 },
      rows: [
        { cpt: 'D1110', volume: 50, currentAllowed: 100, avgPaid: 90, underpaidDollars: 500, totalCharges: 5000 },
      ],
    } as any));

    component.form.get('contractId')!.setValue(1);
    tick();

    expect(mockPayerIqService.getBuilderInfo).toHaveBeenCalled();
    expect(component.kpis).toBeTruthy();
    expect(component.kpis!.underpaymentCount).toBe(10);
    expect(component.kpis!.underpaymentAmount).toBe(5000);
    expect(component.kpis!.avgPaymentLagDays).toBe(14);
    expect(component.kpis!.denialCount).toBe(3);
    expect(component.rows.length).toBe(1);
    expect(component.rows[0].cpt).toBe('D1110');
    expect(component.loading).toBeFalse();
  }));

  it('should set kpis and rows to null/empty on baseline API error', fakeAsync(() => {
    mockPayerIqService.getBuilderInfo.and.returnValue(throwError(() => new Error('server error')));
    component.form.get('contractId')!.setValue(2);
    tick();

    expect(component.kpis).toBeNull();
    expect(component.rows).toEqual([]);
    expect(component.loading).toBeFalse();
  }));

  it('should not call getBuilderInfo when contractId is null', fakeAsync(() => {
    mockPayerIqService.getBuilderInfo.calls.reset();
    component.form.get('contractId')!.setValue(null);
    tick();

    expect(mockPayerIqService.getBuilderInfo).not.toHaveBeenCalled();
  }));

  // -- compareContractIds --------------------------------------------

  it('compareContractIds should match numeric and string representations of same id', () => {
    expect(component.compareContractIds(1, 1)).toBeTrue();
    expect(component.compareContractIds('1', 1)).toBeTrue();
    expect(component.compareContractIds(1, '1')).toBeTrue();
    expect(component.compareContractIds(1, 2)).toBeFalse();
  });

  it('compareContractIds should handle null and undefined', () => {
    expect(component.compareContractIds(null, null)).toBeTrue();
    expect(component.compareContractIds(undefined, undefined)).toBeTrue();
    expect(component.compareContractIds(null, 1)).toBeFalse();
    expect(component.compareContractIds(undefined, 1)).toBeFalse();
  });

  // -- trackByContractId ---------------------------------------------

  it('trackByContractId should return the item id', () => {
    const item = { id: 42, contractName: 'Test', display: 'Test - 42' };
    expect(component.trackByContractId(0, item)).toBe(42);
  });

  // -- onSetProposed -------------------------------------------------

  it('onSetProposed should update proposedAllowed and recompute pctChange and annualImpact', () => {
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];
    component.onSetProposed(component.rows[0], '100');
    expect(component.rows[0].proposedAllowed).toBe(100);
    expect(component.rows[0].pctChange).toBeCloseTo(25, 5);  // (100-80)/80*100 = 25
    expect(component.rows[0].annualImpact).toBe(2000);       // (100-80)*100
  });

  it('onSetProposed with empty string should clear proposedAllowed and derived fields', () => {
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: 90, pctChange: 12.5, annualImpact: 1000 } as any,
    ];
    component.onSetProposed(component.rows[0], '');
    expect(component.rows[0].proposedAllowed).toBeNull();
    expect(component.rows[0].pctChange).toBeNull();
    expect(component.rows[0].annualImpact).toBeNull();
  });

  it('onSetProposed with non-numeric string should set proposedAllowed to null', () => {
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];
    component.onSetProposed(component.rows[0], 'abc');
    expect(component.rows[0].proposedAllowed).toBeNull();
    expect(component.rows[0].annualImpact).toBeNull();
  });

  it('onSetProposed should yield null pctChange when currentAllowed is 0 (division by zero guard)', () => {
    component.rows = [
      { cpt: 'D0000', volume: 10, currentAllowed: 0, avgPaid: 0, underpaidAmount: 0, totalCharges: 0,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];
    component.onSetProposed(component.rows[0], '100');
    expect(component.rows[0].pctChange).toBeNull();
    expect(component.rows[0].annualImpact).toBe(1000); // (100 - 0) * 10
  });

  // -- clearProposed -------------------------------------------------

  it('clearProposed should reset all rows and nullify result', () => {
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: 90, pctChange: 12.5, annualImpact: 1000 } as any,
      { cpt: 'D1120', volume: 50, currentAllowed: 60, avgPaid: 55, underpaidAmount: 250, totalCharges: 3000,
        proposedAllowed: 70, pctChange: 16.7, annualImpact: 500 } as any,
    ];
    component.result = { totalAnnualImpact: 1500, topDrivers: [], assumptions: [] };
    component.clearProposed();
    for (const row of component.rows) {
      expect(row.proposedAllowed).toBeNull();
      expect(row.pctChange).toBeNull();
      expect(row.annualImpact).toBeNull();
    }
    expect(component.result).toBeNull();
  });

  // -- runStrategy ---------------------------------------------------

  it('should not run strategy when form is invalid (no contractId)', () => {
    component.form.get('contractId')!.setValue(null);
    component.runStrategy();
    expect(component.running).toBeFalse();
    expect(component.result).toBeNull();
  });

  it('should set running=true during strategy execution then false after timeout', fakeAsync(() => {
    component.form.get('contractId')!.setValue(1);
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: 100, pctChange: 25, annualImpact: 2000 } as any,
    ];

    component.runStrategy();
    expect(component.running).toBeTrue();
    tick(300);
    expect(component.running).toBeFalse();
  }));

  it('should compute totalAnnualImpact from impacted rows only', fakeAsync(() => {
    component.form.get('contractId')!.setValue(1);
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: 100, pctChange: 25, annualImpact: 2000 } as any,
      // this row has no proposedAllowed - should be excluded
      { cpt: 'D1120', volume: 50, currentAllowed: 60, avgPaid: 55, underpaidAmount: 250, totalCharges: 3000,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];

    component.runStrategy();
    tick(300);

    expect(component.result).toBeTruthy();
    expect(component.result!.totalAnnualImpact).toBe(2000);
    expect(component.result!.topDrivers.length).toBe(1);
    expect(component.result!.assumptions.length).toBeGreaterThan(0);
  }));

  it('should sort topDrivers by annualImpact descending', fakeAsync(() => {
    component.form.get('contractId')!.setValue(1);
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: 90, pctChange: 12.5, annualImpact: 1000 } as any,
      { cpt: 'D1120', volume: 200, currentAllowed: 50, avgPaid: 45, underpaidAmount: 1000, totalCharges: 10000,
        proposedAllowed: 70, pctChange: 40, annualImpact: 4000 } as any,
    ];

    component.runStrategy();
    tick(300);

    expect(component.result!.topDrivers[0].cpt).toBe('D1120');
    expect(component.result!.topDrivers[1].cpt).toBe('D1110');
  }));

  // -- computeDateRange ----------------------------------------------

  it('computeDateRange should return ISO date strings spanning ~12 months for "12m"', () => {
    const { start, end } = component['computeDateRange']('12m');
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const months =
      (new Date(end).getFullYear() - new Date(start).getFullYear()) * 12 +
      (new Date(end).getMonth() - new Date(start).getMonth());
    expect(months).toBe(12);
  });

  it('computeDateRange should span ~6 months for "6m"', () => {
    const { start, end } = component['computeDateRange']('6m');
    const months =
      (new Date(end).getFullYear() - new Date(start).getFullYear()) * 12 +
      (new Date(end).getMonth() - new Date(start).getMonth());
    expect(months).toBe(6);
  });

  it('computeDateRange should span ~3 months for "3m"', () => {
    const { start, end } = component['computeDateRange']('3m');
    const months =
      (new Date(end).getFullYear() - new Date(start).getFullYear()) * 12 +
      (new Date(end).getMonth() - new Date(start).getMonth());
    expect(months).toBe(3);
  });

  // -- asCurrency ----------------------------------------------------

  it('asCurrency should return em-dash for null', () => {
    expect(component.asCurrency(null)).toBe('\u2014');
  });

  it('asCurrency should return em-dash for undefined', () => {
    expect(component.asCurrency(undefined)).toBe('\u2014');
  });

  it('asCurrency should include the numeric value for a positive number', () => {
    const result = component.asCurrency(50000);
    expect(result).toContain('50');    // locale-safe: just verify it contains the magnitude
    expect(result).not.toBe('\u2014');
  });

  // -- asPct ---------------------------------------------------------

  it('asPct should return em-dash for null', () => {
    expect(component.asPct(null)).toBe('\u2014');
  });

  it('asPct should return em-dash for undefined', () => {
    expect(component.asPct(undefined)).toBe('\u2014');
  });

  it('asPct should format number with one decimal place and % suffix', () => {
    expect(component.asPct(85.67)).toBe('85.7%');
    expect(component.asPct(0)).toBe('0.0%');
    expect(component.asPct(-5.5)).toBe('-5.5%');
  });

  // -- asNumber ------------------------------------------------------

  it('asNumber should return em-dash for null', () => {
    expect(component.asNumber(null)).toBe('\u2014');
  });

  it('asNumber should return em-dash for undefined', () => {
    expect(component.asNumber(undefined)).toBe('\u2014');
  });

  it('asNumber should return a non-empty string for a positive integer', () => {
    const result = component.asNumber(1234);
    expect(result).toBeTruthy();
    expect(result).not.toBe('\u2014');
  });

  // -- displayedColumns ----------------------------------------------

  it('displayedColumns should include cpt, volume, and annualImpact', () => {
    expect(component.displayedColumns).toContain('cpt');
    expect(component.displayedColumns).toContain('volume');
    expect(component.displayedColumns).toContain('annualImpact');
  });

  // -- ngOnDestroy ---------------------------------------------------

  it('should call destroy$.next() on ngOnDestroy', () => {
    const spy = spyOn(component['destroy$'], 'next');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });

  // -- ratioClass ----------------------------------------------------

  it('ratioClass should return "ratio--low" when ratio < 0.80', () => {
    expect(component.ratioClass(0.79)).toBe('ratio--low');
    expect(component.ratioClass(0)).toBe('ratio--low');
  });

  it('ratioClass should return "ratio--mid" when ratio is between 0.80 and 0.95', () => {
    expect(component.ratioClass(0.80)).toBe('ratio--mid');
    expect(component.ratioClass(0.90)).toBe('ratio--mid');
    expect(component.ratioClass(0.94)).toBe('ratio--mid');
  });

  it('ratioClass should return "ratio--ok" when ratio >= 0.95', () => {
    expect(component.ratioClass(0.95)).toBe('ratio--ok');
    expect(component.ratioClass(1.0)).toBe('ratio--ok');
    expect(component.ratioClass(1.5)).toBe('ratio--ok');
  });

  // -- formatPct -----------------------------------------------------

  it('formatPct should format ratio as percentage string', () => {
    expect(component.formatPct(0.85)).toBe('85%');
    expect(component.formatPct(1.0)).toBe('100%');
    expect(component.formatPct(0)).toBe('0%');
    expect(component.formatPct(0.123)).toBe('12%');
  });

  // -- optimizeProposed ---------------------------------------------

  it('optimizeProposed should not run when rows are empty', () => {
    component.rows = [];
    const spy = spyOn<any>(component, 'payerIqService' as any);
    component.optimizeProposed();
    expect(component.optimizing).toBeFalse();
  });

  it('optimizeProposed should call optimizeProposed service and apply suggestions', fakeAsync(() => {
    // Set up service mock with optimizeProposed
    (mockPayerIqService as any).optimizeProposed = jasmine.createSpy('optimizeProposed').and.returnValue(of({
      suggestions: [{ cpt: 'D1110', proposedAllowed: 110 }],
      rationale: 'Test rationale',
      meta: { model: 'llama3' },
      rawResponse: '{}',
      promptSent: 'test prompt',
      inputRows: [{ cpt: 'D1110' }],
    }));

    component.contractOptions = [{ id: 5, contractName: 'Aetna PPO', display: 'Aetna PPO - 5' }];
    component.form.get('contractId')!.setValue(5, { emitEvent: false });
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];

    component.optimizeProposed();
    tick();

    expect(component.optimizing).toBeFalse();
    expect(component.aiRationale).toBe('Test rationale');
    expect(component.aiError).toBeNull();
    expect(component.rows[0].proposedAllowed).toBe(110);
  }));

  it('optimizeProposed should handle API error and set aiError', fakeAsync(() => {
    (mockPayerIqService as any).optimizeProposed = jasmine.createSpy('optimizeProposed').and.returnValue(throwError(() => ({
      status: 500,
      error: { message: 'AI failed', rawResponse: '{}', promptSent: 'prompt', inputRows: [] },
    })));

    component.contractOptions = [{ id: 5, contractName: 'Aetna PPO', display: 'Aetna PPO - 5' }];
    component.form.get('contractId')!.setValue(5, { emitEvent: false });
    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];

    component.optimizeProposed();
    tick();

    expect(component.optimizing).toBeFalse();
    expect(component.aiError).toBe('AI failed');
    expect(component.aiRawResponse).toBe('{}');
    expect(component.aiPromptSent).toBe('prompt');
  }));

  it('optimizeProposed should show 503 message when status is 503', fakeAsync(() => {
    (mockPayerIqService as any).optimizeProposed = jasmine.createSpy('optimizeProposed').and.returnValue(throwError(() => ({
      status: 503,
      error: {},
    })));

    component.rows = [
      { cpt: 'D1110', volume: 100, currentAllowed: 80, avgPaid: 75, underpaidAmount: 500, totalCharges: 8000,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];

    component.optimizeProposed();
    tick();

    expect(component.aiError).toContain('offline');
  }));

  it('optimizeProposed should use contract name from options', fakeAsync(() => {
    (mockPayerIqService as any).optimizeProposed = jasmine.createSpy('optimizeProposed').and.returnValue(of({
      suggestions: [],
      rationale: '',
      meta: null,
      rawResponse: null,
      promptSent: null,
      inputRows: null,
    }));

    component.contractOptions = [{ id: 7, contractName: 'Blue Cross', display: 'Blue Cross - 7' }];
    component.form.get('contractId')!.setValue(7, { emitEvent: false });
    component.rows = [
      { cpt: 'D0120', volume: 10, currentAllowed: 50, avgPaid: 45, underpaidAmount: 50, totalCharges: 500,
        proposedAllowed: null, pctChange: null, annualImpact: null } as any,
    ];

    component.optimizeProposed();
    tick();

    const spy = (mockPayerIqService as any).optimizeProposed as jasmine.Spy;
    const callArgs = spy.calls.mostRecent().args[0];
    expect(callArgs.payerName).toBe('Blue Cross');
  }));

  it('loadBaseline should handle null/undefined fields in rows (??0 paths)', fakeAsync(() => {
    mockPayerIqService.getBuilderInfo.and.returnValue(of({
      summary: { underpaymentCount: null, underpaymentDollars: null, avgPaymentLagDays: null, totalDenials: null },
      rows: [
        { cpt: null, volume: null, currentAllowed: null, avgPaid: null, underpaidDollars: null, totalCharges: null },
      ],
    } as any));

    component.form.get('contractId')!.setValue(3);
    tick();

    expect(component.kpis!.underpaymentCount).toBe(0);
    expect(component.kpis!.underpaymentAmount).toBe(0);
    expect(component.rows[0].cpt).toBe('');
    expect(component.rows[0].volume).toBe(0);
    expect(component.rows[0].currentAllowed).toBe(0);
  }));
});
