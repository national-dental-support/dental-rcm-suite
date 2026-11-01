import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { finalize } from 'rxjs/operators';

import {
  ENCOUNTER_RESEARCH_CONFIG,
  EncountResearchFilters,
} from '../recon-iq-filter-dialog//recon-iq-filter.config';
import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import { ReconIqWindowService } from '../../../core/services/recon-iq-window.service';
import { PdfService } from '../../../core/services/pdf.service';
import {
  EncounterResearchPatientRowDto,
  PatientClaimsResponseDto,
  ReconIqService,
} from '../../../core/services/recon-iq.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { FloatLabelType } from '@angular/material/form-field';
import { ReconIqLocationFilter } from '../../../core/models/recon-iq.models';

export type PatientEncounterRow = {
  rowType: 'patient';
  patient: string;
  payer: string;
  paymentId: string;
  doctor: string;
  dateOfService: string;
  patientAccount: string;
  claims?: PatientEncounterClaimRow[];
};

export type PatientEncounterClaimRow = {
  rowType: 'claim';
  claimId: string;
  dateClaimSubmitted: string;
  eobId: string;
  dateEOBReceived: string;
  patientAccount: string;
  paymentId: string;
};

type EncounterRow = PatientEncounterRow | PatientEncounterClaimRow;

type FilterChip = { key: keyof EncountResearchFilters; label: string; value: string };

