import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  BankAccountAuditEntry,
  BankAccountConnection,
  BankAccountConnectionPayload,
  BankConnectionStatus,
  ReconIqService,
} from '../../../core/services/recon-iq.service';

// -- Static option tables ------------------------------------------------------

const ACCOUNT_TYPES = [
  { value: 'checking',          label: 'Checking' },
  { value: 'savings',           label: 'Savings' },
  { value: 'business_checking', label: 'Business Checking' },
  { value: 'money_market',      label: 'Money Market' },
];

const IMPORT_METHODS = [
  { value: 'manual', label: 'Manual Upload',  desc: 'Staff manually uploads CSV or statement files' },
  { value: 'sftp',   label: 'SFTP Delivery',  desc: 'Bank pushes BAI2/MT940 files to an SFTP server on a schedule' },
  { value: 'plaid',  label: 'Plaid',          desc: 'Read-only balance and transaction data via Plaid Link' },
  { value: 'api',    label: 'Bank API',        desc: 'Direct integration with bank REST API (requires bank approval)' },
];

const FILE_FORMATS = [
  { value: 'bai2',    label: 'BAI2',     desc: 'Bank Administration Institute \u2014 common in US healthcare' },
  { value: 'mt940',   label: 'MT940',    desc: 'SWIFT standard \u2014 common for international and larger banks' },
  { value: 'ofx',     label: 'OFX/QFX', desc: 'Open Financial Exchange \u2014 used by Quicken/QuickBooks' },
  { value: 'camt053', label: 'CAMT.053', desc: 'ISO 20022 \u2014 increasingly required by large institutions' },
  { value: 'csv',     label: 'CSV',      desc: 'Comma-separated \u2014 some regional banks only' },
];

const SEC_CODE_OPTIONS = [
  { value: 'PPD', label: 'PPD \u2014 Prearranged Payment & Deposit',   desc: 'Patient refunds, pre-authorized consumer debits' },
  { value: 'CCD', label: 'CCD \u2014 Cash Concentration/Disbursement', desc: 'Vendor payments, intercompany transfers' },
  { value: 'CTX', label: 'CTX \u2014 Corporate Trade Exchange',        desc: 'Payments with embedded invoice detail (addenda)' },
];

const SCHEDULE_TYPES = [
  { value: 'manual', label: 'Manual Only',  desc: 'Triggered on-demand \u2014 no automated runs' },
  { value: 'daily',  label: 'Daily',        desc: 'Once per day at a specified time' },
  { value: 'weekly', label: 'Weekly',       desc: 'On selected days of the week' },
  { value: 'custom', label: 'Custom Cron',  desc: 'Advanced \u2014 define any schedule using cron syntax' },
];

const DAYS_OF_WEEK = [
  { value: 'Mon', label: 'Mon' },
  { value: 'Tue', label: 'Tue' },
  { value: 'Wed', label: 'Wed' },
  { value: 'Thu', label: 'Thu' },
  { value: 'Fri', label: 'Fri' },
  { value: 'Sat', label: 'Sat' },
  { value: 'Sun', label: 'Sun' },
];

const AUDIT_EVENT_LABELS: Record<string, { label: string; color: string }> = {
  account_created:           { label: 'Created',             color: 'green'  },
  account_updated:           { label: 'Updated',             color: 'blue'   },
  account_deactivated:       { label: 'Deactivated',         color: 'orange' },
  account_deleted:           { label: 'Deleted',             color: 'red'    },
  connection_tested:         { label: 'Test',                color: 'blue'   },
  connection_verified:       { label: 'Verified',            color: 'green'  },
  sync_success:              { label: 'Sync OK',             color: 'green'  },
  sync_failed:               { label: 'Sync Failed',         color: 'red'    },
  credentials_rotated:       { label: 'Credentials',         color: 'orange' },
  permission_granted:        { label: 'Permission +',        color: 'green'  },
  permission_revoked:        { label: 'Permission \u2212',        color: 'red'    },
  status_changed:            { label: 'Status Change',       color: 'orange' },
  compliance_reviewed:       { label: 'Compliance Review',   color: 'purple' },
  ach_origination_enabled:   { label: 'ACH Enabled',         color: 'green'  },
  ach_origination_disabled:  { label: 'ACH Disabled',        color: 'orange' },
  import_method_changed:     { label: 'Import Changed',      color: 'blue'   },
};

