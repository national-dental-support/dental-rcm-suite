// src/app/pages/claim-vision/claim-vision.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Rule, RuleScope, RuleDraft } from '../../core/models/rules.model';
import { DateUtilService } from './date-util.service';

export type ClaimStatus = 'Not complete' | 'Completed';

export interface ClaimVisionBatch {
  id: string;
  submittedDate: string | null;    // maps from batchWeekStart
  rejectedClaimsCount: number;     // maps from rejectedClaimsCount
  rejectionMessage: string;
  rejectedBy: string;              // kept for compat - maps ruleType now
  ruleId: string;                  // maps from ruleId
  ruleName: string;                // maps from ruleName
  category: string;                // maps from category
  ruleType: string;                // 'System' or 'Custom'
}

export interface RejectedClaimsTrendPoint {
  month: string;
  rejectedCount: number;
  rulesTriggered: number;
}

export interface ClaimVisionClaimDetail {
  id: string;
  rejectedClaimId: string;
  batchId: string;
  priority: number;
  patient: string;
  accountNumber?: string;
  submittedDate: string;           // formatted for display
  dateOfService?: string;          // formatted for display
  payer: string;
  chargeAmt?: number;
  insuranceBalance?: number;
  agingDays?: number;
  status: ClaimStatus;
  rejectionMessage: string;
  rejectedBy: string;
}

interface ApiResponse<T> {
  message: string;
  data: T[];
}

/**
 * Raw row from /api/claim-vision/rejected-claims
 */
interface RejectedClaimSummaryRaw {
  batchWeekStart: string | null;
  rejectedClaimsCount: number | null;
  ruleName: string | null;
  category: string | null;
  rejectionMessage: string | null;
  ruleType: string | null;
  ruleId: string | null;
  totalCount: number | null;
}

interface RejectedClaimsTrendRaw {
  month: string;
  rejectedCount: number;
  rulesTriggered: number;
}

/**
 * Raw row from /api/claim-vision/rejected-claims-detail
 *
 * SELECT
 *   Priority           AS [Priority],
 *   PatientName        AS [Patient],
 *   SubmittedDate      AS [Submitted Date],
 *   PayerName          AS [Payer],
 *   'Not complete'     AS [Status],
 *   ClaimID            AS [ClaimID],
 *   RejectionMessage   AS [Rejection Message],
 *   RejectedBy         AS [Rejected by],
 *   BatchWeekStart     AS [Batch Week Start]
 */
interface RejectedClaimDetailRaw {
  ['RejectedClaimID']: string | null;
  ['Priority']: number | null;
  ['Patient']: string | null;
  ['Submitted Date']: string | null;
  ['Date Of Service']: string | null;
  ['Payer']: string | null;
  ['Charge Amount']: number | null;
  ['Insurance Balance']: number | null;
  ['Aging Days']: number | null;
  ['Status']: string | null;
  ['ClaimID']: string | number | null;
  ['Rejection Message']: string | null;
  ['Rejected by']: string | null;
  ['Batch Week Start']: string | null;
}

/**
 * Raw shape from /custom-rules and /system-rules
 *
 * SELECT
 *   r.RuleName                     AS [Rule name],
 *   r.Category                     AS [Category],
 *   r.Description                  AS [Description],
 *   r.ExpirationDate               AS [Expires],
 *   r.CreateDate                   AS [Created Date],
 *   r.CreatedBy                    AS [Created By],
 *   lh.ModifiedDate                AS [Modified Date],
 *   lh.ModifiedBy                  AS [Modified By],
 *   ra.ActivationName              AS [Activation status],
 *   COALESCE(ci.ClaimsImpacted, 0) AS [Claims impacted],
 *   r.RuleID                       AS [RuleID]
 */
