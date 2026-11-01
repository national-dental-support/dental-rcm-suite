import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiKeyInterceptor } from './http-config.interceptor';
import { environment } from '../../../environments/environment';

describe('ApiKeyInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [],
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: ApiKeyInterceptor, multi: true },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('does not add an apikey header to API calls', () => {
    http.get(`${environment.server.baseUrl}/claims`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/claims'));
    expect(req.request.headers.has('apikey')).toBe(false);
    req.flush({});
  });

  it('never asserts the actor identity - the server derives it from the token', () => {
    sessionStorage.setItem('xUserEmail', 'user@example.com');
    http.get(`${environment.server.baseUrl}/test`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/test'));
    expect(req.request.headers.has('x-actor-email')).toBe(false);
    expect(req.request.headers.has('x-actor-oid')).toBe(false);
    req.flush({});
  });

  it('leaves non-API calls untouched', () => {
    sessionStorage.setItem('impersonating', JSON.stringify({ id: 7 }));
    http.get('https://external-service.example/data').subscribe();
    const req = httpMock.expectOne('https://external-service.example/data');
    expect(req.request.headers.has('x-impersonate-user-id')).toBe(false);
    req.flush({});
  });

  it('sends the impersonation target id when one is set', () => {
    sessionStorage.setItem('impersonating', JSON.stringify({ id: 42 }));
    http.get(`${environment.server.baseUrl}/test`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/test'));
    expect(req.request.headers.get('x-impersonate-user-id')).toBe('42');
    req.flush({});
  });

  it('rejects a non-integer impersonation id rather than forwarding it', () => {
    sessionStorage.setItem('impersonating', JSON.stringify({ id: '1; DROP TABLE users' }));
    http.get(`${environment.server.baseUrl}/test`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/test'));
    expect(req.request.headers.has('x-impersonate-user-id')).toBe(false);
    req.flush({});
  });

  it('ignores a malformed impersonation payload', () => {
    sessionStorage.setItem('impersonating', 'not-json');
    http.get(`${environment.server.baseUrl}/test`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/test'));
    expect(req.request.headers.has('x-impersonate-user-id')).toBe(false);
    req.flush({});
  });

  it('sends the active tenant id when an enterprise is selected', () => {
    localStorage.setItem('rcm_active_enterprise', JSON.stringify({ id: 3, name: 'Example' }));
    http.get(`${environment.server.baseUrl}/test`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/test'));
    expect(req.request.headers.get('x-xen-customer-id')).toBe('3');
    req.flush({});
  });

  it('omits the tenant header when no enterprise is selected', () => {
    http.get(`${environment.server.baseUrl}/test`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/test'));
    expect(req.request.headers.has('x-xen-customer-id')).toBe(false);
    req.flush({});
  });
});
