import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TimeTrackingService } from './time-tracking.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('TimeTrackingService', () => {
  let service: TimeTrackingService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/admin/time-tracking`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [TimeTrackingService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(TimeTrackingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getSummary() should GET /summary with days param', () => {
    service.getSummary(30).subscribe();
    const req = http.expectOne(r => r.url === `${base}/summary` && r.params.get('days') === '30');
    expect(req.request.method).toBe('GET');
    req.flush({ activeSpecialists: 5, totalClaimsWorked: 100, totalHoursWorked: 80, avgMinutesPerClaim: 10, avgDailyHoursPerSpecialist: 7, avgUtilizationPct: 85, periodDays: 30 });
  });

  it('getUtilization() should GET /utilization with days param', () => {
    service.getUtilization(14).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(r => r.url === `${base}/utilization` && r.params.get('days') === '14');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getTimeSinks() should GET /time-sinks with days and limit params', () => {
    service.getTimeSinks(30, 15).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(r =>
      r.url === `${base}/time-sinks` &&
      r.params.get('days') === '30' &&
      r.params.get('limit') === '15'
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getByPayer() should GET /by-payer with days param', () => {
    service.getByPayer(30).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(r => r.url === `${base}/by-payer` && r.params.get('days') === '30');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getBenchmarks() should GET /benchmarks with days param', () => {
    service.getBenchmarks(30).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(r => r.url === `${base}/benchmarks` && r.params.get('days') === '30');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getTrend() should GET /trend with days param', () => {
    service.getTrend(30).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(r => r.url === `${base}/trend` && r.params.get('days') === '30');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  // Default parameter tests
  it('getSummary() should use default days=30 when no arg passed', () => {
    service.getSummary().subscribe();
    const req = http.expectOne(r => r.url === `${base}/summary` && r.params.get('days') === '30');
    req.flush({});
  });

  it('getUtilization() should use default days=14 when no arg passed', () => {
    service.getUtilization().subscribe();
    const req = http.expectOne(r => r.url === `${base}/utilization` && r.params.get('days') === '14');
    req.flush([]);
  });

  it('getTimeSinks() should use default days=30 and limit=15 when no args passed', () => {
    service.getTimeSinks().subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/time-sinks` &&
      r.params.get('days') === '30' &&
      r.params.get('limit') === '15'
    );
    req.flush([]);
  });

  it('getByPayer() should use default days=30 when no arg passed', () => {
    service.getByPayer().subscribe();
    const req = http.expectOne(r => r.url === `${base}/by-payer` && r.params.get('days') === '30');
    req.flush([]);
  });

  it('getBenchmarks() should use default days=30 when no arg passed', () => {
    service.getBenchmarks().subscribe();
    const req = http.expectOne(r => r.url === `${base}/benchmarks` && r.params.get('days') === '30');
    req.flush([]);
  });

  it('getTrend() should use default days=30 when no arg passed', () => {
    service.getTrend().subscribe();
    const req = http.expectOne(r => r.url === `${base}/trend` && r.params.get('days') === '30');
    req.flush([]);
  });

  // Custom parameter tests
  it('getSummary() should pass custom days param', () => {
    service.getSummary(90).subscribe();
    const req = http.expectOne(r => r.url === `${base}/summary` && r.params.get('days') === '90');
    req.flush({});
  });

  it('getUtilization() should pass custom days param', () => {
    service.getUtilization(7).subscribe();
    const req = http.expectOne(r => r.url === `${base}/utilization` && r.params.get('days') === '7');
    req.flush([]);
  });

  it('getTimeSinks() should pass custom limit param', () => {
    service.getTimeSinks(60, 25).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/time-sinks` &&
      r.params.get('days') === '60' &&
      r.params.get('limit') === '25'
    );
    req.flush([]);
  });
});
