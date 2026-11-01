import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { PrioritySettingsComponent } from './priority-settings.component';
import { PriorityService } from '../../../core/services/priority.service';

describe('PrioritySettingsComponent', () => {
  let component: PrioritySettingsComponent;
  let fixture: ComponentFixture<PrioritySettingsComponent>;
  let svcSpy: jasmine.SpyObj<PriorityService>;

  const mockSettings = {
    weights: { aging: 40, value: 25, deadline: 20, workload: 15 },
    enabled: true,
    stats: { totalScored: 100, lastRunAt: '2026-01-01', avgScore: 55, maxScore: 95, minScore: 10 },
    distribution: { high: 30, medium: 50, low: 20 },
  };

  beforeEach(async () => {
    svcSpy = jasmine.createSpyObj('PriorityService', [
      'getSettings', 'updateSettings', 'triggerRecalculate', 'getTopClaims',
    ]);
    svcSpy.getSettings.and.returnValue(of(mockSettings as any));
    svcSpy.updateSettings.and.returnValue(of(void 0));
    svcSpy.triggerRecalculate.and.returnValue(of(void 0));
    svcSpy.getTopClaims.and.returnValue(of({ data: [] }));

    await TestBed.configureTestingModule({
      declarations: [PrioritySettingsComponent],
      providers: [{ provide: PriorityService, useValue: svcSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PrioritySettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load settings on init', () => {
    expect(component.weights.aging).toBe(40);
    expect(component.enabled).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('weightsTotal should sum all weights', () => {
    expect(component.weightsTotal).toBe(100);
  });

  it('saveWeights should call updateSettings', () => {
    component.saveWeights();
    expect(svcSpy.updateSettings).toHaveBeenCalled();
  });

  it('toggleEnabled should flip enabled and call updateSettings', () => {
    component.enabled = true;
    component.toggleEnabled();
    expect(component.enabled).toBeFalse();
    expect(svcSpy.updateSettings).toHaveBeenCalledWith({ enabled: false });
  });

  it('triggerRecalc should set recalculating flag and reload', () => {
    component.triggerRecalc();
    expect(svcSpy.triggerRecalculate).toHaveBeenCalled();
    expect(component.recalculating).toBeFalse();
  });

  it('scoreClass should return correct class', () => {
    expect(component.scoreClass(80)).toBe('score-high');
    expect(component.scoreClass(55)).toBe('score-medium');
    expect(component.scoreClass(20)).toBe('score-low');
  });

  it('loadTopClaims should toggle showTop', () => {
    component.loadTopClaims();
    expect(component.showTop).toBeTrue();
    expect(svcSpy.getTopClaims).toHaveBeenCalled();
  });
});
