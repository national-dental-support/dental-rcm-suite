import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrainingAdminService } from './training-admin.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('TrainingAdminService', () => {
  let service: TrainingAdminService;
  let http: HttpTestingController;
  const base = '/api/training/admin';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [TrainingAdminService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(TrainingAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getDashboard() should GET /dashboard', () => {
    service.getDashboard().subscribe();
    const req = http.expectOne(`${base}/dashboard`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('createPath() should POST to /paths', () => {
    service.createPath({ title: 'New Path' }).subscribe(res => expect(res).toEqual({ id: 1 }));
    const req = http.expectOne(`${base}/paths`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1 });
  });

  it('updatePath() should PUT to /paths/:id', () => {
    service.updatePath(2, { title: 'Updated' }).subscribe();
    const req = http.expectOne(`${base}/paths/2`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('deletePath() should DELETE /paths/:id', () => {
    service.deletePath(3).subscribe();
    const req = http.expectOne(`${base}/paths/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('createModule() should POST to /modules', () => {
    service.createModule({ title: 'Module 1' }).subscribe(res => expect(res).toEqual({ id: 5 }));
    const req = http.expectOne(`${base}/modules`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 5 });
  });

  it('updateModule() should PUT to /modules/:id', () => {
    service.updateModule(5, { title: 'Updated Module' }).subscribe();
    const req = http.expectOne(`${base}/modules/5`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('deleteModule() should DELETE /modules/:id', () => {
    service.deleteModule(5).subscribe();
    const req = http.expectOne(`${base}/modules/5`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('listAssignments() should GET /assignments', () => {
    service.listAssignments().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/assignments`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('createAssignment() should POST to /assignments', () => {
    service.createAssignment({ userId: 1 }).subscribe(res => expect(res).toEqual({ id: 10 }));
    const req = http.expectOne(`${base}/assignments`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 10 });
  });

  it('deleteAssignment() should DELETE /assignments/:id', () => {
    service.deleteAssignment(10).subscribe();
    const req = http.expectOne(`${base}/assignments/10`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('getCompletions() should GET /completions without params when no filters', () => {
    service.getCompletions().subscribe();
    const req = http.expectOne(`${base}/completions`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getCompletions() should pass filter params when provided', () => {
    service.getCompletions({ from: '2026-01-01', to: '2026-03-01', user: 'alice' }).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/completions` &&
      r.params.get('from') === '2026-01-01' &&
      r.params.get('to') === '2026-03-01' &&
      r.params.get('user') === 'alice'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('listRoleDefaults() should GET /role-defaults', () => {
    service.listRoleDefaults().subscribe();
    const req = http.expectOne(`${base}/role-defaults`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('createRoleDefault() should POST to /role-defaults', () => {
    service.createRoleDefault({ role: 'specialist', learningPathId: 1 }).subscribe(res => expect(res).toEqual({ id: 3 }));
    const req = http.expectOne(`${base}/role-defaults`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 3 });
  });

  it('deleteRoleDefault() should DELETE /role-defaults/:id', () => {
    service.deleteRoleDefault(3).subscribe();
    const req = http.expectOne(`${base}/role-defaults/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('listVideos() should GET /videos', () => {
    service.listVideos().subscribe();
    const req = http.expectOne(`${base}/videos`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('createVideo() should POST to /videos', () => {
    const fd = new FormData();
    service.createVideo(fd).subscribe(res => expect(res).toEqual({ id: 7 }));
    const req = http.expectOne(`${base}/videos`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 7 });
  });

  it('updateVideo() should PUT to /videos/:id', () => {
    const fd = new FormData();
    service.updateVideo(7, fd).subscribe();
    const req = http.expectOne(`${base}/videos/7`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('deleteVideo() should DELETE /videos/:id', () => {
    service.deleteVideo(7).subscribe();
    const req = http.expectOne(`${base}/videos/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('bulkUpdateVideos() should PUT to /videos/bulk', () => {
    service.bulkUpdateVideos('delete', [1, 2, 3]).subscribe();
    const req = http.expectOne(`${base}/videos/bulk`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ action: 'delete', videoIds: [1, 2, 3], moduleId: undefined });
    req.flush({});
  });

  it('saveTranscript() should PUT to /videos/:videoId/transcript', () => {
    service.saveTranscript(7, 'Hello world', 'WEBVTT').subscribe();
    const req = http.expectOne(`${base}/videos/7/transcript`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ transcriptText: 'Hello world', transcriptVtt: 'WEBVTT' });
    req.flush({});
  });

  it('saveTranscript() should work without vtt param', () => {
    service.saveTranscript(8, 'Transcript only').subscribe();
    const req = http.expectOne(`${base}/videos/8/transcript`);
    expect(req.request.body).toEqual({ transcriptText: 'Transcript only', transcriptVtt: undefined });
    req.flush({});
  });

  it('listQuizzes() should GET /quizzes', () => {
    service.listQuizzes().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/quizzes`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('listQuizQuestions() should GET /quizzes/:quizId/questions', () => {
    service.listQuizQuestions(5).subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/quizzes/5/questions`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('createQuizQuestion() should POST to /quizzes/:quizId/questions', () => {
    const question = { questionText: 'What is RCM?', questionType: 'multiple_choice' } as any;
    service.createQuizQuestion(5, question).subscribe(res => expect(res.id).toBe(10));
    const req = http.expectOne(`${base}/quizzes/5/questions`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 10 });
  });

  it('updateQuizQuestion() should PUT to /questions/:questionId', () => {
    const question = { questionText: 'Updated?', questionType: 'true_false' } as any;
    service.updateQuizQuestion(10, question).subscribe();
    const req = http.expectOne(`${base}/questions/10`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('deleteQuizQuestion() should DELETE /questions/:questionId', () => {
    service.deleteQuizQuestion(10).subscribe();
    const req = http.expectOne(`${base}/questions/10`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('listModulesAdmin() should GET /modules-list', () => {
    service.listModulesAdmin().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/modules-list`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('listContent() should GET /content without moduleId', () => {
    service.listContent().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/content`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('listContent() should GET /content with moduleId param', () => {
    service.listContent(3).subscribe();
    const req = http.expectOne(r => r.url === `${base}/content` && r.params.get('moduleId') === '3');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('createContent() should POST to /content', () => {
    const fd = new FormData();
    service.createContent(fd).subscribe(res => expect(res.id).toBe(20));
    const req = http.expectOne(`${base}/content`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 20 });
  });

  it('updateContent() should PUT to /content/:id', () => {
    const fd = new FormData();
    service.updateContent(20, fd).subscribe();
    const req = http.expectOne(`${base}/content/20`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('deleteContent() should DELETE /content/:id', () => {
    service.deleteContent(20).subscribe();
    const req = http.expectOne(`${base}/content/20`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('listSections() should GET /modules/:moduleId/sections', () => {
    service.listSections(3).subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/modules/3/sections`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('createSection() should POST to /modules/:moduleId/sections', () => {
    service.createSection(3, { title: 'Intro', description: 'Welcome', sortOrder: 1 }).subscribe(res => expect(res.id).toBe(15));
    const req = http.expectOne(`${base}/modules/3/sections`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Intro', description: 'Welcome', sortOrder: 1 });
    req.flush({ id: 15 });
  });

  it('updateSection() should PUT to /sections/:sectionId', () => {
    service.updateSection(15, { title: 'Updated', sortOrder: 2 }).subscribe();
    const req = http.expectOne(`${base}/sections/15`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('deleteSection() should DELETE /sections/:sectionId', () => {
    service.deleteSection(15).subscribe();
    const req = http.expectOne(`${base}/sections/15`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('reorderSections() should PUT to /modules/:moduleId/reorder-sections', () => {
    service.reorderSections(3, [{ id: 15, sortOrder: 1 }, { id: 16, sortOrder: 2 }]).subscribe();
    const req = http.expectOne(`${base}/modules/3/reorder-sections`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items: [{ id: 15, sortOrder: 1 }, { id: 16, sortOrder: 2 }] });
    req.flush({});
  });

  it('reorderContent() should PUT to /modules/:moduleId/reorder-content', () => {
    service.reorderContent(3, [{ type: 'video', id: 7, sortOrder: 1, sectionId: 15 }]).subscribe();
    const req = http.expectOne(`${base}/modules/3/reorder-content`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items: [{ type: 'video', id: 7, sortOrder: 1, sectionId: 15 }] });
    req.flush({});
  });

  it('getPendingSubmissions() should GET /submissions/pending', () => {
    service.getPendingSubmissions().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/submissions/pending`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('gradeSubmission() should POST to /submissions/:attemptId/grade', () => {
    service.gradeSubmission(42, [{ shortAnswerId: 1, score: 5 }]).subscribe();
    const req = http.expectOne(`${base}/submissions/42/grade`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ questionGrades: [{ shortAnswerId: 1, score: 5 }] });
    req.flush({});
  });

  it('getOrgAnalytics() should GET /analytics with default days=90', () => {
    service.getOrgAnalytics().subscribe();
    const req = http.expectOne(r => r.url === `${base}/analytics` && r.params.get('days') === '90');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getOrgAnalytics() should GET /analytics with custom days', () => {
    service.getOrgAnalytics(30).subscribe();
    const req = http.expectOne(r => r.url === `${base}/analytics` && r.params.get('days') === '30');
    req.flush({});
  });

  it('listAdminPaths() should GET /paths', () => {
    service.listAdminPaths().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/paths`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('getQuizAnalytics() should GET /analytics/quiz/:quizId', () => {
    service.getQuizAnalytics(5).subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/analytics/quiz/5`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('listSignatures() should GET /signatures', () => {
    service.listSignatures().subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/signatures`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('listModuleVersions() should GET /modules/:moduleId/versions', () => {
    service.listModuleVersions(3).subscribe(res => expect(res.data).toEqual([]));
    const req = http.expectOne(`${base}/modules/3/versions`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('bulkUpdateVideos() should PUT with reassign action and moduleId', () => {
    service.bulkUpdateVideos('reassign', [1, 2], 10).subscribe();
    const req = http.expectOne(`${base}/videos/bulk`);
    expect(req.request.body).toEqual({ action: 'reassign', videoIds: [1, 2], moduleId: 10 });
    req.flush({});
  });

  it('getCompletions() should pass only from filter', () => {
    service.getCompletions({ from: '2026-01-01' }).subscribe();
    const req = http.expectOne(r => r.url === `${base}/completions` && r.params.get('from') === '2026-01-01');
    req.flush({ data: [] });
  });

  it('getCompletions() should pass only to filter', () => {
    service.getCompletions({ to: '2026-03-31' }).subscribe();
    const req = http.expectOne(r => r.url === `${base}/completions` && r.params.get('to') === '2026-03-31');
    req.flush({ data: [] });
  });

  it('getCompletions() should pass only user filter', () => {
    service.getCompletions({ user: 'bob' }).subscribe();
    const req = http.expectOne(r => r.url === `${base}/completions` && r.params.get('user') === 'bob');
    req.flush({ data: [] });
  });
});
