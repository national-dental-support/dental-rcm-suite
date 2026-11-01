import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ProceduresDecliningBarChartComponent } from './procedures-declining-bar.component';

describe('ProceduresDecliningBarChartComponent', () => {
  let component: ProceduresDecliningBarChartComponent;
  let fixture: ComponentFixture<ProceduresDecliningBarChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ProceduresDecliningBarChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ProceduresDecliningBarChartComponent);
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

  it('should have 7 data points matching practice data', () => {
    const series = component.options.series as any[];
    expect(series[0].data.length).toBe(7);
  });

  it('dataLabels formatter should format values in K/M', () => {
    const formatter = (component.options.dataLabels as any)?.formatter;
    expect(formatter(1500)).toBe('$1.5K');
    expect(formatter(1500000)).toBe('$1.5M');
    expect(formatter(500)).toBe('$500');
  });
});
