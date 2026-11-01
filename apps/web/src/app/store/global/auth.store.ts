import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { SubscriptionService } from '../../core/services/subscription.service';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../store.models';
import { OrgSubscriptions } from '../../core/models/product.model';
import { ProductSlug } from '../../core/models/master-claim.model';

/** 30-minute TTL - effectively session-length for subscription data. */
const AUTH_TTL = 30 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _slice$ = new BehaviorSubject<StoreSlice<OrgSubscriptions>>(emptySlice());

  /** Full slice (data + loading + error + cachedAt). */
  readonly slice$ = this._slice$.asObservable();

  /** The org subscription data when available. */
  readonly state$ = this._slice$.pipe(
    map(s => s.data),
    distinctUntilChanged(),
  );

  /** Current user role (empty string while loading). */
  readonly userRole$ = this._slice$.pipe(
    map(s => s.data?.role ?? ''),
    distinctUntilChanged(),
  );

  /** True when the org has the superadmin product slug. */
  readonly isSuperAdmin$ = this._slice$.pipe(
    map(s => (s.data?.subscriptions as string[] | undefined)?.includes('superadmin') ?? false),
    distinctUntilChanged(),
  );

  /** Subscribed product slugs (excludes superadmin). */
  readonly visibleProducts$ = this._slice$.pipe(
    map(s =>
      ((s.data?.subscriptions ?? []) as string[])
        .filter(slug => slug !== 'superadmin') as ProductSlug[],
    ),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  );

  /** True while initial load is in progress. */
  readonly loading$ = this._slice$.pipe(map(s => s.loading), distinctUntilChanged());

  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * Bootstrap the auth store.  Call once from LayoutComponent.ngOnInit().
   * Delegates to SubscriptionService so the existing cache and guards
   * continue to function - this store mirrors the same data.
   */
  init(force = false): void {
    if (!force && isFresh(this._slice$.value, AUTH_TTL)) return;

    this._slice$.next(loadingSlice(this._slice$.value));

    // SubscriptionService already has retry logic; wire into its state$
    this.subscriptionService.state$.subscribe({
      next: data => {
        this._slice$.next(loadedSlice(data));
      },
    });

    // Trigger the actual HTTP load (no-op if already loading)
    this.subscriptionService.load();
  }

  /** Synchronous read of the current slice value. */
  get snapshot(): StoreSlice<OrgSubscriptions> {
    return this._slice$.value;
  }

  /** Synchronous subscription check - delegates to SubscriptionService. */
  isSubscribed(slug: ProductSlug): boolean {
    return this.subscriptionService.isSubscribed(slug);
  }
}
