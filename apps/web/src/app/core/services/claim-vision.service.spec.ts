import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClaimVisionService, ClaimVisionBatch, ClaimVisionClaimDetail } from './claim-vision.service';
import { RuleDraft } from '../models/rules.model';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ClaimVisionService', () => {
  let service: ClaimVisionService;
  let http: HttpTestingController;
  const BASE = '/api/claim-vision';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ClaimVisionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getRejectedClaims() -----------------------------------------------------

  describe('getRejectedClaims()', () => {
    it('should GET /rejected-claims and map rows to ClaimVisionBatch[]', (done) => {
      const raw = [
        {
          batchWeekStart: '2025-04-01',
          rejectedClaimsCount: 5,
          ruleName: 'Missing NPI',
          category: 'Eligibility',
          rejectionMessage: 'Missing info',
          ruleType: 'System',
          ruleId: 'R001',
          totalCount: 1,
        },
      ];

      service.getRejectedClaims().subscribe(batches => {
        expect(batches.length).toBe(1);
        expect(batches[0].rejectedClaimsCount).toBe(5);
        expect(batches[0].rejectionMessage).toBe('Missing info');
        expect(batches[0].rejectedBy).toBe('System');
        expect(batches[0].ruleId).toBe('R001');
        expect(batches[0].submittedDate).toBe('2025-04-01');
        expect(batches[0].ruleName).toBe('Missing NPI');
        expect(batches[0].category).toBe('Eligibility');
        expect(batches[0].ruleType).toBe('System');
        expect(batches[0].id).toBeTruthy();
        done();
      });

      const req = http.expectOne(r => r.url.includes(`${BASE}/rejected-claims`));
      expect(req.request.method).toBe('GET');
      req.flush({ message: 'ok', data: raw });
    });

    it('should handle empty data array', (done) => {
      service.getRejectedClaims().subscribe(batches => {
        expect(batches).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url.includes(`${BASE}/rejected-claims`));
      req.flush({ message: 'ok', data: [] });
    });

    it('should handle null data', (done) => {
      service.getRejectedClaims().subscribe(batches => {
        expect(batches).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url.includes(`${BASE}/rejected-claims`));
      req.flush({ message: 'ok', data: null });
    });

    it('should handle null fields in raw data', (done) => {
      const raw = [
        {
          batchWeekStart: null,
          rejectedClaimsCount: null,
          ruleName: null,
          category: null,
          rejectionMessage: null,
          ruleType: null,
          ruleId: null,
          totalCount: null,
        },
      ];

      service.getRejectedClaims().subscribe(batches => {
        expect(batches[0].submittedDate).toBeNull();
        expect(batches[0].rejectedClaimsCount).toBe(0);
        expect(batches[0].rejectionMessage).toBe('');
        expect(batches[0].rejectedBy).toBe('');
        expect(batches[0].ruleId).toBe('');
        done();
      });

      const req = http.expectOne(r => r.url.includes(`${BASE}/rejected-claims`));
      req.flush({ message: 'ok', data: raw });
    });
  });

  // -- getRejectedClaimsDetail() -----------------------------------------------

  describe('getRejectedClaimsDetail()', () => {
    it('should GET /rejected-claims-detail with params', (done) => {
      const raw = [
        {
          'RejectedClaimID': 'RC1',
          'Priority': 1,
          'Patient': 'John Doe',
          'Submitted Date': '2025-04-01T00:00:00Z',
          'Payer': 'Aetna',
          'Status': 'Not complete',
          'ClaimID': 'CL5001',
          'Rejection Message': 'Missing NPI',
          'Rejected by': 'System',
          'Batch Week Start': '2025-04-01',
        },
      ];

      service.getRejectedClaimsDetail('batch1', 'R001', '2025-04-01').subscribe(details => {
        expect(details.length).toBe(1);
        expect(details[0].patient).toBe('John Doe');
        expect(details[0].payer).toBe('Aetna');
        expect(details[0].batchId).toBe('batch1');
        expect(details[0].rejectedClaimId).toBe('RC1');
        expect(details[0].id).toBe('CL5001');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/rejected-claims-detail`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('ruleId')).toBe('R001');
      expect(req.request.params.get('batchWeekStart')).toBe('2025-04-01');
      req.flush({ message: 'ok', data: raw });
    });

    it('should omit optional params when not provided', () => {
      service.getRejectedClaimsDetail('batch1').subscribe();

      const req = http.expectOne(r => r.url === `${BASE}/rejected-claims-detail`);
      expect(req.request.params.has('ruleId')).toBe(false);
      expect(req.request.params.has('batchWeekStart')).toBe(false);
      req.flush({ message: 'ok', data: [] });
    });

    it('should handle null ClaimID by using fallback id', (done) => {
      const raw = [
        {
          'RejectedClaimID': null,
          'Priority': 3,
          'Patient': 'Jane',
          'Submitted Date': null,
          'Payer': null,
          'Status': null,
          'ClaimID': null,
          'Rejection Message': null,
          'Rejected by': null,
          'Batch Week Start': null,
        },
      ];

      service.getRejectedClaimsDetail('b1').subscribe(details => {
        expect(details[0].id).toBe('b1|3');
        expect(details[0].status).toBe('Not complete');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/rejected-claims-detail`);
      req.flush({ message: 'ok', data: raw });
    });
  });

  // -- getCustomRules() --------------------------------------------------------

  describe('getCustomRules()', () => {
    it('should GET /custom-rules and map to Rule[]', (done) => {
      const raw = [
        {
          'Rule name': 'Test Rule',
          'Category': 'Billing',
          'Description': 'Checks billing',
          'Expires': null,
          'Created Date': '2025-01-01',
          'Created By': 'Admin',
          'Modified Date': null,
          'Modified By': null,
          'Activation status': 'Active',
          'Claims impacted': 42,
          'RuleID': 'R1',
          'MatchType': 'all',
          'Conditions': '[]',
          'Actions': '[]',
          'Scope': 'enterprise',
          'ScopeValues': '[]',
        },
      ];

      service.getCustomRules().subscribe(rules => {
        expect(rules.length).toBe(1);
        expect(rules[0].name).toBe('Test Rule');
        expect(rules[0].kind).toBe('custom');
        expect(rules[0].claimsImpacted).toBe(42);
        expect(rules[0].status).toBe('Active');
        expect(rules[0].matchType).toBe('all');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/custom-rules`);
      expect(req.request.method).toBe('GET');
      req.flush({ message: 'ok', data: raw });
    });

    it('should handle empty data', (done) => {
      service.getCustomRules().subscribe(rules => {
        expect(rules).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/custom-rules`);
      req.flush({ message: 'ok', data: [] });
    });
  });

  // -- getSystemRules() --------------------------------------------------------

  describe('getSystemRules()', () => {
    it('should GET /system-rules and mark kind as system', (done) => {
      const raw = [
        {
          'Rule name': 'Sys Rule',
          'Category': null,
          'Description': null,
          'Expires': null,
          'Created Date': '2025-01-01',
          'Created By': 'System',
          'Modified Date': null,
          'Modified By': null,
          'Activation status': null,
          'Claims impacted': null,
          'RuleID': 'S1',
          'MatchType': null,
          'Conditions': null,
          'Actions': null,
          'Scope': null,
          'ScopeValues': null,
        },
      ];

      service.getSystemRules().subscribe(rules => {
        expect(rules.length).toBe(1);
        expect(rules[0].kind).toBe('system');
        expect(rules[0].status).toBe('Inactive');
        expect(rules[0].claimsImpacted).toBe(0);
        expect(rules[0].matchType).toBe('any');
        expect(rules[0].scope).toBe('enterprise');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/system-rules`);
      req.flush({ message: 'ok', data: raw });
    });
  });

  // -- createRule() ------------------------------------------------------------

  describe('createRule()', () => {
    it('should POST /rules with draft body', (done) => {
      const draft: RuleDraft = {
        name: 'New Rule',
        description: 'desc',
        category: 'Billing',
        matchType: 'all',
        conditions: [],
        actions: [],
        status: 'Active',
        expiresOn: null,
        scope: 'enterprise',
        scopeValues: [],
        kind: 'custom',
      };

      service.createRule(draft).subscribe(result => {
        expect(result.ruleId).toBe('R99');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/rules`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.name).toBe('New Rule');
      expect(req.request.body.activeFlag).toBe(1);
      req.flush({ message: 'ok', data: { ruleId: 'R99' } });
    });

    it('should set activeFlag to 0 for Inactive status', () => {
      const draft: RuleDraft = {
        name: 'Inactive Rule',
        description: '',
        category: '',
        matchType: 'any',
        conditions: [],
        actions: [],
        status: 'Inactive',
        scope: 'enterprise',
        scopeValues: [],
      };

      service.createRule(draft).subscribe();

      const req = http.expectOne(r => r.url === `${BASE}/rules`);
      expect(req.request.body.activeFlag).toBe(0);
      req.flush({ message: 'ok', data: { ruleId: 'R100' } });
    });
  });

  // -- updateRule() ------------------------------------------------------------

  describe('updateRule()', () => {
    it('should PUT /rules/:ruleId', (done) => {
      const draft: RuleDraft = {
        name: 'Updated',
        description: '',
        category: '',
        matchType: 'any',
        conditions: [],
        actions: [],
        status: 'Expires',
        expiresOn: '2025-12-31',
        scope: 'location',
        scopeValues: ['LOC1'],
      };

      service.updateRule('R1', draft).subscribe(result => {
        expect(result.ruleId).toBe('R1');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/rules/R1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.activeFlag).toBe(1); // Expires is active
      req.flush({ message: 'ok', data: { ruleId: 'R1' } });
    });
  });

  // -- deleteRule() ------------------------------------------------------------

  describe('deleteRule()', () => {
    it('should DELETE /rules/:ruleId', (done) => {
      service.deleteRule('R1').subscribe(result => {
        expect(result.ruleId).toBe('R1');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/rules/R1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ message: 'ok', data: { ruleId: 'R1' } });
    });
  });

  // -- updateRejectedClaimStatus() ---------------------------------------------

  describe('updateRejectedClaimStatus()', () => {
    it('should PATCH /rejected-claims/:id/status', (done) => {
      service.updateRejectedClaimStatus('RC1', 'Completed').subscribe(() => {
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/rejected-claims/RC1/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('Completed');
      req.flush({ message: 'ok' });
    });
  });
});
