// src/app/pages/payer-iq/payer-iq-dashboard/payer-iq-dashboard.component.ts

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import {
  BehaviorSubject,
  Subject,
  catchError,
  finalize,
  forkJoin,
  map,
  of,
  take,
  takeUntil,
  tap,
} from 'rxjs';

import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import { CdtPerformanceRow } from '../../../core/models/payer-iq.model';
import {
  ChargeAmountRow,
  CptNonPaymentResponse,
  PayerDetailsTreeRow,
  PayerIqService,
  PayerMixCptVolumeRow,
  PayerMixPatientVolumeRow,
} from '../../../core/services/payer-iq.service';

import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { PayerIqFiltersValue } from '../../../shared/components/global-filters/global-filters.models';
import { PayerIqStore } from '../../../store/payer-iq/payer-iq.store';

// NOTE: You can keep this injected for other mocks, but Payer Details table is now built from FACTS
// to enforce the drilldown rules precisely (plans ONLY for Commercial -> Payer Direct).
import { ApexAxisChartSeries } from 'ng-apexcharts';

/**
 * MVP NOTES
 * - rp-advanced-table supports AdvancedTableColumnConfig which uses:
 *   id, header, type, propertyPath/accessor, displayFormatter, align('start'|'center'|'end'), chipConfig, actionId
 */

// =========================
// Local display formatters
// =========================
const fmtCurrency = (n: any) =>
  typeof n === 'number'
    ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
    : '\u2014';

const fmtNumber = (n: any) => (typeof n === 'number' ? n.toLocaleString() : '\u2014');

// =========================
// Filters form type
// =========================
type FiltersForm = FormGroup<{
  startDate: FormControl<Date | null>;
  endDate: FormControl<Date | null>;
  payers: FormControl<string[]>;
  plans: FormControl<string[]>;
  leaseNetworks: FormControl<string[]>;
  providers: FormControl<string[]>;
}>;

// =========================
// Trend types
// =========================
type TrendWindow = '1day' | '1week' | '1m';

interface TrendsPoint {
  date: string; // yyyy-mm-01
  value: number;
}

interface DonutDatum {
  label: string;
  value: number;
}

// =========================
// Non Payments table types
// =========================
type NonPaymentChildKind = 'cpt' | 'reason' | 'denial';
type NonPaymentNodeType = 'payer' | 'cpt' | 'claim';
type CodeKind = 'reason' | 'denial';

export interface NonPaymentChildRow {
  kind: NonPaymentChildKind;

  // CPT rows
  cptCode?: string;
  cptDescription?: string;

  // Code rows
  code?: string;
  description?: string;
  parentCptCode?: string;

  totalCharges: number;
  amountPaid: number;
  variance: number;
  claims: number;
}

// interface NonPaymentPayerRow {
//   payer: string;
//   totalCharges: number;
//   amountPaid: number;
//   variance: number;
//   claims: number;
//   children?: NonPaymentChildRow[];
// }

export interface NonPaymentNode {
  id: string;
  nodeType: NonPaymentNodeType;

  payer?: string;

  cptCode?: string;
  cptDescription?: string;

  // [ok] CLAIM ROWS
  claimId?: string | number;

  // [ok] METRICS (used by columns)
  totalCharges?: number;
  amountPaid?: number;
  balance?: number;
  claims?: number;

  children?: NonPaymentNode[];
}

// export const NON_PAYMENT_MOCK: NonPaymentPayerRow[] = [
//   {
//     payer: 'Delta Dental',
//     totalCharges: 452_900,
//     amountPaid: 331_420,
//     variance: 331_420 - 452_900,
//     claims: 384,
//     children: [
//       { kind: 'cpt', cptCode: 'D1110', cptDescription: 'Prophylaxis - Adult', totalCharges: 128_400, amountPaid: 97_120, variance: 97_120 - 128_400, claims: 112 },
//       { kind: 'reason', parentCptCode: 'D1110', code: 'R17', description: 'Non-covered service', totalCharges: 26_700, amountPaid: 11_650, variance: 11_650 - 26_700, claims: 21 },
//       { kind: 'denial', parentCptCode: 'D1110', code: 'CO-45', description: 'Charge exceeds fee schedule/maximum allowable', totalCharges: 41_900, amountPaid: 35_800, variance: 35_800 - 41_900, claims: 37 },

