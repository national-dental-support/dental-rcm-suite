import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, retry } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { OrgSubscriptions, Product } from '../models/product.model';
import { ProductSlug } from '../models/master-claim.model';

// Seed state for product slugs while subscriptions are loading.
// 'superadmin' is intentionally excluded - it must come from the API
// so non-super-admins never see the SuperAdmin route in the sidebar.
const ALL_SLUGS: ProductSlug[] = [
  'denial-iq', 'insightflow', 'recon-iq', 'claim-vision', 'payer-iq',
];

const CACHE_KEY = 'rcm_subscription_state';
const CACHE_VERSION = 2; // bump to bust stale caches across all sessions

function loadCachedState(): OrgSubscriptions {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OrgSubscriptions & { _v?: number };
      if (parsed._v === CACHE_VERSION) return parsed;
      // Version mismatch - discard stale cache so fresh API data takes over
      sessionStorage.removeItem(CACHE_KEY);
    }
  } catch { /* ignore */ }
  // No cache - show all product slugs in sidebar while API loads.
  // This is safe: SubscriptionGuard validates via API before granting route access,
  // and requireSubscription middleware enforces on every backend call.
  // 'superadmin' excluded - must come from API so non-admins never see SuperAdmin nav.
  return { customerId: null, subscriptions: [...ALL_SLUGS] };
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly base = environment.server.baseUrl;

  private subs$ = new BehaviorSubject<OrgSubscriptions>(loadCachedState());

  private loading = false;

  constructor(private http: HttpClient) {}

  /** Call once after the user's email is confirmed in sessionStorage */
  load(): void {
    if (this.loading) return;
    this.loading = true;
    if (!environment.production) console.log('[SubscriptionService] load() called');
    this.http.get<OrgSubscriptions>(`${this.base}/subscriptions/my-org`)
      .pipe(retry({ count: 10, delay: 3000 }))
      .subscribe({
        next: data => {
          this.loading = false;
          if (!environment.production) console.log('[SubscriptionService] loaded:', data);
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, _v: CACHE_VERSION })); } catch { /* ignore */ }
          this.subs$.next(data);
        },
        error: (err) => {
          this.loading = false;
          if (!environment.production) console.error('[SubscriptionService] load failed, retrying in 15s:', err?.status, err?.message);
          // Backend may still be starting (SQL sidecar takes 60-90s) - keep retrying
          setTimeout(() => this.reload(), 15000);
        },
      });
  }

  /** Reset and re-fetch - use for explicit refresh */
  reload(): void {
    this.loading = false;
    this.load();
  }

  /** Synchronous subscription check - safe to call from guards */
  isSubscribed(slug: ProductSlug): boolean {
    return (this.subs$.value.subscriptions as string[]).includes(slug);
  }

  /** Observable of the current user's role as returned by the subscription API */
  get userRole$(): Observable<string> {
    return this.subs$.pipe(map(subs => subs.role ?? ''));
  }

  /** Observable: true when the current user has the superadmin slug */
  get isSuperAdmin$(): Observable<boolean> {
    return this.subs$.pipe(
      map(subs => (subs.subscriptions as string[]).includes('superadmin'))
    );
  }

  /** Observable of visible product slugs (superadmin handled separately) */
  get visibleProducts$(): Observable<ProductSlug[]> {
    return this.subs$.pipe(
      map(subs =>
        (subs.subscriptions as string[]).filter(s => s !== 'superadmin') as ProductSlug[]
      )
    );
  }

  /** Fetch full product catalog (for home page tiles) */
  getProducts(): Observable<Product[]> {
    return this.http.get<{ data: Product[] }>(`${this.base}/subscriptions/products`)
      .pipe(map(r => r.data));
  }

  /** Raw state stream - use when you need all subscription data in one emission */
  get state$() {
    return this.subs$.asObservable();
  }

  get snapshot(): OrgSubscriptions {
    return this.subs$.value;
  }
}
