export interface MasterClaim {
  id: string;
  guid: string;
  patientId: string;
  payerId: string | number | null;
  providerId: string | number | null;
  dateOfService: string;
  chargeAmount: number;
  submittedDate: string;
  insuranceClaimId: string;
  customerId: number | null;
}

export type ProductSlug =
  | 'denial-iq'
  | 'recon-iq'
  | 'insightflow'
  | 'claim-vision'
  | 'payer-iq'
  | 'admin'
  // Not a product page: a privilege flag that grants cross-tenant access.
  | 'superadmin';

export interface ClaimEnrichmentMap {
  [slug: string]: { available: boolean };
}

export interface MasterClaimResponse {
  claim: MasterClaim;
  enrichments: ClaimEnrichmentMap;
}
