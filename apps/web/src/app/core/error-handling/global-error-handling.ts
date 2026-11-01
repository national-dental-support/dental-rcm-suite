import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { AnalyticsService } from '../services/analytics.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // Inject Injector (not AnalyticsService directly) - ErrorHandler is bootstrapped
  // before the full DI tree exists. Injector itself is always safe to inject early.
  constructor(private injector: Injector) {}

  handleError(error: any): void {
    try {
      this.injector.get(AnalyticsService).trackError({
        errorType: 'js_unhandled',
        message: error?.message ?? String(error),
        stack: error?.stack,
      });
    } catch {
      // Never let analytics crash the error handler
    }
    console.error('Global error handler caught:', error);
  }
}
