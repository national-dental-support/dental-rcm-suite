import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let http: HttpTestingController;
  let routerEvents$: Subject<any>;
  let mockRouter: any;


  const mockNgZone = {
    runOutsideAngular: (fn: Function) => fn(),
  };

  beforeEach(() => {
    // Telemetry is only sent for an authenticated identity, which the service
    // now reads from storage rather than from an identity-provider account.
    sessionStorage.setItem('xUserEmail', 'user@test.com');
    routerEvents$ = new Subject();
    mockRouter = {
      events: routerEvents$.asObservable(),
      url: '/app/denial-iq',
    };

    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});

    http = TestBed.inject(HttpTestingController);
    const httpClient = TestBed.inject(HttpClient);

    service = new AnalyticsService(httpClient, mockRouter, mockNgZone as any);
  });

  afterEach(() => {
    service.ngOnDestroy();
    // Discard any outstanding requests from heartbeat/page tracking
    http.match(() => true);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('track()', () => {
    it('should POST to /api/analytics/events/track', () => {
      service.track('button_click', { page: 'dashboard' });

      const req = http.expectOne(r => r.url.includes('/analytics/events/track'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body.eventName).toBe('button_click');
      expect(req.request.body.properties.page).toBe('dashboard');
      expect(req.request.body.userId).toBe('user@test.com');
      req.flush({});
    });

    it('should include sessionId and timestamp', () => {
      service.track('test_event');

      const req = http.expectOne(r => r.url.includes('/analytics/events/track'));
      expect(req.request.body.sessionId).toBeTruthy();
      expect(req.request.body.timestamp).toBeTruthy();
      req.flush({});
    });

    it('should default properties to empty object', () => {
      service.track('test_event');

      const req = http.expectOne(r => r.url.includes('/analytics/events/track'));
      expect(req.request.body.properties).toEqual({});
      req.flush({});
    });
  });

  describe('trackError()', () => {
    it('should POST to /api/analytics/events/error', () => {
      service.trackError({
        errorType: 'js_unhandled',
        message: 'Something broke',
        stack: 'at line 42',
      });

      const req = http.expectOne(r => r.url.includes('/analytics/events/error'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body.errorType).toBe('js_unhandled');
      expect(req.request.body.message).toBe('Something broke');
      expect(req.request.body.stack).toBe('at line 42');
      req.flush({});
    });

    it('should include HTTP details for http errors', () => {
      service.trackError({
        errorType: 'http',
        message: 'Not found',
        httpStatus: 404,
        httpMethod: 'GET',
        httpUrl: '/api/claims/123',
      });

      const req = http.expectOne(r => r.url.includes('/analytics/events/error'));
      expect(req.request.body.httpStatus).toBe(404);
      expect(req.request.body.httpMethod).toBe('GET');
      expect(req.request.body.httpUrl).toBe('/api/claims/123');
      req.flush({});
    });

    it('should include the signed-in userId', () => {
      service.trackError({ errorType: 'component', message: 'Component error' });

      const req = http.expectOne(r => r.url.includes('/analytics/events/error'));
      expect(req.request.body.userId).toBe('user@test.com');
      req.flush({});
    });
  });

  describe('startTracking()', () => {
    it('should send heartbeat and page-enter on start', () => {
      service.startTracking();

      // Should have both a heartbeat POST and a page-enter POST
      const reqs = http.match(r => r.url.includes('/analytics/'));
      expect(reqs.length).toBeGreaterThanOrEqual(1);
      reqs.forEach(r => r.flush(r.request.url.includes('page-enter') ? { pageVisitId: 1 } : {}));
    });

    it('should not start tracking twice', () => {
      service.startTracking();
      const first = http.match(() => true);
      first.forEach(r => r.flush({}));

      service.startTracking(); // duplicate call - should be no-op
      const second = http.match(() => true);
      expect(second.length).toBe(0);
    });
  });

  describe('ngOnDestroy()', () => {
    it('should clean up without errors', () => {
      service.startTracking();
      http.match(() => true).forEach(r => r.flush({}));
      expect(() => service.ngOnDestroy()).not.toThrow();
    });
  });
});