export interface BankFormModel {
  // Account identity
  bank_name: string;
  nickname: string;
  account_type: string;
  account_holder_name: string;
  account_number_last4: string;
  routing_number: string;
  swift_bic: string;
  // Institution
  bank_address: string;
  bank_phone: string;
  bank_contact_name: string;
  // Statement import
  stmt_import_method: string;
  sftp_host: string;
  sftp_port: number | null;
  sftp_username: string;
  sftp_auth_method: string;
  sftp_key_fingerprint: string;
  sftp_remote_path: string;
  sftp_file_format: string;
  sftp_file_pattern: string;
  plaid_item_id: string;
  plaid_institution_id: string;
  recon_trace_match: boolean;
  recon_lag_days: number | null;
  // Schedule & retry
  schedule_type: string;
  schedule_time: string;
  schedule_days_set: Set<string>;
  schedule_days: string;
  schedule_cron: string;
  retry_max_attempts: number;
  retry_delay_minutes: number;
  // ACH origination
  ach_enabled: boolean;
  ach_company_name: string;
  ach_company_id: string;
  ach_odfi_routing: string;
  ach_sec_codes_set: Set<string>;
  ach_sec_codes: string;
  ach_transaction_limit: number | null;
  ach_daily_limit: number | null;
  ach_dual_approval_threshold: number | null;
  ach_settlement_days: number;
  ach_nacha_registered: boolean;
  notes: string;
  is_active: boolean;
}

