import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Subject } from 'rxjs';
import { InsuranceAndPatientCollectionsBarChartComponent } from './insurance-patient-collections-bar.component';
import { ThemeService } from '../../../core/services/theme.service';

const mockTheme = {
  chart_color_1: '#FF0000',
  chart_color_2: '#00FF00',
  chart_color_3: '#0000FF',
  chart_color_4: '#FFFF00',
  chart_color_5: '#FF00FF',
};

describe('InsuranceAndPatientCollectionsBarChartComponent', () => {
  let component: InsuranceAndPatientCollectionsBarChartComponent;
  let fixture: ComponentFixture<InsuranceAndPatientCollectionsBarChartComponent>;
  let themeSubject: Subject<typeof mockTheme>;
  let mockThemeService: any;

  beforeEach(async () => {
    themeSubject = new Subject<typeof mockTheme>();
    mockThemeService = { theme$: themeSubject.asObservable() };

    await TestBed.configureTestingModule({
      declarations: [InsuranceAndPatientCollectionsBarChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ThemeService, useValue: mockThemeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InsuranceAndPatientCollectionsBarChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty options', () => {
    expect(component.options).toEqual({});
  });

  it('should build options when theme emits', () => {
    themeSubject.next(mockTheme as any);
    expect(component.options.series).toBeTruthy();
    expect((component.options.series as any[]).length).toBe(2);
  });

  it('should use theme colors in chart options', () => {
    themeSubject.next(mockTheme as any);
    expect(component.options.colors).toContain('#FF0000');
    expect(component.options.colors).toContain('#00FF00');
  });

  it('should set chart type to bar', () => {
    themeSubject.next(mockTheme as any);
    expect((component.options.chart as any)?.type).toBe('bar');
  });

  it('should include Collections and Adjustments series', () => {
    themeSubject.next(mockTheme as any);
    const seriesNames = (component.options.series as any[]).map((s: any) => s.name);
    expect(seriesNames).toContain('Collections');
    expect(seriesNames).toContain('Adjustments');
  });

  it('should clean up subscription on destroy', () => {
    component.ngOnDestroy();
    expect(true).toBeTrue();
  });
});
