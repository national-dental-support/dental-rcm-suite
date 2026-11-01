import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit,
} from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  InsightflowService,
  PatientLtvData,
  TopPatientRow,
} from '../../../core/services/insight-flow.service';

@Component({
    selector: 'app-patient-ltv',
    templateUrl: './patient-ltv.component.html',
    styleUrls: ['./patient-ltv.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PatientLtvComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  patientsLoading = true;
  error = false;

  data: PatientLtvData | null = null;

  patients: TopPatientRow[] = [];
  totalPatients = 0;
  pageIndex = 0;
  pageSize = 20;

  activeTab = 0;

  readonly cohortColumns = ['cohortYear', 'patientCount', 'avgLtv', 'totalCollected'];
  readonly payerColumns  = ['payer', 'patientCount', 'avgCollected', 'totalCollected'];
  readonly patientColumns = ['patient_name', 'primary_payer', 'cohort_year', 'first_visit', 'total_claims', 'total_collected', 'estimated_ltv'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.fetchOverview();
    this.fetchPatients();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchOverview(): void {
    this.loading = true;
    this.error = false;
    this.svc.getPatientLtv().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.data = data;
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

  fetchPatients(): void {
    this.patientsLoading = true;
    this.svc.getTopPatients(this.pageIndex + 1, this.pageSize).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.patients = result.patients ?? [];
        this.totalPatients = result.total ?? 0;
        this.patientsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.patientsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onPage(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.fetchPatients();
  }

  trackByCohort(_: number, r: any): number { return r.cohortYear; }
  trackByPayer(_: number, r: any): string { return r.payer; }
  trackByPatient(_: number, r: any): string { return r.patient_name; }
}
