import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

import {
  ReconIqMatchStatsResponse,
  ReconIqDashboardFilters,
  DenialsNonPaymentsResponseDto,
  PaymentReconciliationResponseDto,
  EobsWithNoPaymentResponseDto,
  PaymentsWithNoEobResponseDto,
  FullyReconciledPaymentsResponseDto,
  ReconIqLocationFilter,
} from '../models/recon-iq.models';

// -- Finance Summary interfaces -----------------------------------------------
export interface FinanceTrxGroup {
  trxType: string;
  category: 'charge' | 'insurance_payment' | 'patient_payment' | 'adjustment' | 'writeoff' | 'other';
  totalAmount: number;
  txCount: number;
}

export interface FinanceMonthRow {
  month: string;
  grossCharges: number;
  insurancePayments: number;
  patientPayments: number;
  contractualAdjustments: number;
  writeOffs: number;
  otherCredits: number;
  netCollections: number;
}

export interface FinanceSummaryKpis {
  grossCharges: number;
  insurancePayments: number;
  patientPayments: number;
  contractualAdjustments: number;
  writeOffs: number;
  netCollections: number;
  netCollectionRate: number;
  grossCollectionRate: number;
  openAR: number;
  daysInAR: number;
}

export interface FinanceSummaryResponse {
  message: string;
  asOf: string;
  months: number;
  summary: FinanceSummaryKpis;
  monthly: FinanceMonthRow[];
  byTrxType: FinanceTrxGroup[];
}

// -- Reconciliation Report interfaces ----------------------------------------
export interface ReconReportSummary {
  matchedCount: number;
  matchedAmount: number;
  postedCount: number;
  unpostedCount: number;
  unmatchedPayments: number;
  unmatchedEOBs: number;
  totalClaims: number;
  deniedClaims: number;
  denialRate: number;
  bankTxCount: number;
  bankTxTotal: number;
  pmsTxCount: number;
  pmsTxTotal: number;
  bankPmsDiff: number;
  inTransitCount: number;
  inTransitTotal: number;
  period: string;
}

export interface ReconReportInTransitRow {
  remittanceFileId: string;
  fileDate: string;
  amount: number;
  location: string;
  payerName: string;
  claimCount: number;
  daysAged: number;
}

export interface ReconReportFilters {
  months: number;
  location: string;
  payer: string;
  postStatus: 'all' | 'posted' | 'unposted';
}

export interface ReconReportFilterOptions {
  locations: string[];
  payers: string[];
}

export interface ReconReportPayerRow {
  payerName: string;
  remittanceCount: number;
  totalAmount: number;
  linkedClaims: number;
  deniedClaims: number;
  denialRate: number;
  avgAmount: number;
}

export interface ReconReportTrendRow {
  period: string;
  reconcileCount: number;
  reconcileAmount: number;
  claimCount: number;
  deniedCount: number;
  postedCount: number;
  denialRate: number;
}

export interface ReconReportProviderRow {
  providerName: string;
  remittanceCount: number;
  totalAmount: number;
  linkedClaims: number;
  deniedClaims: number;
  denialRate: number;
  avgAmount: number;
}

export interface PostingAuditRow {
  remittanceFileId: string;
  eobDate: string;
  payerName: string;
  location: string;
  claimCount: number;
  postedBy: string;
  postedDate: string;
  postStatus: string;
}

export interface MatchedPairRow {
  reconciliationId: string;
  remittanceFileId: string;
  bankDepositId: string;
  matchedBy: string;
  matchedDate: string;
  fileDate: string;
  eobAmount: number;
  depositAmount: number;
  depositDate: string;
  location: string;
}