//       { kind: 'cpt', cptCode: 'D0120', cptDescription: 'Periodic oral evaluation', totalCharges: 92_600, amountPaid: 71_350, variance: 71_350 - 92_600, claims: 84 },
//       { kind: 'reason', parentCptCode: 'D0120', code: 'R20', description: 'Bundled/Inclusive', totalCharges: 18_900, amountPaid: 9_200, variance: 9_200 - 18_900, claims: 14 },
//       { kind: 'denial', parentCptCode: 'D0120', code: 'CO-97', description: 'Benefit included in another service/procedure', totalCharges: 22_300, amountPaid: 18_650, variance: 18_650 - 22_300, claims: 19 },
//     ],
//   },
//   {
//     payer: 'Aetna Dental',
//     totalCharges: 318_700,
//     amountPaid: 245_120,
//     variance: 245_120 - 318_700,
//     claims: 265,
//     children: [
//       { kind: 'cpt', cptCode: 'D1110', cptDescription: 'Prophylaxis - Adult', totalCharges: 88_900, amountPaid: 70_430, variance: 70_430 - 88_900, claims: 93 },
//       { kind: 'denial', parentCptCode: 'D1110', code: 'CO-45', description: 'Charge exceeds fee schedule/maximum allowable', totalCharges: 20_400, amountPaid: 16_900, variance: 16_900 - 20_400, claims: 22 },
//       { kind: 'reason', parentCptCode: 'D1110', code: 'R16', description: 'Service not payable per contract', totalCharges: 9_700, amountPaid: 2_150, variance: 2_150 - 9_700, claims: 8 },
//     ],
//   },
// ];

// =========================
// Payer Details types (FACTS -> TREE)
// =========================
export type GovernmentType =
  | 'Medicare'
  | 'Medicaid'
  | 'Medicare Advantage'
  | 'Federal Plans';

export interface PayerDetailFact {
  payer: string;
  category: 'Commercial' | 'Government' | 'LeaseNetwork';

  // Commercial
  commercialType?: 'Payer Direct' | 'Out Network';
  plan?: string; // only used for Commercial + Payer Direct

  // Government
  governmentType?: GovernmentType;

  // LeaseNetwork
  network?: string;

  // metrics
  totalCharges: number;
  amountPaid: number;
  variance: number;
  claims: number;
}

type PayerDetailsNodeType = 'group' | 'payer' | 'plan';

export interface PayerDetailsNode {
  id: string;
  nodeType: PayerDetailsNodeType;

  label: string;

  totalCharges?: number;
  amountPaid?: number;
  variance?: number;
  claims?: number;

  category?: 'Commercial' | 'Government' | 'LeaseNetwork';
  subCategory?: string;
  networkName?: string;

  payer?: string;
  plan?: string;

  children?: PayerDetailsNode[];
}