@Component({
    selector: 'app-encounter-research',
    templateUrl: './encounter-research.component.html',
    styleUrls: ['./encounter-research.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class EncounterResearchComponent implements OnInit, OnDestroy {
  isLoading = false;
  currentFilters: EncountResearchFilters = {} as EncountResearchFilters;
  filterValue = '';
  showFilters = false;
  floatLabel: FloatLabelType = 'always';
  readonly config = ENCOUNTER_RESEARCH_CONFIG;

  get initialFilters(): EncountResearchFilters | null { return null; }

  patientEncounterData: PatientEncounterRow[] = [];

  private claimsCache = new Map<string, PatientEncounterClaimRow[]>();
  private loadingPatientAccounts = new Set<string>();

  readonly childrenAccessor = (row: EncounterRow): EncounterRow[] => {
    if (row.rowType !== 'patient') return [];
    return row.claims ?? [];
  };

  readonly hasChildrenAccessor = (row: EncounterRow): boolean => row.rowType === 'patient';

  readonly childIndentPx = 24;

  patientEncounter: AdvancedTableColumnConfig<any>[] = [
    {
      id: 'patient',
      header: 'Patient / Claim ID',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '200px',
      includeInGlobalSearch: true,
      accessor: (r: EncounterRow) => r.rowType === 'patient' ? r.patient : `\u21B3 ${r.claimId}`,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'payer',
      header: 'Payer',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '170px',
      includeInGlobalSearch: true,
      accessor: (r: EncounterRow) => r.rowType === 'patient' ? r.payer : '',
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'paymentId',
      header: 'Payment / EOB ID',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '170px',
      includeInGlobalSearch: true,
      accessor: (r: EncounterRow) => r.rowType === 'patient' ? r.paymentId : (r.eobId || '\u2014'),
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'doctor',
      header: 'Doctor',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '180px',
      includeInGlobalSearch: true,
      accessor: (r: EncounterRow) => r.rowType === 'patient' ? r.doctor : '',
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'dateOfService',
      header: 'Date Submitted',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '160px',
      includeInGlobalSearch: true,
      accessor: (r: EncounterRow) => r.rowType === 'patient' ? '' : r.dateClaimSubmitted,
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'patientAccount',
      header: 'Patient Account',
      type: 'text',
      sortable: true,
      filterable: true,
      width: '170px',
      includeInGlobalSearch: true,
      accessor: (r: EncounterRow) => r.rowType === 'patient' ? r.patientAccount : '',
      filterConfig: { supportsValueList: true, supportsGroupValues: false },
    },
    {
      id: 'actions',
      header: '',
      type: 'custom',
      sortable: false,
      filterable: false,
      width: '340px',
      align: 'end',
      accessor: () => '',
    },
  ];

  encounterGlobalSearch = '';
  patientTableFilterState = { global: '', columns: {} as any };

  get activeFilters(): FilterChip[] {
    const f = this.currentFilters ?? ({} as EncountResearchFilters);

    const map: Array<[keyof EncountResearchFilters, string]> = [
      ['patient', 'Patient'],
      ['payer', 'Payer'],
      ['paymentId', 'Check #'],
      ['doctor', 'Doctor'],
      ['dateOfService', 'Date of Service'],
      ['patientAccount', 'Patient Account'],
    ];

    return map
      .map(([key, label]) => {
        const raw = (f as any)[key];
        const value = raw?.toString().trim();
        return value ? { key, label, value } : null;
      })
      .filter(Boolean) as FilterChip[];
  }

  get activeFilterCount(): number {
    const f = this.currentFilters ?? {};
    return Object.entries(f).filter(([_, v]) => (v ?? '').toString().trim().length > 0).length;
  }

  removeFilterChip(chip: FilterChip): void {
    this.currentFilters = { ...(this.currentFilters ?? {}), [chip.key]: '' } as any;
    this.patientTableFilterState = this.toPatientTableFilterState(this.currentFilters);
    this.loadPatients({ page: 1, pageSize: 25 });
    this.cdr.markForCheck();
  }

  private readonly destroy$ = new Subject<void>();

  constructor(
    private winSvc: ReconIqWindowService,
    private pdfService: PdfService,
    private reconIq: ReconIqService,
    private cdr: ChangeDetectorRef,
    private globalFiltersStore: GlobalFiltersStore,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.currentFilters = {};
    this.patientTableFilterState = { global: '', columns: {} };

    this.loadPatients({ page: 1, pageSize: 25 });

    this.globalFiltersStore.applied$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.claimsCache.clear();
      this.loadPatients({ page: 1, pageSize: 25 });
    });
  }

  private getReconIqPatientQueryFilters() {
    const gf = this.globalFiltersStore.value;
    const from = gf?.startDate ? (gf.startDate as Date).toISOString().slice(0, 10) : undefined;
    const to = gf?.endDate ? (gf.endDate as Date).toISOString().slice(0, 10) : undefined;
    return {
      from, to,
      payers: gf?.payers ?? [],
      providers: gf?.providers ?? [],
      location: gf?.location as ReconIqLocationFilter | undefined,
    };
  }

  loadPatients(args: { page?: number; pageSize?: number; search?: string } = {}): void {
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 25;
    const search = (args.search ?? this.filterValue ?? '').trim();

    this.isLoading = true;
    this.cdr.markForCheck();

    this.reconIq.getPatients({ page, pageSize, search, ...this.getReconIqPatientQueryFilters() })
      .subscribe({
        next: (res) => {
          this.patientEncounterData = res.rows.map(r => this.mapPatientRow(r));
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  onPatientRowExpanded(row: PatientEncounterRow): void {
    if (!row || row.rowType !== 'patient') return;
    if (Array.isArray(row.claims)) return;
    if (this.loadingPatientAccounts.has(row.patientAccount)) return;

    this.loadingPatientAccounts.add(row.patientAccount);
    this.reconIq.getPatientClaims({ patientAccount: row.patientAccount, page: 1, pageSize: 100 })
      .pipe(finalize(() => { this.loadingPatientAccounts.delete(row.patientAccount); }))
      .subscribe({
        next: (res) => {
          const claims = res.rows.map((r: any) => this.mapClaimRow(r, row));
          this.updateRow(row.patientAccount, { claims });
        },
        error: () => this.cdr.markForCheck(),
      });
  }

  onPatientRowClick(e: any): void {}

  private updateRow(patientAccount: string, patch: Partial<PatientEncounterRow>): void {
    this.patientEncounterData = this.patientEncounterData.map(r =>
      r.patientAccount === patientAccount ? { ...r, ...patch } : r
    );
    this.cdr.markForCheck();
  }

  onPatientClaimAction(action: 'claim' | 'eob' | 'both', row: PatientEncounterClaimRow): void {
    if (!row?.patientAccount) return;

    const hasEob = this.hasEob(row);
    if ((action === 'eob' || action === 'both') && !hasEob) return;

    if (action === 'claim') {
      this.winSvc.open('cms1500', `Recon-IQ \u2022 Claim ${row.claimId}`, `<p style="padding:16px">Loading claim\u2026</p>`);
      void this.fetchCms1500(row.claimId);
      return;
    }

    if (action === 'eob') {
      this.winSvc.open('eob', 'Recon-IQ \u2022 EOB Viewer', `<p style="padding:16px">Loading EOB\u2026</p>`);
      void this.fetchEob(row);
      return;
    }

    // both
    this.winSvc.open('cms1500', `Recon-IQ \u2022 Claim ${row.claimId}`, `<p style="padding:16px">Loading claim\u2026</p>`);
    this.winSvc.open('eob', 'Recon-IQ \u2022 EOB Viewer', `<p style="padding:16px">Loading EOB\u2026</p>`);
    void this.fetchCms1500(row.claimId);
    void this.fetchEob(row);
  }

  private async fetchCms1500(claimId: string): Promise<void> {
    try {
      const html = await firstValueFrom(this.reconIq.getCms1500Html(claimId));
      this.winSvc.open('cms1500', `Recon-IQ \u2022 Claim ${claimId}`, html);
    } catch (err: any) {
      let detail = err?.message || 'Unknown error';
      try {
        const parsed = JSON.parse(err?.error || '{}');
        if (parsed.detail || parsed.message) detail = parsed.detail || parsed.message;
      } catch { /* not JSON */ }
      this.winSvc.open('cms1500', `Recon-IQ \u2022 Claim ${claimId}`,
        `<p style="padding:16px;color:#b91c1c">Error (${err?.status}): ${detail}</p>`);
    }
  }

  private async fetchEob(row: PatientEncounterClaimRow): Promise<void> {
    try {
      const blob = await firstValueFrom(this.pdfService.getPdf());
      const objectUrl = URL.createObjectURL(blob);
      this.winSvc.updateEobPdf('Recon-IQ \u2022 EOB Viewer', objectUrl);
    } catch {
      this.winSvc.open('eob', 'Recon-IQ \u2022 EOB Viewer',
        `<p style="padding:16px;color:#b91c1c">Failed to load EOB. Please try again.</p>`);
    }
  }

  exportCsv(): void {
    const rows: string[][] = [
      ['Patient', 'Payer', 'Payment ID', 'Doctor', 'Date of Service', 'Patient Account'],
      ...this.patientEncounterData.map(r => [r.patient, r.payer, r.paymentId, r.doctor, r.dateOfService, r.patientAccount]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `encounter-research-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onFilterReset(): void {
    this.currentFilters = {};
    this.filterValue = '';
    this.patientTableFilterState = this.toPatientTableFilterState({});
    this.loadPatients({ page: 1, pageSize: 25 });
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  onEncounterSearchChanged(value: string): void {
    this.encounterGlobalSearch = value;
    this.loadPatients({ page: 1, pageSize: 25, search: value });
    this.cdr.markForCheck();
  }

  onEncounterFiltersChanged(f: EncountResearchFilters): void {
    this.currentFilters = f;
    this.patientTableFilterState = this.toPatientTableFilterState(f);
    this.cdr.markForCheck();
  }

  hasEob(row: PatientEncounterClaimRow): boolean {
    return !!(row?.eobId && row.eobId.trim().length > 0);
  }

  private toPatientTableFilterState(f: EncountResearchFilters) {
    const mk = (value?: string) =>
      value?.trim() ? { operator: 'contains', value: value.trim() } : undefined;
    return {
      global: '',
      columns: {
        patient: mk(f.patient),
        payer: mk(f.payer),
        paymentId: mk(f.paymentId),
        doctor: mk(f.doctor),
        dateOfService: mk(f.dateOfService),
        patientAccount: mk(f.patientAccount),
      },
    };
  }

  private mapPatientRow(dto: EncounterResearchPatientRowDto): PatientEncounterRow {
    return {
      rowType: 'patient',
      patient: dto.patientName,
      payer: dto.payerName,
      paymentId: dto.paymentId,
      doctor: dto.doctorName,
      dateOfService: dto.dateOfService,
      patientAccount: dto.patientAccount,
    };
  }

  private mapClaimRow(dto: any, enc: PatientEncounterRow): PatientEncounterClaimRow {
    return {
      rowType: 'claim',
      claimId: dto.claimId,
      dateClaimSubmitted: dto.dateClaimSubmitted,
      eobId: dto.eobId ?? '',
      dateEOBReceived: dto.dateEobReceived ?? '',
      patientAccount: enc.patientAccount,
      paymentId: enc.paymentId ?? '',
    };
  }
}
