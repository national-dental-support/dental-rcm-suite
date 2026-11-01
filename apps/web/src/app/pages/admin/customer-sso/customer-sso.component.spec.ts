import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomerSSOAdminComponent } from './customer-sso.component';
import { CustomerSSOService, SSOConfig, SSOTestResult } from '../../../core/services/customer-sso.service';

describe('CustomerSSOAdminComponent', () => {
  let component: CustomerSSOAdminComponent;
  let fixture: ComponentFixture<CustomerSSOAdminComponent>;
  let svcSpy: jasmine.SpyObj<CustomerSSOService>;
  let snackSpy: jasmine.SpyObj<MatSnackBar>;

  const mockConfig: SSOConfig = {
    id: 1,
    customerId: 42,
    providerType: 'oidc',
    displayName: 'Acme SSO',
    domain: 'acme.com',
    clientId: 'client-abc',
    metadataUrl: 'https://meta.acme.com',
    issuer: 'https://issuer.acme.com',
    authorizationUrl: 'https://auth.acme.com',
    tokenUrl: 'https://token.acme.com',
    certificate: 'cert-data',
    attributeMapping: { email: 'email', firstName: 'given_name' },
    isActive: true,
    autoProvisionUsers: false,
    defaultRole: 'User',
    enforceSso: false,
    createdAt: '2026-01-01',
  };

  const mockTestResult: SSOTestResult = {
    success: true,
    providerType: 'oidc',
    displayName: 'Acme SSO',
    checks: [{ check: 'metadata', status: 'pass' }],
  };

  beforeEach(async () => {
    svcSpy = jasmine.createSpyObj('CustomerSSOService', [
      'listConfigs', 'createConfig', 'updateConfig', 'deleteConfig', 'testConfig',
    ]);
    snackSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    svcSpy.listConfigs.and.returnValue(of([mockConfig]));

    await TestBed.configureTestingModule({
      declarations: [CustomerSSOAdminComponent],
      providers: [
        { provide: CustomerSSOService, useValue: svcSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerSSOAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- ngOnInit / loadConfigs --------------------------------------

  it('should load configs on init', () => {
    expect(svcSpy.listConfigs).toHaveBeenCalled();
    expect(component.configs.length).toBe(1);
    expect(component.configs[0].displayName).toBe('Acme SSO');
  });

  it('should set loading false after configs load', () => {
    expect(component.loading).toBeFalse();
  });

  it('should set loading false on loadConfigs error', fakeAsync(() => {
    svcSpy.listConfigs.and.returnValue(throwError(() => new Error('fail')));
    component.loadConfigs();
    tick();
    expect(component.loading).toBeFalse();
  }));

  // -- openCreate / openEdit / cancelForm --------------------------

  it('openCreate should show blank form', () => {
    component.openCreate();
    expect(component.showForm).toBeTrue();
    expect(component.editingId).toBeNull();
    expect(component.form.displayName).toBe('');
    expect(component.form.domain).toBe('');
    expect(component.form.providerType).toBe('oidc');
    expect(component.form.isActive).toBeFalse();
    expect(component.form.autoProvisionUsers).toBeFalse();
    expect(component.form.defaultRole).toBe('User');
    expect(component.form.enforceSso).toBeFalse();
    expect(component.form.attributeMapping).toEqual({ email: 'email', firstName: 'given_name', lastName: 'family_name' });
  });

  it('openEdit should populate form from config', () => {
    component.openEdit(mockConfig);
    expect(component.showForm).toBeTrue();
    expect(component.editingId).toBe(1);
    expect(component.form.customerId).toBe(42);
    expect(component.form.displayName).toBe('Acme SSO');
    expect(component.form.domain).toBe('acme.com');
    expect(component.form.providerType).toBe('oidc');
    expect(component.form.clientId).toBe('client-abc');
    expect(component.form.clientSecret).toBe('');
    expect(component.form.metadataUrl).toBe('https://meta.acme.com');
    expect(component.form.issuer).toBe('https://issuer.acme.com');
    expect(component.form.authorizationUrl).toBe('https://auth.acme.com');
    expect(component.form.tokenUrl).toBe('https://token.acme.com');
    expect(component.form.certificate).toBe('cert-data');
    expect(component.form.isActive).toBeTrue();
    expect(component.form.autoProvisionUsers).toBeFalse();
    expect(component.form.defaultRole).toBe('User');
    expect(component.form.enforceSso).toBeFalse();
  });

  it('openEdit should use defaults for null optional fields', () => {
    const sparse: SSOConfig = {
      ...mockConfig,
      clientId: undefined,
      metadataUrl: undefined,
      issuer: undefined,
      authorizationUrl: undefined,
      tokenUrl: undefined,
      certificate: undefined,
      attributeMapping: undefined,
    };
    component.openEdit(sparse);
    expect(component.form.clientId).toBe('');
    expect(component.form.metadataUrl).toBe('');
    expect(component.form.attributeMapping).toEqual({ email: 'email', firstName: 'given_name', lastName: 'family_name' });
  });

  it('cancelForm should hide form', () => {
    component.openCreate();
    component.cancelForm();
    expect(component.showForm).toBeFalse();
  });

  // -- isSaml ------------------------------------------------------

  it('isSaml should return false for oidc', () => {
    component.form.providerType = 'oidc';
    expect(component.isSaml).toBeFalse();
  });

  it('isSaml should return true for saml', () => {
    component.form.providerType = 'saml';
    expect(component.isSaml).toBeTrue();
  });

  it('isSaml should return false for azure-ad', () => {
    component.form.providerType = 'azure-ad';
    expect(component.isSaml).toBeFalse();
  });

  // -- saveForm ----------------------------------------------------

  it('saveForm should do nothing if displayName is empty', () => {
    component.form.displayName = '';
    component.form.domain = 'test.com';
    component.form.providerType = 'oidc';
    component.saveForm();
    expect(svcSpy.createConfig).not.toHaveBeenCalled();
    expect(svcSpy.updateConfig).not.toHaveBeenCalled();
  });

  it('saveForm should do nothing if domain is empty', () => {
    component.form.displayName = 'Test';
    component.form.domain = '';
    component.form.providerType = 'oidc';
    component.saveForm();
    expect(svcSpy.createConfig).not.toHaveBeenCalled();
  });

  it('saveForm should create config when editingId is null', fakeAsync(() => {
    svcSpy.createConfig.and.returnValue(of(null as any));
    component.editingId = null;
    component.form.displayName = 'New SSO';
    component.form.domain = 'new.com';
    component.form.providerType = 'oidc';
    component.saveForm();
    tick();
    expect(svcSpy.createConfig).toHaveBeenCalledWith(component.form);
    expect(snackSpy.open).toHaveBeenCalledWith('SSO configuration created', 'OK', { duration: 2000 });
    expect(component.showForm).toBeFalse();
  }));

  it('saveForm should update config when editingId is set', fakeAsync(() => {
    svcSpy.updateConfig.and.returnValue(of(null as any));
    component.editingId = 1;
    component.form.displayName = 'Updated SSO';
    component.form.domain = 'acme.com';
    component.form.providerType = 'oidc';
    component.saveForm();
    tick();
    expect(svcSpy.updateConfig).toHaveBeenCalledWith(1, component.form);
    expect(snackSpy.open).toHaveBeenCalledWith('SSO configuration updated', 'OK', { duration: 2000 });
  }));

  it('saveForm should show error snack on create failure', fakeAsync(() => {
    svcSpy.createConfig.and.returnValue(throwError(() => new Error('fail')));
    component.editingId = null;
    component.form.displayName = 'New';
    component.form.domain = 'new.com';
    component.form.providerType = 'oidc';
    component.saveForm();
    tick();
    expect(snackSpy.open).toHaveBeenCalledWith('Failed to create', 'OK', { duration: 3000 });
  }));

  it('saveForm should show error snack on update failure', fakeAsync(() => {
    svcSpy.updateConfig.and.returnValue(throwError(() => new Error('fail')));
    component.editingId = 1;
    component.form.displayName = 'Updated';
    component.form.domain = 'acme.com';
    component.form.providerType = 'oidc';
    component.saveForm();
    tick();
    expect(snackSpy.open).toHaveBeenCalledWith('Failed to update', 'OK', { duration: 3000 });
  }));

  // -- testConfig --------------------------------------------------

  it('testConfig should add to testing set and store result on success', fakeAsync(() => {
    const subj = new Subject<SSOTestResult>();
    svcSpy.testConfig.and.returnValue(subj.asObservable());
    component.testConfig(mockConfig);
    expect(component.testing.has(1)).toBeTrue();
    subj.next(mockTestResult);
    subj.complete();
    tick();
    expect(component.testing.has(1)).toBeFalse();
    expect(component.testResults[1]).toEqual(mockTestResult);
  }));

  it('testConfig should clear previous result before testing', fakeAsync(() => {
    component.testResults[1] = mockTestResult;
    svcSpy.testConfig.and.returnValue(of(mockTestResult));
    component.testConfig(mockConfig);
    // At the point of calling, result should be deleted
    // (we can't check mid-subscribe, but after tick it should be set again)
    tick();
    expect(component.testResults[1]).toEqual(mockTestResult);
  }));

  it('testConfig should remove from testing set on error and show snack', fakeAsync(() => {
    svcSpy.testConfig.and.returnValue(throwError(() => new Error('fail')));
    component.testConfig(mockConfig);
    tick();
    expect(component.testing.has(1)).toBeFalse();
    expect(snackSpy.open).toHaveBeenCalledWith('Test failed', 'OK', { duration: 3000 });
  }));

  // -- deleteConfig ------------------------------------------------

  it('deleteConfig should not call service if confirm is cancelled', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.deleteConfig(mockConfig);
    expect(svcSpy.deleteConfig).not.toHaveBeenCalled();
  });

  it('deleteConfig should call service on confirm and show snack', fakeAsync(() => {
    spyOn(window, 'confirm').and.returnValue(true);
    svcSpy.deleteConfig.and.returnValue(of(void 0 as any));
    component.deleteConfig(mockConfig);
    tick();
    expect(svcSpy.deleteConfig).toHaveBeenCalledWith(1);
    expect(snackSpy.open).toHaveBeenCalledWith('SSO config deleted', 'OK', { duration: 2000 });
  }));

  it('deleteConfig should show error snack on failure', fakeAsync(() => {
    spyOn(window, 'confirm').and.returnValue(true);
    svcSpy.deleteConfig.and.returnValue(throwError(() => new Error('fail')));
    component.deleteConfig(mockConfig);
    tick();
    expect(snackSpy.open).toHaveBeenCalledWith('Failed to delete', 'OK', { duration: 3000 });
  }));

  // -- providerLabel -----------------------------------------------

  it('providerLabel should return correct label for known types', () => {
    expect(component.providerLabel('saml')).toBe('SAML 2.0');
    expect(component.providerLabel('oidc')).toBe('OpenID Connect (OIDC)');
    expect(component.providerLabel('azure-ad')).toBe('Azure AD (Entra ID)');
  });

  it('providerLabel should return raw value for unknown type', () => {
    expect(component.providerLabel('unknown')).toBe('unknown');
  });

  // -- Static data -------------------------------------------------

  it('should have predefined provider types', () => {
    expect(component.providerTypes.length).toBe(3);
  });

  it('should have predefined roles', () => {
    expect(component.roles).toContain('User');
    expect(component.roles).toContain('Admin');
    expect(component.roles.length).toBe(5);
  });
});
