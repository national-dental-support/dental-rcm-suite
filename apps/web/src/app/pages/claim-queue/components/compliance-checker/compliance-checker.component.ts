import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  ViewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.server.baseUrl}/denial-iq/compliance-checker`;

export interface ComplianceRule {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  category: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

export interface AuditResult {
  claimId: string;
  checkedAt: string;
  score: string;
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: { total: number; passed: number; warnings: number; failures: number };
  ruleResults: RuleResult[];
}

interface AuditRow {
  claimId: string;
  patient: string;
  submitDate: string;
  score: string | null;
  status: 'pass' | 'warning' | 'fail' | null;
  failingRules?: RuleResult[];
}

@Component({
  selector: 'app-compliance-checker',
  templateUrl: './compliance-checker.component.html',
  styleUrls: ['./compliance-checker.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComplianceCheckerComponent implements OnInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  rules: ComplianceRule[] = [];
  rulesByCategory: { category: string; rules: ComplianceRule[] }[] = [];

  auditRows: AuditRow[] = [];
  selectedAudit: AuditResult | null = null;

  totalClaims = 0;
  pageSize = 50;
  currentPage = 0;

  loading = false;
  claimsLoading = false;
  checksRunning = false;
  auditRunning = false;
  togglingRuleId: string | null = null;
  batchClaimIds = '';

  get totalWarnings(): number { return this.auditRows.filter(r => r.status === 'warning').length; }
  get totalFailures(): number { return this.auditRows.filter(r => r.status === 'fail').length; }
  get totalPassed(): number   { return this.totalClaims - this.totalWarnings - this.totalFailures; }

  displayedColumns = ['claimId', 'patient', 'submitDate', 'score', 'status', 'actions'];

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadRules();
    this.loadClaims(0);
  }

  // -- Rules -------------------------------------------------------------------

  loadRules(): void {
    this.loading = true;
    this.http.get<{ rules: ComplianceRule[] }>(`${BASE}/rules`).subscribe({
      next: resp => {
        this.rules = resp.rules;
        this.groupRulesByCategory();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  groupRulesByCategory(): void {
    const map = new Map<string, ComplianceRule[]>();
    for (const rule of this.rules) {
      if (!map.has(rule.category)) map.set(rule.category, []);
      map.get(rule.category)!.push(rule);
    }
    this.rulesByCategory = [...map.entries()].map(([category, rules]) => ({ category, rules }));
  }

  toggleRule(rule: ComplianceRule): void {
    const newEnabled = !rule.enabled;
    this.togglingRuleId = rule.id;
    this.http.put(`${BASE}/rules/${rule.id}`, { enabled: newEnabled }).subscribe({
      next: () => {
        rule.enabled = newEnabled;
        this.togglingRuleId = null;
        this.cdr.markForCheck();
        this.autoCheckPage();
      },
      error: () => {
        this.togglingRuleId = null;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Claims list (paginated) -------------------------------------------------

  loadClaims(page: number): void {
    this.claimsLoading = true;
    this.currentPage   = page;
    this.http
      .get<{ claims: any[]; total: number }>(`${BASE}/claims?page=${page + 1}&pageSize=${this.pageSize}`)
      .subscribe({
        next: resp => {
          this.auditRows    = resp.claims.map(c => ({ claimId: c.claimId, patient: c.patient, submitDate: c.submitDate, score: null, status: null }));
          this.totalClaims  = resp.total;
          this.claimsLoading = false;
          this.cdr.markForCheck();
          this.autoCheckPage();
        },
        error: () => {
          this.claimsLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private autoCheckPage(): void {
    const ids = this.auditRows.map(r => r.claimId);
    if (!ids.length) return;

    this.checksRunning = true;
    this.cdr.markForCheck();

    this.http
      .post<{ summary: any; results: AuditResult[] }>(`${BASE}/batch-check`, { claimIds: ids })
      .subscribe({
        next: resp => {
          const resultMap = new Map(resp.results.map(r => [r.claimId, r]));
          this.auditRows = this.auditRows.map(row => {
            const r = resultMap.get(row.claimId);
            return r ? {
              ...row, score: r.score, status: r.overallStatus,
              failingRules: r.ruleResults.filter(rr => rr.status !== 'pass'),
            } : row;
          });
          this.checksRunning = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.checksRunning = false;
          this.cdr.markForCheck();
        },
      });
  }

  onPage(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.loadClaims(event.pageIndex);
  }

  // -- Per-claim audit ---------------------------------------------------------

  viewClaimAudit(row: AuditRow): void {
    this.http.get<AuditResult>(`${BASE}/claims/${row.claimId}/check`).subscribe({
      next: result => {
        // Update the row inline so the table reflects the result immediately
        row.score  = result.score;
        row.status = result.overallStatus;
        // Open the drill-down panel
        this.selectedAudit = result;
        this.cdr.markForCheck();
      },
      error: () => {
        row.score  = '!';
        row.status = 'fail';
        this.cdr.markForCheck();
      },
    });
  }

  closeAuditDetail(): void {
    this.selectedAudit = null;
    this.cdr.markForCheck();
  }

  // -- Batch audit (manual input) ----------------------------------------------

  runAudit(): void {
    const ids = this.batchClaimIds.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) return;

    this.auditRunning = true;
    this.http
      .post<{ summary: any; results: AuditResult[] }>(`${BASE}/batch-check`, { claimIds: ids })
      .subscribe({
        next: resp => {
          // Merge results back into existing rows, or prepend new ones
          const resultMap = new Map(resp.results.map(r => [r.claimId, r]));
          this.auditRows = this.auditRows.map(row => {
            const r = resultMap.get(row.claimId);
            if (r) { resultMap.delete(row.claimId); return { ...row, score: r.score, status: r.overallStatus }; }
            return row;
          });
          // Any IDs not already in the list get prepended
          const newRows: AuditRow[] = [...resultMap.values()].map(r => ({
            claimId: r.claimId, patient: 'N/A', submitDate: new Date(r.checkedAt).toISOString().split('T')[0],
            score: r.score, status: r.overallStatus,
          }));
          this.auditRows    = [...newRows, ...this.auditRows];
          this.batchClaimIds = '';
          this.auditRunning  = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.auditRunning = false;
          this.cdr.markForCheck();
        },
      });
  }

  severityColor(severity: string): string {
    if (severity === 'critical') return 'warn';
    if (severity === 'warning')  return 'accent';
    return 'primary';
  }

  failureTooltip(row: AuditRow): string {
    if (!row.failingRules?.length) return '';
    return row.failingRules
      .map(r => `${r.status === 'fail' ? '\u2717' : '\u26A0'} ${r.ruleName}: ${r.message}`)
      .join('\n');
  }
}
