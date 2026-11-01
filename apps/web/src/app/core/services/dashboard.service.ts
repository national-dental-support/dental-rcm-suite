import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, forkJoin, map, Observable, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Filters,
  ClaimValueByStatusDto,
  ClaimAmountsByPracticeDto,
  CollectionAdjustmentTrendDto,
  ClaimAmountsByPayerDto,
  ClaimValuesByTypeDto,
  RcmLookups
} from '../models/rcm.models';
import { KpiCard, StatsCard, UserRole } from '../models/dashboard.model';

export interface ManagerArLocationRow {
  location: string;
  patientCollections: number;
  insuranceCollections: number;
  arBalance: number;
}

export interface ManagerStaffRow {
  staffId: number;
  name: string;
  netCollectionPct: number | null;
  recoveryPerDay: number;
  avgTimePerClaimMinutes: number;
  claimsPerDay: number;
  claimsInQueueToday: number;
  firstTouchRate: number | null;
  reworkRate: number | null;
  escalationCount: number;
  avgDaysToResolve: number | null;
}

// (optional, for future charts)
export interface DonutSlice {
  label: string;
  value: number;
}

export interface RevenueTrendPoint {
  label: string;    // month name
  charges: number;
  payments: number;
  adjustments: number;
}

export interface CapacityPlanningData {
  backlog: {
    totalOpen: number;
    unassigned: number;
    totalValue: number;
    avgAgingDays: number;
    agingBuckets: { current: number; urgent: number; critical: number; severe: number };
  };
  velocity: {
    teamClaimsPerDay: number;
    avgPerSpecialist: number;
    avgMinutesPerClaim: number;
    avgDaysToResolve: number;
    claimsCompleted30d: number;
  };
  staffing: {
    activeSpecialists: number;
    staff: {
      staffId: number;
      name: string;
      role: string;
      queueSize: number;
      completed30d: number;
      daysWorked: number;
      claimsPerDay: number;
    }[];
  };
  forecast: {
    daysToCloseBacklog: number;
    targetDays: number;
    staffNeededForTarget: number;
    overtimeNeededPct: number;
    additionalHiresNeeded: number;
    neededClaimsPerDay: number;
  };
  weeklyTrend: { yr: number; wk: number; completed: number; staffWorking: number }[];
}

interface RevenueTrendsRow {
  PeriodStart: string | null;   // date string from SQL
  PeriodEnd: string | null;
  PeriodLabel: string | null;   // '2024-11' or '2024'
  Charges: number;
  Payments: number;
  Adjustments: number;
}

interface RevenueTrendsResponse {
  message: string;
  data: RevenueTrendsRow[] | null;
}

interface YesterdaySummaryPayload {
  reportDate: string;        // e.g. "2025-11-30"
  charges: number;
  postedPayments: number;
  adjustments: number;
  netCollectionsPct: number | null;
  escalationCount24h?: number;
}

interface YesterdaySummaryResponse {
  message: string;
  data: YesterdaySummaryPayload | null;
}

interface ArMixPayload {
  asOfDate: string;            // date
  totalAR: number;
  insuranceAR: number;
  patientAR: number;
  insurancePctOfTotal: number | null;
  patientPctOfTotal: number | null;
  priorTotalAR: number | null;
  pctChangeLast30Days: number | null;
}

interface ArMixResponse {
  message: string;
  data: ArMixPayload | null;
}

// A small UI model for the donut + subtitle
export interface ArMixUiModel {
  slices: DonutSlice[];          // percent values
  asOfDate: string | null;
  pctChangeLast30Days: number | null;
  totalAR: number; 
  insuranceAR: number;
  patientAR: number;
}

interface PaymentBreakdownRow {
  CurrentPeriodStart: string | null;
  CurrentPeriodEnd: string | null;
  Charges: number;
  TotalPayments: number;
  InsurancePayments: number;
  PatientPayments: number;
  Adjustments: number;
  RemainingBalance: number;
  PriorTotalPayments: number | null;
  PctChangeLast30Days: number | null;
}

