import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ReconAlertRow, ReconAlertConfigItem, ReconIqService } from '../../../core/services/recon-iq.service';

const ALERT_TYPES = ['unmatched_eob', 'unmatched_payment', 'unposted_remittance', 'in_transit_aged'];

@Component({
    selector: 'app-recon-alerts',
    templateUrl: './recon-alerts.component.html',
    styleUrls: ['./recon-alerts.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconAlertsComponent implements OnInit {
  alertTypes = ALERT_TYPES;
  alerts: ReconAlertRow[] = [];
  alertsLoading = true;
  configs: ReconAlertConfigItem[] = [];
  configsLoading = true;

  activeTab: 'alerts' | 'config' = 'alerts';

  editingConfig: ReconAlertConfigItem | null = null;
  newConfigType = '';
  newConfigDays = 30;
  newConfigSeverity = 'warning';
  newConfigEnabled = true;
  newConfigEmails = '';
  savingConfig = false;

  constructor(
    private readonly svc: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAlerts();
    this.loadConfigs();
  }

  loadAlerts(): void {
    this.alertsLoading = true;
    this.svc.getReconAlerts({ status: 'open' }).subscribe({
      next: (r) => { this.alerts = r.rows; this.alertsLoading = false; this.cdr.markForCheck(); },
      error: () => { this.alertsLoading = false; this.cdr.markForCheck(); },
    });
  }

  loadConfigs(): void {
    this.configsLoading = true;
    this.svc.getAlertConfigs().subscribe({
      next: (r) => { this.configs = r.configs; this.configsLoading = false; this.cdr.markForCheck(); },
      error: () => { this.configsLoading = false; this.cdr.markForCheck(); },
    });
  }

  acknowledge(alert: ReconAlertRow): void {
    this.svc.acknowledgeAlert(alert.id).subscribe({
      next: () => { this.alerts = this.alerts.filter(a => a.id !== alert.id); this.cdr.markForCheck(); },
      error: (e) => console.error('[ReconAlerts] acknowledge error', e),
    });
  }

  startEdit(config: ReconAlertConfigItem): void {
    this.editingConfig = config;
    this.newConfigType = config.alertType;
    this.newConfigDays = config.thresholdDays;
    this.newConfigSeverity = config.severity;
    this.newConfigEnabled = config.isEnabled;
    this.newConfigEmails = config.notifyEmails ?? '';
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingConfig = null;
    this.newConfigType = '';
    this.newConfigDays = 30;
    this.newConfigSeverity = 'warning';
    this.newConfigEnabled = true;
    this.newConfigEmails = '';
    this.cdr.markForCheck();
  }

  saveConfig(): void {
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
      next: () => { this.savingConfig = false; this.editingConfig = null; this.loadConfigs(); },
      error: () => { this.savingConfig = false; this.cdr.markForCheck(); },
    });
  }

  deleteConfig(config: ReconAlertConfigItem): void {
    if (!confirm(`Delete alert config for "${config.alertType}"?`)) return;
    this.svc.deleteAlertConfig(config.id).subscribe({
      next: () => { this.configs = this.configs.filter(c => c.id !== config.id); this.cdr.markForCheck(); },
      error: (e) => console.error('[ReconAlerts] delete error', e),
    });
  }

  toggleEnabled(config: ReconAlertConfigItem): void {
    this.svc.upsertAlertConfig({
      alertType:     config.alertType,
      thresholdDays: config.thresholdDays,
      severity:      config.severity,
      isEnabled:     !config.isEnabled,
      notifyEmails:  config.notifyEmails ?? undefined,
    }).subscribe({
      next: () => { config.isEnabled = !config.isEnabled; this.cdr.markForCheck(); },
      error: (e) => console.error('[ReconAlerts] toggle error', e),
    });
  }

  severityClass(sev: string): string {
    return `badge badge--${sev}`;
  }

  get formTitle(): string {
    return this.editingConfig ? `Editing: ${this.editingConfig.alertType}` : 'Add Alert Config';
  }
}
