// src/app/core/services/medicare-dashboard-data.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, catchError, map, OperatorFunction } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Filters } from '../models/medicare-dashboard.types';

type AnyObj = Record<string, any>;

type LocationsAndGroupsResp = {
  practice_groups?: string[];
  practiceGroups?: string[];
  locations?: string[];
  items?: string[];
};

type ProvidersResp = {
  providers?: string[];
  items?: string[];
};

@Injectable({ providedIn: 'root' })
export class MedicareDashboardDataService {
  private customerId = '1';

  // ---- BASES (robust: guarantees exactly one "/api/analytics")
  private readonly apiBase = this.computeApiBase(environment.server.baseUrl);
  private readonly medicareBase = `${this.apiBase}/medicare-dashboard`;
  private readonly lookupsBase  = `${this.apiBase}/lookups`;

  constructor(private http: HttpClient) {
    // One-time log so you can verify the final URLs in the console
    // (remove after confirming)
    // eslint-disable-next-line no-console
    console.log('[MedicareDashboardDataService] apiBase:', this.apiBase,
      '\n  medicareBase:', this.medicareBase,
      '\n  lookupsBase:',  this.lookupsBase);
  }

  /** Ensure baseUrl ends with exactly "/api/analytics" */
  private computeApiBase(baseUrl: string): string {
    const b = (baseUrl || '').replace(/\/+$/, ''); // trim trailing slash
    if (b.endsWith('/api/analytics')) return b;
    if (b.endsWith('/api')) return `${b}/analytics`;
    return `${b}/api/analytics`;
  }

  /** Keep catchError typed */
  private safe<T>(fallback: T): OperatorFunction<T, T> {
    return catchError<T, Observable<T>>(() => of(fallback as T));
  }

  private payload(filters: Filters): AnyObj {
    return { customer_id: this.customerId, filters };
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/json' });
  }

  // ---------- LOOKUPS ----------
  getPracticeGroups(): Observable<string[]> {
    return this.http
      .post<LocationsAndGroupsResp>(
        `${this.lookupsBase}/locations-and-groups`,
        { customer_id: this.customerId },
        { headers: this.headers }
      )
      .pipe(
        map(r => r?.practice_groups ?? r?.practiceGroups ?? r?.items ?? []),
        this.safe<string[]>([])
      );
  }

  getLocations(practiceGroups: string[]): Observable<string[]> {
    return this.http
      .post<LocationsAndGroupsResp>(
        `${this.lookupsBase}/locations-and-groups`,
        { customer_id: this.customerId, practice_groups: practiceGroups ?? [] },
        { headers: this.headers }
      )
      .pipe(
        map(r => r?.locations ?? r?.items ?? []),
        this.safe<string[]>([])
      );
  }

  getProviders(filters: Filters): Observable<string[]> {
    const f = filters ?? ({} as Filters);
    return this.http
      .post<ProvidersResp>(
        `${this.lookupsBase}/providers`,
        {
          customer_id: this.customerId,
          filters: f,
          practice_groups: Array.isArray(f.practice_groups) ? f.practice_groups : [],
          locations: Array.isArray(f.location) ? f.location : [],
        },
        { headers: this.headers }
      )
      .pipe(
        map(r => r?.providers ?? r?.items ?? []),
        this.safe<string[]>([])
      );
  }

  // ---------- CHARTS ----------
  getCptAndClaimCounts(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/procedure-and-claim-counts`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  getChargesVsMedicare(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/charges-vs-medicare`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  getPaymentsVsMedicare(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/payments-vs-medicare`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  getUncollectedMedicarePerClaim(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/uncollected-medicare-per-claim`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  getUncollectedMCRPerClaim(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/uncollected-mcr-per-claim`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  getUncollectedMedicarePerClaimMix(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/uncollected-medicare-per-claim-mix`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  getMedicareByCptGroup(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/medicare-by-cpt-group`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  getUncollectedMedicareByCptGroup(filters: Filters): Observable<any> {
    return this.http
      .post<any>(`${this.medicareBase}/uncollected-medicare-by-cpt-group`, this.payload(filters), { headers: this.headers })
      .pipe(this.safe<any>([]));
  }

  setCustomerId(id: string) { this.customerId = id; }
}
