import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { KpiFilterDialogComponent } from './kpi-filter-dialog.component';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { KpiFilters } from '../kpi.models';

describe('KpiFilterDialogComponent', () => {
  let component: KpiFilterDialogComponent;
  let fixture: ComponentFixture<KpiFilterDialogComponent>;
  let mockRef: jasmine.SpyObj<MatDialogRef<KpiFilterDialogComponent>>;
  let mockAnalytics: jasmine.SpyObj<AnalyticsService>;

  const defaultData: KpiFilters = {
    practice: 'All',
    location: 'All',
    provider: null,
    timeframe: 'Past month',
    rag: 'All',
    from: '',
    to: '',
  } as any;

  beforeEach(async () => {
    mockRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    mockAnalytics = jasmine.createSpyObj('AnalyticsService', ['track']);

    await TestBed.configureTestingModule({
      declarations: [KpiFilterDialogComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [ReactiveFormsModule, NoopAnimationsModule, MatSelectModule, MatInputModule],
      providers: [
        { provide: MatDialogRef, useValue: mockRef },
        { provide: MAT_DIALOG_DATA, useValue: defaultData },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with provided data', () => {
    expect(component.form.get('practice')!.value).toBe('All');
    expect(component.form.get('location')!.value).toBe('All');
    expect(component.form.get('timeframe')!.value).toBe('Past month');
    expect(component.form.get('rag')!.value).toBe('All');
  });

  it('should close dialog with form value when apply() is called on valid form', () => {
    expect(component.form.valid).toBeTrue();
    component.apply();
    expect(mockRef.close).toHaveBeenCalledWith(jasmine.objectContaining({ practice: 'All', timeframe: 'Past month' }));
  });

  it('should not close dialog when apply() is called on invalid form', () => {
    component.form.get('practice')!.setValue(null);
    component.apply();
    expect(mockRef.close).not.toHaveBeenCalled();
  });

  it('clear() should reset form to defaults and track analytics', () => {
    component.form.patchValue({ practice: 'Main St', rag: 'red' });
    component.clear();
    expect(component.form.get('practice')!.value).toBe('All');
    expect(component.form.get('rag')!.value).toBe('All');
    expect(component.form.get('timeframe')!.value).toBe('Past month');
    expect(mockAnalytics.track).toHaveBeenCalledWith('kpi_filter_cleared_in_dialog', jasmine.any(Object));
  });

  it('close() should close dialog without value', () => {
    component.close();
    expect(mockRef.close).toHaveBeenCalledWith();
  });

  it('timeframe$ should emit the current timeframe on subscribe', (done) => {
    component.timeframe$.subscribe(value => {
      expect(value).toBe('Past month');
      done();
    });
  });

  it('form provider field should not be required', () => {
    component.form.get('provider')!.setValue(null);
    expect(component.form.get('provider')!.valid).toBeTrue();
  });

  it('should use null defaults when data fields are null/undefined', async () => {
    await TestBed.resetTestingModule();
    const emptyData = {} as KpiFilters;
    await TestBed.configureTestingModule({
      declarations: [KpiFilterDialogComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [ReactiveFormsModule, NoopAnimationsModule, MatSelectModule, MatInputModule],
      providers: [
        { provide: MatDialogRef, useValue: mockRef },
        { provide: MAT_DIALOG_DATA, useValue: emptyData },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    }).compileComponents();

    const fix = TestBed.createComponent(KpiFilterDialogComponent);
    const comp = fix.componentInstance;
    fix.detectChanges();

    expect(comp.form.get('practice')!.value).toBe('All');
    expect(comp.form.get('timeframe')!.value).toBe('Past month');
    expect(comp.form.get('rag')!.value).toBe('All');
  });
});
