import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { FinanceSummaryComponent } from './finance-summary.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';

describe('FinanceSummaryComponent', () => {
  let component: FinanceSummaryComponent;
  let fixture: ComponentFixture<FinanceSummaryComponent>;

  const mockSummary = {
    grossCharges: 100000,
    insurancePayments: 70000,
    patientPayments: 10000,
    contractualAdjustments: 15000,
    writeOffs: 5000,
    netCollections: 80000,
    netCollectionRate: 80,
    grossCollectionRate: 85,
    openAR: 20000,
    daysInAR: 35,
  };

  const mockReconIqService = {
    getFinanceSummary: jasmine.createSpy('getFinanceSummary').and.returnValue(of({
      summary: mockSummary,
      monthly: [],
      byTrxType: [],
    })),
    getReconFilterOptions: jasmine.createSpy('getReconFilterOptions').and.returnValue(of({ locations: [], payers: [] })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FinanceSummaryComponent],
      imports: [MatMenuModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ReconIqService, useValue: mockReconIqService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FinanceSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getFinanceSummary on init', () => {
    expect(mockReconIqService.getFinanceSummary).toHaveBeenCalled();
  });

  it('should set summary from API response', () => {
    expect(component.summary).toEqual(mockSummary);
  });

  it('should default selectedMonths to 12', () => {
    expect(component.selectedMonths).toBe(12);
  });

  it('fmt should format currency', () => {
    const result = component.fmt(50000);
    expect(result).toContain('50,000');
  });

  it('fmtPct should format percentage', () => {
    expect(component.fmtPct(85.67)).toBe('85.7%');
  });

  it('fmtCount should format number with commas', () => {
    expect(component.fmtCount(1234)).toBe('1,234');
  });

  it('netCollectableAmount should compute correctly', () => {
    expect(component.netCollectableAmount()).toBe(100000 - 15000 - 5000);
  });

  it('netCollectableAmount should return 0 when no summary', () => {
    component.summary = null;
    expect(component.netCollectableAmount()).toBe(0);
  });

  it('collectionRateClass should return correct class', () => {
    expect(component.collectionRateClass(95)).toBe('rate-green');
    expect(component.collectionRateClass(85)).toBe('rate-amber');
    expect(component.collectionRateClass(70)).toBe('rate-red');
  });

  it('daysInArClass should return correct class', () => {
    expect(component.daysInArClass(20)).toBe('rate-green');
    expect(component.daysInArClass(40)).toBe('rate-amber');
    expect(component.daysInArClass(60)).toBe('rate-red');
  });

  it('categoryLabel should return mapped label or raw value', () => {
    expect(component.categoryLabel('charge')).toBe('Gross Charge');
    expect(component.categoryLabel('unknown')).toBe('unknown');
  });

  it('trxTypeTotal should sum byTrxType amounts', () => {
    component.byTrxType = [
      { trxType: 'A', category: 'charge', totalAmount: 100, txCount: 1 },
      { trxType: 'B', category: 'other', totalAmount: 200, txCount: 2 },
    ] as any;
    expect(component.trxTypeTotal()).toBe(300);
  });

  it('waterfallPct should return percentage of grossCharges', () => {
    expect(component.waterfallPct(50000)).toBe(50);
  });

  it('waterfallPct should return 0 when no summary', () => {
    component.summary = null;
    expect(component.waterfallPct(50000)).toBe(0);
  });

  it('onMonthsChange should reload data', () => {
    mockReconIqService.getFinanceSummary.calls.reset();
    component.onMonthsChange();
    expect(mockReconIqService.getFinanceSummary).toHaveBeenCalled();
  });
});
