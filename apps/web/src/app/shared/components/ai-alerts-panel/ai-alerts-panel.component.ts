import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { AiAlertsService, AiAlert } from '../../../core/services/ai-alerts.service';

const ALERT_TYPES = [
  'Denial Spike',
  'Collection Drop',
  'Timely Filing',
  'Backlog Growth',
  'Write-off Anomaly',
];

@Component({
    selector: 'app-ai-alerts-panel',
    templateUrl: './ai-alerts-panel.component.html',
    styleUrls: ['./ai-alerts-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class AiAlertsPanelComponent implements OnInit {
  alerts: AiAlert[] = [];
  loading = false;

  showCreateForm = false;
  creating = false;
  createError: string | null = null;
  readonly alertTypes = ALERT_TYPES;

  newRule = { alertType: '', threshold: 10, notifyEmail: '' };

  get activeCount(): number {
    return this.alerts.filter(a => !a.dismissed).length;
  }

  constructor(
    public svc: AiAlertsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.svc.load().subscribe({
      next: res => {
        this.alerts = res.data || [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  dismiss(id: number): void {
    this.svc.dismiss(id).subscribe(() => {
      this.alerts = this.alerts.filter(a => a.id !== id);
      this.cdr.markForCheck();
    });
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (this.showCreateForm) {
      this.newRule = { alertType: '', threshold: 10, notifyEmail: '' };
      this.createError = null;
    }
    this.cdr.markForCheck();
  }

  saveAlertRule(): void {
    if (!this.newRule.alertType || this.newRule.threshold <= 0) return;
    this.creating = true;
    this.createError = null;
    this.cdr.markForCheck();

    this.svc.createAlertRule({
      alertType: this.newRule.alertType,
      threshold: this.newRule.threshold,
      notifyEmail: this.newRule.notifyEmail || undefined,
    }).subscribe({
      next: () => {
        this.creating = false;
        this.showCreateForm = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.creating = false;
        this.createError = 'Failed to save rule. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  severityColor(s: string): string {
    switch (s) {
      case 'critical': return '#e53935';
      case 'warning': return '#ff9800';
      default: return '#2196f3';
    }
  }

  severityIcon(s: string): string {
    switch (s) {
      case 'critical': return 'error';
      case 'warning': return 'warning';
      default: return 'info';
    }
  }

  parseActions(json: string | undefined): string[] {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  }
}