interface PaymentBreakdownResponse {
  message: string;
  data: PaymentBreakdownRow[] | null; // controller returns recordset array
}

export interface PaymentBreakdownUiModel {
  slices: DonutSlice[];      // percentages for the donut
  amounts: number[];         // raw amounts aligned with slices
  totalPayments: number;
  pctChangeLast30Days: number | null;
}

export interface StaffPerformanceRow {
  staffId: number;
  staffName: string;
  netCollectionPct: number | null;
  recoveryPerDay: number;
  avgMinutesPerClaim: number;
  claimsPerDay: number;
  claimsInQueueToday: number;
}

export interface ProficiencyRow {
  carcCode: string;
  carcDescription: string | null;
  myClaimCount: number;
  myAvgMinutes: number;
  teamAvgMinutes: number;
  diffFromTeamMinutes: number;
  diffFromTeamPct: number | null;
}

export interface PerformanceTrendPoint {
  weekLabel: string;
  hoursWorked: number;
  claimsDone: number;
  revenue: number;
  roi: number;
  teamAvgClaims: number;
  teamAvgRoi: number;
}

export interface ResolutionMetricsData {
  resolutionRate: number | null;
  firstTouchRate: number | null;
  avgDaysToResolve: number | null;
  reworkRate: number | null;
  teamResolutionRate: number | null;
  teamFirstTouchRate: number | null;
  teamAvgDaysToResolve: number | null;
  teamReworkRate: number | null;
}

export interface PeerRankingData {
  claimsPercentile: number;
  revenuePercentile: number;
  roiPercentile: number;
  speedPercentile: number;
  totalSpecialists: number;
}

export interface TrainingMatrixCell {
  claimCount: number;
  staffAvgMinutes: number;
  teamAvgMinutes: number;
  diffMinutes: number;
  rating: 'strong' | 'average' | 'below-average' | 'needs-training';
}

export interface TrainingMatrixStaff {
  staffId: number;
  staffName: string;
  codes: Record<string, TrainingMatrixCell>;
}

export interface TrainingMatrixData {
  denialCodes: string[];
  staff: TrainingMatrixStaff[];
}