@Component({
    selector: 'app-bank-account-connections',
    templateUrl: './bank-account-connections.component.html',
    styleUrls: ['./bank-account-connections.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class BankAccountConnectionsComponent implements OnInit {
  accountTypes   = ACCOUNT_TYPES;
  importMethods  = IMPORT_METHODS;
  fileFormats    = FILE_FORMATS;
  secCodes       = SEC_CODE_OPTIONS;
  scheduleTypes  = SCHEDULE_TYPES;
  daysOfWeek     = DAYS_OF_WEEK;

  // -- Accounts list ----------------------------------------------------------
  accounts: BankAccountConnection[] = [];
  loading  = true;
  error    = false;

  expandedId: number | null = null;
  expandedTab = new Map<number, 'account' | 'import' | 'ach'>();
  testResults  = new Map<number, { passed: boolean; latency_ms: number } | null>();
  testingId: number | null = null;

  // -- Form -------------------------------------------------------------------
  showForm    = false;
  editingId: number | null = null;
  submitting  = false;
  deleteConfirmId: number | null = null;
  activeSection   = 0;
  readonly SECTIONS = ['Account', 'Statement Import', 'ACH Origination'];

  form: BankFormModel = this.blankForm();

  // -- Audit log -------------------------------------------------------------
  auditView    = false;
  auditEntries: BankAccountAuditEntry[] = [];
  auditTotal   = 0;
  auditLoading = false;
  auditFilter: number | null = null;
  auditOffset  = 0;
  auditLimit   = 50;

  constructor(
    private readonly svc: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

  private blankForm(): BankFormModel {
    return {
      bank_name: '', nickname: '', account_type: 'checking',
      account_holder_name: '', account_number_last4: '', routing_number: '', swift_bic: '',
      bank_address: '', bank_phone: '', bank_contact_name: '',
      stmt_import_method: 'manual',
      sftp_host: '', sftp_port: 22, sftp_username: '',
      sftp_auth_method: 'rsa_key', sftp_key_fingerprint: '',
      sftp_remote_path: '', sftp_file_format: 'bai2',
      sftp_file_pattern: '',
      plaid_item_id: '', plaid_institution_id: '',
      recon_trace_match: true, recon_lag_days: 4,
      schedule_type: 'daily', schedule_time: '03:00',
      schedule_days_set: new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
      schedule_days: 'Mon|Tue|Wed|Thu|Fri', schedule_cron: '',
      retry_max_attempts: 3, retry_delay_minutes: 15,
      ach_enabled: false, ach_company_name: '', ach_company_id: '',
      ach_odfi_routing: '', ach_sec_codes_set: new Set(), ach_sec_codes: '',
      ach_transaction_limit: 25000, ach_daily_limit: 100000,
      ach_dual_approval_threshold: 10000, ach_settlement_days: 1,
      ach_nacha_registered: false,
      notes: '', is_active: true,
    };
  }

  load(): void {
    this.loading = true; this.error = false; this.cdr.markForCheck();
    this.svc.getBankAccountConnections().subscribe({
      next:  (r) => { this.accounts = r.accounts; this.loading = false; this.cdr.markForCheck(); },
      error: ()  => { this.error = true; this.loading = false; this.cdr.markForCheck(); },
    });
  }

  openAdd(): void {
    this.editingId = null; this.form = this.blankForm();
    this.showForm = true; this.activeSection = 0; this.cdr.markForCheck();
  }

  openEdit(acct: BankAccountConnection): void {
    this.editingId = acct.id;
    const secSet = new Set((acct.ach_sec_codes ?? '').split('|').filter(Boolean));
    this.form = {
      bank_name:                  acct.bank_name,
      nickname:                   acct.nickname ?? '',
      account_type:               acct.account_type,
      account_holder_name:        acct.account_holder_name ?? '',
      account_number_last4:       acct.account_number_last4 ?? '',
      routing_number:             acct.routing_number ?? '',
      swift_bic:                  acct.swift_bic ?? '',
      bank_address:               acct.bank_address ?? '',
      bank_phone:                 acct.bank_phone ?? '',
      bank_contact_name:          acct.bank_contact_name ?? '',
      stmt_import_method:         acct.stmt_import_method ?? 'manual',
      sftp_host:                  acct.sftp_host ?? '',
      sftp_port:                  acct.sftp_port ?? 22,
      sftp_username:              acct.sftp_username ?? '',
      sftp_auth_method:           acct.sftp_auth_method ?? 'rsa_key',
      sftp_key_fingerprint:       acct.sftp_key_fingerprint ?? '',
      sftp_remote_path:           acct.sftp_remote_path ?? '',
      sftp_file_format:           acct.sftp_file_format ?? 'bai2',
      sftp_file_pattern:          acct.sftp_file_pattern ?? '',
      plaid_item_id:              acct.plaid_item_id ?? '',
      plaid_institution_id:       acct.plaid_institution_id ?? '',
      recon_trace_match:          acct.recon_trace_match,
      recon_lag_days:             acct.recon_lag_days ?? 4,
      schedule_type:              acct.schedule_type ?? 'daily',
      schedule_time:              acct.schedule_time ?? '03:00',
      schedule_days_set:          new Set((acct.schedule_days ?? 'Mon|Tue|Wed|Thu|Fri').split('|').filter(Boolean)),
      schedule_days:              acct.schedule_days ?? 'Mon|Tue|Wed|Thu|Fri',
      schedule_cron:              acct.schedule_cron ?? '',
      retry_max_attempts:         acct.retry_max_attempts ?? 3,
      retry_delay_minutes:        acct.retry_delay_minutes ?? 15,
      ach_enabled:                acct.ach_enabled,
      ach_company_name:           acct.ach_company_name ?? '',
      ach_company_id:             acct.ach_company_id ?? '',
      ach_odfi_routing:           acct.ach_odfi_routing ?? '',
      ach_sec_codes_set:          secSet,
      ach_sec_codes:              acct.ach_sec_codes ?? '',
      ach_transaction_limit:      acct.ach_transaction_limit ?? 25000,
      ach_daily_limit:            acct.ach_daily_limit ?? 100000,
      ach_dual_approval_threshold: acct.ach_dual_approval_threshold ?? 10000,
      ach_settlement_days:        acct.ach_settlement_days ?? 1,
      ach_nacha_registered:       acct.ach_nacha_registered,
      notes:                      acct.notes ?? '',
      is_active:                  acct.is_active,
    };
    this.showForm = true; this.activeSection = 0; this.expandedId = null;
    this.cdr.markForCheck();
  }

  cancel(): void { this.showForm = false; this.editingId = null; this.cdr.markForCheck(); }

  toggleSecCode(code: string): void {
    this.form.ach_sec_codes_set.has(code)
      ? this.form.ach_sec_codes_set.delete(code)
      : this.form.ach_sec_codes_set.add(code);
    this.form.ach_sec_codes = Array.from(this.form.ach_sec_codes_set).join('|');
    this.cdr.markForCheck();
  }

  toggleScheduleDay(day: string): void {
    this.form.schedule_days_set.has(day)
      ? this.form.schedule_days_set.delete(day)
      : this.form.schedule_days_set.add(day);
    this.form.schedule_days = Array.from(this.form.schedule_days_set).join('|');
    this.cdr.markForCheck();
  }

  scheduleLabel(acct: { schedule_type: string | null; schedule_time: string | null; schedule_days: string | null; schedule_cron: string | null }): string {
    switch (acct.schedule_type) {
      case 'daily':  return `Daily at ${acct.schedule_time ?? '\u2014'}`;
      case 'weekly': return `Weekly (${(acct.schedule_days ?? '').replace(/\|/g, ', ')}) at ${acct.schedule_time ?? '\u2014'}`;
      case 'custom': return acct.schedule_cron ?? 'Custom';
      default:       return 'Manual only';
    }
  }

  save(): void {
    if (!this.form.bank_name?.trim()) return;
    this.submitting = true; this.cdr.markForCheck();

    const payload: BankAccountConnectionPayload = {
      bank_name:                   this.form.bank_name.trim(),
      account_number_last4:        this.form.account_number_last4?.trim() || undefined,
      routing_number:              this.form.routing_number?.trim() || undefined,
      account_type:                this.form.account_type,
      nickname:                    this.form.nickname?.trim() || undefined,
      account_holder_name:         this.form.account_holder_name?.trim() || undefined,
      bank_address:                this.form.bank_address?.trim() || undefined,
      bank_phone:                  this.form.bank_phone?.trim() || undefined,
      bank_contact_name:           this.form.bank_contact_name?.trim() || undefined,
      swift_bic:                   this.form.swift_bic?.trim() || undefined,
      stmt_import_method:          this.form.stmt_import_method as any,
      sftp_host:                   this.form.sftp_host?.trim() || undefined,
      sftp_port:                   this.form.sftp_port ?? undefined,
      sftp_username:               this.form.sftp_username?.trim() || undefined,
      sftp_auth_method:            this.form.sftp_auth_method || undefined,
      sftp_key_fingerprint:        this.form.sftp_key_fingerprint?.trim() || undefined,
      sftp_remote_path:            this.form.sftp_remote_path?.trim() || undefined,
      sftp_file_format:            this.form.sftp_file_format || undefined,
      sftp_file_pattern:           this.form.sftp_file_pattern?.trim() || undefined,
      plaid_item_id:               this.form.plaid_item_id?.trim() || undefined,
      plaid_institution_id:        this.form.plaid_institution_id?.trim() || undefined,
      recon_trace_match:           this.form.recon_trace_match,
      recon_lag_days:              this.form.recon_lag_days ?? undefined,
      schedule_type:               this.form.schedule_type || undefined,
      schedule_time:               this.form.schedule_time?.trim() || undefined,
      schedule_days:               this.form.schedule_days || undefined,
      schedule_cron:               this.form.schedule_cron?.trim() || undefined,
      retry_max_attempts:          this.form.retry_max_attempts,
      retry_delay_minutes:         this.form.retry_delay_minutes,
      ach_enabled:                 this.form.ach_enabled,
      ach_company_name:            this.form.ach_company_name?.trim() || undefined,
      ach_company_id:              this.form.ach_company_id?.trim() || undefined,
      ach_odfi_routing:            this.form.ach_odfi_routing?.trim() || undefined,
      ach_sec_codes:               this.form.ach_sec_codes || undefined,
      ach_transaction_limit:       this.form.ach_transaction_limit ?? undefined,
      ach_daily_limit:             this.form.ach_daily_limit ?? undefined,
      ach_dual_approval_threshold: this.form.ach_dual_approval_threshold ?? undefined,
      ach_settlement_days:         this.form.ach_settlement_days,
      ach_nacha_registered:        this.form.ach_nacha_registered,
      notes:                       this.form.notes?.trim() || undefined,
      is_active:                   this.form.is_active,
    };

    const call = this.editingId != null
      ? this.svc.updateBankAccountConnection(this.editingId, payload)
      : this.svc.createBankAccountConnection(payload);

    call.subscribe({
      next:  () => { this.submitting = false; this.showForm = false; this.editingId = null; this.load(); },
      error: () => { this.submitting = false; this.cdr.markForCheck(); },
    });
  }

  // -- Row expand / tab ------------------------------------------------------
  toggleExpand(acct: BankAccountConnection): void {
    if (this.expandedId === acct.id) { this.expandedId = null; }
    else {
      this.expandedId = acct.id;
      if (!this.expandedTab.has(acct.id)) this.expandedTab.set(acct.id, 'account');
    }
    this.cdr.markForCheck();
  }

  setExpandTab(id: number, tab: 'account' | 'import' | 'ach', event: Event): void {
    event.stopPropagation();
    this.expandedTab.set(id, tab);
    this.cdr.markForCheck();
  }

  getExpandTab(id: number): 'account' | 'import' | 'ach' {
    return this.expandedTab.get(id) ?? 'account';
  }

  testConnection(acct: BankAccountConnection, event: Event): void {
    event.stopPropagation();
    this.testingId = acct.id; this.testResults.delete(acct.id); this.cdr.markForCheck();
    this.svc.testBankAccountConnection(acct.id).subscribe({
      next:  (r) => { this.testingId = null; this.testResults.set(acct.id, { passed: r.passed, latency_ms: r.latency_ms }); this.cdr.markForCheck(); },
      error: ()  => { this.testingId = null; this.cdr.markForCheck(); },
    });
  }

  confirmDelete(id: number): void { this.deleteConfirmId = id; this.cdr.markForCheck(); }
  cancelDelete():  void { this.deleteConfirmId = null; this.cdr.markForCheck(); }

  doDelete(id: number): void {
    this.svc.deleteBankAccountConnection(id).subscribe({
      next:  () => { this.deleteConfirmId = null; this.load(); },
      error: () => { this.deleteConfirmId = null; this.cdr.markForCheck(); },
    });
  }

  toggleActive(acct: BankAccountConnection, event: Event): void {
    event.stopPropagation();
    this.svc.updateBankAccountConnection(acct.id, { is_active: !acct.is_active }).subscribe({ next: () => this.load() });
  }

  // -- Audit log -------------------------------------------------------------
  openAuditLog(preFilter?: number): void {
    this.auditView = true; this.auditOffset = 0;
    this.auditFilter = preFilter ?? null;
    this.loadAudit(); this.cdr.markForCheck();
  }

  closeAuditLog(): void { this.auditView = false; this.cdr.markForCheck(); }
  filterAudit(id: number | null): void { this.auditFilter = id; this.auditOffset = 0; this.loadAudit(); }
  auditPage(dir: 1 | -1): void { this.auditOffset = Math.max(0, this.auditOffset + dir * this.auditLimit); this.loadAudit(); }

  private loadAudit(): void {
    this.auditLoading = true; this.cdr.markForCheck();
    this.svc.getBankAccountAuditLog({ accountId: this.auditFilter ?? undefined, limit: this.auditLimit, offset: this.auditOffset }).subscribe({
      next:  (r) => { this.auditEntries = r.entries; this.auditTotal = r.total; this.auditLoading = false; this.cdr.markForCheck(); },
      error: ()  => { this.auditLoading = false; this.cdr.markForCheck(); },
    });
  }

  // -- Helpers ---------------------------------------------------------------
  accountTypeLabel(v: string): string   { return ACCOUNT_TYPES.find(t => t.value === v)?.label ?? v; }
  importMethodLabel(v: string): string  { return IMPORT_METHODS.find(t => t.value === v)?.label ?? v; }
  fileFormatLabel(v: string): string    { return FILE_FORMATS.find(t => t.value === v)?.label ?? v; }

  connStatusMeta(s: BankConnectionStatus): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      active:               { label: 'Active',               cls: 'status--active'    },
      pending_verification: { label: 'Pending Verification', cls: 'status--pending'   },
      suspended:            { label: 'Suspended',            cls: 'status--suspended' },
      disconnected:         { label: 'Disconnected',         cls: 'status--disc'      },
      error:                { label: 'Error',                cls: 'status--error'     },
    };
    return map[s] ?? { label: s, cls: '' };
  }

  secCodeList(raw: string | null): string[] {
    return (raw ?? '').split('|').filter(Boolean);
  }

  auditEventMeta(type: string): { label: string; color: string } {
    return AUDIT_EVENT_LABELS[type] ?? { label: type, color: 'gray' };
  }

  auditAccountLabel(id: number): string {
    const a = this.accounts.find(x => x.id === id);
    return a ? (a.nickname ? `${a.bank_name} \u2014 ${a.nickname}` : a.bank_name) : String(id);
  }

  parseDetail(raw: string | null): any {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  auditPageInfo(): string {
    const start = this.auditOffset + 1;
    const end   = Math.min(this.auditOffset + this.auditLimit, this.auditTotal);
    return `${start}\u2013${end} of ${this.auditTotal}`;
  }
}
