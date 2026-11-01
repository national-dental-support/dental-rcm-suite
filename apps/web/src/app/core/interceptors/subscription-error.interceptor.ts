import { Injectable, Injector } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class SubscriptionErrorInterceptor implements HttpInterceptor {
  // Lazy getters via Injector avoid NG0200 circular-DI with HTTP_INTERCEPTORS
  private get router(): Router { return this.injector.get(Router); }
  private get snackBar(): MatSnackBar { return this.injector.get(MatSnackBar); }

  constructor(private injector: Injector) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (
          error.status === 403 &&
          error.error?.subscriptionRequired
        ) {
          const product = error.error.product || 'this product';
          this.snackBar.open(
            `Your organization does not have access to ${product}. Contact your administrator.`,
            'Dismiss',
            { duration: 6000, panelClass: 'snackbar-warn' },
          );
          this.router.navigate(['/app/home']);
        }
        return throwError(() => error);
      }),
    );
  }
}
