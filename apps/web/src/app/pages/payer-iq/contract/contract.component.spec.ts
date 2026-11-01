import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ContractComponent } from './contract.component';
import { ContractService } from './contract.service';

describe('ContractComponent', () => {
  let component: ContractComponent;
  let fixture: ComponentFixture<ContractComponent>;
  let mockService: jasmine.SpyObj<ContractService>;
  let cdrSpy: jasmine.SpyObj<ChangeDetectorRef>;

  const mockContracts = [
    {
      PayerContractID: 1,
      PayerName: 'Aetna',
      ContractDisplayName: 'Aetna PPO 2025',
      PrimaryNetworkKey: 'Availity-Direct',
      FeeScheduleCount: 10,
      ClaimsLast90d: 120,
      AvgPaymentAmt: 85,
      ExpirationDate: '2026-12-31',
    },
    {
      PayerContractID: 2,
      PayerName: 'Cigna',
      ContractDisplayName: 'Cigna DPPO',
      PrimaryNetworkKey: 'Change-Healthcare-Network',
      FeeScheduleCount: 8,
      ClaimsLast90d: 60,
      AvgPaymentAmt: 72,
      ExpirationDate: null,
    },
  ];

  const mockArbitrage = [
    {
      payerId: 1,
      payerName: 'Aetna',
      bestRate: 952,
      worstRate: 880,
      arbitrageSpread: 72,
      opportunityExists: true,
      optimalRoute: { NetworkKey: 'Direct-Payer-EDI', ClaimVolume: 50, AvgContractedRate: 952 },
      routes: [
        { NetworkKey: 'Direct-Payer-EDI',          RouteType: 'Direct',   AvgContractedRate: 952, AvgActualPaid: 910, ClaimVolume: 50, PayerContractID: 1 },
        { NetworkKey: 'Availity-Direct',            RouteType: 'Direct',   AvgContractedRate: 920, AvgActualPaid: 895, ClaimVolume: 48, PayerContractID: 2 },
        { NetworkKey: 'Change-Healthcare-Network',  RouteType: 'Indirect', AvgContractedRate: 880, AvgActualPaid: 860, ClaimVolume: 22, PayerContractID: 3 },
      ],
    },
  ];

  const mockSummary = {
    TotalClaims:             500,
    TotalBilled:         125000,
    TotalPaid:            98000,
    TotalContractualAdj:  22000,
    AvgPaymentRatePct:     78.4,
    UniquePayersRouted:       8,
    ClaimsWithContractedRate: 412,
  };

  beforeEach(async () => {
    mockService = jasmine.createSpyObj('ContractService', [
      'getContracts',
      'getFeeSchedule',
      'getRoutingArbitrage',
      'getSavingsSummary',
      'getRoutingPaths',
    ]);

    mockService.getContracts.and.returnValue(of(mockContracts));
    mockService.getRoutingArbitrage.and.returnValue(of(mockArbitrage));
    mockService.getSavingsSummary.and.returnValue(of(mockSummary));
    mockService.getFeeSchedule.and.returnValue(of([]));
    mockService.getRoutingPaths.and.returnValue(of([]));

    cdrSpy = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck', 'detectChanges']);

    await TestBed.configureTestingModule({
      declarations: [ContractComponent],
      imports: [ReactiveFormsModule, MatInputModule, MatSelectModule, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ContractService, useValue: mockService },
        { provide: ChangeDetectorRef, useValue: cdrSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ContractComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -- Creation ---------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getContracts on init', () => {
    expect(mockService.getContracts).toHaveBeenCalled();
  });

  it('should call getSavingsSummary on init', () => {
    expect(mockService.getSavingsSummary).toHaveBeenCalledWith(90);
  });

  it('should call getRoutingArbitrage on init', async () => {
    // wireArbitrageFilter debounces for 400ms before the first fetch
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(mockService.getRoutingArbitrage).toHaveBeenCalled();
  });

  // -- Loading state ----------------------------------------------------------

  it('should populate contracts after load', () => {
    expect(component.contracts.length).toBe(2);
    expect(component.contracts[0].PayerName).toBe('Aetna');
  });

  it('should populate arbitrageData after load', async () => {
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(component.arbitrageData.length).toBe(1);
    expect(component.arbitrageData[0].payerName).toBe('Aetna');
  });

  it('should populate summary after load', () => {
    expect(component.summary.TotalClaims).toBe(500);
    expect(component.summary.UniquePayersRouted).toBe(8);
  });

  it('should set errorContracts on service error', fakeAsync(() => {
    mockService.getContracts.and.returnValue(throwError(() => new Error('Network error')));
    component['loadContracts']();
    tick();
    expect(component.errorContracts).toBeTruthy();
  }));

  // -- contractStatus ---------------------------------------------------------

  it('contractStatus should return Active when no expiration date', () => {
    expect(component.contractStatus({ ExpirationDate: null })).toBe('Active');
  });

  it('contractStatus should return Expired for past date', () => {
    expect(component.contractStatus({ ExpirationDate: '2020-01-01' })).toBe('Expired');
  });

  it('contractStatus should return Expiring Soon within 90 days', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const status = component.contractStatus({ ExpirationDate: future.toISOString() });
    expect(status).toBe('Expiring Soon');
  });

  it('contractStatus should return Active for dates > 90 days away', () => {
    const future = new Date();
    future.setDate(future.getDate() + 180);
    const status = component.contractStatus({ ExpirationDate: future.toISOString() });
    expect(status).toBe('Active');
  });

  // -- toggleContractRow ------------------------------------------------------

  it('toggleContractRow should expand and load routing paths', fakeAsync(() => {
    const paths = [{ LeaseNetworkKey: 'Availity-Direct' }];
    mockService.getRoutingPaths.and.returnValue(of(paths));

    component.toggleContractRow(1);
    tick();

    expect(component.expandedContractId).toBe(1);
    expect(component.routingPaths).toEqual(paths);
  }));

  it('toggleContractRow should collapse when same id clicked again', fakeAsync(() => {
    mockService.getRoutingPaths.and.returnValue(of([]));
    component.toggleContractRow(1);
    tick();
    component.toggleContractRow(1);
    expect(component.expandedContractId).toBeNull();
  }));

  it('isExpanded should return true for expanded contract', fakeAsync(() => {
    mockService.getRoutingPaths.and.returnValue(of([]));
    component.toggleContractRow(2);
    tick();
    expect(component.isExpanded(2)).toBeTrue();
    expect(component.isExpanded(1)).toBeFalse();
  }));

  // -- opportunityCount / totalOpportunityValue -------------------------------

  it('opportunityCount should count payers with opportunityExists = true', () => {
    component.arbitrageData = mockArbitrage;
    expect(component.opportunityCount).toBe(1);
  });

  it('totalOpportunityValue should compute spread * volume', () => {
    component.arbitrageData = mockArbitrage;
    // spread=72, ClaimVolume=50 -> 3600
    expect(component.totalOpportunityValue).toBe(72 * 50);
  });

  // -- downloadCsv ------------------------------------------------------------

  it('downloadCsv should not throw when no data', () => {
    component.feeScheduleData = [];
    expect(() => component.downloadCsv()).not.toThrow();
  });

  it('downloadCsv should trigger anchor download when data exists', () => {
    component.contractSelectorCtrl.setValue(1);
    component.feeScheduleData = [
      { ProcedureCode: 'D0120', ServiceCode: 'Periodic eval', ContractedRate: 54, EffectiveDate: '2025-01-01' },
    ];

    const createSpy = spyOn(document, 'createElement').and.callThrough();
    expect(() => component.downloadCsv()).not.toThrow();
    expect(createSpy).toHaveBeenCalledWith('a');
  });

  // -- Format helpers ---------------------------------------------------------

  it('fmt should format numbers with locale separators', () => {
    expect(component.fmt(1500)).toBe('1,500');
  });

  it('fmt should return em-dash for null/undefined', () => {
    expect(component.fmt(null)).toBe('\u2014');
    expect(component.fmt(undefined)).toBe('\u2014');
  });

  it('fmtCurrency should format as USD', () => {
    expect(component.fmtCurrency(952)).toBe('$952.00');
  });

  it('fmtCurrency should return em-dash for null', () => {
    expect(component.fmtCurrency(null)).toBe('\u2014');
  });

  it('fmtPct should append percent sign', () => {
    expect(component.fmtPct(78.4)).toBe('78.4%');
  });

  it('routeTypeLabel should map Direct to Direct EDI', () => {
    expect(component.routeTypeLabel('Direct')).toBe('Direct EDI');
    expect(component.routeTypeLabel('Indirect')).toBe('Clearinghouse');
    expect(component.routeTypeLabel('Unknown')).toBe('Unknown');
  });

  // -- Fee schedule selector --------------------------------------------------

  it('selecting a contract should load fee schedule', fakeAsync(() => {
    const feeData = [{ ProcedureCode: 'D0150', ContractedRate: 90 }];
    mockService.getFeeSchedule.and.returnValue(of(feeData));

    component.contractSelectorCtrl.setValue(1);
    tick(10);

    expect(mockService.getFeeSchedule).toHaveBeenCalledWith(1);
    expect(component.feeScheduleData).toEqual(feeData);
  }));

  it('selecting null should clear fee schedule data', fakeAsync(() => {
    component.feeScheduleData = [{ ProcedureCode: 'D0120' }];
    component.contractSelectorCtrl.setValue(null);
    tick(10);
    expect(component.feeScheduleData).toEqual([]);
  }));
});
