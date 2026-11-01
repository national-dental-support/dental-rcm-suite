import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PMSService, PMSConnection, PMSProvider, PMSSyncLogEntry, PMSFieldMapping, SyncResult } from './pms.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('PMSService', () => {
  let service: PMSService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/integrations/pms`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PMSService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(PMSService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('listConnections() should GET /connections', () => {
    service.listConnections().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/connections`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createConnection() should POST to /connections', () => {
    const data: Partial<PMSConnection> = { name: 'Eaglesoft', pmsType: 'eaglesoft' };
    service.createConnection(data).subscribe(res => expect(res).toEqual({ id: 1 }));
    const req = http.expectOne(`${base}/connections`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(data);
    req.flush({ id: 1 });
  });

  it('updateConnection() should PUT to /connections/:id', () => {
    service.updateConnection(2, { isActive: false }).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/connections/2`);
    expect(req.request.method).toBe('PUT');
    req.flush({ success: true });
  });

  it('deleteConnection() should DELETE /connections/:id', () => {
    service.deleteConnection(3).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/connections/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('testConnection() should POST to /test/:id', () => {
    service.testConnection(4).subscribe(res => expect(res.success).toBeTrue());
    const req = http.expectOne(`${base}/test/4`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, pmsType: 'eaglesoft', message: 'Connected' });
  });

  it('triggerSync() should POST to /sync/:id with direction and syncType', () => {
    service.triggerSync(5, 'import', 'claims').subscribe();
    const req = http.expectOne(`${base}/sync/5`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ direction: 'import', syncType: 'claims' });
    req.flush({ success: true, recordsProcessed: 10, recordsFailed: 0, direction: 'import', syncType: 'claims', durationMs: 500 } as SyncResult);
  });

  it('getLogs() should GET /logs with days param', () => {
    service.getLogs(14).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(r => r.url === `${base}/logs` && r.params.get('days') === '14');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getLogs() should use default 30 days when called without arguments (default-arg arm0)', () => {
    service.getLogs().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(r => r.url === `${base}/logs` && r.params.get('days') === '30');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getFieldMappings() should GET /field-mappings/:connectionId', () => {
    service.getFieldMappings(6).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/field-mappings/6`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('saveFieldMapping() should POST to /field-mappings/:connectionId', () => {
    const mapping: Partial<PMSFieldMapping> = { pmsField: 'PatID', rcmField: 'patientId' };
    service.saveFieldMapping(6, mapping).subscribe(res => expect(res).toEqual({ id: 9 }));
    const req = http.expectOne(`${base}/field-mappings/6`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 9 });
  });

  it('deleteFieldMapping() should DELETE /field-mappings/mapping/:mappingId', () => {
    service.deleteFieldMapping(9).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/field-mappings/mapping/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('getProviders() should GET /providers', () => {
    service.getProviders().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/providers`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