interface RuleRaw {
  ['Rule name']: string;
  ['Category']: string | null;
  ['Description']: string | null;
  ['Expires']: string | null;
  ['Created Date']: string;
  ['Created By']: string;
  ['Modified Date']: string | null;
  ['Modified By']: string | null;
  ['Activation status']: string | null;
  ['Claims impacted']: number | null;
  ['RuleID']: string;
  ['MatchType']: string | null;
  ['Conditions']: string | null;
  ['Actions']: string | null;
  ['Scope']: string | null;
  ['ScopeValues']: string | null;
  ['ExecutionOrder']: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class ClaimVisionService {
  /**
   * Backend is mounted at:
   *   app.use('/api/claim-vision', validateApiKey, claimVisionRoute);
   *
   * If environment.apiBaseUrl = '.../api'
   * then baseUrl = '.../api/claim-vision'
   */
  private readonly baseUrl = `${environment.server.baseUrl}/claim-vision`;

  constructor(private http: HttpClient, private dateUtil: DateUtilService) {}

  // -----------------------------------------------
  // Rejected batches (summary)
  // -----------------------------------------------

  getRejectedClaims(page = 1, pageSize = 100): Observable<ClaimVisionBatch[]> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    return this.http
      .get<ApiResponse<RejectedClaimSummaryRaw>>(
        `${this.baseUrl}/rejected-claims`,
        { params }
      )
      .pipe(
        map((res) => (res.data || []).map((row) => this.mapToBatch(row))),
        catchError(() => of([]))
      );
  }

  getRejectedClaimsTrend(): Observable<RejectedClaimsTrendPoint[]> {
    return this.http
      .get<ApiResponse<RejectedClaimsTrendRaw>>(
        `${this.baseUrl}/rejected-claims-trend`
      )
      .pipe(
        map((res) => (res.data || []).map((row) => ({
          month: row.month,
          rejectedCount: row.rejectedCount ?? 0,
          rulesTriggered: row.rulesTriggered ?? 0,
        }))),
        catchError(() => of([]))
      );
  }

  // -----------------------------------------------
  // Rejected claims detail
  // NOTE: backend currently hard-codes RuleID + most recent week,
  // so batchId is for frontend correlation + future-proofing.
  // -----------------------------------------------

  getRejectedClaimsDetail(batchId: string, ruleId?: string, batchWeekStart?: string): Observable<ClaimVisionClaimDetail[]> {
    let params = new HttpParams();
    if (ruleId) params = params.set('ruleId', ruleId);
    if (batchWeekStart) params = params.set('batchWeekStart', batchWeekStart);

    return this.http
      .get<ApiResponse<RejectedClaimDetailRaw>>(
        `${this.baseUrl}/rejected-claims-detail`,
        { params }
      )
      .pipe(
        map((res) =>
          (res.data || []).map((row) => this.mapToDetail(row, batchId))
        ),
        catchError(() => of([]))
      );
  }

  // -----------------------------------------------
  // Rules endpoints
  // -----------------------------------------------

  /** GET /api/claim-vision/custom-rules */
 getCustomRules(): Observable<Rule[]> {
  return this.http
    .get<ApiResponse<RuleRaw[]>>(`${this.baseUrl}/custom-rules`)
    .pipe(
      map((resp) => (resp.data || []).map((raw) => this.mapRule(raw, 'custom')))
    );
}

getSystemRules(): Observable<Rule[]> {
  return this.http
    .get<ApiResponse<RuleRaw[]>>(`${this.baseUrl}/system-rules`)
    .pipe(
      map((resp) => (resp.data || []).map((raw) => this.mapRule(raw, 'system')))
    );
}

  // -----------------------------------------------
  // Mapping helpers - Rejected batches
  // -----------------------------------------------

  private mapToBatch(raw: RejectedClaimSummaryRaw): ClaimVisionBatch {
    const submittedDate = raw.batchWeekStart ?? null;
    const rejectedClaimsCount = raw.rejectedClaimsCount ?? 0;
    const rejectionMessage = raw.rejectionMessage ?? '';
    const ruleType = raw.ruleType ?? '';
    const ruleId = raw.ruleId ?? '';
    const ruleName = raw.ruleName ?? '';
    const category = raw.category ?? '';

    // Composite ID: stable enough for routing + lookups
    const id = this.buildBatchId(raw);

    return {
      id,
      submittedDate,
      rejectedClaimsCount,
      rejectionMessage,
      rejectedBy: ruleType,   // backwards compat - "rejectedBy" column now shows ruleType
      ruleId,
      ruleName,
      category,
      ruleType,
    };
  }

  private buildBatchId(raw: RejectedClaimSummaryRaw): string {
    return [
      raw.batchWeekStart ?? '',
      raw.rejectionMessage ?? '',
      raw.ruleId ?? '',
    ]
      .map((v) => String(v).replace(/\s+/g, '_'))
      .join('|');
  }

