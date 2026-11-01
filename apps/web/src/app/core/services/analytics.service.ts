import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { EMPTY, catchError, filter } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TrackErrorPayload {
  errorType: 'js_unhandled' | 'http' | 'component';
  message: string;
  stack?: string;
  httpStatus?: number;
  httpMethod?: string;
  httpUrl?: string;
}

/** Map URL prefixes to product slugs */
const ROUTE_PRODUCT_MAP: Record<string, string> = {
  '/app/denial-iq': 'denial-iq',
  '/app/insightflow': 'insightflow',
  '/app/recon-iq': 'recon-iq',
  '/app/claim-vision': 'claim-vision',
  '/app/payer-iq': 'payer-iq',
  '/app/admin': 'admin',
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService implements OnDestroy {
  private readonly sessionId = this.initSessionId();
  private readonly base = environment.server.baseUrl;
  private heartbeatInterval: any;
  private currentPageVisitId: number | null = null;
  private trackingStarted = false;
  private boundBeforeUnload = this.onBeforeUnload.bind(this);

  constructor(
    private http: HttpClient,
    private router: Router,
    private ngZone: NgZone,
  ) {}

  /** Start session tracking - call once from LayoutComponent */
  startTracking(): void {
    if (this.trackingStarted) return;
    this.trackingStarted = true;

    // Heartbeat every 60 seconds
    this.ngZone.runOutsideAngular(() => {
      this.sendHeartbeat();
      this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 60_000);
      window.addEventListener('beforeunload', this.boundBeforeUnload);
    });

    // Track page navigations
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(event => this.onPageNavigate(event.urlAfterRedirects));

    // Track initial page
    this.onPageNavigate(this.router.url);
  }

  track(eventName: string, properties: Record<string, unknown> = {}): void {
    this.send(`${this.base}/analytics/events/track`, {
      sessionId: this.sessionId,
      userId: this.userId(),
      url: this.router.url,
      timestamp: new Date().toISOString(),
      eventName,
      properties,
    });
  }

  trackError(partial: TrackErrorPayload): void {
    this.send(`${this.base}/analytics/events/error`, {
      sessionId: this.sessionId,
      userId: this.userId(),
      url: this.router.url,
      timestamp: new Date().toISOString(),
      ...partial,
    });
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }

  private stopTracking(): void {
    clearInterval(this.heartbeatInterval);
    window.removeEventListener('beforeunload', this.boundBeforeUnload);
  }

  private sendHeartbeat(): void {
    this.send(`${this.base}/analytics/sessions/heartbeat`, {
      sessionId: this.sessionId,
      email: this.userId(),
    });
  }

  private onPageNavigate(url: string): void {
    // Exit previous page
    if (this.currentPageVisitId != null) {
      this.send(`${this.base}/analytics/sessions/page-exit`, {
        pageVisitId: this.currentPageVisitId,
      });
      this.currentPageVisitId = null;
    }

    // Enter new page
    const slug = this.resolveProductSlug(url);
    this.http
      .post<{ pageVisitId: number }>(`${this.base}/analytics/sessions/page-enter`, {
        sessionId: this.sessionId,
        email: this.userId(),
        pagePath: url,
        productSlug: slug,
      })
      .pipe(catchError(() => EMPTY))
      .subscribe(res => {
        if (res?.pageVisitId) this.currentPageVisitId = res.pageVisitId;
      });
  }

  private onBeforeUnload(): void {
    const email = this.userId();
    // Use sendBeacon for reliability on page close
    const blob = (data: object) => new Blob([JSON.stringify(data)], { type: 'application/json' });

    if (this.currentPageVisitId != null) {
      navigator.sendBeacon(
        `${this.base}/analytics/sessions/page-exit`,
        blob({ pageVisitId: this.currentPageVisitId }),
      );
    }

    navigator.sendBeacon(
      `${this.base}/analytics/sessions/end`,
      blob({ sessionId: this.sessionId }),
    );
  }

  private resolveProductSlug(url: string): string | null {
    for (const [prefix, slug] of Object.entries(ROUTE_PRODUCT_MAP)) {
      if (url.startsWith(prefix)) return slug;
    }
    return null;
  }

  private send(endpoint: string, payload: unknown): void {
    // Skip telemetry on unauthenticated routes, such as page_view events fired
    // from AppComponent on the /signin NavigationEnd.
    if (!this.currentEmail()) return;
    this.http
      .post(endpoint, payload)
      .pipe(catchError(() => EMPTY))
      .subscribe();
  }

  private userId(): string {
    return this.currentEmail() ?? 'anonymous';
  }

  private currentEmail(): string | null {
    try {
      return sessionStorage.getItem('xUserEmail') ?? localStorage.getItem('xUserEmail');
    } catch {
      return null;
    }
  }

  private initSessionId(): string {
    const KEY = 'rcm:sessionId';
    return (
      sessionStorage.getItem(KEY) ??
      (() => {
        const id = crypto.randomUUID();
        sessionStorage.setItem(KEY, id);
        return id;
      })()
    );
  }
}
