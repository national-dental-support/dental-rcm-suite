import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { PayerIqFiltersValue } from '../../shared/components/global-filters/global-filters.models';


/* ============================================================
   Charge Amount (existing pie chart)
   ============================================================ */

export interface ChargeAmountRow {
  PayerName: string;
  TotalCharges: number;
}

export interface ChargeAmountResponse {
  message?: string;
  data: ChargeAmountRow[];
}

/* ============================================================
   Payer Mix by Reimbursement (Payment)
   ============================================================ */

export interface PayerMixReimbursementPaymentRow {
  PayerName: string;
  TotalPayments: number;
}

export interface PayerMixReimbursementPaymentResponse {
  message?: string;
  data: PayerMixReimbursementPaymentRow[];
}

/* ============================================================
   Payer Mix by Patient Volume
   ============================================================ */
export interface PayerMixPatientVolumeRow {
  PayerName: string;
  PatientEncounter: number;
}

export interface PayerMixPatientVolumeResponse {
  message?: string;
  data: PayerMixPatientVolumeRow[];
}

/* ============================================================
   Payer Mix by CPT Volume
   ============================================================ */

export interface PayerMixCptVolumeRow {
  PayerName: string;
  ProcedureCode: string;
  ChargeRowCount: number;
}

export interface PayerMixCptVolumeResponse {
  message?: string;
  data: PayerMixCptVolumeRow[];
}

/* ============================================================
   Forecasting Payer Payments
   ============================================================ */

export interface ForecastingPayerPaymentsRow {
  payer: number | string;
  nowMonthStart: string; // "YYYY-MM-DD"
  '3_months_ago': number;
  '2_months_ago': number;
  '1_month_ago': number;
  now: number;
  '1_month_future': number;
  '2_month_future': number;
  '3_month_future': number;
  '3_months_ago_forecast': number;
  '2_months_ago_forecast': number;
  '1_months_ago_forecast': number;
}

export interface ForecastingPayerPaymentsResponse {
  message?: string;
  data: ForecastingPayerPaymentsRow[];
}

/* ============================================================
   Network Leases
   ============================================================ */

export interface NetworkLeaseNetworkTotalRow {
  NetworkName: string;
  TotalChargeAmount: number;
  TotalPayments: number;
  TotalPatientVolume: number;
  TotalCPTVolume: number;
}

export interface NetworkLeasePayerRow {
  NetworkName: string;
  PayerName: string;
  TotalChargeAmount: number;
  TotalPayments: number;
  TotalPatientVolume: number;
  TotalCPTVolume: number;
}

export interface NetworkLeasesResponse {
  message?: string;
  data: {
    networks: NetworkLeaseNetworkTotalRow[];
    payers: NetworkLeasePayerRow[];
  };
}

/* ============================================================
   CPT Non Payment
   ============================================================ */

export interface CptNonPaymentPayerRow {
  PayerName: string;
  TotalCharges: number;
  ClaimsCount: number;
  RolledUpLines: number;
}

export interface CptNonPaymentCptRow {
  PayerName: string;
  ProcedureCode: string;
  TotalCharges: number;
  ClaimsCount: number;
  RolledUpLines: number;
}

export interface CptNonPaymentLineRow {
  PayerName: string;
  ProcedureCode: string;
  ClaimID: string | number;
  TotalCharges: number;
  AmountPaid: number;
  Balance: number;
}

export interface CptNonPaymentResponse {
  message?: string;
  payerRollup: CptNonPaymentPayerRow[];
  cptRollup: CptNonPaymentCptRow[];
  lineItems: CptNonPaymentLineRow[];
  data?: CptNonPaymentCptRow[]; // optional convenience
}

/* ============================================================
   Payer Details Tree
   ============================================================ */
export interface PayerDetailsTreeRow {
  SortLevel: number; // 1..4
  LevelType: 'CATEGORY' | 'GROUP' | 'PAYER' | 'PLAN';
  Category: 'Commercial' | 'Government' | 'LeaseNetwork' | string;
  GroupName: string | null;
  PayerName: string | null;
  PlanName: string | null;
  TotalCharges: number;
  Claims: number;
}

export interface PayerDetailsTreeResponse {
  message?: string;
  data: PayerDetailsTreeRow[];
}

export interface NetworkPayersNetworkTotalRow {
  NetworkName: string;
  TotalChargeAmount: number;
  TotalPayments: number;
  TotalPatientVolume: number;
  TotalCPTVolume: number;
}

export interface NetworkPayersPayerRow {
  NetworkName: string;
  PayerName: string;
  TotalChargeAmount: number;
  TotalPayments: number;
  TotalPatientVolume: number;
  TotalCPTVolume: number;
}

