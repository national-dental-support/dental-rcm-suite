import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { RuleDetailsPageComponent } from './rule-details-page.component';
import { ClaimVisionService } from '../../../../core/services/claim-vision.service';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';
import { Rule, RuleDraft } from '../../../../core/models/rules.model';

describe('RuleDetailsPageComponent', () => {
  let component: RuleDetailsPageComponent;
  let fixture: ComponentFixture<RuleDetailsPageComponent>;

  const mockRule: Rule = {
    id: 'rule-1', name: 'Age Restriction', category: 'Coding', description: 'D0145 age restriction',
    matchType: 'any', conditions: [], actions: [], status: 'Active', expiresOn: null,
    createdLabel: 'Mar 10, 2025\nSystem', modifiedLabel: '\u2014', claimsImpacted: 12, kind: 'system',
    scope: 'enterprise', scopeValues: [],
  };

  const customRules$ = new BehaviorSubject<Rule[]>([]);
  const systemRules$ = new BehaviorSubject<Rule[]>([mockRule]);

  const mockRulesStore = {
    loadAll: jasmine.createSpy('loadAll'),
    customRules$: customRules$.asObservable(),
    systemRules$: systemRules$.asObservable(),
  };

  const mockClaimVisionService = {
    updateRule: jasmine.createSpy('updateRule').and.returnValue(of({})),
  };

  const mockRoute = {
    paramMap: of({ get: () => 'rule-1' }),
  };

  const mockRouter = { navigate: jasmine.createSpy('navigate') };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RuleDetailsPageComponent],
      providers: [
        { provide: RulesStoreService, useValue: mockRulesStore },
        { provide: ClaimVisionService, useValue: mockClaimVisionService },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    mockClaimVisionService.updateRule.calls.reset();
    mockClaimVisionService.updateRule.and.returnValue(of({}));
    mockRulesStore.loadAll.calls.reset();
    mockRouter.navigate.calls.reset();

    fixture = TestBed.createComponent(RuleDetailsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call loadAll on init', () => {
    expect(mockRulesStore.loadAll).toHaveBeenCalled();
  });

  it('should resolve rule from store', () => {
    expect(component.rule).toEqual(mockRule);
  });

  it('should build history from rule labels', () => {
    expect(component.history.length).toBeGreaterThan(0);
    expect(component.history[0].action).toBe('Rule created');
  });

  it('should set impactedLast12Months from rule', () => {
    expect(component.impactedLast12Months).toBe(12);
  });

  it('scrollToEditor should set editMode to true', () => {
    component.scrollToEditor();
    expect(component.editMode).toBeTrue();
  });

  it('goBack should navigate to rules list', () => {
    component.goBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });

  it('onSave should call updateRule and navigate on success', () => {
    const draft: RuleDraft = { ...mockRule, scopeValues: [], scope: 'enterprise' };
    component.onSave(draft);
    expect(mockClaimVisionService.updateRule).toHaveBeenCalledWith(mockRule.id, draft);
    expect(mockRulesStore.loadAll).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });

  it('onSave should reset saving on error', fakeAsync(() => {
    mockClaimVisionService.updateRule.and.returnValue(throwError(() => new Error('fail')));
    component.onSave({ ...mockRule, scopeValues: [], scope: 'enterprise' });
    tick();
    expect(component.saving).toBeFalse();
  }));

  it('onEditorCancel in editMode should flip back to view mode', () => {
    component.editMode = true;
    component.onEditorCancel();
    expect(component.editMode).toBeFalse();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('onEditorCancel in view mode should navigate back', () => {
    component.editMode = false;
    component.onEditorCancel();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });
});
