import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RemediationService, RemediationStepSet, StepSetHistory, ClaimStepNote, RemediationFeedback, SOPRecommendation, SOPEffectivenessRow } from './remediation.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('RemediationService', () => {
  let service: RemediationService;
  let http: HttpTestingController;
  const ADMIN_BASE = '/api/admin/remediation';
  const CLAIM_BASE = '/api/denial-iq/claim-detail';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(RemediationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- Admin: listSets() -----------------------------------------------------

  describe('listSets()', () => {
    it('should GET /admin/remediation/sets', (done) => {
      const mockSets: Partial<RemediationStepSet>[] = [
        { id: 1, reason_code: 'CO-4', role: 'AR Specialist', status: 'active', version: 1 },
      ];

      service.listSets().subscribe(sets => {
        expect(sets.length).toBe(1);
        expect(sets[0].reason_code).toBe('CO-4');
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockSets });
    });

    it('should pass filter params', () => {
      service.listSets({ reasonCode: 'CO-4', role: 'Admin', status: 'active' }).subscribe();

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets`);
      expect(req.request.params.get('reasonCode')).toBe('CO-4');
      expect(req.request.params.get('role')).toBe('Admin');
      expect(req.request.params.get('status')).toBe('active');
      req.flush({ data: [] });
    });

    it('should handle null data', (done) => {
      service.listSets().subscribe(sets => {
        expect(sets).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets`);
      req.flush({ data: null });
    });
  });

  // -- Admin: getSet() -------------------------------------------------------

  describe('getSet()', () => {
    it('should GET /admin/remediation/sets/:id', (done) => {
      const mockSet: Partial<RemediationStepSet> = {
        id: 1, reason_code: 'CO-4', steps: [],
      };

      service.getSet(1).subscribe(set => {
        expect(set.id).toBe(1);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets/1`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockSet });
    });
  });

  // -- Admin: createSet() ----------------------------------------------------

  describe('createSet()', () => {
    it('should POST /admin/remediation/sets', (done) => {
      const payload = {
        reason_code: 'CO-4',
        role: 'AR Specialist',
        steps: [{ title: 'Step 1' }],
      };

      service.createSet(payload).subscribe(result => {
        expect(result.id).toBe(10);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.reason_code).toBe('CO-4');
      req.flush({ data: { id: 10 } });
    });
  });

  // -- Admin: updateSet() ----------------------------------------------------

  describe('updateSet()', () => {
    it('should PUT /admin/remediation/sets/:id', (done) => {
      service.updateSet(5, { steps: [{ title: 'Updated' }] }).subscribe(result => {
        expect(result.id).toBe(5);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets/5`);
      expect(req.request.method).toBe('PUT');
      req.flush({ data: { id: 5 } });
    });
  });

  // -- Admin: publishSet() --------------------------------------------------

  describe('publishSet()', () => {
    it('should POST /admin/remediation/sets/:id/publish', (done) => {
      service.publishSet(3).subscribe(result => {
        expect(result.version).toBe(2);
        expect(result.status).toBe('active');
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets/3/publish`);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { id: 3, version: 2, status: 'active' } });
    });
  });

  // -- Admin: getSetHistory() ------------------------------------------------

  describe('getSetHistory()', () => {
    it('should GET /admin/remediation/sets/:id/history', (done) => {
      const history: Partial<StepSetHistory>[] = [
        { id: 1, set_id: 3, version: 1, changed_by: 'admin' },
      ];

      service.getSetHistory(3).subscribe(h => {
        expect(h.length).toBe(1);
        expect(h[0].version).toBe(1);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets/3/history`);
      req.flush({ data: history });
    });

    it('should handle null data', (done) => {
      service.getSetHistory(3).subscribe(h => {
        expect(h).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/sets/3/history`);
      req.flush({ data: null });
    });
  });

  // -- Admin: listReasonCodes() ----------------------------------------------

  describe('listReasonCodes()', () => {
    it('should GET /admin/remediation/reason-codes', (done) => {
      service.listReasonCodes().subscribe(codes => {
        expect(codes).toEqual(['CO-4', 'CO-16', 'PR-1']);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/reason-codes`);
      req.flush({ data: ['CO-4', 'CO-16', 'PR-1'] });
    });
  });

  // -- Admin: listFeedback() -------------------------------------------------

  describe('listFeedback()', () => {
    it('should GET /admin/remediation/feedback', (done) => {
      const fb: Partial<RemediationFeedback>[] = [
        { id: 1, suggestion: 'Add step', status: 'pending' },
      ];

      service.listFeedback().subscribe(feedback => {
        expect(feedback.length).toBe(1);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/feedback`);
      req.flush({ data: fb });
    });

    it('should pass status filter param', () => {
      service.listFeedback({ status: 'pending' }).subscribe();

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/feedback`);
      expect(req.request.params.get('status')).toBe('pending');
      req.flush({ data: [] });
    });
  });

  // -- Admin: reviewFeedback() -----------------------------------------------

  describe('reviewFeedback()', () => {
    it('should PATCH /admin/remediation/feedback/:id', (done) => {
      service.reviewFeedback(5, { status: 'accepted', reviewer_note: 'Good idea' }).subscribe(result => {
        expect(result.status).toBe('accepted');
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/feedback/5`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.reviewer_note).toBe('Good idea');
      req.flush({ data: { id: 5, status: 'accepted' } });
    });
  });

  // -- Claim-time: getClaimSteps() ------------------------------------------

  describe('getClaimSteps()', () => {
    it('should GET /denial-iq/claim-detail/remediation with claimId and role', (done) => {
      service.getClaimSteps('CL5001', 'AR Specialist').subscribe(result => {
        expect(result.claimReasonCode).toBe('CO-4');
        done();
      });

      const req = http.expectOne(r => r.url === `${CLAIM_BASE}/remediation`);
      expect(req.request.params.get('claimId')).toBe('CL5001');
      expect(req.request.params.get('role')).toBe('AR Specialist');
      req.flush({ data: null, claimReasonCode: 'CO-4' });
    });
  });

  // -- Claim-time: saveStepCompletion() -------------------------------------

  describe('saveStepCompletion()', () => {
    it('should POST /denial-iq/claim-detail/step-completion', (done) => {
      service.saveStepCompletion({
        claimId: 'CL5001', stepId: 1, completed: true, userId: 'user1',
      }).subscribe(() => done());

      const req = http.expectOne(r => r.url === `${CLAIM_BASE}/step-completion`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.completed).toBe(true);
      req.flush(null);
    });
  });

  // -- Claim-time: getNotes() -----------------------------------------------

  describe('getNotes()', () => {
    it('should GET /denial-iq/claim-detail/notes with claimId param', (done) => {
      const notes: Partial<ClaimStepNote>[] = [
        { id: 1, claim_id: 'CL5001', note_text: 'Called payer' },
      ];

      service.getNotes('CL5001').subscribe(n => {
        expect(n.length).toBe(1);
        expect(n[0].note_text).toBe('Called payer');
        done();
      });

      const req = http.expectOne(r => r.url === `${CLAIM_BASE}/notes`);
      expect(req.request.params.get('claimId')).toBe('CL5001');
      req.flush({ data: notes });
    });
  });

  // -- Claim-time: addNote() ------------------------------------------------

  describe('addNote()', () => {
    it('should POST /denial-iq/claim-detail/notes', (done) => {
      service.addNote({
        claimId: 'CL5001',
        authorUserId: 'user1',
        noteText: 'Followed up',
      }).subscribe(note => {
        expect(note.id).toBe(99);
        done();
      });

      const req = http.expectOne(r => r.url === `${CLAIM_BASE}/notes`);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { id: 99, claim_id: 'CL5001', note_text: 'Followed up' } });
    });
  });

  // -- Claim-time: deleteNote() ---------------------------------------------

  describe('deleteNote()', () => {
    it('should DELETE /denial-iq/claim-detail/notes/:id', (done) => {
      service.deleteNote(5).subscribe(() => done());

      const req = http.expectOne(r => r.url === `${CLAIM_BASE}/notes/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  // -- Claim-time: submitFeedback() -----------------------------------------

  describe('submitFeedback()', () => {
    it('should POST /denial-iq/claim-detail/feedback', (done) => {
      service.submitFeedback({
        setId: 1, authorUserId: 'user1', suggestion: 'Add step for appeals',
      }).subscribe(result => {
        expect(result.id).toBe(20);
        done();
      });

      const req = http.expectOne(r => r.url === `${CLAIM_BASE}/feedback`);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { id: 20 } });
    });
  });

  // -- Smart SOP: getSmartSteps() -------------------------------------------

  describe('getSmartSteps()', () => {
    it('should GET /denial-iq/claim-detail/smart-steps', (done) => {
      service.getSmartSteps('CL5001', 'Admin').subscribe(result => {
        expect(result).toBeNull();
        done();
      });

      const req = http.expectOne(r => r.url === `${CLAIM_BASE}/smart-steps`);
      expect(req.request.params.get('claimId')).toBe('CL5001');
      expect(req.request.params.get('role')).toBe('Admin');
      req.flush({ data: null });
    });
  });

  // -- Smart SOP: getSOPRecommendations() -----------------------------------

  describe('getSOPRecommendations()', () => {
    it('should GET /admin/remediation/recommendations', (done) => {
      const recs: Partial<SOPRecommendation>[] = [
        { type: 'low_completion', severity: 'high', reasonCode: 'CO-4', title: 'Low completion' },
      ];

      service.getSOPRecommendations().subscribe(r => {
        expect(r.length).toBe(1);
        expect(r[0].type).toBe('low_completion');
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/recommendations`);
      req.flush({ data: recs });
    });
  });

  // -- Smart SOP: getSOPEffectiveness() -------------------------------------

  describe('getSOPEffectiveness()', () => {
    it('should GET /admin/remediation/effectiveness', (done) => {
      const rows: Partial<SOPEffectivenessRow>[] = [
        { reasonCode: 'CO-4', setId: 1, stepCount: 3 },
      ];

      service.getSOPEffectiveness().subscribe(r => {
        expect(r.length).toBe(1);
        expect(r[0].stepCount).toBe(3);
        done();
      });

      const req = http.expectOne(r => r.url === `${ADMIN_BASE}/effectiveness`);
      req.flush({ data: rows });
    });
  });
});
