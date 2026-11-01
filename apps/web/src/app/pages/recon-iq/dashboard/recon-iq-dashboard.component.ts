import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { RpMixedChartConfig } from '../../../shared/components/mixed-chart/mixed-chart.models';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexMarkers,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  ChartComponent
} from 'ng-apexcharts';
import { NavigationEnd, Route, Router } from '@angular/router';
import { ReconIqEraEobPaymentResponse, ReconIqService } from '../../../core/services/recon-iq.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import {
  ReconIqMatchStatsResponse,
  ReconIqMatchStat,
  ReconIqLocationFilter,
} from '../../../core/models/recon-iq.models';
import { filter, Subject, takeUntil } from 'rxjs';

type LineOpts = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  colors?: string[];
  xaxis: ApexXAxis;
  yaxis: ApexYAxis[];
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  markers: ApexMarkers;
  tooltip: ApexTooltip;
  grid: ApexGrid;
};

type DenialsPeriodKey =
  | 'All time'
  | 'Last 30 days'
  | 'Last 90 days'
  | 'Last 6 months'
  | 'Last 12 months'
  | 'MTD'
  | 'QTD'
  | 'YTD'
  | 'This year';

type DenialsPeriodRange = {
  key: DenialsPeriodKey;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  text: string; // "All Practices . Jan 1, 2026 - Dec 31, 2026"
};

type DashboardKpiCard = {
  key: string;
  title: string;
  value: number;
  route?: string;
  hasChevron?: boolean;
};

type ReconIqKpis = {
  paymentEraMatched: number;
  paymentsWithoutEra: number;
  eraWithoutPayments: number;
  escalatedBankIssues: number;
  fullyReconciledPosted: number;
  lastUpdated: string;
};

