import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NgZone } from '@angular/core';
import { IdleTimeoutService } from './idle-timeout.service';
import { AuthService } from './auth.services';
import { RpDialogService } from '../../shared/components/dialogs/dialog-shell/dialog.service';
import { environment } from '../../../environments/environment';
import { of } from 'rxjs';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('IdleTimeoutService', () => {
  let service: IdleTimeoutService;
  let http: HttpTestingController;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let dialogServiceSpy: jasmine.SpyObj<RpDialogService>;

  const sessionTimeoutUrl = `${environment.server.baseUrl}/admin/settings/session-timeout`;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['logout']);
    dialogServiceSpy = jasmine.createSpyObj('RpDialogService', ['open']);
    dialogServiceSpy.open.and.returnValue(of({ action: 'primary' }));

    TestBed.configureTestingModule({
    imports: [],
    providers: [
        IdleTimeoutService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: RpDialogService, useValue: dialogServiceSpy },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});

    service = TestBed.inject(IdleTimeoutService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stop();
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('start', () => {
    it('should fetch timeout config from server on start', () => {
      service.start();

      const req = http.expectOne(sessionTimeoutUrl);
      expect(req.request.method).toBe('GET');
      req.flush({ minutes: 30 });

      service.stop();
    });

    it('should not fetch config again if already started', () => {
      service.start();
      service.start(); // second call should be no-op

      const reqs = http.match(sessionTimeoutUrl);
      expect(reqs.length).toBe(1);
      reqs[0].flush({ minutes: 30 });

      service.stop();
    });
  });

  describe('stop', () => {
    it('should clear timers and stop the service', () => {
      service.start();
      const req = http.expectOne(sessionTimeoutUrl);
      req.flush({ minutes: 30 });

      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('refreshConfig', () => {
    it('should make another GET request to fetch session timeout config', () => {
      service.start();
      http.expectOne(sessionTimeoutUrl).flush({ minutes: 30 });

      service.refreshConfig();
      const req = http.expectOne(sessionTimeoutUrl);
      expect(req.request.method).toBe('GET');
      req.flush({ minutes: 60 });

      service.stop();
    });
  });

  describe('fetchTimeoutConfig error handling', () => {
    it('should keep default timeout on HTTP error', () => {
      service.start();
      const req = http.expectOne(sessionTimeoutUrl);
      req.flush('error', { status: 500, statusText: 'Server Error' });
      // service should still be running with defaults
      expect(service).toBeTruthy();
      service.stop();
    });
  });

  describe('ngOnDestroy', () => {
    it('should call stop on destroy', () => {
      spyOn(service, 'stop').and.callThrough();
      service.start();
      http.expectOne(sessionTimeoutUrl).flush({ minutes: 15 });
      service.ngOnDestroy();
      expect(service.stop).toHaveBeenCalled();
    });
  });
});
