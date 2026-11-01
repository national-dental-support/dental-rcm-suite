import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly base = '/api/payer-iq/contracts';

  constructor(private http: HttpClient) {}

  /** All active payer contracts with network and 90-day performance data. */
  getContracts(): Observable<any[]> {
    return this.http
      .get<{ data: any[] }>(this.base)
      .pipe(map(r => r.data ?? []));
  }

  /** CPT/CDT fee schedule lines for a specific contract. */
  getFeeSchedule(contractId: number): Observable<any[]> {
    return this.http
      .get<{ data: any[] }>(`${this.base}/${contractId}/fee-schedule`)
      .pipe(map(r => r.data ?? []));
  }

  /**
   * Routing arbitrage analysis: for each payer, all available network routes
   * ranked by contracted rate, with spread / opportunity flagging.
   */
  getRoutingArbitrage(cptCode?: string): Observable<any[]> {
    const params: Record<string, string> = {};
    if (cptCode && cptCode.trim()) params['cpt_code'] = cptCode.trim();
    return this.http
      .get<{ data: any[] }>(`${this.base}/routing-arbitrage`, { params })
      .pipe(map(r => r.data ?? []));
  }

  /** 90-day (or custom period) payment performance summary. */
  getSavingsSummary(days = 90): Observable<any> {
    return this.http
      .get<{ data: any }>(`${this.base}/savings-summary`, { params: { days: String(days) } })
      .pipe(map(r => r.data ?? {}));
  }

  /** All routing paths (lease networks) available for a contract's payer. */
  getRoutingPaths(contractId: number): Observable<any[]> {
    return this.http
      .get<{ data: any[] }>(`${this.base}/${contractId}/routing-paths`)
      .pipe(map(r => r.data ?? []));
  }
}
