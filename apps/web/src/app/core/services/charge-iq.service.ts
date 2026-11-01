import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChargeEntry {
  id: number;
  customer_id: number;
  patient_name: string;
  patient_dob: string | null;
  procedure_code: string;
  procedure_description: string;
  tooth_number: string | null;
  surface: string | null;
  provider_name: string;
  location_name: string;
  service_date: string;
  fee_charged: number;
  fee_allowed: number | null;
  payer_name: string | null;
  payer_id: string | null;
  status: 'unbilled' | 'billed' | 'voided';
  created_at: string;
  billed_at: string | null;
}

export interface FeeScheduleEntry {
  id: number;
  customer_id: number;
  payer_name: string;
  payer_id: string | null;
  procedure_code: string;
  procedure_description: string;
  contracted_fee: number;
  effective_date: string | null;
  expiration_date: string | null;
  is_active: boolean;
}

export interface ChargeAdjustment {
  id: number;
  customer_id: number;
  charge_id: number;
  adjustment_type: string;
  amount: number;
  reason: string;
  adjusted_by: string;
  adjusted_at: string;
}

export interface TopProcedure {
  code: string;
  description: string;
  count: number;
  totalFee: number;
}

export interface LocationSummary {
  location: string;
  unbilled: number;
  billed: number;
}

export interface MonthlyTrend {
  month: string;
  billed: number;
  unbilled: number;
}

export interface DashboardData {
  unbilledCount: number;
  unbilledValue: number;
  captureRate: number;
  avgDaysToBill: number;
  topProcedures: TopProcedure[];
  chargesByLocation: LocationSummary[];
  monthlyTrend: MonthlyTrend[];
}

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FeeScheduleLookupRow {
  payer_name: string;
  payer_id: string | null;
  contracted_fee: number;
  procedure_description: string;
  typical_fee: number | null;
}

export interface GapReportRow {
  procedureId: number;
  patientName: string;
  providerName: string;
  locationName: string;
  serviceDate: string;
  procedureCode: string;
  procedureDescription: string;
  estimatedFee: number;
  daysSinceService: number;
  urgency: 'critical' | 'warning' | 'ok';
}

export interface GapReportSummary {
  totalGaps: number;
  estimatedMissedRevenue: number;
  criticalCount: number;
  warningCount: number;
}

export interface GapReportResponse {
  data: GapReportRow[];
  summary: GapReportSummary;
}

export interface WriteOffCategory {
  category: string;
  amount: number;
}

export interface WriteOffTrendRow {
  month: string;
  contractual: number;
  bad_debt: number;
  courtesy: number;
  admin: number;
}

export interface WriteOffProviderRow {
  provider: string;
  amount: number;
  count: number;
}

export interface WriteOffPayerRow {
  payer: string;
  amount: number;
  count: number;
}

export interface WriteOffResponse {
  summary: {
    totalWriteOffs: number;
    byCategory: WriteOffCategory[];
    contractual: number;
    bad_debt: number;
    courtesy: number;
    admin: number;
  };
  trend: WriteOffTrendRow[];
  byProvider: WriteOffProviderRow[];
  byPayer: WriteOffPayerRow[];
}

export interface ChargeAlert {
  alertType: 'undercoding' | 'overcoding';
  procedureCode: string;
  description: string;
  avgBilled: number;
  benchmarkFee: number;
  variance: number;
  variancePct: number;
  occurrences: number;
  estimatedImpact: number;
}

export interface ModifierRule {
  modifier: string;
  description: string;
  reason: string;
  commonWith: string[];
}

export interface ModifierResponse {
  code: string;
  modifiers: ModifierRule[];
}

@Injectable({ providedIn: 'root' })
export class ChargeIqService {
  private base = '/api/charge-iq';

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<DashboardData> {
    return this.http.get<DashboardData>(`${this.base}/dashboard`);
  }

  getCharges(params?: Record<string, string | number>): Observable<PagedResult<ChargeEntry>> {
    return this.http.get<PagedResult<ChargeEntry>>(`${this.base}/charges`, { params: params as any });
  }

  addCharge(body: Partial<ChargeEntry>): Observable<ChargeEntry> {
    return this.http.post<ChargeEntry>(`${this.base}/charges`, body);
  }

  billCharge(id: number): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.base}/charges/${id}/bill`, {});
  }

  getAdjustments(chargeId: number): Observable<{ data: ChargeAdjustment[] }> {
    return this.http.get<{ data: ChargeAdjustment[] }>(`${this.base}/charges/${chargeId}/adjustments`);
  }

  addAdjustment(chargeId: number, body: Partial<ChargeAdjustment>): Observable<ChargeAdjustment> {
    return this.http.post<ChargeAdjustment>(`${this.base}/charges/${chargeId}/adjustments`, body);
  }

  getFeeSchedules(params?: Record<string, string | number>): Observable<PagedResult<FeeScheduleEntry>> {
    return this.http.get<PagedResult<FeeScheduleEntry>>(`${this.base}/fee-schedules`, { params: params as any });
  }

  lookupFeeSchedule(code: string, payerId?: string): Observable<{ data: FeeScheduleLookupRow[] }> {
    const p: any = { code };
    if (payerId) p['payerId'] = payerId;
    return this.http.get<{ data: FeeScheduleLookupRow[] }>(`${this.base}/fee-schedules/lookup`, { params: p });
  }

  addFeeSchedule(body: Partial<FeeScheduleEntry>): Observable<FeeScheduleEntry> {
    return this.http.post<FeeScheduleEntry>(`${this.base}/fee-schedules`, body);
  }

  getGapReport(): Observable<GapReportResponse> {
    return this.http.get<GapReportResponse>(`${this.base}/gap-report`);
  }

  getWriteOffs(months: number = 12): Observable<WriteOffResponse> {
    return this.http.get<WriteOffResponse>(`${this.base}/write-offs`, { params: { months: months.toString() } });
  }

  getAlerts(): Observable<{ data: ChargeAlert[] }> {
    return this.http.get<{ data: ChargeAlert[] }>(`${this.base}/alerts`);
  }

  getModifiers(code: string): Observable<ModifierResponse> {
    return this.http.get<ModifierResponse>(`${this.base}/modifiers`, { params: { code } });
  }
}