  // -----------------------------------------------
  // Mapping helpers - Rejected claim detail
  // -----------------------------------------------

  private mapToDetail(
    raw: RejectedClaimDetailRaw,
    batchId: string
  ): ClaimVisionClaimDetail {
    const submittedRaw = raw['Submitted Date'];
    const submittedDate = submittedRaw
      ? this.formatDateShort(submittedRaw)
      : '';

    const claimIdRaw = raw['ClaimID'];
    const claimId = claimIdRaw != null ? String(claimIdRaw) : '';

    const statusRaw = (raw['Status'] || 'Not complete') as ClaimStatus;

    const dosRaw = raw['Date Of Service'];
    const dateOfService = dosRaw ? this.formatDateShort(dosRaw) : undefined;

    const chargeAmtRaw = raw['Charge Amount'];
    const insBalRaw = raw['Insurance Balance'];
    const agingRaw = raw['Aging Days'];

    return {
      id: claimId || `${batchId}|${raw['Priority'] ?? 0}`,
      rejectedClaimId: raw['RejectedClaimID'] ?? '',
      batchId,
      priority: raw['Priority'] ?? 0,
      patient: raw['Patient'] ?? '',
      submittedDate,
      dateOfService,
      payer: raw['Payer'] ?? '',
      chargeAmt:        chargeAmtRaw != null ? Number(chargeAmtRaw) : undefined,
      insuranceBalance: insBalRaw   != null ? Number(insBalRaw)   : undefined,
      agingDays:        agingRaw    != null ? Number(agingRaw)    : undefined,
      status: statusRaw,
      rejectionMessage: raw['Rejection Message'] ?? '',
      rejectedBy: raw['Rejected by'] ?? '',
    };
  }

  // -----------------------------------------------
  // Mapping helpers - Rules -> Rule model
  // -----------------------------------------------

 private mapRule(raw: any, kind: 'custom' | 'system'): Rule {
  const name = raw['Rule name'] ?? '';
  const category = raw['Category'] ?? '';
  const description = raw['Description'] ?? '';
  const expires = (raw['Expires'] as string | null | undefined) ?? null;

  const createdDate = raw['Created Date'] as string | null | undefined;
  const createdBy = raw['Created By'] ?? 'Unknown';

  const modifiedDate = raw['Modified Date'] as string | null | undefined;
  const modifiedBy = raw['Modified By'] ?? '\u2014';

  const activation = raw['Activation status'] ?? '';
  const claimsImpactedRaw = raw['Claims impacted'];

  const claimsImpacted =
    typeof claimsImpactedRaw === 'number'
      ? claimsImpactedRaw
      : claimsImpactedRaw != null
      ? Number(claimsImpactedRaw)
      : 0;

  // Parse JSON columns with safe fallbacks
  const matchType = (raw['MatchType'] || 'any') as 'any' | 'all';
  const conditions = this.safeJsonParse(raw['Conditions'], []);
  const actions = this.safeJsonParse(raw['Actions'], []);
  const scope = (raw['Scope'] || 'enterprise') as RuleScope;
  const scopeValues = this.safeJsonParse(raw['ScopeValues'], []);

  return {
    id: raw['RuleID'] ?? '',
    name,
    category,
    description,
    expiresOn: expires,
    createdLabel: this.buildCreatedLabel(createdDate, createdBy),
    modifiedLabel: this.buildModifiedLabel(modifiedDate, modifiedBy),
    status: activation || 'Inactive',
    claimsImpacted,
    matchType,
    conditions,
    actions,
    kind,
    scope,
    scopeValues,
    priority: raw['ExecutionOrder'] ?? 0,
  };
}

private safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// -----------------------------------------------
// Create / Update rules via backend
// -----------------------------------------------

createRule(draft: RuleDraft): Observable<{ ruleId: string }> {
  const body = {
    name: draft.name,
    category: draft.category,
    description: draft.description,
    ruleType: draft.kind === 'system' ? 'System' : 'Custom',
    matchType: draft.matchType,
    conditions: JSON.stringify(draft.conditions),
    actions: JSON.stringify(draft.actions),
    scope: draft.scope,
    scopeValues: JSON.stringify(draft.scopeValues),
    activeFlag: draft.status === 'Active' || draft.status === 'Expires' ? 1 : 0,
    expirationDate: draft.expiresOn || null,
    createdBy: 'You',
  };
  return this.http
    .post<{ message: string; data: { ruleId: string } }>(`${this.baseUrl}/rules`, body)
    .pipe(map((r) => r.data), catchError(err => throwError(() => err)));
}

// -----------------------------------------------
// Update rejected claim status
// -----------------------------------------------

updateRejectedClaimStatus(rejectedClaimId: string, status: ClaimStatus): Observable<void> {
  return this.http
    .patch<{ message: string }>(`${this.baseUrl}/rejected-claims/${rejectedClaimId}/status`, { status })
    .pipe(map(() => void 0));
}

updateRule(ruleId: string, draft: RuleDraft): Observable<{ ruleId: string }> {
  const body = {
    name: draft.name,
    category: draft.category,
    description: draft.description,
    matchType: draft.matchType,
    conditions: JSON.stringify(draft.conditions),
    actions: JSON.stringify(draft.actions),
    scope: draft.scope,
    scopeValues: JSON.stringify(draft.scopeValues),
    activeFlag: draft.status === 'Active' || draft.status === 'Expires' ? 1 : 0,
    expirationDate: draft.expiresOn || null,
    modifiedBy: 'You',
  };
  return this.http
    .put<{ message: string; data: { ruleId: string } }>(`${this.baseUrl}/rules/${ruleId}`, body)
    .pipe(map((r) => r.data), catchError(err => throwError(() => err)));
}

deleteRule(ruleId: string): Observable<{ ruleId: string }> {
  return this.http
    .delete<{ message: string; data: { ruleId: string } }>(`${this.baseUrl}/rules/${ruleId}`)
    .pipe(map((r) => r.data), catchError(err => throwError(() => err)));
}

reorderRules(items: { ruleId: string; executionOrder: number }[]): Observable<void> {
  return this.http
    .patch<{ message: string }>(`${this.baseUrl}/rules/reorder`, { items })
    .pipe(map(() => void 0));
}

