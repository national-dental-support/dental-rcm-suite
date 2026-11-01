import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.services';
import { RpDialogService } from '../../shared/components/dialogs/dialog-shell/dialog.service';
import { environment } from '../../../environments/environment';

// HIPAA Sec.164.312(a)(2)(iii) - automatic logoff after 30 min inactivity.
// Warn user 5 minutes before logout to allow session extension.
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;              // 30 minutes
const WARNING_BUFFER_MS  = 5 * 60 * 1000;               // warn 5 min before logout
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

@Injectable({ providedIn: 'root' })
export class IdleTimeoutService implements OnDestroy {
  private warningTimer: any;
  private logoutTimer: any;
  private warningOpen = false;
  private started = false;
  private boundReset = this.resetTimers.bind(this);

  private logoutMs = DEFAULT_TIMEOUT_MS;
  private warningMs = DEFAULT_TIMEOUT_MS - WARNING_BUFFER_MS;

  constructor(
    private authService: AuthService,
    private dialogService: RpDialogService,
    private ngZone: NgZone,
    private http: HttpClient,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    // Fetch configured timeout from server
    this.fetchTimeoutConfig();

    // Listen outside Angular zone to avoid constant change detection
    this.ngZone.runOutsideAngular(() => {
      for (const evt of ACTIVITY_EVENTS) {
        document.addEventListener(evt, this.boundReset, { passive: true });
      }
    });

    this.resetTimers();
  }

  stop(): void {
    this.started = false;
    clearTimeout(this.warningTimer);
    clearTimeout(this.logoutTimer);
    for (const evt of ACTIVITY_EVENTS) {
      document.removeEventListener(evt, this.boundReset);
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Re-fetch timeout from server and restart timers with new values */
  refreshConfig(): void {
    this.fetchTimeoutConfig();
  }

  private fetchTimeoutConfig(): void {
    this.http.get<{ minutes: number }>(
      `${environment.server.baseUrl}/admin/settings/session-timeout`
    ).subscribe({
      next: (res) => {
        if (res?.minutes && res.minutes > 0) {
          this.logoutMs = res.minutes * 60 * 1000;
          this.warningMs = Math.max(this.logoutMs - WARNING_BUFFER_MS, this.logoutMs * 0.8);
          this.resetTimers();
        }
      },
      error: () => {
        // Keep defaults on error
      },
    });
  }

  private resetTimers(): void {
    clearTimeout(this.warningTimer);
    clearTimeout(this.logoutTimer);

    this.warningTimer = setTimeout(() => this.showWarning(), this.warningMs);
    this.logoutTimer  = setTimeout(() => this.performLogout(), this.logoutMs);
  }

  private showWarning(): void {
    if (this.warningOpen) return;
    this.warningOpen = true;

    const minutesLeft = Math.ceil((this.logoutMs - this.warningMs) / 60000);

    this.ngZone.run(() => {
      this.dialogService.open({
        title: 'Session Expiring',
        message: `Your session will expire in ${minutesLeft} minute(s) due to inactivity. Click "Stay Logged In" to continue.`,
        tone: 'warning',
        icon: 'schedule',
        disableClose: true,
        actions: {
          cancelText: 'Log Out',
          primaryText: 'Stay Logged In',
          primaryColor: 'primary',
        },
      }).subscribe(result => {
        this.warningOpen = false;
        if (result?.action === 'primary') {
          this.resetTimers();
        } else {
          this.performLogout();
        }
      });
    });
  }

  private performLogout(): void {
    this.stop();
    this.ngZone.run(() => {
      this.authService.logout();
    });
  }
}
