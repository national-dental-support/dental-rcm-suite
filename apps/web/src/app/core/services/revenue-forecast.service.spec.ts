import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RevenueForecastService, CollectionsForecast, ArAgingForecast, DenialTrendForecast, ForecastFilters } from './revenue-forecast.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('RevenueForecastService', () => {
  let service: RevenueForecastService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/ai/revenue-forecast`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [RevenueForecastService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(RevenueForecastService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('forecastCollections() should GET /collections with filter params', () => {
    const filters: ForecastFilters = { practice_groups: ['group1'] };
    service.forecastCollections(filters).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/collections` &&
      r.params.get('groups') === 'group1'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ historical: [], forecast: [] } as CollectionsForecast);
  });

  it('forecastCollections() should GET /collections with no params when called with defaults', () => {
    service.forecastCollections().subscribe();
    const req = http.expectOne(`${base}/collections`);
    req.flush({ historical: [], forecast: [] });
  });

  it('forecastArAging() should GET /ar-aging', () => {
    service.forecastArAging().subscribe(res => expect(res).toBeTruthy());
    const req = http.expectOne(`${base}/ar-aging`);
    expect(req.request.method).toBe('GET');
    req.flush({
      current: { ar0to30: 100, ar31to60: 50, ar61to90: 25, ar90plus: 10, totalClaims: 185 },
      forecast30day: { ar0to30: 90, ar31to60: 55, ar61to90: 30, ar90plus: 10 },
      forecast60day: { ar0to30: 80, ar31to60: 60, ar61to90: 35, ar90plus: 10 },
    } as ArAgingForecast);
  });

  it('forecastDenialTrend() should GET /denial-trend', () => {
    service.forecastDenialTrend().subscribe(res => expect(res).toBeTruthy());
    const req = http.expectOne(`${base}/denial-trend`);
    expect(req.request.method).toBe('GET');
    req.flush({ payers: [] } as DenialTrendForecast);
  });
});
