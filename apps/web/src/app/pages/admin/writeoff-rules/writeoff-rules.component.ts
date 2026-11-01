import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../../environments/environment';

interface WriteOffRule {
  id?: number;
  rule_name: string;
  priority: number;
  conditions: any;
  adj_type: string;
  adj_note_template: string;
  requires_approval: boolean;
  approval_level: string | null;
  is_active: boolean;
}

interface ScanResult {
  dryRun: boolean;
  totalClaims: number;
  totalMatched: number;
  autoPosted: number;
  requestsCreated: number;
  matches: any[];
}

@Component({
    selector: 'rp-writeoff-rules-admin',
    templateUrl: './writeoff-rules.component.html',
    styleUrls: ['./writeoff-rules.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class WriteOffRulesAdminComponent implements OnInit {
  rules: WriteOffRule[] = [];
  loading = true;
  saving = false;
  scanning = false;
  scanResult: ScanResult | null = null;
  showEditor = false;
  editingRule: WriteOffRule = this.emptyRule();

  adjTypes = ['Bad Debt', 'Contractual', 'Courtesy', 'Insurance Write-off', 'Senior Discount', 'Prompt Pay'];
  approvalLevels = ['manager', 'director', 'vp'];

  private baseUrl = environment.server.baseUrl;

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadRules();
  }

  private emptyRule(): WriteOffRule {
    return {
      rule_name: '',
      priority: 100,
      conditions: { minAgingDays: 120, maxBalance: 50 },
      adj_type: 'Bad Debt',
      adj_note_template: '',
      requires_approval: false,
      approval_level: null,
      is_active: true,
    };
  }

  loadRules(): void {
    this.loading = true;
    this.http.get<WriteOffRule[]>(`${this.baseUrl}/writeoff/rules`).subscribe({
      next: (rules) => {
        this.rules = rules.map(r => ({
          ...r,
          conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions,
        }));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  newRule(): void {
    this.editingRule = this.emptyRule();
    this.showEditor = true;
  }

  editRule(rule: WriteOffRule): void {
    this.editingRule = { ...rule, conditions: { ...rule.conditions } };
    this.showEditor = true;
  }

  cancelEdit(): void {
    this.showEditor = false;
  }

  saveRule(): void {
    this.saving = true;
    const payload = { ...this.editingRule, conditions: this.editingRule.conditions };
    const obs = this.editingRule.id
      ? this.http.put(`${this.baseUrl}/writeoff/rules/${this.editingRule.id}`, payload)
      : this.http.post(`${this.baseUrl}/writeoff/rules`, payload);
    obs.subscribe({
      next: () => {
        this.saving = false;
        this.showEditor = false;
        this.snackBar.open('Rule saved', 'OK', { duration: 3000 });
        this.loadRules();
      },
      error: () => {
        this.saving = false;
        this.snackBar.open('Failed to save rule', 'Dismiss', { duration: 3000 });
        this.cdr.markForCheck();
      },
    });
  }

  deleteRule(rule: WriteOffRule): void {
    if (!rule.id) return;
    this.http.delete(`${this.baseUrl}/writeoff/rules/${rule.id}`).subscribe({
      next: () => {
        this.snackBar.open('Rule deleted', 'OK', { duration: 3000 });
        this.loadRules();
      },
    });
  }

  toggleActive(rule: WriteOffRule): void {
    if (!rule.id) return;
    this.http.put(`${this.baseUrl}/writeoff/rules/${rule.id}`, { ...rule, is_active: !rule.is_active }).subscribe({
      next: () => this.loadRules(),
    });
  }

  runScan(dryRun: boolean): void {
    this.scanning = true;
    this.scanResult = null;
    this.http.post<ScanResult>(`${this.baseUrl}/writeoff/scan?dryRun=${dryRun}`, {}).subscribe({
      next: (result) => {
        this.scanResult = result;
        this.scanning = false;
        this.cdr.markForCheck();
        if (!dryRun) {
          this.snackBar.open(`Scan complete: ${result.autoPosted} auto-posted, ${result.requestsCreated} sent for approval`, 'OK', { duration: 5000 });
        }
      },
      error: () => {
        this.scanning = false;
        this.snackBar.open('Scan failed', 'Dismiss', { duration: 3000 });
        this.cdr.markForCheck();
      },
    });
  }
}
