import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface BenchmarkComparison {
  metric: string;
  label: string;
  description: string;
  practiceValue: number;
  industryAvg: number;
  industryTop25: number;
  unit: string;
  higherIsBetter: boolean;
  percentile: number;
}

@Injectable({ providedIn: 'root' })
export class BenchmarkingService {
  private base = `${environment.server.baseUrl}/insightflow/benchmarking`;

  constructor(private http: HttpClient) {}

  getComparison(start?: string, end?: string, payers?: string[], providers?: string[], locations?: string[]) {
    let params = new HttpParams();
    if (start) params = params.set('start', start);
    if (end)   params = params.set('end', end);
    payers?.forEach(v => params = params.append('payers', v));
    providers?.forEach(v => params = params.append('providers', v));
    locations?.forEach(v => params = params.append('locations', v));
    return this.http.get<{ comparisons: BenchmarkComparison[]; generatedAt: string }>(`${this.base}/comparison`, { params });
  }
}
