import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ApexAxisChartSeries } from 'ng-apexcharts';
import {
  ReconIqService,
  FinanceSummaryKpis,
  FinanceMonthRow,
  FinanceTrxGroup,
  ReconReportFilterOptions,
} from '../../../core/services/recon-iq.service';

interface WaterfallRow {
  label: string;
  amount: number;
  type: 'positive' | 'negative' | 'result';
  icon: string;
}

@Component({
    selector: 'app-finance-summary',
    templateUrl: './finance-summary.component.html',
    styleUrls: ['./finance-summary.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class FinanceSummaryComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  error = false;

  summary: FinanceSummaryKpis | null = null;
  monthly: FinanceMonthRow[] = [];
  byTrxType: FinanceTrxGroup[] = [];

  selectedMonths = 12;
  selectedLocation = '';
  selectedPayer = '';
  filterOptions: ReconReportFilterOptions = { locations: [], payers: [] };

  readonly monthOptions = [
    { value: 3, label: '3 months' },
    { value: 6, label: '6 months' },
    { value: 12, label: '12 months' },
    { value: 24, label: '24 months' },
  ];

  // Monthly trend chart
  trendCategories: string[] = [];
  trendSeries: ApexAxisChartSeries = [];

  // Payment mix pie chart data
  paymentMixData: { label: string; value: number }[] = [];

  // Waterfall rows for the revenue funnel
  waterfallRows: WaterfallRow[] = [];

  // TrxType table columns
  readonly trxColumns = ['trxType', 'category', 'totalAmount', 'txCount'];

  // Category display helpers
  readonly categoryLabels: Record<string, string> = {
    charge:            'Gross Charge',
    insurance_payment: 'Insurance Payment',
    patient_payment:   'Patient Payment',
    adjustment:        'Contractual Adj.',
    writeoff:          'Transactional Write-offs',
    other:             'Other',
  };

  constructor(
    private readonly svc: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.svc.getReconFilterOptions().subscribe({
      next: opts => { this.filterOptions = opts; this.cdr.markForCheck(); },
    });
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.loading = true;
    this.error = false;
    this.cdr.markForCheck();

    this.svc.getFinanceSummary({ months: this.selectedMonths, location: this.selectedLocation || undefined, payer: this.selectedPayer || undefined })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
      )
      .subscribe({
        next: (res) => {
          this.summary = res.summary;
          this.monthly = res.monthly;
          this.byTrxType = res.byTrxType;
          this.buildCharts();
          this.buildWaterfall();
          this.error = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = true;
          this.cdr.markForCheck();
        },
      });
  }

  onMonthsChange(): void {
    this.loadData();
  }

  get periodLabel(): string   { return this.monthOptions.find(o => o.value === this.selectedMonths)?.label ?? '12 months'; }
  get locationLabel(): string { return this.selectedLocation || 'All Locations'; }
  get payerLabel(): string    { return this.selectedPayer    || 'All Payers'; }

  setMonths(months: number): void { this.selectedMonths = months; this.loadData(); }
  setLocation(loc: string): void  { this.selectedLocation = loc; this.loadData(); }
  setPayer(payer: string): void   { this.selectedPayer    = payer; this.loadData(); }

  // -- Chart builders ---------------------------------------------------------

  private buildCharts(): void {
    this.trendCategories = this.monthly.map(m => m.month);

    this.trendSeries = [
      {
        name: 'Gross Charges',
        type: 'bar',
        data: this.monthly.map(m => Math.round(m.grossCharges)),
      },
      {
        name: 'Insurance Payments',
        type: 'bar',
        data: this.monthly.map(m => Math.round(m.insurancePayments)),
      },
      {
        name: 'Patient Payments',
        type: 'bar',
        data: this.monthly.map(m => Math.round(m.patientPayments)),
      },
      {
        name: 'Contractual Adj.',
        type: 'bar',
        data: this.monthly.map(m => Math.round(m.contractualAdjustments)),
      },
      {
        name: 'Net Collections',
        type: 'line',
        data: this.monthly.map(m => Math.round(m.netCollections)),
      },
    ];

    // Payment mix pie: insurance vs patient
    const s = this.summary!;
    this.paymentMixData = [
      { label: 'Insurance Payments', value: s.insurancePayments },
      { label: 'Patient Payments',   value: s.patientPayments   },
      { label: 'Contractual Adj.',   value: s.contractualAdjustments },
      { label: 'Write-offs',         value: s.writeOffs         },
    ].filter(d => d.value > 0);
  }

  private buildWaterfall(): void {
    if (!this.summary) return;
    const s = this.summary;
    this.waterfallRows = [
      { label: 'Gross Charges',           amount:  s.grossCharges,           type: 'positive', icon: 'receipt_long' },
      { label: 'Contractual Adjustments', amount: -s.contractualAdjustments, type: 'negative', icon: 'remove_circle_outline' },
      { label: 'Write-offs',              amount: -s.writeOffs,              type: 'negative', icon: 'money_off' },
      { label: 'Net Collectable',         amount:  s.grossCharges - s.contractualAdjustments - s.writeOffs, type: 'result', icon: 'calculate' },
      { label: 'Insurance Payments',      amount:  s.insurancePayments,      type: 'positive', icon: 'business' },
      { label: 'Patient Payments',        amount:  s.patientPayments,        type: 'positive', icon: 'person' },
      { label: 'Net Collections',         amount:  s.netCollections,         type: 'result',   icon: 'account_balance_wallet' },
    ];
  }

  // -- Formatters -------------------------------------------------------------

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }

  fmtPct(n: number): string {
    return `${n.toFixed(1)}%`;
  }

  fmtCount(n: number): string {
    return new Intl.NumberFormat('en-US').format(n);
  }

  isEmptySummary(): boolean {
    if (!this.summary) return true;
    const s = this.summary;
    return s.grossCharges === 0 && s.netCollections === 0 && s.insurancePayments === 0 && s.patientPayments === 0;
  }

  netCollectableAmount(): number {
    if (!this.summary) return 0;
    return this.summary.grossCharges - this.summary.contractualAdjustments - this.summary.writeOffs;
  }

  collectionRateClass(rate: number): string {
    if (rate >= 90) return 'rate-green';
    if (rate >= 80) return 'rate-amber';
    return 'rate-red';
  }

  daysInArClass(days: number): string {
    if (days < 30) return 'rate-green';
    if (days <= 50) return 'rate-amber';
    return 'rate-red';
  }

  categoryLabel(cat: string): string {
    return this.categoryLabels[cat] ?? cat;
  }

  trxTypeTotal(): number {
    return this.byTrxType.reduce((s, r) => s + r.totalAmount, 0);
  }

  waterfallPct(amount: number): number {
    if (!this.summary || this.summary.grossCharges === 0) return 0;
    return Math.min((Math.abs(amount) / this.summary.grossCharges) * 100, 100);
  }

  exportCsv(): void {
    if (!this.summary) return;
    const s = this.summary;
    const kpis = [
      ['Gross Charges', s.grossCharges],
      ['Net Collections', s.netCollections],
      ['Insurance Payments', s.insurancePayments],
      ['Patient Payments', s.patientPayments],
      ['Contractual Adjustments', s.contractualAdjustments],
      ['Write-offs', s.writeOffs],
      ['Net Collection Rate (%)', s.netCollectionRate],
      ['Gross Collection Rate (%)', s.grossCollectionRate],
      ['Days in A/R', s.daysInAR],
      ['Open A/R Balance', s.openAR],
    ];
    const kpiRows = kpis.map(([k, v]) => `"${k}","${v}"`).join('\n');
    const trxHeader = '\n\nTransaction Type,Category,Total Amount,Count\n';
    const trxRows = this.byTrxType.map(r => `"${r.trxType}","${r.category}",${r.totalAmount},${r.txCount}`).join('\n');
    const csv = 'KPI,Value\n' + kpiRows + trxHeader + trxRows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `finance-summary-${this.selectedMonths}m.csv`;
    a.click(); URL.revokeObjectURL(url);
  }
}
