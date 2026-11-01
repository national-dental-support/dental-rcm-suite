import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  DenialManagementService, DenialTrendPoint, DenialKpis, DenialReason, InsightflowFilterOptions,
} from './denial-management.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = `${environment.server.baseUrl}/insightflow/denial-management`;
const INSIGHTFLOW_BASE = `${environment.server.baseUrl}/insightflow`;
const PAYER_INTEL_BASE = `${environment.server.baseUrl}/denial-iq/payer-intelligence`;
const APPEALS_BASE = `${environment.server.baseUrl}/denial-iq/appeals`;
const PENDING_CONFIG_BASE = `${environment.server.baseUrl}/denial-iq/pending-config`;
const PRIORITY_BASE = `${environment.server.baseUrl}/admin/priority`;
const GROUPS_BASE = `${environment.server.baseUrl}/denial-iq/admin/groups`;
const APPROVALS_BASE = `${environment.server.baseUrl}/denial-iq/approvals`;
const NARRATIVE_BASE = `${environment.server.baseUrl}/denial-iq/narrative-score`;
const REWRITE_BASE = `${environment.server.baseUrl}/denial-iq/claim-rewrite`;
const PACKAGE_BASE = `${environment.server.baseUrl}/denial-iq/resubmission-package`;
const FORECAST_BASE = `${environment.server.baseUrl}/ai/collections-forecast`;
const TPL_PERF_BASE = `${environment.server.baseUrl}/denial-iq/template-performance`;

const mockTrend: DenialTrendPoint[] = [
  { PeriodLabel: '2024-12', DeniedClaims: 50, DeniedCharges: 25000 },
  { PeriodLabel: '2025-01', DeniedClaims: 40, DeniedCharges: 20000 },
];

const mockKpis: DenialKpis = {
  currentDeniedClaims: 40, currentDeniedCharges: 20000,
  denialRate: 0.12, recoveryRate: 0.65,
  deltaClaimsYoy: -0.05, deltaChargesYoy: -0.08, deltaDenialRateYoy: -0.02,
};

const mockReasons: DenialReason[] = [
  { Reason: 'CO-4', CurrentAmount: 8000, PreviousAmount: 9500 },
  { Reason: 'CO-16', CurrentAmount: 5000, PreviousAmount: 4800 },
];

const mockFilterOptions: InsightflowFilterOptions = {
  payers: ['BlueCross', 'Aetna'],
  providers: ['Dr. Smith', 'Dr. Jones'],
  locations: ['Main Office'],
};

