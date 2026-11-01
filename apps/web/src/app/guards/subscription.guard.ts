import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { Observable, race, timer } from 'rxjs';
import { filter, take, map } from 'rxjs/operators';
import { SubscriptionService } from '../core/services/subscription.service';
import { ProductSlug } from '../core/models/master-claim.model';
import { OrgSubscriptions } from '../core/models/product.model';

function evaluate(state: OrgSubscriptions, slug: string, router: Router): boolean {
  if (state.role === 'Super Admin') return true;
  const isSubscribed = (state.subscriptions as string[]).includes(slug);
  if (!isSubscribed) {
    router.navigate(['/app/home'], { queryParams: { notSubscribed: slug } });
  }
  return isSubscribed;
}

export const subscriptionGuard: CanActivateFn = (route: ActivatedRouteSnapshot): Observable<boolean> | boolean => {
  const subscriptionService = inject(SubscriptionService);
  const router = inject(Router);

  const slug = route.data['productSlug'] as ProductSlug;
  if (!slug) {
    router.navigate(['/app/home']);
    return false;
  }

  const snap = subscriptionService.snapshot;

  if (snap.role !== undefined) {
    return evaluate(snap, slug, router);
  }

  if ((snap.subscriptions as string[]).includes(slug)) {
    return true;
  }

  return race(
    subscriptionService.state$.pipe(
      filter(s => s.role !== undefined),
      take(1),
    ),
    timer(5000).pipe(map(() => subscriptionService.snapshot)),
  ).pipe(
    take(1),
    map(state => evaluate(state as OrgSubscriptions, slug, router)),
  );
};
