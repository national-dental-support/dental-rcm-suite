// src/app/pages/claim-queue/models/claim.models.ts

export interface ClaimRow {
  id: string;             // ClaimID
  patient: string;        // PatientName
  payer?: string;         // PayerName
  submittedDate?: string | Date;
  charged?: number;
  insBalance?: number;
  issueCode?: string;     // our internal name for Issue text
  agingDays?: number;
  progress?: number;      // 0-100

  // Keep these optional for future / legacy parts of the UI
  priority?: number;
  balance?: number;
  client?: string;
  dos?: string | Date;
  assignedTo?: string;
  status?: 'Overdue' | 'Pending' | 'In Progress' | 'Completed' | string;

  // SLA / timely filing
  SlaStatus?: 'OVERDUE' | 'URGENT' | 'WARNING' | 'OK';
  daysUntilSla?: number | null;
  slaDeadline?: string | null;

  // new fields from backend
  dateOfService?: string | Date | null;
  accountNumber?: string | null;
  issueDescription?: string | null;
  escalationReason?: string | null;

  // filter fields
  providerName?: string;
  location?: string;
}

export interface ClaimDetail {
  // core identity
  id: string;
  patient: string;

  // optional identity info
  dob?: string | Date;
  dos?: string | Date;

  payer: string;
  provider: string;

  // subscriber / practice / provider card
  subscriberName?: string;
  subscriberId?: string;
  practiceLocation?: string;
  providerName?: string;
  npi?: string;
  taxId?: string;

  // dates / aging card
  dateOfService?: string | Date;
  receivedDate?: string | Date;
  agingDays?: number;
  paymentDate?: string | Date;
  depositAmount?: number;
  depositCheckNumber?: string;
  depositCleared?: string | Date;

  // payer card
  remitMethod?: string;
  paymentMethod?: string;
  network?: string;
  reasonCode?: string;
  placeOfService?: string;

  // balances / insurance card
  insuranceBalanceDue?: number;
  patientBalanceDue?: number;
  primaryIns?: string;
  secondaryIns?: string;
  tertiaryIns?: string;

  // assigned user
  assignedUserName?: string | null;
  assignedTo?: string | null;

  // remediation / notes
  remediationClaimId?: string;
  remediationProcedure?: string;
  nextStepTitle?: string;
  nextStepDescription?: string;
  notes?: string;

  // line items (we'll wire from a separate query later)
  lineItems: Array<{
    dos?: string | Date;
    cpt: string;
    cptDescription?: string;
    charge: number;
    allowed: number;
    paid: number;
    adjustment: number;
    balance: number;

    insurancePaid?: number;
    contractualAdj?: number;
    transactionAdj?: number;
    patientResp?: number;
    deductible?: number;
    copay?: number;
    coins?: number;
    reasonCode?: string;
  }>;
}

export interface ClaimFilters {
  search?: string;
  client?: string;
  status?: ClaimRow['status'][];
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ClaimQueueFilter {
  search?: string;
  assignedTo?: string;
  payer?: string | null;
  billingProvider?: string;
  aging?: string;
  by?: string;
  denialReason?: string;
  placeOfService?: string;
  claimStatus?: string;

  // AR specialist only
  insuranceOrPayer?: string;

  escalationReason?: string | null;

  // Table column filters
  priority?: string | null;
  patient?: string | null;
  claimId?: string | null;

  issueCode?: string | null;
  submittedFrom?: Date | null;
  submittedTo?: Date | null;
  minCharged?: number | null;
  maxCharged?: number | null;
  minInsBalance?: number | null;
  maxInsBalance?: number | null;
  minAging?: number | null;
  maxAging?: number | null;
  minProgress?: number | null;
  maxProgress?: number | null;
  slaStatus?: string | null;
}

export interface ClaimFilterOptions {
  assignedTo: string[];
  payer: string[];
  billingProvider: string[];
  denialReason: string[];
  placeOfService: string[];
  claimStatus: string[];
  escalationReason: string[];
}
