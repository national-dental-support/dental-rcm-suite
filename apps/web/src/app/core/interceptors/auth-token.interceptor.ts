import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SESSION_TOKEN_KEY } from '../services/auth.services';
import { environment } from '../../../environments/environment';

/**
 * Attaches the session bearer token to API requests.
 *
 * The server derives the acting user from this token, so the browser never
 * asserts an identity of its own.
 */
@Injectable()
export class AuthTokenInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.isApiRequest(req.url)) return next.handle(req);
    if (req.headers.has('Authorization')) return next.handle(req);

    const token = this.readToken();
    if (!token) return next.handle(req);

    return next.handle(
      req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
    );
  }

  private isApiRequest(url: string): boolean {
    const base = environment.server.baseUrl;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return !!base && url.startsWith(base);
    }
    // Relative URL - same origin, so it is ours.
    return true;
  }

  private readToken(): string | null {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? localStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}
