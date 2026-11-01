import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { KpiComponent } from './kpi.component';
import { KpiService } from '../kpi.service';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { CsvExportService } from '../../../../core/services/csv-export.service';
import { GlobalFiltersStore } from '../../../../shared/components/global-filters/global-filters.store';

describe('KpiComponent', () => {
  let component: KpiComponent;
  let fixture: ComponentFixture<KpiComponent>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockKpiService = {
    getList: jasmine.createSpy('getList').and.returnValue(of([
      {
        slug: 'denial-rate',
        title: 'Denial Rate',
        value: 5.2,
        unit: '%',
        rag: 'green',
        benchmark: 5.0,
        thresholds: { min: 0, max: 20, redMax: 10, amberMax: 7 },
      },
    ])),
  };

  const mockDialog = {
    open: jasmine.createSpy('open').and.returnValue({
      afterClosed: () => of(undefined),
    }),
  };

  beforeEach(async () => {
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [KpiComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: KpiService, useValue: mockKpiService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} }, params: of({}) } },
        { provide: AnalyticsService, useValue: { track: () => {} } },
        { provide: CsvExportService, useValue: { download: () => {} } },
        { provide: GlobalFiltersStore, useValue: { value: { location: { scope: 'all' }, payers: [], providers: [] }, applied$: of({ location: { scope: 'all' }, payers: [], providers: [] }) } },
      ],
    })
    .overrideComponent(KpiComponent, { set: { template: '<div></div>' } })
    .compileComponents();

    fixture = TestBed.createComponent(KpiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    fixture.detectChanges(); // stabilize after synchronous observable chain in ngOnInit
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default filters', () => {
    const f = component.filters$.value;
    expect(f.practice).toBe('All');
    expect(f.location).toBe('All');
    expect(f.timeframe).toBe('Past 12 months');
    expect(f.rag).toBe('All');
  });

  it('should have default tabIndex of 0', () => {
    expect(component.tabIndex).toBe(0);
  });

  it('clearAll should reset filters and tabIndex', () => {
    component.tabIndex = 1;
    component.filters$.next({ practice: 'Test', location: 'X', provider: 'Dr.A', timeframe: 'YTD', rag: 'red' });
    component.clearAll();
    expect(component.tabIndex).toBe(0);
    expect(component.filters$.value.practice).toBe('All');
    expect(component.filters$.value.timeframe).toBe('Past 12 months');
  });

  it('onTabChange should update tabIndex and filters timeframe', () => {
    component.onTabChange(1);
    expect(component.tabIndex).toBe(1);
    expect(component.filters$.value.timeframe).toBe('YTD');

    component.onTabChange(0);
    expect(component.tabIndex).toBe(0);
    expect(component.filters$.value.timeframe).toBe('Past 12 months');
  });

  it('viewDetails should navigate to the kpi slug', () => {
    const item = { slug: 'denial-rate', title: 'Denial Rate', value: 5, rag: 'green', thresholds: { min: 0, max: 20, redMax: 10, amberMax: 7 } } as any;
    component.viewDetails(item);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['denial-rate'], jasmine.any(Object));
  });

  it('openFilters should open the dialog', () => {
    component.openFilters();
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('markerPosition should clamp values between 0 and 100', () => {
    const item = { value: 50, thresholds: { min: 0, max: 100, redMax: 80, amberMax: 60 } } as any;
    expect(component.markerPosition(item)).toBe(50);
  });

  it('markerPosition should return 0 for null value', () => {
    const item = { value: null, thresholds: { min: 0, max: 100, redMax: 80, amberMax: 60 } } as any;
    expect(component.markerPosition(item)).toBe(0);
  });

  it('markerPosition should clamp to 100 for values exceeding max', () => {
    const item = { value: 200, thresholds: { min: 0, max: 100, redMax: 80, amberMax: 60 } } as any;
    expect(component.markerPosition(item)).toBe(100);
  });

  // -- applyGlobalFilters via globalFiltersStore ----------------------------

  it('applyGlobalFilters with group scope sets practice to first group', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'group', groups: ['East Group'] },
      providers: [],
      payers: [],
      startDate: null,
      endDate: null,
    });
    expect(component.filters$.value.practice).toBe('East Group');
  });

  it('applyGlobalFilters with practice scope sets practice to first practice', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'practice', practices: ['Main Clinic'] },
      providers: [],
      payers: [],
      startDate: null,
      endDate: null,
    });
    expect(component.filters$.value.practice).toBe('Main Clinic');
  });

  it('applyGlobalFilters with location scope sets location to first location', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'location', locations: ['New York Office'] },
      providers: [],
      payers: [],
      startDate: null,
      endDate: null,
    });
    expect(component.filters$.value.location).toBe('New York Office');
  });

  it('applyGlobalFilters with providers sets provider to first provider', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'all' },
      providers: ['Dr. Smith', 'Dr. Jones'],
      payers: [],
      startDate: null,
      endDate: null,
    });
    expect(component.filters$.value.provider).toBe('Dr. Smith');
  });

  it('applyGlobalFilters with payers sets payer array', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'all' },
      providers: [],
      payers: ['Aetna', 'BCBS'],
      startDate: null,
      endDate: null,
    });
    expect(component.filters$.value.payer).toEqual(['Aetna', 'BCBS']);
  });

  it('applyGlobalFilters with startDate sets from and timeframe Custom', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'all' },
      providers: [],
      payers: [],
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
    });
    expect(component.filters$.value.timeframe).toBe('Custom');
    expect(component.filters$.value.from).toBe('2025-01-01');
    expect(component.filters$.value.to).toBe('2025-12-31');
  });

  it('applyGlobalFilters with no date clears from/to', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'all' },
      providers: [],
      payers: [],
      startDate: null,
      endDate: null,
    });
    expect(component.filters$.value.from).toBeUndefined();
    expect(component.filters$.value.to).toBeUndefined();
    expect(component.filters$.value.timeframe).toBe('Past 12 months');
  });

  it('applyGlobalFilters with empty groups falls back to All', () => {
    (component as any).applyGlobalFilters({
      location: { scope: 'group', groups: [] },
      providers: [],
      payers: [],
      startDate: null,
      endDate: null,
    });
    expect(component.filters$.value.practice).toBe('All');
  });

  // -- exportKpis ----------------------------------------------------------

  it('exportKpis calls csvExport.download with kpi rows', async () => {
    const mockCsvExport = TestBed.inject(CsvExportService) as jasmine.SpyObj<CsvExportService>;
    spyOn(mockCsvExport, 'download');
    await component.exportKpis();
    expect(mockCsvExport.download).toHaveBeenCalled();
  });

  // -- openFilters afterClosed returns a value -----------------------------

  it('openFilters with dialog returning YTD filters should set tabIndex to 1', () => {
    const ytdFilters = { practice: 'All', location: 'All', timeframe: 'YTD', rag: 'All' };
    mockDialog.open.and.returnValue({
      afterClosed: () => of(ytdFilters),
    });
    component.openFilters();
    expect(component.tabIndex).toBe(1);
    expect(component.filters$.value.timeframe).toBe('YTD');
  });

  it('openFilters with dialog returning non-YTD filters sets tabIndex to 0', () => {
    const customFilters = { practice: 'All', location: 'All', timeframe: 'Custom', rag: 'All' };
    mockDialog.open.and.returnValue({
      afterClosed: () => of(customFilters),
    });
    component.openFilters();
    expect(component.tabIndex).toBe(0);
  });

  it('openFilters with dialog returning undefined does not update filters', () => {
    const originalFilters = { ...component.filters$.value };
    mockDialog.open.and.returnValue({
      afterClosed: () => of(undefined),
    });
    component.openFilters();
    expect(component.filters$.value.practice).toBe(originalFilters.practice);
  });

  // -- ngOnDestroy analytics tracking -------------------------------------

  it('ngOnDestroy tracks page_exit event', () => {
    const analyticsService = TestBed.inject(AnalyticsService);
    spyOn(analyticsService, 'track');
    component.ngOnDestroy();
    expect(analyticsService.track).toHaveBeenCalledWith('page_exit', jasmine.any(Object));
  });

  // -- markerPosition edge cases -------------------------------------------

  it('markerPosition handles min === max (denom=0)', () => {
    const item = { value: 5, thresholds: { min: 5, max: 5, redMax: 5, amberMax: 5 } } as any;
    // Should use denom=1 as fallback (max-min=0 || 1)
    expect(component.markerPosition(item)).toBe(0);
  });

  it('markerPosition clamps negative to 0', () => {
    const item = { value: -10, thresholds: { min: 0, max: 100, redMax: 80, amberMax: 60 } } as any;
    expect(component.markerPosition(item)).toBe(0);
  });
});
