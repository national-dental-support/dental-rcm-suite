import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OdAdminService, OdUser, OdUserGroup, OdSecurityPerm, OdClinic } from './od-admin.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('OdAdminService', () => {
  let service: OdAdminService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/od/tenantA`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [OdAdminService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(OdAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('users() should GET /tenantA/users', () => {
    const users: OdUser[] = [{ UserNum: 1, UserName: 'admin' }];
    service.users().subscribe(res => expect(res).toEqual(users));
    const req = http.expectOne(`${base}/users`);
    expect(req.request.method).toBe('GET');
    req.flush(users);
  });

  it('userGroups() should GET /tenantA/usergroups', () => {
    const groups: OdUserGroup[] = [{ UserGroupNum: 1, Description: 'Admins' }];
    service.userGroups().subscribe(res => expect(res).toEqual(groups));
    const req = http.expectOne(`${base}/usergroups`);
    expect(req.request.method).toBe('GET');
    req.flush(groups);
  });

  it('securityPerms() should GET /tenantA/security-perms', () => {
    const perms: OdSecurityPerm[] = [{ Permission: 1, Description: 'Login' }];
    service.securityPerms().subscribe(res => expect(res).toEqual(perms));
    const req = http.expectOne(`${base}/security-perms`);
    expect(req.request.method).toBe('GET');
    req.flush(perms);
  });

  it('clinics() should GET /tenantA/clinics', () => {
    const clinics: OdClinic[] = [{ ClinicNum: 1, Abbr: 'HQ', Description: 'Headquarters' }];
    service.clinics().subscribe(res => expect(res).toEqual(clinics));
    const req = http.expectOne(`${base}/clinics`);
    expect(req.request.method).toBe('GET');
    req.flush(clinics);
  });

  it('updateClinic() should PUT to /tenantA/clinics/:id', () => {
    const updated: OdClinic = { ClinicNum: 2, Abbr: 'BR', Description: 'Branch' };
    service.updateClinic(2, { Description: 'Branch' }).subscribe(res => expect(res).toEqual(updated));
    const req = http.expectOne(`${base}/clinics/2`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ Description: 'Branch' });
    req.flush(updated);
  });
});
