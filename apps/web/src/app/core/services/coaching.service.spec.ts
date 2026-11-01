import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  CoachingService,
  CoachingRecommendation,
  CoachingSummary,
  GenerateResult,
} from './coaching.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = '/api/admin/coaching';

const mockRec: CoachingRecommendation = {
  id: 1,
  staffId: 10,
  staffName: 'Alice Smith',
  staffRole: 'biller',
  carcCode: 'CO-45',
  rating: 'C',
  staffAvgMin: 45,
  teamAvgMin: 30,
  mentorId: null,
  mentorName: null,
  moduleId: null,
  assignmentId: null,
  reviewDate: null,
  status: 'pending',
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
  resolvedAt: null,
};

const mockSummary: CoachingSummary = {
  pending: 5,
  inProgress: 2,
  completed: 10,
  total: 17,
  uniqueStaff: 8,
  uniqueCodes: 3,
  uniqueMentors: 2,
  topGapCodes: [{ carcCode: 'CO-45', count: 5 }],
  topMentors: [{ mentorName: 'Bob', menteeCount: 3 }],
};

describe('CoachingService', () => {
  let service: CoachingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(CoachingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listRecommendations()', () => {
    it('should GET /recommendations with default status=all', () => {
      service.listRecommendations().subscribe(res => {
        expect(res.data).toEqual([mockRec]);
      });

      const req = http.expectOne(r =>
        r.url === `${BASE}/recommendations` && r.params.get('status') === 'all'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockRec], summary: {} });
    });

    it('should GET /recommendations with custom status', () => {
      service.listRecommendations('pending').subscribe();

      const req = http.expectOne(r =>
        r.url === `${BASE}/recommendations` && r.params.get('status') === 'pending'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], summary: {} });
    });
  });

  describe('generateRecommendations()', () => {
    it('should POST to /generate with empty body', () => {
      const mockResult: GenerateResult = {
        message: '5 recommendations created',
        created: 5,
        totalGaps: 10,
        existingSkipped: 5,
      };

      service.generateRecommendations().subscribe(res => {
        expect(res).toEqual(mockResult);
      });

      const req = http.expectOne(`${BASE}/generate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(mockResult);
    });
  });

  describe('updateRecommendation()', () => {
    it('should PATCH /recommendations/:id with partial update body', () => {
      const update = { status: 'in-progress', notes: 'Scheduled session' };

      service.updateRecommendation(1, update).subscribe();

      const req = http.expectOne(`${BASE}/recommendations/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(update);
      req.flush({ success: true });
    });

    it('should PATCH with mentorId and reviewDate', () => {
      service.updateRecommendation(2, { mentorId: 5, reviewDate: '2026-02-01' }).subscribe();

      const req = http.expectOne(`${BASE}/recommendations/2`);
      expect(req.request.body).toEqual({ mentorId: 5, reviewDate: '2026-02-01' });
      req.flush({ success: true });
    });
  });

  describe('getSummary()', () => {
    it('should GET /summary', () => {
      service.getSummary().subscribe(res => {
        expect(res).toEqual(mockSummary);
      });

      const req = http.expectOne(`${BASE}/summary`);
      expect(req.request.method).toBe('GET');
      req.flush(mockSummary);
    });
  });
});
