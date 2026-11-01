import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, filter, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { MatDialog } from '@angular/material/dialog';
import { InsightflowStore } from '../../../store/insightflow/insightflow.store';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { DashboardLayoutService } from '../../../core/services/dashboard-layout.service';
import { EnterpriseService } from '../../../core/services/enterprise.service';
import { DashboardLayout, DashboardLayoutConfig } from '../../../core/models/dashboard-layout.model';
import {
  DashboardCustomizeDialogComponent,
  CustomizeDialogData,
  CustomizeDialogResult,
} from './dashboard-customize-dialog/dashboard-customize-dialog.component';

type Status   = 'green' | 'yellow' | 'red' | 'error';
type Severity = 'critical' | 'warning' | 'info';
type Priority = 'high' | 'medium' | 'low';

interface ActionItem   { priority: Priority; label: string; link: string; queryParams?: Record<string, string>; product: string; }
interface SectionAlert { severity: Severity; message: string; actions: ActionItem[]; }
interface KpiItem      { key: string; label: string; value: number | null; format: 'number' | 'currency' | 'percent'; }

interface SummarySection {
  slug: string; label: string; status: Status; kpis: KpiItem[]; alerts: SectionAlert[];
  message?: string;
  topPayers?: { payerName: string; denialRate: number; deniedCount: number; totalCount: number }[];
  topReasons?: { reason: string; currentAmount: number; previousAmount: number }[];
}

interface CrossProductInsight {
  severity: Severity; products: string[]; title: string; detail: string; actions: ActionItem[];
}

interface ExecSummaryResponse {
  generatedAt: string;
  overallStatus: Status;
  criticalCount: number;
  warningCount: number;
  okCount: number;
  errorCount?: number;
  sections: Record<string, SummarySection>;
  crossProductInsights: CrossProductInsight[];
  actionQueue: ActionItem[];
}

