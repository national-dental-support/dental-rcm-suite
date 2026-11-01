import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { blockEmbedParamGuard } from './block-embedded-param.guard';

const mockState = {} as RouterStateSnapshot;

function makeRoute(params: Record<string, string>): ActivatedRouteSnapshot {
  const map = {
    has: (key: string) => key in params,
    get: (key: string) => params[key] ?? null,
    keys: Object.keys(params),
    getAll: (key: string) => (key in params ? [params[key]] : []),
  };
  return { queryParamMap: map } as any;
}

describe('blockEmbedParamGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should return true when uiConfig param is absent', () => {
    const result = TestBed.runInInjectionContext(() => blockEmbedParamGuard(makeRoute({}), mockState));
    expect(result).toBeTrue();
  });

  it('should return false when uiConfig param is present', () => {
    const result = TestBed.runInInjectionContext(() => blockEmbedParamGuard(makeRoute({ uiConfig: 'embedded_value' }), mockState));
    expect(result).toBeFalse();
  });

  it('should return true for routes with other params', () => {
    const result = TestBed.runInInjectionContext(() => blockEmbedParamGuard(makeRoute({ id: '42', page: '2' }), mockState));
    expect(result).toBeTrue();
  });
});
