import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { IndustryBenchmarkingComponent } from './industry-benchmarking.component';
import { InsightflowStore } from '../../../store/insightflow/insightflow.store';

describe('IndustryBenchmarkingComponent', () => {
  let component: IndustryBenchmarkingComponent;
  let fixture: ComponentFixture<IndustryBenchmarkingComponent>;

  const mockComparisons = [
    { metric: 'denial-rate', label: 'Denial Rate', practiceValue: 5.2, industryAvg: 7.1, industryTop25: 4.0, unit: '%', higherIsBetter: false, percentile: 80 },
    { metric: 'days-in-ar', label: 'Days in AR', practiceValue: 45, industryAvg: 38, industryTop25: 30, unit: 'days', higherIsBetter: false, percentile: 35 },
    { metric: 'collection-rate', label: 'Collection Rate', practiceValue: 92, industryAvg: 88, industryTop25: 95, unit: '%', higherIsBetter: true, percentile: 72 },
  ];

  const mockStore = {
    benchmarking$: of({
      data: { comparisons: mockComparisons, generatedAt: '2026-03-12T12:00:00Z' },
      loading: false,
      error: null,
      cachedAt: Date.now(),
    }),
    loadBenchmarking: jasmine.createSpy('loadBenchmarking'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [IndustryBenchmarkingComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: InsightflowStore, useValue: mockStore },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IndustryBenchmarkingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load benchmarking data from store', () => {
    expect(mockStore.loadBenchmarking).toHaveBeenCalled();
    expect(component.comparisons.length).toBe(3);
    expect(component.loading).toBeFalse();
  });

  it('should set generatedAt from store data', () => {
    expect(component.generatedAt).toBe('2026-03-12T12:00:00Z');
  });

  it('getPerformanceColor should return green for top quartile', () => {
    expect(component.getPerformanceColor(mockComparisons[0] as any)).toBe('#00e676');
  });

  it('getPerformanceColor should return orange for above average', () => {
    expect(component.getPerformanceColor(mockComparisons[2] as any)).toBe('#ffb74d');
  });

  it('getPerformanceColor should return red for below average', () => {
    expect(component.getPerformanceColor(mockComparisons[1] as any)).toBe('#ff5252');
  });

  it('getPerformanceLabel should return Top Quartile for 75+', () => {
    expect(component.getPerformanceLabel(mockComparisons[0] as any)).toBe('Top Quartile');
  });

  it('getPerformanceLabel should return Above Average for 50-74', () => {
    expect(component.getPerformanceLabel(mockComparisons[2] as any)).toBe('Above Average');
  });

  it('getPerformanceLabel should return Below Average for 25-49', () => {
    expect(component.getPerformanceLabel(mockComparisons[1] as any)).toBe('Below Average');
  });

  it('getPerformanceLabel should return Bottom Quartile for <25', () => {
    const low = { percentile: 10 } as any;
    expect(component.getPerformanceLabel(low)).toBe('Bottom Quartile');
  });

  it('formatValue should format percentages', () => {
    expect(component.formatValue(5.23, '%')).toBe('5.2%');
  });

  it('formatValue should format currency', () => {
    expect(component.formatValue(1234, '$')).toContain('$');
  });

  it('formatValue should format days', () => {
    expect(component.formatValue(45, 'days')).toBe('45 days');
  });

  it('formatValue should return toString for unknown units', () => {
    expect(component.formatValue(42, 'other')).toBe('42');
  });
});

describe('IndustryBenchmarkingComponent \u2014 no data state', () => {
  let component: IndustryBenchmarkingComponent;
  let fixture: ComponentFixture<IndustryBenchmarkingComponent>;

  const mockStoreNoData = {
    benchmarking$: of({ data: null, loading: true, error: null, cachedAt: null }),
    loadBenchmarking: jasmine.createSpy('loadBenchmarking'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [IndustryBenchmarkingComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: InsightflowStore, useValue: mockStoreNoData },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IndustryBenchmarkingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should handle null data slice (if arm1 \u2014 slice.data is falsy)', () => {
    // When slice.data is null, the if(slice.data) block is skipped
    expect(component.loading).toBeTrue();
    expect(component.comparisons).toEqual([]);
  });
});
