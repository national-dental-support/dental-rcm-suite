import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PriorityService, PrioritySettings, PriorityWeights } from './priority.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('PriorityService', () => {
  let service: PriorityService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/admin/priority`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PriorityService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(PriorityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getSettings() should GET /settings', () => {
    const settings: PrioritySettings = {
      weights: { aging: 40, value: 30, deadline: 20, workload: 10 },
      enabled: true,
      stats: { totalScored: 100, lastRunAt: null, avgScore: 50, maxScore: 100, minScore: 0 },
      distribution: { high: 20, medium: 50, low: 30 },
    };
    service.getSettings().subscribe(res => expect(res).toEqual(settings));
    const req = http.expectOne(`${base}/settings`);
    expect(req.request.method).toBe('GET');
    req.flush(settings);
  });

  it('updateSettings() should PUT to /settings', () => {
    const body = { enabled: false };
    service.updateSettings(body).subscribe();
    const req = http.expectOne(`${base}/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({ success: true });
  });

  it('triggerRecalculate() should POST to /recalculate', () => {
    service.triggerRecalculate().subscribe(res => {
      expect(res.scored).toBe(50);
    });
    const req = http.expectOne(`${base}/recalculate`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Done', scored: 50 });
  });

  it('getTopClaims() should GET /top-claims with limit param', () => {
    service.getTopClaims(25).subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(r => r.url === `${base}/top-claims` && r.params.get('limit') === '25');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getTopClaims() should use default limit 50 when called without arguments (default-arg arm0)', () => {
    service.getTopClaims().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(r => r.url === `${base}/top-claims` && r.params.get('limit') === '50');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });
});