@Component({
    selector: 'app-executive-summary',
    templateUrl: './executive-summary.component.html',
    styleUrls: ['./executive-summary.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ExecutiveSummaryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  data: ExecSummaryResponse | null = null;
  sections: SummarySection[] = [];
  displayedSections: SummarySection[] = [];
  loading = true;
  error = false;

  narrativeLoading = false;
  narrativeText: string | null = null;
  narrativeError: string | null = null;

  layouts: DashboardLayout[] = [];
  activeLayoutId: number | null = null;
  savingLayout = false;
  layoutError: string | null = null;

  get activeLayout(): DashboardLayout | null {
    return this.layouts.find(l => l.id === this.activeLayoutId) ?? null;
  }

  constructor(
    private cdr: ChangeDetectorRef,
    private router: Router,
    private http: HttpClient,
    private insightflowStore: InsightflowStore,
    private globalFilters: GlobalFiltersStore,
    private dashboardLayoutService: DashboardLayoutService,
    private dialog: MatDialog,
    private enterpriseService: EnterpriseService,
  ) {}

  ngOnInit(): void {
    this.insightflowStore.execSummary$.pipe(takeUntil(this.destroy$)).subscribe(slice => {
      this.loading = slice.loading;
      this.error   = !!slice.error;
      if (slice.data) {
        this.data = slice.data;
        this.sections = Object.values(slice.data.sections || {});
        this.refreshDisplayed();
      }
      this.cdr.markForCheck();
    });

    this.globalFilters.applied$.pipe(takeUntil(this.destroy$)).subscribe(filters => {
      this.insightflowStore.loadExecSummary(filters, true);
    });

    // Super Admin race fix: loadEnterprises() is async; by the time it sets the active
    // enterprise the initial globalFilters emission has already fired (-> 403).
    // Re-fire loadExecSummary whenever the active enterprise transitions to non-null.
    this.enterpriseService.active$.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged((a, b) => a?.id === b?.id),
      filter(ent => ent !== null),
    ).subscribe(() => {
      this.insightflowStore.loadExecSummary(this.globalFilters.value, true);
    });

    this.loadLayouts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  generateNarrative(): void {
    if (this.narrativeLoading) return;
    this.narrativeLoading = true;
    this.narrativeText = null;
    this.narrativeError = null;
    this.cdr.markForCheck();

    const url = `${environment.server.baseUrl}/insightflow/executive-summary/narrative`;
    this.http.get<{ narrative: string }>(url).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.narrativeText = res.narrative;
        this.narrativeLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.narrativeError = 'Unable to generate summary. Please try again.';
        this.narrativeLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadLayouts(): void {
    const cachedId = this.dashboardLayoutService.getCachedActiveId();
    if (cachedId != null) {
      this.activeLayoutId = cachedId;
    }

    this.dashboardLayoutService.getLayouts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.layouts = res.layouts;
        const preferred = res.activeId ?? cachedId;
        this.activeLayoutId = (preferred != null && this.layouts.some(l => l.id === preferred))
          ? preferred
          : null;
        this.refreshDisplayed();
        this.cdr.markForCheck();
      },
      error: () => {
        this.layouts = [];
        this.activeLayoutId = null;
        this.cdr.markForCheck();
      },
    });
  }

  private refreshDisplayed(): void {
    const layout = this.activeLayout;
    this.displayedSections = layout
      ? this.applyConfig(this.sections, layout.config)
      : [...this.sections];
  }

  private applyConfig(sections: SummarySection[], config: DashboardLayoutConfig): SummarySection[] {
    const sMap = new Map(config.sections.map(s => [s.slug, s]));
    return sections
      .filter(sec => (sMap.get(sec.slug)?.visible ?? true))
      .sort((a, b) => (sMap.get(a.slug)?.order ?? 999) - (sMap.get(b.slug)?.order ?? 999))
      .map(sec => {
        const cfg = sMap.get(sec.slug);
        if (!cfg || cfg.kpis.length === 0) return sec;
        const kMap = new Map(cfg.kpis.map(k => [k.key, k]));
        const filteredKpis = sec.kpis
          .filter(kpi => (kMap.get(kpi.key)?.visible ?? true))
          .sort((a, b) => (kMap.get(a.key)?.order ?? 999) - (kMap.get(b.key)?.order ?? 999));
        return { ...sec, kpis: filteredKpis };
      });
  }

  selectLayout(id: number | null): void {
    this.activeLayoutId = id;
    this.refreshDisplayed();
    this.cdr.markForCheck();
    this.dashboardLayoutService.setActiveLayout(id).pipe(takeUntil(this.destroy$)).subscribe();
  }

  openCustomizeDialog(): void {
    const ref = this.dialog.open<DashboardCustomizeDialogComponent, CustomizeDialogData, CustomizeDialogResult>(
      DashboardCustomizeDialogComponent,
      { width: '520px', data: { sections: this.sections, layout: this.activeLayout } },
    );
    ref.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
      if (result) this.saveLayout(result);
    });
  }

  private saveLayout(result: CustomizeDialogResult): void {
    this.savingLayout = true;
    this.layoutError = null;
    this.cdr.markForCheck();

    const body = { name: result.name, config: result.config, isDefault: result.isDefault };

    if (this.activeLayoutId != null) {
      this.updateExistingLayout(this.activeLayoutId, body);
    } else {
      this.createNewLayout(body);
    }
  }

  private updateExistingLayout(id: number, body: { name: string; config: DashboardLayoutConfig; isDefault: boolean }): void {
    this.dashboardLayoutService.updateLayout(id, body).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.layouts = this.layouts.map(l =>
          l.id === id
            ? { ...l, ...body }
            : body.isDefault ? { ...l, isDefault: false } : l,
        );
        this.refreshDisplayed();
        this.savingLayout = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.layoutError = 'Failed to save layout. Please try again.';
        this.savingLayout = false;
        this.cdr.markForCheck();
      },
    });
  }

  private createNewLayout(body: { name: string; config: DashboardLayoutConfig; isDefault: boolean }): void {
    this.dashboardLayoutService.createLayout(body).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const newLayout: DashboardLayout = {
          id: res.id, ...body,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.layouts = [
          ...this.layouts.map(l => body.isDefault ? { ...l, isDefault: false } : l),
          newLayout,
        ];
        this.activeLayoutId = res.id;
        this.dashboardLayoutService.setActiveLayout(res.id).pipe(takeUntil(this.destroy$)).subscribe();
        this.refreshDisplayed();
        this.savingLayout = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.layoutError = 'Failed to create layout. Please try again.';
        this.savingLayout = false;
        this.cdr.markForCheck();
      },
    });
  }

  deleteLayout(layout: DashboardLayout): void {
    this.dashboardLayoutService.deleteLayout(layout.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.layouts = this.layouts.filter(l => l.id !== layout.id);
        if (this.activeLayoutId === layout.id) {
          this.activeLayoutId = null;
          this.refreshDisplayed();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.layoutError = 'Failed to delete layout.';
        this.cdr.markForCheck();
      },
    });
  }

  trackByLayout(_: number, l: DashboardLayout): number { return l.id; }
  trackBySection(_: number, s: SummarySection): string { return s.slug; }
  trackByKpi(_: number, k: KpiItem): string { return k.key; }
  trackByPayer(_: number, p: { payerName: string }): string { return p.payerName; }
  trackByIndex(i: number): number { return i; }

  formatKpi(kpi: KpiItem): string {
    if (kpi.value == null) return '--';
    switch (kpi.format) {
      case 'currency':
        return '$' + kpi.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      case 'percent':
        return (kpi.value * 100).toFixed(1) + '%';
      default:
        return kpi.value.toLocaleString('en-US');
    }
  }

  formatAmount(v: number): string {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  getIcon(slug: string): string {
    const icons: Record<string, string> = {
      'denial-iq': 'gavel',
      'recon-iq':  'account_balance',
      'payer-iq':  'local_hospital',
      'workforce': 'groups',
      'training':  'school',
      'kpi':       'show_chart',
    };
    return icons[slug] || 'insights';
  }

  getColor(slug: string): string {
    const colors: Record<string, string> = {
      'denial-iq': '#ef4444',
      'recon-iq':  '#0ea5e9',
      'payer-iq':  '#f59e0b',
      'workforce': '#8b5cf6',
      'training':  '#22c55e',
      'kpi':       '#6366f1',
    };
    return colors[slug] || '#6b7280';
  }

  severityIcon(s: Severity): string {
    if (s === 'critical') return 'error';
    if (s === 'warning')  return 'warning';
    return 'info';
  }

  severityClass(s: Severity): string {
    if (s === 'critical') return 'sev-critical';
    if (s === 'warning')  return 'sev-warning';
    return 'sev-info';
  }

  statusClass(s: Status): string {
    if (s === 'red')    return 'status-red';
    if (s === 'yellow') return 'status-yellow';
    if (s === 'error')  return 'status-error';
    return 'status-green';
  }

  statusLabel(s: Status): string {
    if (s === 'red')    return 'Critical';
    if (s === 'yellow') return 'Warning';
    if (s === 'error')  return 'Unavailable';
    return 'Healthy';
  }

  overallStatusClass(): string {
    return this.statusClass(this.data?.overallStatus ?? 'green');
  }

  priorityClass(p: Priority): string {
    if (p === 'high')   return 'pri-high';
    if (p === 'medium') return 'pri-medium';
    return 'pri-low';
  }

  overallLabel(): string {
    const s = this.data?.overallStatus;
    if (s === 'red')    return 'Critical';
    if (s === 'yellow') return 'Warning';
    return 'Healthy';
  }

  formatTs(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }

  private readonly kpiTooltips: Record<string, string> = {
    deniedClaims:   'Total claims denied by payers in the past 12 months',
    deniedCharges:  'Total dollar value of denied charges in the past 12 months',
    denialRate:     'Percentage of submitted claims that were denied',
    recoveryRate:   'Percentage of denied charges successfully recovered through appeals',
    openDenials:    'Denied charges not yet recovered or written off',
    atRisk:         'Total revenue currently at risk from unresolved denials',
    totalCharged:   'Total charges submitted to payers in the past 12 months',
    totalCollected: 'Total payments received from payers in the past 12 months',
    collectionRate: 'Net collection rate: payments as a percentage of adjusted charges',
    daysInAR:       'Average number of days claims remain in accounts receivable',
    topPayerConc:   'Percentage of revenue coming from your largest single payer',
    highRiskCount:  'Number of payers with elevated denial rates in the past 6 months',
    totalOpen:      'Total open AR claims across all age buckets',
    over90:         'Claims that have been open for more than 90 days',
    pctAging:       'Proportion of AR aged beyond 90 days',
    specialists:    'Number of active claim specialists currently assigned',
    openQueue:      'Total claims currently in the open work queue',
    avgQueue:       'Average number of open claims per specialist',
    resolved30:     'Claims resolved by specialists in the past 30 days',
    compliance:     'Percentage of staff who have completed required training modules',
    completed:      'Total training modules completed across all staff',
    overdue:        'Training modules past their due date',
    activeUsers:    'Unique users who accessed InsightFlow reports in the past 30 days',
    totalViews:     'Total report page views in the past 30 days',
    adoption:       'Percentage of staff who accessed the platform in the past 30 days',
    products:       'Number of InsightFlow products accessed in the past 30 days',
  };

  getKpiTooltip(key: string): string {
    return this.kpiTooltips[key] ?? '';
  }

  private readonly kpiRoutes: Record<string, string> = {
    deniedClaims:   '/app/denial-iq/claim-queue/ar-specialist',
    deniedCharges:  '/app/denial-iq/claim-queue/ar-specialist',
    denialRate:     '/app/insightflow/view/denials',
    recoveryRate:   '/app/insightflow/view/denials',
    openDenials:    '/app/denial-iq/claim-queue/ar-specialist',
    atRisk:         '/app/payer-iq/underpayments',
    totalCharged:   '/app/recon-iq/finance-summary',
    totalCollected: '/app/recon-iq/finance-summary',
    collectionRate: '/app/recon-iq/finance-summary',
    daysInAR:       '/app/recon-iq/finance-summary',
    topPayerConc:   '/app/payer-iq/dashboard',
    highRiskCount:  '/app/payer-iq/dashboard',
    totalOpen:      '/app/recon-iq/payment-reconciliation',
    over90:         '/app/recon-iq/payment-reconciliation',
    openQueue:      '/app/denial-iq/claim-queue/ar-specialist',
    resolved30:     '/app/denial-iq/claim-queue/ar-specialist',
  };

  getKpiRoute(key: string): string | null {
    return this.kpiRoutes[key] ?? null;
  }

  navigateToKpi(key: string): void {
    const route = this.kpiRoutes[key];
    if (route) {
      this.router.navigateByUrl(route);
    }
  }

  getSectionTooltip(slug: string): string {
    const tips: Record<string, string> = {
      'payer-iq': 'Associated with DenialIQ and PayerIQ',
    };
    return tips[slug] ?? '';
  }
}
