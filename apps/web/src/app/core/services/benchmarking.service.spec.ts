import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BenchmarkingService, BenchmarkComparison } from './benchmarking.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('BenchmarkingService', () => {
  let service: BenchmarkingService;
  let http: HttpTestingController;
  const BASE = '/api/insightflow/benchmarking';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(BenchmarkingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getComparison() ---------------------------------------------------------

  describe('getComparison()', () => {
    it('should GET /comparison without customerId', (done) => {
      const mockResponse = {
        comparisons: [
          {
            metric: 'denial_rate',
            label: 'Denial Rate',
            practiceValue: 8.5,
            industryAvg: 10.2,
            industryTop25: 5.1,
            unit: '%',
            higherIsBetter: false,
            percentile: 72,
          },
          {
            metric: 'days_in_ar',
            label: 'Days in AR',
            practiceValue: 35,
            industryAvg: 42,
            industryTop25: 28,
            unit: 'days',
            higherIsBetter: false,
            percentile: 65,
          },
        ] as BenchmarkComparison[],
        generatedAt: '2026-03-12T00:00:00Z',
      };

      service.getComparison().subscribe(result => {
        expect(result.comparisons.length).toBe(2);
        expect(result.comparisons[0].metric).toBe('denial_rate');
        expect(result.comparisons[0].practiceValue).toBe(8.5);
        expect(result.comparisons[1].percentile).toBe(65);
        expect(result.generatedAt).toBeTruthy();
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/comparison`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should pass start and end params when provided', () => {
      service.getComparison('2026-01-01', '2026-12-31').subscribe();

      const req = http.expectOne(r => r.url === `${BASE}/comparison`);
      expect(req.request.params.get('start')).toBe('2026-01-01');
      expect(req.request.params.get('end')).toBe('2026-12-31');
      req.flush({ comparisons: [], generatedAt: '' });
    });

    it('should not pass start/end params when not provided', () => {
      service.getComparison().subscribe();

      const req = http.expectOne(r => r.url === `${BASE}/comparison`);
      expect(req.request.params.has('start')).toBe(false);
      expect(req.request.params.has('end')).toBe(false);
      req.flush({ comparisons: [], generatedAt: '' });
    });
  });
});
