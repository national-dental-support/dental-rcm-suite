import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminLogsService, AnalyticsEvent, AnalyticsError, AdminAuditEntry } from './admin-logs.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('AdminLogsService', () => {
  let service: AdminLogsService;
  let httpMock: HttpTestingController;
  const base = `${environment.server.baseUrl}/admin/logs`;
  const auditBase = `${environment.server.baseUrl}/admin/audit-log`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(AdminLogsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- getEvents ---
  it('getEvents should fetch events with default limit', () => {
    const mockEvents: AnalyticsEvent[] = [
      { id: 1, session_id: 's1', user_id: 'u1', url: '/test', timestamp: '2025-01-01', event_name: 'click', properties: null, created_at: '2025-01-01' },
    ];

    service.getEvents().subscribe(result => {
      expect(result).toEqual(mockEvents);
    });

    const req = httpMock.expectOne(`${base}/events?limit=500`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockEvents });
  });

  it('getEvents should use custom limit', () => {
    service.getEvents(100).subscribe();
    const req = httpMock.expectOne(`${base}/events?limit=100`);
    req.flush({ data: [] });
  });

  it('getEvents should handle null data', () => {
    service.getEvents().subscribe(result => {
      expect(result).toEqual([]);
    });
    httpMock.expectOne(`${base}/events?limit=500`).flush({ data: null });
  });

  // --- getErrors ---
  it('getErrors should fetch errors with default limit', () => {
    const mockErrors: AnalyticsError[] = [
      { id: 1, session_id: 's1', user_id: 'u1', url: null, timestamp: '2025-01-01', error_type: 'TypeError', message: 'fail', stack: null, http_status: null, http_method: null, http_url: null, created_at: '2025-01-01' },
    ];

    service.getErrors().subscribe(result => {
      expect(result).toEqual(mockErrors);
    });

    const req = httpMock.expectOne(`${base}/errors?limit=500`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockErrors });
  });

  it('getErrors should use custom limit', () => {
    service.getErrors(50).subscribe();
    httpMock.expectOne(`${base}/errors?limit=50`).flush({ data: [] });
  });

  it('getErrors should handle null data', () => {
    service.getErrors().subscribe(result => {
      expect(result).toEqual([]);
    });
    httpMock.expectOne(`${base}/errors?limit=500`).flush({ data: null });
  });

  // --- fetchAuditLog ---
  it('fetchAuditLog should fetch with default params', () => {
    service.fetchAuditLog().subscribe(result => {
      expect(result).toEqual([]);
    });
    const req = httpMock.expectOne(r => r.url.startsWith(auditBase));
    expect(req.request.url).toContain('limit=500');
    req.flush({ data: [] });
  });

  it('fetchAuditLog should pass all filter params', () => {
    service.fetchAuditLog({
      actor: 'admin',
      target: 'user-1',
      action: 'update',
      from: '2025-01-01',
      to: '2025-12-31',
      limit: 100,
    }).subscribe();

    const req = httpMock.expectOne(r => r.url.startsWith(auditBase));
    expect(req.request.url).toContain('actor=admin');
    expect(req.request.url).toContain('target=user-1');
    expect(req.request.url).toContain('action=update');
    expect(req.request.url).toContain('from=2025-01-01');
    expect(req.request.url).toContain('to=2025-12-31');
    expect(req.request.url).toContain('limit=100');
    req.flush({ data: [] });
  });

  it('fetchAuditLog should handle null data', () => {
    service.fetchAuditLog().subscribe(result => {
      expect(result).toEqual([]);
    });
    httpMock.expectOne(r => r.url.startsWith(auditBase)).flush({ data: null });
  });

  it('fetchAuditLog should omit unset params', () => {
    service.fetchAuditLog({ actor: 'admin' }).subscribe();
    const req = httpMock.expectOne(r => r.url.startsWith(auditBase));
    expect(req.request.url).toContain('actor=admin');
    expect(req.request.url).not.toContain('target=');
    expect(req.request.url).not.toContain('action=');
    req.flush({ data: [] });
  });
});
