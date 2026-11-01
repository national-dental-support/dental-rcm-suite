import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PieChartComponent } from './pie-chart.component';
import { ThemeService } from '../../../core/services/theme.service';

describe('PieChartComponent', () => {
  let component: PieChartComponent;
  let fixture: ComponentFixture<PieChartComponent>;
  let chartColors$: BehaviorSubject<string[]>;

  beforeEach(async () => {
    chartColors$ = new BehaviorSubject(['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']);

    await TestBed.configureTestingModule({
      declarations: [PieChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: ThemeService,
          useValue: { chartColors$ },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PieChartComponent);
    component = fixture.componentInstance;
    component.data = [
      { label: 'Slice A', value: 40 },
      { label: 'Slice B', value: 60 },
    ];
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- data setter with object array ------------------------------------------

  it('should set series and labels from object array', () => {
    component.data = [{ label: 'Alpha', value: 100 }, { label: 'Beta', value: 200 }];
    expect(component.labels).toEqual(['Alpha', 'Beta']);
    expect(component.series).toEqual([100, 200]);
  });

  it('should handle null label in object array', () => {
    component.data = [{ label: null, value: 50 }];
    expect(component.labels[0]).toBe('');
  });

  it('should handle null value in object array', () => {
    component.data = [{ label: 'X', value: null }];
    expect(component.series[0]).toBe(0);
  });

  it('should use numeric indices as labels for non-object array', () => {
    component.data = [100, 200, 300];
    expect(component.labels).toEqual(['1', '2', '3']);
    expect(component.series).toEqual([100, 200, 300]);
  });

  it('should handle null values in flat array', () => {
    component.data = [null, 50];
    expect(component.series[0]).toBe(0);
  });

  it('should handle value.data array format', () => {
    component.data = { data: [{ label: 'Payer A', value: 500 }] };
    expect(component.labels).toEqual(['Payer A']);
    expect(component.series).toEqual([500]);
  });

  it('should handle empty array', () => {
    component.data = [];
    expect(component.labels).toEqual([]);
    expect(component.series).toEqual([]);
  });

  it('should handle null input', () => {
    component.data = null;
    expect(component.labels).toEqual([]);
    expect(component.series).toEqual([]);
  });

  // --- applyColors with Other slice -------------------------------------------

  it('should add OTHER_COLOR for last Other slice', () => {
    component.data = [
      { label: 'Aetna', value: 100 },
      { label: 'BCBS', value: 80 },
      { label: 'Other', value: 30 },
    ];
    // Last label is 'Other', so colors should have OTHER_COLOR at end
    expect(component.colors[component.colors.length - 1]).toBe('#94a3b8');
    expect(component.colors.length).toBe(3);
  });

  it('should use theme colors when no Other slice', () => {
    component.data = [
      { label: 'Aetna', value: 100 },
      { label: 'BCBS', value: 80 },
    ];
    expect(component.colors).toEqual(['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']);
  });

  it('should not treat Other as special when only one label', () => {
    component.data = [{ label: 'Other', value: 50 }];
    // labels.length === 1, so condition is false
    expect(component.colors).toEqual(['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']);
  });

  it('should update colors when theme changes', () => {
    chartColors$.next(['#aaa', '#bbb', '#ccc', '#ddd', '#eee']);
    component.data = [{ label: 'A', value: 10 }];
    expect(component.colors[0]).toBe('#aaa');
  });

  // --- legend formatter --------------------------------------------------------

  it('legend formatter should truncate long labels', () => {
    const formatter = (component as any).legend.formatter;
    const long = 'A very long payer name here';
    expect(formatter(long)).toContain('\u2026');
    expect(formatter(long).length).toBeLessThanOrEqual(21); // 18 + '...'
  });

  it('legend formatter should return short labels unchanged', () => {
    const formatter = (component as any).legend.formatter;
    expect(formatter('Short')).toBe('Short');
  });

  // --- dataLabels formatter -----------------------------------------------------

  it('dataLabels formatter should return empty for small slices', () => {
    const formatter = (component as any).dataLabels.formatter;
    const opts = { w: { globals: { seriesPercent: [3], labels: ['A'] } }, seriesIndex: 0 };
    expect(formatter(10, opts)).toBe('');
  });

  it('dataLabels formatter should return label and percent for large slices', () => {
    const formatter = (component as any).dataLabels.formatter;
    const opts = { w: { globals: { seriesPercent: [60], labels: ['Aetna'] } }, seriesIndex: 0 };
    const result = formatter(60, opts);
    expect(result).toContain('Aetna');
    expect(result).toContain('60%');
  });

  it('dataLabels formatter should handle array percent values', () => {
    const formatter = (component as any).dataLabels.formatter;
    const opts = { w: { globals: { seriesPercent: [[30, 0]], labels: ['BCBS'] } }, seriesIndex: 0 };
    const result = formatter(30, opts);
    expect(result).toContain('BCBS');
  });

  it('dataLabels formatter should return just percent when label is empty', () => {
    const formatter = (component as any).dataLabels.formatter;
    const opts = { w: { globals: { seriesPercent: [20], labels: [''] } }, seriesIndex: 0 };
    const result = formatter(20, opts);
    expect(result).toContain('20%');
    expect(result).not.toContain('\n');
  });

  it('dataLabels formatter should handle null label', () => {
    const formatter = (component as any).dataLabels.formatter;
    const opts = { w: { globals: { seriesPercent: [25], labels: [null] } }, seriesIndex: 0 };
    const result = formatter(25, opts);
    expect(result).toContain('25%');
  });

  // --- tooltip formatter --------------------------------------------------------

  it('tooltip formatter should format as currency when isCurrency is true', () => {
    component.isCurrency = true;
    const formatter = (component as any).tooltip.y.formatter;
    // Re-assign data to trigger; formatter closes over `this`
    const result = formatter.call(component, 1500.50);
    expect(result).toContain('$');
    expect(result).toContain('1,500');
  });

  it('tooltip formatter should format as number when isCurrency is false', () => {
    component.isCurrency = false;
    const formatter = (component as any).tooltip.y.formatter;
    const result = formatter.call(component, 100.5);
    expect(result).toContain('100.50');
  });

  // --- plotOptions value formatter -----------------------------------------------

  it('plotOptions value formatter should format millions with isCurrency', () => {
    component.isCurrency = true;
    const formatter = (component as any).plotOptions.pie.donut.labels.value.formatter;
    const result = formatter.call(component, '2000000');
    expect(result).toContain('M');
  });

  it('plotOptions value formatter should format thousands with isCurrency', () => {
    component.isCurrency = true;
    const formatter = (component as any).plotOptions.pie.donut.labels.value.formatter;
    const result = formatter.call(component, '5000');
    expect(result).toContain('K');
  });

  it('plotOptions value formatter should format small amounts with isCurrency', () => {
    component.isCurrency = true;
    const formatter = (component as any).plotOptions.pie.donut.labels.value.formatter;
    const result = formatter.call(component, '50');
    expect(result).toContain('$');
    expect(result).toContain('50');
  });

  it('plotOptions value formatter should use locale format when not isCurrency', () => {
    component.isCurrency = false;
    const formatter = (component as any).plotOptions.pie.donut.labels.value.formatter;
    const result = formatter.call(component, '1234.5');
    expect(result).toContain('1,234');
  });

  // --- plotOptions total formatter ------------------------------------------------

  it('plotOptions total formatter should return string number when not isCurrency', () => {
    component.isCurrency = false;
    const formatter = (component as any).plotOptions.pie.donut.labels.total.formatter;
    const w = { globals: { seriesTotals: [100, 200, 300] } };
    const result = formatter.call(component, w);
    expect(result).toBe('600');
  });

  it('plotOptions total formatter should return currency format when isCurrency', () => {
    component.isCurrency = true;
    const formatter = (component as any).plotOptions.pie.donut.labels.total.formatter;
    const w = { globals: { seriesTotals: [1000, 500] } };
    const result = formatter.call(component, w);
    expect(result).toContain('$');
  });

  // --- chart.events.dataPointSelection ------------------------------------------

  it('should emit sliceClicked when valid dataPointIndex', () => {
    component.data = [{ label: 'Aetna', value: 100 }, { label: 'BCBS', value: 50 }];
    const spy = jasmine.createSpy('sliceClicked');
    component.sliceClicked.subscribe(spy);
    const events = (component as any).chart.events;
    events.dataPointSelection({}, {}, { dataPointIndex: 0 });
    expect(spy).toHaveBeenCalledWith('Aetna');
  });

  it('should not emit sliceClicked when dataPointIndex is negative', () => {
    const spy = jasmine.createSpy('sliceClicked');
    component.sliceClicked.subscribe(spy);
    const events = (component as any).chart.events;
    events.dataPointSelection({}, {}, { dataPointIndex: -1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('should not emit sliceClicked when dataPointIndex out of range', () => {
    component.data = [{ label: 'A', value: 10 }];
    const spy = jasmine.createSpy('sliceClicked');
    component.sliceClicked.subscribe(spy);
    const events = (component as any).chart.events;
    events.dataPointSelection({}, {}, { dataPointIndex: 99 });
    expect(spy).not.toHaveBeenCalled();
  });

  // --- ngOnDestroy --------------------------------------------------------------

  it('should unsubscribe on destroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
