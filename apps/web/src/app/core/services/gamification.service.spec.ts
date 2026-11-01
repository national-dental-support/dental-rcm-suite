import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GamificationService, Badge, UserBadge, LeaderboardEntry, UserPoints } from './gamification.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('GamificationService', () => {
  let service: GamificationService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/workforce/gamification`;

  const mockBadge: Badge = {
    id: 1,
    name: 'Speed Demon',
    description: 'Process 50 claims in a day',
    icon: 'bolt',
    category: 'performance',
    threshold: 50,
    isActive: true,
  };

  const mockUserBadge: UserBadge = {
    id: 1,
    badgeId: 1,
    badgeName: 'Speed Demon',
    badgeIcon: 'bolt',
    badgeDescription: 'Process 50 claims in a day',
    earnedAt: '2026-03-10T12:00:00Z',
  };

  const mockLeaderboard: LeaderboardEntry = {
    userId: 'user-1',
    name: 'Alice',
    totalPoints: 1500,
    badgeCount: 5,
    rank: 1,
  };

  const mockPoints: UserPoints = {
    totalPoints: 1500,
    breakdown: [{ category: 'performance', points: 1000 }],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(GamificationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getBadges', () => {
    it('should GET /api/workforce/gamification/badges', () => {
      service.getBadges().subscribe(badges => {
        expect(badges).toEqual([mockBadge]);
      });

      const req = http.expectOne(`${base}/badges`);
      expect(req.request.method).toBe('GET');
      req.flush([mockBadge]);
    });
  });

  describe('getUserBadges', () => {
    it('should GET /api/workforce/gamification/users/:userId/badges', () => {
      service.getUserBadges('user-123').subscribe(badges => {
        expect(badges).toEqual([mockUserBadge]);
      });

      const req = http.expectOne(`${base}/users/user-123/badges`);
      expect(req.request.method).toBe('GET');
      req.flush([mockUserBadge]);
    });
  });

  describe('getLeaderboard', () => {
    it('should GET /api/workforce/gamification/leaderboard without period', () => {
      service.getLeaderboard().subscribe(entries => {
        expect(entries).toEqual([mockLeaderboard]);
      });

      const req = http.expectOne(`${base}/leaderboard`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('period')).toBeFalse();
      req.flush([mockLeaderboard]);
    });

    it('should GET /api/workforce/gamification/leaderboard with period param', () => {
      service.getLeaderboard('weekly').subscribe(entries => {
        expect(entries).toEqual([mockLeaderboard]);
      });

      const req = http.expectOne(r =>
        r.url === `${base}/leaderboard` && r.params.get('period') === 'weekly'
      );
      expect(req.request.method).toBe('GET');
      req.flush([mockLeaderboard]);
    });
  });

  describe('getUserPoints', () => {
    it('should GET /api/workforce/gamification/users/:userId/points', () => {
      service.getUserPoints('user-123').subscribe(points => {
        expect(points).toEqual(mockPoints);
      });

      const req = http.expectOne(`${base}/users/user-123/points`);
      expect(req.request.method).toBe('GET');
      req.flush(mockPoints);
    });
  });
});
