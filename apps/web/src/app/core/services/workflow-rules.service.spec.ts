import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WorkflowRulesService, WorkflowRule } from './workflow-rules.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('WorkflowRulesService', () => {
  let service: WorkflowRulesService;
  let http: HttpTestingController;
  const baseUrl = `${environment.server.baseUrl}/denial-iq/workflow-rules`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [WorkflowRulesService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(WorkflowRulesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('list() should GET base and unwrap data array', () => {
    const rules: WorkflowRule[] = [
      { name: 'Rule A', description: '', matchType: 'all', conditions: [], actions: [], isActive: true, priority: 1 },
    ];
    service.list().subscribe(res => expect(res).toEqual(rules));
    const req = http.expectOne(baseUrl);
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: rules });
  });

  it('list() should return [] when data is missing', () => {
    service.list().subscribe(res => expect(res).toEqual([]));
    http.expectOne(baseUrl).flush({ message: 'ok', data: null });
  });

  it('create() should POST to base and unwrap data', () => {
    const rule: Partial<WorkflowRule> = { name: 'New Rule', matchType: 'any', conditions: [], actions: [], isActive: true, priority: 5, description: '' };
    service.create(rule).subscribe(res => expect(res).toEqual({ id: 1 }));
    const req = http.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(rule);
    req.flush({ message: 'created', data: { id: 1 } });
  });

  it('update() should PUT to /:id', () => {
    service.update(3, { isActive: false }).subscribe();
    const req = http.expectOne(`${baseUrl}/3`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush(null);
  });

  it('delete() should DELETE /:id', () => {
    service.delete(3).subscribe();
    const req = http.expectOne(`${baseUrl}/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('evaluate() should POST to /evaluate', () => {
    service.evaluate().subscribe(res => {
      expect(res.actionsExecuted).toBe(2);
    });
    const req = http.expectOne(`${baseUrl}/evaluate`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Evaluated', actionsExecuted: 2, results: [] });
  });
});
