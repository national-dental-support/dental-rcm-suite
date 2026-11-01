import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthTokenInterceptor } from './auth-token.interceptor';
import { SESSION_TOKEN_KEY } from '../services/auth.services';
import { environment } from '../../../environments/environment';

describe('AuthTokenInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [],
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: AuthTokenInterceptor, multi: true },
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

  it('attaches the session token as a bearer token on API calls', () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, 'token-abc');
    http.get(`${environment.server.baseUrl}/claims`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/claims'));
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-abc');
    req.flush({});
  });

  it('falls back to localStorage when sessionStorage has no token', () => {
    localStorage.setItem(SESSION_TOKEN_KEY, 'token-xyz');
    http.get(`${environment.server.baseUrl}/claims`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/claims'));
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-xyz');
    req.flush({});
  });

  it('sends no Authorization header when there is no session', () => {
    http.get(`${environment.server.baseUrl}/claims`).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/claims'));
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does not leak the token to a third-party absolute URL', () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, 'token-abc');
    http.get('https://external-service.example/data').subscribe();
    const req = httpMock.expectOne('https://external-service.example/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('leaves an explicit Authorization header in place', () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, 'token-abc');
    http
      .get(`${environment.server.baseUrl}/claims`, { headers: { Authorization: 'Bearer caller-set' } })
      .subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/claims'));
    expect(req.request.headers.get('Authorization')).toBe('Bearer caller-set');
    req.flush({});
  });
});
