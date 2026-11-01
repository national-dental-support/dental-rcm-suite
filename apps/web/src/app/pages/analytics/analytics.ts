import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ClaimsTrackingService } from '../../core/services/claims-tracking.service';
import { EnterpriseService } from '../../core/services/enterprise.service';


@Component({
    selector: 'app-analytics',
    templateUrl: './analytics.html',
    styleUrls: ['./analytics.scss'],
    standalone: false
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  claimsTrackingData$!: Observable<any>;

  private readonly baseTabs = [
      // { label: 'Reports', link: './blob' },
      { label: 'Payer Mix', link: './payer-mix' },
      { label: 'RCM', link: './rcm' },
      { label: 'AR', link: './ar' },
      { label: 'Medicare Dashboard', link: './medicare-dashboard' },
  ];
  tabs = [...this.baseTabs];

  private entSub?: Subscription;

  constructor(
    private claimsTrackingService: ClaimsTrackingService,
    private enterpriseService: EnterpriseService,
  ) {}

  ngOnInit(): void {
    console.log('[AnalyticsComponent] init');
    this.claimsTrackingData$ = this.claimsTrackingService.getClaimsTrackingData();

    this.rebuildTabs();
    this.entSub = this.enterpriseService.active$.subscribe(() => {
      this.rebuildTabs();
    });
  }

  ngOnDestroy(): void {
    this.entSub?.unsubscribe();
  }

  private rebuildTabs(): void {
    this.tabs = [...this.baseTabs];
  }
}
