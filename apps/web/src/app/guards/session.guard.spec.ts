import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { sessionGuard } from './session.guard';
import { AuthService } from '../core/services/auth.services';

const mockRoute = {} as ActivatedRouteSnapshot;
const mockState = {} as RouterStateSnapshot;

describe('sessionGuard', () => {
  let router: jasmine.SpyObj<Router>;
  let auth: { isAuthenticated: boolean };
  const signinTree = {} as UrlTree;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['createUrlTree']);
    router.createUrlTree.and.returnValue(signinTree);
    auth = { isAuthenticated: false };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  it('allows navigation when a session exists', () => {
    auth.isAuthenticated = true;
    const result = TestBed.runInInjectionContext(() => sessionGuard(mockRoute, mockState));
    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when there is no session', () => {
    auth.isAuthenticated = false;
    const result = TestBed.runInInjectionContext(() => sessionGuard(mockRoute, mockState));
    expect(result).toBe(signinTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/signin']);
  });
});
