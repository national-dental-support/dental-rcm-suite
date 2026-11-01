import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { RequestObject } from '../shared/types/request-objects';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PayerMixService {
  private apiUrl = `${environment.server.baseUrl}/analytics/payer-mix`;
  private headers = new HttpHeaders();

  constructor(private http: HttpClient) {}

  getInsuranceCollections(data: RequestObject): Observable<{ total: number | null; prior_year: number | null }> {
    return this.http.post<any>(`${this.apiUrl}/insurance-collections`, data, { headers: this.headers }).pipe(
      map(response => ({ total: response.total ?? null, prior_year: response.prior_year ?? null })),
      catchError(err => {
        console.error('Error fetching insurance collections', err);
        return throwError(() => new Error('Failed to fetch insurance collections'));
      })
    );
  }

  getPatientCollections(data: RequestObject): Observable<{ total: number | null; prior_year: number | null }> {
    return this.http.post<any>(`${this.apiUrl}/patient-collections`, data, { headers: this.headers }).pipe(
      map(response => ({ total: response.total ?? null, prior_year: response.prior_year ?? null })),
      catchError(err => {
        console.error('Error fetching patient collections', err);
        return throwError(() => new Error('Failed to fetch patient collections'));
      })
    );
  }

  getCollectionTrends(data: RequestObject): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/collection-trends`, data, { headers: this.headers }).pipe(
      catchError(err => {
        console.error('Error fetching collection trends', err);
        return throwError(() => new Error('Failed to fetch collection trends'));
      })
    );
  }
}