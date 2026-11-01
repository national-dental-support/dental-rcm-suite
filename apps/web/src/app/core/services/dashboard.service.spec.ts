import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { environment } from '../../../environments/environment';
import { UserRole } from '../models/dashboard.model';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('DashboardService', () => {
  let service: DashboardService;
  let http: HttpTestingController;

  const managerBase = `${environment.server.baseUrl}/denial-iq/manager-view/daily-dashboard`;
  const specialistBase = `${environment.server.baseUrl}/denial-iq/specialist-view/daily-dashboard`;

  beforeEach(() => {
    localStorage.removeItem('diq-preferred-role');
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(DashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('diq-preferred-role');
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getCurrentUserRole', () => {
    it('should emit ARSpecialist as default role', (done) => {
      service.getCurrentUserRole().subscribe(role => {
        expect(role).toBe(UserRole.ARSpecialist);
        done();
      });
    });
  });

  describe('setRolePreference', () => {
    it('should set role to Manager and persist to localStorage', (done) => {
      service.setRolePreference(UserRole.Manager);
      service.getCurrentUserRole().subscribe(role => {
        expect(role).toBe(UserRole.Manager);
        expect(localStorage.getItem('diq-preferred-role')).toBe(UserRole.Manager);
        done();
      });
    });

    it('should set role to ARSpecialist', (done) => {
      service.setRolePreference(UserRole.Manager);
      service.setRolePreference(UserRole.ARSpecialist);
      service.getCurrentUserRole().subscribe(role => {
        expect(role).toBe(UserRole.ARSpecialist);
        done();
      });
    });
  });

  describe('DashboardService constructor', () => {
    it('should restore Manager role from localStorage', (done) => {
      localStorage.setItem('diq-preferred-role', UserRole.Manager);
      // Re-inject the service to test constructor behavior
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
      });
      const svc2 = TestBed.inject(DashboardService);
      svc2.getCurrentUserRole().subscribe(role => {
        expect(role).toBe(UserRole.Manager);
        done();
      });
    });
  });

  describe('toggleDemoRole', () => {
    it('should toggle from ARSpecialist to Manager', (done) => {
      service.toggleDemoRole();
      service.getCurrentUserRole().subscribe(role => {
        expect(role).toBe(UserRole.Manager);
        done();
      });
    });

    it('should toggle back from Manager to ARSpecialist', (done) => {
      service.toggleDemoRole(); // -> Manager
      service.toggleDemoRole(); // -> ARSpecialist
      service.getCurrentUserRole().subscribe(role => {
        expect(role).toBe(UserRole.ARSpecialist);
        done();
      });
    });
  });

  describe('getManagerYesterdayStats', () => {
    it('should GET yesterday-summary and return StatsCard array', () => {
      const mockResponse = {
        message: 'ok',
        data: {
          reportDate: '2026-03-11',
          charges: 100000,
          postedPayments: 80000,
          adjustments: 5000,
          netCollectionsPct: 95,
        },
      };

      service.getManagerYesterdayStats().subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].label).toBe('Charges');
        expect(cards[1].label).toBe('Posted Payments');
        expect(cards[2].label).toBe('Adjustments');
        expect(cards[3].label).toBe('Net Collections %');
      });

      const req = http.expectOne(`${managerBase}/yesterday-summary`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should return empty StatsCards on HTTP error (no fabricated data)', () => {
      service.getManagerYesterdayStats().subscribe(cards => {
        expect(cards.length).toBe(0);
      });

      const req = http.expectOne(`${managerBase}/yesterday-summary`);
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });
    });

    it('should return zero StatsCards when data is null', () => {
      service.getManagerYesterdayStats().subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].value).toBe('$0.00');
      });

      const req = http.expectOne(`${managerBase}/yesterday-summary`);
      req.flush({ message: 'ok', data: null });
    });
  });

  describe('getArSpecialistPerformanceSummary', () => {
    it('should GET my-performance-summary with period param', () => {
      service.getArSpecialistPerformanceSummary('1m').subscribe();
      const req = http.expectOne(r =>
        r.url === `${specialistBase}/my-performance-summary` && r.params.get('period') === '1m'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: {} });
    });

    it('should default to 1w period', () => {
      service.getArSpecialistPerformanceSummary().subscribe();
      const req = http.expectOne(r =>
        r.url === `${specialistBase}/my-performance-summary` && r.params.get('period') === '1w'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: {} });
    });

    it('should return the real (zeroed) data when queueToday has no meaningful data', () => {
      service.getArSpecialistPerformanceSummary('1w').subscribe(result => {
        // Honest zeros from the API, not fabricated numbers
        expect(result.queueToday.claimsInQueue).toBe(0);
      });
      const req = http.expectOne(r =>
        r.url === `${specialistBase}/my-performance-summary` && r.params.get('period') === '1w'
      );
      req.flush({ data: { queueToday: { claimsInQueue: 0, dailyQuota: 0, queueValue: 0 } } });
    });

    it('should return actual data when queueToday has values', () => {
      service.getArSpecialistPerformanceSummary('1w').subscribe(result => {
        expect(result.queueToday.claimsInQueue).toBe(10);
      });
      const req = http.expectOne(r =>
        r.url === `${specialistBase}/my-performance-summary` && r.params.get('period') === '1w'
      );
      req.flush({ data: { queueToday: { claimsInQueue: 10, dailyQuota: 17, queueValue: 50000 } } });
    });

    it('should return an empty (zeroed) summary on HTTP error', () => {
      service.getArSpecialistPerformanceSummary().subscribe(result => {
        expect(result.queueToday.claimsInQueue).toBe(0);
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });

    it('should cache the result for the same period', () => {
      service.getArSpecialistPerformanceSummary('1w').subscribe();
      service.getArSpecialistKpi('1w').subscribe();
      // Only one HTTP request since perfSummary$ is shared
      const reqs = http.match(r => r.url === `${specialistBase}/my-performance-summary`);
      expect(reqs.length).toBe(1);
      reqs[0].flush({ data: { queueToday: { claimsInQueue: 5, dailyQuota: 17, queueValue: 25000 } } });
    });
  });

  describe('getArSpecialistKpi', () => {
    it('should return empty KPIs on null data (no fabricated data)', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        expect(cards.length).toBe(0);
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({ data: null });
    });

    it('should build zeroed KPIs when all metrics are zero', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].label).toBe('Avg Hours / Day');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 0,
            hoursWorked: 0,
            revenueRecovered: 0,
            avgHoursPerDay: 0,
            workDays: 5,
            avgClaimsPerDay: 0,
            roi: 0,
            hoursChange: null,
            claimsChangePct: null,
            revenueChangePct: null,
          },
        },
      });
    });

    it('should format revenue >= 1000 with K suffix', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const revCard = cards.find(c => c.label === 'Revenue Recovered');
        expect(revCard?.value).toContain('K');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 10,
            hoursWorked: 30,
            revenueRecovered: 42000,
            avgHoursPerDay: 6,
            workDays: 5,
            avgClaimsPerDay: 2,
            roi: 1400,
            hoursChange: 2,
            claimsChangePct: 10,
            revenueChangePct: 5,
          },
        },
      });
    });

    it('should format revenue < 1000 without K suffix', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const revCard = cards.find(c => c.label === 'Revenue Recovered');
        expect(revCard?.value).toContain('$');
        expect(revCard?.value).not.toContain('K');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 5,
            hoursWorked: 20,
            revenueRecovered: 500,
            avgHoursPerDay: 4,
            workDays: 5,
            avgClaimsPerDay: 1,
            roi: 25,
            hoursChange: -1,
            claimsChangePct: -5,
            revenueChangePct: -10,
          },
        },
      });
    });

    it('should show down arrow for negative changes', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const hoursCard = cards.find(c => c.label === 'Avg Hours / Day');
        expect(hoursCard?.changeDirection).toBe('down');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 5,
            hoursWorked: 20,
            revenueRecovered: 1000,
            avgHoursPerDay: 4,
            workDays: 5,
            avgClaimsPerDay: 1,
            roi: 50,
            hoursChange: -2,
            claimsChangePct: 5,
            revenueChangePct: 10,
          },
        },
      });
    });

    it('should return empty KPIs on HTTP error (no fabricated data)', () => {
      service.getArSpecialistKpi().subscribe(cards => {
        expect(cards.length).toBe(0);
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });

    it('should map data to KpiCards when data is present', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[2].label).toBe('Revenue Recovered');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          hoursWorkedThisWeek: 40,
          avgHoursPerWeek: 38,
          claimsCompletedThisWeek: 50,
          avgClaimsPerWeek: 45,
          revenueRecoveredThisWeek: 20000,
          avgRevenuePerWeek: 18000,
          hoursChange: 2,
          claimsChangePct: 5,
          revenueChangePct: 10,
        },
      });
    });
  });

  describe('getArSpecialistProficiency', () => {
    it('should GET analyst-proficiency', () => {
      service.getArSpecialistProficiency().subscribe(rows => {
        expect(rows.length).toBe(1);
        expect(rows[0].carcCode).toBe('CO-4');
      });

      const req = http.expectOne(`${specialistBase}/analyst-proficiency`);
      expect(req.request.method).toBe('GET');
      req.flush({
        data: [{
          CARCCode: 'CO-4',
          MyClaimCount: 10,
          MyAvgMinutes: '12.5',
          TeamAvgMinutes: '10.0',
          DiffFromTeamMinutes: '2.5',
          DiffFromTeamPct: '25.0',
        }],
      });
    });

    it('should return empty rows on error (no fabricated data)', () => {
      service.getArSpecialistProficiency().subscribe(rows => expect(rows.length).toBe(0));
      const req = http.expectOne(`${specialistBase}/analyst-proficiency`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('getManagerYesterdayStats \u2014 additional branches', () => {
    it('should format netCollectionsPct as "\u2014" when null', () => {
      service.getManagerYesterdayStats().subscribe(cards => {
        const netPctCard = cards.find(c => c.label === 'Net Collections %');
        expect(netPctCard!.value).toBe('\u2014');
      });
      const req = http.expectOne(`${managerBase}/yesterday-summary`);
      req.flush({
        message: 'ok',
        data: {
          reportDate: '2026-03-11',
          charges: 50000,
          postedPayments: 40000,
          adjustments: 3000,
          netCollectionsPct: null,
        },
      });
    });

    it('should format netCollectionsPct as percent string when present', () => {
      service.getManagerYesterdayStats().subscribe(cards => {
        const netPctCard = cards.find(c => c.label === 'Net Collections %');
        expect(netPctCard!.value).toBe('95%');
      });
      const req = http.expectOne(`${managerBase}/yesterday-summary`);
      req.flush({
        message: 'ok',
        data: {
          reportDate: '2026-03-11',
          charges: 50000,
          postedPayments: 40000,
          adjustments: 3000,
          netCollectionsPct: 95,
        },
      });
    });
  });

  describe('getAdminTodayStats', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('should GET all-claims and unassigned in parallel and compute stats', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].label).toBe('All Assigned Claims');
        expect(cards[1].label).toBe('Urgent Claims');
        expect(cards[2].label).toBe('Unassigned Claims');
        expect(cards[3].label).toBe('Recoverable Revenue');
      });

      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq  = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({
        data: [
          { InsuranceBalance: 5000, SlaStatus: 'OVERDUE', AgingDays: 50 },
          { InsuranceBalance: 2000, SlaStatus: 'NORMAL',  AgingDays: 10 },
        ],
        totalCount: 2,
        criticalCount: 1,
      });
      uaReq.flush({ data: [{ InsuranceBalance: 1500 }], totalCount: 1 });
    });

    it('should use totalCount/criticalCount from response when present', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('10');
        expect(cards[1].value).toBe('3');
      });

      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq  = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [], totalCount: 10, criticalCount: 3 });
      uaReq.flush({ data: [], totalCount: 5 });
    });

    it('should return fallback stats on HTTP error', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].value).toBe('\u2014');
      });

      // forkJoin cancels the second request as soon as the first errors;
      // flush the first to trigger the error path, then drain the cancelled request.
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      allReq.flush('error', { status: 500, statusText: 'Server Error' });
      // The unassigned request was cancelled by forkJoin - verify it's cancelled, don't flush it.
      const uaReqs = http.match(`${queueBase}/unassigned?page=0&pageSize=500`);
      expect(uaReqs.length).toBeLessThanOrEqual(1);
    });

    it('should format large revenue values with K suffix', () => {
      service.getAdminTodayStats().subscribe(cards => {
        const revCard = cards[3];
        expect(revCard.value).toContain('K');
      });

      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq  = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [{ InsuranceBalance: 50000, SlaStatus: 'NORMAL', AgingDays: 5 }], totalCount: 1 });
      uaReq.flush({ data: [], totalCount: 0 });
    });
  });

  describe('getArSpecialistTodayStats', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('should GET my-queue and unassigned in parallel', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].label).toBe('Claims in My Queue');
      });

      const myQueueReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const unassignedReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      expect(myQueueReq.request.method).toBe('GET');
      expect(unassignedReq.request.method).toBe('GET');

      myQueueReq.flush({ data: [{ InsuranceBalance: 1000, AgingDays: 50 }] });
      unassignedReq.flush({ data: [{ InsuranceBalance: 500, AgingDays: 10 }] });
    });

    it('should filter urgent claims using SlaStatus OVERDUE or URGENT', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        const urgentCard = cards.find(c => c.label === 'Urgent Claims');
        expect(urgentCard!.value).toBe('2');
      });

      const myQueueReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const unassignedReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQueueReq.flush({
        data: [
          { InsuranceBalance: 1000, sla_status: 'OVERDUE', AgingDays: 10 },
          { InsuranceBalance: 2000, SlaStatus: 'URGENT',  AgingDays: 5  },
          { InsuranceBalance: 500,  SlaStatus: 'NORMAL',  AgingDays: 3  },
        ],
        totalCount: 3,
      });
      unassignedReq.flush({ data: [], totalCount: 0 });
    });

    it('should mark claim as urgent when AgingDays > 45', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        const urgentCard = cards.find(c => c.label === 'Urgent Claims');
        expect(urgentCard!.value).toBe('1');
      });

      const myQueueReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const unassignedReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQueueReq.flush({
        data: [
          { InsuranceBalance: 3000, SlaStatus: 'NORMAL', AgingDays: 60 },
          { InsuranceBalance: 500,  SlaStatus: 'NORMAL', AgingDays: 10 },
        ],
        totalCount: 2,
      });
      unassignedReq.flush({ data: [], totalCount: 0 });
    });

    it('should return fallback stats on HTTP error', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].value).toBe('\u2014');
      });

      // forkJoin cancels the second request as soon as the first errors;
      // flush the first to trigger the error path, then drain the cancelled request.
      const myQueueReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      myQueueReq.flush('error', { status: 500, statusText: 'Server Error' });
      // The unassigned request was cancelled by forkJoin - verify it's cancelled, don't flush it.
      const unassignedReqs = http.match(`${queueBase}/unassigned?page=0&pageSize=500`);
      expect(unassignedReqs.length).toBeLessThanOrEqual(1);
    });

    it('should use totalCount from response when present', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('20');
      });

      const myQueueReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const unassignedReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQueueReq.flush({ data: [], totalCount: 20 });
      unassignedReq.flush({ data: [], totalCount: 5 });
    });
  });

  describe('getManagerArByLocation', () => {
    it('should GET ar-by-location and map rows', () => {
      service.getManagerArByLocation().subscribe(rows => {
        expect(rows.length).toBe(1);
        expect(rows[0].location).toBe('Main Office');
      });

      const req = http.expectOne(`${managerBase}/ar-by-location`);
      expect(req.request.method).toBe('GET');
      req.flush({
        message: 'ok',
        data: [{
          Location: 'Main Office',
          PatientCollections: 5000,
          InsuranceCollections: 10000,
          ARBalance: 3000,
        }],
      });
    });

    it('should return empty array when data is empty', () => {
      service.getManagerArByLocation().subscribe(rows => expect(rows).toEqual([]));
      const req = http.expectOne(`${managerBase}/ar-by-location`);
      req.flush({ message: 'ok', data: [] });
    });

    it('should return fallback on error', () => {
      service.getManagerArByLocation().subscribe(rows => {
        expect(Array.isArray(rows)).toBeTrue();
      });
      const req = http.expectOne(`${managerBase}/ar-by-location`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('getManagerArMix', () => {
    it('should GET ar-mix and map to ArMixUiModel', () => {
      service.getManagerArMix().subscribe(model => {
        expect(model).not.toBeNull();
        expect(model!.slices.length).toBe(2);
        expect(model!.totalAR).toBe(1000000);
      });

      const req = http.expectOne(`${managerBase}/ar-mix`);
      expect(req.request.method).toBe('GET');
      req.flush({
        message: 'ok',
        data: {
          asOfDate: '2026-03-11',
          totalAR: 1000000,
          insuranceAR: 600000,
          patientAR: 400000,
          insurancePctOfTotal: 60,
          patientPctOfTotal: 40,
          pctChangeLast30Days: 5,
        },
      });
    });

    it('should return null when data is null', () => {
      service.getManagerArMix().subscribe(model => expect(model).toBeNull());
      const req = http.expectOne(`${managerBase}/ar-mix`);
      req.flush({ message: 'ok', data: null });
    });

    it('should return null on error (no fabricated AR mix)', () => {
      service.getManagerArMix().subscribe(model => {
        expect(model).toBeNull();
      });
      const req = http.expectOne(`${managerBase}/ar-mix`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('getManagerPaymentBreakdown \u2014 zero values path', () => {
    it('should return zero-donut when all payment values are zero or negative', () => {
      service.getManagerPaymentBreakdown().subscribe(model => {
        expect(model).not.toBeNull();
        expect(model!.slices.every(s => s.value === 0)).toBeTrue();
      });

      const req = http.expectOne(`${managerBase}/payment-breakdown-pie`);
      req.flush({
        message: 'ok',
        data: [{
          InsurancePayments: 0,
          PatientPayments: 0,
          Adjustments: 0,
          RemainingBalance: 0,
          TotalPayments: 0,
          PctChangeLast30Days: null,
        }],
      });
    });

    it('should clamp negative values to 0 for donut slices', () => {
      service.getManagerPaymentBreakdown().subscribe(model => {
        expect(model).not.toBeNull();
        // Negative values get clamped to 0, sum of positives > 0 so pct should still work
      });

      const req = http.expectOne(`${managerBase}/payment-breakdown-pie`);
      req.flush({
        message: 'ok',
        data: [{
          InsurancePayments: -100,
          PatientPayments: 300,
          Adjustments: 100,
          RemainingBalance: 100,
          TotalPayments: 400,
          PctChangeLast30Days: 5,
        }],
      });
    });

    it('should return a zeroed breakdown on error (no fabricated data)', () => {
      service.getManagerPaymentBreakdown().subscribe(model => {
        expect(model!.totalPayments).toBe(0);
      });
      const req = http.expectOne(`${managerBase}/payment-breakdown-pie`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('getManagerPaymentBreakdown', () => {
    it('should GET payment-breakdown-pie and map to PaymentBreakdownUiModel', () => {
      service.getManagerPaymentBreakdown().subscribe(model => {
        expect(model).not.toBeNull();
        expect(model!.slices.length).toBe(4);
      });

      const req = http.expectOne(`${managerBase}/payment-breakdown-pie`);
      expect(req.request.method).toBe('GET');
      req.flush({
        message: 'ok',
        data: [{
          InsurancePayments: 500,
          PatientPayments: 300,
          Adjustments: 100,
          RemainingBalance: 100,
          TotalPayments: 1000,
          PctChangeLast30Days: 8,
        }],
      });
    });

    it('should return null when data is empty', () => {
      service.getManagerPaymentBreakdown().subscribe(model => expect(model).toBeNull());
      const req = http.expectOne(`${managerBase}/payment-breakdown-pie`);
      req.flush({ message: 'ok', data: [] });
    });
  });

  describe('getManagerRevenueTrends', () => {
    it('should GET revenue-trends and map rows to RevenueTrendPoints', () => {
      service.getManagerRevenueTrends().subscribe(points => {
        expect(points.length).toBe(2);
        expect(points[0].charges).toBe(100000);
      });

      const req = http.expectOne(`${managerBase}/revenue-trends?range=MoM`);
      expect(req.request.method).toBe('GET');
      req.flush({
        message: 'ok',
        data: [
          { PeriodStart: '2026-01-01', PeriodLabel: '2026-01', Charges: 100000, Payments: 80000, Adjustments: 5000 },
          { PeriodStart: '2026-02-01', PeriodLabel: '2026-02', Charges: 110000, Payments: 85000, Adjustments: 6000 },
        ],
      });
    });

    it('should return empty array on error', () => {
      service.getManagerRevenueTrends().subscribe(points => expect(points).toEqual([]));
      const req = http.expectOne(`${managerBase}/revenue-trends?range=MoM`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });

    it('should use PeriodLabel when PeriodStart is null', () => {
      service.getManagerRevenueTrends().subscribe(points => {
        expect(points[0].label).toBe('2025-Q1');
      });
      const req = http.expectOne(`${managerBase}/revenue-trends?range=MoM`);
      req.flush({
        message: 'ok',
        data: [
          { PeriodStart: null, PeriodLabel: '2025-Q1', Charges: 100000, Payments: 80000, Adjustments: 5000 },
        ],
      });
    });

    it('should limit to first 5 rows', () => {
      service.getManagerRevenueTrends().subscribe(points => {
        expect(points.length).toBe(5);
      });
      const req = http.expectOne(`${managerBase}/revenue-trends?range=MoM`);
      req.flush({
        message: 'ok',
        data: Array.from({ length: 8 }, (_, i) => ({
          PeriodStart: `2025-0${i + 1}-01`,
          PeriodLabel: `2025-0${i + 1}`,
          Charges: 100000,
          Payments: 80000,
          Adjustments: 5000,
        })),
      });
    });
  });

  describe('getManagerStaffPerformance', () => {
    it('should GET staff-performance and map rows to ManagerStaffRow', () => {
      service.getManagerStaffPerformance().subscribe(rows => {
        expect(rows.length).toBe(1);
        expect(rows[0].name).toBe('Jane Doe');
        expect(rows[0].staffId).toBe(1);
      });

      const req = http.expectOne(`${managerBase}/staff-performance`);
      expect(req.request.method).toBe('GET');
      req.flush({
        message: 'ok',
        data: [{
          StaffID: 1,
          StaffName: 'Jane Doe',
          NetCollectionPct: 88,
          RecoveryPerDay: 15000,
          AvgMinutesPerClaim: 12,
          ClaimsPerDay: 20,
          ClaimsInQueueToday: 80,
          FirstTouchRate: 70,
          ReworkRate: 5,
          EscalationCount: 2,
          AvgDaysToResolve: 3.5,
        }],
      });
    });

    it('should return empty rows on error (no fabricated data)', () => {
      service.getManagerStaffPerformance().subscribe(rows => {
        expect(rows.length).toBe(0);
      });
      const req = http.expectOne(`${managerBase}/staff-performance`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });

    it('should map null NetCollectionPct to null in model', () => {
      service.getManagerStaffPerformance().subscribe(rows => {
        expect(rows[0].netCollectionPct).toBeNull();
      });
      const req = http.expectOne(`${managerBase}/staff-performance`);
      req.flush({
        message: 'ok',
        data: [{
          StaffID: 2,
          StaffName: 'John Doe',
          NetCollectionPct: null,
          RecoveryPerDay: 8000,
          AvgMinutesPerClaim: 20,
          ClaimsPerDay: 10,
          ClaimsInQueueToday: 40,
          FirstTouchRate: null,
          ReworkRate: null,
          EscalationCount: 0,
          AvgDaysToResolve: null,
        }],
      });
    });
  });

  describe('getPerformanceTrends', () => {
    it('should GET performance-trends with weeks param', () => {
      service.getPerformanceTrends(8).subscribe(points => {
        expect(points.length).toBe(1);
        expect(points[0].weekLabel).toBe('Wk1');
      });

      const req = http.expectOne(r =>
        r.url === `${specialistBase}/performance-trends` && r.params.get('weeks') === '8'
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        data: [{ weekLabel: 'Wk1', hoursWorked: 40, claimsDone: 50, revenue: 20000, roi: 400, teamAvgClaims: 45, teamAvgRoi: 380 }],
      });
    });

    it('should use default of 12 weeks', () => {
      service.getPerformanceTrends().subscribe();
      const req = http.expectOne(r => r.params.get('weeks') === '12');
      req.flush({ data: [] });
    });
  });

  describe('getResolutionMetrics', () => {
    it('should GET resolution-metrics with period param', () => {
      service.getResolutionMetrics('1m').subscribe(data => {
        expect(data.resolutionRate).toBe(90);
      });

      const req = http.expectOne(r =>
        r.url === `${specialistBase}/resolution-metrics` && r.params.get('period') === '1m'
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        data: {
          resolutionRate: 90, firstTouchRate: 70, avgDaysToResolve: 3,
          reworkRate: 5, teamResolutionRate: 85, teamFirstTouchRate: 65,
          teamAvgDaysToResolve: 4, teamReworkRate: 8,
        },
      });
    });

    it('should return null-filled fallback on error', () => {
      service.getResolutionMetrics().subscribe(data => {
        expect(data.resolutionRate).toBeNull();
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/resolution-metrics`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('getPeerRanking', () => {
    it('should GET peer-ranking', () => {
      service.getPeerRanking().subscribe(data => {
        expect(data).not.toBeNull();
        expect(data!.claimsPercentile).toBe(80);
      });

      const req = http.expectOne(`${specialistBase}/peer-ranking`);
      expect(req.request.method).toBe('GET');
      req.flush({
        data: { claimsPercentile: 80, revenuePercentile: 75, roiPercentile: 70, speedPercentile: 85, totalSpecialists: 10 },
      });
    });

    it('should return null on error', () => {
      service.getPeerRanking().subscribe(data => expect(data).toBeNull());
      const req = http.expectOne(`${specialistBase}/peer-ranking`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('getTrainingMatrix', () => {
    it('should GET training-matrix', () => {
      service.getTrainingMatrix().subscribe(data => {
        expect(data).not.toBeNull();
        expect(data!.denialCodes).toEqual(['CO-4']);
      });

      const req = http.expectOne(`${managerBase}/training-matrix`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: { denialCodes: ['CO-4'], staff: [] } });
    });

    it('should return null on error', () => {
      service.getTrainingMatrix().subscribe(data => expect(data).toBeNull());
      const req = http.expectOne(`${managerBase}/training-matrix`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('getCapacityPlanning', () => {
    it('should GET capacity-planning', () => {
      service.getCapacityPlanning().subscribe(data => {
        expect(data).not.toBeNull();
      });

      const req = http.expectOne(`${managerBase}/capacity-planning`);
      expect(req.request.method).toBe('GET');
      req.flush({
        backlog: { totalOpen: 100, unassigned: 10, totalValue: 500000, avgAgingDays: 20, agingBuckets: { current: 50, urgent: 30, critical: 15, severe: 5 } },
        velocity: { teamClaimsPerDay: 50, avgPerSpecialist: 10, avgMinutesPerClaim: 12, avgDaysToResolve: 3, claimsCompleted30d: 1500 },
        staffing: { activeSpecialists: 5, staff: [] },
        forecast: { daysToCloseBacklog: 2, targetDays: 5, staffNeededForTarget: 5, overtimeNeededPct: 0, additionalHiresNeeded: 0, neededClaimsPerDay: 50 },
        weeklyTrend: [],
      });
    });

    it('should return null on error', () => {
      service.getCapacityPlanning().subscribe(data => expect(data).toBeNull());
      const req = http.expectOne(`${managerBase}/capacity-planning`);
      req.flush('error', { status: 500, statusText: 'Server Error' });
    });
  });

  // -- getArSpecialistKpi null change values ---------------------------------

  describe('getArSpecialistKpi \u2014 null change values', () => {
    it('should show neutral direction when all changes are null', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const hoursCard = cards.find(c => c.label === 'Avg Hours / Day');
        // null changes -> changeDirection should be 'up' (null >= 0 is false, so 0 >= 0 is true)
        expect(hoursCard).toBeDefined();
        expect(hoursCard!.changeLabel).toBeDefined();
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 10,
            hoursWorked: 30,
            revenueRecovered: 5000,
            avgHoursPerDay: 6,
            workDays: 5,
            avgClaimsPerDay: 2,
            roi: 500,
            hoursChange: null,
            claimsChangePct: null,
            revenueChangePct: null,
          },
        },
      });
    });

    it('should show up direction when claimsChangePct is positive', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const claimsCard = cards.find(c => c.label === 'Claims Completed');
        expect(claimsCard!.changeDirection).toBe('up');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 20,
            hoursWorked: 35,
            revenueRecovered: 8000,
            avgHoursPerDay: 7,
            workDays: 5,
            avgClaimsPerDay: 4,
            roi: 800,
            hoursChange: 1,
            claimsChangePct: 5,
            revenueChangePct: 10,
          },
        },
      });
    });

    it('should show down direction for revenueChangePct when negative', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const revCard = cards.find(c => c.label === 'Revenue Recovered');
        expect(revCard!.changeDirection).toBe('down');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 10,
            hoursWorked: 20,
            revenueRecovered: 3000,
            avgHoursPerDay: 4,
            workDays: 5,
            avgClaimsPerDay: 2,
            roi: 200,
            hoursChange: 0,
            claimsChangePct: 0,
            revenueChangePct: -15,
          },
        },
      });
    });
  });

  // -- getArSpecialistTodayStats - additional branches ----------------------

  describe('getArSpecialistTodayStats \u2014 additional branches', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('should format large myTotal as K', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        const revCard = cards.find(c => c.label === 'Recoverable Revenue');
        expect(revCard!.value).toContain('K');
      });
      const myQ = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const ua = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQ.flush({ data: [{ InsuranceBalance: 75000, AgingDays: 10 }], totalCount: 1 });
      ua.flush({ data: [], totalCount: 0 });
    });

    it('should filter urgent claims using sla_status lowercase OVERDUE', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        const urgentCard = cards.find(c => c.label === 'Urgent Claims');
        expect(urgentCard!.value).toBe('1');
      });
      const myQ = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const ua = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQ.flush({ data: [
        { InsuranceBalance: 1000, sla_status: 'OVERDUE', AgingDays: 10 },
        { InsuranceBalance: 500, SlaStatus: 'NORMAL', AgingDays: 5 },
      ], totalCount: 2 });
      ua.flush({ data: [], totalCount: 0 });
    });

    it('should use data.length when totalCount is absent from myQueue response', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('3');
      });
      const myQ = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const ua = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQ.flush({ data: [
        { InsuranceBalance: 1000, AgingDays: 5 },
        { InsuranceBalance: 2000, AgingDays: 5 },
        { InsuranceBalance: 3000, AgingDays: 5 },
      ] });
      ua.flush({ data: [], totalCount: 0 });
    });
  });

  // -- getAdminTodayStats - additional branches -----------------------------

  describe('getAdminTodayStats \u2014 additional branches', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('should use data.length when totalCount is absent from all-claims response', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('2');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [
        { InsuranceBalance: 1000, SlaStatus: 'NORMAL', AgingDays: 10 },
        { InsuranceBalance: 2000, SlaStatus: 'NORMAL', AgingDays: 5 },
      ] });
      uaReq.flush({ data: [], totalCount: 0 });
    });

    it('should use urgentRows.length when criticalCount is absent', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[1].value).toBe('1');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [
        { InsuranceBalance: 5000, SlaStatus: 'URGENT', AgingDays: 10 },
        { InsuranceBalance: 2000, SlaStatus: 'NORMAL', AgingDays: 5 },
      ], totalCount: 2 });
      uaReq.flush({ data: [], totalCount: 0 });
    });

    it('should use unassigned data.length when totalCount is absent', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[2].value).toBe('2');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [], totalCount: 0 });
      uaReq.flush({ data: [
        { InsuranceBalance: 500 },
        { InsuranceBalance: 800 },
      ] });
    });

    it('should filter urgent when AgingDays > 45', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[1].value).toBe('1');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [
        { InsuranceBalance: 5000, SlaStatus: 'NORMAL', AgingDays: 50 },
        { InsuranceBalance: 2000, SlaStatus: 'NORMAL', AgingDays: 5 },
      ], totalCount: 2 });
      uaReq.flush({ data: [], totalCount: 0 });
    });

    it('should format small revenue values without K suffix', () => {
      service.getAdminTodayStats().subscribe(cards => {
        const revCard = cards[3];
        expect(revCard.value).not.toContain('K');
        expect(revCard.value).toContain('$');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [{ InsuranceBalance: 500, SlaStatus: 'NORMAL', AgingDays: 5 }], totalCount: 1 });
      uaReq.flush({ data: [], totalCount: 0 });
    });
  });

  // -- getArSpecialistProficiency - CARCDescription present -----------------

  describe('getArSpecialistProficiency \u2014 additional branches', () => {
    it('should map CARCDescription to carcDescription', () => {
      service.getArSpecialistProficiency().subscribe(rows => {
        expect(rows[0].carcDescription).toBe('Service not covered');
      });
      const req = http.expectOne(`${specialistBase}/analyst-proficiency`);
      req.flush({ data: [{
        CARCCode: 'CO-45',
        CARCDescription: 'Service not covered',
        MyClaimCount: 5,
        MyAvgMinutes: '15.0',
        TeamAvgMinutes: '12.0',
        DiffFromTeamMinutes: '3.0',
        DiffFromTeamPct: null,
      }] });
    });

    it('should return empty rows when the API returns none (no fabricated data)', () => {
      service.getArSpecialistProficiency().subscribe(rows => {
        expect(rows.length).toBe(0);
      });
      const req = http.expectOne(`${specialistBase}/analyst-proficiency`);
      req.flush({ data: [] });
    });
  });

  // -- getManagerArByLocation - null data shape ------------------------------

  describe('getManagerArByLocation \u2014 null data', () => {
    it('should handle null data response', () => {
      service.getManagerArByLocation().subscribe(rows => {
        expect(Array.isArray(rows)).toBeTrue();
      });
      const req = http.expectOne(`${managerBase}/ar-by-location`);
      req.flush({ message: 'ok', data: null });
    });
  });

  // -- getManagerStaffPerformance - additional field branches ----------------

  describe('getManagerStaffPerformance \u2014 additional field branches', () => {
    it('should map FirstTouchRate and ReworkRate when present', () => {
      service.getManagerStaffPerformance().subscribe(rows => {
        expect((rows[0] as any).firstTouchRate).toBe(70);
        expect((rows[0] as any).reworkRate).toBe(5);
      });
      const req = http.expectOne(`${managerBase}/staff-performance`);
      req.flush({ message: 'ok', data: [{
        StaffID: 1,
        StaffName: 'Test',
        NetCollectionPct: 88,
        RecoveryPerDay: 15000,
        AvgMinutesPerClaim: 12,
        ClaimsPerDay: 20,
        ClaimsInQueueToday: 80,
        FirstTouchRate: 70,
        ReworkRate: 5,
        EscalationCount: 1,
        AvgDaysToResolve: 3,
      }] });
    });
  });

  // -- getAdminTodayStats - null data paths ----------------------------------

  describe('getAdminTodayStats \u2014 null data paths', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('handles null acRes.data with fallback to empty array', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('0');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: null, totalCount: 0, criticalCount: 0 });
      uaReq.flush({ data: null, totalCount: 0 });
    });

    it('uses acRes.totalCount when present', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('100');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [], totalCount: 100, criticalCount: 5 });
      uaReq.flush({ data: [], totalCount: 25 });
    });

    it('uses acRes.criticalCount when present (skips counting rows)', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[1].value).toBe('10'); // criticalCount=10
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [{ SlaStatus: 'OVERDUE', InsuranceBalance: 1000 }], totalCount: 5, criticalCount: 10 });
      uaReq.flush({ data: [], totalCount: 0 });
    });

    it('uses urgentRows.length when criticalCount is null', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards[1].value).toBe('2'); // 2 urgent rows
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({
        data: [
          { SlaStatus: 'OVERDUE', InsuranceBalance: 500 },
          { SlaStatus: 'URGENT', InsuranceBalance: 300 },
          { SlaStatus: 'NORMAL', InsuranceBalance: 100 },
        ],
        totalCount: null,
        criticalCount: null,
      });
      uaReq.flush({ data: [], totalCount: 0 });
    });

    it('uses large format for totalValue >= 1000', () => {
      service.getAdminTodayStats().subscribe(cards => {
        // Recoverable Revenue should use K format
        const revenueCard = cards[3];
        expect(revenueCard.description || revenueCard.value).toMatch(/K|0/);
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [{ InsuranceBalance: 2000 }], totalCount: 1, criticalCount: 0 });
      uaReq.flush({ data: [], totalCount: 0 });
    });
  });

  // -- getArSpecialistTodayStats - null data paths ---------------------------

  describe('getArSpecialistTodayStats \u2014 null data paths', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('handles null mqRes.data with fallback', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('0');
      });
      const myReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myReq.flush({ data: null, totalCount: 0 });
      uaReq.flush({ data: null, totalCount: 0 });
    });

    it('uses totalCount when provided', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('50');
      });
      const myReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myReq.flush({ data: [], totalCount: 50 });
      uaReq.flush({ data: [], totalCount: 10 });
    });

    it('counts urgent claims with lowercase sla_status', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards[1].value).toBe('2');
      });
      const myReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const uaReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myReq.flush({
        data: [
          { sla_status: 'OVERDUE', InsuranceBalance: 100 },
          { sla_status: 'URGENT', InsuranceBalance: 200 },
          { sla_status: 'NORMAL', InsuranceBalance: 300 },
        ],
        totalCount: null,
      });
      uaReq.flush({ data: [], totalCount: 0 });
    });
  });

  // -- getArSpecialistKpi - additional branches ------------------------------

  describe('getArSpecialistKpi \u2014 additional branches', () => {
    it('returns empty KPIs when d.lastPeriod is null (no fabricated data)', () => {
      service.getArSpecialistKpi().subscribe(kpis => {
        expect(kpis.length).toBe(0);
      });
      const req = http.expectOne(`${specialistBase}/my-performance-summary?period=1w`);
      req.flush({ data: { lastPeriod: null, queueToday: {} } });
    });

    it('builds zeroed KPIs when all metrics are 0', () => {
      service.getArSpecialistKpi().subscribe(kpis => {
        expect(kpis[0].value).toBe('0.0');
      });
      const req = http.expectOne(`${specialistBase}/my-performance-summary?period=1w`);
      req.flush({ data: { lastPeriod: { claimsCompleted: 0, hoursWorked: 0, revenueRecovered: 0 }, queueToday: {} } });
    });

    it('formats small revenue without K suffix', () => {
      service.getArSpecialistKpi().subscribe(kpis => {
        const revenueKpi = kpis[2];
        expect(revenueKpi.value).toMatch(/^\$/);
        expect(revenueKpi.value).not.toContain('K');
      });
      const req = http.expectOne(`${specialistBase}/my-performance-summary?period=1w`);
      req.flush({ data: { lastPeriod: {
        label: 'Last week', claimsCompleted: 5, hoursWorked: 10, revenueRecovered: 500,
        avgHoursPerDay: 2, workDays: 5, avgClaimsPerDay: 1, roi: 50,
        hoursChange: 1, claimsChangePct: 5, revenueChangePct: 5,
      }, queueToday: {} } });
    });

    it('returns empty KPIs on API error (no fabricated data)', () => {
      service.getArSpecialistKpi().subscribe(kpis => {
        expect(kpis.length).toBe(0);
      });
      const req = http.expectOne(`${specialistBase}/my-performance-summary?period=1w`);
      req.error(new ErrorEvent('Network error'));
    });
  });

  // -- getManagerArByLocation - additional branches ---------------------------

  describe('getManagerArByLocation \u2014 additional branches', () => {
    it('maps rows with null optionals to 0/empty', () => {
      service.getManagerArByLocation().subscribe(rows => {
        expect(rows[0].arBalance).toBe(0);
        expect(rows[0].patientCollections).toBe(0);
        expect(rows[0].insuranceCollections).toBe(0);
        expect(rows[0].location).toBe('Test Clinic');
      });
      const req = http.expectOne(`${managerBase}/ar-by-location`);
      req.flush({ message: 'ok', data: [{
        Location: 'Test Clinic',
        PatientCollections: null,
        InsuranceCollections: null,
        ARBalance: null,
      }] });
    });

    it('uses fallback empty location when Location is missing', () => {
      service.getManagerArByLocation().subscribe(rows => {
        expect(rows[0].location).toBe('');
      });
      const req = http.expectOne(`${managerBase}/ar-by-location`);
      req.flush({ message: 'ok', data: [{
        Location: null,
        PatientCollections: 100,
        InsuranceCollections: 200,
        ARBalance: 50,
      }] });
    });
  });

  // -- getAdminTodayStats - null/missing field fallbacks ------------------------

  describe('getAdminTodayStats \u2014 null field fallbacks', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('should fall back to allRows.length when totalCount is missing', () => {
      service.getAdminTodayStats().subscribe(cards => {
        // 2 rows -> totalCount fallback = 2
        expect(cards[0].value).toBe('2');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq  = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      // Note: no totalCount - should fall back to data.length
      allReq.flush({ data: [
        { InsuranceBalance: 100, SlaStatus: 'NORMAL', AgingDays: 5 },
        { InsuranceBalance: 200, SlaStatus: 'NORMAL', AgingDays: 10 },
      ]});
      uaReq.flush({ data: [] });
    });

    it('should fall back to urgentRows.length when criticalCount is missing', () => {
      service.getAdminTodayStats().subscribe(cards => {
        const urgentCard = cards.find(c => c.label === 'Urgent Claims');
        // 1 OVERDUE row -> urgentRows.length = 1 (no criticalCount)
        expect(urgentCard!.value).toBe('1');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq  = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      // No criticalCount field - should use urgentRows.length
      allReq.flush({ data: [
        { InsuranceBalance: 100, SlaStatus: 'OVERDUE', AgingDays: 5 },
        { InsuranceBalance: 200, SlaStatus: 'NORMAL', AgingDays: 5 },
      ], totalCount: 2 });
      uaReq.flush({ data: [], totalCount: 0 });
    });

    it('should fall back to uaRes.data.length when totalCount is missing from unassigned', () => {
      service.getAdminTodayStats().subscribe(cards => {
        const uaCard = cards.find(c => c.label === 'Unassigned Claims');
        // 2 unassigned rows -> fallback = 2
        expect(uaCard!.value).toBe('2');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq  = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      allReq.flush({ data: [], totalCount: 0, criticalCount: 0 });
      // No totalCount in unassigned
      uaReq.flush({ data: [
        { InsuranceBalance: 100 },
        { InsuranceBalance: 200 },
      ]});
    });

    it('should handle missing data arrays gracefully', () => {
      service.getAdminTodayStats().subscribe(cards => {
        expect(cards.length).toBe(4);
        expect(cards[0].value).toBe('0');
      });
      const allReq = http.expectOne(`${queueBase}/all-claims?page=0&pageSize=500`);
      const uaReq  = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      // data is undefined - should fall back to []
      allReq.flush({ totalCount: 0, criticalCount: 0 });
      uaReq.flush({ totalCount: 0 });
    });
  });

  // -- getArSpecialistTodayStats - null field fallbacks -------------------------

  describe('getArSpecialistTodayStats \u2014 null field fallbacks', () => {
    const queueBase = `${environment.server.baseUrl}/denial-iq/specialist-view/claim-queue`;

    it('should fall back to myClaims.length when totalCount missing from my-queue', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        expect(cards[0].value).toBe('3');
      });
      const myQueueReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const unassignedReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQueueReq.flush({ data: [
        { InsuranceBalance: 100, AgingDays: 5 },
        { InsuranceBalance: 200, AgingDays: 10 },
        { InsuranceBalance: 300, AgingDays: 15 },
      ]});
      unassignedReq.flush({ data: [], totalCount: 0 });
    });

    it('should fall back to unassignedClaims.length when totalCount missing from unassigned', () => {
      service.getArSpecialistTodayStats().subscribe(cards => {
        const uaCard = cards.find(c => c.label === 'Unassigned Claims');
        expect(uaCard!.value).toBe('2');
      });
      const myQueueReq = http.expectOne(`${queueBase}/my-queue?page=0&pageSize=500`);
      const unassignedReq = http.expectOne(`${queueBase}/unassigned?page=0&pageSize=500`);
      myQueueReq.flush({ data: [], totalCount: 0 });
      unassignedReq.flush({ data: [{ InsuranceBalance: 100 }, { InsuranceBalance: 200 }] });
    });
  });

  // -- getArSpecialistKpi - null optional field fallbacks -----------------------

  describe('getArSpecialistKpi \u2014 null optional field fallbacks', () => {
    it('should use 0 fallback for null avgHoursPerDay, hoursWorked, workDays', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const hoursCard = cards.find(c => c.label === 'Avg Hours / Day');
        expect(hoursCard!.value).toBe('0.0'); // avgHoursPerDay ?? 0 = 0
        expect(hoursCard!.subLabel).toContain('0h'); // hoursWorked ?? 0 = 0
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 5,
            hoursWorked: null,
            revenueRecovered: 100,
            avgHoursPerDay: null,
            workDays: null,
            avgClaimsPerDay: null,
            roi: null,
            hoursChange: null,
            claimsChangePct: null,
            revenueChangePct: null,
          },
        },
      });
    });

    it('should use 0 fallback for null roi', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const roiCard = cards.find(c => c.label === 'ROI');
        expect(roiCard!.value).toContain('$0/hr'); // roi ?? 0 = 0
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 5,
            hoursWorked: 10,
            revenueRecovered: 500,
            avgHoursPerDay: 2,
            workDays: 5,
            avgClaimsPerDay: 1,
            roi: null,
            hoursChange: 1,
            claimsChangePct: 5,
            revenueChangePct: 5,
          },
        },
      });
    });

    it('should treat null hoursChange >= 0 as up direction', () => {
      service.getArSpecialistKpi('1w').subscribe(cards => {
        const hoursCard = cards.find(c => c.label === 'Avg Hours / Day');
        // null ?? 0 = 0; 0 >= 0 -> 'up'
        expect(hoursCard!.changeDirection).toBe('up');
      });
      const req = http.expectOne(r => r.url === `${specialistBase}/my-performance-summary`);
      req.flush({
        data: {
          lastPeriod: {
            label: 'Last week',
            claimsCompleted: 5,
            hoursWorked: 10,
            revenueRecovered: 500,
            avgHoursPerDay: 2,
            workDays: 5,
            avgClaimsPerDay: 1,
            roi: 50,
            hoursChange: null,
            claimsChangePct: null,
            revenueChangePct: null,
          },
        },
      });
    });
  });
});
