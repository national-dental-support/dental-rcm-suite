import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RuleCreatePageComponent } from './rule-create-page.component';
import { ClaimVisionService } from '../../../../core/services/claim-vision.service';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';
import { RuleDraft } from '../../../../core/models/rules.model';

describe('RuleCreatePageComponent', () => {
  let component: RuleCreatePageComponent;
  let fixture: ComponentFixture<RuleCreatePageComponent>;

  const mockDraft: RuleDraft = {
    kind: 'custom', name: 'Test Rule', description: 'desc', category: 'Coding',
    matchType: 'any', conditions: [{ field: 'claimStatus', operator: 'Equals', value: 'denied' }],
    actions: [{ actionType: 'Hard stop', message: 'Fix it' }],
    status: 'Active', expiresOn: null, scope: 'enterprise', scopeValues: [],
  };

  const mockClaimVisionService = {
    createRule: jasmine.createSpy('createRule').and.returnValue(of({})),
  };

  const mockRulesStore = {
    loadAll: jasmine.createSpy('loadAll'),
  };

  const mockRouter = { navigate: jasmine.createSpy('navigate') };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RuleCreatePageComponent],
      providers: [
        { provide: ClaimVisionService, useValue: mockClaimVisionService },
        { provide: RulesStoreService, useValue: mockRulesStore },
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    mockClaimVisionService.createRule.calls.reset();
    mockClaimVisionService.createRule.and.returnValue(of({}));
    mockRulesStore.loadAll.calls.reset();
    mockRouter.navigate.calls.reset();

    fixture = TestBed.createComponent(RuleCreatePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with saving = false', () => {
    expect(component.saving).toBeFalse();
  });

  it('onSave should call createRule and navigate on success', () => {
    component.onSave(mockDraft);
    expect(mockClaimVisionService.createRule).toHaveBeenCalledWith(mockDraft);
    expect(mockRulesStore.loadAll).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });

  it('onSave should reset saving flag on error', () => {
    mockClaimVisionService.createRule.and.returnValue(throwError(() => new Error('fail')));
    component.onSave(mockDraft);
    expect(component.saving).toBeFalse();
  });

  it('onSave should be a no-op when already saving', () => {
    component.saving = true;
    mockClaimVisionService.createRule.calls.reset();
    component.onSave(mockDraft);
    expect(mockClaimVisionService.createRule).not.toHaveBeenCalled();
  });

  it('onCancel should navigate back', () => {
    component.onCancel();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });

  it('goBack should navigate to rules list', () => {
    component.goBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });
});
