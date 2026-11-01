import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { blockEmbedLoginGuard } from './block-embedded-login.guard';

const mockState = {} as RouterStateSnapshot;

function makeRoute(params: Record<string, string>): ActivatedRouteSnapshot {
  const map = {
    has: (key: string) => key in params,
    get: (key: string) => params[key] ?? null,
    keys: Object.keys(params),
    getAll: (key: string) => (key in params ? [params[key]] : []),
    append: () => {},
  };
  return { queryParamMap: map } as any;
}

describe('blockEmbedLoginGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should return true when uiConfig param is absent', () => {
    const result = TestBed.runInInjectionContext(() => blockEmbedLoginGuard(makeRoute({}), mockState));
    expect(result).toBeTrue();
  });

  it('should return false when uiConfig param is present', () => {
    const result = TestBed.runInInjectionContext(() => blockEmbedLoginGuard(makeRoute({ uiConfig: 'someValue' }), mockState));
    expect(result).toBeFalse();
  });

  it('should return true for other query params', () => {
    const result = TestBed.runInInjectionContext(() => blockEmbedLoginGuard(makeRoute({ token: 'abc', redirect: '/home' }), mockState));
    expect(result).toBeTrue();
  });
});
