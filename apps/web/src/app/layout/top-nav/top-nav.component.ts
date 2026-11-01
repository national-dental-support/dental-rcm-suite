// top-nav.component.ts
import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { environment } from '../../../environments/environment';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { DenialIqContextService, DenialIqRole } from '../../pages/claim-queue/services/denialIqRole.service';
import { ClaimContextService, ActiveClaimContext } from '../../pages/claim-queue/services/claim-context.service';

import { GlobalFiltersStore, PayerIqFiltersStore } from '../../shared/components/global-filters/global-filters.store';
import {
  GlobalFilterOptions,
  GlobalFiltersValue,
  LocationSelection,
  PayerIqFiltersValue,
} from '../../shared/components/global-filters/global-filters.models';

import { NetworkPayersDropdownResponse, PayerIqService } from '../../core/services/payer-iq.service';
import { ThemeService } from '../../core/services/theme.service';
import { RefDataStore } from '../../store/global/ref-data.store';
import { EnterpriseService } from '../../core/services/enterprise.service';

@Component({
    selector: 'app-top-nav',
    templateUrl: './top-nav.component.html',
    styleUrls: ['./top-nav.component.scss'],
    standalone: false
})
export class TopNavComponent implements OnDestroy {
  @Input() isSuperAdmin = false;
  @Output() menuToggle = new EventEmitter<void>();
  @Input()  navCollapsed = false;
  @Output() expandNav   = new EventEmitter<void>();

  isInDenialIq = false;
  isOnDashboard = false;

  // payer-iq detection
  isInPayerIq = false;
  isOnPayerIqContracts = false;

  // claim-vision + rules
  isInClaimVision = false;
  isOnRules = false;

  currentRole: DenialIqRole = 'ar-specialist';


  activeClaim: ActiveClaimContext | null = null;
  activeClaimLabel = '';

  globalFilterOptions: GlobalFilterOptions | null = null;
  appliedFilters: GlobalFiltersValue | null = null;

  private sub = new Subscription();

  isDark = false;

  constructor(
    private router: Router,
    private denialCtx: DenialIqContextService,
    private claimCtx: ClaimContextService,
    private globalFiltersStore: GlobalFiltersStore,
    private payerIqFiltersStore: PayerIqFiltersStore,
    private payerIQService: PayerIqService,
    private refDataStore: RefDataStore,
    private cdr: ChangeDetectorRef,
    public themeService: ThemeService,
    public enterpriseSvc: EnterpriseService,
  ) {
    this.isDark = this.themeService.isDarkMode();
    this.sub.add(
      this.themeService.darkMode$.subscribe(d => {
        this.isDark = d;
        this.cdr.markForCheck();
      })
    );
    // track route location
    this.sub.add(
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe((event: NavigationEnd) => {
          const url = event.urlAfterRedirects;

          this.isInDenialIq = url.startsWith('/app/denial-iq');
          this.isOnDashboard = url === '/app/denial-iq' || url === '/app/denial-iq/dashboard';

          this.isInClaimVision = url.startsWith('/app/claim-vision');
          this.isOnRules = this.isInClaimVision && url.includes('/claim-vision/rules');

          this.isInPayerIq = url.startsWith('/app/payer-iq');
          this.isOnPayerIqContracts = this.isInPayerIq && url.includes('/payer-iq/contracts');
          this.cdr.markForCheck();
        })
    );

    this.sub.add(
      this.denialCtx.role$.subscribe((role) => {
        this.currentRole = role;
      })
    );

    this.sub.add(
      this.claimCtx.activeClaim$.subscribe((ctx) => {
        this.activeClaim = ctx;
        this.activeClaimLabel = ctx ? this.formatClaimBadge(ctx) : '';
      })
    );

    // Keep local copy so TopNav can pass initialValue
    this.sub.add(
      this.globalFiltersStore.applied$.subscribe((v) => {
        this.appliedFilters = v;
        this.cdr.markForCheck();
      })
    );

    // Subscribe to cached ref data (loaded once by LayoutComponent via RefDataStore)
    this.sub.add(
      this.refDataStore.data$.subscribe(opts => {
        if (opts) {
          this.globalFilterOptions = opts;
          this.globalFiltersStore.setOptions(opts);
          this.cdr.markForCheck();
        }
      })
    );
  }

  ngOnChanges(): void {
    if (this.isSuperAdmin) {
      this.enterpriseSvc.loadEnterprises();
    }
  }

  onEnterpriseChange(entId: number): void {
    const ents = this.enterpriseSvc['_enterprises$'].value;
    const ent = ents.find((e: any) => e.id === entId);
    if (ent) {
      this.enterpriseSvc.setActive(ent);
      window.location.reload();
    }
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }


  private formatClaimBadge(ctx: ActiveClaimContext): string {
    const parts = ctx.patient.split(' ');
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ') || '';
    const firstInitial = firstName ? firstName.charAt(0) + '.' : '';

    const digits = ctx.id.replace(/\D/g, '');
    const last4 = digits.slice(-4);

    return `${firstInitial} ${lastName} ***${last4}`;
  }

  goToClaimQueue(): void {
    const queueSegment = this.currentRole === 'manager' ? 'manager' : 'ar-specialist';
    this.router.navigate(['/app/denial-iq/claim-queue', queueSegment]);
  }

  goHome(): void {
    this.router.navigate(['/app/home']);
  }

  goToRules(): void {
    this.router.navigate(['/app/claim-vision/rules']);
  }

  goToPayerIqContracts(): void {
    this.router.navigate(['/app/payer-iq/contracts']);
  }

  goToPayerIqRootOrContracts(): void {
    if (this.isOnPayerIqContracts) {
      this.router.navigate(['/app/payer-iq']);
    } else {
      this.router.navigate(['/app/payer-iq/contracts']);
    }
  }

  private flattenLocations(loc: LocationSelection): string[] {
    switch (loc.scope) {
      case 'enterprise': return [];
      case 'group':      return loc.groups ?? [];
      case 'practice':   return loc.practices ?? [];
      case 'location':   return loc.locations ?? [];
    }
  }

  private toPayerIqFilters(v: GlobalFiltersValue): PayerIqFiltersValue {
    return {
      startDate: v.startDate,
      endDate: v.endDate,
      payers: v.payers ?? [],
      providers: v.providers ?? [],
      locations: this.flattenLocations(v.location),
      plans: [],          // not in global UI yet
      leaseNetworks: [],  // not in global UI yet
    };
  }

  onGlobalFiltersApply(filters: GlobalFiltersValue): void {
    this.globalFiltersStore.set(filters);

    const payerIqFilters = this.toPayerIqFilters(filters);
    this.payerIqFiltersStore.set(payerIqFilters); // [ok] payer-iq dashboard listens to this
  }

}
