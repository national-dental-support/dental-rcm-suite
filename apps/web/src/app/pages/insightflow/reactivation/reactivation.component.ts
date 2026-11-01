import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PageEvent } from '@angular/material/paginator';
import {
  InsightflowService,
  ReactivationData,
  ReactivationPatientRow,
} from '../../../core/services/insight-flow.service';

type Segment = { label: string; minDays: number; maxDays: number };

@Component({
  selector: 'app-reactivation',
  templateUrl: './reactivation.component.html',
  styleUrls: ['./reactivation.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReactivationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  data: ReactivationData | null = null;

  segments: Segment[] = [
    { label: 'All Lapsed (12+ mo)',   minDays: 365,  maxDays: 99999 },
    { label: '12\u201318 Months',          minDays: 365,  maxDays: 548   },
    { label: '18\u201324 Months',          minDays: 549,  maxDays: 730   },
    { label: '24+ Months',            minDays: 731,  maxDays: 99999 },
  ];
  activeSegment = 0;

  pageIndex = 0;
  pageSize = 50;
  total = 0;

  readonly patientColumns = ['patientName', 'insurance', 'lastVisit', 'daysSinceVisit', 'totalClaims'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.loading = true;
    this.error = false;
    const seg = this.segments[this.activeSegment];
    this.svc.getReactivation(seg.minDays, seg.maxDays, this.pageIndex + 1, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: d => {
          this.data = d;
          this.total = d.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = true;
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  onSegmentChange(idx: number): void {
    this.activeSegment = idx;
    this.pageIndex = 0;
    this.load();
  }

  onPage(ev: PageEvent): void {
    this.pageIndex = ev.pageIndex;
    this.pageSize = ev.pageSize;
    this.load();
  }

  exportCsv(): void {
    if (!this.data?.patients?.length) return;
    const rows = this.data.patients as ReactivationPatientRow[];
    const header = 'Patient Name,Insurance,Last Visit,Days Since Visit,Total Claims';
    const lines = rows.map(r =>
      `"${r.patientName}","${r.insurance}","${r.lastVisit}",${r.daysSinceVisit},${r.totalClaims}`
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lapsed-patients.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  get activePct(): number {
    if (!this.data) return 0;
    const total = this.data.summary.totalPatients;
    if (!total) return 0;
    return Math.round((this.data.summary.activeCount / total) * 100);
  }

  get lapsedPct(): number {
    if (!this.data) return 0;
    const total = this.data.summary.totalPatients;
    if (!total) return 0;
    return Math.round((this.data.summary.lapsedCount / total) * 100);
  }
}
