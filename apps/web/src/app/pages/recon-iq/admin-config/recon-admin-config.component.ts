import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  ReconIqAdminConfig, ReconIqService,
  ReconAlertRow, ReconAlertConfigItem,
  BankEscalationRow, BankEscalationStats,
} from '../../../core/services/recon-iq.service';

const ALERT_TYPES = ['unmatched_eob', 'unmatched_deposit', 'unposted_reconciled', 'era_parse_failure'];
const ISSUE_TYPES = ['amount_mismatch', 'missing_deposit', 'duplicate', 'unauthorized', 'other'];
const PRIORITIES  = ['low', 'medium', 'high', 'critical'];

@Component({
    selector: 'app-recon-admin-config',
    templateUrl: './recon-admin-config.component.html',
    styleUrls: ['./recon-admin-config.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconAdminConfigComponent implements OnInit {

  activeSection: 'settings' | 'alerts' | 'escalations' = 'settings';

  // --- Core Settings ---------------------------------------------------------
  loading = true;
  saving = false;
  saved = false;
  config: ReconIqAdminConfig = {
    autoMatchEnabled:        false,
    autoMatchThreshold:      85,
    autoPostEnabled:         false,
    statementMinBalance:     5,
    statementDefaultAgingDays: 90,
    eraAutoImportEnabled:    false,
    eraMatchTolerance:       1.00,
    unmatchedEscalationDays: 30,
    autoEscalateEnabled:     false,
    defaultNotifyEmail:      '',
    statementFrequency:      'monthly',
    storageType:             'local',
    storageConnectionString: '',
    storagePath:             '',
    storageRetentionDays:    365,
  };

  // --- Alerts ----------------------------------------------------------------
  alertTypes = ALERT_TYPES;
  alerts: ReconAlertRow[] = [];
  alertsLoading = true;
  configs: ReconAlertConfigItem[] = [];
  configsLoading = true;
  alertSubTab: 'active' | 'config' = 'active';
  editingConfig: ReconAlertConfigItem | null = null;
  newConfigType = '';
  newConfigDays = 30;
  newConfigSeverity = 'warning';
  newConfigEnabled = true;
  newConfigEmails = '';
  savingConfig = false;

  // --- Bank Escalations ------------------------------------------------------
  issueTypes = ISSUE_TYPES;
  priorities = PRIORITIES;
  rows: BankEscalationRow[] = [];
  escalStats: BankEscalationStats = { total: 0, open: 0, investigating: 0, resolved: 0 };
  escLoading = true;
  escTotal = 0;
  escPage = 1;
  escPageSize = 25;
  escTotalPages = 1;
  filterStatus   = '';
  filterPriority = '';
  showNewForm  = false;
  newIssueType   = '';
  newDescription = '';
  newPriority    = 'medium';
  newDepositId   = '';
  submitting = false;

  constructor(
    private readonly svc: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.loadAlerts();
    this.loadAlertConfigs();
    this.loadEscStats();
    this.loadEscRows();
  }

  // --- Nav -------------------------------------------------------------------
  setSection(s: 'settings' | 'alerts' | 'escalations'): void {
    this.activeSection = s;
    this.cdr.markForCheck();
  }

  setAlertSubTab(t: 'active' | 'config'): void {
    this.alertSubTab = t;
    this.cdr.markForCheck();
  }

  onConfigChange(): void { this.cdr.markForCheck(); }

  // --- Core Settings ---------------------------------------------------------
  loadSettings(): void {
    this.loading = true;
    this.svc.getReconIqAdminConfig().subscribe({
      next: (cfg) => { this.config = cfg; this.loading = false; this.cdr.markForCheck(); },
      error: ()    => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  save(): void {
    this.saving = true;
    this.saved  = false;
    this.cdr.markForCheck();
    this.svc.updateReconIqAdminConfig(this.config).subscribe({
      next: () => { this.saving = false; this.saved = true; this.cdr.markForCheck(); },
      error: () => { this.saving = false; this.cdr.markForCheck(); },
    });
  }

  // --- Alerts ----------------------------------------------------------------
  loadAlerts(): void {
    this.alertsLoading = true;
    this.svc.getReconAlerts({ status: 'open' }).subscribe({
      next: (r) => { this.alerts = r.rows; this.alertsLoading = false; this.cdr.markForCheck(); },
      error: ()  => { this.alertsLoading = false; this.cdr.markForCheck(); },
    });
  }

  loadAlertConfigs(): void {
    this.configsLoading = true;
    this.svc.getAlertConfigs().subscribe({
      next: (r) => { this.configs = r.configs; this.configsLoading = false; this.cdr.markForCheck(); },
      error: ()  => { this.configsLoading = false; this.cdr.markForCheck(); },
    });
  }

  acknowledge(alert: ReconAlertRow): void {
    this.svc.acknowledgeAlert(alert.id).subscribe({
      next: () => { this.alerts = this.alerts.filter(a => a.id !== alert.id); this.cdr.markForCheck(); },
      error: (e) => console.error('[Admin] acknowledge error', e),
    });
  }

  startEdit(cfg: ReconAlertConfigItem): void {
    this.editingConfig   = cfg;
    this.newConfigType   = cfg.alertType;
    this.newConfigDays   = cfg.thresholdDays;
    this.newConfigSeverity = cfg.severity;
    this.newConfigEnabled  = cfg.isEnabled;
    this.newConfigEmails   = cfg.notifyEmails ?? '';
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingConfig = null;
    this.newConfigType = '';
    this.newConfigDays = 30;
    this.newConfigSeverity = 'warning';
    this.newConfigEnabled  = true;
    this.newConfigEmails   = '';
    this.cdr.markForCheck();
  }

  saveAlertConfig(): void {
    if (!this.newConfigType) return;
    this.savingConfig = true;
    this.cdr.markForCheck();
    this.svc.upsertAlertConfig({
      alertType:     this.newConfigType,
      thresholdDays: this.newConfigDays,
      severity:      this.newConfigSeverity,
      isEnabled:     this.newConfigEnabled,
      notifyEmails:  this.newConfigEmails || undefined,
    }).subscribe({
      next: () => { this.savingConfig = false; this.editingConfig = null; this.loadAlertConfigs(); },
      error: () => { this.savingConfig = false; this.cdr.markForCheck(); },
    });
  }

  deleteAlertConfig(cfg: ReconAlertConfigItem): void {
    if (!confirm(`Delete alert config for "${cfg.alertType}"?`)) return;
    this.svc.deleteAlertConfig(cfg.id).subscribe({
      next: () => { this.configs = this.configs.filter(c => c.id !== cfg.id); this.cdr.markForCheck(); },
      error: (e) => console.error('[Admin] delete alert error', e),
    });
  }

  toggleAlertEnabled(cfg: ReconAlertConfigItem): void {
    this.svc.upsertAlertConfig({
      alertType:     cfg.alertType,
      thresholdDays: cfg.thresholdDays,
      severity:      cfg.severity,
      isEnabled:     !cfg.isEnabled,
      notifyEmails:  cfg.notifyEmails ?? undefined,
    }).subscribe({
      next: () => { cfg.isEnabled = !cfg.isEnabled; this.cdr.markForCheck(); },
      error: (e) => console.error('[Admin] toggle alert error', e),
    });
  }

  severityClass(sev: string): string { return `badge badge--${sev}`; }
  get alertFormTitle(): string { return this.editingConfig ? `Edit: ${this.editingConfig.alertType}` : 'Add Threshold'; }

  // --- Bank Escalations ------------------------------------------------------
  loadEscStats(): void {
    this.svc.getBankEscalationStats().subscribe({
      next: (s) => { this.escalStats = s; this.cdr.markForCheck(); },
      error: (e) => console.error('[Admin] esc stats error', e),
    });
  }

  loadEscRows(page = 1): void {
    this.escLoading = true;
    this.escPage = page;
    this.cdr.markForCheck();
    this.svc.getBankEscalations({
      status:   this.filterStatus   || undefined,
      priority: this.filterPriority || undefined,
      page,
      pageSize: this.escPageSize,
    }).subscribe({
      next: (res) => {
        this.rows         = res.rows;
        this.escTotal     = res.total;
        this.escTotalPages = res.totalPages;
        this.escLoading   = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        console.error('[Admin] esc list error', e);
        this.escLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  applyEscFilters(): void { this.loadEscRows(1); }

  clearEscFilters(): void {
    this.filterStatus   = '';
    this.filterPriority = '';
    this.loadEscRows(1);
  }

  openNewEscForm(): void {
    this.showNewForm    = true;
    this.newIssueType   = '';
    this.newDescription = '';
    this.newPriority    = 'medium';
    this.newDepositId   = '';
    this.cdr.markForCheck();
  }

  cancelNewEsc(): void { this.showNewForm = false; this.cdr.markForCheck(); }

  submitNewEsc(): void {
    if (!this.newIssueType) return;
    this.submitting = true;
    this.cdr.markForCheck();
    this.svc.createBankEscalation({
      issueType:     this.newIssueType,
      description:   this.newDescription || undefined,
      priority:      this.newPriority,
      bankDepositId: this.newDepositId || undefined,
    }).subscribe({
      next: () => {
        this.submitting  = false;
        this.showNewForm = false;
        this.loadEscStats();
        this.loadEscRows(1);
      },
      error: (e) => {
        console.error('[Admin] create esc error', e);
        this.submitting = false;
        this.cdr.markForCheck();
      },
    });
  }

  setEscStatus(row: BankEscalationRow, status: string): void {
    this.svc.updateBankEscalation(row.id, { status }).subscribe({
      next: () => { this.loadEscStats(); this.loadEscRows(this.escPage); },
      error: (e) => console.error('[Admin] esc update error', e),
    });
  }

  resolveEsc(row: BankEscalationRow): void {
    const notes = prompt('Resolution notes (optional):');
    if (notes === null) return;
    this.svc.updateBankEscalation(row.id, { status: 'resolved', resolutionNotes: notes || undefined }).subscribe({
      next: () => { this.loadEscStats(); this.loadEscRows(this.escPage); },
      error: (e) => console.error('[Admin] resolve error', e),
    });
  }

  priorityClass(p: string): string {
    const m: Record<string, string> = { critical: 'badge--critical', high: 'badge--high', medium: 'badge--medium', low: 'badge--low' };
    return `badge ${m[p] ?? ''}`;
  }

  statusClass(s: string): string {
    const m: Record<string, string> = { open: 'badge--open', investigating: 'badge--investigating', resolved: 'badge--resolved', dismissed: 'badge--dismissed' };
    return `badge ${m[s] ?? ''}`;
  }
}
