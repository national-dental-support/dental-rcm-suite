import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AnalyticsService } from '../services/analytics.service';

@Injectable()
export class AnalyticsInterceptor implements HttpInterceptor {
  constructor(private analytics: AnalyticsService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      tap({
        error: (err) => {
          if (!(err instanceof HttpErrorResponse)) return;
          // Guard: never report analytics calls themselves (prevents infinite loop)
          if (req.url.includes('/analytics/events')) return;
          if (err.status < 400) return;

          this.analytics.trackError({
            errorType: 'http',
            message: `HTTP ${err.status} on ${req.method} ${req.url}`,
            httpStatus: err.status,
            httpMethod: req.method,
            httpUrl: req.url,
          });
        },
      })
    );
  }
}
