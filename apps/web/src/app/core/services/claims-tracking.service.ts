import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClaimTrackingItem {
  ClaimID?: string;
  PatientName?: string;
  Status?: string;
  [key: string]: unknown;
}

export interface ClaimTrackingResponse {
  data?: ClaimTrackingItem[];
  claims?: ClaimTrackingItem[];
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class ClaimsTrackingService {
  private apiUrl = `${environment.server.baseUrl}/claims`;
  private claimsTrackingDataSubject = new BehaviorSubject<ClaimTrackingItem[]>([]);
  claimsTrackingData$ = this.claimsTrackingDataSubject.asObservable();

  constructor(private http: HttpClient) {}

  getClaims(locationIds: number[]): Observable<ClaimTrackingResponse> {
    const params = new HttpParams().set('data', JSON.stringify({ location_ids: locationIds }));
    return this.http.get<ClaimTrackingResponse>(this.apiUrl, { params });
  }

  getClaimDenials(locationIds: number[]): Observable<ClaimTrackingResponse> {
    return this.http.get<ClaimTrackingResponse>(`${this.apiUrl}/denials`, {
      params: new HttpParams().set('data', JSON.stringify({ location_ids: locationIds })),
    });
  }

  getArchivedClaims(locationIds: number[]): Observable<ClaimTrackingResponse> {
    return this.http.get<ClaimTrackingResponse>(`${this.apiUrl}/archives`, {
      params: new HttpParams().set('location_id', locationIds.join(',')),
    });
  }

  setClaimsTrackingData(data: ClaimTrackingItem[]): void {
    this.claimsTrackingDataSubject.next(data);
  }

  getClaimsTrackingData(): Observable<ClaimTrackingItem[]> {
    return this.claimsTrackingData$;
  }
}
