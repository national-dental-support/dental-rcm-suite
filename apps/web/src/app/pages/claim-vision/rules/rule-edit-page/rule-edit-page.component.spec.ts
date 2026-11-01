import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { RuleEditPageComponent } from './rule-edit-page.component';
import { ClaimVisionService } from '../../../../core/services/claim-vision.service';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';
import { Rule, RuleDraft } from '../../../../core/models/rules.model';

describe('RuleEditPageComponent', () => {
  let component: RuleEditPageComponent;
  let fixture: ComponentFixture<RuleEditPageComponent>;

  const mockRule: Rule = {
    id: 'rule-42', name: 'Edit Me', category: 'Documentation', description: 'Test rule',
    matchType: 'all', conditions: [], actions: [], status: 'Active', expiresOn: null,
    createdLabel: 'Jan 1, 2025\nAdmin', modifiedLabel: '\u2014', claimsImpacted: 5, kind: 'custom',
    scope: 'enterprise', scopeValues: [],
  };

  const customRules$ = new BehaviorSubject<Rule[]>([mockRule]);
  const systemRules$ = new BehaviorSubject<Rule[]>([]);

  const mockRulesStore = {
    loadAll: jasmine.createSpy('loadAll'),
    customRules$: customRules$.asObservable(),
    systemRules$: systemRules$.asObservable(),
  };

  const mockClaimVisionService = {
    updateRule: jasmine.createSpy('updateRule').and.returnValue(of({})),
  };

  const mockRoute = {
    snapshot: { paramMap: { get: () => 'rule-42' } },
  };

  const mockRouter = { navigate: jasmine.createSpy('navigate') };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RuleEditPageComponent],
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

    fixture = TestBed.createComponent(RuleEditPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call loadAll on init', () => {
    expect(mockRulesStore.loadAll).toHaveBeenCalled();
  });

  it('should resolve rule from customRules$ store', () => {
    expect(component.rule).toEqual(mockRule);
  });

  it('should start with saving = false', () => {
    expect(component.saving).toBeFalse();
  });

  it('onSave should call updateRule and navigate on success', () => {
    const draft: RuleDraft = { ...mockRule, scopeValues: [], scope: 'enterprise' };
    component.onSave(draft);
    expect(mockClaimVisionService.updateRule).toHaveBeenCalledWith('rule-42', draft);
    expect(mockRulesStore.loadAll).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });

  it('onSave should reset saving on error', fakeAsync(() => {
    mockClaimVisionService.updateRule.and.returnValue(throwError(() => new Error('fail')));
    component.onSave({ ...mockRule, scopeValues: [], scope: 'enterprise' });
    tick();
    expect(component.saving).toBeFalse();
  }));

  it('onSave should be no-op when rule is null', () => {
    component.rule = null;
    mockClaimVisionService.updateRule.calls.reset();
    component.onSave({ ...mockRule, scopeValues: [], scope: 'enterprise' });
    expect(mockClaimVisionService.updateRule).not.toHaveBeenCalled();
  });

  it('onCancel should navigate to rules list', () => {
    component.onCancel();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });

  it('goBack should navigate to rules list', () => {
    component.goBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });
});
