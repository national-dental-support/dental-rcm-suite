import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Injector } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SubscriptionErrorInterceptor } from './subscription-error.interceptor';

describe('SubscriptionErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
    imports: [],
    providers: [
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: HTTP_INTERCEPTORS, useClass: SubscriptionErrorInterceptor, multi: true },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should pass through successful responses', () => {
    http.get('/api/test').subscribe(data => {
      expect(data).toEqual({ ok: true });
    });
    httpMock.expectOne('/api/test').flush({ ok: true });
  });

  it('should show snackbar and redirect on 403 with subscriptionRequired', () => {
    http.get('/api/denial-iq/dashboard').subscribe({ error: () => {} });
    httpMock.expectOne('/api/denial-iq/dashboard').flush(
      { subscriptionRequired: true, product: 'Denial IQ' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(snackBar.open).toHaveBeenCalledWith(
      jasmine.stringContaining('Denial IQ'),
      'Dismiss',
      jasmine.objectContaining({ duration: 6000 }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/app/home']);
  });

  it('should use "this product" when product name not provided', () => {
    http.get('/api/some-product/data').subscribe({ error: () => {} });
    httpMock.expectOne('/api/some-product/data').flush(
      { subscriptionRequired: true },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(snackBar.open).toHaveBeenCalledWith(
      jasmine.stringContaining('this product'),
      'Dismiss',
      jasmine.any(Object),
    );
  });

  it('should NOT handle 403 without subscriptionRequired flag', () => {
    http.get('/api/admin/users').subscribe({ error: () => {} });
    httpMock.expectOne('/api/admin/users').flush(
      { message: 'Forbidden' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should NOT handle non-403 errors', () => {
    http.get('/api/data').subscribe({ error: () => {} });
    httpMock.expectOne('/api/data').flush('Error', { status: 500, statusText: 'Server Error' });

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should re-throw the error after handling', (done) => {
    http.get('/api/feature').subscribe({
      error: (err) => {
        expect(err.status).toBe(403);
        done();
      },
    });
    httpMock.expectOne('/api/feature').flush(
      { subscriptionRequired: true, product: 'PayerIQ' },
      { status: 403, statusText: 'Forbidden' },
    );
  });
});
