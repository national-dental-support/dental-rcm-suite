import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SecurityAdminService, MaskingRule, EncryptionConfig, SecurityStatus } from './security-admin.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SecurityAdminService', () => {
  let service: SecurityAdminService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/admin/security`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [SecurityAdminService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(SecurityAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getMaskingRules() should GET /masking-rules', () => {
    service.getMaskingRules().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/masking-rules`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createMaskingRule() should POST to /masking-rules', () => {
    const data: Partial<MaskingRule> = { fieldName: 'ssn', maskType: 'last4', category: 'phi', isActive: true, visibleAboveRole: 5, displayLabel: 'SSN' };
    service.createMaskingRule(data).subscribe(res => expect(res).toEqual({ id: 1 }));
    const req = http.expectOne(`${base}/masking-rules`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1 });
  });

  it('updateMaskingRule() should PUT to /masking-rules/:id', () => {
    service.updateMaskingRule(2, { isActive: false }).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/masking-rules/2`);
    expect(req.request.method).toBe('PUT');
    req.flush({ success: true });
  });

  it('deleteMaskingRule() should DELETE /masking-rules/:id', () => {
    service.deleteMaskingRule(3).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/masking-rules/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('getEncryptionConfig() should GET /encryption', () => {
    const config: EncryptionConfig = { tde_enabled: 'true', field_encryption_enabled: 'false', encrypted_fields: '[]' };
    service.getEncryptionConfig().subscribe(res => expect(res).toEqual(config));
    const req = http.expectOne(`${base}/encryption`);
    expect(req.request.method).toBe('GET');
    req.flush(config);
  });

  it('updateEncryptionConfig() should PUT to /encryption', () => {
    service.updateEncryptionConfig({ tde_enabled: 'true' }).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/encryption`);
    expect(req.request.method).toBe('PUT');
    req.flush({ success: true });
  });

  it('getSecurityStatus() should GET /status', () => {
    const status: SecurityStatus = {
      encryption: { tdeEnabled: true, fieldEncryptionEnabled: false, encryptedFields: [] },
      masking: { activeMaskingRules: 3 },
      fieldEncryptionKeyConfigured: false,
    };
    service.getSecurityStatus().subscribe(res => expect(res).toEqual(status));
    const req = http.expectOne(`${base}/status`);
    expect(req.request.method).toBe('GET');
    req.flush(status);
  });
});
