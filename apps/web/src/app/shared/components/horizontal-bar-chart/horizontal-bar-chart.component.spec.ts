import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HorizontalBarChartComponent, HorizontalBarDatum } from './horizontal-bar-chart.component';
import { ThemeService, DEFAULT_CHART_THEME } from '../../../core/services/theme.service';

describe('HorizontalBarChartComponent', () => {
  let component: HorizontalBarChartComponent;
  let fixture: ComponentFixture<HorizontalBarChartComponent>;
  let primaryColor$: BehaviorSubject<string>;

  const sampleData: HorizontalBarDatum[] = [
    { label: 'Accepted', value: 500 },
    { label: 'Denied', value: 200 },
    { label: 'Pending', value: 1500 },
  ];

  beforeEach(async () => {
    primaryColor$ = new BehaviorSubject<string>('#3b82f6');

    await TestBed.configureTestingModule({
      declarations: [HorizontalBarChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: ThemeService,
          useValue: {
            primaryColor$: primaryColor$.asObservable(),
            snapshot: () => ({ ...DEFAULT_CHART_THEME }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HorizontalBarChartComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // --- ngOnInit: theme subscription ---
  it('should set activeBarColor from theme primaryColor$ on init', () => {
    component.data = sampleData;
    fixture.detectChanges(); // triggers ngOnInit
    expect(component.chartOptions).toBeDefined();
    expect(component.chartOptions!.colors).toEqual(['#3b82f6']);
  });

  it('should use barColor input over theme color when barColor is set', () => {
    component.data = sampleData;
    component.barColor = '#ff0000';
    fixture.detectChanges();
    expect(component.chartOptions!.colors).toEqual(['#ff0000']);
  });

  it('should update chart when theme color changes', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect(component.chartOptions!.colors).toEqual(['#3b82f6']);

    primaryColor$.next('#00ff00');
    expect(component.chartOptions!.colors).toEqual(['#00ff00']);
  });

  it('should prefer barColor input even when theme changes', () => {
    component.data = sampleData;
    component.barColor = '#ff0000';
    fixture.detectChanges();

    primaryColor$.next('#00ff00');
    // barColor takes precedence
    expect(component.chartOptions!.colors).toEqual(['#ff0000']);
  });

  // --- ngOnDestroy ---
  it('should unsubscribe from theme on destroy', () => {
    component.data = sampleData;
    fixture.detectChanges();
    const sub = (component as any).themeSub;
    expect(sub).toBeDefined();
    spyOn(sub, 'unsubscribe').and.callThrough();
    component.ngOnDestroy();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('should not throw on destroy if no subscription', () => {
    // Don't call fixture.detectChanges (no ngOnInit)
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // --- ngOnChanges ---
  it('should rebuild options when data changes', () => {
    component.data = sampleData;
    fixture.detectChanges();

    const newData = [{ label: 'New', value: 999 }];
    component.data = newData;
    component.ngOnChanges({
      data: new SimpleChange(sampleData, newData, false),
    });
    expect(component.chartOptions).toBeDefined();
    expect(component.chartOptions!.series![0].data).toEqual([999]);
  });

  it('should rebuild options when barColor changes', () => {
    component.data = sampleData;
    fixture.detectChanges();

    component.barColor = '#abcdef';
    component.ngOnChanges({
      barColor: new SimpleChange(undefined, '#abcdef', false),
    });
    expect(component.chartOptions!.colors).toEqual(['#abcdef']);
  });

  // --- buildOptions: empty/null data ---
  it('should set chartOptions to undefined when data is empty array', () => {
    component.data = [];
    fixture.detectChanges();
    expect(component.chartOptions).toBeUndefined();
  });

  it('should set chartOptions to undefined when data is null', () => {
    component.data = null;
    fixture.detectChanges();
    expect(component.chartOptions).toBeUndefined();
  });

  // --- buildOptions: chart configuration ---
  it('should create horizontal bar chart type', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect(component.chartOptions!.chart!.type).toBe('bar');
    expect(component.chartOptions!.plotOptions!.bar!.horizontal).toBeTrue();
  });

  it('should compute height from baseRowHeight * row count (min 200)', () => {
    component.data = sampleData; // 3 items
    component.baseRowHeight = 40;
    fixture.detectChanges();
    // Math.max(200, 40 * 3) = 200
    expect(component.chartOptions!.chart!.height).toBe(200);
  });

  it('should scale height for many rows', () => {
    const manyRows = Array.from({ length: 10 }, (_, i) => ({ label: `Item ${i}`, value: i * 100 }));
    component.data = manyRows;
    component.baseRowHeight = 40;
    fixture.detectChanges();
    // Math.max(200, 40 * 10) = 400
    expect(component.chartOptions!.chart!.height).toBe(400);
  });

  it('should use custom baseRowHeight', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ label: `R${i}`, value: i }));
    component.data = rows;
    component.baseRowHeight = 60;
    fixture.detectChanges();
    // Math.max(200, 60 * 8) = 480
    expect(component.chartOptions!.chart!.height).toBe(480);
  });

  // --- buildOptions: series data ---
  it('should map data values into series', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect(component.chartOptions!.series![0].data).toEqual([500, 200, 1500]);
  });

  it('should map data labels into xaxis categories', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect((component.chartOptions!.xaxis as any).categories).toEqual(['Accepted', 'Denied', 'Pending']);
  });

  it('should handle data with null/undefined values gracefully', () => {
    const badData = [
      { label: 'A', value: null },
      { label: 'B', value: undefined },
      { label: 'C', value: 100 },
    ] as any;
    component.data = badData;
    fixture.detectChanges();
    expect(component.chartOptions!.series![0].data).toEqual([0, 0, 100]);
  });

  it('should handle data with null labels', () => {
    const data = [{ label: null, value: 50 }] as any;
    component.data = data;
    fixture.detectChanges();
    expect((component.chartOptions!.xaxis as any).categories).toEqual(['']);
  });

  // --- formatShort (accessed via dataLabels formatter) ---
  it('should format currency when currency=true in dataLabels', () => {
    component.data = [{ label: 'A', value: 1500 }];
    component.currency = true;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(1500)).toBe('$1.5K');
  });

  it('should format as plain number when currency=false', () => {
    component.data = [{ label: 'A', value: 1500 }];
    component.currency = false;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(1500)).toBe('1.5K');
  });

  it('should format millions with M suffix', () => {
    component.data = [{ label: 'A', value: 2500000 }];
    component.currency = true;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(2500000)).toBe('$2.5M');
  });

  it('should format billions with B suffix', () => {
    component.data = [{ label: 'A', value: 1000000000 }];
    component.currency = false;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(1000000000)).toBe('1B');
  });

  it('should format small numbers without suffix', () => {
    component.data = [{ label: 'A', value: 42 }];
    component.currency = false;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(42)).toBe('42');
  });

  it('should strip trailing .0 before suffix', () => {
    component.data = [{ label: 'A', value: 1000 }];
    component.currency = false;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(1000)).toBe('1K'); // not '1.0K'
  });

  it('should handle 0 value', () => {
    component.data = [{ label: 'A', value: 0 }];
    component.currency = true;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(0)).toBe('$0');
  });

  it('should handle null value in formatter', () => {
    component.data = [{ label: 'A', value: 0 }];
    component.currency = true;
    fixture.detectChanges();
    const formatter = component.chartOptions!.dataLabels!.formatter as Function;
    expect(formatter(null)).toBe('$0');
  });

  // --- tooltip formatter ---
  it('tooltip formatter should format currency', () => {
    component.data = [{ label: 'A', value: 5000 }];
    component.currency = true;
    fixture.detectChanges();
    const formatter = (component.chartOptions!.tooltip as any).y.formatter as Function;
    expect(formatter(5000)).toBe('$5K');
  });

  it('tooltip formatter should format plain number', () => {
    component.data = [{ label: 'A', value: 5000 }];
    component.currency = false;
    fixture.detectChanges();
    const formatter = (component.chartOptions!.tooltip as any).y.formatter as Function;
    expect(formatter(5000)).toBe('5K');
  });

  // --- fill colors ---
  it('should set fill colors to match active bar color', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect(component.chartOptions!.fill!.colors).toEqual(['#3b82f6']);
  });

  // --- grid ---
  it('should configure grid with dashed lines', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect(component.chartOptions!.grid!.strokeDashArray).toBe(3);
  });

  // --- stroke ---
  it('should set stroke width to 0', () => {
    component.data = sampleData;
    fixture.detectChanges();
    expect(component.chartOptions!.stroke!.width).toBe(0);
  });
});