  private formatDateShort(dateStr: string | null | undefined): string {
    return this.dateUtil.toDisplay(dateStr) || dateStr || '';
  }

  private buildPersonDateLabel(
    by: string | null | undefined,
    dateStr: string | null | undefined
  ): string {
    const parts: string[] = [];

    if (by) {
      parts.push(by);
    }

    if (dateStr) {
      parts.push(this.formatDateShort(dateStr));
    }

    if (!parts.length) {
      return '\u2014';
    }

    // Used with .split('\n') in the table
    return parts.join('\n');
  }

  private formatBackendDate(dateStr?: string | null): string {
    return this.dateUtil.toDisplay(dateStr) || dateStr || '';
  }

/**
 * Build the "Created" label shown in the table.
 * Example:
 *   "Jun 18, 2025\nTerry Allen"
 */
private buildCreatedLabel(
  createdDate?: string | null,
  createdBy?: string | null
): string {
  const dateLabel = this.formatBackendDate(createdDate);
  const who = (createdBy || '').trim();

  if (dateLabel && who) return `${dateLabel}\n${who}`;
  if (dateLabel) return dateLabel;
  if (who) return who;
  return '\u2014';
}

/**
 * Build the "Modified" label shown in the table.
 * Example:
 *   "Jul 01, 2025\nTerry Allen"
 * or "-" if nothing is set.
 */
private buildModifiedLabel(
  modifiedDate?: string | null,
  modifiedBy?: string | null
): string {
  const dateLabel = this.formatBackendDate(modifiedDate);
  const who = (modifiedBy || '').trim();

  if (dateLabel && who) return `${dateLabel}\n${who}`;
  if (dateLabel) return dateLabel;
  if (who) return who;
  return '\u2014';
}

getClaimSummary(claimId: string): Observable<{ rejected: boolean; rules: { ruleId: number; ruleName: string; description: string; category: string; rejectedDate: string }[] }> {
  return this.http.get<any>(`${this.baseUrl}/claim-summary/${claimId}`);
}

simulateRule(draft: object): Observable<{ matchCount: number; sampleClaims: any[] }> {
  return this.http.post<{ matchCount: number; sampleClaims: any[] }>(`${this.baseUrl}/rules/simulate`, draft);
}


}
