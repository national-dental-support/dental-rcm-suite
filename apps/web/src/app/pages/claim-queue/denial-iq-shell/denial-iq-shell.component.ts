import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthStore } from '../../../store/global/auth.store';

const MANAGER_ROLES = ['Manager', 'Admin', 'Super Admin'];
const ADMIN_ROLES   = ['Admin', 'Super Admin'];

@Component({
    selector: 'app-denial-iq-shell',
    templateUrl: './denial-iq-shell.component.html',
    styleUrls: ['./denial-iq-shell.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DenialIqShellComponent implements OnInit, OnDestroy {
  showManagerTab = false;
  showAdminTab   = false;
  activeLink     = 'dashboard';

  private currentRole = '';
  private sub = new Subscription();

  constructor(
    private authStore: AuthStore,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Role-based tab visibility
    this.sub.add(
      this.authStore.userRole$.subscribe(role => {
        this.currentRole    = role;
        this.showManagerTab = MANAGER_ROLES.includes(role);
        this.showAdminTab   = ADMIN_ROLES.includes(role);
        this.cdr.markForCheck();
      }),
    );

    // Sync active link to current route
    this.syncActiveLink(this.router.url);
    this.sub.add(
      this.router.events
        .pipe(filter(e => e instanceof NavigationEnd))
        .subscribe((e: NavigationEnd) => {
          this.syncActiveLink(e.urlAfterRedirects);
          this.cdr.markForCheck();
        }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private syncActiveLink(url: string): void {
    if (url.includes('/denial-iq/claim-queue'))           this.activeLink = 'claim-queue';
    else if (url.includes('/denial-iq/write-offs'))       this.activeLink = 'write-offs';
    else if (url.includes('/denial-iq/compliance-checker')) this.activeLink = 'compliance-checker';
    else if (url.includes('/denial-iq/patient-advocacy')) this.activeLink = 'patient-advocacy';
    else if (url.includes('/denial-iq/manager'))          this.activeLink = 'manager';
    else if (url.includes('/denial-iq/admin-settings'))   this.activeLink = 'admin-settings';
    else                                                   this.activeLink = 'dashboard';
  }

  navigate(segment: string): void {
    this.router.navigate(['/app/denial-iq', segment]);
  }

  navigateToQueue(): void {
    const queue = MANAGER_ROLES.includes(this.currentRole) ? 'manager' : 'ar-specialist';
    this.router.navigate(['/app/denial-iq/claim-queue', queue]);
  }
}
