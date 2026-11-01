import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthStore } from './auth.store';
import { SubscriptionService } from '../../core/services/subscription.service';
import { OrgSubscriptions } from '../../core/models/product.model';

const mockOrgSubs: OrgSubscriptions = {
  customerId: 1,
  subscriptions: ['denial-iq', 'insightflow', 'recon-iq'] as any,
  role: 'Admin',
};

const mockSuperAdminSubs: OrgSubscriptions = {
  customerId: 1,
  subscriptions: ['denial-iq', 'superadmin'] as any,
  role: 'Super Admin',
};

describe('AuthStore', () => {
  let store: AuthStore;
  let subsSvc: jasmine.SpyObj<SubscriptionService>;
  let state$Subject: BehaviorSubject<OrgSubscriptions>;

  beforeEach(() => {
    state$Subject = new BehaviorSubject<OrgSubscriptions>({
      customerId: null,
      subscriptions: [] as any,
    });

    subsSvc = jasmine.createSpyObj<SubscriptionService>(
      'SubscriptionService',
      ['load', 'isSubscribed'],
      { state$: state$Subject.asObservable(), snapshot: { customerId: null, subscriptions: [] } },
    );

    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: SubscriptionService, useValue: subsSvc },
      ],
    });
    store = TestBed.inject(AuthStore);
  });

  it('should start with empty slice', () => {
    expect(store.snapshot.data).toBeNull();
    expect(store.snapshot.loading).toBe(false);
  });

  it('init should call subscriptionService.load', fakeAsync(() => {
    store.init();
    tick();
    expect(subsSvc.load).toHaveBeenCalled();
  }));

  it('init should set loading then loaded when state$ emits', fakeAsync(() => {
    const loadingStates: boolean[] = [];
    store.loading$.pipe(take(3)).subscribe(l => loadingStates.push(l));

    store.init();
    tick();

    state$Subject.next(mockOrgSubs);
    tick();

    expect(loadingStates).toEqual([false, true, false]);
  }));

  it('should expose userRole$ from loaded data', fakeAsync(() => {
    store.init();
    tick();
    state$Subject.next(mockOrgSubs);
    tick();

    let role = '';
    store.userRole$.subscribe(r => role = r);
    expect(role).toBe('Admin');
  }));

  it('should expose isSuperAdmin$ as true when superadmin slug present', fakeAsync(() => {
    store.init();
    tick();
    state$Subject.next(mockSuperAdminSubs);
    tick();

    let isSA = false;
    store.isSuperAdmin$.subscribe(v => isSA = v);
    expect(isSA).toBe(true);
  }));

  it('should expose isSuperAdmin$ as false when no superadmin slug', fakeAsync(() => {
    store.init();
    tick();
    state$Subject.next(mockOrgSubs);
    tick();

    let isSA = false;
    store.isSuperAdmin$.subscribe(v => isSA = v);
    expect(isSA).toBe(false);
  }));

  it('visibleProducts$ should exclude superadmin', fakeAsync(() => {
    store.init();
    tick();
    state$Subject.next(mockSuperAdminSubs);
    tick();

    let products: string[] = [];
    store.visibleProducts$.subscribe(p => products = p);
    expect(products).toEqual(['denial-iq']);
    expect(products).not.toContain('superadmin');
  }));

  it('init should skip if already fresh (TTL check)', fakeAsync(() => {
    store.init();
    tick();
    state$Subject.next(mockOrgSubs);
    tick();

    // Reset call count
    subsSvc.load.calls.reset();
    store.init(); // should be skipped (30min TTL)
    tick();

    expect(subsSvc.load).not.toHaveBeenCalled();
  }));

  it('init with force=true should bypass cache', fakeAsync(() => {
    store.init();
    tick();
    state$Subject.next(mockOrgSubs);
    tick();

    subsSvc.load.calls.reset();
    store.init(true);
    tick();

    expect(subsSvc.load).toHaveBeenCalled();
  }));

  it('isSubscribed should delegate to SubscriptionService', () => {
    subsSvc.isSubscribed.and.returnValue(true);
    expect(store.isSubscribed('denial-iq')).toBe(true);
    expect(subsSvc.isSubscribed).toHaveBeenCalledWith('denial-iq');
  });
});
