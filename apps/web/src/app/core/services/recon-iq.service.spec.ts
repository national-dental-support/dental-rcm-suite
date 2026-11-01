import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReconIqService } from './recon-iq.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = environment.server.baseUrl;
const DASH = `${BASE}/recon-iq/dashboard`;
const ENCOUNTER = `${BASE}/recon-iq/encounter-research`;
const RECONCILIATION = `${BASE}/recon-iq/reconciliation`;
const MATCHING = `${BASE}/recon-iq/matching`;
const FULLY = `${BASE}/recon-iq/fully-reconciled`;
const RECON_REPORT = `${BASE}/recon-iq/reconciliation-report`;
const PATIENT_STMTS = `${BASE}/recon-iq/patient-statements`;
const ERA_INGESTION = `${BASE}/recon-iq/era-ingestion`;
const BANK_ESC = `${BASE}/recon-iq/bank-escalations`;
const ALERTS = `${BASE}/recon-iq/alerts`;
const BANK_ACCT = `${BASE}/recon-iq/bank-account-connections`;
const SECONDARY = `${BASE}/recon-iq/secondary-billing`;

const mockStats = {
  message: 'ok',
  asOf: '2025-01-10',
  filters: {},
  totalEraPayments: 100,
  totalEobPayments: 95,
  matchRate: 0.95,
  unmatchedPayments: 5,
  unmatchedEobs: 3,
};

const trendResp = { message: 'ok', asOf: '', filters: {}, series: [] };
const financeResp = { message: 'ok', asOf: '', months: 12, summary: {}, monthly: [], byTrxType: [] };

const emptyPage = {
  message: 'ok', asOf: '', filters: {},
  pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
  rows: [],
};

