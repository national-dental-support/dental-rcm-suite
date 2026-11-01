import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import {
  ReportBuilderService, ReportSchema, ReportResult, SavedReport,
} from '../../../core/services/report-builder.service';

@Component({
    selector: 'app-report-builder',
    templateUrl: './report-builder.component.html',
    styleUrls: ['./report-builder.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReportBuilderComponent implements OnInit {
  loading = true;
  running = false;
  saving = false;

  schema: ReportSchema | null = null;
  selectedDims: string[] = [];
  selectedMeasures: string[] = [];
  days = 90;

  result: ReportResult | null = null;
  savedReports: SavedReport[] = [];
  showSaveForm = false;
  saveName = '';
  saveDesc = '';

  constructor(
    private svc: ReportBuilderService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.svc.getSchema().subscribe({
      next: s => { this.schema = s; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
    this.svc.listSaved().subscribe({
      next: d => { this.savedReports = d; this.cdr.markForCheck(); },
    });
  }

  toggleDim(key: string): void {
    const idx = this.selectedDims.indexOf(key);
    idx >= 0 ? this.selectedDims.splice(idx, 1) : this.selectedDims.push(key);
  }

  toggleMeasure(key: string): void {
    const idx = this.selectedMeasures.indexOf(key);
    idx >= 0 ? this.selectedMeasures.splice(idx, 1) : this.selectedMeasures.push(key);
  }

  isDimSelected(key: string): boolean {
    return this.selectedDims.includes(key);
  }

  isMeasureSelected(key: string): boolean {
    return this.selectedMeasures.includes(key);
  }

  canRun(): boolean {
    return this.selectedDims.length > 0 && this.selectedMeasures.length > 0;
  }

  runReport(): void {
    if (!this.canRun()) return;
    this.running = true;
    this.svc.runReport(this.selectedDims, this.selectedMeasures, this.days).subscribe({
      next: r => { this.result = r; this.running = false; this.cdr.markForCheck(); },
      error: () => { this.running = false; this.cdr.markForCheck(); },
    });
  }

  loadSaved(report: SavedReport): void {
    try {
      this.selectedDims = JSON.parse(report.dimensions);
      this.selectedMeasures = JSON.parse(report.measures);
      this.runReport();
    } catch { /* ignore parse errors */ }
  }

  deleteSaved(id: number): void {
    this.svc.deleteSaved(id).subscribe(() => {
      this.savedReports = this.savedReports.filter(r => r.id !== id);
      this.cdr.markForCheck();
    });
  }

  saveReport(): void {
    this.saving = true;
    this.svc.saveReport({
      name: this.saveName,
      description: this.saveDesc,
      dimensions: this.selectedDims,
      measures: this.selectedMeasures,
      isShared: true,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.showSaveForm = false;
        this.saveName = '';
        this.saveDesc = '';
        this.svc.listSaved().subscribe(d => { this.savedReports = d; this.cdr.markForCheck(); });
      },
      error: () => { this.saving = false; this.cdr.markForCheck(); },
    });
  }

  get resultColumns(): string[] {
    if (!this.result?.rows?.length) return [];
    return Object.keys(this.result.rows[0]);
  }
}
