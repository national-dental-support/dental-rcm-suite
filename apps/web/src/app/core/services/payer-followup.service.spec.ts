import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PayerFollowupService, FollowupRule, FollowupTask } from './payer-followup.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('PayerFollowupService', () => {
  let service: PayerFollowupService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/automation/payer-followup`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PayerFollowupService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(PayerFollowupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('listRules() should GET /rules', () => {
    const rules: FollowupRule[] = [];
    service.listRules().subscribe(res => expect(res).toEqual(rules));
    const req = http.expectOne(`${base}/rules`);
    expect(req.request.method).toBe('GET');
    req.flush(rules);
  });

  it('createRule() should POST to /rules', () => {
    const draft: Partial<FollowupRule> = { name: 'Test Rule', daysWithoutResponse: 30 };
    service.createRule(draft).subscribe(res => expect(res).toEqual({ id: 1 }));
    const req = http.expectOne(`${base}/rules`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(draft);
    req.flush({ id: 1 });
  });

  it('updateRule() should PUT to /rules/:id', () => {
    const patch: Partial<FollowupRule> = { isActive: false };
    service.updateRule(5, patch).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/rules/5`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(patch);
    req.flush({ success: true });
  });

  it('deleteRule() should DELETE /rules/:id', () => {
    service.deleteRule(3).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/rules/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('listTasks() should GET /tasks without params when no status provided', () => {
    const tasks: FollowupTask[] = [];
    service.listTasks().subscribe(res => expect(res).toEqual(tasks));
    const req = http.expectOne(`${base}/tasks`);
    expect(req.request.method).toBe('GET');
    req.flush(tasks);
  });

  it('listTasks() should GET /tasks with status param when status is provided', () => {
    const tasks: FollowupTask[] = [];
    service.listTasks('open').subscribe(res => expect(res).toEqual(tasks));
    const req = http.expectOne(r => r.url === `${base}/tasks` && r.params.get('status') === 'open');
    expect(req.request.method).toBe('GET');
    req.flush(tasks);
  });

  it('completeTask() should POST to /tasks/:id/complete', () => {
    service.completeTask(7).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/tasks/7/complete`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });
  });
});
