import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ScheduledReportsService, ScheduledReport } from '../../../core/services/scheduled-reports.service';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';
import { firstValueFrom, map } from 'rxjs';

const REPORT_TYPES = [
  { value: 'denial-summary', label: 'Denial Summary' },
  { value: 'staff-performance', label: 'Staff Performance' },
  { value: 'ar-aging', label: 'AR Aging' },
  { value: 'training-compliance', label: 'Training Compliance' },
  { value: 'executive-summary', label: 'Executive Summary' },
];

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

@Component({
    selector: 'app-scheduled-reports',
    templateUrl: './scheduled-reports.component.html',
    styleUrls: ['./scheduled-reports.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ScheduledReportsComponent implements OnInit {
  reports: ScheduledReport[] = [];
  loading = true;
  saving = false;

  editingReport: ScheduledReport | null = null;
  isNew = false;

  reportTypes = REPORT_TYPES;
  frequencies = FREQUENCIES;

  constructor(
    private svc: ScheduledReportsService,
    private dialog: RpDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.loading = true;
    this.svc.list().subscribe({
      next: (reports) => { this.reports = reports; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  addReport(): void {
    this.editingReport = {
      name: '',
      reportType: 'denial-summary',
      frequency: 'weekly',
      recipients: '',
      isActive: true,
    };
    this.isNew = true;
  }

  editReport(r: ScheduledReport): void {
    this.editingReport = { ...r };
    this.isNew = false;
  }

  cancelEdit(): void {
    this.editingReport = null;
    this.isNew = false;
  }

  saveReport(): void {
    if (!this.editingReport?.name.trim() || !this.editingReport?.recipients.trim()) return;
    this.saving = true;

    const obs = this.isNew
      ? this.svc.create(this.editingReport).pipe(map(() => void 0))
      : this.svc.update(this.editingReport.id!, this.editingReport);

    obs.subscribe({
      next: () => {
        this.saving = false;
        this.editingReport = null;
        this.isNew = false;
        this.loadReports();
      },
      error: () => { this.saving = false; this.cdr.markForCheck(); },
    });
  }

  async deleteReport(r: ScheduledReport): Promise<void> {
    const ok = await firstValueFrom(this.dialog.dangerConfirm(
      `Delete schedule "${r.name}"?`, 'Delete Schedule',
    ));
    if (!ok) return;
    this.svc.delete(r.id!).subscribe({ next: () => this.loadReports() });
  }

  toggleActive(r: ScheduledReport): void {
    this.svc.update(r.id!, { ...r, isActive: !r.isActive }).subscribe({
      next: () => { r.isActive = !r.isActive; this.cdr.markForCheck(); },
    });
  }

  runNow(r: ScheduledReport): void {
    this.svc.runNow(r.id!).subscribe({
      next: () => this.loadReports(),
    });
  }

  getTypeLabel(value: string): string {
    return this.reportTypes.find(t => t.value === value)?.label ?? value;
  }

  getFreqLabel(value: string): string {
    return this.frequencies.find(f => f.value === value)?.label ?? value;
  }
}
