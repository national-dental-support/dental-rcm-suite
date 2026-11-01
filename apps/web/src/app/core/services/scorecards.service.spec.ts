import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ScorecardsService, ScorecardRow, GoalRow } from './scorecards.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ScorecardsService', () => {
  let service: ScorecardsService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/admin/scorecards`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [ScorecardsService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ScorecardsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getScorecards() should GET base with period param and unwrap data array', () => {
    const rows: ScorecardRow[] = [
      {
        staffId: 1, staffName: 'Alice', role: 'specialist',
        claimsDone: 50, revenueRecovered: 10000, firstTouchRate: 0.9,
        avgMinutesPerClaim: 12, avgDaysToResolve: 3, currentQueue: 5,
        claimsGoal: 60, revenueGoal: 12000, firstTouchGoal: 0.95, avgDaysGoal: 2,
      },
    ];
    service.getScorecards('weekly').subscribe(res => expect(res).toEqual(rows));
    const req = http.expectOne(r => r.url === base && r.params.get('period') === 'weekly');
    expect(req.request.method).toBe('GET');
    req.flush({ data: rows });
  });

  it('getScorecards() should return empty array when data is null', () => {
    service.getScorecards().subscribe(res => expect(res).toEqual([]));
    const req = http.expectOne(r => r.url === base && r.params.get('period') === 'weekly');
    req.flush({ data: null });
  });

  it('getGoals() should GET /goals with period param and unwrap data', () => {
    const goals: GoalRow[] = [
      { id: 1, staffId: 1, staffName: 'Alice', period: 'weekly', claimsGoal: 60, revenueGoal: null, firstTouchGoal: null, avgDaysGoal: null, updatedAt: '' },
    ];
    service.getGoals('monthly').subscribe(res => expect(res).toEqual(goals));
    const req = http.expectOne(r => r.url === `${base}/goals` && r.params.get('period') === 'monthly');
    expect(req.request.method).toBe('GET');
    req.flush({ data: goals });
  });

  it('setGoals() should PUT to /goals', () => {
    const body = { staffId: 1, period: 'weekly', claimsGoal: 70 };
    service.setGoals(body).subscribe();
    const req = http.expectOne(`${base}/goals`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({ success: true });
  });
});
