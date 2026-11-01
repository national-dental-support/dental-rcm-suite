import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrainingService } from './training.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('TrainingService', () => {
  let service: TrainingService;
  let http: HttpTestingController;
  const base = '/api/training';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [TrainingService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(TrainingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('trainingMode$ should start as false', () => {
    let val: boolean | undefined;
    service.trainingMode$.subscribe(v => (val = v));
    expect(val).toBeFalse();
  });

  it('getVideos() should GET /videos', () => {
    service.getVideos().subscribe();
    const req = http.expectOne(`${base}/videos`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getFaqs() should GET /faqs', () => {
    service.getFaqs().subscribe();
    const req = http.expectOne(`${base}/faqs`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getTooltips() should GET /tooltips without product param', () => {
    service.getTooltips().subscribe();
    const req = http.expectOne(`${base}/tooltips`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getTooltips() should pass product param when provided', () => {
    service.getTooltips('denial-iq').subscribe();
    const req = http.expectOne(r => r.url === `${base}/tooltips` && r.params.get('product') === 'denial-iq');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getModules() should GET /modules', () => {
    service.getModules().subscribe();
    const req = http.expectOne(`${base}/modules`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getModuleById() should GET /modules/:id', () => {
    service.getModuleById(3).subscribe();
    const req = http.expectOne(`${base}/modules/3`);
    expect(req.request.method).toBe('GET');
    req.flush({ module: {}, videos: [], quiz: null });
  });

  it('getPaths() should GET /paths', () => {
    service.getPaths().subscribe();
    const req = http.expectOne(`${base}/paths`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getPathById() should GET /paths/:id', () => {
    service.getPathById(2).subscribe();
    const req = http.expectOne(`${base}/paths/2`);
    expect(req.request.method).toBe('GET');
    req.flush({ path: {}, steps: [] });
  });

  it('getMyDashboard() should GET /my/dashboard', () => {
    service.getMyDashboard().subscribe();
    const req = http.expectOne(`${base}/my/dashboard`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getPathProgress() should GET /my/path-progress', () => {
    service.getPathProgress().subscribe();
    const req = http.expectOne(`${base}/my/path-progress`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getVideoProgress() should GET /my/video-progress', () => {
    service.getVideoProgress().subscribe();
    const req = http.expectOne(`${base}/my/video-progress`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('reportVideoProgress() should PUT to /my/video-progress', () => {
    service.reportVideoProgress(5, 50, 120).subscribe();
    const req = http.expectOne(`${base}/my/video-progress`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ videoId: 5, progressPct: 50, watchTimeSec: 120 });
    req.flush({});
  });

  it('getPreference() should GET /my/preference and update trainingMode$', () => {
    let mode: boolean | undefined;
    service.trainingMode$.subscribe(v => (mode = v));

    service.getPreference().subscribe();

    const req = http.expectOne(`${base}/my/preference`);
    expect(req.request.method).toBe('GET');
    req.flush({ showTraining: true });

    expect(mode).toBeTrue();
  });

  it('setPreference() should PUT to /my/preference and update trainingMode$', () => {
    let mode: boolean | undefined;
    service.trainingMode$.subscribe(v => (mode = v));

    service.setPreference(false).subscribe();

    const req = http.expectOne(`${base}/my/preference`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ showTraining: false });
    req.flush({});

    expect(mode).toBeFalse();
  });

  it('getQuiz() should GET /quiz/:moduleId', () => {
    service.getQuiz(3).subscribe();
    const req = http.expectOne(`${base}/quiz/3`);
    expect(req.request.method).toBe('GET');
    req.flush({ quiz: {}, questions: [], attemptCount: 0 });
  });

  it('submitQuiz() should POST to /quiz/:moduleId/submit', () => {
    service.submitQuiz(3, { 1: 2, 3: 4 }).subscribe();
    const req = http.expectOne(`${base}/quiz/3/submit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ answers: { 1: 2, 3: 4 } });
    req.flush({ passed: true, score: 80, maxScore: 100 });
  });

  it('getQuizAttempts() should GET /quiz/:moduleId/attempts', () => {
    service.getQuizAttempts(3).subscribe();
    const req = http.expectOne(`${base}/quiz/3/attempts`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('searchVideos() should GET /videos/search with q param', () => {
    service.searchVideos('CO-4').subscribe();
    const req = http.expectOne(r => r.url === `${base}/videos/search` && r.params.get('q') === 'CO-4');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getTranscript() should GET /videos/:videoId/transcript', () => {
    service.getTranscript(10).subscribe();
    const req = http.expectOne(`${base}/videos/10/transcript`);
    expect(req.request.method).toBe('GET');
    req.flush({ videoId: 10, transcriptText: '', transcriptVtt: '' });
  });

  it('getTranscriptVttUrl() should return correct URL string', () => {
    const url = service.getTranscriptVttUrl(10);
    expect(url).toBe(`${base}/videos/10/transcript.vtt`);
  });

  it('getBrowsePaths() should GET /browse/paths', () => {
    service.getBrowsePaths().subscribe();
    const req = http.expectOne(`${base}/browse/paths`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('selfEnroll() should POST to /my/enroll', () => {
    service.selfEnroll(5).subscribe();
    const req = http.expectOne(`${base}/my/enroll`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ learningPathId: 5 });
    req.flush({ id: 1, message: 'Enrolled' });
  });

  it('selfUnenroll() should DELETE /my/enroll/:enrollmentId', () => {
    service.selfUnenroll(1).subscribe();
    const req = http.expectOne(`${base}/my/enroll/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('getRecommendations() should GET /my/recommendations', () => {
    service.getRecommendations().subscribe();
    const req = http.expectOne(`${base}/my/recommendations`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('dismissRecommendation() should POST to /my/recommendations/:id/dismiss', () => {
    service.dismissRecommendation(3).subscribe();
    const req = http.expectOne(`${base}/my/recommendations/3/dismiss`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
