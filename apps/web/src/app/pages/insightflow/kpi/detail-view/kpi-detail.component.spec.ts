import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { KpiDetailComponent } from './kpi-detail.component';
import { KpiService } from '../kpi.service';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { CsvExportService } from '../../../../core/services/csv-export.service';
import { KpiDetail, KpiItem } from '../kpi.models';

const mockKpiItem: KpiItem = {
  slug: 'test-kpi',
  title: 'Test KPI',
  value: 95,
  unit: '%',
  thresholds: { min: 80, redMax: 85, amberMax: 90, max: 100 },
  rag: 'green',
};

const mockKpiDetail: KpiDetail = {
  item: mockKpiItem,
  trendQuarterly: [
    { label: 'Q1 2025', value: 92 },
    { label: 'Q2 2025', value: 95 },
  ],
  interpretationHigh: ['All claims processed'],
  interpretationLow: ['Review denials'],
  definition: 'Percentage of claims resolved',
  improvements: ['Improve coding accuracy'],
};

describe('KpiDetailComponent', () => {
  let component: KpiDetailComponent;
  let fixture: ComponentFixture<KpiDetailComponent>;
  let mockKpiService: jasmine.SpyObj<KpiService>;
  let mockLocation: jasmine.SpyObj<Location>;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockAnalytics: jasmine.SpyObj<AnalyticsService>;
  let mockCsvExport: jasmine.SpyObj<CsvExportService>;

  beforeEach(async () => {
    mockKpiService = jasmine.createSpyObj('KpiService', ['getList', 'getDetail']);
    mockKpiService.getDetail.and.returnValue(of(mockKpiDetail));

    mockLocation = jasmine.createSpyObj('Location', ['back']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue({ afterClosed: () => of(undefined) } as MatDialogRef<any>);
    mockAnalytics = jasmine.createSpyObj('AnalyticsService', ['track']);
    mockCsvExport = jasmine.createSpyObj('CsvExportService', ['download']);

    await TestBed.configureTestingModule({
      declarations: [KpiDetailComponent],
      providers: [
        { provide: KpiService, useValue: mockKpiService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ slug: 'test-kpi' })),
            snapshot: { paramMap: convertToParamMap({ slug: 'test-kpi' }) },
          },
        },
        { provide: Location, useValue: mockLocation },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: CsvExportService, useValue: mockCsvExport },
        { provide: MatSnackBar, useValue: { open: () => {} } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should track page_view on ngOnInit', () => {
    expect(mockAnalytics.track).toHaveBeenCalledWith('page_view', { page: 'kpi_detail', slug: 'test-kpi' });
  });

  it('should track page_exit on ngOnDestroy', () => {
    component.ngOnDestroy();
    expect(mockAnalytics.track).toHaveBeenCalledWith('page_exit', jasmine.objectContaining({ page: 'kpi_detail', slug: 'test-kpi' }));
  });

  it('should navigate back on back()', () => {
    component.back();
    expect(mockLocation.back).toHaveBeenCalled();
  });

  it('should track back click on back()', () => {
    component.back();
    expect(mockAnalytics.track).toHaveBeenCalledWith('kpi_detail_back_clicked', { slug: 'test-kpi' });
  });

  it('should open filter dialog on openFilters()', () => {
    component.openFilters();
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('should compute markerPosition within 0-100', () => {
    const pos = component.markerPosition(mockKpiItem);
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThanOrEqual(100);
  });

  it('should return 0 for markerPosition when value is null', () => {
    const item = { ...mockKpiItem, value: null as any };
    expect(component.markerPosition(item)).toBe(0);
  });

  it('should map quarterly trend points', () => {
    const result = component.mapQuarterlyTrend(mockKpiDetail.trendQuarterly);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ date: 'Q1 2025', value: 92 });
  });

  it('should return empty array for mapQuarterlyTrend with null input', () => {
    expect(component.mapQuarterlyTrend(null)).toEqual([]);
  });

  it('should return quarter categories as labels', () => {
    const cats = component.quarterCategories(mockKpiDetail.trendQuarterly);
    expect(cats).toEqual(['Q1 2025', 'Q2 2025']);
  });

  it('should return empty array for quarterCategories with null', () => {
    expect(component.quarterCategories(null)).toEqual([]);
  });

  it('should build quarterSeries from trend points', () => {
    const series = component.quarterSeries(mockKpiDetail.trendQuarterly);
    expect(series.length).toBe(1);
    expect(series[0].name).toBe('Quarterly');
    expect(series[0].data).toEqual([92, 95]);
  });

  it('should call csvExport.download on exportTrend()', async () => {
    await component.exportTrend();
    expect(mockCsvExport.download).toHaveBeenCalledWith(
      jasmine.stringContaining('kpi-test-kpi-trend_'),
      ['Period', 'Value'],
      jasmine.any(Array)
    );
  });
});
