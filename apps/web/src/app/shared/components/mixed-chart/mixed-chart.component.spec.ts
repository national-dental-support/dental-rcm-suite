import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MixedChartComponent } from './mixed-chart.component';
import { ThemeService } from '../../../core/services/theme.service';
import { RpMixedChartConfig } from './mixed-chart.models';

describe('MixedChartComponent', () => {
  let component: MixedChartComponent;
  let fixture: ComponentFixture<MixedChartComponent>;
  let themeColors$: BehaviorSubject<string[]>;

  const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const basicCfg: RpMixedChartConfig = {
    categories: ['Jan', 'Feb', 'Mar'],
    series: [
      { name: 'Revenue', type: 'column', data: [100, 200, 300] },
      { name: 'Trend', type: 'line', data: [50, 60, 70] },
    ],
  };

  beforeEach(() => {
    themeColors$ = new BehaviorSubject<string[]>(defaultColors);

    TestBed.configureTestingModule({
      declarations: [MixedChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ThemeService, useValue: { chartColors$: themeColors$ } },
      ],
    });

    fixture = TestBed.createComponent(MixedChartComponent);
    component = fixture.componentInstance;
    component.cfg = basicCfg;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---
  it('should subscribe to theme colors on init', () => {
    expect(component.colors.length).toBeGreaterThan(0);
  });

  it('should rebuild options when theme changes', () => {
    const newColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
    themeColors$.next(newColors);
    expect(component.colors).toEqual(newColors);
  });

  // --- ngOnChanges ---
  it('should rebuild options when cfg changes', () => {
    const newCfg: RpMixedChartConfig = {
      categories: ['Q1', 'Q2'],
      series: [{ name: 'Sales', type: 'column', data: [10, 20] }],
    };
    component.cfg = newCfg;
    component.ngOnChanges({
      cfg: new SimpleChange(basicCfg, newCfg, false),
    });
    expect(component.xaxis.categories).toEqual(['Q1', 'Q2']);
  });

  it('should not rebuild for unrelated changes', () => {
    spyOn(component as any, 'rebuildOptions');
    component.ngOnChanges({
      title: new SimpleChange('Old', 'New', false),
    });
    expect((component as any).rebuildOptions).not.toHaveBeenCalled();
  });

  // --- ngOnDestroy ---
  it('should unsubscribe from theme on destroy', () => {
    component.ngOnDestroy();
    expect((component as any).themeSub?.closed).toBeTrue();
  });

  // --- series mapping ---
  it('should map series with correct types', () => {
    expect(component.series.length).toBe(2);
    expect(component.series[0].type).toBe('column');
    expect(component.series[1].type).toBe('line');
  });

  it('should add group to column series', () => {
    expect((component.series[0] as any).group).toBe('bar-stack');
  });

  it('should not add group to line series', () => {
    expect((component.series[1] as any).group).toBeUndefined();
  });

  it('should replace undefined data values with null', () => {
    component.cfg = {
      categories: ['A'],
      series: [{ name: 'Test', type: 'line', data: [undefined as any] }],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.series[0].data[0]).toBeNull();
  });

  // --- chart configuration ---
  it('should set chart type to line', () => {
    expect(component.chart.type).toBe('line');
  });

  it('should set stacked when 2+ column series', () => {
    component.cfg = {
      categories: ['A'],
      series: [
        { name: 'S1', type: 'column', data: [10] },
        { name: 'S2', type: 'column', data: [20] },
      ],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect((component.chart as any).stacked).toBeTrue();
  });

  it('should respect caller stacked override', () => {
    component.cfg = {
      categories: ['A'],
      series: [{ name: 'S1', type: 'column', data: [10] }],
      chart: { stacked: true },
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect((component.chart as any).stacked).toBeTrue();
  });

  it('should set stackOnlyBar', () => {
    expect((component.chart as any).stackOnlyBar).toBeTrue();
  });

  // --- colors ---
  it('should use theme colors when no cfg.colors', () => {
    expect(component.colors).toEqual(defaultColors);
  });

  it('should use cfg.colors when provided', () => {
    const custom = ['#111', '#222'];
    component.cfg = { ...basicCfg, colors: custom };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.colors[0]).toBe('#111');
  });

  it('should cycle colors when fewer than series count', () => {
    component.cfg = {
      categories: ['A'],
      series: [
        { name: 'S1', type: 'column', data: [10] },
        { name: 'S2', type: 'column', data: [20] },
        { name: 'S3', type: 'line', data: [30] },
      ],
      colors: ['#aaa', '#bbb'],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.colors.length).toBe(3);
    expect(component.colors[2]).toBe('#aaa'); // cycled
  });

  // --- hasAnyData ---
  it('should set hasAnyData true when data has values', () => {
    expect(component.hasAnyData).toBeTrue();
  });

  it('should set hasAnyData false for empty series', () => {
    component.cfg = { categories: [], series: [] };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.hasAnyData).toBeFalse();
  });

  it('should set hasAnyData false when all data is null', () => {
    component.cfg = {
      categories: ['A'],
      series: [{ name: 'S1', type: 'line', data: [null, null] }],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.hasAnyData).toBeFalse();
  });

  // --- xaxis ---
  it('should set xaxis categories', () => {
    expect(component.xaxis.categories).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('should limit tickAmount to 12', () => {
    const cats = Array.from({ length: 20 }, (_, i) => `M${i}`);
    component.cfg = { categories: cats, series: [{ name: 'S', type: 'line', data: cats.map(() => 1) }] };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.xaxis.tickAmount).toBe(12);
  });

  // --- plotOptions ---
  it('should set bar plotOptions defaults', () => {
    expect(component.plotOptions.bar!.horizontal).toBeFalse();
    expect(component.plotOptions.bar!.columnWidth).toBe('26%');
  });

  it('should allow cfg to override bar plotOptions', () => {
    component.cfg = { ...basicCfg, plotOptions: { bar: { columnWidth: '50%' } } };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.plotOptions.bar!.columnWidth).toBe('50%');
  });

  // --- stroke ---
  it('should set stroke width 0 for columns, 3 for lines', () => {
    expect(component.stroke.width).toEqual([0, 3]);
  });

  it('should set dashArray to all zeros', () => {
    expect((component.stroke as any).dashArray).toEqual([0, 0]);
  });

  // --- markers ---
  it('should set marker size to 0 for all series', () => {
    expect(component.markers.size).toEqual([0, 0]);
  });

  // --- yAxis ---
  it('should use default single yaxis when none provided', () => {
    component.cfg = {
      categories: ['A'],
      series: [{ name: 'S1', type: 'column', data: [10] }],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    const yaxis = component.yaxis;
    if (Array.isArray(yaxis)) {
      expect(yaxis.length).toBeGreaterThanOrEqual(1);
    } else {
      expect(yaxis).toBeTruthy();
    }
  });

  it('should bind series to dual axes when caller provides 2', () => {
    component.cfg = {
      ...basicCfg,
      yAxis: [
        { title: { text: 'Amount' } } as any,
        { title: { text: 'Count' }, opposite: true } as any,
      ],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    const yaxis = component.yaxis as any[];
    expect(yaxis.length).toBe(2);
    expect(yaxis[0].seriesName).toContain('Revenue');
    expect(yaxis[1].seriesName).toContain('Trend');
  });

  // --- bindSeriesToDualAxes edge cases ---
  it('should not modify single yaxis', () => {
    const result = (component as any).bindSeriesToDualAxes(
      { decimalsInFloat: 0 },
      basicCfg.series
    );
    expect(Array.isArray(result)).toBeFalse();
  });

  it('should not modify when all series are same type', () => {
    const result = (component as any).bindSeriesToDualAxes(
      [{}, {}],
      [{ name: 'S1', type: 'column', data: [1] }, { name: 'S2', type: 'column', data: [2] }]
    );
    // Returns unchanged since there are no line series
    expect(result.length).toBe(2);
  });

  // --- tooltip ---
  it('should have shared tooltip', () => {
    expect(component.tooltip.shared).toBeTrue();
  });

  it('tooltip y formatter should format currency', () => {
    component.cfg = {
      ...basicCfg,
      seriesFormats: ['currency', 'number'],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    const fmt = (component.tooltip.y as any).formatter!;
    const result = fmt(1234, { seriesIndex: 0 } as any);
    expect(result).toContain('1,234');
  });

  it('tooltip y formatter should format percent', () => {
    component.cfg = {
      ...basicCfg,
      seriesFormats: ['percent'],
    };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    const fmt = (component.tooltip.y as any).formatter!;
    const result = fmt(0.85, { seriesIndex: 0 } as any);
    expect(result).toContain('85.0%');
  });

  it('tooltip y formatter should return empty for NaN', () => {
    const fmt = (component.tooltip.y as any).formatter!;
    expect(fmt(NaN, { seriesIndex: 0 } as any)).toBe('');
  });

  it('tooltip y formatter should return empty for null', () => {
    const fmt = (component.tooltip.y as any).formatter!;
    expect(fmt(null as any, { seriesIndex: 0 } as any)).toBe('');
  });

  it('tooltip x formatter should return category', () => {
    const xFmt = (component.tooltip as any).x.formatter;
    expect(xFmt(undefined, { dataPointIndex: 1 })).toBe('Feb');
  });

  it('tooltip x formatter should return empty for out-of-range index', () => {
    const xFmt = (component.tooltip as any).x.formatter;
    expect(xFmt(undefined, { dataPointIndex: 99 })).toBe('');
  });

  // --- formatValue ---
  it('formatValue should handle none format', () => {
    const result = (component as any).formatValue(42, 'none');
    expect(result).toBe('42');
  });

  it('formatValue should handle number format', () => {
    const result = (component as any).formatValue(12345, 'number');
    expect(result).toContain('12,345');
  });

  // --- computeHasAnyData ---
  it('computeHasAnyData should return false for null series', () => {
    expect((component as any).computeHasAnyData(null)).toBeFalse();
  });

  it('computeHasAnyData should return false for series with no data', () => {
    expect((component as any).computeHasAnyData([{ name: 'S', type: 'line', data: [] }])).toBeFalse();
  });

  // --- niceStep ---
  it('niceStep should return 1 for 0', () => {
    expect((component as any).niceStep(0)).toBe(1);
  });

  it('niceStep should return nice values', () => {
    expect((component as any).niceStep(1.5)).toBe(2);
    expect((component as any).niceStep(3)).toBe(5);
    expect((component as any).niceStep(7)).toBe(10);
    expect((component as any).niceStep(0.8)).toBe(1);
  });

  it('niceStep should handle Infinity', () => {
    expect((component as any).niceStep(Infinity)).toBe(1);
  });

  // --- applyDynamicLineAxisBounds ---
  it('should not modify single axis', () => {
    const result = (component as any).applyDynamicLineAxisBounds({ min: 0 }, [], []);
    expect(result).toEqual({ min: 0 });
  });

  it('should handle flat line case', () => {
    const axes = [{}, {}];
    const series = [
      { name: 'S1', type: 'column', data: [10] },
      { name: 'S2', type: 'line', data: [50, 50, 50] },
    ];
    const result = (component as any).applyDynamicLineAxisBounds(axes, series, [1]);
    expect(result[1].min).toBeDefined();
    expect(result[1].max).toBeDefined();
    expect(result[1].min).toBeLessThan(result[1].max);
  });

  it('should set proper bounds for varying line data', () => {
    const axes = [{}, {}];
    const series = [
      { name: 'S1', type: 'column', data: [10] },
      { name: 'S2', type: 'line', data: [100, 200, 300] },
    ];
    const result = (component as any).applyDynamicLineAxisBounds(axes, series, [1]);
    expect(result[1].min).toBeLessThanOrEqual(100);
    expect(result[1].max).toBeGreaterThanOrEqual(300);
  });

  // --- debug mode ---
  it('should log debug info when debug is true', () => {
    spyOn(console, 'log');
    component.debug = true;
    component.cfg = basicCfg;
    component.ngOnChanges({ cfg: new SimpleChange(null, basicCfg, true) });
    expect(console.log).toHaveBeenCalled();
  });

  // --- legend ---
  it('should set legend position to top', () => {
    expect(component.legend.position).toBe('top');
  });

  // --- grid ---
  it('should set grid strokeDashArray', () => {
    expect(component.grid.strokeDashArray).toBe(3);
  });

  // --- fill ---
  it('should set fill opacity', () => {
    expect(component.fill.opacity).toBeDefined();
  });

  // --- height ---
  it('should use default height of 320', () => {
    expect(component.chart.height).toBe(320);
  });

  it('should use cfg height when provided', () => {
    component.cfg = { ...basicCfg, height: 500 };
    component.ngOnChanges({ cfg: new SimpleChange(null, component.cfg, true) });
    expect(component.chart.height).toBe(500);
  });

  // --- null cfg handling ---
  it('should handle null cfg gracefully', () => {
    component.cfg = null as any;
    expect(() => {
      (component as any).rebuildOptions();
    }).not.toThrow();
  });
});