export interface PostingAuditResponse {
  rows: PostingAuditRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** -----------------------------
 *  Dashboard: ERA/EOB Payment
 *  ----------------------------- */
export type EraEobPaymentPointDto = {
  period: string; // '2025-01'
  eraEobPaymentAmount: number;
  patientResponsibilityAmount: number;
  adjustmentsAmount: number;
  unmatchedPaymentsNoEobCount: number;
  unmatchedNoPaymentToEobCount: number;
};

export type ReconIqEraEobPaymentResponse = {
  message: string;
  asOf: string; // ISO string
  filters: {
    from?: string;
    to?: string;
    interval: 'month';

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  };
  series: readonly EraEobPaymentPointDto[];
};

/** -----------------------------
 *  Encounter Research: Patients
 *  ----------------------------- */
export type EncounterResearchPatientRowDto = {
  encounterId: string;
  patientName: string;
  payerName: string;
  paymentId: string;
  doctorName: string;
  dateOfService: string; // ISO date string from API
  patientAccount: string;
};

export type EncounterResearchPatientsResponseDto = {
  message: string;
  asOf: string;
  filters: {
    search?: string;
    from?: string;
    to?: string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  rows: EncounterResearchPatientRowDto[];
};

/** -----------------------------
 *  Encounter Research: Patient Claims
 *  ----------------------------- */
export type PatientClaimRowDto = {
  claimId: string;
  dateClaimSubmitted: string; // ISO date
  eobId?: string | null;
  dateEobReceived?: string | null; // NOTE: matches controller "dateEobReceived"
};

export type PatientClaimsPatientDto = {
  patientAccount: string;
  patientName: string;
};

export type PatientClaimsResponseDto = {
  message: string;
  asOf: string; // ISO
  patient: PatientClaimsPatientDto;
  filters: {
    search?: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  rows: PatientClaimRowDto[];
};

// -- Patient Statements interfaces --------------------------------------------

export interface PatientStatementFilters {
  from?: string;
  to?: string;
  minBalance?: number;
  maxDaysAging?: number | null;
  agingBucket?: '0_30' | '31_60' | '61_90' | '90_plus' | 'all';
  location?: ReconIqLocationFilter;
  payers?: string[];
  providers?: string[];
  lastStatementBefore?: string;
  patientIds?: number[];
}

export interface PatientBalanceRow {
  patientId: number;
  patientAccount: string;
  patientName: string;
  balanceDue: number;
  currentCharges: number;
  previousBalance: number;
  insurancePaid: number;
  adjustments: number;
  patientResponsibility: number;
  aging0_30: number;
  aging31_60: number;
  aging61_90: number;
  aging90Plus: number;
  lastStatementDate: string | null;
  location: string;
}

export interface PatientBalancesResponse {
  message: string;
  asOf: string;
  filters: PatientStatementFilters;
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  rows: PatientBalanceRow[];
}

export interface GenerateStatementBatchResponse {
  batchId: string;
  queued: number;
}

export interface StatementBatchStatus {
  batchId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalPatients: number;
  completedCount: number;
  errorCount: number;
  requestedBy: string;
  startedAt: string | null;
  completedAt: string | null;
  downloadUrl: string | null;
  createdAt: string;
}

// -- Recon Alerts -------------------------------------------------------------
export interface ReconAlertRow {
  id: number;
  alertType: string;
  itemId: string;
  itemDate: string;
  daysAged: number;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledgedBy: string | null;
  createdAt: string;
  severity: 'info' | 'warning' | 'critical';
  thresholdDays: number;
}

export interface ReconAlertConfigItem {
  id: number;
  alertType: string;
  thresholdDays: number;
  severity: string;
  isEnabled: boolean;
  notifyEmails: string | null;
}

// -- Admin Config --------------------------------------------------------------
export interface ReconIqAdminConfig {
  autoMatchEnabled: boolean;
  autoMatchThreshold: number;
  autoPostEnabled: boolean;
  statementMinBalance: number;
  statementDefaultAgingDays: number;
  eraAutoImportEnabled: boolean;
  eraMatchTolerance: number;
  unmatchedEscalationDays: number;
  autoEscalateEnabled: boolean;
  defaultNotifyEmail: string;
  statementFrequency: string;
  storageType: string;
  storageConnectionString: string;
  storagePath: string;
  storageRetentionDays: number;
}

// -- Bank Account Connections --------------------------------------------------
export type BankStmtImportMethod = 'manual' | 'sftp' | 'plaid' | 'api';
export type BankSftpFileFormat   = 'bai2' | 'mt940' | 'ofx' | 'camt053' | 'csv';
export type BankConnectionStatus = 'active' | 'pending_verification' | 'suspended' | 'disconnected' | 'error';

export interface BankAccountConnection {
  id: number;
  customer_id: number;
  bank_name: string;
  account_number_last4: string | null;
  routing_number: string | null;
  account_type: string;
  nickname: string | null;
  // Institution
  account_holder_name: string | null;
  bank_address: string | null;
  bank_phone: string | null;
  bank_contact_name: string | null;
  swift_bic: string | null;
  // Statement import
  stmt_import_method: BankStmtImportMethod;
  sftp_host: string | null;
  sftp_port: number | null;
  sftp_username: string | null;
  sftp_auth_method: 'password' | 'rsa_key' | null;
  sftp_key_fingerprint: string | null;
  sftp_remote_path: string | null;
  sftp_file_format: BankSftpFileFormat | null;
  sftp_file_pattern: string | null;
  plaid_item_id: string | null;
  plaid_institution_id: string | null;
  plaid_last_refresh: string | null;
  recon_trace_match: boolean;
  recon_lag_days: number | null;
  // Schedule & retry
  schedule_type: 'manual' | 'daily' | 'weekly' | 'custom' | null;
  schedule_time: string | null;
  schedule_days: string | null;
  schedule_cron: string | null;
  retry_max_attempts: number | null;
  retry_delay_minutes: number | null;
  // ACH origination
  ach_enabled: boolean;
  ach_company_name: string | null;
  ach_company_id: string | null;
  ach_odfi_routing: string | null;
  ach_sec_codes: string | null;
  ach_transaction_limit: number | null;
  ach_daily_limit: number | null;
  ach_dual_approval_threshold: number | null;
  ach_settlement_days: number | null;
  ach_nacha_registered: boolean;
  ach_nacha_registered_date: string | null;
  notes: string | null;
  connection_status: BankConnectionStatus;
  verification_method: string | null;
  verified_at: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BankAccountConnectionPayload {
  bank_name?: string;
  account_number_last4?: string;
  routing_number?: string;
  account_type?: string;
  nickname?: string;
  account_holder_name?: string;
  bank_address?: string;
  bank_phone?: string;
  bank_contact_name?: string;
  swift_bic?: string;
  stmt_import_method?: BankStmtImportMethod;
  sftp_host?: string;
  sftp_port?: number | null;
  sftp_username?: string;
  sftp_auth_method?: string;
  sftp_key_fingerprint?: string;
  sftp_remote_path?: string;
  sftp_file_format?: string;
  sftp_file_pattern?: string;
  plaid_item_id?: string;
  plaid_institution_id?: string;
  recon_trace_match?: boolean;
  recon_lag_days?: number | null;
  schedule_type?: string;
  schedule_time?: string;
  schedule_days?: string;
  schedule_cron?: string;
  retry_max_attempts?: number | null;
  retry_delay_minutes?: number | null;
  ach_enabled?: boolean;
  ach_company_name?: string;
  ach_company_id?: string;
  ach_odfi_routing?: string;
  ach_sec_codes?: string;
  ach_transaction_limit?: number | null;
  ach_daily_limit?: number | null;
  ach_dual_approval_threshold?: number | null;
  ach_settlement_days?: number | null;
  ach_nacha_registered?: boolean;
  connection_status?: BankConnectionStatus;
  verification_method?: string;
  notes?: string;
  is_active?: boolean;
}

export interface BankAccountAuditEntry {
  id: number;
  bank_account_id: number;
  event_type: string;
  event_detail: string | null;
  actor_email: string;
  actor_ip: string | null;
  created_at: string;
  bank_name: string | null;
  nickname: string | null;
  account_number_last4: string | null;
}

// -- Secondary Billing ---------------------------------------------------------
export interface SecondaryBillingRow {
  id: number;
  claimId: string;
  primaryRmfId: string;
  secondaryPayerId: number;
  primaryPaidAmt: number;
  primaryAdjustmentAmt: number;
  patientRespAmt: number;
  secondaryBillAmt: number;
  status: 'pending' | 'submitted' | 'posted';
  submittedBy: string | null;
  submittedDate: string | null;
  createdAt: string;
  patientName: string | null;
  dateOfService: string | null;
  chargeAmt: number;
  primaryPayerName: string | null;
  secondaryPayerName: string | null;
  primaryEobDate: string | null;
  locationName: string | null;
}

export interface SecondaryBillingQueueResponse {
  rows: SecondaryBillingRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

// -- ERA Ingestion -------------------------------------------------------------
export interface EraIngestionLogRow {
  id: number;
  fileName: string;
  fileSizeBytes: number;
  fileType: string;
  status: 'processing' | 'completed' | 'failed' | 'duplicate';
  remittanceFileId: string | null;
  claimsFound: number | null;
  claimsMatched: number | null;
  errorMessage: string | null;
  uploadedBy: string;
  uploadedAt: string;
  completedAt: string | null;
  payerName: string | null;
  totalAmount: number | null;
}

export interface EraIngestionDetail extends EraIngestionLogRow {
  fileContent: string | null;
}

// -- Auto-Matching Suggestions ------------------------------------------------
export interface MatchSuggestionRow {
  id: number;
  bankDepositId: string;
  remittanceFileId: string;
  confidenceScore: number;
  matchReasons: string[];
  status: 'pending' | 'accepted' | 'rejected';
  generatedAt: string;
  depositAmount: number;
  depositDate: string;
  payerName: string;
  depositLocation: string;
  eobAmount: number;
  fileDate: string;
  insuranceName: string;
  eobLocation: string;
}

// -- Bank Escalations ---------------------------------------------------------
export interface BankEscalationRow {
  id: number;
  bankDepositId: string | null;
  issueType: string;
  description: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  daysOpen: number;
}

export interface BankEscalationsResponse {
  rows: BankEscalationRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BankEscalationStats {
  total: number;
  open: number;
  investigating: number;
  resolved: number;
}

@Injectable({ providedIn: 'root' })
export class ReconIqService {
  private readonly dashboardBaseUrl = `${environment.server.baseUrl}/recon-iq/dashboard`;
  private readonly encounterResearchBaseUrl = `${environment.server.baseUrl}/recon-iq/encounter-research`;
  private readonly reconciliationBaseUrl = `${environment.server.baseUrl}/recon-iq/reconciliation`;
  private readonly matchingBaseUrl = `${environment.server.baseUrl}/recon-iq/matching`;
  private readonly fullyReconciledBaseUrl = `${environment.server.baseUrl}/recon-iq/fully-reconciled`;
  private readonly reconReportBaseUrl    = `${environment.server.baseUrl}/recon-iq/reconciliation-report`;
  private readonly patientStatementsBaseUrl  = `${environment.server.baseUrl}/recon-iq/patient-statements`;
  private readonly bankEscalationsBaseUrl    = `${environment.server.baseUrl}/recon-iq/bank-escalations`;
  private readonly eraIngestionBaseUrl       = `${environment.server.baseUrl}/recon-iq/era-ingestion`;

  constructor(private readonly http: HttpClient) {}

  /** GET /api/recon-iq/dashboard/match-stats */
  getMatchStats(filters?: Partial<ReconIqDashboardFilters>): Observable<ReconIqMatchStatsResponse> {
    const params = this.buildCommonParams(filters);

    console.debug('[ReconIqService] getMatchStats', {
      url: `${this.dashboardBaseUrl}/match-stats`,
      params: params.toString(),
    });

    return this.http.get<ReconIqMatchStatsResponse>(`${this.dashboardBaseUrl}/match-stats`, { params });
  }

  /** GET /api/recon-iq/dashboard/denied-claims-and-non-payments */
  getDeniedClaimsAndNonPaymentsTrend(args: {
    from?: string;
    to?: string;
    interval?: 'month';

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  }): Observable<DenialsNonPaymentsResponseDto> {
    let params = this.buildCommonParams(args);

    if (args.from) params = params.set('from', args.from);
    if (args.to) params = params.set('to', args.to);
    params = params.set('interval', args.interval ?? 'month');

    console.debug('[ReconIqService] getDeniedClaimsAndNonPaymentsTrend', {
      url: `${this.dashboardBaseUrl}/denied-claims-and-non-payments`,
      params: params.toString(),
    });

    return this.http.get<DenialsNonPaymentsResponseDto>(
      `${this.dashboardBaseUrl}/denied-claims-and-non-payments`,
      { params }
    );
  }

  /** GET /api/recon-iq/dashboard/era-eob-payment */
  getEraEobPayment(filters: {
    from?: string;
    to?: string;
    interval?: 'month';

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  }): Observable<ReconIqEraEobPaymentResponse> {
    let params = this.buildCommonParams(filters);

    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    params = params.set('interval', filters.interval ?? 'month');

    console.debug('[ReconIqService] getEraEobPayment', {
      url: `${this.dashboardBaseUrl}/era-eob-payment`,
      params: params.toString(),
    });

    return this.http.get<ReconIqEraEobPaymentResponse>(
      `${this.dashboardBaseUrl}/era-eob-payment`,
      { params }
    );
  }

  /** GET /api/recon-iq/encounter-research/patients */
  getPatients(args: {
    page?: number;
    pageSize?: number;
    search?: string;
    from?: string;
    to?: string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  }): Observable<EncounterResearchPatientsResponseDto> {
    let params = this.buildCommonParams(args)
      .set('page', String(args.page ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));

    if (args.search?.trim()) params = params.set('search', args.search.trim());
    if (args.from) params = params.set('from', args.from);
    if (args.to) params = params.set('to', args.to);

    console.debug('[ReconIqService] getPatients', {
      url: `${this.encounterResearchBaseUrl}/patients`,
      params: params.toString(),
    });

    return this.http.get<EncounterResearchPatientsResponseDto>(
      `${this.encounterResearchBaseUrl}/patients`,
      { params }
    );
  }

  /** GET /api/recon-iq/encounter-research/patient-claims/:patientAccount? */
  getPatientClaims(args: {
    patientAccount?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }): Observable<PatientClaimsResponseDto> {
    const patientAccount = args.patientAccount?.trim();

    let params = new HttpParams()
      .set('page', String(args.page ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));

    if (args.search?.trim()) params = params.set('search', args.search.trim());

    const url = patientAccount
      ? `${this.encounterResearchBaseUrl}/patient-claims/${encodeURIComponent(patientAccount)}`
      : `${this.encounterResearchBaseUrl}/patient-claims`;

    console.debug('[ReconIqService] getPatientClaims', {
      url,
      params: params.toString(),
    });

    return this.http.get<PatientClaimsResponseDto>(url, { params });
  }

  getPaymentReconciliation(args: {
    page?: number;
    pageSize?: number;
    search?: string;
    from?: string;
    to?: string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  }): Observable<PaymentReconciliationResponseDto> {
    let params = this.buildCommonParams(args)
      .set('page', String(args.page ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));

    if (args.search?.trim()) params = params.set('search', args.search.trim());
    if (args.from) params = params.set('from', args.from);
    if (args.to) params = params.set('to', args.to);

    const url = `${this.reconciliationBaseUrl}/payment-reconciliation`;

    console.debug('[ReconIqService] getPaymentReconciliation', {
      url,
      params: params.toString(),
    });

    return this.http.get<PaymentReconciliationResponseDto>(url, { params });
  }

  /** GET /api/recon-iq/matching/payments-with-no-eob */
  getPaymentsWithNoEob(args: {
    page?: number;
    pageSize?: number;
    search?: string;
    from?: string;
    to?: string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  }): Observable<PaymentsWithNoEobResponseDto> {
    let params = this.buildCommonParams(args)
      .set('page', String(args.page ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));

    if (args.search?.trim()) params = params.set('search', args.search.trim());
    if (args.from) params = params.set('from', args.from);
    if (args.to) params = params.set('to', args.to);

    const url = `${this.matchingBaseUrl}/payments-with-no-eob`;

    console.debug('[ReconIqService] getPaymentsWithNoEob', {
      url,
      params: params.toString(),
    });

    return this.http.get<PaymentsWithNoEobResponseDto>(url, { params });
  }

  /** GET /api/recon-iq/matching/eobs-with-no-payment */
  getEobsWithNoPayment(args: {
    page?: number;
    pageSize?: number;
    search?: string;
    from?: string;
    to?: string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  }): Observable<EobsWithNoPaymentResponseDto> {
    let params = this.buildCommonParams(args)
      .set('page', String(args.page ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));

    if (args.search?.trim()) params = params.set('search', args.search.trim());
    if (args.from) params = params.set('from', args.from);
    if (args.to) params = params.set('to', args.to);

    const url = `${this.matchingBaseUrl}/eobs-with-no-payment`;

    console.debug('[ReconIqService] getEobsWithNoPayment', {
      url,
      params: params.toString(),
    });

    return this.http.get<EobsWithNoPaymentResponseDto>(url, { params });
  }

  /** GET /api/recon-iq/fully-reconciled/fully-paid-and-reconciled */
  getFullyPaidAndReconciledPayments(args: {
    page?: number;
    pageSize?: number;
    search?: string;
    from?: string;
    to?: string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;

    bankName?: string;
    bankFeedId?: string;
  }): Observable<FullyReconciledPaymentsResponseDto> {
    let params = this.buildCommonParams(args)
      .set('page', String(args.page ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));

    if (args.search?.trim()) params = params.set('search', args.search.trim());
    if (args.from) params = params.set('from', args.from);
    if (args.to) params = params.set('to', args.to);

    if (args.bankName?.trim()) params = params.set('bankName', args.bankName.trim());
    if (args.bankFeedId?.trim()) params = params.set('bankFeedId', args.bankFeedId.trim());

    const url = `${this.fullyReconciledBaseUrl}/fully-paid-and-reconciled`;

    console.debug('[ReconIqService] getFullyPaidAndReconciledPayments', {
      url,
      params: params.toString(),
    });

    return this.http.get<FullyReconciledPaymentsResponseDto>(url, { params });
  }

  /** GET /api/recon-iq/fully-reconciled/claims/:fileId */
  getFullyReconciledClaims(fileId: string): Observable<{ fileId: string; claims: any[] }> {
    return this.http.get<{ fileId: string; claims: any[] }>(
      `${this.fullyReconciledBaseUrl}/claims/${encodeURIComponent(fileId)}`
    ).pipe(catchError(() => of({ fileId, claims: [] })));
  }

  /** POST /api/recon-iq/matching/apply-match */
  applyMatch(bankDepositId: string, remittanceFileId: string): Observable<{ reconciliationId: string }> {
    return this.http.post<{ reconciliationId: string }>(
      `${this.matchingBaseUrl}/apply-match`,
      { bankDepositId, remittanceFileId },
    );
  }

  /** GET /api/recon-iq/matching/matched-pairs */
  getMatchedPairs(page = 1, pageSize = 20): Observable<{ rows: MatchedPairRow[] }> {
    const params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    return this.http.get<{ rows: MatchedPairRow[] }>(`${this.matchingBaseUrl}/matched-pairs`, { params })
      .pipe(catchError(() => of({ rows: [] })));
  }

  /** DELETE /api/recon-iq/matching/reconciliation/:id */
  unmatch(reconciliationId: string, reason: string): Observable<{ message: string; remittanceFileId: string; bankDepositId: string }> {
    return this.http.delete<{ message: string; remittanceFileId: string; bankDepositId: string }>(`${this.matchingBaseUrl}/reconciliation/${reconciliationId}`, { body: { reason } })
      .pipe(catchError(err => throwError(() => err)));
  }

  /** POST /api/recon-iq/reconciliation/bulk-post */
  bulkPost(remittanceFileIds: string[]): Observable<{ posted: number; failed: string[]; skipped: string[] }> {
    return this.http.post<{ posted: number; failed: string[]; skipped: string[] }>(`${this.reconciliationBaseUrl}/bulk-post`, { remittanceFileIds });
  }

  /**
   * [ok] Common query params helper (names-only)
   *
   * Query format:
   * - from/to are single values
   * - arrays use repeated keys: payers=A&payers=B
   * - location:
   *    locationScope=practice&practices=Foo&practices=Bar
   */
  private buildCommonParams(args?: {
    from?: string;
    to?: string;
    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  }): HttpParams {
    let params = new HttpParams();
    if (!args) return params;

    if (args.from) params = params.set('from', args.from);
    if (args.to) params = params.set('to', args.to);

    for (const p of args.payers ?? []) params = params.append('payers', p);
    for (const pr of args.providers ?? []) params = params.append('providers', pr);

    if (args.location) {
      params = params.set('locationScope', args.location.scope);

      if (args.location.scope === 'group') {
        for (const g of args.location.groups ?? []) params = params.append('groups', g);
      }
      if (args.location.scope === 'practice') {
        for (const p of args.location.practices ?? []) params = params.append('practices', p);
      }
      if (args.location.scope === 'location') {
        for (const l of args.location.locations ?? []) params = params.append('locations', l);
      }
    }

    return params;
  }

  // -- Finance Summary ------------------------------------------------------

  getFinanceSummary(args: { months?: number; location?: string; payer?: string } = {}): Observable<FinanceSummaryResponse> {
    let params = new HttpParams();
    if (args.months)   params = params.set('months',   String(args.months));
    if (args.location) params = params.set('location', args.location);
    if (args.payer)    params = params.set('payer',    args.payer);
    return this.http.get<FinanceSummaryResponse>(`${this.dashboardBaseUrl}/finance-summary`, { params });
  }

  // -- Reconciliation Report ------------------------------------------------

  private reconReportParams(f: ReconReportFilters): Record<string, string> {
    const p: Record<string, string> = { months: String(f.months) };
    if (f.location)   p['location']   = f.location;
    if (f.payer)      p['payer']      = f.payer;
    if (f.postStatus && f.postStatus !== 'all') p['postStatus'] = f.postStatus;
    return p;
  }

  getReconFilterOptions(): Observable<ReconReportFilterOptions> {
    return this.http.get<ReconReportFilterOptions>(`${this.reconReportBaseUrl}/filter-options`);
  }

  getReconReportSummary(f: ReconReportFilters): Observable<ReconReportSummary> {
    return this.http.get<ReconReportSummary>(`${this.reconReportBaseUrl}/summary`, { params: this.reconReportParams(f) });
  }

  getReconReportByPayer(f: ReconReportFilters): Observable<{ rows: ReconReportPayerRow[] }> {
    return this.http.get<{ rows: ReconReportPayerRow[] }>(`${this.reconReportBaseUrl}/by-payer`, { params: this.reconReportParams(f) });
  }

  getReconReportMonthlyTrend(f: ReconReportFilters): Observable<{ rows: ReconReportTrendRow[] }> {
    return this.http.get<{ rows: ReconReportTrendRow[] }>(`${this.reconReportBaseUrl}/monthly-trend`, { params: this.reconReportParams(f) });
  }

  getReconReportInTransit(f: ReconReportFilters): Observable<{ rows: ReconReportInTransitRow[]; total: number }> {
    return this.http.get<{ rows: ReconReportInTransitRow[]; total: number }>(`${this.reconReportBaseUrl}/in-transit`, { params: this.reconReportParams(f) });
  }

  getReconReportByProvider(f: ReconReportFilters): Observable<{ rows: ReconReportProviderRow[] }> {
    return this.http.get<{ rows: ReconReportProviderRow[] }>(`${this.reconReportBaseUrl}/by-provider`, { params: this.reconReportParams(f) });
  }

  getPostingAudit(args: { page?: number; pageSize?: number; from?: string; to?: string; location?: string; payer?: string; postedBy?: string } = {}): Observable<PostingAuditResponse> {
    let params = new HttpParams()
      .set('page',     String(args.page     ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));
    if (args.from)     params = params.set('from',     args.from);
    if (args.to)       params = params.set('to',       args.to);
    if (args.location) params = params.set('location', args.location);
    if (args.payer)    params = params.set('payer',    args.payer);
    if (args.postedBy) params = params.set('postedBy', args.postedBy);
    return this.http.get<PostingAuditResponse>(`${this.reconReportBaseUrl}/posting-audit`, { params });
  }

  exportReconDetailCsv(f: ReconReportFilters): Observable<string> {
    return this.http.get(`${this.reconReportBaseUrl}/export`,
      { params: this.reconReportParams(f) as any, responseType: 'text' });
  }

  // -- Patient Statements ---------------------------------------------------

  getPatientBalances(args: PatientStatementFilters & { page?: number; pageSize?: number } = {}): Observable<PatientBalancesResponse> {
    let params = this.buildCommonParams({
      from: args.from,
      to: args.to,
      payers: args.payers,
      providers: args.providers,
      location: args.location,
    })
      .set('page', String(args.page ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));

    if (args.minBalance != null) params = params.set('minBalance', String(args.minBalance));
    if (args.maxDaysAging != null) params = params.set('maxDaysAging', String(args.maxDaysAging));
    if (args.agingBucket) params = params.set('agingBucket', args.agingBucket);
    if (args.lastStatementBefore) params = params.set('lastStatementBefore', args.lastStatementBefore);
    for (const id of args.patientIds ?? []) params = params.append('patientIds', String(id));

    return this.http.get<PatientBalancesResponse>(`${this.patientStatementsBaseUrl}/balances`, { params });
  }

  generateStatementBatch(body: { patientIds?: number[]; filters?: PatientStatementFilters }): Observable<GenerateStatementBatchResponse> {
    return this.http.post<GenerateStatementBatchResponse>(`${this.patientStatementsBaseUrl}/generate-batch`, body);
  }

  getBatchStatus(batchId: string): Observable<StatementBatchStatus> {
    return this.http.get<StatementBatchStatus>(`${this.patientStatementsBaseUrl}/batch/${batchId}`);
  }

  getRecentBatches(): Observable<{ batches: StatementBatchStatus[] }> {
    return this.http.get<{ batches: StatementBatchStatus[] }>(`${this.patientStatementsBaseUrl}/batches`);
  }

  getStatementPdfUrl(id: string): string {
    return `${this.patientStatementsBaseUrl}/${id}/pdf`;
  }

  // -- ERA Ingestion -------------------------------------------------------------

  uploadEraFile(file: File): Observable<{ logId: number; status: string; claimsFound: number; claimsMatched: number }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ logId: number; status: string; claimsFound: number; claimsMatched: number }>(`${this.eraIngestionBaseUrl}/upload`, fd);
  }

  getEraIngestionHistory(args: {
    page?: number; pageSize?: number;
    search?: string; sortBy?: string; sortDir?: 'asc' | 'desc';
    status?: string; fileType?: string;
  } = {}): Observable<{ rows: EraIngestionLogRow[]; total: number; page: number; pageSize: number }> {
    let params = new HttpParams()
      .set('page',     String(args.page     ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));
    if (args.search)   params = params.set('search',   args.search);
    if (args.sortBy)   params = params.set('sortBy',   args.sortBy);
    if (args.sortDir)  params = params.set('sortDir',  args.sortDir);
    if (args.status)   params = params.set('status',   args.status);
    if (args.fileType) params = params.set('fileType', args.fileType);
    return this.http.get<{ rows: EraIngestionLogRow[]; total: number; page: number; pageSize: number }>(
      `${this.eraIngestionBaseUrl}/history`, { params }
    );
  }

  getEraIngestionDetail(id: number): Observable<EraIngestionDetail> {
    return this.http.get<EraIngestionDetail>(`${this.eraIngestionBaseUrl}/${id}`);
  }

  fetchEraFromClearinghouse(connectionId: number): Observable<{
    connectionId: number; connectionName: string;
    fetched: number; ingested: number; errors: string[]; fetchedAt: string;
  }> {
    return this.http.post<any>(`${this.eraIngestionBaseUrl}/fetch-now`, { connectionId });
  }

  getClearinghouseConnections(): Observable<{ rows: Array<{ id: number; connection_name: string; last_era_fetch_at: string | null }> }> {
    return this.http.get<any>(`${environment.server.baseUrl}/recon-iq/clearinghouse-connections`);
  }

  // -- Auto-Matching Suggestions ------------------------------------------------

  generateSuggestions(): Observable<{ generated: number }> {
    return this.http.post<{ generated: number }>(`${this.matchingBaseUrl}/generate-suggestions`, {})
      .pipe(catchError(() => of({ generated: 0 })));
  }

  getSuggestions(args: { page?: number; pageSize?: number; minScore?: number } = {}): Observable<{ rows: MatchSuggestionRow[] }> {
    let params = new HttpParams()
      .set('page',     String(args.page     ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));
    if (args.minScore != null) params = params.set('minScore', String(args.minScore));
    return this.http.get<{ rows: MatchSuggestionRow[] }>(`${this.matchingBaseUrl}/suggestions`, { params })
      .pipe(catchError(() => of({ rows: [] })));
  }

  acceptSuggestion(id: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.matchingBaseUrl}/suggestions/${id}/accept`, {})
      .pipe(catchError(err => throwError(() => err)));
  }

  rejectSuggestion(id: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.matchingBaseUrl}/suggestions/${id}/reject`, {})
      .pipe(catchError(err => throwError(() => err)));
  }

  autoAcceptSuggestions(threshold = 80): Observable<{ accepted: number }> {
    return this.http.post<{ accepted: number }>(`${this.matchingBaseUrl}/auto-accept`, { threshold })
      .pipe(catchError(err => throwError(() => err)));
  }

  // -- Bank Escalations ---------------------------------------------------------

  getBankEscalations(args: { status?: string; priority?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}): Observable<BankEscalationsResponse> {
    let params = new HttpParams()
      .set('page',     String(args.page     ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));
    if (args.status)   params = params.set('status',   args.status);
    if (args.priority) params = params.set('priority', args.priority);
    if (args.from)     params = params.set('from',     args.from);
    if (args.to)       params = params.set('to',       args.to);
    return this.http.get<BankEscalationsResponse>(this.bankEscalationsBaseUrl, { params });
  }

  getBankEscalationStats(): Observable<BankEscalationStats> {
    return this.http.get<BankEscalationStats>(`${this.bankEscalationsBaseUrl}/stats`);
  }

  createBankEscalation(body: { bankDepositId?: string; issueType: string; description?: string; priority?: string }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.bankEscalationsBaseUrl, body);
  }

  updateBankEscalation(id: number, body: { status?: string; assignedTo?: string; resolutionNotes?: string; priority?: string }): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.bankEscalationsBaseUrl}/${id}`, body);
  }

  // -- Recon Alerts -------------------------------------------------------------

  getReconAlerts(args: { status?: string; type?: string; severity?: string; page?: number; pageSize?: number } = {}): Observable<{ rows: ReconAlertRow[] }> {
    let params = new HttpParams()
      .set('page',     String(args.page     ?? 1))
      .set('pageSize', String(args.pageSize ?? 25));
    if (args.status)   params = params.set('status',   args.status);
    if (args.type)     params = params.set('type',     args.type);
    if (args.severity) params = params.set('severity', args.severity);
    return this.http.get<{ rows: ReconAlertRow[] }>(`${environment.server.baseUrl}/recon-iq/alerts`, { params });
  }

  acknowledgeAlert(id: number): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${environment.server.baseUrl}/recon-iq/alerts/${id}/acknowledge`, {});
  }

  getAlertConfigs(): Observable<{ configs: ReconAlertConfigItem[] }> {
    return this.http.get<{ configs: ReconAlertConfigItem[] }>(`${environment.server.baseUrl}/recon-iq/alerts/config`);
  }

  upsertAlertConfig(body: { alertType: string; thresholdDays: number; severity?: string; isEnabled?: boolean; notifyEmails?: string }): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${environment.server.baseUrl}/recon-iq/alerts/config`, body);
  }

  deleteAlertConfig(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${environment.server.baseUrl}/recon-iq/alerts/config/${id}`);
  }

  getCms1500Html(claimId: string): Observable<string> {
    return this.http.get(`${environment.server.baseUrl}/recon-iq/claims/${encodeURIComponent(claimId)}/cms1500`, {
      responseType: 'text',
    });
  }

  // -- Admin Config --------------------------------------------------------------

  getReconIqAdminConfig(): Observable<ReconIqAdminConfig> {
    return this.http.get<ReconIqAdminConfig>(`${environment.server.baseUrl}/recon-iq/admin/config`);
  }

  updateReconIqAdminConfig(body: Partial<ReconIqAdminConfig>): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${environment.server.baseUrl}/recon-iq/admin/config`, body);
  }

  // -- Bank Account Connections --------------------------------------------------

  private get bankAcctBase(): string { return `${environment.server.baseUrl}/recon-iq/bank-account-connections`; }

  getBankAccountConnections(): Observable<{ accounts: BankAccountConnection[] }> {
    return this.http.get<{ accounts: BankAccountConnection[] }>(this.bankAcctBase)
      .pipe(catchError(() => of({ accounts: [] })));
  }

  createBankAccountConnection(body: BankAccountConnectionPayload): Observable<{ id: number; message: string }> {
    return this.http.post<{ id: number; message: string }>(this.bankAcctBase, body);
  }

  updateBankAccountConnection(id: number, body: Partial<BankAccountConnectionPayload>): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.bankAcctBase}/${id}`, body);
  }

  deleteBankAccountConnection(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.bankAcctBase}/${id}`);
  }

  testBankAccountConnection(id: number): Observable<{ passed: boolean; latency_ms: number; bank_name: string; connection_type: string; detail: any }> {
    return this.http.post<{ passed: boolean; latency_ms: number; bank_name: string; connection_type: string; detail: unknown }>(`${this.bankAcctBase}/${id}/test`, {});
  }

  getBankAccountAuditLog(params?: { accountId?: number; limit?: number; offset?: number }): Observable<{ entries: BankAccountAuditEntry[]; total: number }> {
    const p: Record<string, string> = {};
    if (params?.accountId) p['accountId'] = String(params.accountId);
    if (params?.limit)     p['limit']     = String(params.limit);
    if (params?.offset)    p['offset']    = String(params.offset);
    return this.http.get<{ entries: BankAccountAuditEntry[]; total: number }>(`${this.bankAcctBase}/audit-log`, { params: p });
  }

  bulkPostWithBank(remittanceFileIds: string[], bankAccountId?: number): Observable<{ posted: number; failed: string[]; skipped: string[] }> {
    return this.http.post<{ posted: number; failed: string[]; skipped: string[] }>(`${this.reconciliationBaseUrl}/bulk-post`, { remittanceFileIds, bankAccountId });
  }

  // -- Secondary Billing -----------------------------------------------------

  private get secondaryBillingBase(): string { return `${environment.server.baseUrl}/recon-iq/secondary-billing`; }

  getSecondaryBillingQueue(args: {
    status?: string;
    secondaryPayer?: string;
    location?: string;
    page?: number;
    pageSize?: number;
  }): Observable<SecondaryBillingQueueResponse> {
    let params = new HttpParams();
    if (args.status && args.status !== 'all') params = params.set('status', args.status);
    if (args.secondaryPayer) params = params.set('secondaryPayer', args.secondaryPayer);
    if (args.location)       params = params.set('location', args.location);
    if (args.page)           params = params.set('page', String(args.page));
    if (args.pageSize)       params = params.set('pageSize', String(args.pageSize));
    return this.http.get<SecondaryBillingQueueResponse>(this.secondaryBillingBase, { params });
  }

  markSecondarySubmitted(ids: number[], submittedBy?: string): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(`${this.secondaryBillingBase}/mark-submitted`, { ids, submittedBy });
  }

  getClaimSummary(claimId: string): Observable<any> {
    return this.http.get<any>(`${environment.server.baseUrl}/recon-iq/claim-summary/${claimId}`);
  }
}
