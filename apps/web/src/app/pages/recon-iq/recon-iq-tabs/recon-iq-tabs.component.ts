import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';
import { map, startWith } from 'rxjs/operators';
import { SubscriptionService } from '../../../core/services/subscription.service';

type Tab = { label: string; link: string };

const ADMIN_ROLES = ['Admin', 'Super Admin'];

@Component({
    selector: 'app-recon-iq-tabs',
    templateUrl: './recon-iq-tabs.component.html',
    styleUrls: ['./recon-iq-tabs.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconIQTabsComponent {
  readonly dashboardTab: Tab = { label: 'Dashboard', link: 'dashboard' };

  readonly nonAdminTabs: Tab[] = [
    { label: 'ERA Upload',             link: 'era-ingestion' },
    { label: 'Encounter Research',     link: 'encounter-research' },
    { label: 'Matching',               link: 'matching' },
    { label: 'Payment Reconciliation', link: 'payment-reconciliation' },
    { label: 'Secondary Billing',      link: 'secondary-billing' },
    { label: 'Bank Accounts',          link: 'bank-accounts' },
  ];

  readonly isAdmin$ = this.subSvc.userRole$.pipe(
    map(role => ADMIN_ROLES.includes(role))
  );

  readonly otherTabs$ = this.isAdmin$.pipe(
    map(isAdmin => isAdmin
      ? [...this.nonAdminTabs, { label: 'Admin', link: 'admin' }]
      : this.nonAdminTabs
    )
  );

  readonly showFullyReconciledTab$ = this.router.events.pipe(
    startWith(null),
    map(() => this.router.url.endsWith('/recon-iq/fully-reconciled-posted'))
  );

  constructor(
    private router: Router,
    private subSvc: SubscriptionService,
  ) {}

  trackByLabel(_: number, t: Tab) {
    return t.label;
  }
}
