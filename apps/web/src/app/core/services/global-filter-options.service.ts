import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { GlobalFilterOptions } from '../../shared/components/global-filters/global-filters.models';

@Injectable({ providedIn: 'root' })
export class GlobalFilterOptionsService {
  private readonly baseUrl = environment.server.baseUrl;
  private readonly payersUrl = `${this.baseUrl}/payers`;
  private readonly practicesUrl = `${this.baseUrl}/practices`;
  private readonly providersUrl = `${this.baseUrl}/providers`;
  private readonly locationsUrl = `${this.baseUrl}/locations`;
  private readonly groupsUrl = `${this.baseUrl}/groups`;

  constructor(private http: HttpClient) {}

  getRefinedOptions(selections: {
    practices?: string[];
    locations?: string[];
    payers?: string[];
    providers?: string[];
  }): Observable<{ practices: string[]; locations: string[]; payers: string[]; providers: string[] }> {
    return this.http.post<{ practices: string[]; locations: string[]; payers: string[]; providers: string[] }>(
      `${this.baseUrl}/filter-options/refined`,
      selections,
    ).pipe(catchError(() => of({ practices: [], locations: [], payers: [], providers: [] })));
  }

  getGlobalFilterOptions(): Observable<GlobalFilterOptions> {
    return forkJoin({
      payers: this.http.get<{ data: string[] }>(this.payersUrl).pipe(map(r => r.data), catchError(() => of([]))),
      practices: this.http.get<{ data: string[] }>(this.practicesUrl).pipe(map(r => r.data), catchError(() => of([]))),
      providers: this.http.get<{ data: string[] }>(this.providersUrl).pipe(map(r => r.data), catchError(() => of([]))),
      locations: this.http.get<{ data: string[] }>(this.locationsUrl).pipe(map(r => r.data), catchError(() => of([]))),
      groups: this.http.get<{ data: any[] }>(this.groupsUrl).pipe(
        map(res => res.data || []),
        catchError(() => of([]))
      ),
    }).pipe(
      map(({ payers, practices, providers, locations, groups }) => {
        const isRich = groups.length > 0 && typeof groups[0] === 'object';
        const groupNames: string[] = isRich
          ? (groups as any[]).map((g: any) => g.name)
          : (groups as string[]);
        const groupsData = isRich ? (groups as any[]) : [];

        // Derive location list from groups data - these are city-name values that
        // match recon_report.Location exactly. Prefer this over /api/locations
        // which returns OrgLocation display names (e.g. "Apple Valley Office")
        // that do not match claim data.
        const locationsFromGroups: string[] = isRich
          ? Array.from(new Set(
              groupsData.flatMap((g: any) => (g.locations || []).map((l: any) => l.name as string))
            )).sort()
          : [];

        return {
          payers,
          practices,
          providers,
          groups: groupNames,
          locations: locationsFromGroups.length > 0 ? locationsFromGroups : locations,
          groupsData,
        };
      })
    );
  }
}