export interface NetworkPayersDropdownResponse {
  message?: string;
  networks: NetworkPayersNetworkTotalRow[];
  networkPayers: NetworkPayersPayerRow[];
}

/* ============================================================
   At Risk Payers
   ============================================================ */
export interface AtRiskPayersApiRow {
  SortLevel: 1 | 2;
  RowType: 'PAYER' | 'CPT';
  PayerName: string;
  CPTCode: string | null;
  Claims: number;
  LossRevenue: number;
  RiskRate: 'High' | 'Medium' | 'Low' | null;
}

export interface AtRiskPayersResponse {
  message?: string;
  data: AtRiskPayersApiRow[];
}

/* ============================================================
   Strategy Builder
   ============================================================ */

export interface BuilderInfoSummary {
  underpaymentCount: number;
  underpaymentDollars: number;
  avgPaymentLagDays: number;
  totalDenials: number;
}

export interface BuilderInfoRow {
  payerContractId: number;
  cpt: string;
  volume: number;
  currentAllowed: number;
  avgPaid: number;
  totalCharges: number;
  underpaidDollars: number;
}

export interface BuilderInfoResponse {
  message?: string;
  filters?: { payerContractId: number; start: string; end: string };
  summary: BuilderInfoSummary;
  rows: BuilderInfoRow[];
}

/* ============================================================
   Strategy Contract Options (NEW)
   ============================================================ */

export interface StrategyContractOptionRow {
  PayerContractID: number;
  ContractPlanName: string;
}

export interface StrategyContractOptionsResponse {
  message?: string;
  data: StrategyContractOptionRow[];
}

/* ============================================================
   AI Optimize Proposed
   ============================================================ */

export interface AiSuggestion {
  cpt: string;
  proposedAllowed: number;
  reasoning: string;
  paymentRatio: number;
  tier: 'aggressive' | 'moderate' | 'conservative';
  currentAllowed: number;
}

export interface OptimizeProposedResponse {
  suggestions: AiSuggestion[];
  rationale: string;
  meta: {
    model: string;
    analyzedAt: string;
    codesAnalyzed: number;
    payerName: string;
  };
  rawResponse?: string;
  promptSent?: string;
  inputRows?: any[];
}

/* ============================================================
   Service
   ============================================================ */

@Injectable({
  providedIn: 'root',
})
export class PayerIqService {
  private readonly dashboardBaseUrl = '/api/payer-iq/dashboard';
  private readonly networkLeasesBaseUrl = '/api/payer-iq/network-leases';
  private readonly networkPayersBaseUrl = '/api/payer-iq/network-payers';
  private readonly underpaymentsBaseUrl = '/api/payer-iq/underpayments';
  private readonly strategyBaseUrl = '/api/payer-iq/strategy';

  constructor(private readonly http: HttpClient) {}

  // -----------------------
  // Helpers
  // -----------------------

  private toIsoDate(d: Date): string {
    return new Date(d).toISOString().slice(0, 10);
  }

  private toHttpParams(filters: PayerIqFiltersValue): HttpParams {
    let params = new HttpParams();

    // dates
    if (filters.startDate) {
      params = params.set('start', this.toIsoDate(filters.startDate));
    }
    if (filters.endDate) {
      params = params.set('end', this.toIsoDate(filters.endDate));
    }

    // multi-selects
    for (const payer of filters?.payers ?? []) {
      params = params.append('payer', payer);
    }

    for (const plan of filters?.plans ?? []) {
      params = params.append('plan', plan);
    }

    for (const network of filters?.leaseNetworks ?? []) {
      params = params.append('leaseNetwork', network);
    }

    for (const provider of filters?.providers ?? []) {
      params = params.append('provider', provider);
    }

    for (const location of filters?.locations ?? []) {
      params = params.append('location', location);
    }

    return params;
  }

  /* ---------- Payer Mix by Charges ---------- */