describe('DenialManagementService', () => {
  let service: DenialManagementService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [DenialManagementService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(DenialManagementService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // -- Trend ------------------------------------------------------------------

  describe('getTrend()', () => {
    it('GET /insightflow/denial-management/trend returns trend array', () => {
      service.getTrend().subscribe(t => {
        expect(t.length).toBe(2);
        expect(t[0].PeriodLabel).toBe('2024-12');
      });
      const req = http.expectOne(r => r.url === `${BASE}/trend`);
      req.flush({ data: mockTrend });
    });

    it('sends start and end filters as query params', () => {
      service.getTrend({ start: '2024-01-01', end: '2024-12-31' }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/trend` &&
        r.params.get('start') === '2024-01-01' &&
        r.params.get('end') === '2024-12-31'
      );
      expect(req).toBeTruthy();
      req.flush({ data: mockTrend });
    });

    it('sends multiple payer filters as repeated params', () => {
      service.getTrend({ payers: ['BlueCross', 'Aetna'] }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/trend` && r.params.getAll('payer')?.length === 2
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('maps null data to empty array', () => {
      service.getTrend().subscribe(t => expect(t).toEqual([]));
      http.expectOne(r => r.url === `${BASE}/trend`).flush({ data: null });
    });

    it('sends providers filter as repeated params', () => {
      service.getTrend({ providers: ['Dr. Smith', 'Dr. Jones'] }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/trend` && r.params.getAll('provider')?.length === 2
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('sends locations filter as repeated params', () => {
      service.getTrend({ locations: ['Main', 'Branch'] }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/trend` && r.params.getAll('location')?.length === 2
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('sends practices filter as repeated params', () => {
      service.getTrend({ practices: ['P1', 'P2'] }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/trend` && r.params.getAll('practice')?.length === 2
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });
  });

  // -- KPIs ------------------------------------------------------------------

  describe('getKpis()', () => {
    it('GET /insightflow/denial-management/kpis returns KPI object', () => {
      service.getKpis().subscribe(k => {
        expect(k).toBeTruthy();
        expect(k!.denialRate).toBe(0.12);
      });
      http.expectOne(r => r.url === `${BASE}/kpis`).flush({ data: mockKpis });
    });

    it('sends filter params', () => {
      service.getKpis({ start: '2025-01-01' }).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/kpis` && r.params.get('start') === '2025-01-01');
      expect(req).toBeTruthy();
      req.flush({ data: mockKpis });
    });

    it('maps null KPIs to null', () => {
      service.getKpis().subscribe(k => expect(k).toBeNull());
      http.expectOne(r => r.url === `${BASE}/kpis`).flush({ data: null });
    });
  });

  // -- Top Reasons -----------------------------------------------------------

  describe('getTopReasons()', () => {
    it('GET /insightflow/denial-management/top-reasons returns reason array', () => {
      service.getTopReasons().subscribe(r => {
        expect(r.length).toBe(2);
        expect(r[0].Reason).toBe('CO-4');
      });
      http.expectOne(r => r.url === `${BASE}/top-reasons`).flush({ data: mockReasons });
    });

    it('maps null data to empty array', () => {
      service.getTopReasons().subscribe(r => expect(r).toEqual([]));
      http.expectOne(r => r.url === `${BASE}/top-reasons`).flush({ data: null });
    });
  });

  // -- Filter Options --------------------------------------------------------

  describe('getFilterOptions()', () => {
    it('GET /insightflow/filter-options returns payers, providers, locations', () => {
      service.getFilterOptions().subscribe(opts => {
        expect(opts.payers).toContain('BlueCross');
        expect(opts.providers.length).toBe(2);
      });
      http.expectOne(`${INSIGHTFLOW_BASE}/filter-options`).flush(mockFilterOptions);
    });
  });

  // -- Codes & Claims drill-down ----------------------------------------------

  describe('getCodesForGrouping()', () => {
    it('sends grouping param and returns code rows', () => {
      service.getCodesForGrouping('CO-4').subscribe(rows => {
        expect(rows.length).toBe(1);
      });
      const req = http.expectOne(r =>
        r.url === `${BASE}/top-reasons/codes` && r.params.get('grouping') === 'CO-4'
      );
      req.flush({ data: [{ carcCode: 'CO-4', rarcCode: null, ClaimCount: 5, CurrentAmount: 1000, PreviousAmount: 900 }] });
    });

    it('maps null data to empty array', () => {
      service.getCodesForGrouping('CO-16').subscribe(rows => expect(rows).toEqual([]));
      http.expectOne(r => r.url === `${BASE}/top-reasons/codes`).flush({ data: null });
    });

    it('sends filters along with grouping', () => {
      service.getCodesForGrouping('CO-4', { start: '2025-01-01' }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/top-reasons/codes` &&
        r.params.get('grouping') === 'CO-4' &&
        r.params.get('start') === '2025-01-01'
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });
  });

  describe('getClaimsForCode()', () => {
    it('sends carc and rarc params', () => {
      service.getClaimsForCode('CO-4', 'M79').subscribe(rows => {
        expect(rows.length).toBe(1);
      });
      const req = http.expectOne(r =>
        r.url === `${BASE}/top-reasons/claims` &&
        r.params.get('carc') === 'CO-4' &&
        r.params.get('rarc') === 'M79'
      );
      req.flush({ data: [{ claimId: 'CL51234', patientName: 'John Doe', payerName: 'BlueCross', providerName: 'Dr. Smith', dateOfService: '2025-01-15', chargeAmount: 500 }] });
    });

    it('sends empty string when rarc is null', () => {
      service.getClaimsForCode('CO-16', null).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/top-reasons/claims` && r.params.get('rarc') === ''
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('maps null data to empty array', () => {
      service.getClaimsForCode('CO-4', null).subscribe(rows => expect(rows).toEqual([]));
      http.expectOne(r => r.url === `${BASE}/top-reasons/claims`).flush({ data: null });
    });
  });

  // -- Payer Intelligence ----------------------------------------------------

  describe('listCarcDescriptions()', () => {
    it('returns CARC description list', () => {
      service.listCarcDescriptions().subscribe(list => {
        expect(list.length).toBe(1);
        expect(list[0].code).toBe('CO-4');
      });
      http.expectOne(`${PAYER_INTEL_BASE}/carc-descriptions`).flush({ data: [{ code: 'CO-4', description: 'Non-covered charge' }] });
    });

    it('returns empty array on error', () => {
      service.listCarcDescriptions().subscribe(list => expect(list).toEqual([]));
      http.expectOne(`${PAYER_INTEL_BASE}/carc-descriptions`).flush('err', { status: 500, statusText: 'Server Error' });
    });

    it('maps null data to empty array', () => {
      service.listCarcDescriptions().subscribe(list => expect(list).toEqual([]));
      http.expectOne(`${PAYER_INTEL_BASE}/carc-descriptions`).flush({ data: null });
    });
  });

  describe('getCarcDetail()', () => {
    it('fetches CARC guidance without payerName', () => {
      service.getCarcDetail('CO-4').subscribe(detail => {
        expect(detail).toBeTruthy();
        expect(detail!.code).toBe('CO-4');
      });
      http.expectOne(r => r.url.includes('/carc/CO-4') && !r.params.has('payerName')).flush({ data: { code: 'CO-4', description: null, category: 'Contractual', common_cause: null, resolution: null, prevention: null, payer_specific: false, filing_deadline_days: null, appeal_days: null } });
    });

    it('sends payerName when provided', () => {
      service.getCarcDetail('CO-4', 'BlueCross').subscribe();
      const req = http.expectOne(r => r.url.includes('/carc/CO-4') && r.params.get('payerName') === 'BlueCross');
      expect(req).toBeTruthy();
      req.flush({ data: null });
    });

    it('maps null data to null', () => {
      service.getCarcDetail('CO-99').subscribe(d => expect(d).toBeNull());
      http.expectOne(r => r.url.includes('/carc/CO-99')).flush({ data: null });
    });
  });

  describe('listCarcLibrary()', () => {
    it('fetches library with page param by default', () => {
      service.listCarcLibrary().subscribe(res => {
        expect(res.total).toBe(100);
      });
      const req = http.expectOne(r => r.url === `${PAYER_INTEL_BASE}/carc-library` && r.params.get('page') === '1');
      req.flush({ data: [], total: 100 });
    });

    it('sends search and category when provided', () => {
      service.listCarcLibrary('CO', 'Contractual', 2).subscribe();
      const req = http.expectOne(r =>
        r.url === `${PAYER_INTEL_BASE}/carc-library` &&
        r.params.get('search') === 'CO' &&
        r.params.get('category') === 'Contractual' &&
        r.params.get('page') === '2'
      );
      expect(req).toBeTruthy();
      req.flush({ data: [], total: 0 });
    });

    it('does not send search param when empty', () => {
      service.listCarcLibrary('', '').subscribe();
      const req = http.expectOne(r => r.url === `${PAYER_INTEL_BASE}/carc-library`);
      expect(req.request.params.has('search')).toBeFalse();
      expect(req.request.params.has('category')).toBeFalse();
      req.flush({ data: [], total: 0 });
    });
  });

  describe('getPayerDeadline()', () => {
    it('fetches deadline for a payer', () => {
      service.getPayerDeadline('BlueCross').subscribe(d => {
        expect(d).toBeTruthy();
        expect(d!.payer_name).toBe('BlueCross');
      });
      const req = http.expectOne(r => r.url === `${PAYER_INTEL_BASE}/deadlines` && r.params.get('payerName') === 'BlueCross');
      req.flush({ data: { id: 1, payer_name: 'BlueCross', deadline_days: 90, appeal_days: 60, notes: null } });
    });

    it('returns null when payer has no deadline', () => {
      service.getPayerDeadline('Unknown').subscribe(d => expect(d).toBeNull());
      http.expectOne(r => r.url === `${PAYER_INTEL_BASE}/deadlines`).flush({ data: null });
    });
  });

  describe('listPayerDeadlines()', () => {
    it('returns all payer deadlines', () => {
      service.listPayerDeadlines().subscribe(list => expect(list.length).toBe(1));
      http.expectOne(`${PAYER_INTEL_BASE}/deadlines/all`).flush({ data: [{ id: 1, payer_name: 'Aetna', deadline_days: 90, appeal_days: 60, notes: null }] });
    });

    it('returns empty array on error', () => {
      service.listPayerDeadlines().subscribe(list => expect(list).toEqual([]));
      http.expectOne(`${PAYER_INTEL_BASE}/deadlines/all`).flush('err', { status: 500, statusText: 'Error' });
    });

    it('maps null data to empty array', () => {
      service.listPayerDeadlines().subscribe(list => expect(list).toEqual([]));
      http.expectOne(`${PAYER_INTEL_BASE}/deadlines/all`).flush({ data: null });
    });
  });

  describe('upsertPayerDeadline()', () => {
    it('POSTs payer deadline body', () => {
      const body = { payer_name: 'BlueCross', deadline_days: 90, appeal_days: 60, notes: null };
      service.upsertPayerDeadline(body).subscribe(res => expect(res.ok).toBeTrue());
      const req = http.expectOne(`${PAYER_INTEL_BASE}/deadlines`);
      expect(req.request.method).toBe('POST');
      req.flush({ ok: true });
    });
  });

  // -- Appeals ---------------------------------------------------------------

  describe('listAppealTemplates()', () => {
    it('fetches templates without all param by default', () => {
      service.listAppealTemplates().subscribe(list => expect(list.length).toBe(1));
      const req = http.expectOne(`${APPEALS_BASE}/templates`);
      req.flush({ data: [{ id: 1, template_name: 'Standard', denial_category: null, carc_codes: null, subject_line: 'Appeal', body_template: 'Dear...', closing_text: null, is_active: true }] });
    });

    it('fetches templates with all=1 when all=true', () => {
      service.listAppealTemplates(true).subscribe();
      const req = http.expectOne(`${APPEALS_BASE}/templates?all=1`);
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('returns empty array on error', () => {
      service.listAppealTemplates().subscribe(list => expect(list).toEqual([]));
      http.expectOne(`${APPEALS_BASE}/templates`).flush('err', { status: 500, statusText: 'Error' });
    });

    it('maps null data to empty array', () => {
      service.listAppealTemplates().subscribe(list => expect(list).toEqual([]));
      http.expectOne(`${APPEALS_BASE}/templates`).flush({ data: null });
    });
  });

  describe('createAppealTemplate()', () => {
    it('POSTs and maps response data', () => {
      const body = { template_name: 'New', subject_line: 'Appeal', body_template: 'Dear...', is_active: true };
      service.createAppealTemplate(body).subscribe(t => expect(t.template_name).toBe('New'));
      const req = http.expectOne(`${APPEALS_BASE}/templates`);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { id: 2, ...body, denial_category: null, carc_codes: null, closing_text: null } });
    });
  });

  describe('updateAppealTemplate()', () => {
    it('PUTs to template endpoint', () => {
      service.updateAppealTemplate(1, { subject_line: 'Updated' }).subscribe();
      const req = http.expectOne(`${APPEALS_BASE}/templates/1`);
      expect(req.request.method).toBe('PUT');
      req.flush(null);
    });
  });

  describe('deleteAppealTemplate()', () => {
    it('DELETEs template by id', () => {
      service.deleteAppealTemplate(1).subscribe();
      const req = http.expectOne(`${APPEALS_BASE}/templates/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('generateAppealLetter()', () => {
    it('POSTs claim generation request', () => {
      service.generateAppealLetter('CL51234').subscribe(res => expect(res.letter).toBe('Dear Payer...'));
      const req = http.expectOne(`${APPEALS_BASE}/generate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.claimId).toBe('CL51234');
      req.flush({ appeal: { id: 1 }, letter: 'Dear Payer...' });
    });

    it('sends templateId and customNotes when provided', () => {
      service.generateAppealLetter('CL51234', 3, 'Custom notes').subscribe();
      const req = http.expectOne(`${APPEALS_BASE}/generate`);
      expect(req.request.body.templateId).toBe(3);
      expect(req.request.body.customNotes).toBe('Custom notes');
      req.flush({ appeal: {}, letter: '' });
    });
  });

  describe('generateAiAppealLetter()', () => {
    it('POSTs to generate-ai endpoint', () => {
      service.generateAiAppealLetter('CL51234', 'AI notes').subscribe(res => expect(res.source).toBe('ai'));
      const req = http.expectOne(`${APPEALS_BASE}/generate-ai`);
      expect(req.request.method).toBe('POST');
      req.flush({ appeal: {}, letter: 'AI letter', source: 'ai' });
    });
  });

  describe('listClaimAppeals()', () => {
    it('GETs appeals for a claim', () => {
      service.listClaimAppeals('CL51234').subscribe(appeals => expect(appeals.length).toBe(1));
      const req = http.expectOne(r => r.url === APPEALS_BASE && r.params.get('claimId') === 'CL51234');
      req.flush({ data: [{ id: 1, claim_id: 'CL51234', template_id: null, denial_reason: null, appeal_level: 1, submitted_date: null, due_date: null, status: 'draft', generated_letter: null, notes: null, created_at: '2025-01-01' }] });
    });

    it('maps null data to empty array', () => {
      service.listClaimAppeals('CL51234').subscribe(appeals => expect(appeals).toEqual([]));
      http.expectOne(r => r.url === APPEALS_BASE).flush({ data: null });
    });
  });

  describe('updateAppealStatus()', () => {
    it('PATCHes appeal status', () => {
      service.updateAppealStatus(1, 'submitted', 'Good appeal').subscribe();
      const req = http.expectOne(`${APPEALS_BASE}/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('submitted');
      expect(req.request.body.notes).toBe('Good appeal');
      req.flush(null);
    });
  });

  // -- Pending Config --------------------------------------------------------

  describe('getPendingConfig()', () => {
    it('returns pending config array', () => {
      service.getPendingConfig().subscribe(cfg => expect(cfg.length).toBe(1));
      const req = http.expectOne(PENDING_CONFIG_BASE);
      req.flush({ data: [{ customer_id: 1, pending_days: 14, updated_by: null, updated_at: null }] });
    });

    it('maps null data to empty array', () => {
      service.getPendingConfig().subscribe(cfg => expect(cfg).toEqual([]));
      http.expectOne(PENDING_CONFIG_BASE).flush({ data: null });
    });
  });

  describe('updatePendingConfig()', () => {
    it('PATCHes pending config', () => {
      service.updatePendingConfig(1, 14).subscribe();
      const req = http.expectOne(PENDING_CONFIG_BASE);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.customer_id).toBe(1);
      expect(req.request.body.pending_days).toBe(14);
      req.flush(null);
    });
  });

  // -- Priority Settings -----------------------------------------------------

  describe('getPrioritySettings()', () => {
    it('returns priority settings', () => {
      service.getPrioritySettings().subscribe(s => expect(s.enabled).toBeTrue());
      http.expectOne(`${PRIORITY_BASE}/settings`).flush({ weights: { aging: 1, value: 1, deadline: 1, workload: 1, proficiency: 1 }, enabled: true, stats: { totalScored: 100, lastRunAt: null, avgScore: 50, maxScore: 100, minScore: 0 }, distribution: { high: 10, medium: 50, low: 40 } });
    });
  });

  describe('updatePrioritySettings()', () => {
    it('PUTs priority settings', () => {
      const weights = { aging: 1, value: 2, deadline: 3, workload: 1, proficiency: 1 };
      service.updatePrioritySettings(weights, true).subscribe();
      const req = http.expectOne(`${PRIORITY_BASE}/settings`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.weights).toEqual(weights);
      expect(req.request.body.enabled).toBeTrue();
      req.flush(null);
    });
  });

  describe('recalculatePriorities()', () => {
    it('POSTs to recalculate and returns scored count', () => {
      service.recalculatePriorities().subscribe(res => expect(res.scored).toBe(42));
      const req = http.expectOne(`${PRIORITY_BASE}/recalculate`);
      expect(req.request.method).toBe('POST');
      req.flush({ scored: 42 });
    });
  });

  // -- Practice Groups -------------------------------------------------------

  describe('listGroups()', () => {
    it('returns group list', () => {
      service.listGroups().subscribe(groups => expect(groups.length).toBe(1));
      http.expectOne(GROUPS_BASE).flush({ data: [{ id: 1, name: 'Group A', is_active: true, locations: [], members: [] }] });
    });

    it('maps null data to empty array', () => {
      service.listGroups().subscribe(groups => expect(groups).toEqual([]));
      http.expectOne(GROUPS_BASE).flush({ data: null });
    });
  });

  describe('createGroup()', () => {
    it('POSTs group name and returns group', () => {
      service.createGroup('Group B').subscribe(g => expect(g.name).toBe('Group B'));
      const req = http.expectOne(GROUPS_BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.name).toBe('Group B');
      req.flush({ data: { id: 2, name: 'Group B', is_active: true, locations: [], members: [] } });
    });
  });

  describe('addGroupLocation()', () => {
    it('POSTs location to group', () => {
      service.addGroupLocation(1, 'Main Office').subscribe();
      const req = http.expectOne(`${GROUPS_BASE}/1/locations`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.location_name).toBe('Main Office');
      req.flush(null);
    });
  });

  describe('removeGroupLocation()', () => {
    it('DELETEs location from group', () => {
      service.removeGroupLocation(1, 5).subscribe();
      const req = http.expectOne(`${GROUPS_BASE}/1/locations/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  // -- Approvals -------------------------------------------------------------

  describe('listApprovals()', () => {
    it('returns approvals without filters', () => {
      service.listApprovals().subscribe(records => expect(records.length).toBe(1));
      const req = http.expectOne(r => r.url === APPROVALS_BASE && !r.params.has('status'));
      req.flush({ data: [{ id: 1, claim_id: 'CL51234', appeal_id: null, submitted_by: 'user@test.com', submitted_at: '2025-01-01', reviewer_email: null, reviewed_at: null, status: 'pending_review', reviewer_notes: null }] });
    });

    it('sends status filter when provided', () => {
      service.listApprovals('pending_review').subscribe();
      const req = http.expectOne(r => r.url === APPROVALS_BASE && r.params.get('status') === 'pending_review');
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('sends both status and claimId when provided', () => {
      service.listApprovals('approved', 'CL51234').subscribe();
      const req = http.expectOne(r =>
        r.url === APPROVALS_BASE &&
        r.params.get('status') === 'approved' &&
        r.params.get('claimId') === 'CL51234'
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('maps null data to empty array', () => {
      service.listApprovals().subscribe(records => expect(records).toEqual([]));
      http.expectOne(r => r.url === APPROVALS_BASE).flush({ data: null });
    });
  });

  describe('submitForApproval()', () => {
    it('POSTs and returns approval record', () => {
      service.submitForApproval('CL51234').subscribe(record => expect(record.claim_id).toBe('CL51234'));
      const req = http.expectOne(APPROVALS_BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.claim_id).toBe('CL51234');
      req.flush({ data: { id: 1, claim_id: 'CL51234', appeal_id: null, submitted_by: 'u@t.com', submitted_at: '2025-01-01', reviewer_email: null, reviewed_at: null, status: 'pending_review', reviewer_notes: null } });
    });
  });

  describe('reviewApproval()', () => {
    it('PATCHes approval with approved status', () => {
      service.reviewApproval(1, 'approved', 'Looks good').subscribe(res => expect(res.ok).toBeTrue());
      const req = http.expectOne(`${APPROVALS_BASE}/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('approved');
      expect(req.request.body.reviewer_notes).toBe('Looks good');
      req.flush({ ok: true });
    });
  });

  describe('recallApproval()', () => {
    it('DELETEs approval record', () => {
      service.recallApproval(1).subscribe(res => expect(res.ok).toBeTrue());
      const req = http.expectOne(`${APPROVALS_BASE}/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ ok: true });
    });
  });

  // -- Narrative Score -------------------------------------------------------

  describe('getNarrativeScore()', () => {
    it('returns narrative score for a claim', () => {
      service.getNarrativeScore('CL51234').subscribe(score => {
        expect(score).toBeTruthy();
        expect(score!.score).toBe(75);
      });
      http.expectOne(`${NARRATIVE_BASE}/CL51234`).flush({ data: { id: 1, claim_id: 'CL51234', score: 75, missing_elements: [], recommendations: [], model_version: 'v1', scored_at: '2025-01-01' } });
    });

    it('maps null data to null', () => {
      service.getNarrativeScore('CL59999').subscribe(score => expect(score).toBeNull());
      http.expectOne(`${NARRATIVE_BASE}/CL59999`).flush({ data: null });
    });
  });

  describe('scoreNarrative()', () => {
    it('POSTs to score narrative and returns result', () => {
      service.scoreNarrative('CL51234').subscribe(score => expect(score.score).toBe(80));
      const req = http.expectOne(`${NARRATIVE_BASE}/CL51234`);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { id: 1, claim_id: 'CL51234', score: 80, missing_elements: [], recommendations: [], model_version: 'v1', scored_at: '2025-01-01' } });
    });
  });

  // -- Claim Rewrite ---------------------------------------------------------

  describe('getLatestRewrite()', () => {
    it('returns latest rewrite for a claim', () => {
      service.getLatestRewrite('CL51234').subscribe(rw => {
        expect(rw).toBeTruthy();
        expect(rw!.confidence).toBe(0.9);
      });
      http.expectOne(`${REWRITE_BASE}/CL51234`).flush({ data: { id: 1, claim_id: 'CL51234', original_text: 'orig', rewritten_text: 'new', diff_hunks: [], focus_areas: [], confidence: 0.9, accepted: null, model_version: 'v1', created_at: '2025-01-01' } });
    });

    it('maps null data to null', () => {
      service.getLatestRewrite('CL59999').subscribe(rw => expect(rw).toBeNull());
      http.expectOne(`${REWRITE_BASE}/CL59999`).flush({ data: null });
    });
  });

  describe('generateRewrite()', () => {
    it('POSTs claim rewrite with narrative', () => {
      service.generateRewrite('CL51234', 'original narrative').subscribe(rw => expect(rw.claim_id).toBe('CL51234'));
      const req = http.expectOne(`${REWRITE_BASE}/CL51234`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.narrative).toBe('original narrative');
      req.flush({ data: { id: 1, claim_id: 'CL51234', original_text: 'original narrative', rewritten_text: 'new text', diff_hunks: [], focus_areas: [], confidence: 0.85, accepted: null, model_version: 'v1', created_at: '2025-01-01' } });
    });
  });

  describe('acceptRewrite()', () => {
    it('PATCHes rewrite acceptance without rewritten_text when not provided', () => {
      service.acceptRewrite(1, true).subscribe(res => expect(res.ok).toBeTrue());
      const req = http.expectOne(`${REWRITE_BASE}/1/accept`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.accepted).toBeTrue();
      expect(req.request.body.rewritten_text).toBeUndefined();
      req.flush({ ok: true });
    });

    it('PATCHes rewrite with rewritten_text when provided', () => {
      service.acceptRewrite(1, true, 'custom text').subscribe();
      const req = http.expectOne(`${REWRITE_BASE}/1/accept`);
      expect(req.request.body.rewritten_text).toBe('custom text');
      req.flush({ ok: true });
    });

    it('PATCHes rejection (accepted=false)', () => {
      service.acceptRewrite(1, false).subscribe(res => expect(res.ok).toBeTrue());
      const req = http.expectOne(`${REWRITE_BASE}/1/accept`);
      expect(req.request.body.accepted).toBeFalse();
      req.flush({ ok: true });
    });
  });

  // -- Resubmission Package --------------------------------------------------

  describe('getResubmissionPackage()', () => {
    it('returns package for claim', () => {
      service.getResubmissionPackage('CL51234').subscribe(pkg => {
        expect(pkg).toBeTruthy();
        expect(pkg!.status).toBe('draft');
      });
      http.expectOne(`${PACKAGE_BASE}/CL51234`).flush({ data: { id: 1, claim_id: 'CL51234', appeal_id: null, status: 'draft', checklist: [], corrected_claim: null, notes: null, created_by: null, submitted_at: null, attachments: [] } });
    });

    it('maps null data to null', () => {
      service.getResubmissionPackage('CL59999').subscribe(pkg => expect(pkg).toBeNull());
      http.expectOne(`${PACKAGE_BASE}/CL59999`).flush({ data: null });
    });
  });

  describe('createResubmissionPackage()', () => {
    it('POSTs package and returns result', () => {
      service.createResubmissionPackage('CL51234', { status: 'draft' }).subscribe(pkg => expect(pkg.status).toBe('draft'));
      const req = http.expectOne(`${PACKAGE_BASE}/CL51234`);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { id: 1, claim_id: 'CL51234', appeal_id: null, status: 'draft', checklist: [], corrected_claim: null, notes: null, created_by: null, submitted_at: null, attachments: [] } });
    });
  });

  describe('updateResubmissionPackage()', () => {
    it('PATCHes package by id', () => {
      service.updateResubmissionPackage(1, { status: 'ready' }).subscribe(res => expect(res.ok).toBeTrue());
      const req = http.expectOne(`${PACKAGE_BASE}/1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ok: true });
    });
  });

  describe('addAttachment()', () => {
    it('POSTs attachment to claim package', () => {
      service.addAttachment('CL51234', { file_name: 'doc.pdf', package_id: 1 }).subscribe(a => expect(a.file_name).toBe('doc.pdf'));
      const req = http.expectOne(`${PACKAGE_BASE}/CL51234/attachments`);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { id: 1, file_name: 'doc.pdf', file_type: 'application/pdf', file_size_kb: 100, description: null, uploaded_by: null, uploaded_at: '2025-01-01' } });
    });
  });

  describe('removeAttachment()', () => {
    it('DELETEs attachment by id', () => {
      service.removeAttachment(5).subscribe();
      const req = http.expectOne(`${PACKAGE_BASE}/attachments/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  // -- Collections Forecast --------------------------------------------------

  describe('getCollectionsForecast()', () => {
    it('returns forecast data', () => {
      service.getCollectionsForecast().subscribe(fc => {
        expect(fc).toBeTruthy();
        expect(fc!.forecast.next_30_days).toBe(10000);
      });
      http.expectOne(FORECAST_BASE).flush({ data: { computed_at: '2025-01-01', forecast: { next_30_days: 10000, next_60_days: 20000, next_90_days: 30000, beyond_90_days: 5000 }, breakdown: [], note: 'Estimate' } });
    });

    it('maps null data to null', () => {
      service.getCollectionsForecast().subscribe(fc => expect(fc).toBeNull());
      http.expectOne(FORECAST_BASE).flush({ data: null });
    });
  });

  // -- Template Performance --------------------------------------------------

  describe('getTemplateLeaderboard()', () => {
    it('returns leaderboard without filters', () => {
      service.getTemplateLeaderboard().subscribe(rows => expect(rows.length).toBe(1));
      const req = http.expectOne(r => r.url === TPL_PERF_BASE && !r.params.has('payer'));
      req.flush({ data: [{ id: 1, template_id: 1, template_name: 'Standard', payer_name: null, denial_reason: null, total_used: 10, total_won: 7, total_lost: 3, win_rate: 0.7, avg_days_to_win: 15, rank_in_segment: 1 }] });
    });

    it('sends payer and denial_reason filters', () => {
      service.getTemplateLeaderboard('BlueCross', 'CO-4').subscribe();
      const req = http.expectOne(r =>
        r.url === TPL_PERF_BASE &&
        r.params.get('payer') === 'BlueCross' &&
        r.params.get('denial_reason') === 'CO-4'
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('maps null data to empty array', () => {
      service.getTemplateLeaderboard().subscribe(rows => expect(rows).toEqual([]));
      http.expectOne(r => r.url === TPL_PERF_BASE).flush({ data: null });
    });
  });

  describe('recordAppealOutcome()', () => {
    it('POSTs appeal outcome', () => {
      service.recordAppealOutcome(1, 'won', 30).subscribe(res => expect(res.ok).toBeTrue());
      const req = http.expectOne(`${TPL_PERF_BASE}/outcome`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.appeal_id).toBe(1);
      expect(req.request.body.outcome).toBe('won');
      expect(req.request.body.days_to_close).toBe(30);
      req.flush({ ok: true });
    });

    it('POSTs lost outcome without days', () => {
      service.recordAppealOutcome(2, 'lost').subscribe();
      const req = http.expectOne(`${TPL_PERF_BASE}/outcome`);
      expect(req.request.body.outcome).toBe('lost');
      req.flush({ ok: true });
    });
  });

  // -- Payer Velocity --------------------------------------------------------

  describe('getPayerVelocityScore()', () => {
    it('returns velocity score for a claim', () => {
      service.getPayerVelocityScore('CL51234').subscribe(score => {
        expect(score).toBeTruthy();
        expect(score!.confidence).toBe('high');
      });
      const url = `${environment.server.baseUrl}/ai/payer-velocity/score/CL51234`;
      http.expectOne(url).flush({ data: { claim_id: 'CL51234', payer_name: 'BlueCross', charge_amount: 1000, expected_payment: 800, payment_probability: 0.8, avg_days_to_payment: 30, confidence: 'high', note: 'Good' } });
    });

    it('maps null data to null', () => {
      service.getPayerVelocityScore('CL59999').subscribe(score => expect(score).toBeNull());
      const url = `${environment.server.baseUrl}/ai/payer-velocity/score/CL59999`;
      http.expectOne(url).flush({ data: null });
    });
  });

  // -- Org Hierarchy ---------------------------------------------------------

  describe('getOrgHierarchy()', () => {
    it('returns groups with expanded=true', () => {
      service.getOrgHierarchy().subscribe(groups => {
        expect(groups.length).toBe(1);
        expect(groups[0].expanded).toBeTrue();
        expect(groups[0].practices[0].expanded).toBeTrue();
      });
      const url = `${environment.server.baseUrl}/groups`;
      http.expectOne(url).flush({ data: [{ id: 1, name: 'Group A', practices: [{ id: 1, name: 'Practice A', locations: [] }] }] });
    });

    it('maps null data to empty array', () => {
      service.getOrgHierarchy().subscribe(groups => expect(groups).toEqual([]));
      const url = `${environment.server.baseUrl}/groups`;
      http.expectOne(url).flush({ data: null });
    });

    it('handles groups with no practices', () => {
      service.getOrgHierarchy().subscribe(groups => {
        expect(groups[0].practices).toEqual([]);
      });
      const url = `${environment.server.baseUrl}/groups`;
      http.expectOne(url).flush({ data: [{ id: 1, name: 'Group A', practices: null }] });
    });
  });

  // -- buildParams branches --------------------------------------------------

  describe('buildParams() branches via getTrend()', () => {
    it('does not set start param when start is null', () => {
      service.getTrend({ start: null }).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/trend`);
      expect(req.request.params.has('start')).toBeFalse();
      req.flush({ data: [] });
    });

    it('does not set end param when end is undefined', () => {
      service.getTrend({ end: undefined }).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/trend`);
      expect(req.request.params.has('end')).toBeFalse();
      req.flush({ data: [] });
    });

    it('does not send payer param when payers is empty array', () => {
      service.getTrend({ payers: [] }).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/trend`);
      expect(req.request.params.has('payer')).toBeFalse();
      req.flush({ data: [] });
    });
  });
});
