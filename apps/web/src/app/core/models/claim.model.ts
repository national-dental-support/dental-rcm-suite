// Shared base shape - used by ClaimListItem (admin view) and can be extended by feature models.
export interface ClaimBase {
  id: string;
  status: string;
}

export interface ClaimListItem extends ClaimBase {
  claimNumber: string;
  claimantName: string;
  priority?: 'Low' | 'Med' | 'High' | 'Critical';
  assignedTo?: string | null;
  agingDays?: number;
  lastActionAt?: string; // ISO
  escalated?: boolean;
  notesCount?: number;
}

// Lightweight admin-facing claim view (not the DenialIQ detail - see claim-queue/models/claim.models.ts ClaimDetail).
export interface AdminClaimDetail extends ClaimBase {
  claimNumber: string;
  memberName: string;
  payerName?: string;
  owner?: string | null;
  sla?: string | null;
  tags?: string[];
  summary?: string;
}

export interface Note {
  id: string;
  author: string;
  createdAt: string; // ISO
  text: string;
  visibility?: 'internal' | 'external';
}
