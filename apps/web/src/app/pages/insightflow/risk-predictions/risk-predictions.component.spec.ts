import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { RiskPredictionsComponent } from './risk-predictions.component';
import { DenialPredictionService } from '../../../core/services/denial-prediction.service';

describe('RiskPredictionsComponent', () => {
  let component: RiskPredictionsComponent;
  let fixture: ComponentFixture<RiskPredictionsComponent>;

  const mockSummary = {
    totalScored: 200,
    highRisk: 40,
    mediumRisk: 80,
    lowRisk: 80,
    totalCharges: 500000,
    highRiskCharges: 100000,
    avgRiskScore: 45,
    highRiskPrecision: 0.82,
  };

  const mockService = {
    getRiskSummary: jasmine.createSpy('getRiskSummary').and.returnValue(of(mockSummary)),
    getHighRiskClaims: jasmine.createSpy('getHighRiskClaims').and.returnValue(of([])),
    getRiskByPayer: jasmine.createSpy('getRiskByPayer').and.returnValue(of([])),
    getRiskByReason: jasmine.createSpy('getRiskByReason').and.returnValue(of([])),
    getRiskTrend: jasmine.createSpy('getRiskTrend').and.returnValue(of([])),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RiskPredictionsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: DenialPredictionService, useValue: mockService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RiskPredictionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load all data on init', () => {
    expect(mockService.getRiskSummary).toHaveBeenCalled();
    expect(mockService.getHighRiskClaims).toHaveBeenCalledWith(50);
    expect(mockService.getRiskByPayer).toHaveBeenCalled();
    expect(mockService.getRiskByReason).toHaveBeenCalled();
    expect(mockService.getRiskTrend).toHaveBeenCalled();
    expect(component.loading).toBeFalse();
  });

  it('should populate summary data', () => {
    expect(component.summary).toEqual(mockSummary);
  });

  it('highRiskPct should calculate correctly', () => {
    expect(component.highRiskPct).toBe(20);
  });

  it('highRiskPct should return 0 when no data', () => {
    component.summary = null;
    expect(component.highRiskPct).toBe(0);
  });

  it('revenueAtRiskPct should calculate correctly', () => {
    expect(component.revenueAtRiskPct).toBe(20);
  });

  it('revenueAtRiskPct should return 0 when no data', () => {
    component.summary = null;
    expect(component.revenueAtRiskPct).toBe(0);
  });

  it('formatCurrency should format millions', () => {
    expect(component.formatCurrency(2500000)).toBe('$2.5M');
  });

  it('formatCurrency should format thousands', () => {
    expect(component.formatCurrency(50000)).toBe('$50K');
  });

  it('formatCurrency should format small values', () => {
    expect(component.formatCurrency(500)).toBe('$500');
  });

  it('riskTierClass should return correct class', () => {
    expect(component.riskTierClass('High')).toBe('risk-high');
    expect(component.riskTierClass('Medium')).toBe('risk-medium');
    expect(component.riskTierClass('Low')).toBe('risk-low');
    expect(component.riskTierClass('Unknown')).toBe('');
  });

  it('riskScoreClass should return correct class based on score', () => {
    expect(component.riskScoreClass(80)).toBe('risk-high');
    expect(component.riskScoreClass(50)).toBe('risk-medium');
    expect(component.riskScoreClass(20)).toBe('risk-low');
  });

  it('should have default activeSection of overview', () => {
    expect(component.activeSection).toBe('overview');
  });

  it('should have showAlgorithm defaulting to false', () => {
    expect(component.showAlgorithm).toBeFalse();
  });
});
