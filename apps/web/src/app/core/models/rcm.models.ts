// pages/analytics/rcm/rcm.models.ts
export type ManyOrAll = string[] | 'all';

export interface DateRange {
  start_date: string;
  end_date: string;
}

export interface Filters {
  provider?: ManyOrAll;
  practice_groups?: ManyOrAll;
  location?: ManyOrAll;
  date_of_service?: DateRange;
  payment_received?: DateRange; // currently kept blank in React
  payer?: ManyOrAll;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface RcmRecord {
  location: string;
  charges: number;
  insuranceBilled: number;
  insuranceCollections: number;
  patientCollections: number;
  grossCollections: number;
  collectionRate: number; // percent, e.g. 83.52
  adjustment: number;
  refund: number;
  subRows?: RcmRecord[];
}

// src/app/core/models/rcm-types.ts (or similar)

export interface ClaimsCountResponse {
  currentClaims: number;
  previousClaims: number;
  yoyChangePct: number | null;
}

export interface GrossProductionResponse {
  currentGrossCharges: number;
  previousGrossCharges: number;
  yoyChangePct: number | null;
}

export interface CollectionRateResponse {
  current: {
    charges: number;
    adjustments: number;
    grossCollections: number;
    collectionRate: number;
  };
  prior_year: {
    charges: number;
    adjustments: number;
    grossCollections: number;
    collectionRate: number;
  };
}

export interface RevenueByPracticeRow {
  Practice: string;
  Charges: number;
  InsuranceSubmitted: number;
  ExpectedInsurancePayment: number;
  ActualInsurancePayment: number;
  ExpectedPatientResponsibility: number;
  Adjustments: number;
  NetCollections: number;
  NetCollectionPct: number | null;
  Refunds: number;
}
export type RevenueByPracticeResponse = RevenueByPracticeRow[];

export interface LookupResponse {
  providers: string[];
  practiceGroups: string[];
  locations: string[];
}

export interface ClaimValueByStatusDto {
  ClaimStatus: string;
  ClaimValue: number;
}

export interface ClaimAmountsByPracticeDto {
  Practice: string;
  TotalClaimAmount: number;
}

export interface CollectionAdjustmentTrendDto {
  MonthLabel: string;
  Collections: number;
  Adjustments: number;
  CollectionRate: number | null;
}

export interface ClaimAmountsByPayerDto {
  Payer: string;
  TotalClaimAmount: number;
}

export interface ClaimValuesByTypeDto {
  ClaimType: string;
  TotalClaimAmount: number;
}

export interface ClaimsCountByLocationGroupDto {
  Location: string;
  GroupKey: string | null;
  Day?: string;
  Month?: string;
  ClaimsCount: number;
}

export interface ClaimsCountByLocationGroupResponse {
  daily: ClaimsCountByLocationGroupDto[];
  monthly: ClaimsCountByLocationGroupDto[];
}

export interface RcmLookups {
  providers: any[];       // you can tighten these later
  practiceGroups: any[];
  locations: any[];
}

