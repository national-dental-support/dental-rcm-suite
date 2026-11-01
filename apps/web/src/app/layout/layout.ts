import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { AnalyticsService } from '../core/services/analytics.service';
import { IdleTimeoutService } from '../core/services/idle-timeout.service';
import { AuthStore } from '../store/global/auth.store';
import { RefDataStore } from '../store/global/ref-data.store';
import { SocketService } from '../core/services/socket.service';
import { UserStoreService } from '../core/stores/user-store.service';
import { SubscriptionService } from '../core/services/subscription.service';
import { ImpersonationService } from '../core/services/impersonation.service';

@Component({
    selector: 'app-layout',
    templateUrl: './layout.html',
    styleUrls: ['./layout.scss'],
    standalone: false
})
export class LayoutComponent implements OnInit {
  sidebarOpen = false;
  navCollapsed = false;
  isSuperAdmin = false;

  constructor(
    private analytics: AnalyticsService,
    private idleTimeout: IdleTimeoutService,
    private authStore: AuthStore,
    private refDataStore: RefDataStore,
    private socketService: SocketService,
    private usersStore: UserStoreService,
    private subscriptionService: SubscriptionService,
    public impersonation: ImpersonationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.analytics.startTracking();
    this.idleTimeout.start();
    // Bootstrap global stores once - all child components subscribe without re-fetching
    this.authStore.init();
    this.refDataStore.load();

    const user = this.usersStore.getUser();
    if (user?.userId) {
      this.socketService.connect();
    } else {
      console.warn('Socket not started: user not loaded yet');
    }

    this.subscriptionService.isSuperAdmin$.subscribe(val => {
      this.isSuperAdmin = val;
    });
    this.cdr.detectChanges();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }
}
