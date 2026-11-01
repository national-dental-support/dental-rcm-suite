import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { catchError, filter, map, startWith, Subscription, switchMap, of } from 'rxjs';


import { PayerIqFiltersStore } from '../../shared/components/global-filters/global-filters.store';
import { PayerPerformanceRow, LeaseNetworkRow } from '../../core/models/payer-iq.model';
import { PayerIqService, NetworkPayersDropdownResponse } from '../../core/services/payer-iq.service';

type Tab = { label: string; link: string };

@Component({
    selector: 'app-payer-iq',
    templateUrl: './payer-iq.component.html',
    styleUrls: ['./payer-iq.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PayerIQComponent implements OnDestroy {
  
  isContractsRoute = false;

  payerPerformanceData: PayerPerformanceRow[] = [];
  leaseNetworkData: LeaseNetworkRow[] = [];

  defaultSort = { active: 'varianceAmount', direction: 'desc' as const };

  private sub = new Subscription();

  // [ok] these become "real" lists (fed by API)
  payers: string[] = [];
  leaseNetworks: string[] = [];
  plans: string[] = [];
  providers: string[] = [];
  // keep mocked until you add endpoints for them
  // readonly plans = ['PPO', 'HMO', 'EPO', 'Indemnity'];
  // readonly providers = ['Dr. Jones', 'Dr. Patel', 'Dr. Nguyen', 'Dr. Smith'];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private filtersStore: PayerIqFiltersStore,
    private payerIqService: PayerIqService,
    private cdr: ChangeDetectorRef
  ) {
    // route tracking (your existing logic)
    this.sub.add(
      this.router.events
        .pipe(
          filter((e) => e instanceof NavigationEnd),
          startWith(null),
          map(() => this.getActiveChildPath(this.route))
        )
        .subscribe((childPath) => {
          this.isContractsRoute = childPath === 'contracts';
          this.cdr.markForCheck();
        })
    );

    // [ok] dropdown population from API (based on applied filters)
    // this.sub.add(
    //   this.filtersStore.applied$
    //     .pipe(
    //       switchMap((filters) =>
    //         this.payerIqService.getNetworkPayersDropdown(filters).pipe(
    //           catchError((err) => {
    //             // fail soft: keep empty options, don't break the whole page
    //             // eslint-disable-next-line no-console
    //             console.error('[PayerIQ] getNetworkPayersDropdown failed', err);
    //             const empty: NetworkPayersDropdownResponse = {
    //               message: 'failed',
    //               networks: [],
    //               networkPayers: [],
    //             };
    //             return of(empty);
    //           })
    //         )
    //       )
    //     )
    //     .subscribe((resp) => {
    //       // Lease Networks dropdown
    //       const networkNames = (resp.networks ?? [])
    //         .map((n) => n.NetworkName)
    //         .filter(Boolean);

    //       this.leaseNetworks = uniqueSorted(networkNames);

    //       // Payers dropdown
    //       // Optional dependency: if leaseNetworks are selected, only show those payers.
    //       const selectedNetworks = new Set(this.filtersStore.value.leaseNetworks ?? []);
    //       const payerNames = (resp.networkPayers ?? [])
    //         .filter((r) => !selectedNetworks.size || selectedNetworks.has(r.NetworkName))
    //         .map((r) => r.PayerName)
    //         .filter(Boolean);

    //       this.payers = uniqueSorted(payerNames);
    //       console.warn('PayerIQComponent -> constructor -> this.payers', this.payers);
    //       this.cdr.markForCheck();
    //     })
    // );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private getActiveChildPath(route: ActivatedRoute): string | null {
    let r: ActivatedRoute | null = route;
    while (r?.firstChild) r = r.firstChild;
    return r?.snapshot.routeConfig?.path ?? null;
  }

  // onGlobalFiltersApply(filters: PayerIqFiltersValue): void {
  //   // [ok] This makes filters persist across tabs
  //   this.filtersStore.set(filters);

  //   // Optional UX: update the payers list immediately based on the selected networks
  //   // (without waiting for an API response, since we already fetched the full dataset)
  //   // If you want this behavior, you'll need to keep resp.networkPayers cached in a field.
  // }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
