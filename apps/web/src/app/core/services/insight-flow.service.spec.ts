import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InsightflowService, SectionHealth, InsightflowKpiData } from './insight-flow.service';
import { IRow } from '../models/payer-mix.models';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = `${environment.server.baseUrl}/insightflow`;

const mockKpiData: InsightflowKpiData = {
  period: { window: 'year', start: '2026-01-01', end: '2026-12-31' },
  grossCollectionRate: 0.95,
  netCollectionRate: 0.97,
  selfPayCollectionRate: 0.65,
  denialRate: 0.08,
  firstPassRate: 0.92,
  daysInAR: 38,
  avgDaysToPayment: 24,
  avgDaysToDenial: 11,
  avgDaysToWriteOff: 75,
  arAging90PlusPct: 0.18,
  writeOffRate: 0.03,
  cleanClaimRate: 0.94,
  costToCollect: 0.045,
  denialOverturnRate: 0.55,
  avgReimbursementPerClaim: 320,
};

const mockHealth: SectionHealth[] = [
  { section: 'Denials', status: 'green', metric: '8% denial rate', updatedAt: '2025-01-10T00:00:00Z' },
  { section: 'AR', status: 'yellow', metric: '42 days AR', updatedAt: '2025-01-10T00:00:00Z' },
];

const mockRows: IRow[] = [
  { name: 'Group A', value: 50000 } as any,
  { name: 'Group B', value: 30000 } as any,
];

