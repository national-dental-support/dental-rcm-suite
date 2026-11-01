import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SecurityAdminComponent } from './security.component';
import {
  SecurityAdminService,
  MaskingRule,
  SecurityStatus,
} from '../../../core/services/security-admin.service';

describe('SecurityAdminComponent', () => {
  let component: SecurityAdminComponent;
  let fixture: ComponentFixture<SecurityAdminComponent>;
  let svcSpy: jasmine.SpyObj<SecurityAdminService>;
  let snackSpy: jasmine.SpyObj<MatSnackBar>;

  const mockStatus: SecurityStatus = {
    encryption: {
      tdeEnabled: true,
      fieldEncryptionEnabled: false,
      encryptedFields: ['ssn', 'dob'],
    },
    masking: { activeMaskingRules: 3 },
    fieldEncryptionKeyConfigured: true,
  };

  const mockRule: MaskingRule = {
    id: 10,
    fieldName: 'ssn',
    displayLabel: 'SSN',
    category: 'phi',
    maskType: 'last4',
    visibleAboveRole: 3,
    isActive: true,
  };

  beforeEach(async () => {
    svcSpy = jasmine.createSpyObj('SecurityAdminService', [
      'getSecurityStatus',
      'getMaskingRules',
      'createMaskingRule',
      'updateMaskingRule',
      'deleteMaskingRule',
      'updateEncryptionConfig',
    ]);
    snackSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    svcSpy.getSecurityStatus.and.returnValue(of(mockStatus));
    svcSpy.getMaskingRules.and.returnValue(of([mockRule]));

    await TestBed.configureTestingModule({
      declarations: [SecurityAdminComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: SecurityAdminService, useValue: svcSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SecurityAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- ngOnInit / loadStatus ---------------------------------------

  it('should load security status on init', () => {
    expect(svcSpy.getSecurityStatus).toHaveBeenCalled();
    expect(component.status).toEqual(mockStatus);
  });

  it('should populate encryption fields from status', () => {
    expect(component.encTdeEnabled).toBeTrue();
    expect(component.encFieldEnabled).toBeFalse();
    expect(component.encFields).toEqual(['ssn', 'dob']);
  });

  it('should set loading false after status loads', () => {
    expect(component.loading).toBeFalse();
  });

  it('should set loading false on status error', fakeAsync(() => {
    svcSpy.getSecurityStatus.and.returnValue(throwError(() => new Error('fail')));
    component.loadStatus();
    tick();
    expect(component.loading).toBeFalse();
  }));

  // -- activeView / switchView -------------------------------------

  it('should default to overview view', () => {
    expect(component.activeView).toBe('overview');
  });

  it('switchView should change activeView', () => {
    component.switchView('encryption');
    expect(component.activeView).toBe('encryption');
  });

  it('switchView to masking should load masking rules when empty', () => {
    component.maskingRules = [];
    component.switchView('masking');
    expect(svcSpy.getMaskingRules).toHaveBeenCalled();
  });

  it('switchView to masking should NOT reload if rules already loaded', () => {
    component.maskingRules = [mockRule];
    svcSpy.getMaskingRules.calls.reset();
    component.switchView('masking');
    expect(svcSpy.getMaskingRules).not.toHaveBeenCalled();
  });

  it('switchView to logs should not load masking rules', () => {
    svcSpy.getMaskingRules.calls.reset();
    component.switchView('logs');
    expect(component.activeView).toBe('logs');
    expect(svcSpy.getMaskingRules).not.toHaveBeenCalled();
  });

  // -- loadMaskingRules --------------------------------------------

  it('loadMaskingRules should populate maskingRules', fakeAsync(() => {
    component.loadMaskingRules();
    tick();
    expect(component.maskingRules).toEqual([mockRule]);
  }));

  // -- openCreateRule / openEditRule / cancelRuleForm ---------------

  it('openCreateRule should show blank form', () => {
    component.openCreateRule();
    expect(component.showRuleForm).toBeTrue();
    expect(component.editingRuleId).toBeNull();
    expect(component.ruleForm.fieldName).toBe('');
  });

  it('openEditRule should populate form from rule', () => {
    component.openEditRule(mockRule);
    expect(component.showRuleForm).toBeTrue();
    expect(component.editingRuleId).toBe(10);
    expect(component.ruleForm.fieldName).toBe('ssn');
    expect(component.ruleForm.displayLabel).toBe('SSN');
    expect(component.ruleForm.category).toBe('phi');
    expect(component.ruleForm.maskType).toBe('last4');
    expect(component.ruleForm.visibleAboveRole).toBe(3);
    expect(component.ruleForm.isActive).toBeTrue();
  });

  it('cancelRuleForm should hide form', () => {
    component.showRuleForm = true;
    component.cancelRuleForm();
    expect(component.showRuleForm).toBeFalse();
  });

  // -- saveRule ----------------------------------------------------

  it('saveRule should do nothing if fieldName is empty', () => {
    component.ruleForm.fieldName = '';
    component.ruleForm.displayLabel = 'Test';
    component.saveRule();
    expect(svcSpy.createMaskingRule).not.toHaveBeenCalled();
    expect(svcSpy.updateMaskingRule).not.toHaveBeenCalled();
  });

  it('saveRule should do nothing if displayLabel is empty', () => {
    component.ruleForm.fieldName = 'ssn';
    component.ruleForm.displayLabel = '';
    component.saveRule();
    expect(svcSpy.createMaskingRule).not.toHaveBeenCalled();
  });

  it('saveRule should create rule when editingRuleId is null', fakeAsync(() => {
    svcSpy.createMaskingRule.and.returnValue(of(null as any));
    component.editingRuleId = null;
    component.ruleForm.fieldName = 'dob';
    component.ruleForm.displayLabel = 'DOB';
    component.saveRule();
    tick();
    expect(svcSpy.createMaskingRule).toHaveBeenCalledWith(component.ruleForm);
    expect(snackSpy.open).toHaveBeenCalledWith('Rule created', 'OK', { duration: 2000 });
    expect(component.showRuleForm).toBeFalse();
  }));

  it('saveRule should update rule when editingRuleId is set', fakeAsync(() => {
    svcSpy.updateMaskingRule.and.returnValue(of(null as any));
    component.editingRuleId = 10;
    component.ruleForm.fieldName = 'ssn';
    component.ruleForm.displayLabel = 'SSN';
    component.saveRule();
    tick();
    expect(svcSpy.updateMaskingRule).toHaveBeenCalledWith(10, component.ruleForm);
    expect(snackSpy.open).toHaveBeenCalledWith('Rule updated', 'OK', { duration: 2000 });
    expect(component.showRuleForm).toBeFalse();
  }));

  it('saveRule should show error snack on create failure', fakeAsync(() => {
    svcSpy.createMaskingRule.and.returnValue(throwError(() => new Error('fail')));
    component.editingRuleId = null;
    component.ruleForm.fieldName = 'dob';
    component.ruleForm.displayLabel = 'DOB';
    component.saveRule();
    tick();
    expect(snackSpy.open).toHaveBeenCalledWith('Failed to create', 'OK', { duration: 3000 });
  }));

  it('saveRule should show error snack on update failure', fakeAsync(() => {
    svcSpy.updateMaskingRule.and.returnValue(throwError(() => new Error('fail')));
    component.editingRuleId = 10;
    component.ruleForm.fieldName = 'ssn';
    component.ruleForm.displayLabel = 'SSN';
    component.saveRule();
    tick();
    expect(snackSpy.open).toHaveBeenCalledWith('Failed to update', 'OK', { duration: 3000 });
  }));

  // -- deleteRule --------------------------------------------------

  it('deleteRule should not call service if confirm is cancelled', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.deleteRule(mockRule);
    expect(svcSpy.deleteMaskingRule).not.toHaveBeenCalled();
  });

  it('deleteRule should call service and show snack on success', fakeAsync(() => {
    spyOn(window, 'confirm').and.returnValue(true);
    svcSpy.deleteMaskingRule.and.returnValue(of(null as any));
    component.deleteRule(mockRule);
    tick();
    expect(svcSpy.deleteMaskingRule).toHaveBeenCalledWith(10);
    expect(snackSpy.open).toHaveBeenCalledWith('Rule deleted', 'OK', { duration: 2000 });
  }));

  it('deleteRule should show error snack on failure', fakeAsync(() => {
    spyOn(window, 'confirm').and.returnValue(true);
    svcSpy.deleteMaskingRule.and.returnValue(throwError(() => new Error('fail')));
    component.deleteRule(mockRule);
    tick();
    expect(snackSpy.open).toHaveBeenCalledWith('Failed to delete', 'OK', { duration: 3000 });
  }));

  // -- saveEncryptionConfig ----------------------------------------

  it('saveEncryptionConfig should call service with stringified values', fakeAsync(() => {
    svcSpy.updateEncryptionConfig.and.returnValue(of(null as any));
    component.encTdeEnabled = true;
    component.encFieldEnabled = false;
    component.encFields = ['ssn'];
    component.saveEncryptionConfig();
    tick();
    expect(svcSpy.updateEncryptionConfig).toHaveBeenCalledWith({
      tde_enabled: 'true',
      field_encryption_enabled: 'false',
      encrypted_fields: JSON.stringify(['ssn']),
    });
    expect(snackSpy.open).toHaveBeenCalledWith('Encryption settings saved', 'OK', { duration: 2000 });
  }));

  it('saveEncryptionConfig should show error snack on failure', fakeAsync(() => {
    svcSpy.updateEncryptionConfig.and.returnValue(throwError(() => new Error('fail')));
    component.saveEncryptionConfig();
    tick();
    expect(snackSpy.open).toHaveBeenCalledWith('Failed to save', 'OK', { duration: 3000 });
  }));

  // -- Static data -------------------------------------------------

  it('should have roleNames mapping', () => {
    expect(component.roleNames[0]).toBe('User');
    expect(component.roleNames[5]).toBe('Super Admin');
  });

  it('should have categories and maskTypes arrays', () => {
    expect(component.categories).toEqual(['phi', 'pii', 'financial']);
    expect(component.maskTypes).toEqual(['full', 'last4', 'date', 'partial']);
  });
});
