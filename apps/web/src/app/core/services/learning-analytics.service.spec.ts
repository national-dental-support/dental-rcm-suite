import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LearningAnalyticsService, LearningAnalyticsData } from './learning-analytics.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('LearningAnalyticsService', () => {
  let service: LearningAnalyticsService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/training/admin/analytics`;

  const mockData: LearningAnalyticsData = {
    summary: {
      activeLearnersCount: 25,
      modulesCompletedCount: 120,
      avgCompletionMinutes: 45,
      avgQuizScore: 82,
      quizPassRate: 0.88,
      certificatesIssued: 15,
      totalWatchHours: 90,
    },
    completionTrend: [
      { weekStart: '2026-03-01', completions: 10, uniqueLearners: 8 },
    ],
    modulePerformance: [
      {
        moduleId: 1,
        moduleName: 'Denial Basics',
        completions: 30,
        avgMinutes: 40,
        avgQuizScore: 85,
        activeButIncomplete: 5,
      },
    ],
    quizPerformance: [
      {
        moduleId: 1,
        moduleName: 'Denial Basics',
        attempts: 35,
        passed: 30,
        avgScore: 85,
        minScore: 60,
        maxScore: 100,
      },
    ],
    topLearners: [
      {
        userEmail: 'alice@example.com',
        modulesCompleted: 10,
        avgQuizScore: 95,
        totalHours: 8,
      },
    ],
    pathCompletionRates: [
      {
        pathId: 1,
        pathName: 'AR Specialist Track',
        enrolledCount: 20,
        completedCount: 15,
        avgPctComplete: 75,
      },
    ],
    periodDays: 90,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(LearningAnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAnalytics', () => {
    it('should GET /training/admin/analytics with default days=90', () => {
      service.getAnalytics().subscribe(data => {
        expect(data).toEqual(mockData);
      });

      const req = http.expectOne(r =>
        r.url === base && r.params.get('days') === '90'
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockData);
    });

    it('should GET /training/admin/analytics with custom days param', () => {
      service.getAnalytics(30).subscribe(data => {
        expect(data.periodDays).toBe(90); // whatever the server returns
      });

      const req = http.expectOne(r =>
        r.url === base && r.params.get('days') === '30'
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockData);
    });

    it('should pass the days value as a number param', () => {
      service.getAnalytics(60).subscribe();
      const req = http.expectOne(r => r.url === base);
      expect(req.request.params.get('days')).toBe('60');
      req.flush(mockData);
    });
  });
});