describe('InsightflowService', () => {
  let service: InsightflowService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [InsightflowService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(InsightflowService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // -- getHealth -------------------------------------------------------------

  describe('getHealth()', () => {
    it('GET /insightflow/health returns section health array', () => {
      service.getHealth().subscribe(r => {
        expect(r.sections.length).toBe(2);
        expect(r.sections[0].status).toBe('green');
      });
      http.expectOne(`${BASE}/health`).flush({ sections: mockHealth });
    });

    it('returns empty sections array when no data', () => {
      service.getHealth().subscribe(r => {
        expect(r.sections).toEqual([]);
      });
      http.expectOne(`${BASE}/health`).flush({ sections: [] });
    });
  });

  // -- getCollectionsByPracticeGroup$ ----------------------------------------

  describe('getCollectionsByPracticeGroup$()', () => {
    it('POST /insightflow/collections/all with default user_id=1', () => {
      service.getCollectionsByPracticeGroup$().subscribe(rows => {
        expect(rows.length).toBe(2);
      });
      const req = http.expectOne(r =>
        r.url === `${BASE}/collections/all` &&
        r.method === 'POST' &&
        r.params.get('user_id') === '1'
      );
      expect(req).toBeTruthy();
      req.flush(mockRows);
    });

    it('POST /insightflow/collections/all with custom user_id', () => {
      service.getCollectionsByPracticeGroup$(42).subscribe(rows => {
        expect(rows).toBeDefined();
      });
      const req = http.expectOne(r =>
        r.url === `${BASE}/collections/all` &&
        r.params.get('user_id') === '42'
      );
      expect(req).toBeTruthy();
      req.flush([]);
    });

    it('sends empty POST body (not null)', () => {
      service.getCollectionsByPracticeGroup$().subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/collections/all`);
      expect(req.request.body).toEqual({});
      req.flush([]);
    });
  });

  // -- getKpis -------------------------------------------------------------

  describe('getKpis()', () => {
    it('GET /insightflow/kpis with no params by default', () => {
      service.getKpis().subscribe(data => {
        expect(data.grossCollectionRate).toBe(0.95);
      });
      const req = http.expectOne(`${BASE}/kpis`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockKpiData });
    });

    it('passes start and end params', () => {
      service.getKpis('2026-01-01', '2026-12-31').subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/kpis` &&
        r.params.get('start') === '2026-01-01' &&
        r.params.get('end') === '2026-12-31'
      );
      req.flush({ data: mockKpiData });
    });

    it('passes yoy=true when requested', () => {
      service.getKpis(undefined, undefined, true).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/kpis` &&
        r.params.get('yoy') === 'true'
      );
      req.flush({ data: { ...mockKpiData, yoy: { grossCollectionRate: 0.92, netCollectionRate: 0.94, denialRate: 0.10 } } });
    });

    it('unwraps data from response envelope', () => {
      service.getKpis().subscribe(data => {
        expect(data.denialRate).toBe(0.08);
        expect(data.avgDaysToPayment).toBe(24);
        expect(data.arAging90PlusPct).toBe(0.18);
      });
      http.expectOne(r => r.url === `${BASE}/kpis`).flush({ data: mockKpiData });
    });

    it('handles null expanded KPI fields', () => {
      const partial = { ...mockKpiData, arAging90PlusPct: null, costToCollect: null };
      service.getKpis().subscribe(data => {
        expect(data.arAging90PlusPct).toBeNull();
        expect(data.costToCollect).toBeNull();
      });
      http.expectOne(r => r.url === `${BASE}/kpis`).flush({ data: partial });
    });

    it('passes payers array param', () => {
      service.getKpis(undefined, undefined, false, ['BCBS', 'Aetna']).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/kpis`);
      expect(req.request.params.getAll('payers')).toEqual(['BCBS', 'Aetna']);
      req.flush({ data: mockKpiData });
    });

    it('passes providers array param', () => {
      service.getKpis(undefined, undefined, false, undefined, ['Dr. Smith']).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/kpis`);
      expect(req.request.params.getAll('providers')).toEqual(['Dr. Smith']);
      req.flush({ data: mockKpiData });
    });

    it('passes locations array param', () => {
      service.getKpis(undefined, undefined, false, undefined, undefined, ['Loc A']).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/kpis`);
      expect(req.request.params.getAll('locations')).toEqual(['Loc A']);
      req.flush({ data: mockKpiData });
    });
  });

  // -- getCollectionsByPracticeGroup$ string userId --------------------------

  it('getCollectionsByPracticeGroup$ accepts string userId', () => {
    service.getCollectionsByPracticeGroup$('99').subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/collections/all`);
    expect(req.request.params.get('user_id')).toBe('99');
    req.flush([]);
  });

  // -- getFinancialOverview --------------------------------------------------

  describe('getFinancialOverview()', () => {
    it('GET provider-dashboard without params', () => {
      service.getFinancialOverview().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/reports/provider-dashboard'));
      expect(req.request.method).toBe('GET');
      req.flush({ todayProduction: 5000, latestDay: null, mtdProduction: 50000, ytdProduction: 400000, mtdCollections: 45000, ytdCollections: 380000, outstandingAR: 120000, mtdWriteOffs: 2000, trend: [], productionArrow: 'up' });
    });

    it('GET provider-dashboard with locations, payers, providers', () => {
      service.getFinancialOverview(['Loc1'], ['BCBS'], ['Dr. A']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/provider-dashboard'));
      expect(req.request.url).toContain('locations=Loc1');
      req.flush({});
    });

    it('includes payers in query string', () => {
      service.getFinancialOverview(undefined, ['Aetna']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/provider-dashboard'));
      expect(req.request.url).toContain('payers=Aetna');
      req.flush({});
    });

    it('includes providers in query string', () => {
      service.getFinancialOverview(undefined, undefined, ['Dr. B']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/provider-dashboard'));
      expect(req.request.url).toContain('providers=Dr.+B');
      req.flush({});
    });
  });

  // -- getWriteOffs ----------------------------------------------------------

  describe('getWriteOffs()', () => {
    it('GET write-offs with date range', () => {
      service.getWriteOffs('2026-01-01', '2026-12-31').subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/reports/write-offs'));
      expect(req.request.url).toContain('dateFrom=2026-01-01');
      expect(req.request.url).toContain('dateTo=2026-12-31');
      req.flush({ byProvider: [], byType: [], summary: {} });
    });

    it('GET write-offs with all filter params', () => {
      service.getWriteOffs('2026-01-01', '2026-03-31', ['Loc1'], ['BCBS'], ['Dr. A']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/write-offs'));
      expect(req.request.url).toContain('locations=Loc1');
      req.flush({ byProvider: [], byType: [], summary: {} });
    });
  });

  // -- getWriteOffAnomalies --------------------------------------------------

  describe('getWriteOffAnomalies()', () => {
    it('GET write-off-anomalies without params', () => {
      service.getWriteOffAnomalies().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/reports/write-off-anomalies'));
      req.flush({ anomalies: [] });
    });

    it('GET write-off-anomalies with params', () => {
      service.getWriteOffAnomalies(['Loc1'], ['BCBS'], ['Dr. A']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/write-off-anomalies'));
      expect(req.request.url).toContain('locations=Loc1');
      req.flush({ anomalies: [] });
    });
  });

  // -- getClaimVelocity ------------------------------------------------------

  describe('getClaimVelocity()', () => {
    it('GET claim-velocity with date range', () => {
      service.getClaimVelocity('2026-01-01', '2026-12-31').subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/reports/claim-velocity'));
      expect(req.request.url).toContain('dateFrom=2026-01-01');
      req.flush({ overall: {}, byPayer: [] });
    });

    it('GET claim-velocity with filter params', () => {
      service.getClaimVelocity('2026-01-01', '2026-12-31', ['Loc1'], ['BCBS'], ['Dr. A']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/claim-velocity'));
      expect(req.request.url).toContain('locations=Loc1');
      req.flush({ overall: {}, byPayer: [] });
    });
  });

  // -- getStalledClaims ------------------------------------------------------

  describe('getStalledClaims()', () => {
    it('GET stalled-claims with defaults', () => {
      service.getStalledClaims().subscribe(data => {
        expect(data.claims).toBeDefined();
        expect(data.total).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/reports/stalled-claims'));
      expect(req.request.url).toContain('thresholdDays=30');
      expect(req.request.url).toContain('page=1');
      expect(req.request.url).toContain('limit=15');
      req.flush({ claims: [], total: 0 });
    });

    it('GET stalled-claims with custom params', () => {
      service.getStalledClaims(60, 2, 25, ['Loc1'], ['BCBS'], ['Dr. A']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/stalled-claims'));
      expect(req.request.url).toContain('thresholdDays=60');
      expect(req.request.url).toContain('page=2');
      expect(req.request.url).toContain('limit=25');
      req.flush({ claims: [], total: 0 });
    });
  });

  // -- getProviderDailyProduction --------------------------------------------

  describe('getProviderDailyProduction()', () => {
    it('GET provider-daily-production without params', () => {
      service.getProviderDailyProduction().subscribe(data => {
        expect(data.rows).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/reports/provider-daily-production'));
      req.flush({ rows: [], asOf: '2026-06-05' });
    });

    it('GET provider-daily-production with dayDate', () => {
      service.getProviderDailyProduction('2026-06-05').subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/provider-daily-production'));
      expect(req.request.url).toContain('dayDate=2026-06-05');
      req.flush({ rows: [], asOf: '2026-06-05' });
    });

    it('GET provider-daily-production with locations and providers', () => {
      service.getProviderDailyProduction(undefined, ['Loc1'], ['Dr. A']).subscribe();
      const req = http.expectOne(r => r.url.includes('/reports/provider-daily-production'));
      expect(req.request.url).toContain('locations=Loc1');
      req.flush({ rows: [], asOf: '2026-06-05' });
    });
  });

  // -- getTreatmentAcceptanceSummary -----------------------------------------

  describe('getTreatmentAcceptanceSummary()', () => {
    it('GET treatment-acceptance/summary without params', () => {
      service.getTreatmentAcceptanceSummary().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/treatment-acceptance/summary'));
      req.flush({ overall: { totalPlans: 100, totalPresented: 80, totalAccepted: 60, acceptanceRate: 0.75, rag: 'green' }, byType: [], dateFrom: '', dateTo: '' });
    });

    it('GET treatment-acceptance/summary with date params', () => {
      service.getTreatmentAcceptanceSummary('2026-01-01', '2026-12-31').subscribe();
      const req = http.expectOne(r => r.url.includes('/treatment-acceptance/summary'));
      expect(req.request.url).toContain('dateFrom=2026-01-01');
      expect(req.request.url).toContain('dateTo=2026-12-31');
      req.flush({ overall: {}, byType: [], dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    });

    it('GET treatment-acceptance/summary with providers', () => {
      service.getTreatmentAcceptanceSummary(undefined, undefined, ['Dr. A']).subscribe();
      const req = http.expectOne(r => r.url.includes('/treatment-acceptance/summary'));
      expect(req.request.url).toContain('providers=Dr.+A');
      req.flush({ overall: {}, byType: [], dateFrom: '', dateTo: '' });
    });
  });

  // -- getTreatmentAcceptanceTrend --------------------------------------------

  describe('getTreatmentAcceptanceTrend()', () => {
    it('GET treatment-acceptance/trend', () => {
      service.getTreatmentAcceptanceTrend().subscribe(data => {
        expect(data.trend).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/treatment-acceptance/trend`);
      expect(req.request.method).toBe('GET');
      req.flush({ trend: [] });
    });
  });

  // -- getPatientLtv ---------------------------------------------------------

  describe('getPatientLtv()', () => {
    it('GET patient-ltv', () => {
      service.getPatientLtv().subscribe(data => {
        expect(data.summary).toBeDefined();
        expect(data.byCohort).toBeDefined();
        expect(data.byPayer).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/patient-ltv`);
      expect(req.request.method).toBe('GET');
      req.flush({ summary: { totalPatients: 500, avgLtv: 2000, totalLifetimeValue: 1000000, avgActiveMonths: 12, avgClaimsPerPatient: 8 }, byCohort: [], byPayer: [] });
    });
  });

  // -- getTopPatients --------------------------------------------------------

  describe('getTopPatients()', () => {
    it('GET top-patients with defaults', () => {
      service.getTopPatients().subscribe(data => {
        expect(data.patients).toBeDefined();
        expect(data.total).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/patient-ltv/top-patients'));
      expect(req.request.url).toContain('page=1');
      expect(req.request.url).toContain('limit=20');
      req.flush({ patients: [], total: 0, page: 1, limit: 20 });
    });

    it('GET top-patients with custom page and limit', () => {
      service.getTopPatients(3, 50).subscribe();
      const req = http.expectOne(r => r.url.includes('/patient-ltv/top-patients'));
      expect(req.request.url).toContain('page=3');
      expect(req.request.url).toContain('limit=50');
      req.flush({ patients: [], total: 0, page: 3, limit: 50 });
    });
  });

  // -- getBadDebt ------------------------------------------------------------

  describe('getBadDebt()', () => {
    it('GET bad-debt', () => {
      service.getBadDebt().subscribe(data => {
        expect(data.summary).toBeDefined();
        expect(data.byPayer).toBeDefined();
        expect(data.byAgeBucket).toBeDefined();
        expect(data.monthlyTrend).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/bad-debt`);
      expect(req.request.method).toBe('GET');
      req.flush({ summary: { totalWriteOffsYTD: 50000, pctOfRevenue: 0.03, avgPerClaim: 150, claimsWithWriteOff: 333 }, byPayer: [], byAgeBucket: [], monthlyTrend: [] });
    });
  });

  // -- getCycleTime ----------------------------------------------------------

  describe('getCycleTime()', () => {
    it('GET cycle-time', () => {
      service.getCycleTime().subscribe(data => {
        expect(data.summary).toBeDefined();
        expect(data.monthlyTrend).toBeDefined();
        expect(data.slowestPayers).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/cycle-time`);
      expect(req.request.method).toBe('GET');
      req.flush({ summary: { avgCycleDays: 35, totalClaims: 1000, pctWithin30: 0.4, pctWithin60: 0.7, pctWithin90: 0.9, pctWithin120: 0.98 }, monthlyTrend: [], slowestPayers: [] });
    });
  });

  // -- getPreauthAnalytics ---------------------------------------------------

  describe('getPreauthAnalytics()', () => {
    it('GET preauth-analytics', () => {
      service.getPreauthAnalytics().subscribe(data => {
        expect(data.summary).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/preauth-analytics`);
      expect(req.request.method).toBe('GET');
      req.flush({ summary: { totalClaims: 200, deniedClaims: 20, approvalRate: 0.9, avgProcessingDays: 3 }, byPayer: [], byProcedure: [], monthlyTrend: [] });
    });
  });

  // -- getReactivation -------------------------------------------------------

  describe('getReactivation()', () => {
    it('GET reactivation with defaults', () => {
      service.getReactivation().subscribe(data => {
        expect(data.summary).toBeDefined();
        expect(data.patients).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/reactivation'));
      expect(req.request.url).toContain('minDays=365');
      expect(req.request.url).toContain('maxDays=99999');
      expect(req.request.url).toContain('page=1');
      expect(req.request.url).toContain('limit=50');
      req.flush({ summary: { lapsedCount: 50, atRiskCount: 30, activeCount: 420, totalPatients: 500, reactivatedLast90: 15 }, patients: [], total: 50, page: 1, limit: 50 });
    });

    it('GET reactivation with custom params', () => {
      service.getReactivation(180, 720, 2, 25).subscribe();
      const req = http.expectOne(r => r.url.includes('/reactivation'));
      expect(req.request.url).toContain('minDays=180');
      expect(req.request.url).toContain('maxDays=720');
      expect(req.request.url).toContain('page=2');
      expect(req.request.url).toContain('limit=25');
      req.flush({ summary: {}, patients: [], total: 0, page: 2, limit: 25 });
    });
  });

  // -- getClaimsAnalytics ----------------------------------------------------

  describe('getClaimsAnalytics()', () => {
    it('GET claims-analytics without params', () => {
      service.getClaimsAnalytics().subscribe(data => {
        expect(data.summary).toBeDefined();
      });
      const req = http.expectOne(r => r.url.includes('/claims-analytics'));
      req.flush({ summary: { totalClaims: 1000, totalBilled: 500000, totalPaid: 450000, avgPerClaim: 450 }, topProcedures: [], payerMix: [], monthlyTrend: [] });
    });

    it('GET claims-analytics with date params', () => {
      service.getClaimsAnalytics('2026-01-01', '2026-06-30').subscribe();
      const req = http.expectOne(r => r.url.includes('/claims-analytics'));
      expect(req.request.url).toContain('startDate=2026-01-01');
      expect(req.request.url).toContain('endDate=2026-06-30');
      req.flush({ summary: {}, topProcedures: [], payerMix: [], monthlyTrend: [] });
    });
  });

  // -- getBillingRecommendations --------------------------------------------

  describe('getBillingRecommendations()', () => {
    it('GET billing-optimization/recommendations', () => {
      service.getBillingRecommendations().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/billing-optimization/recommendations`);
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, title: 'Rec 1' }]);
    });
  });

  // -- getBillingStats -------------------------------------------------------

  describe('getBillingStats()', () => {
    it('GET billing-optimization/stats', () => {
      service.getBillingStats().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/billing-optimization/stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ totalSavings: 5000 });
    });
  });

  // -- updateBillingRecStatus ------------------------------------------------

  describe('updateBillingRecStatus()', () => {
    it('PUT billing-optimization/:id/status', () => {
      service.updateBillingRecStatus(42, 'resolved').subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/billing-optimization/42/status`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ status: 'resolved' });
      req.flush({ message: 'ok' });
    });
  });

  // -- getAutoSubmitRules ----------------------------------------------------

  describe('getAutoSubmitRules()', () => {
    it('GET claim-auto-submission/rules', () => {
      service.getAutoSubmitRules().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/claim-auto-submission/rules`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getAutoSubmitQueue ----------------------------------------------------

  describe('getAutoSubmitQueue()', () => {
    it('GET claim-auto-submission/queue', () => {
      service.getAutoSubmitQueue().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/claim-auto-submission/queue`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getAutoSubmitStats ----------------------------------------------------

  describe('getAutoSubmitStats()', () => {
    it('GET claim-auto-submission/stats', () => {
      service.getAutoSubmitStats().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/claim-auto-submission/stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ totalQueued: 10, autoAccepted: 5 });
    });
  });

  // -- toggleAutoSubmitRule --------------------------------------------------

  describe('toggleAutoSubmitRule()', () => {
    it('PUT claim-auto-submission/rules/:id/toggle', () => {
      service.toggleAutoSubmitRule(7).subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/claim-auto-submission/rules/7/toggle`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({});
      req.flush({ message: 'ok' });
    });
  });

  // -- getDenialPredictions --------------------------------------------------

  describe('getDenialPredictions()', () => {
    it('GET denial-prediction/predictions', () => {
      service.getDenialPredictions().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/denial-prediction/predictions`);
      expect(req.request.method).toBe('GET');
      req.flush([{ claimId: 'CL5001', riskScore: 0.8 }]);
    });
  });

  // -- getDenialPredictionAccuracy -------------------------------------------

  describe('getDenialPredictionAccuracy()', () => {
    it('GET denial-prediction/accuracy', () => {
      service.getDenialPredictionAccuracy().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/denial-prediction/accuracy`);
      expect(req.request.method).toBe('GET');
      req.flush({ accuracy: 0.87 });
    });
  });

  // -- getCleanClaimIssues ---------------------------------------------------

  describe('getCleanClaimIssues()', () => {
    it('GET clean-claim/issues', () => {
      service.getCleanClaimIssues().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/clean-claim/issues`);
      expect(req.request.method).toBe('GET');
      req.flush([{ claimId: 'CL5001', issue: 'Missing diagnosis' }]);
    });
  });

  // -- getCleanClaimStats ----------------------------------------------------

  describe('getCleanClaimStats()', () => {
    it('GET clean-claim/stats', () => {
      service.getCleanClaimStats().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/clean-claim/stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ cleanRate: 0.94, issueCount: 60 });
    });
  });

  // -- autoFixClaims ---------------------------------------------------------

  describe('autoFixClaims()', () => {
    it('POST clean-claim/auto-fix with claimIds', () => {
      service.autoFixClaims([1, 2, 3]).subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/clean-claim/auto-fix`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ claimIds: [1, 2, 3] });
      req.flush({ fixed: 3 });
    });
  });

  // -- getImageVerificationQueue ---------------------------------------------

  describe('getImageVerificationQueue()', () => {
    it('GET image-verification/queue', () => {
      service.getImageVerificationQueue().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/image-verification/queue`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getImageVerificationStats ---------------------------------------------

  describe('getImageVerificationStats()', () => {
    it('GET image-verification/stats', () => {
      service.getImageVerificationStats().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/image-verification/stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ verified: 100, pending: 5 });
    });
  });

  // -- verifyClaimImage ------------------------------------------------------

  describe('verifyClaimImage()', () => {
    it('PUT image-verification/:claimId/verify', () => {
      service.verifyClaimImage('CL5001').subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/image-verification/CL5001/verify`);
      expect(req.request.method).toBe('PUT');
      req.flush({ message: 'ok' });
    });
  });

  // -- rejectClaimImage ------------------------------------------------------

  describe('rejectClaimImage()', () => {
    it('PUT image-verification/:claimId/reject', () => {
      service.rejectClaimImage('CL5002', 'Blurry image').subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/image-verification/CL5002/reject`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ reason: 'Blurry image' });
      req.flush({ message: 'ok' });
    });
  });

  // -- getConsultants --------------------------------------------------------

  describe('getConsultants()', () => {
    it('GET rcm-consulting/consultants', () => {
      service.getConsultants().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/rcm-consulting/consultants`);
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, name: 'Dr. Consultant' }]);
    });
  });

  // -- getConsultingRecommendations ------------------------------------------

  describe('getConsultingRecommendations()', () => {
    it('GET rcm-consulting/recommendations', () => {
      service.getConsultingRecommendations().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/rcm-consulting/recommendations`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getConsultingSessions -------------------------------------------------

  describe('getConsultingSessions()', () => {
    it('GET rcm-consulting/sessions', () => {
      service.getConsultingSessions().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/rcm-consulting/sessions`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getConsultingMetrics --------------------------------------------------

  describe('getConsultingMetrics()', () => {
    it('GET rcm-consulting/metrics', () => {
      service.getConsultingMetrics().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/rcm-consulting/metrics`);
      expect(req.request.method).toBe('GET');
      req.flush({ avgScore: 4.5, totalSessions: 12 });
    });
  });

  // -- getAppealSuccessByPayer -----------------------------------------------

  describe('getAppealSuccessByPayer()', () => {
    it('GET appeal-success/by-payer', () => {
      service.getAppealSuccessByPayer().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/appeal-success/by-payer`);
      expect(req.request.method).toBe('GET');
      req.flush([{ payer: 'BCBS', successRate: 0.65 }]);
    });
  });

  // -- getAppealSuccessByCaRC ------------------------------------------------

  describe('getAppealSuccessByCaRC()', () => {
    it('GET appeal-success/by-carc', () => {
      service.getAppealSuccessByCaRC().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/appeal-success/by-carc`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getAppealSuccessTrend -------------------------------------------------

  describe('getAppealSuccessTrend()', () => {
    it('GET appeal-success/trend', () => {
      service.getAppealSuccessTrend().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/appeal-success/trend`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getAppealSuccessStats -------------------------------------------------

  describe('getAppealSuccessStats()', () => {
    it('GET appeal-success/stats', () => {
      service.getAppealSuccessStats().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/appeal-success/stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ totalAppeals: 200, successRate: 0.55 });
    });
  });

  // -- getCptDenialRiskMatrix ------------------------------------------------

  describe('getCptDenialRiskMatrix()', () => {
    it('GET cpt-denial/risk-matrix', () => {
      service.getCptDenialRiskMatrix().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/cpt-denial/risk-matrix`);
      expect(req.request.method).toBe('GET');
      req.flush({ matrix: [] });
    });
  });

  // -- getCptDenialHighRisk --------------------------------------------------

  describe('getCptDenialHighRisk()', () => {
    it('GET cpt-denial/high-risk', () => {
      service.getCptDenialHighRisk().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/cpt-denial/high-risk`);
      expect(req.request.method).toBe('GET');
      req.flush([{ cpt: 'D0120', riskScore: 0.75 }]);
    });
  });

  // -- getCptDenialByCpt -----------------------------------------------------

  describe('getCptDenialByCpt()', () => {
    it('GET cpt-denial/by-cpt', () => {
      service.getCptDenialByCpt().subscribe(data => {
        expect(Array.isArray(data)).toBeTrue();
      });
      const req = http.expectOne(`${BASE}/cpt-denial/by-cpt`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  // -- getCptDenialStats -----------------------------------------------------

  describe('getCptDenialStats()', () => {
    it('GET cpt-denial/stats', () => {
      service.getCptDenialStats().subscribe(data => {
        expect(data).toBeDefined();
      });
      const req = http.expectOne(`${BASE}/cpt-denial/stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ avgDenialRate: 0.12, highRiskCount: 15 });
    });
  });
});
