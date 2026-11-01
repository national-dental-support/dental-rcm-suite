import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { superAdminGuard } from './super-admin.guard';
import { SubscriptionService } from '../core/services/subscription.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

const mockRoute = {} as ActivatedRouteSnapshot;
const mockState = {} as RouterStateSnapshot;

describe('superAdminGuard', () => {
  let router: jasmine.SpyObj<Router>;
  let subsSvc: jasmine.SpyObj<SubscriptionService>;

  function setup(subscriptions: string[]) {
    subsSvc = jasmine.createSpyObj<SubscriptionService>(
      'SubscriptionService',
      ['load'],
      { snapshot: { customerId: 1, subscriptions: subscriptions as any, role: 'Admin' } },
    );
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: SubscriptionService, useValue: subsSvc },
      ],
    });
  }

  it('should allow when subscriptions include superadmin', () => {
    setup(['denial-iq', 'superadmin']);
    const result = TestBed.runInInjectionContext(() => superAdminGuard(mockRoute, mockState));
    expect(result).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should deny and redirect when superadmin not in subscriptions', () => {
    setup(['denial-iq', 'insightflow']);
    const result = TestBed.runInInjectionContext(() => superAdminGuard(mockRoute, mockState));
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/app/home']);
  });

  it('should deny when subscriptions are empty', () => {
    setup([]);
    const result = TestBed.runInInjectionContext(() => superAdminGuard(mockRoute, mockState));
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/app/home']);
  });
});
