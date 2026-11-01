import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, HttpErrorResponse, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AnalyticsInterceptor } from './analytics.interceptor';
import { AnalyticsService } from '../services/analytics.service';

describe('AnalyticsInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackError']);

    TestBed.configureTestingModule({
    imports: [],
    providers: [
        { provide: AnalyticsService, useValue: analytics },
        { provide: HTTP_INTERCEPTORS, useClass: AnalyticsInterceptor, multi: true },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should not track errors for successful requests', () => {
    http.get('/api/test').subscribe();
    httpMock.expectOne('/api/test').flush({ ok: true });
    expect(analytics.trackError).not.toHaveBeenCalled();
  });

  it('should track HTTP errors with status >= 400', () => {
    http.get('/api/claims').subscribe({ error: () => {} });
    httpMock.expectOne('/api/claims').flush('Not found', { status: 404, statusText: 'Not Found' });

    expect(analytics.trackError).toHaveBeenCalledWith(jasmine.objectContaining({
      errorType: 'http',
      httpStatus: 404,
      httpMethod: 'GET',
      httpUrl: '/api/claims',
    }));
  });

  it('should include method and URL in message', () => {
    http.post('/api/data', {}).subscribe({ error: () => {} });
    httpMock.expectOne('/api/data').flush('Error', { status: 500, statusText: 'Server Error' });

    const call = analytics.trackError.calls.mostRecent().args[0];
    expect(call.message).toContain('HTTP 500');
    expect(call.message).toContain('POST');
    expect(call.message).toContain('/api/data');
  });

  it('should NOT track errors for analytics endpoints (prevent infinite loop)', () => {
    http.get('/api/analytics/events').subscribe({ error: () => {} });
    httpMock.expectOne('/api/analytics/events').flush('Error', { status: 500, statusText: 'Server Error' });

    expect(analytics.trackError).not.toHaveBeenCalled();
  });

  it('should not track errors with status < 400', () => {
    // Redirects (3xx) should not be tracked
    http.get('/api/redirect').subscribe({ error: () => {} });
    httpMock.expectOne('/api/redirect').flush('', { status: 301, statusText: 'Moved' });

    expect(analytics.trackError).not.toHaveBeenCalled();
  });
});
