import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../../environments/environment';

interface RagBelowThreshold { greenMax: number; yellowMax: number; }
interface RagAboveThreshold { greenMin: number; yellowMin: number; }

interface ExecThresholdConfig {
  rag: {
    denialRate: RagBelowThreshold;
    recoveryRate: RagAboveThreshold;
    collectionRate: RagAboveThreshold;
    daysInAR: RagBelowThreshold;
    pctAging90: RagBelowThreshold;
    avgQueueSpecialist: RagBelowThreshold;
    trainingCompliance: RagAboveThreshold;
    payerConcentration: RagBelowThreshold;
    reportUsage: RagAboveThreshold;
  };
  triggers: Record<string, Record<string, number>>;
}

interface MetricRow {
  key: string;
  label: string;
  unit: string;
  direction: 'below' | 'above';
  field1: string;
  field2: string;
}

interface TriggerRow {
  key: string;
  label: string;
  fields: { path: string; label: string; unit: string }[];
}

@Component({
    selector: 'rp-exec-thresholds-admin',
    templateUrl: './exec-thresholds.component.html',
    styleUrls: ['./exec-thresholds.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ExecThresholdsAdminComponent implements OnInit {
  saving = false;
  loading = true;

  metrics: MetricRow[] = [
    { key: 'denialRate',         label: 'Denial Rate',           unit: '%',    direction: 'below', field1: 'greenMax', field2: 'yellowMax' },
    { key: 'recoveryRate',       label: 'Recovery Rate',         unit: '%',    direction: 'above', field1: 'greenMin', field2: 'yellowMin' },
    { key: 'collectionRate',     label: 'Collection Rate',       unit: '%',    direction: 'above', field1: 'greenMin', field2: 'yellowMin' },
    { key: 'daysInAR',           label: 'Days in AR',            unit: 'days', direction: 'below', field1: 'greenMax', field2: 'yellowMax' },
    { key: 'pctAging90',         label: '% Aging >90 Days',      unit: '%',    direction: 'below', field1: 'greenMax', field2: 'yellowMax' },
    { key: 'avgQueueSpecialist', label: 'Avg Queue/Specialist',  unit: '',     direction: 'below', field1: 'greenMax', field2: 'yellowMax' },
    { key: 'trainingCompliance', label: 'Training Compliance',   unit: '%',    direction: 'above', field1: 'greenMin', field2: 'yellowMin' },
    { key: 'payerConcentration', label: 'Payer Concentration',   unit: '%',    direction: 'below', field1: 'greenMax', field2: 'yellowMax' },
    { key: 'reportUsage',        label: 'Report Usage Adoption', unit: '%',    direction: 'above', field1: 'greenMin', field2: 'yellowMin' },
  ];

  triggerRows: TriggerRow[] = [
    { key: 'denialAndAging',        label: 'Denied claims aging unresolved',     fields: [{ path: 'denialRate', label: 'Denial Rate >', unit: '%' }, { path: 'pctAging90', label: 'AND Aging >90d >', unit: '%' }] },
    { key: 'lowCollection',         label: 'Collection rate below threshold',    fields: [{ path: 'collectionRate', label: 'Collection Rate <', unit: '%' }] },
    { key: 'denialAndRecovery',     label: 'Appeal process not recovering',      fields: [{ path: 'denialRate', label: 'Denial Rate >', unit: '%' }, { path: 'recoveryRate', label: 'AND Recovery <', unit: '%' }] },
    { key: 'payerConcentration',    label: 'Revenue concentration risk',         fields: [{ path: 'topPayerConcentration', label: 'Top Payer >', unit: '%' }] },
    { key: 'highDaysInAR',          label: 'Days in AR above benchmark',         fields: [{ path: 'daysInAR', label: 'Days in AR >', unit: 'days' }] },
    { key: 'highAvgQueue',          label: 'Specialist workload above capacity', fields: [{ path: 'avgQueueSize', label: 'Avg Queue >', unit: '' }] },
    { key: 'lowTrainingCompliance', label: 'Training compliance gap',            fields: [{ path: 'trainingCompliance', label: 'Compliance <', unit: '%' }] },
  ];

  form!: FormGroup;
  private baseUrl = environment.server.baseUrl;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({});
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.http.get<ExecThresholdConfig>(`${this.baseUrl}/admin/exec-thresholds`).subscribe({
      next: (cfg) => {
        this.buildForm(cfg);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private buildForm(cfg: ExecThresholdConfig): void {
    const ragGroup: Record<string, FormGroup> = {};
    for (const m of this.metrics) {
      const val = (cfg.rag as any)[m.key] ?? {};
      ragGroup[m.key] = this.fb.group({
        [m.field1]: [val[m.field1] ?? 0],
        [m.field2]: [val[m.field2] ?? 0],
      });
    }

    const triggerGroup: Record<string, FormGroup> = {};
    for (const t of this.triggerRows) {
      const val = (cfg.triggers as any)[t.key] ?? {};
      const fields: Record<string, any> = {};
      for (const f of t.fields) {
        fields[f.path] = [val[f.path] ?? 0];
      }
      triggerGroup[t.key] = this.fb.group(fields);
    }

    this.form = this.fb.group({
      rag: this.fb.group(ragGroup),
      triggers: this.fb.group(triggerGroup),
    });
  }

  save(): void {
    this.saving = true;
    const value = this.form.getRawValue();
    this.http.put<ExecThresholdConfig>(`${this.baseUrl}/admin/exec-thresholds`, value).subscribe({
      next: () => {
        this.saving = false;
        this.snackBar.open('Thresholds saved \u2014 Executive Summary will use new values on next load', 'OK', { duration: 4000 });
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.snackBar.open('Failed to save thresholds', 'Dismiss', { duration: 4000 });
        this.cdr.markForCheck();
      },
    });
  }

  reset(): void {
    this.saving = true;
    this.http.delete<ExecThresholdConfig>(`${this.baseUrl}/admin/exec-thresholds`).subscribe({
      next: (defaults) => {
        this.buildForm(defaults);
        this.saving = false;
        this.snackBar.open('Thresholds reset to defaults', 'OK', { duration: 3000 });
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.snackBar.open('Failed to reset', 'Dismiss', { duration: 3000 });
        this.cdr.markForCheck();
      },
    });
  }

  getYellowRange(m: MetricRow): string {
    const ragGroup = this.form.get('rag')?.get(m.key);
    if (!ragGroup) return '';
    const v1 = ragGroup.get(m.field1)?.value ?? 0;
    const v2 = ragGroup.get(m.field2)?.value ?? 0;
    if (m.direction === 'below') return `${v1} \u2013 ${v2}${m.unit}`;
    return `${v2} \u2013 ${v1}${m.unit}`;
  }
}
