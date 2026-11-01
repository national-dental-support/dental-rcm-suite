import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Filters,
  ClaimValueByStatusDto,
  ClaimAmountsByPracticeDto,
  CollectionAdjustmentTrendDto,
  ClaimAmountsByPayerDto,
  ClaimValuesByTypeDto,
  ClaimsCountByLocationGroupDto,
  ClaimsCountByLocationGroupResponse,
  RcmLookups
} from '../models/rcm.models';

@Injectable({ providedIn: 'root' })
export class RcmService {
  //  this MUST match how the backend is mounted
  // e.g. app.use('/api/analytics/rcm', rcmRoutes);
  private readonly baseUrl = `${environment.server.baseUrl}/analytics/rcm`;

  constructor(private http: HttpClient) {}

  // --- existing working endpoints (for KPIs/table) ---
  getClaimsCount(filters: Filters) {
    return this.http.post(`${this.baseUrl}/claims-count`, { filters });
  }

  getGrossProduction(filters: Filters) {
    return this.http.post(`${this.baseUrl}/gross-production`, { filters });
  }

  getCollectionRate(filters: Filters) {
    return this.http.post(`${this.baseUrl}/collection-rate`, { filters });
  }

  getRevenueByPractice(filters: Filters, sort: any, page: number, pageSize: number) {
    return this.http.post(`${this.baseUrl}/revenue-by-practice`, {
      filters,
      sort,
      page,
      pageSize,
    });
  }

   getLookups(practiceGroup: 'all' | string | string[]): Observable<RcmLookups> {
    // adjust shape if your backend expects something different
    const body = { practice_groups: practiceGroup };
    return this.http.post<RcmLookups>(`${this.baseUrl}/lookups`, body);
  }

  getClaimValueByStatus(filters: Filters): Observable<ClaimValueByStatusDto[]> {
    return this.http.post<ClaimValueByStatusDto[]>(
      `${this.baseUrl}/claim-value-by-status`,
      { filters }
    );
  }

  getClaimAmountsByPractice(filters: Filters): Observable<ClaimAmountsByPracticeDto[]> {
    return this.http.post<ClaimAmountsByPracticeDto[]>(
      `${this.baseUrl}/claim-amounts-by-practice`,
      { filters }
    );
  }

  getCollectionAdjustmentTrends(filters: Filters): Observable<CollectionAdjustmentTrendDto[]> {
    return this.http.post<CollectionAdjustmentTrendDto[]>(
      `${this.baseUrl}/collection-adjustment-trends`,
      { filters }
    );
  }

  getClaimAmountsByPayer(filters: Filters): Observable<ClaimAmountsByPayerDto[]> {
    return this.http.post<ClaimAmountsByPayerDto[]>(
      `${this.baseUrl}/claim-amounts-by-payer`,
      { filters }
    );
  }

  getClaimValuesByType(filters: Filters): Observable<ClaimValuesByTypeDto[]> {
    return this.http.post<ClaimValuesByTypeDto[]>(
      `${this.baseUrl}/claim-values-by-type`,
      { filters }
    );
  }

  getClaimsCountByLocationGroup(filters: Filters): Observable<ClaimsCountByLocationGroupResponse> {
    return this.http.post<ClaimsCountByLocationGroupResponse>(
      `${this.baseUrl}/claims-count-by-location-group`,
      filters
    );
  }

  // In RcmService

}
