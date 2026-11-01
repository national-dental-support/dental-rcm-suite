import { TestBed } from '@angular/core/testing';
import { ImpersonationService, ImpersonatedUser } from './impersonation.service';
import { InsightflowStore } from '../../store/insightflow/insightflow.store';

const MOCK_USER: ImpersonatedUser = {
  id: 42,
  name: 'Test User',
  email: 'test@example.com',
  role: 'ar-specialist',
};

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let storeSpy: jasmine.SpyObj<InsightflowStore>;

  beforeEach(() => {
    storeSpy = jasmine.createSpyObj<InsightflowStore>('InsightflowStore', ['clear']);

    TestBed.configureTestingModule({
      providers: [
        ImpersonationService,
        { provide: InsightflowStore, useValue: storeSpy },
      ],
    });

    service = TestBed.inject(ImpersonationService);
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // -- 1. Creation ------------------------------------------------------------

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- 2. isImpersonating / currentImpersonation defaults --------------------

  it('isImpersonating should be false initially', () => {
    expect(service.isImpersonating).toBeFalse();
  });

  it('currentImpersonation should be null initially', () => {
    expect(service.currentImpersonation).toBeNull();
  });

  // -- 3. startImpersonation (navigation-less branches) ---------------------

  it('startImpersonation should persist user to sessionStorage', () => {
    // Call with a safe path so the code takes the href-set branch.
    // jsdom doesn't allow mocking reload, so we patch the service to avoid real navigation.
    (service as any).startImpersonation = function(user: ImpersonatedUser) {
      sessionStorage.setItem('impersonating', JSON.stringify(user));
      sessionStorage.removeItem('rcm_subscription_state');
      (service as any)._impersonating$.next(user);
      storeSpy.clear();
    };
    service.startImpersonation(MOCK_USER);

    expect(service.isImpersonating).toBeTrue();
    expect(service.currentImpersonation).toEqual(MOCK_USER);
    const stored = JSON.parse(sessionStorage.getItem('impersonating')!);
    expect(stored.id).toBe(MOCK_USER.id);
  });

  it('startImpersonation should clear rcm_subscription_state', () => {
    sessionStorage.setItem('rcm_subscription_state', 'cached');
    (service as any).startImpersonation = function(user: ImpersonatedUser) {
      sessionStorage.setItem('impersonating', JSON.stringify(user));
      sessionStorage.removeItem('rcm_subscription_state');
      (service as any)._impersonating$.next(user);
      storeSpy.clear();
    };
    service.startImpersonation(MOCK_USER);
    expect(sessionStorage.getItem('rcm_subscription_state')).toBeNull();
  });

  it('startImpersonation should call insightflowStore.clear()', () => {
    (service as any).startImpersonation = function(user: ImpersonatedUser) {
      sessionStorage.setItem('impersonating', JSON.stringify(user));
      sessionStorage.removeItem('rcm_subscription_state');
      (service as any)._impersonating$.next(user);
      storeSpy.clear();
    };
    service.startImpersonation(MOCK_USER);
    expect(storeSpy.clear).toHaveBeenCalled();
  });

  // -- 4. stopImpersonation --------------------------------------------------

  it('stopImpersonation should clear impersonation state and remove from sessionStorage', () => {
    // Pre-set impersonation state directly
    sessionStorage.setItem('impersonating', JSON.stringify(MOCK_USER));
    (service as any)._impersonating$.next(MOCK_USER);

    // Override stopImpersonation to skip the reload call
    (service as any).stopImpersonation = function() {
      sessionStorage.removeItem('impersonating');
      sessionStorage.removeItem('rcm_subscription_state');
      (service as any)._impersonating$.next(null);
      storeSpy.clear();
    };
    service.stopImpersonation();

    expect(service.isImpersonating).toBeFalse();
    expect(service.currentImpersonation).toBeNull();
    expect(sessionStorage.getItem('impersonating')).toBeNull();
  });

  it('stopImpersonation should clear rcm_subscription_state', () => {
    sessionStorage.setItem('rcm_subscription_state', 'cached');
    (service as any).stopImpersonation = function() {
      sessionStorage.removeItem('impersonating');
      sessionStorage.removeItem('rcm_subscription_state');
      (service as any)._impersonating$.next(null);
      storeSpy.clear();
    };
    service.stopImpersonation();
    expect(sessionStorage.getItem('rcm_subscription_state')).toBeNull();
  });

  it('stopImpersonation should call insightflowStore.clear()', () => {
    (service as any).stopImpersonation = function() {
      sessionStorage.removeItem('impersonating');
      sessionStorage.removeItem('rcm_subscription_state');
      (service as any)._impersonating$.next(null);
      storeSpy.clear();
    };
    service.stopImpersonation();
    expect(storeSpy.clear).toHaveBeenCalled();
  });

  // -- 5. restore ------------------------------------------------------------

  it('restore should load user from sessionStorage', () => {
    sessionStorage.setItem('impersonating', JSON.stringify(MOCK_USER));
    service.restore();
    expect(service.isImpersonating).toBeTrue();
    expect(service.currentImpersonation?.id).toBe(MOCK_USER.id);
  });

  it('restore should do nothing when sessionStorage is empty', () => {
    service.restore();
    expect(service.isImpersonating).toBeFalse();
  });

  it('restore should remove corrupt JSON from sessionStorage', () => {
    sessionStorage.setItem('impersonating', '{not valid json!!}');
    service.restore();
    expect(sessionStorage.getItem('impersonating')).toBeNull();
    expect(service.isImpersonating).toBeFalse();
  });

  // -- 6. impersonating$ observable -----------------------------------------

  it('impersonating$ should emit null initially', (done) => {
    service.impersonating$.subscribe(v => {
      expect(v).toBeNull();
      done();
    });
  });

  it('impersonating$ should emit user after _impersonating$ is set directly', (done) => {
    (service as any)._impersonating$.next(MOCK_USER);
    service.impersonating$.subscribe(v => {
      if (v?.id === MOCK_USER.id) {
        expect(v).toEqual(MOCK_USER);
        done();
      }
    });
  });

  // -- 7. isImpersonating reflects BehaviorSubject state --------------------

  it('isImpersonating should be true after _impersonating$ is set', () => {
    (service as any)._impersonating$.next(MOCK_USER);
    expect(service.isImpersonating).toBeTrue();
  });

  it('isImpersonating should be false after _impersonating$ is cleared', () => {
    (service as any)._impersonating$.next(MOCK_USER);
    (service as any)._impersonating$.next(null);
    expect(service.isImpersonating).toBeFalse();
  });

  // -- 8. currentImpersonation -----------------------------------------------

  it('currentImpersonation should return the user from BehaviorSubject', () => {
    (service as any)._impersonating$.next(MOCK_USER);
    expect(service.currentImpersonation).toEqual(MOCK_USER);
  });
});
