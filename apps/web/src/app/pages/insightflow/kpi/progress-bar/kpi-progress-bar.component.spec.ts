import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { KpiProgressBarComponent } from './kpi-progress-bar.component';
import { KpiThresholds } from '../kpi.models';

const mockThresholds: KpiThresholds = {
  min: 0,
  redMax: 85,
  amberMax: 90,
  max: 100,
};

describe('KpiProgressBarComponent', () => {
  let component: KpiProgressBarComponent;
  let fixture: ComponentFixture<KpiProgressBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [KpiProgressBarComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiProgressBarComponent);
    component = fixture.componentInstance;
    component.thresholds = mockThresholds;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default inputs', () => {
    expect(component.value).toBeNull();
    expect(component.unit).toBe('%');
    expect(component.rag).toBe('red');
  });

  it('should compute fillWidth as 0 when value is null', () => {
    component.value = null;
    expect(component.fillWidth).toBe(0);
  });

  it('should compute fillWidth proportionally', () => {
    component.value = 50;
    expect(component.fillWidth).toBe(50);
  });

  it('should clamp fillWidth to 100 when value exceeds max', () => {
    component.value = 150;
    expect(component.fillWidth).toBe(100);
  });

  it('should clamp fillWidth to 0 when value is negative', () => {
    component.value = -10;
    expect(component.fillWidth).toBe(0);
  });

  it('should compute targetLeft as amberMax / max * 100', () => {
    // amberMax = 90, max = 100 => 90%
    expect(component.targetLeft).toBe(90);
  });

  it('should return 0 for targetLeft when thresholds is not set', () => {
    component.thresholds = null as any;
    expect(component.targetLeft).toBe(0);
  });

  it('should return 0 for fillWidth when thresholds is not set', () => {
    component.thresholds = null as any;
    component.value = 50;
    expect(component.fillWidth).toBe(0);
  });

  it('should accept rag input', () => {
    component.rag = 'green';
    expect(component.rag).toBe('green');
  });
});
