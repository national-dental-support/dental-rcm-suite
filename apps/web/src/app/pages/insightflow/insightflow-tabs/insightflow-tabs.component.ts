import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { NetworkPayersDropdownResponse, PayerIqService } from '../../../core/services/payer-iq.service';
import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { catchError, of, Subscription, switchMap } from 'rxjs';
import { PayerIqFiltersValue } from '../../../shared/components/global-filters/global-filters.models';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { EnterpriseService } from '../../../core/services/enterprise.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ProductSlug } from '../../../core/models/master-claim.model';

type Tab = { label: string; link: string; icon?: string };
type GatedTab = Tab & { requiresSlug: ProductSlug };

@Component({
    selector: 'app-insightflow-tabs',
    templateUrl: './insightflow-tabs.component.html',
    styleUrls: ['./insightflow-tabs.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class InsightflowTabsComponent implements OnDestroy {

  private sub = new Subscription();
  payers: string[] = [];

  /** Core analytics - always visible */
  primaryTabs: Tab[] = [];
  /** Tabs for unsubscribed modules - shown locked/disabled */
  lockedTabs: Tab[] = [];

  private readonly coreTabs: Tab[] = [
    { label: 'Executive Summary',    link: 'summary'               },
    { label: 'Accounts Receivable',  link: 'ar'                    },
    { label: 'Revenue Cycle',        link: 'rcm'                   },
    { label: 'Bad Debt',             link: 'bad-debt'              },
    { label: 'Cycle Time',           link: 'cycle-time'            },
    { label: 'Appeal Success',       link: 'appeal-success'        },
    { label: 'CPT Denial Risk',      link: 'cpt-denial'            },
  ];

  /** Tabs that require a specific product subscription */
  private readonly gatedTabDefs: GatedTab[] = [
    { label: 'Denial Management',    link: 'denials',    requiresSlug: 'denial-iq'  },
    { label: 'Payer Mix',            link: 'payer-mix',  requiresSlug: 'payer-iq'   },
    { label: 'Financial Overview',   link: 'financial',  requiresSlug: 'recon-iq'   },
  ];

  /** Secondary tools - shown in overflow menu (hidden when enableInsightFlowTools === false) */
  readonly toolsTabs: Tab[] = (environment as any).enableInsightFlowTools === false ? [] : [
    { label: 'Industry Benchmarks', link: 'benchmarking',         icon: 'leaderboard'    },
    // { label: 'Custom Report',       link: 'custom',               icon: 'tune'          }, // disabled while Superset is off
  ];

  activeTab = '';

  constructor(
    private filtersStore: PayerIqFiltersStore,
    private payerIqService: PayerIqService,
    private cdr: ChangeDetectorRef,
    private analytics: AnalyticsService,
    private router: Router,
    private enterpriseService: EnterpriseService,
    private subscriptionSvc: SubscriptionService,
  ) {
    this.primaryTabs = this.buildTabs(this.enterpriseService.activeEnterprise?.slug);

    // Rebuild when the active enterprise changes
    this.sub.add(
      this.enterpriseService.active$.subscribe(ent => {
        this.primaryTabs = this.buildTabs(ent?.slug);
        this.cdr.markForCheck();
      })
    );

    // Rebuild when subscriptions are loaded/refreshed
    this.sub.add(
      this.subscriptionSvc.state$.subscribe(() => {
        this.primaryTabs = this.buildTabs(this.enterpriseService.activeEnterprise?.slug);
        this.cdr.markForCheck();
      })
    );

    this.sub.add(
      this.filtersStore.applied$
        .pipe(
          switchMap((filters) =>
            this.payerIqService.getNetworkPayersDropdown(filters).pipe(
              catchError((err) => {
                console.error('[PayerIQ] getNetworkPayersDropdown failed', err);
                const empty: NetworkPayersDropdownResponse = { message: 'failed', networks: [], networkPayers: [] };
                return of(empty);
              })
            )
          )
        )
        .subscribe((resp) => {
          this.payers = this.uniqueSorted((resp.networkPayers ?? []).map(r => r.PayerName).filter(Boolean));
          this.cdr.markForCheck();
        })
    );
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  private buildTabs(slug?: string): Tab[] {
    const available = this.gatedTabDefs.filter(t => this.subscriptionSvc.isSubscribed(t.requiresSlug));
    this.lockedTabs = this.gatedTabDefs
      .filter(t => !this.subscriptionSvc.isSubscribed(t.requiresSlug))
      .map(({ label, link }) => ({ label, link }));
    return [
      ...this.coreTabs,
      ...available.map(({ label, link }) => ({ label, link })),
    ];
  }

  trackByLabel(_: number, t: Tab) { return t.label; }

  trackTabClick(tab: Tab): void {
    const previous = this.activeTab;
    this.activeTab = tab.link;
    this.analytics.track('insightflow_tab_changed', { toTab: tab.link, fromTab: previous });
  }

  /** Returns true if the current route is one of the tools routes */
  isToolsRouteActive(): boolean {
    const url = this.router.url;
    return this.toolsTabs.some(t => url.includes(`/view/${t.link}`));
  }

  onGlobalFiltersApply(filters: PayerIqFiltersValue): void {
    this.filtersStore.set(filters);
    this.analytics.track('insightflow_global_filter_applied', {
      payerCount: filters.payers?.length ?? 0,
      networkCount: filters.leaseNetworks?.length ?? 0,
    });
  }

  uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }
}
