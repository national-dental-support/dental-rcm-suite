import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ProceduresIncreasingBarChartComponent } from './procedures-increasing-bar.component';

describe('ProceduresIncreasingBarChartComponent', () => {
  let component: ProceduresIncreasingBarChartComponent;
  let fixture: ComponentFixture<ProceduresIncreasingBarChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ProceduresIncreasingBarChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ProceduresIncreasingBarChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have options with a series', () => {
    expect(component.options.series).toBeTruthy();
    expect((component.options.series as any[]).length).toBeGreaterThan(0);
  });

  it('should have bar chart type', () => {
    expect((component.options.chart as any)?.type).toBe('bar');
  });

  it('should have horizontal bar configured', () => {
    expect((component.options.plotOptions as any)?.bar?.horizontal).toBeTrue();
  });

  it('should have data labels enabled', () => {
    expect((component.options.dataLabels as any)?.enabled).toBeTrue();
  });

  it('should have 7 data points', () => {
    const series = component.options.series as any[];
    expect(series[0].data.length).toBe(7);
  });

  it('should use green color for increasing bars', () => {
    const ranges = (component.options.plotOptions as any)?.bar?.colors?.ranges;
    expect(ranges[0].color).toBe('#75E0A8');
  });

  it('dataLabels formatter should format values correctly', () => {
    const formatter = (component.options.dataLabels as any)?.formatter;
    expect(formatter(2000)).toBe('$2.0K');
    expect(formatter(2000000)).toBe('$2.0M');
    expect(formatter(999)).toBe('$999');
  });
});
