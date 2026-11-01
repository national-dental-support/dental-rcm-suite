// src/app/core/services/ar-locations.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment'
import { Filters, LocationsAndGroups } from '../models/ar-types';

type ProvidersRes = { providers: string[] };

@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly base = environment.server.baseUrl; // '/api'
  // flip to true when the backend lookups routes are live
  private readonly enableHttp = true;

  constructor(private http: HttpClient) {}

  /**
   * Practice Groups + Locations
   * POST /api/analytics/lookups/locations-and-groups
   * body: { practiceGroups: string[] }
   */
  fetch(practiceGroups: string[]): Observable<LocationsAndGroups> {
    if (!this.enableHttp) {
      return of({ locations: [], practiceGroups: [] });
    }

    return this.http
      .post<LocationsAndGroups>(
        `${this.base}/analytics/lookups/locations-and-groups`,
        { practiceGroups }
      )
      .pipe(
        catchError(() => of({ locations: [], practiceGroups: [] }))
      );
  }

  /**
   * Providers (filtered by PG + Location)
   * POST /api/analytics/lookups/providers
   * body: { practice_groups: string[], locations: string[] }
   */
  fetchProviders(f: Filters): Observable<string[]> {
    if (!this.enableHttp) return of([]);

    return this.http
      .post<ProvidersRes>(`${this.base}/analytics/lookups/providers`, {
        practice_groups: f.practice_groups ?? [],
        locations: f.location ?? [],
      })
      .pipe(
        map(r => r?.providers ?? []),
        catchError(() => of([]))
      );
  }
}
