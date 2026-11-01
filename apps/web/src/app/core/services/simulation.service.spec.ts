import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SimulationService, SimulationListItem, SimulationDetail, AttemptResult } from './simulation.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SimulationService', () => {
  let service: SimulationService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/training/simulations`;
  const adminBase = `${environment.server.baseUrl}/training/admin/simulations`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [SimulationService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(SimulationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('list() should GET base URL', () => {
    service.list().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('get() should GET /simulations/:id', () => {
    service.get(5).subscribe();
    const req = http.expectOne(`${base}/5`);
    expect(req.request.method).toBe('GET');
    req.flush({} as SimulationDetail);
  });

  it('startAttempt() should POST to /simulations/:simId/start', () => {
    service.startAttempt(3).subscribe(res => expect(res.attemptId).toBe(10));
    const req = http.expectOne(`${base}/3/start`);
    expect(req.request.method).toBe('POST');
    req.flush({ attemptId: 10, maxScore: 100 });
  });

  it('submitStep() should POST to /attempt/:attemptId/step', () => {
    service.submitStep(10, 1, 'submit-appeal', 30).subscribe();
    const req = http.expectOne(`${base}/attempt/10/step`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ stepId: 1, actionTaken: 'submit-appeal', timeSeconds: 30 });
    req.flush({ isCorrect: true, pointsEarned: 10, feedback: null });
  });

  it('completeAttempt() should POST to /attempt/:attemptId/complete', () => {
    service.completeAttempt(10).subscribe();
    const req = http.expectOne(`${base}/attempt/10/complete`);
    expect(req.request.method).toBe('POST');
    req.flush({ score: 80, maxScore: 100, scorePct: 80, passed: true, timeTakenSeconds: 120, stepResults: [] } as AttemptResult);
  });

  it('getMyAttempts() should GET /simulations/:simId/my-attempts', () => {
    service.getMyAttempts(3).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/3/my-attempts`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('adminList() should GET admin base', () => {
    service.adminList().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(adminBase);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('adminCreate() should POST to admin base', () => {
    service.adminCreate({ title: 'New Sim' }).subscribe(res => expect(res).toEqual({ id: 1 }));
    const req = http.expectOne(adminBase);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1 });
  });

  it('adminUpdate() should PUT to /admin/:id', () => {
    service.adminUpdate(2, { title: 'Updated' }).subscribe();
    const req = http.expectOne(`${adminBase}/2`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('adminDelete() should DELETE /admin/:id', () => {
    service.adminDelete(2).subscribe();
    const req = http.expectOne(`${adminBase}/2`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('adminAnalytics() should GET /admin/analytics', () => {
    service.adminAnalytics().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${adminBase}/analytics`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
