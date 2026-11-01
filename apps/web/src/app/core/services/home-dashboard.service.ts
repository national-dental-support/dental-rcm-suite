import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ErrorDisplayService } from './error-display.service';

const BASE = environment.server.baseUrl;

export interface HomeWidgetData {
  checkInsToday:   number;
  roomsAvailable:  number;
  openInvoices:    number;
  rpmAlerts:       number;
  telehealthToday: number;
  pendingFaxes:    number;
}

const EMPTY_STATS: HomeWidgetData = {
  checkInsToday:   0,
  roomsAvailable:  0,
  openInvoices:    0,
  rpmAlerts:       0,
  telehealthToday: 0,
  pendingFaxes:    0,
};

@Injectable({ providedIn: 'root' })
export class HomeDashboardService {
  constructor(
    private http: HttpClient,
    private errors: ErrorDisplayService,
  ) {}

  /**
   * Fetches all six home dashboard widget counts in a single request.
   * On error: logs the failure (console + snackbar) and returns zero-filled defaults.
   * Silent swallowing is NOT acceptable here; errors are always surfaced to ErrorDisplayService.
   */
  getStats(): Observable<HomeWidgetData> {
    return this.http.get<HomeWidgetData>(`${BASE}/home/stats`).pipe(
      catchError(err => {
        this.errors.log('HomeDashboard/stats', err);
        this.errors.show('Dashboard stats unavailable \u2014 check server connectivity.');
        return of(EMPTY_STATS);
      }),
    );
  }
}
