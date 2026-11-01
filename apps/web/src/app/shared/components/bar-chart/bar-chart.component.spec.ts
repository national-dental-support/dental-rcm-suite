import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BarChartComponent, BarChartInput } from './bar-chart.component';

describe('BarChartComponent', () => {
  let component: BarChartComponent;
  let fixture: ComponentFixture<BarChartComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [BarChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(BarChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have hasData = false by default', () => {
    expect(component.hasData).toBeFalse();
  });

  it('should set hasData to true when data has non-null values', () => {
    component.data = {
      categories: ['Jan', 'Feb'],
      series: [{ name: 'Revenue', data: [100, 200] }],
    };
    expect(component.hasData).toBeTrue();
  });

  it('should set hasData to false when all data values are null', () => {
    component.data = {
      categories: ['Jan', 'Feb'],
      series: [{ name: 'Revenue', data: [null, null] }],
    };
    expect(component.hasData).toBeFalse();
  });

  it('should set series from valid data', () => {
    component.data = {
      categories: ['A', 'B'],
      series: [{ name: 'S1', data: [10, 20] }],
    };
    expect(component.series.length).toBe(1);
    expect(component.series[0].name).toBe('S1');
  });

  it('should set xaxis categories', () => {
    component.data = {
      categories: ['X', 'Y', 'Z'],
      series: [{ name: 'S', data: [1, 2, 3] }],
    };
    expect(component.xaxis.categories).toEqual(['X', 'Y', 'Z']);
  });

  it('should default type to "column" when type is unrecognized', () => {
    component.data = {
      categories: ['A'],
      series: [{ name: 'S', type: 'bar' as any, data: [1] }],
    };
    expect((component.series[0] as any).type).toBe('column');
  });

  it('should accept "line" type for series', () => {
    component.data = {
      categories: ['A'],
      series: [{ name: 'S', type: 'line', data: [5] }],
    };
    expect((component.series[0] as any).type).toBe('line');
  });

  it('should accept "column" type for series', () => {
    component.data = {
      categories: ['A'],
      series: [{ name: 'S', type: 'column', data: [5] }],
    };
    expect((component.series[0] as any).type).toBe('column');
  });

  it('should convert null and empty string data values to null', () => {
    component.data = {
      categories: ['A', 'B', 'C'],
      series: [{ name: 'S', data: [null, '', 5] as any }],
    };
    expect(component.series[0].data[0]).toBeNull();
    expect(component.series[0].data[1]).toBeNull();
    expect(component.series[0].data[2]).toBe(5);
  });

  it('should convert non-finite numbers to null', () => {
    component.data = {
      categories: ['A'],
      series: [{ name: 'S', data: ['xyz'] as any }],
    };
    expect(component.series[0].data[0]).toBeNull();
  });

  it('should generate numeric categories when none are provided', () => {
    component.data = {
      categories: [],
      series: [{ name: 'S', data: [10, 20, 30] }],
    };
    expect(component.xaxis.categories).toEqual(['1', '2', '3']);
  });

  it('should use auto-name "Series 1" when series name is missing', () => {
    component.data = {
      categories: ['A'],
      series: [{ name: null as any, data: [1] }],
    };
    expect(component.series[0].name).toBe('Series 1');
  });

  it('should handle null/undefined input gracefully', () => {
    component.data = null;
    expect(component.series).toEqual([]);
    expect(component.hasData).toBeFalse();
  });

  it('should handle empty series array', () => {
    component.data = { categories: ['A'], series: [] };
    expect(component.series).toEqual([]);
    expect(component.hasData).toBeFalse();
  });

  it('should handle empty data array in series', () => {
    component.data = { categories: ['A'], series: [{ name: 'S', data: [] }] };
    expect(component.series[0].data).toEqual([]);
    expect(component.hasData).toBeFalse();
  });

  it('should convert string numbers to numeric values', () => {
    component.data = {
      categories: ['A'],
      series: [{ name: 'S', data: ['42'] as any }],
    };
    expect(component.series[0].data[0]).toBe(42);
  });

  it('should convert null category entries to empty string', () => {
    // Exercises the x ?? '' fallback for null entries in categories (L23 binary-expr arm0)
    component.data = {
      categories: [null, 'B'] as any,
      series: [{ name: 'S', data: [1, 2] }],
    };
    expect(component.xaxis.categories[0]).toBe('');
    expect(component.xaxis.categories[1]).toBe('B');
  });

  it('should set series to empty array when series input is not an array', () => {
    // Exercises L29 cond-expr arm1: series is not an array -> fallback to []
    component.data = { categories: ['A'], series: 'invalid' as any };
    expect(component.series).toEqual([]);
    expect(component.hasData).toBeFalse();
  });
});
