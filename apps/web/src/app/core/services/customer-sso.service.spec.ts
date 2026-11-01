import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CustomerSSOService, SSOConfig, SSOTestResult, SSOLookupResult } from './customer-sso.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('CustomerSSOService', () => {
  let service: CustomerSSOService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/admin/sso`;

  const mockConfig: SSOConfig = {
    id: 1,
    customerId: 10,
    providerType: 'saml',
    displayName: 'SAML Provider',
    domain: 'example.com',
    isActive: true,
    autoProvisionUsers: false,
    defaultRole: 'user',
    enforceSso: false,
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(CustomerSSOService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listConfigs', () => {
    it('should GET /api/admin/sso/configs', () => {
      service.listConfigs().subscribe(res => expect(res).toEqual([mockConfig]));
      const req = http.expectOne(`${base}/configs`);
      expect(req.request.method).toBe('GET');
      req.flush([mockConfig]);
    });
  });

  describe('getConfig', () => {
    it('should GET /api/admin/sso/configs/:id', () => {
      service.getConfig(1).subscribe(res => expect(res).toEqual(mockConfig));
      const req = http.expectOne(`${base}/configs/1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockConfig);
    });
  });

  describe('createConfig', () => {
    it('should POST /api/admin/sso/configs with body', () => {
      const payload = { displayName: 'New', domain: 'new.com' };
      service.createConfig(payload).subscribe(res => expect(res).toEqual({ id: 42 }));
      const req = http.expectOne(`${base}/configs`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({ id: 42 });
    });
  });

  describe('updateConfig', () => {
    it('should PUT /api/admin/sso/configs/:id with body', () => {
      const updates = { displayName: 'Updated' };
      service.updateConfig(1, updates).subscribe(res => expect(res).toEqual({ success: true }));
      const req = http.expectOne(`${base}/configs/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updates);
      req.flush({ success: true });
    });
  });

  describe('deleteConfig', () => {
    it('should DELETE /api/admin/sso/configs/:id', () => {
      service.deleteConfig(1).subscribe(res => expect(res).toEqual({ success: true }));
      const req = http.expectOne(`${base}/configs/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });

  describe('lookupByDomain', () => {
    it('should GET /api/admin/sso/lookup with domain param', () => {
      const result: SSOLookupResult = { hasSso: true, enforceSso: false };
      service.lookupByDomain('example.com').subscribe(res => expect(res).toEqual(result));
      const req = http.expectOne(r => r.url === `${base}/lookup` && r.params.get('domain') === 'example.com');
      expect(req.request.method).toBe('GET');
      req.flush(result);
    });
  });

  describe('testConfig', () => {
    it('should POST /api/admin/sso/test/:id', () => {
      const result: SSOTestResult = {
        success: true,
        providerType: 'saml',
        displayName: 'Test',
        checks: [],
      };
      service.testConfig(1).subscribe(res => expect(res).toEqual(result));
      const req = http.expectOne(`${base}/test/1`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(result);
    });
  });
});
