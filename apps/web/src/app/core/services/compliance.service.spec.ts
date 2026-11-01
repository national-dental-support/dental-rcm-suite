import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComplianceService, ComplianceDashboard, AccessReviewUser } from './compliance.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let http: HttpTestingController;
  // Note: the service uses `${baseUrl}/api/admin/compliance` where baseUrl is '/api'
  // so the full URL is '/api/api/admin/compliance' - matching the source code
  const BASE = '/api/api/admin/compliance';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ComplianceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getDashboard() ----------------------------------------------------------

  describe('getDashboard()', () => {
    it('should GET /dashboard', (done) => {
      const mockDash: ComplianceDashboard = {
        training: { total: 10, completed: 8, overdue: 2, complianceRate: 80 },
        security: { failedLogins30d: 5, uniqueFailedUsers: 3, lockedAccounts: 1, dormantAccounts: 2 },
        users: { total: 50, disabled: 2, locked: 1, dormant: 5 },
        auditActivity: [{ action: 'login', cnt: 100 }],
        generatedAt: '2026-03-12T00:00:00Z',
      };

      service.getDashboard().subscribe(result => {
        expect(result.training.complianceRate).toBe(80);
        expect(result.security.failedLogins30d).toBe(5);
        expect(result.users.total).toBe(50);
        expect(result.auditActivity.length).toBe(1);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/dashboard`);
      expect(req.request.method).toBe('GET');
      req.flush(mockDash);
    });
  });

  // -- getAccessReview() -------------------------------------------------------

  describe('getAccessReview()', () => {
    it('should GET /access-review', (done) => {
      const users: AccessReviewUser[] = [
        {
          uid: 1,
          name: 'John Doe',
          Email: 'john@test.com',
          Role: 3,
          lastLogin: '2026-03-01',
          disabled: false,
          archived: false,
          activityCount30d: 15,
        },
      ];

      service.getAccessReview().subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('John Doe');
        expect(result[0].activityCount30d).toBe(15);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/access-review`);
      expect(req.request.method).toBe('GET');
      req.flush(users);
    });

    it('should handle empty array', (done) => {
      service.getAccessReview().subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/access-review`);
      req.flush([]);
    });
  });
});