const ROLE_PREF_KEY = 'diq-preferred-role';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  // Role preference - persisted to localStorage so admins keep their choice
  private readonly _savedRole = localStorage.getItem(ROLE_PREF_KEY) as UserRole | null;
  private roleSubject = new BehaviorSubject<UserRole>(
    this._savedRole === UserRole.Manager ? UserRole.Manager : UserRole.ARSpecialist,
  );

  private readonly managerDashboardBaseUrl =
      `${environment.server.baseUrl}/denial-iq/manager-view/daily-dashboard`;
  private readonly specialistDashboardBaseUrl =
      `${environment.server.baseUrl}/denial-iq/specialist-view/daily-dashboard`;
  private perfSummary$: Observable<any> | null = null;
  private perfSummaryPeriod: string | null = null;

  constructor(private http: HttpClient) {}

  getCurrentUserRole(): Observable<UserRole> {
    return this.roleSubject.asObservable();
  }

  /** Set an explicit role preference and persist it. */
  setRolePreference(role: UserRole): void {
    localStorage.setItem(ROLE_PREF_KEY, role);
    this.roleSubject.next(role);
  }

  //  Called by the hidden logo button (kept for backwards compat)
  toggleDemoRole(): void {
    const next = this.roleSubject.value === UserRole.Manager
      ? UserRole.ARSpecialist
      : UserRole.Manager;
    this.setRolePreference(next);
  }



   getManagerYesterdayStats(): Observable<StatsCard[]> {
    return this.http
      .get<YesterdaySummaryResponse>(
        `${this.managerDashboardBaseUrl}/yesterday-summary`
      )
      .pipe(
        map((res) => {
          const payload = res.data;

          // If API returned no data, fall back to zeros
          if (!payload) {
            return [
              { label: 'Charges', value: '$0.00' },
              { label: 'Posted Payments', value: '$0.00' },
              { label: 'Adjustments', value: '$0.00' },
              { label: 'Net Collections %', value: '\u2014' },
            ] as StatsCard[];
          }

          const formatCurrency = (val: number) =>
            `$${val.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;

          const formatPercent = (val: number | null) =>
            val === null ? '\u2014' : `${val.toFixed(0)}%`;

          const cards: StatsCard[] = [
            {
              label: 'Charges',
              value: formatCurrency(payload.charges),
              route: '/app/denial-iq/claim-queue/all',
            },
            {
              label: 'Posted Payments',
              value: formatCurrency(payload.postedPayments),
            },
            {
              label: 'Adjustments',
              value: formatCurrency(payload.adjustments),
            },
            {
              label: 'Net Collections %',
              value: formatPercent(payload.netCollectionsPct),
            },
            {
              label: 'Escalated (24h)',
              value: String(payload.escalationCount24h ?? 0),
              route: '/app/denial-iq/claim-queue/manager',
              queryParams: { tab: 'escalated' },
            },
          ];

          return cards;
        }),
        // On error: honest empty (no fabricated data) so the UI shows an empty state.
        catchError((err) => {
          console.error('[DashboardService] getManagerYesterdayStats error', err);
          return of([] as StatsCard[]);
        })
      );
  }

  private getPerformanceData(period = '1w'): Observable<any> {
    if (!this.perfSummary$ || this.perfSummaryPeriod !== period) {
      this.perfSummaryPeriod = period;
      this.perfSummary$ = this.http
        .get<{ data: any }>(`${this.specialistDashboardBaseUrl}/my-performance-summary`, {
          params: { period },
        })
        .pipe(
          map(res => res.data),
          shareReplay(1),
          catchError(() => of(null)),
        );
    }
    return this.perfSummary$;
  }

  getArSpecialistPerformanceSummary(period = '1w'): Observable<any> {
    return this.getPerformanceData(period).pipe(
      // Return exactly what the API provides (including honest zeros); only substitute an
      // empty/zeroed shape when there is NO data, so the UI never shows fabricated numbers.
      map(d => d || this.emptyPerfSummary()),
      catchError(() => of(this.emptyPerfSummary())),
    );
  }

  private emptyPerfSummary() {
    return {
      queueToday: {
        claimsInQueue: 0, urgentClaims: 0, queueValue: 0,
        dailyQuota: 0, daysToClear: 0, avgMinutesPerClaim: 0,
        estimatedHoursToday: 0,
      },
      lastPeriod: {
        label: '', startDate: null, endDate: null,
        hoursWorked: 0, workDays: 0, avgHoursPerDay: 0,
        claimsCompleted: 0, avgClaimsPerDay: 0,
        revenueRecovered: 0, roi: 0,
        priorHoursWorked: 0, priorClaims: 0, priorRevenue: 0,
        hoursChange: null, claimsChangePct: null, revenueChangePct: null,
      },
      kpiTarget: 0, industryBenchmark: 0,
    };
  }

  getArSpecialistKpi(period = '1w'): Observable<KpiCard[]> {
    const fmtMoney = (v: number) => v >= 1000
      ? `$${(v / 1000).toFixed(1)}K`
      : `$${Math.round(v).toLocaleString('en-US')}`;

    const changeStr = (val: number | null, unit: string, priorLabel: string): string => {
      if (val == null) return ' ';
      const dir = val >= 0 ? '\u2191' : '\u2193';
      return `${dir} ${Math.abs(Math.round(val))}${unit} from ${priorLabel}`;
    };

    return this.getPerformanceData(period).pipe(
      map(d => {
        if (!d?.lastPeriod) return [] as KpiCard[];

        const lp = d.lastPeriod;
        const label = lp.label || 'Last period';
        const priorLabel = 'prior period';

        return [
          {
            label: 'Avg Hours / Day',
            value: (lp.avgHoursPerDay ?? 0).toFixed(1),
            subLabel: `${lp.hoursWorked ?? 0}h total over ${lp.workDays ?? 0} days`,
            changeLabel: changeStr(lp.hoursChange, 'h', priorLabel),
            changeDirection: (lp.hoursChange ?? 0) >= 0 ? 'up' : 'down',
          },
          {
            label: 'Claims Completed',
            value: String(lp.claimsCompleted ?? 0),
            subLabel: `${(lp.avgClaimsPerDay ?? 0).toFixed(1)} avg/day \u00B7 ${label}`,
            changeLabel: changeStr(lp.claimsChangePct, '%', priorLabel),
            changeDirection: (lp.claimsChangePct ?? 0) >= 0 ? 'up' : 'down',
          },
          {
            label: 'Revenue Recovered',
            value: fmtMoney(lp.revenueRecovered ?? 0),
            subLabel: label,
            changeLabel: changeStr(lp.revenueChangePct, '%', priorLabel),
            changeDirection: (lp.revenueChangePct ?? 0) >= 0 ? 'up' : 'down',
          },
          {
            label: 'ROI',
            value: `$${Math.round(lp.roi ?? 0)}/hr`,
            subLabel: `${label} \u00B7 ${lp.workDays ?? 0} work days`,
            changeLabel: ' ',
            changeDirection: 'neutral',
          },
        ] as KpiCard[];
      }),
      catchError(() => of([] as KpiCard[])),
    );
  }

  getArSpecialistProficiency(): Observable<ProficiencyRow[]> {
    return this.http
      .get<{ data: any[] }>(`${this.specialistDashboardBaseUrl}/analyst-proficiency`)
      .pipe(
        map(res => {
          const rows = (res.data || []).map((r: any) => ({
            carcCode: r.CARCCode,
            carcDescription: r.CARCDescription ?? null,
            myClaimCount: r.MyClaimCount,
            myAvgMinutes: Number(r.MyAvgMinutes),
            teamAvgMinutes: Number(r.TeamAvgMinutes),
            diffFromTeamMinutes: Number(r.DiffFromTeamMinutes),
            diffFromTeamPct: r.DiffFromTeamPct != null ? Number(r.DiffFromTeamPct) : null,
          }));
          return rows;
        }),
        catchError(() => of([] as ProficiencyRow[])),
      );
  }

getAdminTodayStats(): Observable<StatsCard[]> {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;
    const allClaims$ = this.http.get<{ data: any[]; totalCount: number; criticalCount: number }>(`${queueBase}/all-claims?page=0&pageSize=500`);
    const unassigned$ = this.http.get<{ data: any[]; totalCount: number }>(`${queueBase}/unassigned?page=0&pageSize=500`);

    const fmt = (v: number) => v >= 1000
      ? `$${(v / 1000).toFixed(1)}K`
      : `$${Math.round(v).toLocaleString('en-US')}`;

    return forkJoin([allClaims$, unassigned$]).pipe(
      map(([acRes, uaRes]) => {
        const allRows = acRes.data ?? [];
        const totalCount = acRes.totalCount ?? allRows.length;
        const totalValue = allRows.reduce((s: number, c: any) => s + (Number(c.InsuranceBalance) || 0), 0);

        const urgentRows = allRows.filter((c: any) =>
          c.SlaStatus === 'OVERDUE' || c.SlaStatus === 'URGENT' || c.AgingDays > 45
        );
        const urgentCount = acRes.criticalCount ?? urgentRows.length;
        const urgentValue = urgentRows.reduce((s: number, c: any) => s + (Number(c.InsuranceBalance) || 0), 0);

        const uaCount = uaRes.totalCount ?? (uaRes.data ?? []).length;
        const uaValue = (uaRes.data ?? []).reduce((s: number, c: any) => s + (Number(c.InsuranceBalance) || 0), 0);

        return [
          {
            label: 'All Assigned Claims', value: totalCount.toString(),
            description: fmt(totalValue),
            route: '/app/denial-iq/claim-queue/ar-specialist',
            queryParams: { tab: 'all' },
          },
          {
            label: 'Urgent Claims', value: urgentCount.toString(),
            description: fmt(urgentValue) + ' at risk',
            highlight: 'danger' as const,
            route: '/app/denial-iq/claim-queue/ar-specialist',
          },
          {
            label: 'Unassigned Claims', value: uaCount.toString(),
            description: fmt(uaValue) + ' unassigned',
            highlight: 'warning' as const,
            route: '/app/denial-iq/claim-queue/ar-specialist',
            queryParams: { tab: 'unassigned' },
          },
          {
            label: 'Recoverable Revenue', value: fmt(totalValue),
            route: '/app/denial-iq/claim-queue/ar-specialist',
          },
        ] as StatsCard[];
      }),
      catchError(() => of([
        { label: 'All Assigned Claims', value: '\u2014' },
        { label: 'Urgent Claims', value: '0', highlight: 'danger' as const },
        { label: 'Unassigned Claims', value: '0', highlight: 'warning' as const },
        { label: 'Recoverable Revenue', value: '$0' },
      ] as StatsCard[])),
    );
  }

  getArSpecialistTodayStats(): Observable<StatsCard[]> {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;
    // Request a large page so urgent-claim filtering sees all rows; use totalCount for display
    const myQueue$ = this.http.get<{ data: any[]; totalCount: number }>(`${queueBase}/my-queue?page=0&pageSize=500`);
    const unassigned$ = this.http.get<{ data: any[]; totalCount: number }>(`${queueBase}/unassigned?page=0&pageSize=500`);

    const fmt = (v: number) => v >= 1000
      ? `$${(v / 1000).toFixed(1)}K`
      : `$${Math.round(v).toLocaleString('en-US')}`;

    return forkJoin([myQueue$, unassigned$]).pipe(
      map(([mqRes, uaRes]) => {
        const myClaims = mqRes.data ?? [];
        const unassignedClaims = uaRes.data ?? [];

        const myCount = mqRes.totalCount ?? myClaims.length;
        const myTotal = myClaims.reduce((s: number, c: any) => s + (Number(c.InsuranceBalance) || 0), 0);

        const urgentClaims = myClaims.filter((c: any) =>
          c.sla_status === 'OVERDUE' || c.sla_status === 'URGENT' ||
          c.SlaStatus === 'OVERDUE' || c.SlaStatus === 'URGENT' ||
          c.AgingDays > 45
        );
        const urgentCount = urgentClaims.length;
        const urgentTotal = urgentClaims.reduce((s: number, c: any) => s + (Number(c.InsuranceBalance) || 0), 0);

        const uaCount = uaRes.totalCount ?? unassignedClaims.length;
        const uaTotal = unassignedClaims.reduce((s: number, c: any) => s + (Number(c.InsuranceBalance) || 0), 0);

        return [
          {
            label: 'Claims in My Queue', value: myCount.toString(),
            description: fmt(myTotal),
            route: '/app/denial-iq/claim-queue/ar-specialist',
          },
          {
            label: 'Urgent Claims', value: urgentCount.toString(),
            description: fmt(urgentTotal) + ' at risk',
            highlight: 'danger' as const,
            route: '/app/denial-iq/claim-queue/ar-specialist',
          },
          {
            label: 'Unassigned Claims', value: uaCount.toString(),
            description: fmt(uaTotal) + ' unassigned',
            highlight: 'warning' as const,
            route: '/app/denial-iq/claim-queue/ar-specialist',
            queryParams: { tab: 'unassigned' },
          },
          {
            label: 'Recoverable Revenue', value: fmt(myTotal),
            route: '/app/denial-iq/claim-queue/ar-specialist',
          },
        ] as StatsCard[];
      }),
      catchError(() => of([
        { label: 'Claims in My Queue', value: '\u2014' },
        { label: 'Urgent Claims', value: '0', highlight: 'danger' as const },
        { label: 'Unassigned Claims', value: '0', highlight: 'warning' as const },
        { label: 'Recoverable Revenue', value: '$0' },
      ] as StatsCard[])),
    );
  }

  // getManagerStaffPerformance(): Observable<ManagerStaffRow[]> {
  //   return of([
  //     {
  //       name: 'Jason Ballesteros - Gen & Ortho',
  //       netCollectionPct: 0.75,
  //       recoveryPerDay: 19602.65,
  //       avgTimePerClaimMinutes: 17,
  //       claimsPerDay: 15,
  //       claimsInQueueToday: 145,
  //     },
  //     {
  //       name: 'Julia Rhee - OMS & Endo',
  //       netCollectionPct: 0.80,
  //       recoveryPerDay: 16605.16,
  //       avgTimePerClaimMinutes: 14,
  //       claimsPerDay: 22,
  //       claimsInQueueToday: 61,
  //     },
  //     {
  //       name: 'Danny McMullen - OMS & Endo',
  //       netCollectionPct: 0.82,
  //       recoveryPerDay: 17727.75,
  //       avgTimePerClaimMinutes: 10,
  //       claimsPerDay: 20,
  //       claimsInQueueToday: 92,
  //     },
  //     {
  //       name: 'Lynn Rosner - Gen & Ortho',
  //       netCollectionPct: 0.84,
  //       recoveryPerDay: 18123.23,
  //       avgTimePerClaimMinutes: 8,
  //       claimsPerDay: 30,
  //       claimsInQueueToday: 132,
  //     },
  //     {
  //       name: 'Leslie Moore - Works OMS',
  //       netCollectionPct: 0.90,
  //       recoveryPerDay: 19394.70,
  //       avgTimePerClaimMinutes: 8,
  //       claimsPerDay: 42,
  //       claimsInQueueToday: 125,
  //     },
  //   ]);
  // }

  getManagerArByLocation(): Observable<ManagerArLocationRow[]> {
    return this.http
      .get<{ message: string; data: any[] }>(`${this.managerDashboardBaseUrl}/ar-by-location`)
      .pipe(
        map((res) => (res.data || []).map((row): ManagerArLocationRow => ({
          location: row.Location ?? '',
          patientCollections: row.PatientCollections ?? 0,
          insuranceCollections: row.InsuranceCollections ?? 0,
          arBalance: row.ARBalance ?? 0,
        })))
      );
  }

  getManagerArMix(): Observable<ArMixUiModel | null> {
  return this.http
    .get<ArMixResponse>(`${this.managerDashboardBaseUrl}/ar-mix`)
    .pipe(
      map((res) => {
        const data = res.data;
        if (!data) {
          return null;
        }

        const insurancePct = data.insurancePctOfTotal ?? 0;
        const patientPct = data.patientPctOfTotal ?? 0;

        const slices: DonutSlice[] = [
          { label: 'Insurance AR', value: insurancePct },
          { label: 'Patient AR', value: patientPct },
        ];

        return {
          slices,
          asOfDate: data.asOfDate,
          pctChangeLast30Days: data.pctChangeLast30Days,
          totalAR: data.totalAR ?? 0,
          insuranceAR: data.insuranceAR ?? 0,
          patientAR: data.patientAR ?? 0,
        } as ArMixUiModel;
      }),
      catchError((err) => {
        console.error('[DashboardService] getManagerArMix error', err);
        return of(null);  // honest: no fabricated AR mix
      })
    );
}

  getManagerPaymentBreakdown(): Observable<PaymentBreakdownUiModel | null> {
  const url = `${this.managerDashboardBaseUrl}/payment-breakdown-pie`;

  return this.http.get<PaymentBreakdownResponse>(url).pipe(
    map((res) => {
      const rows = res.data;

      if (!rows || rows.length === 0) {
        return null;
      }

      const row = rows[0];

      //  Normalize raw values to numbers
      let insurance = Number(row.InsurancePayments ?? 0);
      let patient = Number(row.PatientPayments ?? 0);
      let adjustments = Number(row.Adjustments ?? 0);
      let remaining = Number(row.RemainingBalance ?? 0);

      //  For the donut, clamp negatives to 0
      if (insurance < 0) insurance = 0;
      if (patient < 0) patient = 0;
      if (adjustments < 0) adjustments = 0;
      if (remaining < 0) remaining = 0;

      const amounts = [insurance, patient, adjustments, remaining];

      // Sum only the clamped amounts
      const sum = amounts.reduce((acc, v) => acc + v, 0);

      //  If everything is zero or negative, show a 0-donut but keep pct change
      if (sum <= 0) {
        return {
          slices: [
            { label: 'Insurance Payments', value: 0 },
            { label: 'Patient Payments', value: 0 },
            { label: 'Adjustments', value: 0 },
            { label: 'Remaining Balance', value: 0 },
          ],
          amounts,
          totalPayments: Number(row.TotalPayments ?? 0),
          pctChangeLast30Days: row.PctChangeLast30Days ?? null,
        } as PaymentBreakdownUiModel;
      }

      const pct = (v: number) => (v / sum) * 100;

      const slices: DonutSlice[] = [
        { label: 'Insurance Payments', value: pct(insurance) },
        { label: 'Patient Payments', value: pct(patient) },
        { label: 'Adjustments', value: pct(adjustments) },
        { label: 'Remaining Balance', value: pct(remaining) },
      ];

      return {
        slices,
        amounts,
        //  Header uses the real total from SQL, not the "sum" of slices
        totalPayments: Number(row.TotalPayments ?? 0),
        pctChangeLast30Days: row.PctChangeLast30Days ?? null,
      } as PaymentBreakdownUiModel;
    }),
    catchError((err) => {
      console.error('[DashboardService] getManagerPaymentBreakdown error', err);
      // Honest empty: zeroed donut, no fabricated amounts.
      return of({
        slices: [
          { label: 'Insurance Payments', value: 0 },
          { label: 'Patient Payments', value: 0 },
          { label: 'Adjustments', value: 0 },
          { label: 'Remaining Balance', value: 0 },
        ],
        amounts: [0, 0, 0, 0],
        totalPayments: 0,
        pctChangeLast30Days: null,
      } as PaymentBreakdownUiModel);
    })
  );
}


 getManagerRevenueTrends(range: 'MoM' | 'YTD' | 'MTD' | 'DoD' = 'MoM'): Observable<RevenueTrendPoint[]> {
  const url = `${this.managerDashboardBaseUrl}/revenue-trends?range=${range}`;

  return this.http.get<{ message: string; data: RevenueTrendsRow[] | null }>(url)
    .pipe(
      map(res => {
        const rows = res.data?.slice(0, 5) ?? [];

        return rows.map(row => {
          const d = row.PeriodStart ? new Date(row.PeriodStart) : null;
          const label = d
            ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : (row.PeriodLabel ?? '');

          return {
            label,
            charges: Number(row.Charges ?? 0),
            payments: Number(row.Payments ?? 0),
            adjustments: Number(row.Adjustments ?? 0),
          } as RevenueTrendPoint;
        });
      }),
      catchError(err => {
        console.error('[DashboardService] getManagerRevenueTrends error', err);
        return of([]);  // honest empty
      })
    );
}

getManagerStaffPerformance(): Observable<ManagerStaffRow[]> {
  const url = `${this.managerDashboardBaseUrl}/staff-performance`;

  return this.http
    .get<{ message: string; data: any[] | null }>(url)
    .pipe(
      map((res) => {
        const rows = res.data ?? [];

        const mapped = rows.map(
          (row) =>
            ({
              staffId: Number(row.StaffID ?? 0),
              name: row.StaffName ?? `Staff ${row.StaffID}`,
              netCollectionPct:
                row.NetCollectionPct === null || row.NetCollectionPct === undefined
                  ? null
                  : Number(row.NetCollectionPct),
              recoveryPerDay: Number(row.RecoveryPerDay ?? 0),
              avgTimePerClaimMinutes: Number(row.AvgMinutesPerClaim ?? 0),
              claimsPerDay: Number(row.ClaimsPerDay ?? 0),
              claimsInQueueToday: Number(row.ClaimsInQueueToday ?? 0),
              firstTouchRate: row.FirstTouchRate != null ? Number(row.FirstTouchRate) : null,
              reworkRate: row.ReworkRate != null ? Number(row.ReworkRate) : null,
              escalationCount: Number(row.EscalationCount ?? 0),
              avgDaysToResolve: row.AvgDaysToResolve != null ? Number(row.AvgDaysToResolve) : null,
            } as ManagerStaffRow)
        );

        return mapped;
      }),
      catchError((err) => {
        console.error('[DashboardService] getManagerStaffPerformance error', err);
        return of([] as ManagerStaffRow[]);
      })
    );
}

// -- NEW: Performance Trends (12-week chart) ----------------------------------
getPerformanceTrends(weeks = 12): Observable<PerformanceTrendPoint[]> {
  return this.http
    .get<{ data: any[] }>(`${this.specialistDashboardBaseUrl}/performance-trends`, {
      params: { weeks: weeks.toString() },
    })
    .pipe(
      map(res => {
        const data = (res.data || []).map((r: any) => ({
          weekLabel: r.weekLabel,
          hoursWorked: Number(r.hoursWorked ?? 0),
          claimsDone: Number(r.claimsDone ?? 0),
          revenue: Number(r.revenue ?? 0),
          roi: Number(r.roi ?? 0),
          teamAvgClaims: Number(r.teamAvgClaims ?? 0),
          teamAvgRoi: Number(r.teamAvgRoi ?? 0),
        }));
        return data;
      }),
      catchError(() => of([] as PerformanceTrendPoint[])),
    );
}

// -- NEW: Resolution Metrics --------------------------------------------------
getResolutionMetrics(period = '1w'): Observable<ResolutionMetricsData> {
  const fallback: ResolutionMetricsData = {
    resolutionRate: null, firstTouchRate: null, avgDaysToResolve: null, reworkRate: null,
    teamResolutionRate: null, teamFirstTouchRate: null, teamAvgDaysToResolve: null, teamReworkRate: null,
  };
  return this.http
    .get<{ data: ResolutionMetricsData | null }>(`${this.specialistDashboardBaseUrl}/resolution-metrics`, {
      params: { period },
    })
    .pipe(
      map(res => res.data ?? fallback),
      catchError(() => of(fallback)),
    );
}

// -- NEW: Peer Ranking --------------------------------------------------------
getPeerRanking(): Observable<PeerRankingData | null> {
  return this.http
    .get<{ data: PeerRankingData | null }>(`${this.specialistDashboardBaseUrl}/peer-ranking`)
    .pipe(
      map(res => res.data),
      catchError(() => of(null)),
    );
}

// -- NEW: Training Matrix (Manager) ------------------------------------------
getTrainingMatrix(): Observable<TrainingMatrixData | null> {
  return this.http
    .get<{ data: TrainingMatrixData | null }>(`${this.managerDashboardBaseUrl}/training-matrix`)
    .pipe(
      map(res => res.data),
      catchError(() => of(null)),
    );
}


// -- Capacity Planning (Manager) ----------------------------------------------
getCapacityPlanning(): Observable<CapacityPlanningData | null> {
  return this.http
    .get<CapacityPlanningData>(`${this.managerDashboardBaseUrl}/capacity-planning`)
    .pipe(
      catchError(() => of(null)),
    );
}

}