@Component({
    selector: 'app-payer-iq-dashboard',
    templateUrl: './payer-iq-dashboard.component.html',
    styleUrls: ['./payer-iq-dashboard.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PayerIqDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly trendWindow$ = new BehaviorSubject<TrendWindow>('1day');

  // demo lists (swap to API later)
  readonly payers = ['Aetna', 'Delta Dental', 'Cigna', 'MetLife', 'Guardian'];
  readonly plans = ['PPO Basic', 'PPO Premier', 'DHMO', 'Indemnity'];
  readonly leaseNetworks = ['Zelis', 'DenteMax', 'Careington', 'Other'];
  readonly providers = ['Dr. Jones', 'Dr. Patel', 'Dr. Nguyen', 'Dr. Smith'];

  // =========================
  // TABLE: Payer Non Payments by CDT Code
  // =========================
  payerNonPaymentColumns: AdvancedTableColumnConfig<NonPaymentNode>[] = [
    {
      id: 'label',
      header: 'Payer / CPT / Claim',
      type: 'text',
      sortable: true,
      width: '360px',
      align: 'start',
      includeInGlobalSearch: true,
      accessor: (r: NonPaymentNode) => {
        if (r.nodeType === 'payer') return r.payer ?? '';
        if (r.nodeType === 'cpt') return `CPT: ${r.cptCode ?? ''}`;
        return `Claim: ${r.claimId ?? ''}`;
      },
      filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: false, // or true if using groups
      }
    },
    {
      id: 'totalCharges',
      header: 'Total Charges',
      type: 'currency',
      sortable: true,
      align: 'end',
      displayFormatter: (v) => (v == null ? '\u2014' : fmtCurrency(v)),
      accessor: (r: NonPaymentNode) => (typeof r.totalCharges === 'number' ? r.totalCharges : null),
    },
    {
      id: 'claims',
      header: 'Claims',
      type: 'number',
      sortable: true,
      align: 'end',
      displayFormatter: (v) => (v == null ? '\u2014' : fmtNumber(v)),
      accessor: (r) => (r.nodeType === 'payer' || r.nodeType === 'cpt') ? (typeof r.claims === 'number' ? r.claims : null) : null
    },
  ];

  // =========================
  // TABLE: Payer Details (Category/Group/Payer/Plan rules enforced)
  // =========================
  payerDetailsColumns: AdvancedTableColumnConfig<PayerDetailsNode>[] = [
    {
      id: 'label',
      header: 'Category / Group / Payer / Plan',
      type: 'text',
      sortable: true,
      width: '360px',
      align: 'start',
      includeInGlobalSearch: true,
      accessor: (r) => r.label,
      filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: false, // or true if using groups
      }
    },
    {
      id: 'totalCharges',
      header: 'Total Charges',
      type: 'currency',
      sortable: true,
      align: 'end',
      accessor: (r) => (typeof r.totalCharges === 'number' ? r.totalCharges : null),
      displayFormatter: (v) => (v == null ? '\u2014' : fmtCurrency(v)),
    },
    {
      id: 'claims',
      header: 'Claims',
      type: 'number',
      sortable: true,
      align: 'end',
      accessor: (r) => (typeof r.claims === 'number' ? r.claims : null),
      displayFormatter: (v) => (v == null ? '\u2014' : fmtNumber(v)),
    },
  ];

  // OPTIONAL: CDT performance table columns (kept)
  cdtPerformanceColumns: AdvancedTableColumnConfig<CdtPerformanceRow>[] = [
    { id: 'code', header: 'CPT', type: 'text', propertyPath: 'code', sortable: true, width: '110px' },
    { id: 'description', header: 'Description', type: 'text', propertyPath: 'description', sortable: true, width: '280px' },
    { id: 'totalClaims', header: 'Claims', type: 'number', propertyPath: 'totalClaims', sortable: true, align: 'end', displayFormatter: (v) => fmtNumber(v) },
    { id: 'totalCharges', header: 'Charges', type: 'currency', propertyPath: 'totalCharges', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
    { id: 'allowedAmount', header: 'Allowed', type: 'currency', propertyPath: 'allowedAmount', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
    { id: 'expectedPayment', header: 'Expected', type: 'currency', propertyPath: 'expectedPayment', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
    { id: 'actualPayment', header: 'Actual', type: 'currency', propertyPath: 'actualPayment', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
    { id: 'varianceAmount', header: 'Variance', type: 'currency', propertyPath: 'varianceAmount', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
    // your app may treat percent differently; keep as string formatter
    { id: 'variancePercent', header: 'Variance %', type: 'percent', propertyPath: 'variancePercent', sortable: true, align: 'end', displayFormatter: (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '\u2014') },
    { id: 'adjustmentAmount', header: 'Adjustments', type: 'currency', propertyPath: 'adjustmentAmount', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
    { id: 'patientResponsibility', header: 'Patient Resp.', type: 'currency', propertyPath: 'patientResponsibility', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
    { id: 'denialsCount', header: 'Denials', type: 'number', propertyPath: 'denialsCount', sortable: true, align: 'end', displayFormatter: (v) => fmtNumber(v) },
    { id: 'avgPayment', header: 'Avg Payment', type: 'currency', propertyPath: 'avgPayment', sortable: true, align: 'end', displayFormatter: (v) => fmtCurrency(v) },
  ];

  // =========================
  // Filters form
  // =========================
  readonly filtersForm: FiltersForm = this.fb.group({
    startDate: this.fb.control<Date | null>(null),
    endDate: this.fb.control<Date | null>(null),
    payers: this.fb.control<string[]>([]),
    plans: this.fb.control<string[]>([]),
    leaseNetworks: this.fb.control<string[]>([]),
    providers: this.fb.control<string[]>([]),
  });

  // =========================
  // Dashboard state
  // =========================
  payerMixCharges: DonutDatum[] = [];
  payerMixPaymentsApi: DonutDatum[] = [];
  payerMixPatientVolumeApi: DonutDatum[] = [];
  payerMixCptVolumeApi: DonutDatum[] = [];

  // Raw (uncollapsed) data for drill-down into "Other"
  private payerMixChargesAll: DonutDatum[] = [];
  private payerMixPaymentsAll: DonutDatum[] = [];
  private payerMixPatientVolumeAll: DonutDatum[] = [];
  private payerMixCptVolumeAll: DonutDatum[] = [];

  // Drill-down state
  chargesDrilled = false;
  paymentsDrilled = false;
  patientDrilled = false;
  cptDrilled = false;
  forecastSeries: ApexAxisChartSeries = [];
  forecastCategories: string[] = [];

  nonPaymentTree: NonPaymentNode[] = [];
  payerDetailsTree: PayerDetailsNode[] = [];

  childrenAccessor = (r: PayerDetailsNode) => r.children ?? [];
  getNonPaymentChildren = (row: NonPaymentNode) => row.children ?? [];

  isLoadingDashboard = false;

  constructor(
    private fb: FormBuilder,
    private payerIqService: PayerIqService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private filtersStore: PayerIqFiltersStore,
    private payerIqStore: PayerIqStore,
  ) {}

  ngOnInit(): void {
    // Subscribe to store for cached dashboard data
    this.payerIqStore.dashboardData$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (!data) return;
        this.applyDashboardData(data);
      });

    this.payerIqStore.dashboardLoading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.isLoadingDashboard = loading;
        this.cdr.markForCheck();
      });

    // When user clicks Apply in global filters, reload dashboard via store
    this.filtersStore.applied$
      .pipe(takeUntil(this.destroy$))
      .subscribe((filters: PayerIqFiltersValue) => this.payerIqStore.reloadDashboard(filters));

    // [ok] Payer Details table (FACTS -> TREE)
    // Use the facts mock to guarantee:
    // - Commercial -> Payer Direct -> Payer -> Plan
    // - Commercial -> Out Network -> Payer (NO plan)
    // - Government -> Medicare/Medicaid/Medicare Advantage/Federal Plans -> Payer
    // - LeaseNetwork -> Network -> Payer
    

    // Optional: if you still want to generate random mock payers,
    // keep this call but DO NOT use it to build the tree unless you convert to facts.
    // console.log('rows mock', rowsMock);

    this.cdr.markForCheck();
  }

  ngAfterViewInit(): void {
    // Wait until Angular finishes the first full render pass
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      // Give the grid/cards one more frame to settle
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
        });
      });
    });
  }

  /** Call this after you assign chart data from API */
  private kickCharts(): void {
    // ensure bindings are applied before resize
    this.cdr.detectChanges();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // =========================
  // Dashboard data from store -> local display state
  // =========================
  private applyDashboardData(data: import('../../../store/payer-iq/payer-iq.store').PayerIqDashboardData): void {
    const charges = this.toChargesPieData(data.chargeAmount?.data ?? []);
    const payments = this.toPaymentsPieData(data.payerMixReimbursement?.data ?? []);
    const patientVolume = this.toPatientVolumePieData(data.payerMixPatientVolume?.data ?? []);
    const cptVolume = this.toCptVolumePieData(data.payerMixCptVolume?.data ?? []);
    const forecastTrend = this.toForecastTrendData(data.forecasting?.data ?? []);

    this.payerMixChargesAll = charges.all;
    this.payerMixPaymentsAll = payments.all;
    this.payerMixPatientVolumeAll = patientVolume.all;
    this.payerMixCptVolumeAll = cptVolume.all;

    this.payerMixCharges = charges.display;
    this.payerMixPaymentsApi = payments.display;
    this.payerMixPatientVolumeApi = patientVolume.display;
    this.payerMixCptVolumeApi = cptVolume.display;

    this.chargesDrilled = false;
    this.paymentsDrilled = false;
    this.patientDrilled = false;
    this.cptDrilled = false;
    this.forecastSeries = forecastTrend.series;
    this.forecastCategories = forecastTrend.categories;
    this.nonPaymentTree = this.buildCptNonPaymentTree(data.cptNonPayment);
    this.payerDetailsTree = this.buildPayerDetailsTreeFromApi(data.payerDetails?.data ?? []);

    this.kickCharts();
  }

  // =========================
  // UI helpers (pills / labels)
  // =========================
  get dateRangeLabel(): string {
    const s = this.filtersForm.controls.startDate.value;
    const e = this.filtersForm.controls.endDate.value;
    if (!s && !e) return 'All';
    const ss = s ? s.toLocaleDateString() : '\u2026';
    const ee = e ? e.toLocaleDateString() : '\u2026';
    return `${ss} \u2013 ${ee}`;
  }

  get payerLabel(): string { return this.formatArrayLabel(this.filtersForm.controls.payers.value); }
  get planLabel(): string { return this.formatArrayLabel(this.filtersForm.controls.plans.value); }
  get leaseLabel(): string { return this.formatArrayLabel(this.filtersForm.controls.leaseNetworks.value); }
  get providerLabel(): string { return this.formatArrayLabel(this.filtersForm.controls.providers.value); }

  private formatArrayLabel(values: string[] | null | undefined): string {
    const v = values ?? [];
    if (!v.length) return 'All';
    return `${v.length} selected`;
  }

  // =========================
  // Pie chart shaping
  // =========================
  private toChargesPieData(rows: ChargeAmountRow[]): { display: DonutDatum[], all: DonutDatum[] } {
    const all: DonutDatum[] = (rows ?? [])
      .map((r: any) => ({
        label: String(r.PayerName ?? r.payername ?? '').trim(),
        value: Number(r.TotalCharges ?? r.totalCharges ?? 0),
      }))
      .filter((x) => x.label.length > 0 && x.value > 0)
      .sort((a, b) => b.value - a.value);
    return { display: this.collapseSmall(all), all };
  }

  private toPaymentsPieData(rows: any[]): { display: DonutDatum[], all: DonutDatum[] } {
    const all: DonutDatum[] = (rows ?? [])
      .map((r: any) => ({
        label: String(r.PayerName ?? r.payername ?? '').trim(),
        value: Number(r.TotalPayments ?? r.totalPayments ?? r.TotalCharges ?? r.totalCharges ?? 0),
      }))
      .filter((x) => x.label.length > 0 && x.value > 0)
      .sort((a, b) => b.value - a.value);
    return { display: this.collapseSmall(all), all };
  }

  private toPatientVolumePieData(rows: PayerMixPatientVolumeRow[]): { display: DonutDatum[], all: DonutDatum[] } {
    const all: DonutDatum[] = (rows ?? [])
      .map((r: any) => ({
        label: String(r.PayerName ?? r.payername ?? '').trim(),
        value: Number(r.PatientEncounter ?? r.patientEncounter ?? r.TotalPatients ?? r.totalPatients ?? 0),
      }))
      .filter((x) => x.label.length > 0 && x.value > 0)
      .sort((a, b) => b.value - a.value);
    return { display: this.collapseSmall(all), all };
  }

  private toCptVolumePieData(rows: PayerMixCptVolumeRow[]): { display: DonutDatum[], all: DonutDatum[] } {
    const mapAgg = new Map<string, number>();
    for (const r of rows ?? []) {
      const payer = String((r as any).PayerName ?? (r as any).payername ?? '').trim();
      const count = Number((r as any).ChargeRowCount ?? (r as any).chargeRowCount ?? 0);
      if (!payer || !Number.isFinite(count) || count <= 0) continue;
      mapAgg.set(payer, (mapAgg.get(payer) ?? 0) + count);
    }
    const all: DonutDatum[] = Array.from(mapAgg.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    return { display: this.collapseSmall(all), all };
  }

  private collapseSmall(sorted: DonutDatum[]): DonutDatum[] {
    if (!sorted?.length) return [];
    const top = sorted.slice(0, 5);
    const otherValue = sorted.slice(5).reduce((sum, x) => sum + (x.value ?? 0), 0);
    if (otherValue > 0) top.push({ label: 'Other', value: otherValue });
    return top;
  }

  // -- Drill-down: expand "Other" slice ----------------------------------------

  onPieSliceClicked(chart: 'charges' | 'payments' | 'patient' | 'cpt', label: string): void {
    if (label !== 'Other') return;
    switch (chart) {
      case 'charges':
        this.payerMixCharges = this.payerMixChargesAll.slice(5);
        this.chargesDrilled = true;
        break;
      case 'payments':
        this.payerMixPaymentsApi = this.payerMixPaymentsAll.slice(5);
        this.paymentsDrilled = true;
        break;
      case 'patient':
        this.payerMixPatientVolumeApi = this.payerMixPatientVolumeAll.slice(5);
        this.patientDrilled = true;
        break;
      case 'cpt':
        this.payerMixCptVolumeApi = this.payerMixCptVolumeAll.slice(5);
        this.cptDrilled = true;
        break;
    }
    this.kickCharts();
  }

  resetPieDrilldown(chart: 'charges' | 'payments' | 'patient' | 'cpt'): void {
    switch (chart) {
      case 'charges':
        this.payerMixCharges = this.collapseSmall(this.payerMixChargesAll);
        this.chargesDrilled = false;
        break;
      case 'payments':
        this.payerMixPaymentsApi = this.collapseSmall(this.payerMixPaymentsAll);
        this.paymentsDrilled = false;
        break;
      case 'patient':
        this.payerMixPatientVolumeApi = this.collapseSmall(this.payerMixPatientVolumeAll);
        this.patientDrilled = false;
        break;
      case 'cpt':
        this.payerMixCptVolumeApi = this.collapseSmall(this.payerMixCptVolumeAll);
        this.cptDrilled = false;
        break;
    }
    this.kickCharts();
  }

  // -- CSV export ---------------------------------------------------------------

  exportPieCsv(filename: string, data: DonutDatum[]): void {
    const rows: string[][] = [['Payer', 'Value'], ...data.map(d => [d.label, String(d.value)])];
    this.downloadCsv(filename, rows);
  }

  exportForecastCsv(): void {
    const headers = ['Month', ...this.forecastSeries.map((s: any) => s.name ?? '')];
    const rows: string[][] = [headers];
    this.forecastCategories.forEach((cat, i) => {
      const row = [cat, ...this.forecastSeries.map((s: any) => {
        const d = (s.data as any[])[i];
        return d != null ? String(d) : '';
      })];
      rows.push(row);
    });
    this.downloadCsv('payer-iq-forecast.csv', rows);
  }

  private downloadCsv(filename: string, rows: string[][]): void {
    const content = rows.map(r =>
      r.map(v => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(',')
    ).join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private toForecastTrendData(rows: any[]): { series: ApexAxisChartSeries; categories: string[] } {
    if (!rows?.length) return { series: [], categories: [] };

    const anchorStr = rows[0]?.nowMonthStart;
    const anchor = anchorStr ? new Date(anchorStr) : new Date();

    const sumKey = (key: string) => rows.reduce((acc, r) => acc + Number(r?.[key] ?? 0), 0);

    const monthLabel = (base: Date, offsetMonths: number): string => {
      const d = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1);
      return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    };

    // 7 months: -3, -2, -1, 0, +1, +2, +3
    const categories = [-3, -2, -1, 0, 1, 2, 3].map(o => monthLabel(anchor, o));

    // Actuals: measured payment amounts for past months (null for future)
    const actualsData: (number | null)[] = [
      sumKey('3_months_ago'),
      sumKey('2_months_ago'),
      sumKey('1_month_ago'),
      sumKey('now'),
      null, null, null,
    ];

    // Forecast: continuous rolling-avg line for ALL months
    // Past months use the historical rolling-avg (what algorithm would have predicted)
    // Current month bridges to future forecast
    // Future months use the current rolling-avg (same value repeated)
    const nowForecast = sumKey('1_month_future'); // avg of last 3 full months
    const forecastData: (number | null)[] = [
      sumKey('3_months_ago_forecast'),
      sumKey('2_months_ago_forecast'),
      sumKey('1_months_ago_forecast'),
      nowForecast,                // forecast for current month = same avg
      sumKey('1_month_future'),
      sumKey('2_month_future'),
      sumKey('3_month_future'),
    ];

    return {
      categories,
      series: [
        { name: 'Actuals',  data: actualsData  },
        { name: 'Forecast', data: forecastData  },
      ],
    };
  }

  // =========================
  // AdvancedTable: Row styling hook
  // =========================
  payerDetailsRowClass = (row: PayerDetailsNode): string | string[] => {
    // Category-level nodes are nodeType 'group' with label Commercial/Government/LeaseNetwork
    if (row.nodeType === 'group' && (row.label === 'Commercial' || row.label === 'Government' || row.label === 'LeaseNetwork')) {
      return `pd-row--category pd-row--category-${String(row.label).toLowerCase()}`;
    }

    if (row.nodeType === 'group') {
      // group under a category (Payer Direct, Out Network, Medicare, etc.)
      const cat = String(row.category ?? '').toLowerCase();
      return `pd-row--group pd-row--group-${cat}`;
    }

    if (row.nodeType === 'payer') return 'pd-row--payer';
    if (row.nodeType === 'plan') return 'pd-row--plan';

    return '';
  };

  // =========================
  // Tree Builders
  // =========================
  private makeId(parts: Array<string | number | null | undefined>) {
    return parts.filter((x) => x != null && String(x).trim().length > 0).join('|');
  }

  private sumFacts(rows: PayerDetailFact[]) {
    return rows.reduce(
      (acc, r) => {
        const charges = Number(r.totalCharges ?? 0);
        const paid = Number(r.amountPaid ?? 0);
        const variance = Number(r.variance ?? (paid - charges));
        const claims = Number(r.claims ?? 0);

        acc.totalCharges += charges;
        acc.amountPaid += paid;
        acc.variance += variance;
        acc.claims += claims;
        return acc;
      },
      { totalCharges: 0, amountPaid: 0, variance: 0, claims: 0 }
    );
  }

  private sumNodes(nodes: Array<Pick<PayerDetailsNode, 'totalCharges' | 'amountPaid' | 'variance' | 'claims'>>) {
    return nodes.reduce(
      (acc, n) => {
        const charges = Number(n.totalCharges ?? 0);
        const paid = Number(n.amountPaid ?? 0);
        const variance = Number(n.variance ?? (paid - charges));
        const claims = Number(n.claims ?? 0);

        acc.totalCharges += charges;
        acc.amountPaid += paid;
        acc.variance += variance;
        acc.claims += claims;
        return acc;
      },
      { totalCharges: 0, amountPaid: 0, variance: 0, claims: 0 }
    );
  }

  /**
   * [ok] FINAL PAYER DETAILS TREE
   * Category -> Group -> Payer -> Plan
   *
   * Rules:
   * - Commercial:
   *   - Payer Direct: Payer -> Plan (plans only here)
   *   - Out Network: Payer only (NO plan drilldown)
   * - Government:
   *   - Medicare/Medicaid/Medicare Advantage/Federal Plans -> Payer
   * - LeaseNetwork:
   *   - Network -> Payer
   */
 private buildPayerDetailsTreeFromApi(rows: PayerDetailsTreeRow[]): PayerDetailsNode[] {
  const norm = (v: any) => String(v ?? '').trim();

  // Defensive filter:
  // Only allow PLAN rows for Commercial -> Payer Direct (even if SQL isn't fixed yet).
  const safeRows = (rows ?? []).filter((r) => {
    if (r.LevelType !== 'PLAN') return true;
    return norm(r.Category) === 'Commercial' && norm(r.GroupName) === 'Payer Direct';
  });

  // Index rows by "path"
  const categories = safeRows.filter((r) => r.SortLevel === 1 && r.LevelType === 'CATEGORY');

  const groupsByCategory = new Map<string, PayerDetailsTreeRow[]>();
  const payersByCatGroup = new Map<string, PayerDetailsTreeRow[]>();
  const plansByCatGroupPayer = new Map<string, PayerDetailsTreeRow[]>();

  for (const r of safeRows) {
    const cat = norm(r.Category);

    if (r.SortLevel === 2 && r.LevelType === 'GROUP') {
      groupsByCategory.set(cat, [...(groupsByCategory.get(cat) ?? []), r]);
    }

    if (r.SortLevel === 3 && r.LevelType === 'PAYER') {
      const key = `${cat}||${norm(r.GroupName)}`;
      payersByCatGroup.set(key, [...(payersByCatGroup.get(key) ?? []), r]);
    }

    if (r.SortLevel === 4 && r.LevelType === 'PLAN') {
      const key = `${cat}||${norm(r.GroupName)}||${norm(r.PayerName)}`;
      plansByCatGroupPayer.set(key, [...(plansByCatGroupPayer.get(key) ?? []), r]);
    }
  }

  const mkNode = (p: {
    idParts: Array<string | number | null | undefined>;
    nodeType: 'group' | 'payer' | 'plan';
    label: string;
    category?: any;
    subCategory?: string;
    payer?: string;
    plan?: string;
    networkName?: string;
    totalCharges?: number;
    claims?: number;
    children?: PayerDetailsNode[];
  }): PayerDetailsNode => ({
    id: this.makeId(p.idParts),
    nodeType: p.nodeType,
    label: p.label,
    category: p.category,
    subCategory: p.subCategory,
    payer: p.payer,
    plan: p.plan,
    networkName: p.networkName,
    totalCharges: p.totalCharges,
    claims: p.claims,
    children: p.children ?? [],
  });

  // Category nodes
  const categoryNodes: PayerDetailsNode[] = categories
    .sort((a, b) => norm(a.Category).localeCompare(norm(b.Category)))
    .map((catRow) => {
      const cat = norm(catRow.Category);

      // groups for this category
      const groups = (groupsByCategory.get(cat) ?? [])
        .slice()
        .sort((a, b) => norm(a.GroupName).localeCompare(norm(b.GroupName)))
        .map((g) => {
          const groupName = norm(g.GroupName);

          // payers under this group
          const payerKey = `${cat}||${groupName}`;
          const payerRows = (payersByCatGroup.get(payerKey) ?? [])
            .slice()
            .sort((a, b) => norm(a.PayerName).localeCompare(norm(b.PayerName)));

          const payerNodes: PayerDetailsNode[] = payerRows.map((pr) => {
            const payerName = norm(pr.PayerName);
            const planKey = `${cat}||${groupName}||${payerName}`;
            const planRows = (plansByCatGroupPayer.get(planKey) ?? [])
              .slice()
              .sort((a, b) => norm(a.PlanName).localeCompare(norm(b.PlanName)));

            const planNodes: PayerDetailsNode[] = planRows.map((pl) =>
              mkNode({
                idParts: ['plan', cat, groupName, payerName, norm(pl.PlanName) || 'Unknown'],
                nodeType: 'plan',
                label: norm(pl.PlanName) || 'Unknown',
                category: cat,
                subCategory: groupName,
                payer: payerName,
                plan: norm(pl.PlanName) || 'Unknown',
                totalCharges: Number(pl.TotalCharges ?? 0),
                claims: Number(pl.Claims ?? 0),
                children: [],
              })
            );

            // If plan nodes exist, use payer rollup row as payer totals (it should match)
            return mkNode({
              idParts: ['payer', cat, groupName, payerName],
              nodeType: 'payer',
              label: payerName,
              category: cat,
              subCategory: groupName,
              payer: payerName,
              // LeaseNetwork convenience (your rowClassFn uses category/subCategory anyway)
              networkName: cat === 'LeaseNetwork' ? groupName : undefined,
              totalCharges: Number(pr.TotalCharges ?? 0),
              claims: Number(pr.Claims ?? 0),
              children: planNodes, // empty for Out Network, Government, LeaseNetwork
            });
          });

          return mkNode({
            idParts: ['group', cat, groupName],
            nodeType: 'group',
            label: groupName,
            category: cat,
            subCategory: groupName,
            networkName: cat === 'LeaseNetwork' ? groupName : undefined,
            totalCharges: Number(g.TotalCharges ?? 0),
            claims: Number(g.Claims ?? 0),
            children: payerNodes,
          });
        });

      return mkNode({
        idParts: ['category', cat],
        nodeType: 'group',
        label: cat,
        category: cat,
        totalCharges: Number(catRow.TotalCharges ?? 0),
        claims: Number(catRow.Claims ?? 0),
        children: groups,
      });
    });

  return categoryNodes;
}

  // =========================
  // Non Payment tree builder
  // =========================
 private buildCptNonPaymentTree(resp: CptNonPaymentResponse): NonPaymentNode[] {
  const payerRollup = resp?.payerRollup ?? [];
  const cptRollup = resp?.cptRollup ?? [];
  const lineItems = resp?.lineItems ?? [];

  // Index children for fast joins
  const cptsByPayer = new Map<string, any[]>();
  for (const r of cptRollup) {
    const payer = String(r.PayerName ?? '').trim();
    if (!payer) continue;
    cptsByPayer.set(payer, [...(cptsByPayer.get(payer) ?? []), r]);
  }

  const linesByPayerCpt = new Map<string, any[]>();
  for (const r of lineItems) {
    const payer = String(r.PayerName ?? '').trim();
    const cpt = String(r.ProcedureCode ?? '').trim();
    if (!payer || !cpt) continue;

    const key = `${payer}||${cpt}`;
    linesByPayerCpt.set(key, [...(linesByPayerCpt.get(key) ?? []), r]);
  }

  // Build tree
  return payerRollup.map((p) => {
    const payer = String(p.PayerName ?? '').trim();

    const payerNode: NonPaymentNode = {
      id: this.makeId(['payer', payer]),
      nodeType: 'payer',
      payer,
      totalCharges: Number(p.TotalCharges ?? 0),
      claims: Number(p.ClaimsCount ?? 0),
      children: [],
    };

    const cpts = (cptsByPayer.get(payer) ?? [])
      .slice()
      .sort((a, b) => Number(b.TotalCharges ?? 0) - Number(a.TotalCharges ?? 0));

    payerNode.children = cpts.map((c) => {
      const cptCode = String(c.ProcedureCode ?? '').trim();
      const cptNode: NonPaymentNode = {
        id: this.makeId(['cpt', payer, cptCode]),
        nodeType: 'cpt',
        payer,
        cptCode,
        totalCharges: Number(c.TotalCharges ?? 0),
        claims: Number(c.ClaimsCount ?? 0),
        children: [],
      };

      const key = `${payer}||${cptCode}`;
      const lines = (linesByPayerCpt.get(key) ?? [])
        .slice()
        .sort((a, b) => Number(b.Balance ?? 0) - Number(a.Balance ?? 0));

      cptNode.children = lines.map((li) => {
        const claimId = li.ClaimID;

        return {
          id: this.makeId(['claim', payer, cptCode, claimId]),
          nodeType: 'claim',
          payer,
          cptCode,
          claimId,
          totalCharges: Number(li.TotalCharges ?? 0),
          amountPaid: Number(li.AmountPaid ?? 0),
          balance: Number(li.Balance ?? 0),
          children: [],
        } as NonPaymentNode;
      });

      return cptNode;
    });

    return payerNode;
  });
}


  // =========================
  // Misc UI helper methods (optional)
  // =========================
  isSelected(ctrl: FormControl<string[]>, value: string): boolean {
    return (ctrl.value ?? []).includes(value);
  }

  toggleArrayValue(ctrl: FormControl<string[]>, value: string, checked: boolean): void {
    const current = ctrl.value ?? [];
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter((v) => v !== value);

    ctrl.setValue(next);
    ctrl.markAsDirty();
  }

  clearControl<K extends keyof FiltersForm['controls']>(key: K): void {
    const c = this.filtersForm.controls[key];
    if (c.value instanceof Date || c.value === null) {
      (c as FormControl<Date | null>).setValue(null);
    } else {
      (c as FormControl<string[]>).setValue([]);
    }
    c.markAsDirty();
  }

  clearDateRange(): void {
    this.filtersForm.controls.startDate.setValue(null);
    this.filtersForm.controls.endDate.setValue(null);
    this.filtersForm.controls.startDate.markAsDirty();
    this.filtersForm.controls.endDate.markAsDirty();
  }

  applyFilters(): void {
    const v = this.filtersForm.getRawValue();
    // eslint-disable-next-line no-console
    console.log('Apply filters', v);
  }

  onTrendWindowChange(value: TrendWindow) {
    if (!value) return;
    this.trendWindow$.next(value);
  }

  exportNonPaymentCsv(): void {
    const rows: string[][] = [['Payer', 'CPT Code', 'Claim ID', 'Total Charges', 'Amount Paid', 'Balance', 'Claims']];
    const flattenNode = (node: NonPaymentNode, payer = '', cpt = '') => {
      const p = node.nodeType === 'payer' ? (node.payer ?? '') : payer;
      const c = node.nodeType === 'cpt' ? (node.cptCode ?? '') : cpt;
      if (node.nodeType === 'claim') {
        rows.push([p, c, String(node.claimId ?? ''), String(node.totalCharges ?? ''), String(node.amountPaid ?? ''), String(node.balance ?? ''), String(node.claims ?? '')]);
      }
      (node.children ?? []).forEach(child => flattenNode(child, p, c));
    };
    this.nonPaymentTree.forEach(n => flattenNode(n));
    if (rows.length === 1) rows.push(['No data', '', '', '', '', '', '']);
    this.downloadCsv('payer-non-payment.csv', rows);
  }

  exportPayerDetailsCsv(): void {
    const rows: string[][] = [['Category', 'Group', 'Payer', 'Plan', 'Total Charges', 'Claims']];
    const flattenNode = (node: PayerDetailsNode, category = '', group = '', payer = '') => {
      const cat = node.nodeType === 'group' && !category ? node.label : category;
      const grp = node.nodeType === 'group' && category ? node.label : group;
      const pay = node.nodeType === 'payer' ? node.label : payer;
      if (node.nodeType === 'plan') {
        rows.push([cat, grp, pay, node.label, String(node.totalCharges ?? ''), String(node.claims ?? '')]);
      } else if (node.nodeType === 'payer' && !(node.children?.length)) {
        rows.push([cat, grp, pay, '', String(node.totalCharges ?? ''), String(node.claims ?? '')]);
      }
      (node.children ?? []).forEach(child => flattenNode(child, cat, grp, pay));
    };
    this.payerDetailsTree.forEach(n => flattenNode(n));
    if (rows.length === 1) rows.push(['No data', '', '', '', '', '']);
    this.downloadCsv('payer-details.csv', rows);
  }
}
