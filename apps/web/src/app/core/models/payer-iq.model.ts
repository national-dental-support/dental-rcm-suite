export type ContractStatus = 'Draft' | 'Active' | 'Terminated' | 'Expired' | 'Pending';

export type ContactType =
  | 'Contracting'
  | 'Provider Relations'
  | 'Claims'
  | 'EDI'
  | 'Escalation';

export interface PayerContact {
  id: string;
  type: ContactType;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export type FeeScheduleType =
  | 'FFS'
  | '% Medicare'
  | 'DRG'
  | 'Capitation'
  | 'Case Rate'
  | 'Other';

export interface FeeScheduleCodeRate {
  // Dental = CDT (D codes), Medical = CPT (5 digits) - we treat as "procedure codes" generically
  code: string;                  // e.g. "D1110" or "99213"
  codeType: 'CDT' | 'CPT';
  description?: string;

  // Common pricing shapes
  rateType: 'Dollar' | 'PercentOfBilled' | 'PercentOfMedicare' | 'CaseRate' | 'Other';

  // If Dollar
  fee?: number;                  // e.g. 85.00

  // If Percent-based
  percent?: number;              // e.g. 0.80 (80%) OR 80 - pick one convention and stick to it

  // Optional modifiers / constraints
  modifiers?: string[];          // e.g. ["26"] etc (rare for dental but fine)
  placeOfService?: string;       // optional
  maxUnits?: number;             // optional

  effectiveDate?: string;        // ISO, if code-level differs from schedule
  endDate?: string;              // ISO

  notes?: string;
}

export interface FeeSchedule {
  id: string;
  name: string;
  type: FeeScheduleType;
  effectiveDate: string; // ISO
  endDate?: string;      // ISO
  version?: string;
  status: 'Active' | 'Inactive';
  source: 'Ingested' | 'Manual';
  userVerified: boolean;
  notes?: string;
  attachments?: { id: string; name: string; url: string }[];

  // [ok] NEW: CPT/CDT codes attached to this schedule
  codes?: FeeScheduleCodeRate[];
}

export interface ContractDetails {
  payerName: string;
  networkName: string;
  contractId?: string;
  status: ContractStatus;
  effectiveDate: string; // ISO
  endDate?: string;      // ISO
  executionDate?: string;
  renewalDate?: string;

  // High-value operational fields (keep optional for now)
  timelyFilingDays?: number;
  appealWindowDays?: number;
  promptPayDays?: number;
  recoupmentLookbackMonths?: number;
  priorAuthRequired?: boolean;

  // Optional lists
  linesOfBusiness?: string[]; // Commercial, MA, Medicaid...
  states?: string[];          // service area
}

export interface NetworkInsuranceContract {
  id: string;
  displayName: string; // used in dropdown
  contacts: PayerContact[];
  details: ContractDetails;
  feeSchedules: FeeSchedule[];
  lastUpdated?: string; // ISO
}

export type PayerType = 'Commercial' | 'Government';
export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface PayerPerformanceRow {
  payerName: string;
  payerType: PayerType;
  leaseNetwork: string; // 'Direct' when none
  totalCharges: number;
  expectedPayment: number;
  actualPayment: number;
  varianceAmount: number; // actual - expected
  variancePercent: number; // variance / expected (0..1)
  underpaidClaimsCount: number;
  denialRatePercent: number; // 0..1
  avgPaymentPerClaim: number;
  riskLevel: RiskLevel;
}

export interface CdtPerformanceRow {
  code: string;
  description: string;
  totalClaims: number;
  totalCharges: number;
  allowedAmount: number;
  expectedPayment: number;
  actualPayment: number;
  varianceAmount: number;
  variancePercent: number;
  adjustmentAmount: number;
  patientResponsibility: number;
  denialsCount: number;
  avgPayment: number;
}

export interface LeaseNetworkRow {
  leaseNetwork: string;
  payersInNetworkCount: number;
  totalCharges: number;
  contractAllowable: number;
  actualPaid: number;
  varianceAmount: number;
  variancePercent: number;
  underpaidClaimsCount: number;
  avgDaysToPayment: number;
  denialRatePercent: number;
  riskLevel: RiskLevel;
  potentialSecretPayer: boolean;
}

// Formatting helpers (match what your table expects)
export const toCurrency = (n: number | null | undefined) =>
  n == null ? '\u2014' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const toPercent = (p: number | null | undefined) =>
  p == null ? '\u2014' : `${(p * 100).toFixed(1)}%`;

export const toNumber = (n: number | null | undefined) =>
  n == null ? '\u2014' : n.toLocaleString();
