import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, race, timer } from 'rxjs';
import { filter, take, map } from 'rxjs/operators';
import { SubscriptionService } from '../core/services/subscription.service';

export const superAdminGuard: CanActivateFn = (): Observable<boolean> | boolean => {
  const subscriptionService = inject(SubscriptionService);
  const router = inject(Router);

  const snap = subscriptionService.snapshot;
  console.log('[superAdminGuard] role:', snap.role, '| superadmin in subs:', (snap.subscriptions as string[]).includes('superadmin'), '| all subs:', snap.subscriptions);

  // Fast path: subscription already loaded
  if (snap.role !== undefined) {
    const ok = (snap.subscriptions as string[]).includes('superadmin');
    if (!ok) router.navigate(['/app/home']);
    return ok;
  }

  // 'superadmin' already in snapshot (cached session)
  if ((snap.subscriptions as string[]).includes('superadmin')) {
    return true;
  }

  // Subscription still loading - wait up to 5s for role to arrive
  return race(
    subscriptionService.state$.pipe(
      filter(s => s.role !== undefined),
      take(1),
    ),
    timer(5000).pipe(map(() => subscriptionService.snapshot)),
  ).pipe(
    take(1),
    map(state => {
      const ok = (state.subscriptions as string[]).includes('superadmin');
      if (!ok) router.navigate(['/app/home']);
      return ok;
    }),
  );
};
