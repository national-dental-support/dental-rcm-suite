import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { WorkflowRulesAdminComponent } from './workflow-rules.component';
import { WorkflowRulesService, WorkflowRule } from '../../../core/services/workflow-rules.service';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';

const MOCK_RULE: WorkflowRule = {
  id: 1,
  name: 'High Aging',
  description: 'Escalate old claims',
  matchType: 'all',
  conditions: [{ field: 'agingDays', operator: '>', value: '90' }],
  actions: [{ actionType: 'auto-escalate', params: {} }],
  isActive: true,
  priority: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('WorkflowRulesAdminComponent', () => {
  let component: WorkflowRulesAdminComponent;
  let fixture: ComponentFixture<WorkflowRulesAdminComponent>;
  let svc: any;
  let dialog: any;

  beforeEach(async () => {
    svc = {
      list: jasmine.createSpy('list').and.returnValue(of([MOCK_RULE])),
      create: jasmine.createSpy('create').and.returnValue(of({ id: 2 })),
      update: jasmine.createSpy('update').and.returnValue(of(void 0)),
      delete: jasmine.createSpy('delete').and.returnValue(of(void 0)),
      evaluate: jasmine.createSpy('evaluate').and.returnValue(of({ matched: 3, actions: [] })),
    };

    dialog = {
      confirm: jasmine.createSpy('confirm').and.returnValue(of(true)),
      dangerConfirm: jasmine.createSpy('dangerConfirm').and.returnValue(of(true)),
    };

    await TestBed.configureTestingModule({
      declarations: [WorkflowRulesAdminComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: WorkflowRulesService, useValue: svc },
        { provide: RpDialogService, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkflowRulesAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load rules on init', () => {
    expect(svc.list).toHaveBeenCalled();
    expect(component.rules.length).toBe(1);
    expect(component.loading).toBeFalse();
  });

  it('should set loading false on list error', () => {
    svc.list.and.returnValue(throwError(() => new Error('fail')));
    component.loadRules();
    expect(component.loading).toBeFalse();
  });

  // -- addRule -------------------------------------------------------

  it('should initialize new rule with defaults', () => {
    component.addRule();
    expect(component.isNewRule).toBeTrue();
    expect(component.editingRule).toBeTruthy();
    expect(component.editingRule!.name).toBe('');
    expect(component.editingRule!.conditions.length).toBe(1);
    expect(component.editingRule!.actions.length).toBe(1);
    expect(component.editingRule!.priority).toBe(1); // rules.length is 1
  });

  // -- editRule ------------------------------------------------------

  it('should deep clone rule for editing', () => {
    component.editRule(MOCK_RULE);
    expect(component.isNewRule).toBeFalse();
    expect(component.editingRule).toBeTruthy();
    expect(component.editingRule!.name).toBe('High Aging');
    // Should be a deep clone
    expect(component.editingRule).not.toBe(MOCK_RULE);
    expect(component.editingRule!.conditions).not.toBe(MOCK_RULE.conditions);
  });

  // -- cancelEdit ----------------------------------------------------

  it('should clear editing state', () => {
    component.addRule();
    component.cancelEdit();
    expect(component.editingRule).toBeNull();
    expect(component.isNewRule).toBeFalse();
  });

  // -- saveRule ------------------------------------------------------

  it('should call create when saving new rule', () => {
    component.addRule();
    component.editingRule!.name = 'New Rule';
    component.saveRule();
    expect(svc.create).toHaveBeenCalled();
    expect(component.editingRule).toBeNull();
    expect(component.saving).toBeFalse();
  });

  it('should call update when saving existing rule', () => {
    component.editRule(MOCK_RULE);
    component.saveRule();
    expect(svc.update).toHaveBeenCalledWith(1, jasmine.any(Object));
    expect(component.editingRule).toBeNull();
  });

  it('should do nothing when name is empty', () => {
    component.addRule();
    component.editingRule!.name = '   ';
    component.saveRule();
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('should do nothing when editingRule is null', () => {
    component.editingRule = null;
    component.saveRule();
    expect(svc.create).not.toHaveBeenCalled();
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('should set saving false on save error', () => {
    svc.create.and.returnValue(throwError(() => new Error('fail')));
    component.addRule();
    component.editingRule!.name = 'Fail';
    component.saveRule();
    expect(component.saving).toBeFalse();
  });

  // -- deleteRule ----------------------------------------------------

  it('should delete rule when confirmed', async () => {
    await component.deleteRule(MOCK_RULE);
    expect(dialog.dangerConfirm).toHaveBeenCalled();
    expect(svc.delete).toHaveBeenCalledWith(1);
  });

  it('should not delete rule when not confirmed', async () => {
    dialog.dangerConfirm.and.returnValue(of(false));
    await component.deleteRule(MOCK_RULE);
    expect(svc.delete).not.toHaveBeenCalled();
  });

  // -- toggleActive --------------------------------------------------

  it('should toggle rule active status', () => {
    component.toggleActive(MOCK_RULE);
    expect(svc.update).toHaveBeenCalledWith(1, jasmine.objectContaining({ isActive: false }));
    expect(MOCK_RULE.isActive).toBeFalse();
  });

  // -- addCondition / removeCondition --------------------------------

  it('should add condition to editing rule', () => {
    component.addRule();
    const before = component.editingRule!.conditions.length;
    component.addCondition();
    expect(component.editingRule!.conditions.length).toBe(before + 1);
  });

  it('should not add condition when no editing rule', () => {
    component.editingRule = null;
    component.addCondition(); // should not throw
  });

  it('should remove condition from editing rule', () => {
    component.addRule();
    component.addCondition();
    const before = component.editingRule!.conditions.length;
    component.removeCondition(0);
    expect(component.editingRule!.conditions.length).toBe(before - 1);
  });

  it('should not remove condition when no editing rule', () => {
    component.editingRule = null;
    component.removeCondition(0); // should not throw
  });

  // -- addAction / removeAction --------------------------------------

  it('should add action to editing rule', () => {
    component.addRule();
    const before = component.editingRule!.actions.length;
    component.addAction();
    expect(component.editingRule!.actions.length).toBe(before + 1);
  });

  it('should not add action when no editing rule', () => {
    component.editingRule = null;
    component.addAction(); // should not throw
  });

  it('should remove action from editing rule', () => {
    component.addRule();
    component.addAction();
    const before = component.editingRule!.actions.length;
    component.removeAction(0);
    expect(component.editingRule!.actions.length).toBe(before - 1);
  });

  it('should not remove action when no editing rule', () => {
    component.editingRule = null;
    component.removeAction(0); // should not throw
  });

  // -- runEvaluation -------------------------------------------------

  it('should run evaluation when confirmed', async () => {
    await component.runEvaluation();
    expect(dialog.confirm).toHaveBeenCalled();
    expect(svc.evaluate).toHaveBeenCalled();
    expect(component.lastEvalResult).toBeTruthy();
    expect(component.evaluating).toBeFalse();
  });

  it('should not run evaluation when not confirmed', async () => {
    dialog.confirm.and.returnValue(of(false));
    await component.runEvaluation();
    expect(svc.evaluate).not.toHaveBeenCalled();
  });

  it('should set evaluating false on evaluation error', async () => {
    svc.evaluate.and.returnValue(throwError(() => new Error('fail')));
    await component.runEvaluation();
    expect(component.evaluating).toBeFalse();
  });

  // -- getActionLabel / getFieldLabel --------------------------------

  it('should return label for known action type', () => {
    expect(component.getActionLabel('auto-escalate')).toBe('Auto-Escalate');
    expect(component.getActionLabel('add-note')).toBe('Add Note');
  });

  it('should return raw type for unknown action type', () => {
    expect(component.getActionLabel('unknown-action')).toBe('unknown-action');
  });

  it('should return label for known field', () => {
    expect(component.getFieldLabel('agingDays')).toBe('Aging (days)');
    expect(component.getFieldLabel('payerName')).toBe('Payer Name');
  });

  it('should return raw field name for unknown field', () => {
    expect(component.getFieldLabel('unknownField')).toBe('unknownField');
  });

  // -- dropdown options ----------------------------------------------

  it('should have condition fields', () => {
    expect(component.conditionFields.length).toBeGreaterThan(0);
  });

  it('should have operators', () => {
    expect(component.operators.length).toBeGreaterThan(0);
  });

  it('should have action types', () => {
    expect(component.actionTypes.length).toBe(2);
  });
});
