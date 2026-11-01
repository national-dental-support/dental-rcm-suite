import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { retry } from 'rxjs/operators';
import { SubscriptionService } from '../../core/services/subscription.service';
import { TrainingService } from '../../core/services/training.service';
import { HomeDashboardService } from '../../core/services/home-dashboard.service';
import { Product } from '../../core/models/product.model';

/** Maps product slugs to Material Icons ligature names, as the side nav does. */
const ICON_NAME_MAP: Record<string, string> = {
  'insightflow':  'insights',
  'claim-vision': 'find_in_page',
  'payer-iq':     'request_quote',
  'recon-iq':     'account_balance',
  'denial-iq':    'fact_check',
  'admin':        'admin_panel_settings',
};

const DEFAULT_ICON_NAME = 'settings';

/** Short marketing descriptions per product. */
const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  'insightflow':     'Executive analytics and real-time KPIs across your entire revenue cycle - denial trends, payer mix, and financial health at a glance.',
  'claim-vision':    'Pre-submission claim scrubbing with intelligent rule engines that catch errors before they become denials.',
  'payer-iq':        'Payer contract intelligence - analyze reimbursement rates, identify underpayments, and optimize your payer mix strategy.',
  'recon-iq':        'Automated payment reconciliation - match ERA/EOB to bank deposits and resolve discrepancies in minutes, not days.',
  'denial-iq':       'End-to-end denial management - prioritized work queues, guided remediation, appeal tracking, and team performance analytics.',
  'admin':           'User management, workflow configuration, escalation rules, and operational settings for your organization.',
};

/** Canonical nav ordering matching the side nav. */
const NAV_ORDER: string[] = [
  'insightflow', 'claim-vision', 'payer-iq', 'recon-iq', 'denial-iq', 'admin',
];

/** Products controlled by the subscription toggle - always shown, grayed out when not subscribed. */
const SUBSCRIPTION_GATED = new Set([
  'denial-iq', 'insightflow', 'recon-iq', 'claim-vision', 'payer-iq',
]);

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class HomeComponent implements OnInit {
  products: Product[] = [];
  isSuperAdmin = false;
  canSeeTechMonitoring = false;
  notSubscribedSlug: string | null = null;
  trainingMode = false;
  private _userSubs = new Set<string>();
  private _userRole = '';

  externalApps: { name: string; url: string; icon: string }[] = [];

  // Dashboard widgets
  showWidgets = false;
  checkInsToday = 0;
  roomsAvailable = 0;
  openInvoices = 0;
  rpmAlerts = 0;
  telehealthToday = 0;
  pendingFaxes = 0;

  constructor(
    private subscriptionService: SubscriptionService,
    private trainingService: TrainingService,
    private homeDashboardService: HomeDashboardService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.notSubscribedSlug = this.route.snapshot.queryParamMap.get('notSubscribed');

    this.trainingService.trainingMode$.subscribe(mode => {
      this.trainingMode = mode;
      this.cdr.markForCheck();
    });

    this.subscriptionService.isSuperAdmin$.subscribe(isAdmin => {
      this.isSuperAdmin = isAdmin;
      this.rebuildProducts();
    });

    this.subscriptionService.state$.subscribe(data => {
      const role = data.role ?? '';
      const isAdmin = role === 'Admin' || role === 'Super Admin';
      const isManager = role === 'Manager';
      this.canSeeTechMonitoring = isAdmin || data.permissions?.['techMonitoringAccess'] === true;
      this.showWidgets = isAdmin || isManager;
      this._userSubs = new Set(data.subscriptions as string[]);
      this._userRole = role;
      this.rebuildProducts();

      if (this.showWidgets) {
        this.loadWidgets();
      }
    });

    this.http.get<{ name: string; url: string; icon: string }[]>('/api/app-registry').subscribe({
      next: apps => { this.externalApps = apps || []; this.cdr.markForCheck(); },
      error: (err) => {
        console.warn('[Home] /api/app-registry unavailable \u2014 no sibling apps will be shown.', err?.status ?? err);
        this.externalApps = [];
      },
    });

    this.subscriptionService.getProducts().pipe(retry(2)).subscribe({
      next: products => {
        const active = products.filter(p => p.isActive);
        this._apiProducts = active;
        try { localStorage.setItem('rcm_products_cache', JSON.stringify(active)); } catch {}
        this.rebuildProducts();
      },
      error: () => {
        // Try localStorage cache first (populated on last successful load)
        let cached: Product[] = [];
        try {
          const raw = localStorage.getItem('rcm_products_cache');
          if (raw) cached = JSON.parse(raw) as Product[];
        } catch {}

        if (cached.length > 0) {
          this._apiProducts = cached;
        } else {
          // No products from the API and no cache - show none rather than fabricating the
          // full catalog (which would display products the tenant may not be subscribed to).
          this._apiProducts = [];
        }
        this.rebuildProducts();
      },
    });
  }

  /** Raw products from API (or fallback). */
  private _apiProducts: Product[] = [];

  private readonly adminTile: Product = {
    id: 0, slug: 'admin', name: 'Admin', icon: 'settings',
    navRoute: '/app/admin', navOrder: 7, isActive: true,
  };

  /** Rebuilds the displayed product list: filters superadmin for non-super users, injects Admin, applies canonical ordering. */
  private rebuildProducts(): void {
    const isAdminRole = this._userRole === 'Admin' || this._userRole === 'Super Admin';

    let list = this._apiProducts
      .filter(p => {
        if (p.slug === 'superadmin') return this.isSuperAdmin;
        return true;
      })
      .map(p => ({
        ...p,
        subscribed: SUBSCRIPTION_GATED.has(p.slug) ? this._userSubs.has(p.slug) : true,
      }));

    // Inject Admin tile only for Admin/Super Admin roles
    if (isAdminRole && !list.some(p => p.slug === 'admin')) {
      list.push({ ...this.adminTile, subscribed: true });
    }

    // Deduplicate by slug (API may already contain tiles we inject manually)
    list = list.filter((p, i, arr) => arr.findIndex(x => x.slug === p.slug) === i);

    // Sort by canonical nav order (matching side nav)
    list.sort((a, b) => {
      const ai = NAV_ORDER.indexOf(a.slug);
      const bi = NAV_ORDER.indexOf(b.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    this.products = list;
    this.cdr.markForCheck();
  }

  private loadWidgets(): void {
    this.homeDashboardService.getStats().subscribe({
      next: stats => {
        this.checkInsToday   = stats.checkInsToday;
        this.roomsAvailable  = stats.roomsAvailable;
        this.openInvoices    = stats.openInvoices;
        this.rpmAlerts       = stats.rpmAlerts;
        this.telehealthToday = stats.telehealthToday;
        this.pendingFaxes    = stats.pendingFaxes;
        this.cdr.markForCheck();
      },
      // Error already logged + snackbar shown by HomeDashboardService.getStats()
    });
  }

  iconName(product: Product): string {
    return ICON_NAME_MAP[product.slug] || DEFAULT_ICON_NAME;
  }

  productDescription(product: Product): string {
    return PRODUCT_DESCRIPTIONS[product.slug] || '';
  }

  navigate(product: Product): void {
    if (product.subscribed === false) return;
    this.router.navigate([product.navRoute]);
  }

  toggleTrainingMode(): void {
    const newVal = !this.trainingMode;
    this.trainingService.setPreference(newVal).subscribe();
  }
}