  getChargeAmount(filters: PayerIqFiltersValue): Observable<ChargeAmountResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<ChargeAmountResponse>(`${this.dashboardBaseUrl}/charge-amount`, { params });
  }

  // Keep your existing helper endpoint if you still use it anywhere
  getChargeAmountByPayer(payerId: string): Observable<ChargeAmountResponse> {
    const params = new HttpParams().set('payerId', payerId);
    return this.http.get<ChargeAmountResponse>(`${this.dashboardBaseUrl}/charge-amount`, { params });
  }

  /* ---------- Payer Mix by Reimbursement (Payment) ---------- */

  getPayerMixReimbursementPayment(
    filters: PayerIqFiltersValue
  ): Observable<PayerMixReimbursementPaymentResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<PayerMixReimbursementPaymentResponse>(
      `${this.dashboardBaseUrl}/payer-mix-reimbursement-payment`,
      { params }
    );
  }

  /* ---------- Payer Mix by Patient Volume ---------- */

  getPayerMixPatientVolume(
    filters: PayerIqFiltersValue
  ): Observable<PayerMixPatientVolumeResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<PayerMixPatientVolumeResponse>(
      `${this.dashboardBaseUrl}/payer-mix-patient-volume`,
      { params }
    );
  }

  /* ---------- Payer Mix by CPT Volume ---------- */

  getPayerMixCptVolume(filters: PayerIqFiltersValue): Observable<PayerMixCptVolumeResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<PayerMixCptVolumeResponse>(`${this.dashboardBaseUrl}/payer-mix-cpt-volume`, {
      params,
    });
  }

  /* ---------- Forecasting Payer Payments ---------- */

  getForecastingPayerPayments(
    filters: PayerIqFiltersValue
  ): Observable<ForecastingPayerPaymentsResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<ForecastingPayerPaymentsResponse>(
      `${this.dashboardBaseUrl}/forecasting-payer-payments`,
      { params }
    );
  }

  /* ---------- Network Leases ---------- */
  getNetworkLeases(filters: PayerIqFiltersValue): Observable<NetworkLeasesResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<NetworkLeasesResponse>(`${this.networkLeasesBaseUrl}/network-leases-summary`, {
      params,
    });
  }

  /* ---------- CPT Non Payment ---------- */
  getCptNonPayment(filters: PayerIqFiltersValue): Observable<CptNonPaymentResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<CptNonPaymentResponse>(`${this.dashboardBaseUrl}/cpt-non-payment`, { params });
  }

  /* ---------- Network Payers Dropdown ---------- */
  getNetworkPayersDropdown(filters: PayerIqFiltersValue): Observable<NetworkPayersDropdownResponse> {
    const params = this.toHttpParams(filters);
    return this.http.get<NetworkPayersDropdownResponse>(`${this.networkPayersBaseUrl}/network-payers-dropdown`, {
      params,
    });
  }

  /* ---------- Payer Details Tree ---------- */
  getPayerDetails(filters: PayerIqFiltersValue): Observable<PayerDetailsTreeResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<PayerDetailsTreeResponse>(`${this.dashboardBaseUrl}/payer-details`, { params });
  }

  getAtRiskPayers(filters: PayerIqFiltersValue): Observable<AtRiskPayersResponse> {
    const params = this.toHttpParams(filters);

    return this.http.get<AtRiskPayersResponse>(`${this.underpaymentsBaseUrl}/at-risk-payers`, { params });
  }

  /* ---------- Strategy Builder ---------- */
  getBuilderInfo(args: { payerContractId: number; start?: string; end?: string }): Observable<BuilderInfoResponse> {
    let params = new HttpParams().set('payerContractId', String(args.payerContractId));
    if (args.start) params = params.set('start', args.start);
    if (args.end) params = params.set('end', args.end);

    return this.http.get<BuilderInfoResponse>(`${this.strategyBaseUrl}/builder-info`, { params });
  }

  /* ---------- Strategy Contract Options (NEW) ---------- */
  getStrategyContractOptions(): Observable<StrategyContractOptionsResponse> {
    return this.http.get<StrategyContractOptionsResponse>(`${this.strategyBaseUrl}/contract-options`);
  }

  /* ---------- AI Optimize Proposed ---------- */
  optimizeProposed(payload: {
    rows: { cpt: string; volume: number; currentAllowed: number; avgPaid: number; underpaidDollars: number }[];
    payerName: string;
  }): Observable<OptimizeProposedResponse> {
    return this.http.post<OptimizeProposedResponse>(`${this.strategyBaseUrl}/optimize-proposed`, payload);
  }

  /* ---------- Underpayment Disputes ---------- */
  getDispute(claimNumber: string): Observable<any> {
    return this.http.get<any>(`${this.underpaymentsBaseUrl}/${encodeURIComponent(claimNumber)}/dispute`);
  }

  createDispute(claimNumber: string, body: { cptCode?: string; payerName?: string; notes?: string }): Observable<any> {
    return this.http.post<any>(`${this.underpaymentsBaseUrl}/${encodeURIComponent(claimNumber)}/dispute`, body);
  }

  updateDispute(claimNumber: string, id: number, body: { status?: string; notes?: string }): Observable<any> {
    return this.http.patch<any>(`${this.underpaymentsBaseUrl}/${encodeURIComponent(claimNumber)}/dispute/${id}`, body);
  }

  markReviewed(claimNumber: string, cptCode?: string): Observable<any> {
    return this.http.post<any>(`${this.underpaymentsBaseUrl}/${encodeURIComponent(claimNumber)}/review`, { cptCode });
  }
}