@Component({
    selector: 'app-recon-iq-dashboard',
    templateUrl: './recon-iq-dashboard.component.html',
    styleUrls: ['./recon-iq-dashboard.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconIQDashboardComponent implements OnInit, OnDestroy {
  isLoading = false;
  lastUpdatedIso = new Date().toISOString();

  kpis: ReconIqKpis | null = null;
  kpiRoutes: Partial<Record<keyof Omit<ReconIqKpis, 'lastUpdated'>, string>> = {};
  mixedCfg: RpMixedChartConfig | null = null;
  eraEobAsOf: string | null = null;

  // Denial Non Payments
  periodLabel: DenialsPeriodKey = 'Last 12 months';
  denialsPeriodText = '';
  denialsState: 'loading' | 'loaded' | 'empty' | 'error' = 'loading';
  private denialsRange: DenialsPeriodRange = this.buildDenialsRange('Last 12 months');

  lineOpts: Partial<LineOpts> = {
    chart: {
      type: 'line',
      height: 320,
      toolbar: { show: false },
      animations: { enabled: true },
      zoom: { enabled: false },
    },

    colors: [
      '#bb79d3', // Denied Charges ($)
      '#4f43bc', // Non Payments (count)
    ],

    series: [
      { name: 'Denied Charges', data: [] },
      { name: 'Non Payments', data: [] },
    ],

    xaxis: {
      categories: [],
      labels: { rotate: 0 },
      crosshairs: {
        show: true,
        position: 'front',
        stroke: { width: 1, dashArray: 2 },
        fill: { type: 'solid', color: 'transparent' },
      },
      tooltip: { enabled: false },
    },

    yaxis: [
      {
        title: { text: 'Denied Charges ($)' },
        labels: {
          formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
        },
      },
      {
        opposite: true,
        title: { text: 'Non Payments (count)' },
        labels: { formatter: (v: number) => `${Math.round(v)}` },
        decimalsInFloat: 0,
      },
    ],

    stroke: { width: [3, 3], curve: 'smooth' },

    markers: {
      size: 0,
      hover: { size: 5, sizeOffset: 2 },
    },

    legend: {
      position: 'top',
      horizontalAlign: 'center',
      markers: { width: 10, height: 10, radius: 10 },
    },

    dataLabels: { enabled: false },

    tooltip: {
      shared: true,
      intersect: false,
      x: { show: true },
      marker: { show: true },
      y: [
        {
          title: { formatter: () => 'Denied Charges: ' },
          formatter: (v?: number) =>
            (v ?? 0).toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            }),
        },
        {
          title: { formatter: () => 'Non Payments: ' },
          formatter: (v?: number) => `${Math.round(v ?? 0).toLocaleString('en-US')}`,
        },
      ],
    },

    grid: { strokeDashArray: 3 },
  };

  // Payment Sources
  paymentSourcesLabel: DenialsPeriodKey = 'Last 12 months';
  paymentSourcesText = '';
  paymentSourcesState: 'loading' | 'loaded' | 'empty' | 'error' = 'loading';
  private paymentSourcesRange: DenialsPeriodRange = this.buildDenialsRange('Last 12 months');

  showFilters: boolean;
  currentFilters: any;
  filterValue: string;

  @ViewChild('denialsChart') denialsChart?: ChartComponent;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private reconIq: ReconIqService,
    private cdr: ChangeDetectorRef,
    private globalFiltersStore: GlobalFiltersStore,
  ) {}

  ngOnInit(): void {
    // Always initialize from the current global filter value
    const gf = this.globalFiltersStore.value;

    const from = gf?.startDate ? (gf.startDate as Date).toISOString().slice(0, 10) : this.denialsRange.from;
    const to = gf?.endDate ? (gf.endDate as Date).toISOString().slice(0, 10) : this.denialsRange.to;

    const range = { key: this.periodLabel, from, to, text: '' } as DenialsPeriodRange;

    this.denialsRange = range;
    this.denialsPeriodText = this.buildDenialsSubtitle(range);
    this.loadDeniedClaimsAndNonPayments(range);

    this.paymentSourcesRange = range;
    this.paymentSourcesText = this.buildDenialsSubtitle(range);
    this.loadPaymentSources(range);

    this.loadMatchStats();

    // Reload charts when global filters are applied
    this.globalFiltersStore.applied$.pipe(takeUntil(this.destroy$)).subscribe((gf) => {
      if (!gf) return;

      const from = gf.startDate ? (gf.startDate as Date).toISOString().slice(0, 10) : this.denialsRange.from;
      const to = gf.endDate ? (gf.endDate as Date).toISOString().slice(0, 10) : this.denialsRange.to;

      const range = { key: this.periodLabel, from, to, text: '' } as DenialsPeriodRange;

      this.denialsRange = range;
      this.denialsPeriodText = this.buildDenialsSubtitle(range);
      this.loadDeniedClaimsAndNonPayments(range);

      this.paymentSourcesRange = range;
      this.paymentSourcesText = this.buildDenialsSubtitle(range);
      this.loadPaymentSources(range);

      // also reload match stats so KPIs respect global filters
      this.loadMatchStats();
    });
  }

  ngOnDestroy(): void {
    console.log('[ReconIQDashboardComponent] ngOnDestroy');
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * [ok] Convert your GlobalFiltersStore value into names-only filters for ReconIQ endpoints.
   * (No IDs; uses your new global filter model.)
   */
  private getReconIqCommonFilters(from?: string, to?: string): {
    from?: string;
    to?: string;
    payers?: string[];
    providers?: string[];
    location?: ReconIqLocationFilter;
  } {
    const gf = this.globalFiltersStore.value;

    return {
      from,
      to,
      payers: gf?.payers ?? [],
      providers: gf?.providers ?? [],
      // our global filters location shape matches ReconIqLocationFilter (names-only)
      location: gf?.location as ReconIqLocationFilter | undefined,
    };
  }

  private loadMatchStats(): void {
    const gf = this.globalFiltersStore.value;
    const from = gf?.startDate ? (gf.startDate as Date).toISOString().slice(0, 10) : undefined;
    const to = gf?.endDate ? (gf.endDate as Date).toISOString().slice(0, 10) : undefined;

    this.reconIq.getMatchStats(this.getReconIqCommonFilters(from, to)).subscribe({
      next: (res: ReconIqMatchStatsResponse) => {
        const byKey = new Map(res.stats.map(s => [s.key, s]));

        const paymentEraMatched = byKey.get('payment_eob_matched')?.value ?? 0;
        const paymentsWithoutEra = byKey.get('payments_without_eob')?.value ?? 0;
        const eraWithoutPayments = byKey.get('eob_without_payments')?.value ?? 0;
        const escalatedBankIssues = byKey.get('escalated_bank_issues')?.value ?? 0;
        const fullyReconciledPosted = byKey.get('fully_reconciled_posted')?.value ?? 0;

        this.kpis = {
          paymentEraMatched,
          paymentsWithoutEra,
          eraWithoutPayments,
          escalatedBankIssues,
          fullyReconciledPosted,
          lastUpdated: res.asOf,
        };

        this.kpiRoutes = {
          paymentEraMatched: byKey.get('payment_eob_matched')?.route,
          paymentsWithoutEra: byKey.get('payments_without_eob')?.route,
          eraWithoutPayments: byKey.get('eob_without_payments')?.route,
          escalatedBankIssues: byKey.get('escalated_bank_issues')?.route,
          fullyReconciledPosted: byKey.get('fully_reconciled_posted')?.route,
        };

        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('getMatchStats failed', err);
        this.kpis = {
          paymentEraMatched: 0,
          paymentsWithoutEra: 0,
          eraWithoutPayments: 0,
          escalatedBankIssues: 0,
          fullyReconciledPosted: 0,
          lastUpdated: new Date().toISOString(),
        };
        this.cdr.markForCheck();
      },
    });
  }

  toCardValue(v: number): string {
    return v.toLocaleString('en-US');
  }

  private toKpiCard(s: ReconIqMatchStat): DashboardKpiCard {
    if (s.key === 'fully_reconciled_posted') {
      return {
        key: s.key,
        title: s.label,
        value: s.value,
        route: '/app/recon-iq/fully-reconciled-posted',
        hasChevron: true,
      };
    }

    const route = s.route ? `/app/recon-iq${s.route}` : undefined;

    return {
      key: s.key,
      title: s.label,
      value: s.value,
      route,
      hasChevron: false,
    };
  }

  private loadDeniedClaimsAndNonPayments(range: DenialsPeriodRange): void {
    this.denialsState = 'loading';
    this.cdr.markForCheck();

    const common = this.getReconIqCommonFilters(range.from, range.to);

    this.reconIq
      .getDeniedClaimsAndNonPaymentsTrend({
        ...common,
        interval: 'month',
      })
      .subscribe({
        next: (res) => {
          this.lastUpdatedIso = res.asOf ?? new Date().toISOString();
          this.denialsPeriodText = this.buildDenialsSubtitle(range, res.asOf);

          const sorted = [...(res.series ?? [])].sort((a, b) =>
            a.period.localeCompare(b.period)
          );

          if (!sorted.length) {
            this.denialsState = 'empty';
            this.lineOpts = {
              ...this.lineOpts,
              xaxis: { ...(this.lineOpts.xaxis ?? {}), categories: [] },
              series: [
                { name: 'Denied Charges', data: [] },
                { name: 'Non Payments', data: [] },
              ],
            };
            this.cdr.markForCheck();
            return;
          }

          const categories = sorted.map((p) => this.toMonthLabel(p.period));
          const denialsAmount = sorted.map((p) => p.denialsAmount);
          const nonPaymentsCount = sorted.map((p) => p.nonPaymentsCount);

          const series = [
            { name: 'Denied Charges', data: denialsAmount },
            { name: 'Non Payments', data: nonPaymentsCount },
          ];

          this.lineOpts = {
            ...this.lineOpts,
            xaxis: { ...(this.lineOpts.xaxis ?? {}), categories },
            series,
          };

          this.denialsState = 'loaded';

          queueMicrotask(() => {
            this.denialsChart?.updateOptions({ xaxis: { categories } }, false, true);
            this.denialsChart?.updateSeries(series as any, true);
          });

          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('getDeniedClaimsAndNonPaymentsTrend failed', err);
          this.denialsState = 'error';
          this.cdr.markForCheck();
        },
      });
  }

  /** Menu handler */
  setPeriod(label: DenialsPeriodKey) {
    this.applyDenialsPeriod(label);
  }

  /** Single source of truth for label + dates + heading */
  private applyDenialsPeriod(key: DenialsPeriodKey): void {
    this.periodLabel = key;
    this.denialsRange = this.buildDenialsRange(key);

    this.denialsPeriodText = this.buildDenialsSubtitle(this.denialsRange);

    this.loadDeniedClaimsAndNonPayments(this.denialsRange);
    this.cdr.markForCheck();
  }

  private buildDenialsSubtitle(range: DenialsPeriodRange, asOfIso?: string): string {
    const fmtMonYear = (iso: string) => {
      const [y, m] = iso.split('-').map(n => parseInt(n, 10));
      const d = new Date(y, (m ?? 1) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    const updatedIso = asOfIso ?? this.lastUpdatedIso;
    const updated = new Date(updatedIso).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `${fmtMonYear(range.from)} \u2013 ${fmtMonYear(range.to)} \u00B7 Updated ${updated}`;
  }

  /** Builds from/to for each menu option (local time, safe formatting) */
  private buildDenialsRange(key: DenialsPeriodKey): DenialsPeriodRange {
    const today = new Date();

    const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
    const endOfYear = (d: Date) => new Date(d.getFullYear(), 11, 31);

    const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

    const startOfQuarter = (d: Date) => {
      const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
      return new Date(d.getFullYear(), qStartMonth, 1);
    };

    const addMonths = (d: Date, months: number) => new Date(d.getFullYear(), d.getMonth() + months, 1);

    const fmtIso = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const fmtHuman = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let fromDate: Date;
    let toDate: Date;

    switch (key) {
      case 'All time':
        fromDate = new Date(2020, 0, 1);
        toDate = endOfYear(today);
        break;

      case 'Last 30 days':
        fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
        toDate = today;
        break;

      case 'Last 90 days':
        fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 90);
        toDate = today;
        break;

      case 'Last 6 months':
        fromDate = addMonths(startOfMonth(today), -6);
        toDate = endOfMonth(today);
        break;

      case 'Last 12 months': {
        const thisMonthStart = startOfMonth(today);
        fromDate = addMonths(thisMonthStart, -11);
        toDate = endOfMonth(today);
        break;
      }

      case 'MTD':
        fromDate = startOfMonth(today);
        toDate = today;
        break;

      case 'QTD':
        fromDate = startOfQuarter(today);
        toDate = today;
        break;

      case 'YTD':
        fromDate = startOfYear(today);
        toDate = today;
        break;

      case 'This year':
        fromDate = startOfYear(today);
        toDate = endOfYear(today);
        break;
    }

    return {
      key,
      from: fmtIso(fromDate),
      to: fmtIso(toDate),
      text: `All Practices \u00B7 ${fmtHuman(fromDate)} \u2013 ${fmtHuman(toDate)}`,
    };
  }

  private toMonthLabel(period: string): string {
    const [y, m] = period.split('-').map((x) => parseInt(x, 10));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mm = (m >= 1 && m <= 12) ? monthNames[m - 1] : period;
    return `${mm} '${String(y).slice(2)}`;
  }

  setPaymentSourcesPeriod(label: DenialsPeriodKey) {
    this.applyPaymentSourcesPeriod(label);
  }

  private applyPaymentSourcesPeriod(key: DenialsPeriodKey): void {
    this.paymentSourcesLabel = key;
    this.paymentSourcesRange = this.buildDenialsRange(key);

    this.paymentSourcesText = this.buildDenialsSubtitle(this.paymentSourcesRange);

    this.loadPaymentSources(this.paymentSourcesRange);
    this.cdr.markForCheck();
  }

  private loadPaymentSources(range: DenialsPeriodRange): void {
    this.paymentSourcesState = 'loading';
    this.cdr.markForCheck();

    const common = this.getReconIqCommonFilters(range.from, range.to);

    this.reconIq.getEraEobPayment({
      ...common,
      interval: 'month',
    }).subscribe({
      next: (res) => {
        this.lastUpdatedIso = res.asOf ?? this.lastUpdatedIso;
        this.paymentSourcesText = this.buildDenialsSubtitle(range, res.asOf);

        const points = [...(res.series ?? [])].sort((a, b) =>
          a.period.localeCompare(b.period)
        );

        if (points.length) {
          const first = points[0].period;
          const last = points[points.length - 1].period;

          const dataRange: DenialsPeriodRange = {
            key: this.paymentSourcesLabel,
            from: `${first}-01`,
            to: `${last}-01`,
            text: '',
          };

          this.paymentSourcesText = this.buildDenialsSubtitle(dataRange, res.asOf);
        }

        if (!points.length) {
          this.paymentSourcesState = 'empty';
          this.mixedCfg = null;
          this.cdr.markForCheck();
          return;
        }

        const categories = points.map(p => this.toMonthLabel(p.period));

        const era = points.map(p => p.eraEobPaymentAmount);
        const patient = points.map(p => p.patientResponsibilityAmount);
        const adjustments = points.map(p => p.adjustmentsAmount);

        const unmatchedPaymentsNoEob = points.map(p => p.unmatchedPaymentsNoEobCount);
        const unmatchedNoPaymentToEob = points.map(p => p.unmatchedNoPaymentToEobCount);

        const maxLine = Math.max(...unmatchedPaymentsNoEob, ...unmatchedNoPaymentToEob, 0);

        const n = categories.length;

        const columnWidth =
          n <= 1 ? '5%' :
          n === 2 ? '5%' :
          n === 3 ? '5%' :
                    '28%';

        const compact = n < 4;

        const totals = era.map((_, i) => era[i] + patient[i] + adjustments[i]);
        const maxMoney = Math.max(...totals, 0);

        const moneyMax = compact
          ? Math.ceil((maxMoney * 1.12) / 10000) * 10000
          : undefined;

        const lineMax = compact
          ? Math.ceil((maxLine * 1.12) / 1000) * 1000
          : Math.ceil((maxLine * 1.15) / 1000) * 1000;

        this.mixedCfg = {
          categories,
          series: [
            { name: 'Adjustments', type: 'column', data: adjustments },
            { name: 'ERA/EOB Payment', type: 'column', data: era },
            { name: 'Patient Responsibility', type: 'column', data: patient },

            { name: 'Unmatched Payments No EOB/ERA', type: 'line', data: unmatchedPaymentsNoEob },
            { name: 'Unmatched ERA/EOBs to Payment', type: 'line', data: unmatchedNoPaymentToEob },
          ],
          seriesFormats: ['currency', 'currency', 'currency', 'number', 'number'],

          chart: { stacked: true, offsetX: 0 },

          plotOptions: { bar: { borderRadius: 2, columnWidth } },

          grid: {
            padding: compact
              ? { left: 40, right: 40, top: 8, bottom: 0 }
              : { left: 16, right: 16, top: 8, bottom: 0 },
          },

          fill: { opacity: [0.7, 0.7, 0.7, 1, 1] },

          dataLabels: compact ? {
            enabled: true,
            enabledOnSeries: [3, 4],
            formatter: (val: number) => (val >= 1000 ? `${(val/1000).toFixed(1)}k` : `${val}`),
            offsetY: -6,
            background: { enabled: false },
          } : { enabled: false },

          stroke: { width: compact ? [0,0,0,3,3] : [0,0,0,3,3] },

          markers: { size: [0,0,0,4,4], hover: { size: 6 } },

          yAxis: [
            {
              title: { text: 'Payment Amounts ($)' },
              min: 0,
              max: moneyMax,
              labels: { formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` },
            },
            {
              opposite: true,
              title: { text: 'Unmatched (count)' },
              min: 0,
              max: lineMax,
              tickAmount: compact ? 4 : 6,
              labels: { formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`) },
            },
          ],
        } satisfies RpMixedChartConfig;

        this.paymentSourcesState = 'loaded';
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('getEraEobPayment failed', err);
        this.paymentSourcesState = 'error';
        this.mixedCfg = null;
        this.cdr.markForCheck();
      },
    });
  }

  private buildMixedCfgFromEraEob(res: ReconIqEraEobPaymentResponse): RpMixedChartConfig {
    const sorted = [...res.series].sort((a, b) => a.period.localeCompare(b.period));

    const categories = sorted.map(p => this.toMonthLabel(p.period));

    const era = sorted.map(p => p.eraEobPaymentAmount);
    const patient = sorted.map(p => p.patientResponsibilityAmount);
    const adjustments = sorted.map(p => p.adjustmentsAmount);

    const unmatchedPaymentsNoEob = sorted.map(p => p.unmatchedPaymentsNoEobCount);
    const unmatchedNoPaymentToEob = sorted.map(p => p.unmatchedNoPaymentToEobCount);

    const maxLineValue = Math.max(...unmatchedPaymentsNoEob, ...unmatchedNoPaymentToEob);
    const paddedMax = Math.ceil((maxLineValue * 1.15) / 1000) * 1000;

    return {
      categories,

      series: [
        { name: 'ERA/EOB Payment', type: 'column', data: era },
        { name: 'Patient Responsibility', type: 'column', data: patient },
        { name: 'Adjustments', type: 'column', data: adjustments },

        { name: 'Unmatched Payments No EOB/ERA', type: 'line', data: unmatchedPaymentsNoEob },
        { name: 'Unmatched No Payment to EOB/ERA', type: 'line', data: unmatchedNoPaymentToEob },
      ],

      seriesFormats: [
        'currency',
        'currency',
        'currency',
        'number',
        'number',
      ],

      chart: { stacked: true },

      plotOptions: {
        bar: { horizontal: false, columnWidth: '28%' },
      },

      yAxis: [
        {
          title: { text: 'ERA / EOB Amounts' },
          labels: {
            formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
          },
        },
        {
          opposite: true,
          title: { text: 'Unmatched Count' },
          min: 0,
          max: paddedMax,
          tickAmount: 6,
          labels: {
            formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`),
          },
        },
      ] as ApexYAxis[],
    } satisfies RpMixedChartConfig;
  }

  onPostedCardClick() {
    this.router.navigate(['/app/recon-iq/fully-reconciled-posted']).then(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  onNeedsMatching() {
    this.router.navigate(['/app/recon-iq/matching']).then(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  onNeedsReconciliation() {
    this.router.navigate(['/app/recon-iq/payment-reconciliation']).then(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
