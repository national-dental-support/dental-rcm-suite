import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { of, throwError } from 'rxjs';
import { adminGuard } from './admin.guard';
import { UserService } from '../core/services/user.service';

const mockRoute = {} as ActivatedRouteSnapshot;
const mockState = {} as RouterStateSnapshot;

describe('adminGuard', () => {
  let router: jasmine.SpyObj<Router>;
  let userService: jasmine.SpyObj<UserService>;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    userService = jasmine.createSpyObj<UserService>('UserService', ['checkIfUserExists']);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: UserService, useValue: userService },
      ],
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  function setCachedRole(role: string): void {
    sessionStorage.setItem('rcm_subscription_state', JSON.stringify({ role }));
  }

  it('allows when the cached role is Admin', () => {
    setCachedRole('Admin');
    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    expect(result).toBe(true);
  });

  it('allows when the cached role is Super Admin', () => {
    setCachedRole('Super Admin');
    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    expect(result).toBe(true);
  });

  it('does not allow a non-admin cached role', () => {
    setCachedRole('AR Specialist');
    localStorage.setItem('xUserEmail', 'user@example.com');
    userService.checkIfUserExists.and.returnValue(of({ role: 'AR Specialist' }) as any);

    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    (result as any).subscribe((allowed: boolean) => {
      expect(allowed).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/app/home']);
    });
  });

  it('ignores a malformed cache and falls back to the user lookup', () => {
    sessionStorage.setItem('rcm_subscription_state', 'not-json');
    localStorage.setItem('xUserEmail', 'admin@example.com');
    userService.checkIfUserExists.and.returnValue(of({ role: 'Admin' }) as any);

    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    (result as any).subscribe((allowed: boolean) => expect(allowed).toBe(true));
  });

  it('denies and redirects when there is no identity at all', () => {
    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/app/home']);
  });

  it('allows when the user lookup reports an admin role', () => {
    localStorage.setItem('xUserEmail', 'admin@example.com');
    userService.checkIfUserExists.and.returnValue(of({ role: 'Super Admin' }) as any);

    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    (result as any).subscribe((allowed: boolean) => expect(allowed).toBe(true));
  });

  it('denies and redirects when the user lookup fails', () => {
    localStorage.setItem('xUserEmail', 'admin@example.com');
    userService.checkIfUserExists.and.returnValue(throwError(() => new Error('boom')) as any);

    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    (result as any).subscribe((allowed: boolean) => {
      expect(allowed).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/app/home']);
    });
  });

  it('reads the identity from sessionStorage when localStorage has none', () => {
    sessionStorage.setItem('xUserEmail', 'admin@example.com');
    userService.checkIfUserExists.and.returnValue(of({ role: 'Admin' }) as any);

    const result = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    (result as any).subscribe((allowed: boolean) => expect(allowed).toBe(true));
    expect(userService.checkIfUserExists).toHaveBeenCalledWith('admin@example.com');
  });
});
