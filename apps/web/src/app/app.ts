// app.component.ts
import { Component, NgZone, OnInit, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AnalyticsService } from './core/services/analytics.service';
import { SubscriptionService } from './core/services/subscription.service';
import { IdleTimeoutService } from './core/services/idle-timeout.service';
import { SocketService } from './core/services/socket.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';
import { CommandPaletteComponent } from './shared/components/command-palette/command-palette.component';
import { UserStoreService } from './core/stores/user-store.service';
import { ImpersonationService } from './core/services/impersonation.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private analytics: AnalyticsService,
    private subscriptionService: SubscriptionService,
    private idleTimeout: IdleTimeoutService,
    private socketService: SocketService,
    private usersStore: UserStoreService,
    private shortcuts: KeyboardShortcutsService,
    private dialog: MatDialog,
    private ngZone: NgZone,
    private impersonation: ImpersonationService,
  ) {
    let currentUrl = '';
    let enteredAt = 0;

    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        if (currentUrl) {
          this.analytics.track('page_exit', { url: currentUrl, durationMs: Date.now() - enteredAt });
        }
        currentUrl = e.urlAfterRedirects;
        enteredAt = Date.now();
        this.analytics.track('page_view', { url: currentUrl });
        this.impersonation.validate();
      }
    });
  }

  ngOnInit(): void {
    this.loadSubscriptions();

    // Start HIPAA idle timeout (15 min auto-logout) only when user is logged in
    const email = localStorage.getItem('xUserEmail');
    if (email) {
      this.idleTimeout.start();
      const user = this.usersStore.getUser();

    if (user?.userId) {
      this.socketService.connect();
      } else {
        console.warn('Socket not started: user not loaded yet');
      }
      
      this.shortcuts.start();
      this.shortcuts.onAction$
        .pipe(takeUntil(this.destroy$))
        .subscribe(action => {
          if (action === 'command-palette') {
            this.openCommandPalette();
          } else if (action === 'go-home') {
            this.router.navigate(['/app/home']);
          } else if (action === 'go-queue') {
            this.router.navigate(['/app/denial-iq/claim-queue/ar-specialist']);
          }
        });
    }
  }

  private openCommandPalette(): void {
    if (this.dialog.openDialogs.length) return;
    this.dialog.open(CommandPaletteComponent, {
      panelClass: 'command-palette-panel',
      backdropClass: 'command-palette-backdrop',
      hasBackdrop: true,
      width: '0',
      height: '0',
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.shortcuts.stop();
  }

  /** Load the signed-in user's product subscriptions, once an identity exists. */
  private loadSubscriptions(): void {
    const email = localStorage.getItem('xUserEmail') ?? sessionStorage.getItem('xUserEmail') ?? '';
    if (email) {
      this.subscriptionService.load();
      return;
    }

    // The identity is written on sign-in, which may complete just after
    // bootstrap. Poll briefly, then give up rather than spin.
    const check = setInterval(() => {
      const e = localStorage.getItem('xUserEmail') ?? sessionStorage.getItem('xUserEmail');
      if (e) {
        clearInterval(check);
        this.subscriptionService.load();
      }
    }, 500);
    setTimeout(() => clearInterval(check), 10000);
  }
}