describe('ReconIqService', () => {
  let service: ReconIqService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [ReconIqService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ReconIqService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // -- getMatchStats --------------------------------------------------

  describe('getMatchStats()', () => {
    it('GET match-stats with no filters', () => {
      service.getMatchStats().subscribe(r => expect(r).toBeTruthy());
      http.expectOne(r => r.url === `${DASH}/match-stats`).flush(mockStats);
    });

    it('sends from/to params', () => {
      service.getMatchStats({ from: '2025-01-01', to: '2025-01-31' }).subscribe();
      http.expectOne(r => r.params.get('from') === '2025-01-01' && r.params.get('to') === '2025-01-31').flush(mockStats);
    });

    it('sends payers and providers as repeated params', () => {
      service.getMatchStats({ payers: ['Aetna', 'BCBS'], providers: ['DrA'] }).subscribe();
      http.expectOne(r => r.params.getAll('payers')?.length === 2 && r.params.getAll('providers')?.length === 1).flush(mockStats);
    });

    it('sends location scope=group', () => {
      service.getMatchStats({ location: { scope: 'group', groups: ['G1', 'G2'] } }).subscribe();
      http.expectOne(r => r.params.get('locationScope') === 'group' && r.params.getAll('groups')?.length === 2).flush(mockStats);
    });

    it('sends location scope=practice', () => {
      service.getMatchStats({ location: { scope: 'practice', practices: ['P1'] } }).subscribe();
      http.expectOne(r => r.params.get('locationScope') === 'practice' && r.params.getAll('practices')?.length === 1).flush(mockStats);
    });

    it('sends location scope=location', () => {
      service.getMatchStats({ location: { scope: 'location', locations: ['L1'] } }).subscribe();
      http.expectOne(r => r.params.get('locationScope') === 'location' && r.params.getAll('locations')?.length === 1).flush(mockStats);
    });

    it('sends location scope=enterprise', () => {
      service.getMatchStats({ location: { scope: 'enterprise' } }).subscribe();
      http.expectOne(r => r.params.get('locationScope') === 'enterprise').flush(mockStats);
    });

    it('called with undefined filters returns empty params', () => {
      service.getMatchStats(undefined).subscribe();
      http.expectOne(r => r.url === `${DASH}/match-stats` && r.params.keys().length === 0).flush(mockStats);
    });

    it('sends empty payers/providers arrays without those params', () => {
      service.getMatchStats({ payers: [], providers: [] }).subscribe();
      http.expectOne(r => !r.params.has('payers') && !r.params.has('providers')).flush(mockStats);
    });

    it('sends location group with empty groups array', () => {
      service.getMatchStats({ location: { scope: 'group', groups: [] } }).subscribe();
      http.expectOne(r => r.params.get('locationScope') === 'group' && !r.params.has('groups')).flush(mockStats);
    });
  });

  // -- getDeniedClaimsAndNonPaymentsTrend ------------------------------

  describe('getDeniedClaimsAndNonPaymentsTrend()', () => {
    it('defaults interval to month', () => {
      service.getDeniedClaimsAndNonPaymentsTrend({}).subscribe();
      http.expectOne(r => r.params.get('interval') === 'month').flush(trendResp);
    });

    it('sends from/to', () => {
      service.getDeniedClaimsAndNonPaymentsTrend({ from: '2025-01-01', to: '2025-06-01' }).subscribe();
      http.expectOne(r => r.params.get('from') === '2025-01-01' && r.params.get('to') === '2025-06-01').flush(trendResp);
    });

    it('propagates payers/providers/location through buildCommonParams', () => {
      service.getDeniedClaimsAndNonPaymentsTrend({
        payers: ['Aetna'], providers: ['DrB'],
        location: { scope: 'practice', practices: ['P1'] },
      }).subscribe();
      http.expectOne(r =>
        r.params.getAll('payers')?.length === 1 &&
        r.params.getAll('providers')?.length === 1 &&
        r.params.get('locationScope') === 'practice'
      ).flush(trendResp);
    });
  });

  // -- getEraEobPayment -----------------------------------------------

  describe('getEraEobPayment()', () => {
    it('defaults interval to month', () => {
      service.getEraEobPayment({}).subscribe();
      http.expectOne(r => r.params.get('interval') === 'month').flush(trendResp);
    });

    it('sends from/to', () => {
      service.getEraEobPayment({ from: '2025-01-01', to: '2025-12-31' }).subscribe();
      http.expectOne(r => r.params.get('from') === '2025-01-01').flush(trendResp);
    });

    it('propagates location scope=location through buildCommonParams', () => {
      service.getEraEobPayment({ location: { scope: 'location', locations: ['L1', 'L2'] } }).subscribe();
      http.expectOne(r =>
        r.params.get('locationScope') === 'location' &&
        r.params.getAll('locations')?.length === 2
      ).flush(trendResp);
    });
  });

  // -- getPatients ----------------------------------------------------

  describe('getPatients()', () => {
    it('defaults page=1 pageSize=25', () => {
      service.getPatients({}).subscribe();
      http.expectOne(r => r.params.get('page') === '1' && r.params.get('pageSize') === '25').flush(emptyPage);
    });

    it('sends search', () => {
      service.getPatients({ search: 'Doe' }).subscribe();
      http.expectOne(r => r.params.get('search') === 'Doe').flush(emptyPage);
    });

    it('trims whitespace search', () => {
      service.getPatients({ search: '   ' }).subscribe();
      http.expectOne(r => !r.params.has('search')).flush(emptyPage);
    });

    it('sends custom page/pageSize/from/to', () => {
      service.getPatients({ page: 3, pageSize: 50, from: '2025-01-01', to: '2025-12-31' }).subscribe();
      http.expectOne(r => r.params.get('page') === '3' && r.params.get('from') === '2025-01-01').flush(emptyPage);
    });

    it('propagates location filters', () => {
      service.getPatients({ location: { scope: 'group', groups: ['G1'] } }).subscribe();
      http.expectOne(r => r.params.get('locationScope') === 'group' && r.params.getAll('groups')?.length === 1).flush(emptyPage);
    });
  });

  // -- getPatientClaims -----------------------------------------------

  describe('getPatientClaims()', () => {
    it('no account uses base url', () => {
      service.getPatientClaims({}).subscribe();
      http.expectOne(r => r.url === `${ENCOUNTER}/patient-claims`).flush({ ...emptyPage, patient: { patientAccount: '', patientName: '' } });
    });

    it('with account uses parameterized url', () => {
      service.getPatientClaims({ patientAccount: 'ACC001' }).subscribe();
      http.expectOne(r => r.url === `${ENCOUNTER}/patient-claims/ACC001`).flush({ ...emptyPage, patient: { patientAccount: 'ACC001', patientName: 'Doe' } });
    });

    it('sends search and page', () => {
      service.getPatientClaims({ search: 'test', page: 2, pageSize: 10 }).subscribe();
      http.expectOne(r => r.params.get('search') === 'test' && r.params.get('page') === '2').flush({ ...emptyPage, patient: { patientAccount: '', patientName: '' } });
    });

    it('whitespace-only patientAccount uses base url', () => {
      service.getPatientClaims({ patientAccount: '   ' }).subscribe();
      http.expectOne(r => r.url === `${ENCOUNTER}/patient-claims`).flush({ ...emptyPage, patient: { patientAccount: '', patientName: '' } });
    });

    it('whitespace-only search is omitted', () => {
      service.getPatientClaims({ search: '  ' }).subscribe();
      http.expectOne(r => !r.params.has('search')).flush({ ...emptyPage, patient: { patientAccount: '', patientName: '' } });
    });
  });

  // -- getPaymentReconciliation ---------------------------------------

  describe('getPaymentReconciliation()', () => {
    it('defaults page=1', () => {
      service.getPaymentReconciliation({}).subscribe();
      http.expectOne(r => r.url === `${RECONCILIATION}/payment-reconciliation` && r.params.get('page') === '1').flush(emptyPage);
    });

    it('sends search/from/to', () => {
      service.getPaymentReconciliation({ search: 'ABC', from: '2025-01-01', to: '2025-06-30' }).subscribe();
      http.expectOne(r => r.params.get('search') === 'ABC' && r.params.get('from') === '2025-01-01').flush(emptyPage);
    });

    it('propagates payers and location', () => {
      service.getPaymentReconciliation({ payers: ['P1'], location: { scope: 'enterprise' } }).subscribe();
      http.expectOne(r => r.params.getAll('payers')?.length === 1 && r.params.get('locationScope') === 'enterprise').flush(emptyPage);
    });
  });

  // -- getPaymentsWithNoEob ------------------------------------------

  describe('getPaymentsWithNoEob()', () => {
    it('hits correct url', () => {
      service.getPaymentsWithNoEob({}).subscribe();
      http.expectOne(r => r.url === `${MATCHING}/payments-with-no-eob`).flush(emptyPage);
    });

    it('sends search/from/to', () => {
      service.getPaymentsWithNoEob({ search: 'XYZ', from: '2025-01-01', to: '2025-12-31' }).subscribe();
      http.expectOne(r => r.params.get('search') === 'XYZ').flush(emptyPage);
    });

    it('sends providers and location', () => {
      service.getPaymentsWithNoEob({ providers: ['DrC'], location: { scope: 'location', locations: ['L1'] } }).subscribe();
      http.expectOne(r => r.params.getAll('providers')?.length === 1 && r.params.get('locationScope') === 'location').flush(emptyPage);
    });
  });

  // -- getEobsWithNoPayment ------------------------------------------

  describe('getEobsWithNoPayment()', () => {
    it('hits correct url', () => {
      service.getEobsWithNoPayment({}).subscribe();
      http.expectOne(r => r.url === `${MATCHING}/eobs-with-no-payment`).flush(emptyPage);
    });

    it('sends search/from/to', () => {
      service.getEobsWithNoPayment({ search: 'EOB', from: '2025-03-01', to: '2025-09-01' }).subscribe();
      http.expectOne(r => r.params.get('search') === 'EOB' && r.params.get('from') === '2025-03-01').flush(emptyPage);
    });

    it('sends payers and location group', () => {
      service.getEobsWithNoPayment({ payers: ['Delta'], location: { scope: 'group', groups: ['G1'] } }).subscribe();
      http.expectOne(r => r.params.getAll('payers')?.length === 1 && r.params.getAll('groups')?.length === 1).flush(emptyPage);
    });
  });

  // -- getFullyPaidAndReconciledPayments ------------------------------

  describe('getFullyPaidAndReconciledPayments()', () => {
    it('defaults page=1', () => {
      service.getFullyPaidAndReconciledPayments({}).subscribe();
      http.expectOne(r => r.url === `${FULLY}/fully-paid-and-reconciled` && r.params.get('page') === '1').flush(emptyPage);
    });

    it('sends bankName/bankFeedId', () => {
      service.getFullyPaidAndReconciledPayments({ bankName: 'Chase', bankFeedId: 'BF001' }).subscribe();
      http.expectOne(r => r.params.get('bankName') === 'Chase' && r.params.get('bankFeedId') === 'BF001').flush(emptyPage);
    });

    it('trims whitespace bankName', () => {
      service.getFullyPaidAndReconciledPayments({ bankName: '   ' }).subscribe();
      http.expectOne(r => !r.params.has('bankName')).flush(emptyPage);
    });

    it('trims whitespace bankFeedId', () => {
      service.getFullyPaidAndReconciledPayments({ bankFeedId: '  ' }).subscribe();
      http.expectOne(r => !r.params.has('bankFeedId')).flush(emptyPage);
    });

    it('sends search/from/to', () => {
      service.getFullyPaidAndReconciledPayments({ search: 'test', from: '2025-01-01', to: '2025-12-31' }).subscribe();
      http.expectOne(r => r.params.get('search') === 'test').flush(emptyPage);
    });

    it('sends payers and location', () => {
      service.getFullyPaidAndReconciledPayments({ payers: ['Cigna'], location: { scope: 'practice', practices: ['P2'] } }).subscribe();
      http.expectOne(r => r.params.getAll('payers')?.length === 1 && r.params.get('locationScope') === 'practice').flush(emptyPage);
    });
  });

  // -- getFullyReconciledClaims ---------------------------------------

  describe('getFullyReconciledClaims()', () => {
    it('fetches claims for a file', () => {
      service.getFullyReconciledClaims('FILE001').subscribe(r => {
        expect(r.fileId).toBe('FILE001');
        expect(r.claims.length).toBe(2);
      });
      http.expectOne(`${FULLY}/claims/FILE001`).flush({ fileId: 'FILE001', claims: [{}, {}] });
    });

    it('returns empty claims array on error', () => {
      service.getFullyReconciledClaims('FILE999').subscribe(r => {
        expect(r.fileId).toBe('FILE999');
        expect(r.claims).toEqual([]);
      });
      http.expectOne(`${FULLY}/claims/FILE999`).flush('err', { status: 500, statusText: 'Error' });
    });
  });

  // -- applyMatch -----------------------------------------------------

  describe('applyMatch()', () => {
    it('POST apply-match with body', () => {
      service.applyMatch('BD001', 'RF001').subscribe(r => expect(r.reconciliationId).toBe('REC001'));
      const req = http.expectOne(r => r.url === `${MATCHING}/apply-match` && r.method === 'POST');
      expect(req.request.body).toEqual({ bankDepositId: 'BD001', remittanceFileId: 'RF001' });
      req.flush({ reconciliationId: 'REC001' });
    });
  });

  // -- getMatchedPairs ------------------------------------------------

  describe('getMatchedPairs()', () => {
    it('fetches matched pairs with default page/pageSize', () => {
      service.getMatchedPairs().subscribe(r => expect(r.rows).toEqual([]));
      const req = http.expectOne(r => r.url === `${MATCHING}/matched-pairs` && r.params.get('page') === '1' && r.params.get('pageSize') === '20');
      req.flush({ rows: [] });
    });

    it('fetches matched pairs with custom page/pageSize', () => {
      service.getMatchedPairs(2, 50).subscribe();
      const req = http.expectOne(r => r.params.get('page') === '2' && r.params.get('pageSize') === '50');
      req.flush({ rows: [] });
    });

    it('returns empty rows on error', () => {
      service.getMatchedPairs().subscribe(r => expect(r.rows).toEqual([]));
      http.expectOne(r => r.url === `${MATCHING}/matched-pairs`).flush('err', { status: 500, statusText: 'Error' });
    });
  });

  // -- unmatch --------------------------------------------------------

  describe('unmatch()', () => {
    it('DELETEs reconciliation with reason in body', () => {
      service.unmatch('REC001', 'Incorrect match').subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(r => r.url === `${MATCHING}/reconciliation/REC001` && r.method === 'DELETE');
      expect(req.request.body).toEqual({ reason: 'Incorrect match' });
      req.flush({ message: 'ok', remittanceFileId: 'RF001', bankDepositId: 'BD001' });
    });
  });

  // -- bulkPost -------------------------------------------------------

  describe('bulkPost()', () => {
    it('POSTs remittance file IDs', () => {
      service.bulkPost(['RF001', 'RF002']).subscribe(r => expect(r.posted).toBe(2));
      const req = http.expectOne(`${RECONCILIATION}/bulk-post`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.remittanceFileIds).toEqual(['RF001', 'RF002']);
      req.flush({ posted: 2, failed: [], skipped: [] });
    });
  });

  // -- getFinanceSummary ----------------------------------------------

  describe('getFinanceSummary()', () => {
    it('no params', () => {
      service.getFinanceSummary().subscribe();
      http.expectOne(r => r.url === `${DASH}/finance-summary`).flush(financeResp);
    });

    it('sends months/location/payer', () => {
      service.getFinanceSummary({ months: 6, location: 'NYC', payer: 'Aetna' }).subscribe();
      http.expectOne(r => r.params.get('months') === '6' && r.params.get('location') === 'NYC' && r.params.get('payer') === 'Aetna').flush(financeResp);
    });

    it('omits empty location and payer', () => {
      service.getFinanceSummary({ months: 12 }).subscribe();
      http.expectOne(r => r.params.get('months') === '12' && !r.params.has('location') && !r.params.has('payer')).flush(financeResp);
    });
  });

  // -- getReconFilterOptions -----------------------------------------

  describe('getReconFilterOptions()', () => {
    it('hits correct url', () => {
      service.getReconFilterOptions().subscribe(r => expect(r.locations).toEqual(['NYC']));
      http.expectOne(`${RECON_REPORT}/filter-options`).flush({ locations: ['NYC'], payers: ['Aetna'] });
    });
  });

  // -- getReconReportSummary -----------------------------------------

  describe('getReconReportSummary()', () => {
    it('sends filter params', () => {
      service.getReconReportSummary({ months: 3, location: 'NYC', payer: 'Aetna', postStatus: 'posted' }).subscribe();
      http.expectOne(r => r.params.get('months') === '3' && r.params.get('postStatus') === 'posted').flush({} as any);
    });

    it('omits postStatus when all', () => {
      service.getReconReportSummary({ months: 6, location: '', payer: '', postStatus: 'all' }).subscribe();
      http.expectOne(r => !r.params.has('postStatus')).flush({} as any);
    });

    it('sends location and payer when provided', () => {
      service.getReconReportSummary({ months: 12, location: 'LA', payer: 'BCBS', postStatus: 'all' }).subscribe();
      http.expectOne(r => r.params.get('location') === 'LA' && r.params.get('payer') === 'BCBS').flush({} as any);
    });

    it('sends postStatus=unposted', () => {
      service.getReconReportSummary({ months: 6, location: '', payer: '', postStatus: 'unposted' }).subscribe();
      http.expectOne(r => r.params.get('postStatus') === 'unposted').flush({} as any);
    });
  });

  // -- getReconReportByPayer -----------------------------------------

  describe('getReconReportByPayer()', () => {
    it('hits correct url', () => {
      service.getReconReportByPayer({ months: 6, location: '', payer: '', postStatus: 'all' }).subscribe(r => expect(r.rows).toEqual([]));
      http.expectOne(r => r.url === `${RECON_REPORT}/by-payer`).flush({ rows: [] });
    });

    it('sends months and postStatus=posted', () => {
      service.getReconReportByPayer({ months: 3, location: 'NYC', payer: 'Delta', postStatus: 'posted' }).subscribe();
      http.expectOne(r => r.params.get('months') === '3' && r.params.get('postStatus') === 'posted' && r.params.get('payer') === 'Delta').flush({ rows: [] });
    });
  });

  // -- getReconReportMonthlyTrend ------------------------------------

  describe('getReconReportMonthlyTrend()', () => {
    it('hits correct url', () => {
      service.getReconReportMonthlyTrend({ months: 12, location: '', payer: '', postStatus: 'all' }).subscribe(r => expect(r.rows).toEqual([]));
      http.expectOne(r => r.url === `${RECON_REPORT}/monthly-trend`).flush({ rows: [] });
    });

    it('sends months and location', () => {
      service.getReconReportMonthlyTrend({ months: 6, location: 'Chicago', payer: '', postStatus: 'unposted' }).subscribe();
      http.expectOne(r => r.params.get('location') === 'Chicago' && r.params.get('postStatus') === 'unposted').flush({ rows: [] });
    });
  });

  // -- getReconReportInTransit ---------------------------------------

  describe('getReconReportInTransit()', () => {
    it('sends postStatus=unposted', () => {
      service.getReconReportInTransit({ months: 3, location: '', payer: '', postStatus: 'unposted' }).subscribe(r => expect(r.total).toBe(5));
      http.expectOne(r => r.params.get('postStatus') === 'unposted').flush({ rows: [], total: 5 });
    });

    it('sends months and payer', () => {
      service.getReconReportInTransit({ months: 12, location: 'LA', payer: 'Aetna', postStatus: 'posted' }).subscribe();
      http.expectOne(r => r.params.get('months') === '12' && r.params.get('payer') === 'Aetna' && r.params.get('postStatus') === 'posted').flush({ rows: [], total: 0 });
    });
  });

  // -- getReconReportByProvider --------------------------------------

  describe('getReconReportByProvider()', () => {
    it('hits correct url', () => {
      service.getReconReportByProvider({ months: 6, location: '', payer: '', postStatus: 'all' }).subscribe(r => expect(r.rows).toEqual([]));
      http.expectOne(r => r.url === `${RECON_REPORT}/by-provider`).flush({ rows: [] });
    });

    it('sends months and location', () => {
      service.getReconReportByProvider({ months: 3, location: 'Boston', payer: 'Cigna', postStatus: 'posted' }).subscribe();
      http.expectOne(r => r.params.get('months') === '3' && r.params.get('location') === 'Boston' && r.params.get('payer') === 'Cigna' && r.params.get('postStatus') === 'posted').flush({ rows: [] });
    });
  });

  // -- getPostingAudit -----------------------------------------------

  describe('getPostingAudit()', () => {
    it('defaults page=1 pageSize=25', () => {
      service.getPostingAudit().subscribe();
      const req = http.expectOne(r => r.url === `${RECON_REPORT}/posting-audit` && r.params.get('page') === '1' && r.params.get('pageSize') === '25');
      req.flush({ rows: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
    });

    it('sends all optional params', () => {
      service.getPostingAudit({ page: 2, pageSize: 10, from: '2025-01-01', to: '2025-12-31', location: 'NYC', payer: 'Aetna', postedBy: 'admin@test.com' }).subscribe();
      const req = http.expectOne(r =>
        r.params.get('page') === '2' &&
        r.params.get('from') === '2025-01-01' &&
        r.params.get('location') === 'NYC' &&
        r.params.get('postedBy') === 'admin@test.com'
      );
      req.flush({ rows: [], total: 0, page: 2, pageSize: 10, totalPages: 0 });
    });

    it('omits optional params when not provided', () => {
      service.getPostingAudit({}).subscribe();
      const req = http.expectOne(r => r.url === `${RECON_REPORT}/posting-audit`);
      expect(req.request.params.has('from')).toBeFalse();
      expect(req.request.params.has('location')).toBeFalse();
      req.flush({ rows: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
    });
  });

  // -- exportReconDetailCsv ------------------------------------------

  describe('exportReconDetailCsv()', () => {
    it('fetches CSV text', () => {
      service.exportReconDetailCsv({ months: 6, location: 'NYC', payer: 'Aetna', postStatus: 'all' }).subscribe(csv => {
        expect(csv).toBe('header,row1');
      });
      const req = http.expectOne(r => r.url === `${RECON_REPORT}/export`);
      expect(req.request.method).toBe('GET');
      req.flush('header,row1');
    });
  });

  // -- Patient Statements --------------------------------------------

  describe('getPatientBalances()', () => {
    it('defaults page=1 pageSize=25', () => {
      service.getPatientBalances().subscribe();
      const req = http.expectOne(r => r.url === `${PATIENT_STMTS}/balances` && r.params.get('page') === '1');
      req.flush({ message: 'ok', asOf: '', filters: {}, pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, rows: [] });
    });

    it('sends minBalance and agingBucket', () => {
      service.getPatientBalances({ minBalance: 100, agingBucket: '31_60' }).subscribe();
      const req = http.expectOne(r => r.params.get('minBalance') === '100' && r.params.get('agingBucket') === '31_60');
      req.flush({ message: 'ok', asOf: '', filters: {}, pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, rows: [] });
    });

    it('sends maxDaysAging and lastStatementBefore', () => {
      service.getPatientBalances({ maxDaysAging: 90, lastStatementBefore: '2025-01-01' }).subscribe();
      const req = http.expectOne(r => r.params.get('maxDaysAging') === '90' && r.params.get('lastStatementBefore') === '2025-01-01');
      req.flush({ message: 'ok', asOf: '', filters: {}, pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, rows: [] });
    });

    it('sends patientIds as repeated params', () => {
      service.getPatientBalances({ patientIds: [1, 2, 3] }).subscribe();
      const req = http.expectOne(r => r.params.getAll('patientIds')?.length === 3);
      req.flush({ message: 'ok', asOf: '', filters: {}, pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, rows: [] });
    });

    it('sends payers and location', () => {
      service.getPatientBalances({ payers: ['Aetna'], location: { scope: 'enterprise' } }).subscribe();
      const req = http.expectOne(r => r.params.getAll('payers')?.length === 1 && r.params.get('locationScope') === 'enterprise');
      req.flush({ message: 'ok', asOf: '', filters: {}, pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, rows: [] });
    });
  });

  describe('generateStatementBatch()', () => {
    it('POSTs batch request', () => {
      service.generateStatementBatch({ patientIds: [1, 2] }).subscribe(r => {
        expect(r.batchId).toBe('BATCH001');
        expect(r.queued).toBe(2);
      });
      const req = http.expectOne(`${PATIENT_STMTS}/generate-batch`);
      expect(req.request.method).toBe('POST');
      req.flush({ batchId: 'BATCH001', queued: 2 });
    });
  });

  describe('getBatchStatus()', () => {
    it('fetches batch status', () => {
      service.getBatchStatus('BATCH001').subscribe(r => expect(r.status).toBe('completed'));
      http.expectOne(`${PATIENT_STMTS}/batch/BATCH001`).flush({ batchId: 'BATCH001', status: 'completed', totalPatients: 2, completedCount: 2, errorCount: 0, requestedBy: 'user@test.com', startedAt: '2025-01-01', completedAt: '2025-01-01', downloadUrl: null, createdAt: '2025-01-01' });
    });
  });

  describe('getRecentBatches()', () => {
    it('returns batches array', () => {
      service.getRecentBatches().subscribe(r => expect(r.batches.length).toBe(1));
      http.expectOne(`${PATIENT_STMTS}/batches`).flush({ batches: [{ batchId: 'B1' }] });
    });
  });

  describe('getStatementPdfUrl()', () => {
    it('returns correct PDF URL', () => {
      const url = service.getStatementPdfUrl('123');
      expect(url).toBe(`${PATIENT_STMTS}/123/pdf`);
    });
  });

  // -- ERA Ingestion -------------------------------------------------

  describe('getEraIngestionHistory()', () => {
    it('defaults page=1 pageSize=25', () => {
      service.getEraIngestionHistory().subscribe();
      const req = http.expectOne(r => r.url === `${ERA_INGESTION}/history` && r.params.get('page') === '1' && r.params.get('pageSize') === '25');
      req.flush({ rows: [], total: 0, page: 1, pageSize: 25 });
    });

    it('sends optional search/sortBy/sortDir/status/fileType', () => {
      service.getEraIngestionHistory({ search: 'ERA', sortBy: 'uploadedAt', sortDir: 'desc', status: 'completed', fileType: '835' }).subscribe();
      const req = http.expectOne(r =>
        r.params.get('search') === 'ERA' &&
        r.params.get('sortBy') === 'uploadedAt' &&
        r.params.get('sortDir') === 'desc' &&
        r.params.get('status') === 'completed' &&
        r.params.get('fileType') === '835'
      );
      req.flush({ rows: [], total: 0, page: 1, pageSize: 25 });
    });

    it('omits optional params when not provided', () => {
      service.getEraIngestionHistory({}).subscribe();
      const req = http.expectOne(r => r.url === `${ERA_INGESTION}/history`);
      expect(req.request.params.has('search')).toBeFalse();
      expect(req.request.params.has('status')).toBeFalse();
      req.flush({ rows: [], total: 0, page: 1, pageSize: 25 });
    });
  });

  describe('getEraIngestionDetail()', () => {
    it('fetches detail by id', () => {
      service.getEraIngestionDetail(42).subscribe(r => expect(r.id).toBe(42));
      http.expectOne(`${ERA_INGESTION}/42`).flush({ id: 42, fileName: 'era.835', fileSizeBytes: 1024, fileType: '835', status: 'completed', remittanceFileId: 'RF001', claimsFound: 10, claimsMatched: 8, errorMessage: null, uploadedBy: 'user@test.com', uploadedAt: '2025-01-01', completedAt: '2025-01-01', payerName: 'Aetna', totalAmount: 5000, fileContent: null });
    });
  });

  // -- Auto-Matching Suggestions -------------------------------------

  describe('generateSuggestions()', () => {
    it('POSTs to generate-suggestions', () => {
      service.generateSuggestions().subscribe(r => expect(r.generated).toBe(5));
      const req = http.expectOne(`${MATCHING}/generate-suggestions`);
      expect(req.request.method).toBe('POST');
      req.flush({ generated: 5 });
    });

    it('returns 0 generated on error', () => {
      service.generateSuggestions().subscribe(r => expect(r.generated).toBe(0));
      http.expectOne(`${MATCHING}/generate-suggestions`).flush('err', { status: 500, statusText: 'Error' });
    });
  });

  describe('getSuggestions()', () => {
    it('defaults page=1 pageSize=25', () => {
      service.getSuggestions().subscribe(r => expect(r.rows).toEqual([]));
      const req = http.expectOne(r => r.url === `${MATCHING}/suggestions` && r.params.get('page') === '1' && r.params.get('pageSize') === '25');
      req.flush({ rows: [] });
    });

    it('sends minScore when provided', () => {
      service.getSuggestions({ minScore: 0.8 }).subscribe();
      const req = http.expectOne(r => r.params.get('minScore') === '0.8');
      req.flush({ rows: [] });
    });

    it('returns empty rows on error', () => {
      service.getSuggestions().subscribe(r => expect(r.rows).toEqual([]));
      http.expectOne(r => r.url === `${MATCHING}/suggestions`).flush('err', { status: 500, statusText: 'Error' });
    });
  });

  describe('acceptSuggestion()', () => {
    it('POSTs to accept suggestion', () => {
      service.acceptSuggestion(5).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${MATCHING}/suggestions/5/accept`);
      expect(req.request.method).toBe('POST');
      req.flush({ message: 'accepted' });
    });
  });

  describe('rejectSuggestion()', () => {
    it('POSTs to reject suggestion', () => {
      service.rejectSuggestion(5).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${MATCHING}/suggestions/5/reject`);
      expect(req.request.method).toBe('POST');
      req.flush({ message: 'rejected' });
    });
  });

  describe('autoAcceptSuggestions()', () => {
    it('POSTs with default threshold', () => {
      service.autoAcceptSuggestions().subscribe(r => expect(r.accepted).toBe(3));
      const req = http.expectOne(`${MATCHING}/auto-accept`);
      expect(req.request.body.threshold).toBe(80);
      req.flush({ accepted: 3 });
    });

    it('POSTs with custom threshold', () => {
      service.autoAcceptSuggestions(90).subscribe();
      const req = http.expectOne(`${MATCHING}/auto-accept`);
      expect(req.request.body.threshold).toBe(90);
      req.flush({ accepted: 0 });
    });
  });

  // -- Bank Escalations ----------------------------------------------

  describe('getBankEscalations()', () => {
    it('defaults page=1 pageSize=25', () => {
      service.getBankEscalations().subscribe();
      const req = http.expectOne(r => r.url === BANK_ESC && r.params.get('page') === '1' && r.params.get('pageSize') === '25');
      req.flush({ rows: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
    });

    it('sends status/priority/from/to filters', () => {
      service.getBankEscalations({ status: 'open', priority: 'critical', from: '2025-01-01', to: '2025-12-31' }).subscribe();
      const req = http.expectOne(r =>
        r.params.get('status') === 'open' &&
        r.params.get('priority') === 'critical' &&
        r.params.get('from') === '2025-01-01'
      );
      req.flush({ rows: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
    });
  });

  describe('getBankEscalationStats()', () => {
    it('fetches escalation stats', () => {
      service.getBankEscalationStats().subscribe(r => expect(r.open).toBe(3));
      http.expectOne(`${BANK_ESC}/stats`).flush({ total: 10, open: 3, investigating: 2, resolved: 5 });
    });
  });

  describe('createBankEscalation()', () => {
    it('POSTs escalation body', () => {
      service.createBankEscalation({ issueType: 'missing_deposit', priority: 'high' }).subscribe(r => expect(r.id).toBe(1));
      const req = http.expectOne(BANK_ESC);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 1 });
    });
  });

  describe('updateBankEscalation()', () => {
    it('PATCHes escalation', () => {
      service.updateBankEscalation(1, { status: 'resolved', resolutionNotes: 'Fixed' }).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${BANK_ESC}/1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ message: 'ok' });
    });
  });

  // -- Recon Alerts --------------------------------------------------

  describe('getReconAlerts()', () => {
    it('defaults page=1 pageSize=25', () => {
      service.getReconAlerts().subscribe(r => expect(r.rows).toEqual([]));
      const req = http.expectOne(r => r.url === ALERTS && r.params.get('page') === '1');
      req.flush({ rows: [] });
    });

    it('sends status/type/severity filters', () => {
      service.getReconAlerts({ status: 'open', type: 'unmatched', severity: 'critical' }).subscribe();
      const req = http.expectOne(r =>
        r.params.get('status') === 'open' &&
        r.params.get('type') === 'unmatched' &&
        r.params.get('severity') === 'critical'
      );
      req.flush({ rows: [] });
    });
  });

  describe('acknowledgeAlert()', () => {
    it('PATCHes alert to acknowledged', () => {
      service.acknowledgeAlert(7).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${ALERTS}/7/acknowledge`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ message: 'acknowledged' });
    });
  });

  describe('getAlertConfigs()', () => {
    it('fetches alert configs', () => {
      service.getAlertConfigs().subscribe(r => expect(r.configs.length).toBe(1));
      http.expectOne(`${ALERTS}/config`).flush({ configs: [{ id: 1, alertType: 'unmatched', thresholdDays: 7, severity: 'warning', isEnabled: true, notifyEmails: null }] });
    });
  });

  describe('upsertAlertConfig()', () => {
    it('PUTs alert config', () => {
      service.upsertAlertConfig({ alertType: 'unmatched', thresholdDays: 7, severity: 'warning', isEnabled: true }).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${ALERTS}/config`);
      expect(req.request.method).toBe('PUT');
      req.flush({ message: 'ok' });
    });
  });

  describe('deleteAlertConfig()', () => {
    it('DELETEs alert config', () => {
      service.deleteAlertConfig(3).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${ALERTS}/config/3`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ message: 'deleted' });
    });
  });

  describe('getCms1500Html()', () => {
    it('fetches CMS 1500 HTML as text', () => {
      service.getCms1500Html('CLM12345').subscribe(html => expect(html).toContain('<html>'));
      const req = http.expectOne(r => r.url.includes('/cms1500'));
      req.flush('<html><body>CMS 1500</body></html>');
    });
  });

  // -- Admin Config --------------------------------------------------

  describe('getReconIqAdminConfig()', () => {
    it('fetches admin config', () => {
      service.getReconIqAdminConfig().subscribe(r => expect(r.autoMatchEnabled).toBeTrue());
      http.expectOne(`${BASE}/recon-iq/admin/config`).flush({ autoMatchEnabled: true, autoMatchThreshold: 0.9, autoPostEnabled: false, statementMinBalance: 50, statementDefaultAgingDays: 30, eraAutoImportEnabled: true, eraMatchTolerance: 0.01, unmatchedEscalationDays: 14, autoEscalateEnabled: true, defaultNotifyEmail: 'admin@test.com', statementFrequency: 'monthly', storageType: 'local', storageConnectionString: '', storagePath: '', storageRetentionDays: 365 });
    });
  });

  describe('updateReconIqAdminConfig()', () => {
    it('PUTs admin config partial update', () => {
      service.updateReconIqAdminConfig({ autoMatchEnabled: false }).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${BASE}/recon-iq/admin/config`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.autoMatchEnabled).toBeFalse();
      req.flush({ message: 'updated' });
    });
  });

  // -- Bank Account Connections --------------------------------------

  describe('getBankAccountConnections()', () => {
    it('returns accounts list', () => {
      service.getBankAccountConnections().subscribe(r => expect(r.accounts.length).toBe(1));
      http.expectOne(BANK_ACCT).flush({ accounts: [{ id: 1 }] });
    });

    it('returns empty accounts on error', () => {
      service.getBankAccountConnections().subscribe(r => expect(r.accounts).toEqual([]));
      http.expectOne(BANK_ACCT).flush('err', { status: 500, statusText: 'Error' });
    });
  });

  describe('createBankAccountConnection()', () => {
    it('POSTs connection', () => {
      service.createBankAccountConnection({ bank_name: 'Chase', account_type: 'checking' }).subscribe(r => expect(r.id).toBe(1));
      const req = http.expectOne(BANK_ACCT);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 1, message: 'created' });
    });
  });

  describe('updateBankAccountConnection()', () => {
    it('PATCHes connection', () => {
      service.updateBankAccountConnection(1, { nickname: 'Main' }).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${BANK_ACCT}/1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ message: 'updated' });
    });
  });

  describe('deleteBankAccountConnection()', () => {
    it('DELETEs connection', () => {
      service.deleteBankAccountConnection(1).subscribe(r => expect(r.message).toBeTruthy());
      const req = http.expectOne(`${BANK_ACCT}/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ message: 'deleted' });
    });
  });

  describe('testBankAccountConnection()', () => {
    it('POSTs to test connection', () => {
      service.testBankAccountConnection(1).subscribe(r => expect(r.passed).toBeTrue());
      const req = http.expectOne(`${BANK_ACCT}/1/test`);
      expect(req.request.method).toBe('POST');
      req.flush({ passed: true, latency_ms: 50, bank_name: 'Chase', connection_type: 'api', detail: null });
    });
  });

  describe('getBankAccountAuditLog()', () => {
    it('fetches audit log without params', () => {
      service.getBankAccountAuditLog().subscribe(r => expect(r.total).toBe(0));
      http.expectOne(r => r.url === `${BANK_ACCT}/audit-log`).flush({ entries: [], total: 0 });
    });

    it('sends accountId/limit/offset when provided', () => {
      service.getBankAccountAuditLog({ accountId: 1, limit: 20, offset: 40 }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BANK_ACCT}/audit-log` &&
        r.params.get('accountId') === '1' &&
        r.params.get('limit') === '20' &&
        r.params.get('offset') === '40'
      );
      req.flush({ entries: [], total: 0 });
    });
  });

  describe('bulkPostWithBank()', () => {
    it('POSTs with bankAccountId', () => {
      service.bulkPostWithBank(['RF001', 'RF002'], 5).subscribe(r => expect(r.posted).toBe(2));
      const req = http.expectOne(`${RECONCILIATION}/bulk-post`);
      expect(req.request.body.bankAccountId).toBe(5);
      req.flush({ posted: 2, failed: [], skipped: [] });
    });

    it('POSTs without bankAccountId', () => {
      service.bulkPostWithBank(['RF003']).subscribe();
      const req = http.expectOne(`${RECONCILIATION}/bulk-post`);
      expect(req.request.body.bankAccountId).toBeUndefined();
      req.flush({ posted: 1, failed: [], skipped: [] });
    });
  });

  // -- Secondary Billing ---------------------------------------------

  describe('getSecondaryBillingQueue()', () => {
    it('fetches without status=all', () => {
      service.getSecondaryBillingQueue({ status: 'all' }).subscribe(r => expect(r.rows).toEqual([]));
      const req = http.expectOne(r => r.url === SECONDARY && !r.params.has('status'));
      req.flush({ rows: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
    });

    it('sends status when not all', () => {
      service.getSecondaryBillingQueue({ status: 'pending' }).subscribe();
      const req = http.expectOne(r => r.params.get('status') === 'pending');
      req.flush({ rows: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
    });

    it('sends secondaryPayer and location', () => {
      service.getSecondaryBillingQueue({ secondaryPayer: 'Aetna', location: 'NYC' }).subscribe();
      const req = http.expectOne(r => r.params.get('secondaryPayer') === 'Aetna' && r.params.get('location') === 'NYC');
      req.flush({ rows: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
    });

    it('sends page and pageSize', () => {
      service.getSecondaryBillingQueue({ page: 2, pageSize: 50 }).subscribe();
      const req = http.expectOne(r => r.params.get('page') === '2' && r.params.get('pageSize') === '50');
      req.flush({ rows: [], pagination: { page: 2, pageSize: 50, total: 0, totalPages: 0 } });
    });
  });

  describe('markSecondarySubmitted()', () => {
    it('POSTs ids and submittedBy', () => {
      service.markSecondarySubmitted([1, 2], 'admin@test.com').subscribe(r => expect(r.updated).toBe(2));
      const req = http.expectOne(`${SECONDARY}/mark-submitted`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.ids).toEqual([1, 2]);
      expect(req.request.body.submittedBy).toBe('admin@test.com');
      req.flush({ updated: 2 });
    });

    it('POSTs without submittedBy', () => {
      service.markSecondarySubmitted([3]).subscribe();
      const req = http.expectOne(`${SECONDARY}/mark-submitted`);
      expect(req.request.body.submittedBy).toBeUndefined();
      req.flush({ updated: 1 });
    });
  });
});
