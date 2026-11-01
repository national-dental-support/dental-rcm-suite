import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ---- Budget ----
export interface BudgetRow {
  period_date: string;
  period_type: string;
  budget_gross_charges: number;
  budget_payments: number;
  budget_collection_rate: number;
  budget_ar_days: number;
  actual_gross_charges: number;
  actual_payments: number;
  actual_collection_rate: number;
  actual_ar_days: number;
  variance_charges: number;
  variance_payments: number;
  variance_pct_charges: number;
  variance_pct_payments: number;
  status: 'over' | 'under' | 'on_track';
}

// ---- Contracts ----
export interface ContractRow {
  payerName: string;
  contractedTotal: number;
  billedTotal: number;
  collectedTotal: number;
  contractComplianceRate: number;
  underCollectionAmount: number;
  overCollectionAmount: number;
  claimCount: number;
}

export interface ContractsResponse {
  rows: ContractRow[];
  summary: {
    totalContracted: number;
    totalCollected: number;
    overallCompliance: number;
    totalUnderCollection: number;
  };
  source: string;
}

// ---- Forecast ----
export interface ForecastMonth {
  month: string;
  projected: number;
  low: number;
  high: number;
}

export interface ForecastResponse {
  forecastMonths: ForecastMonth[];
  avgMonthlyCollections: number;
  trendFactor: number;
  confidence: 'high' | 'medium' | 'low';
  currentArBalance: number;
  projectedCollectionRate: number;
  periodsUsed: number;
}

// ---- Period Close ----
export interface PeriodCloseRow {
  period_date: string;
  period_type: string;
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  gross_charges: number;
  payments: number;
  net_collection_rate: number;
}

export interface FinanceDashboard {
  ytdGrossCharges: number;
  ytdNetCharges: number;
  netCollectionRate: number;
  arDays: number;
  arDaysTrend: number;
  cashPostedThisMonth: number;
  writeOffsThisMonth: number;
  last12Months: MonthlyKpi[];
}

export interface MonthlyKpi {
  month: string;
  grossCharges: number;
  payments: number;
  collectionRate: number;
  arDays: number;
}

export interface RevenueDimension {
  label: string;
  grossCharges: number;
  payments: number;
  adjustments: number;
  collectionRate: number;
}

export interface FinancialPeriod {
  period_date: string;
  period_type: string;
  gross_charges: number;
  contractual_adj: number;
  net_charges: number;
  payments: number;
  write_offs: number;
  refunds: number;
  ar_balance: number;
  net_collection_rate: number;
  ar_days: number;
}

export interface AgingBuckets {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d120: number;
}

export interface AgingByLocation {
  location: string;
  current_bucket: number;
  d30: number;
  d60: number;
  d90: number;
  d120: number;
  total: number;
}

export interface AgingResponse {
  agingBuckets: AgingBuckets;
  byLocation: AgingByLocation[];
  source: string;
}

@Injectable({ providedIn: 'root' })
export class FinanceIqService {
  private readonly base = `${environment.server.baseUrl}/finance-iq`;

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<FinanceDashboard> {
    return this.http.get<FinanceDashboard>(`${this.base}/dashboard`);
  }

  getRevenue(dimensionType: string, from?: string, to?: string): Observable<RevenueDimension[]> {
    let params = new HttpParams().set('dimensionType', dimensionType);
    if (from) params = params.set('from', from);
    if (to)   params = params.set('to', to);
    return this.http.get<RevenueDimension[]>(`${this.base}/revenue`, { params });
  }

  getPeriods(type: 'monthly' | 'daily', from?: string, to?: string): Observable<FinancialPeriod[]> {
    let params = new HttpParams().set('type', type);
    if (from) params = params.set('from', from);
    if (to)   params = params.set('to', to);
    return this.http.get<FinancialPeriod[]>(`${this.base}/periods`, { params });
  }

  getAging(): Observable<AgingResponse> {
    return this.http.get<AgingResponse>(`${this.base}/aging`);
  }

  recalculate(): Observable<{ ok: boolean; recalculatedAt: string }> {
    return this.http.post<{ ok: boolean; recalculatedAt: string }>(`${this.base}/periods/recalculate`, {});
  }

  getBudget(): Observable<BudgetRow[]> {
    return this.http.get<BudgetRow[]>(`${this.base}/budget`);
  }

  upsertBudget(rows: Array<Partial<BudgetRow>>): Observable<{ ok: boolean; count: number }> {
    return this.http.post<{ ok: boolean; count: number }>(`${this.base}/budget`, { rows });
  }

  getContracts(): Observable<ContractsResponse> {
    return this.http.get<ContractsResponse>(`${this.base}/contracts`);
  }

  getForecast(): Observable<ForecastResponse> {
    return this.http.get<ForecastResponse>(`${this.base}/forecast`);
  }

  getPeriodClose(): Observable<PeriodCloseRow[]> {
    return this.http.get<PeriodCloseRow[]>(`${this.base}/period-close`);
  }

  lockPeriod(period: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/period-close/${period}/lock`, {});
  }

  unlockPeriod(period: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/period-close/${period}/unlock`, {});
  }
}
