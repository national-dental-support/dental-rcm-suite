import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { RequestObject } from '../models/types';

export interface Response {
  total: number | null;
  prior_year: number | null;
}

export interface ProceduresAndClaimCountsDto {
  date_of_service: string;
  cpt_count: number;
  claims_count: number;
  cpt_per_claim: number;
}

/* Payments vs Medicare */
export interface PaymentsVsMedicareDto {
  payer: string; // Example: "Medicare"
  date_of_service: string; // Example: "2023-10" in format 'YYYY-MM'
  medicare_allowable: number; // Example: 118530
  payments: number; // Example: 61894.24
  uncollected: number; // Example: 247951.24
  percent_of_payments: number; // Example: 24.96
}

@Injectable({ providedIn: 'root' })
export class MedicareDashboardService {
  private baseUrl = environment.server.baseUrl;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/json' });
  }

  private postData<T>(endpoint: string, payload: RequestObject): Observable<T | undefined> {
    if (!payload.customer_id) {
      console.warn(`MedicareDashboardService: ${endpoint} - Missing customer_id`);
      return throwError(() => new Error('Customer ID is required.'));
    }

    return this.http.post<T>(`${this.baseUrl}${endpoint}`, payload, { headers: this.getHeaders() }).pipe(
      map(data => data),
      catchError(err => {
        console.error(`Error at ${endpoint}`, err);
        return throwError(() => err);
      })
    );
  }

  getProceduresAndClaimCounts(pData: RequestObject) {
    return this.postData<Response | ProceduresAndClaimCountsDto[]>('/analytics/medicare-dashboard/procedure-and-claim-counts', pData);
  }

  getChargesVsMedicare(pData: RequestObject) {
    return this.postData<Response | ProceduresAndClaimCountsDto[]>('/analytics/medicare-dashboard/charges-vs-medicare', pData);
  }

  getPaymentsVsMedicare(pData: RequestObject) {
    return this.postData<Response | PaymentsVsMedicareDto[]>('/analytics/medicare-dashboard/payments-vs-medicare', pData);
  }

  getUncollectedMedicarePerClaim(pData: RequestObject) {
    return this.postData<Response | ProceduresAndClaimCountsDto[]>('/analytics/medicare-dashboard/uncollected-medicare-per-claim', pData);
  }

  getUncollectedMCRPerClaim(pData: RequestObject) {
    return this.postData<Response | unknown[]>('/analytics/medicare-dashboard/uncollected-mcr-per-claim', pData);
  }

  getUncollectedMedicarePerClaimMix(pData: RequestObject) {
    return this.postData<Response | ProceduresAndClaimCountsDto[]>('/analytics/medicare-dashboard/uncollected-medicare-per-claim-mix', pData);
  }

  getMedicareByCptGroup(pData: RequestObject) {
    return this.postData<Response | ProceduresAndClaimCountsDto[]>('/analytics/medicare-dashboard/medicare-by-cpt-group', pData);
  }

  getUncollectedMedicareByCptGroup(pData: RequestObject) {
    return this.postData<Response | ProceduresAndClaimCountsDto[]>('/analytics/medicare-dashboard/uncollected-medicare-by-cpt-group', pData);
  }
}
