import { EncounterResearchPatientRowDto } from "../services/recon-iq.service";

export type IsoDateString = string; // "2025-01-01"
export type IsoDateTimeString = string; // "2026-02-09T18:22:11.123Z"

/**
 * Names-only location filter (NO IDs)
 */
export type ReconIqLocationScope = 'enterprise' | 'group' | 'practice' | 'location';

export type ReconIqLocationFilter =
  | { scope: 'enterprise' }
  | { scope: 'group'; groups: string[] }
  | { scope: 'practice'; practices: string[] }
  | { scope: 'location'; locations: string[] };

/**
 * Names-only filters (NO IDs)
 */
export type ReconIqDashboardFilters = {
  from?: IsoDateString;   // "YYYY-MM-DD"
  to?: IsoDateString;     // "YYYY-MM-DD"

  payers?: string[];
  providers?: string[];
  location?: ReconIqLocationFilter;
};

export type MatchStatKey =
  | 'payment_eob_matched'
  | 'payments_without_eob'
  | 'eob_without_payments'
  | 'escalated_bank_issues'
  | 'fully_reconciled_posted';

export type ReconIqMatchStat = {
  key: MatchStatKey;
  label: string;
  value: number;
  route: string; // FE route helper coming from backend
};

export type ReconIqMatchStatsResponse = {
  message: string;
  asOf: IsoDateTimeString;
  filters: ReconIqDashboardFilters;
  stats: readonly ReconIqMatchStat[];
};

// TODO: Replace this with the real shape returned by your denied controller.
// For now this is flexible + safe so you can wire FE without blocking.
export type ReconIqDeniedClaimsAndNonPaymentsResponse = {
  message?: string;
  asOf?: IsoDateTimeString;
  filters?: Partial<ReconIqDashboardFilters>;
  [key: string]: unknown;
};

export type DenialsNonPaymentsPointDto = {
  period: string;           // "2025-01"
  denialsAmount: number;    // 52000
  nonPaymentsCount: number; // 55
};

export type DenialsNonPaymentsResponseDto = {
  message: string;
  asOf: string; // ISO
  filters: {
    from?: string;
    to?: string;
    interval: 'month' | string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  };
  series: DenialsNonPaymentsPointDto[];
};

export type EncounterResearchPatientsResponseDto = {
  message: string;
  asOf: string; // ISO string
  filters: {
    search: string;
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

export type PatientClaimRowDto = {
  claimId: string;
  dateClaimSubmitted: string; // ISO date string
  eobId?: string | null;
  dateEobReceived?: string | null; // NOTE: controller uses dateEobReceived
};

export type PatientClaimsPatientDto = {
  patientAccount: string;
  patientName: string;
};

export type PatientClaimsResponseDto = {
  message: string;
  asOf: string; // ISO string
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

// recon-iq.models.ts

export type PostingStatus = 'POSTED' | 'UNPOSTED' | 'PENDING' | string;

export type PaymentReconciliationRowDto = {
  eobId: string;
  eobDate: string; // ISO date "YYYY-MM-DD"
  totalAmount: number;
  locationName: string;
  taxId: string;
  claimsWithMoneyCount: number;
  claimsZeroOpenCount: number;
  postingStatus: PostingStatus;
};

export type PaymentReconciliationResponseDto = {
  message: string;
  asOf: string; // ISO datetime
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
  rows: PaymentReconciliationRowDto[];
};

/** -----------------------------
 *  Matching: Payments / EOBs without Supporting Docs
 *  ----------------------------- */
export type PaymentsWithNoEobRowDto = {
  paymentId: string;
  value: string;
  paymentDate: string; // 'YYYY-MM-DD' from API
  payerName: string;
  paymentType: string;
  amount: number;
  canFindEra: boolean;
  bankFeedId?: string;
};

export type PaymentsWithNoEobResponseDto = {
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
  rows: PaymentsWithNoEobRowDto[];
};

export type EobsWithNoPaymentRowDto = {
  eobId: string;
  value: string;
  eobDate: string; // 'YYYY-MM-DD' from API
  payerName: string;
  eobType: string;
  amount: number;
  canFindPayment: boolean;
};

export type EobsWithNoPaymentResponseDto = {
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
  rows: EobsWithNoPaymentRowDto[];
};

export type FullyReconciledLocationDto = {
  location: string;
  claimCount: number;
  totalCharge: number;
  totalAllowed: number;
  totalPaid: number;
  totalPatientResp: number;
  totalAdjustment: number;
};

export type FullyReconciledPaymentsRowDto = {
  reconciledId: string;
  postedDate: string;
  postedBy: string;
  fileType: string;
  fileDate: string;
  practiceLocation: string;
  locationList: string;
  locationCount: number;
  payerName: string;
  amountFullEra: number;
  reconciledDate: string;
  depositDate: string;
  amountDeposited: number;
  depositMethod: string;
  bankName: string;
  bankFeedId: string;
  bankAccountName: string;
  bankAccountNickname: string;
  claimCount: number;
  totalCharge: number;
  totalAllowed: number;
  totalPaid: number;
  totalPatientResp: number;
  totalAdjustment: number;
  sweepDate: string;
  sweepSourceBankName: string;
  sweepSourceAccountName: string;
  sweepDestBankName: string;
  sweepDestAccountName: string;
  sweepAmount: number;
};

export type FullyReconciledClaimDto = {
  claimId: string;
  location: string;
  payerName: string;
  dateOfService: string;
  chargeAmt: number;
  allowedAmt: number;
  paidAmt: number;
  patientRespAmt: number;
  adjustmentAmt: number;
  writeOff: number;
  lineStatus: string;
};

export type FullyReconciledPaymentsResponseDto = {
  message: string;
  asOf: string; // ISO datetime
  filters: {
    search?: string;
    from?: string;
    to?: string;

    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;

    bankName?: string;
    bankFeedId?: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  rows: FullyReconciledPaymentsRowDto[];
};
