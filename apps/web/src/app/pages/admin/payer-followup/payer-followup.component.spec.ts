import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { PayerFollowupAdminComponent } from './payer-followup.component';
import { PayerFollowupService, FollowupRule } from '../../../core/services/payer-followup.service';

describe('PayerFollowupAdminComponent', () => {
  let component: PayerFollowupAdminComponent;
  let fixture: ComponentFixture<PayerFollowupAdminComponent>;
  let svcSpy: jasmine.SpyObj<PayerFollowupService>;

  const mockRule: FollowupRule = {
    id: 1,
    name: 'Rule One',
    daysWithoutResponse: 14,
    autoGenerateTask: true,
    autoGenerateAppeal: false,
    notifySpecialist: true,
    isActive: true,
  } as any;

  beforeEach(async () => {
    svcSpy = jasmine.createSpyObj('PayerFollowupService', [
      'listRules', 'listTasks', 'createRule', 'updateRule', 'deleteRule', 'completeTask',
    ]);
    svcSpy.listRules.and.returnValue(of([mockRule]));
    svcSpy.listTasks.and.returnValue(of([]));
    svcSpy.createRule.and.returnValue(of(mockRule));
    svcSpy.updateRule.and.returnValue(of(mockRule) as any);
    svcSpy.deleteRule.and.returnValue(of(void 0));
    svcSpy.completeTask.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      declarations: [PayerFollowupAdminComponent],
      providers: [{ provide: PayerFollowupService, useValue: svcSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PayerFollowupAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load rules on init', () => {
    expect(component.rules.length).toBe(1);
    expect(component.loading).toBeFalse();
  });

  it('should default to rules view', () => {
    expect(component.view).toBe('rules');
  });

  it('should start new rule', () => {
    component.newRule();
    expect(component.editing).toBeTrue();
    expect(component.editingId).toBeNull();
  });

  it('should edit existing rule', () => {
    component.editRule(mockRule);
    expect(component.editing).toBeTrue();
    expect(component.editingId).toBe(1);
    expect(component.form.name).toBe('Rule One');
  });

  it('should cancel edit', () => {
    component.newRule();
    component.cancelEdit();
    expect(component.editing).toBeFalse();
  });

  it('should switch to tasks view and load tasks', () => {
    component.switchView('tasks');
    expect(component.view).toBe('tasks');
    expect(svcSpy.listTasks).toHaveBeenCalled();
  });

  it('should delete rule when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.deleteRule(1);
    expect(svcSpy.deleteRule).toHaveBeenCalledWith(1);
  });

  it('should not delete rule when not confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.deleteRule(1);
    expect(svcSpy.deleteRule).not.toHaveBeenCalled();
  });
});
