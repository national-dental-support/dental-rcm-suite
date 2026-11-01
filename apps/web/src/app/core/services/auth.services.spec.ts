import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService, SESSION_TOKEN_KEY } from './auth.services';
import { UserStoreService } from '../stores/user-store.service';
import { InsightflowStore } from '../../store/insightflow/insightflow.store';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: any;
  let userStoreSpy: any;
  let insightflowStoreSpy: any;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    routerSpy = { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) };
    userStoreSpy = { setUser: jasmine.createSpy('setUser') };
    insightflowStoreSpy = { clear: jasmine.createSpy('clear') };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpy },
        { provide: UserStoreService, useValue: userStoreSpy },
        { provide: InsightflowStore, useValue: insightflowStoreSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('sessionToken / isAuthenticated', () => {
    it('reports no session when nothing is stored', () => {
      expect(service.sessionToken).toBeNull();
      expect(service.isAuthenticated).toBe(false);
    });

    it('reads the token from sessionStorage', () => {
      sessionStorage.setItem(SESSION_TOKEN_KEY, 'tok');
      expect(service.sessionToken).toBe('tok');
      expect(service.isAuthenticated).toBe(true);
    });

    it('falls back to localStorage', () => {
      localStorage.setItem(SESSION_TOKEN_KEY, 'tok2');
      expect(service.sessionToken).toBe('tok2');
    });
  });

  describe('login', () => {
    it('posts the credentials and stores the returned session', async () => {
      const pending = service.login('user@example.com', 'secret');

      const req = httpMock.expectOne(`${environment.server.baseUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'user@example.com', password: 'secret' });
      req.flush({
        token: 'tok-123',
        identity: { email: 'user@example.com', firstName: 'Ada', lastName: 'Lovelace' },
      });

      const identity = await pending;
      expect(identity.email).toBe('user@example.com');
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe('tok-123');
      expect(sessionStorage.getItem('xUserEmail')).toBe('user@example.com');
      expect(localStorage.getItem('myRCMAzureUserFirstName')).toBe('Ada');
      expect(localStorage.getItem('myRCMAzureUserLastName')).toBe('Lovelace');
    });

    it('surfaces the mustChangePassword flag without navigating', async () => {
      const pending = service.login('admin@example.com', 'initial');
      httpMock.expectOne(`${environment.server.baseUrl}/auth/login`).flush({
        token: 'tok-boot',
        identity: { email: 'admin@example.com', mustChangePassword: true },
      });

      const identity = await pending;
      expect(identity.mustChangePassword).toBe(true);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('rejects on bad credentials and stores no session', async () => {
      const pending = service.login('user@example.com', 'wrong');
      httpMock
        .expectOne(`${environment.server.baseUrl}/auth/login`)
        .flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

      await expectAsync(pending).toBeRejected();
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('posts both passwords and replaces the session token', async () => {
      const pending = service.changePassword('initial', 'a-much-longer-password');

      const req = httpMock.expectOne(`${environment.server.baseUrl}/auth/change-password`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        currentPassword: 'initial',
        newPassword: 'a-much-longer-password',
      });
      req.flush({ token: 'tok-fresh', identity: { email: 'admin@example.com' } });

      await pending;
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe('tok-fresh');
    });

    it('rejects when the server refuses the new password', async () => {
      const pending = service.changePassword('initial', 'short');
      httpMock
        .expectOne(`${environment.server.baseUrl}/auth/change-password`)
        .flush({ message: 'Too weak' }, { status: 400, statusText: 'Bad Request' });

      await expectAsync(pending).toBeRejected();
    });
  });

  describe('logout', () => {
    it('clears the session, resets the stores and returns to sign-in', () => {
      sessionStorage.setItem(SESSION_TOKEN_KEY, 'tok');
      sessionStorage.setItem('xUserEmail', 'user@example.com');
      localStorage.setItem('xUserEmail', 'user@example.com');
      localStorage.setItem('rcm_subscription_state', '{}');
      sessionStorage.setItem('impersonating', '{"id":1}');

      service.logout();

      // Best-effort Superset cookie clear.
      httpMock.expectOne(`${environment.server.baseUrl}/superset/logout`).flush({});

      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem('xUserEmail')).toBeNull();
      expect(localStorage.getItem('xUserEmail')).toBeNull();
      expect(localStorage.getItem('rcm_subscription_state')).toBeNull();
      expect(sessionStorage.getItem('impersonating')).toBeNull();
      expect(userStoreSpy.setUser).toHaveBeenCalledWith(null);
      expect(insightflowStoreSpy.clear).toHaveBeenCalled();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/signin']);
    });

    it('still clears local state when the Superset call fails', () => {
      sessionStorage.setItem(SESSION_TOKEN_KEY, 'tok');

      service.logout();

      httpMock
        .expectOne(`${environment.server.baseUrl}/superset/logout`)
        .flush({}, { status: 500, statusText: 'Server Error' });

      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/signin']);
    });

    it('logoutRedirect behaves as logout', () => {
      sessionStorage.setItem(SESSION_TOKEN_KEY, 'tok');

      service.logoutRedirect();

      httpMock.expectOne(`${environment.server.baseUrl}/superset/logout`).flush({});
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/signin']);
    });
  });
});
