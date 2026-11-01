import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CollectionsForecast {
  historical: {
    month: string;
    collections: number;
    charges: number;
    claimCount: number;
    denialRate: number;
    isForecast: false;
  }[];
  forecast: {
    month: string;
    predictedCollections: number;
    predictedCharges: number;
    predictedDenialRate: number;
    confidence: number;
    isForecast: true;
  }[];
}

export interface ArAgingForecast {
  current: { ar0to30: number; ar31to60: number; ar61to90: number; ar90plus: number; totalClaims: number };
  forecast30day: { ar0to30: number; ar31to60: number; ar61to90: number; ar90plus: number };
  forecast60day: { ar0to30: number; ar31to60: number; ar61to90: number; ar90plus: number };
}

export interface DenialTrendForecast {
  payers: {
    payer: string;
    totalClaims: number;
    deniedClaims: number;
    denialRate: number;
    atRiskAmount: number;
    projectedDenials30Day: number;
  }[];
}

export interface ForecastFilters {
  practice_groups?: string[] | 'all';
  location?: string[] | 'all';
  provider?: string[] | 'all';
  payer?: string[] | 'all';
  date_of_service?: { start_date: string; end_date: string };
}

function buildForecastParams(filters: ForecastFilters): HttpParams {
  let params = new HttpParams();
  if (filters.practice_groups && filters.practice_groups !== 'all') {
    (filters.practice_groups as string[]).forEach(g => { params = params.append('groups', g); });
  }
  if (filters.location && filters.location !== 'all') {
    (filters.location as string[]).forEach(l => { params = params.append('locations', l); });
  }
  if (filters.provider && filters.provider !== 'all') {
    (filters.provider as string[]).forEach(p => { params = params.append('providers', p); });
  }
  if (filters.payer && filters.payer !== 'all') {
    (filters.payer as string[]).forEach(p => { params = params.append('payers', p); });
  }
  if (filters.date_of_service?.start_date) { params = params.set('startDate', filters.date_of_service.start_date); }
  if (filters.date_of_service?.end_date)   { params = params.set('endDate',   filters.date_of_service.end_date); }
  return params;
}

@Injectable({ providedIn: 'root' })
export class RevenueForecastService {
  private base = `${environment.server.baseUrl}/ai/revenue-forecast`;

  constructor(private http: HttpClient) {}

  forecastCollections(filters: ForecastFilters = {}): Observable<CollectionsForecast> {
    return this.http.get<CollectionsForecast>(`${this.base}/collections`, { params: buildForecastParams(filters) });
  }

  forecastArAging(filters: ForecastFilters = {}): Observable<ArAgingForecast> {
    return this.http.get<ArAgingForecast>(`${this.base}/ar-aging`, { params: buildForecastParams(filters) });
  }

  forecastDenialTrend(filters: ForecastFilters = {}): Observable<DenialTrendForecast> {
    return this.http.get<DenialTrendForecast>(`${this.base}/denial-trend`, { params: buildForecastParams(filters) });
  }
}
