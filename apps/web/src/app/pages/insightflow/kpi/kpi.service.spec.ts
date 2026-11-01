import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { KpiService } from './kpi.service';
import { KpiFilters, KpiItem, KpiDetail } from './kpi.models';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const mockFilters: KpiFilters = {
  practice: 'All',
  location: 'All',
  provider: null,
  timeframe: 'Past month',
  rag: 'All',
};

const mockKpiItem: KpiItem = {
  slug: 'gross-collection',
  title: 'Gross Collection %',
  value: 97,
  unit: '%',
  thresholds: { min: 80, redMax: 85, amberMax: 90, max: 100 },
  rag: 'green',
};

const mockKpiDetail: KpiDetail = {
  item: mockKpiItem,
  trendQuarterly: [{ label: 'Q1 2025', value: 95 }],
  interpretationHigh: ['Good'],
  interpretationLow: ['Bad'],
  definition: 'Test definition',
  improvements: ['Improve billing'],
};

describe('KpiService', () => {
  let service: KpiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [KpiService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(KpiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getList', () => {
    it('should POST to /api/analytics/kpis/list with filters', () => {
      service.getList(mockFilters).subscribe(result => {
        expect(result).toEqual([mockKpiItem]);
      });

      const req = httpMock.expectOne('/api/analytics/kpis/list');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(mockFilters);
      req.flush([mockKpiItem]);
    });

    it('should return an array of KpiItems', () => {
      let items: KpiItem[] = [];
      service.getList(mockFilters).subscribe(r => (items = r));

      const req = httpMock.expectOne('/api/analytics/kpis/list');
      req.flush([mockKpiItem]);
      expect(items.length).toBe(1);
      expect(items[0].slug).toBe('gross-collection');
    });
  });

  describe('getDetail', () => {
    it('should POST to /api/analytics/kpis/detail/:slug with filters', () => {
      service.getDetail('gross-collection', mockFilters).subscribe(result => {
        expect(result).toEqual(mockKpiDetail);
      });

      const req = httpMock.expectOne('/api/analytics/kpis/detail/gross-collection');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(mockFilters);
      req.flush(mockKpiDetail);
    });

    it('should encode the slug in the URL', () => {
      service.getDetail('test-slug', mockFilters).subscribe();

      const req = httpMock.expectOne('/api/analytics/kpis/detail/test-slug');
      expect(req.request.url).toContain('test-slug');
      req.flush(mockKpiDetail);
    });
  });
});
