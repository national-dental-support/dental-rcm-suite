import { Injectable, Injector } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.services';

/**
 * Adds request context the API needs beyond authentication: impersonation and
 * the active tenant.
 *
 * The acting user itself is NOT asserted here - the server derives that from
 * the bearer token attached by AuthTokenInterceptor. Impersonation sends only a
 * target user id, which the server authorises before honouring.
 */
@Injectable()
export class ApiKeyInterceptor implements HttpInterceptor {
  // Injector (not AuthService directly) breaks the AuthService <-> HttpClient <-> interceptor
  // circular dependency; AuthService is resolved lazily only when a logout is needed.
  constructor(private injector: Injector) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isApiCall(req.url)) return next.handle(req);

    const headers: Record<string, string> = {};

    // Impersonation: send the target user id only. The server verifies the real
    // actor is a Super Admin, writes an audit record, and only then switches
    // context to the target user.
    const impersonating = sessionStorage.getItem('impersonating');
    if (impersonating) {
      try {
        const imp = JSON.parse(impersonating);
        // Validate the id is a positive integer before sending - prevents header injection
        if (imp.id && Number.isInteger(imp.id) && imp.id > 0) {
          headers['x-impersonate-user-id'] = String(imp.id);
        }
      } catch { /* ignore malformed data */ }
    }

    // Tenant context: sent on all API requests so every page shows the selected
    // tenant's data. The server honours it only for Super Admins.
    const activeEnterprise = localStorage.getItem('rcm_active_enterprise');
    if (activeEnterprise) {
      try {
        const ent = JSON.parse(activeEnterprise);
        if (ent.id) headers['x-xen-customer-id'] = String(ent.id);
      } catch { /* ignore */ }
    }

    const timeoutMs = req.url.includes('/ai/') ? 150_000 : 30_000;
    return next.handle(req.clone({ setHeaders: headers })).pipe(
      timeout(timeoutMs),
      catchError(err => {
        if (err.status === 401 && err.error?.code === 'SESSION_EXPIRED') {
          // Clear identity and app state so the next sign-in starts clean and
          // yields a fresh token. Resolved lazily via Injector to avoid the
          // AuthService <-> HttpClient <-> interceptor cycle.
          try {
            this.injector.get(AuthService).logout();
          } catch {
            sessionStorage.removeItem('impersonating');
            sessionStorage.removeItem('rcm_subscription_state');
          }
        }
        // Do NOT clear impersonation on generic 403s: a 403 while impersonating
        // just means the impersonated role lacks access to that endpoint, which
        // is correct behaviour.
        return throwError(() => err);
      }),
    );
  }

  private isApiCall(url: string): boolean {
    const base = environment.server.baseUrl;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return !!base && url.startsWith(base);
    }
    return url.startsWith(base) || url.startsWith('/');
  }
}
