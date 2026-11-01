import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { subscriptionGuard } from './subscription.guard';
import { SubscriptionService } from '../core/services/subscription.service';
import { OrgSubscriptions } from '../core/models/product.model';

const mockState = {} as RouterStateSnapshot;

function makeRoute(slug?: string): ActivatedRouteSnapshot {
  return { data: { productSlug: slug } } as any;
}

describe('subscriptionGuard', () => {
  let router: jasmine.SpyObj<Router>;
  let subsSvc: jasmine.SpyObj<SubscriptionService>;
  let state$Subject: BehaviorSubject<OrgSubscriptions>;

  beforeEach(() => {
    state$Subject = new BehaviorSubject<OrgSubscriptions>({
      customerId: null,
      subscriptions: ['denial-iq', 'insightflow', 'recon-iq', 'claim-vision', 'payer-iq'] as any,
    });

    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    subsSvc = jasmine.createSpyObj<SubscriptionService>(
      'SubscriptionService',
      ['load', 'isSubscribed'],
      {
        state$: state$Subject.asObservable(),
        snapshot: state$Subject.value,
      },
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: SubscriptionService, useValue: subsSvc },
      ],
    });
  });

  it('should deny and redirect when no productSlug in route data', () => {
    const result = TestBed.runInInjectionContext(() => subscriptionGuard(makeRoute(undefined), mockState));
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/app/home']);
  });

  it('should allow when slug is in seed subscriptions (role undefined)', () => {
    const result = TestBed.runInInjectionContext(() => subscriptionGuard(makeRoute('denial-iq'), mockState));
    expect(result).toBe(true);
  });

  it('should allow when API has responded and slug is subscribed', () => {
    const apiState: OrgSubscriptions = {
      customerId: 1,
      subscriptions: ['denial-iq', 'insightflow'] as any,
      role: 'Admin',
    };
    (Object.getOwnPropertyDescriptor(subsSvc, 'snapshot')!.get as jasmine.Spy).and.returnValue(apiState);

    const result = TestBed.runInInjectionContext(() => subscriptionGuard(makeRoute('denial-iq'), mockState));
    expect(result).toBe(true);
  });

  it('should deny when API has responded and slug is NOT subscribed', () => {
    const apiState: OrgSubscriptions = {
      customerId: 1,
      subscriptions: ['denial-iq'] as any,
      role: 'Admin',
    };
    (Object.getOwnPropertyDescriptor(subsSvc, 'snapshot')!.get as jasmine.Spy).and.returnValue(apiState);

    const result = TestBed.runInInjectionContext(() => subscriptionGuard(makeRoute('payer-iq'), mockState));
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/app/home'], { queryParams: { notSubscribed: 'payer-iq' } });
  });

  it('should allow Super Admin for any slug', () => {
    const apiState: OrgSubscriptions = {
      customerId: 1,
      subscriptions: ['superadmin'] as any,
      role: 'Super Admin',
    };
    (Object.getOwnPropertyDescriptor(subsSvc, 'snapshot')!.get as jasmine.Spy).and.returnValue(apiState);

    const result = TestBed.runInInjectionContext(() => subscriptionGuard(makeRoute('payer-iq'), mockState));
    expect(result).toBe(true);
  });

  it('should wait for API when slug not in seed and role undefined', fakeAsync(() => {
    const seedState: OrgSubscriptions = {
      customerId: null,
      subscriptions: [] as any,
    };
    (Object.getOwnPropertyDescriptor(subsSvc, 'snapshot')!.get as jasmine.Spy).and.returnValue(seedState);

    const result = TestBed.runInInjectionContext(() => subscriptionGuard(makeRoute('denial-iq'), mockState));
    expect(typeof result).not.toBe('boolean');

    const apiState: OrgSubscriptions = {
      customerId: 1,
      subscriptions: ['denial-iq'] as any,
      role: 'Admin',
    };
    state$Subject.next(apiState);
    tick();

    let allowed: boolean | undefined;
    (result as any).subscribe((v: boolean) => allowed = v);
    tick();

    expect(allowed).toBe(true);
  }));
});
