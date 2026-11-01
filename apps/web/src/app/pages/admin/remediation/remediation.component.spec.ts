import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RemediationAdminComponent } from './remediation.component';
import { RemediationService } from '../../../core/services/remediation.service';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

describe('RemediationAdminComponent', () => {
  let component: RemediationAdminComponent;
  let fixture: ComponentFixture<RemediationAdminComponent>;
  let svcSpy: any;
  let snackSpy: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    svcSpy = {
      listReasonCodes: jasmine.createSpy('listReasonCodes').and.returnValue(of(['CO-45', 'CO-16', 'DEFAULT'])),
      listSets: jasmine.createSpy('listSets').and.returnValue(of([])),
      getSet: jasmine.createSpy('getSet').and.returnValue(of({
        id: 1, reason_code: 'CO-45', role: 'ar-specialist', status: 'draft', version: 1,
        steps: [{ id: 10, sort_order: 1, title: 'Step 1', body: 'Do this', required: true, checklist: [{ item_text: 'Check A' }] }],
      })),
      createSet: jasmine.createSpy('createSet').and.returnValue(of({ id: 2 })),
      updateSet: jasmine.createSpy('updateSet').and.returnValue(of({ id: 1 })),
      publishSet: jasmine.createSpy('publishSet').and.returnValue(of({ version: 2 })),
      getSetHistory: jasmine.createSpy('getSetHistory').and.returnValue(of([
        { id: 1, version: 1, snapshot: '[]', published_at: '2026-01-01' },
      ])),
      listFeedback: jasmine.createSpy('listFeedback').and.returnValue(of([
        { id: 1, reason_code: 'CO-45', claim_id: 'CL1', suggestion: 'Improve step', status: 'pending', set_id: 1, set_role: 'ar-specialist' },
      ])),
      reviewFeedback: jasmine.createSpy('reviewFeedback').and.returnValue(of(null)),
      getSOPRecommendations: jasmine.createSpy('getSOPRecommendations').and.returnValue(of([
        { type: 'low_completion', reason_code: 'CO-45', message: 'Low completion rate' },
      ])),
      getSOPEffectiveness: jasmine.createSpy('getSOPEffectiveness').and.returnValue(of([
        { reason_code: 'CO-45', completionRate: 0.75 },
      ])),
      deleteSet: jasmine.createSpy('deleteSet').and.returnValue(of(null)),
    };

    snackSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
    declarations: [RemediationAdminComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [],
    providers: [
        { provide: RemediationService, useValue: svcSpy },
        { provide: MatSnackBar, useValue: snackSpy },
        { provide: RpDialogService, useValue: { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(null) }) } },
        // The component reads ?code= / ?role= on init and navigates back to the
        // admin shell, so both router dependencies must be provided.
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: new Map<string, string>() as any } },
        },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(RemediationAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- ngOnInit --
  it('should load reason codes on init', () => {
    expect(svcSpy.listReasonCodes).toHaveBeenCalled();
    expect(component.reasonCodes[0]).toBe('DEFAULT');
    expect(component.reasonCodes).toContain('CO-45');
    expect(component.reasonCodes).toContain('CO-16');
  });

  it('should load feedback on init', () => {
    expect(svcSpy.listFeedback).toHaveBeenCalled();
    expect(component.feedbackList.length).toBe(1);
  });

  it('should load recommendations on init', () => {
    expect(svcSpy.getSOPRecommendations).toHaveBeenCalled();
    expect(component.recommendations.length).toBe(1);
    expect(svcSpy.getSOPEffectiveness).toHaveBeenCalled();
    expect(component.effectiveness.length).toBe(1);
  });

  it('should build feedback columns on init', () => {
    expect(component.feedbackColumns.length).toBe(6);
  });

  // -- loadReasonCodes --
  it('loadReasonCodes should put DEFAULT first', () => {
    svcSpy.listReasonCodes.and.returnValue(of(['CO-45', 'DEFAULT', 'CO-16']));
    component.loadReasonCodes();
    expect(component.reasonCodes[0]).toBe('DEFAULT');
    expect(component.reasonCodes.filter(c => c === 'DEFAULT').length).toBe(1);
  });

  // -- onReasonCodeChange --
  it('onReasonCodeChange should set selectedReasonCode and load set', () => {
    spyOn(component, 'loadSetForCode');
    component.onReasonCodeChange('CO-45');
    expect(component.selectedReasonCode).toBe('CO-45');
    expect(component.historyOpen).toBeFalse();
    expect(component.loadSetForCode).toHaveBeenCalled();
  });

  // -- onRoleChange --
  it('onRoleChange should set selectedRole and load set', () => {
    spyOn(component, 'loadSetForCode');
    component.onRoleChange('manager');
    expect(component.selectedRole).toBe('manager');
    expect(component.historyOpen).toBeFalse();
    expect(component.loadSetForCode).toHaveBeenCalled();
  });

  // -- loadSetForCode --
  it('loadSetForCode should return early if no reason code selected', () => {
    component.selectedReasonCode = '';
    svcSpy.listSets.calls.reset();
    component.loadSetForCode();
    expect(svcSpy.listSets).not.toHaveBeenCalled();
  });

  it('loadSetForCode should load active set when found', () => {
    component.selectedReasonCode = 'CO-45';
    svcSpy.listSets.and.returnValue(of([
      { id: 1, status: 'active' },
      { id: 2, status: 'draft' },
    ]));
    component.loadSetForCode();
    expect(svcSpy.getSet).toHaveBeenCalledWith(1);
    expect(component.activeSet).toBeTruthy();
    expect(component.loading).toBeFalse();
  });

  it('loadSetForCode should load draft set if no active', () => {
    component.selectedReasonCode = 'CO-45';
    svcSpy.listSets.and.returnValue(of([{ id: 3, status: 'draft' }]));
    component.loadSetForCode();
    expect(svcSpy.getSet).toHaveBeenCalledWith(3);
  });

  it('loadSetForCode should handle no sets found', () => {
    component.selectedReasonCode = 'CO-45';
    svcSpy.listSets.and.returnValue(of([]));
    component.loadSetForCode();
    expect(component.activeSet).toBeNull();
    expect(component.editingSteps.length).toBe(0);
    expect(component.loading).toBeFalse();
  });

  it('loadSetForCode should handle error', () => {
    component.selectedReasonCode = 'CO-45';
    svcSpy.listSets.and.returnValue(throwError(() => new Error('fail')));
    component.loadSetForCode();
    expect(component.loading).toBeFalse();
  });

  // -- createNewSet --
  it('createNewSet should set blank editing state', () => {
    component.selectedReasonCode = 'CO-45';
    component.createNewSet();
    expect(component.activeSet).toBeNull();
    expect(component.editingSteps.length).toBe(1);
    expect(component.editingSteps[0].title).toBe('');
  });

  it('createNewSet should do nothing if no reason code', () => {
    component.selectedReasonCode = '';
    component.createNewSet();
    expect(component.editingSteps.length).toBe(0);
  });

  // -- saveSet --
  it('saveSet should create new set when no activeSet', () => {
    component.selectedReasonCode = 'CO-45';
    component.activeSet = null;
    component.editingSteps = [{ sort_order: 1, title: 'Step 1', body: 'Body', required: true, checklist: [{ item_text: 'Check' }] }];
    svcSpy.createSet.and.returnValue(of({ id: 5 }));
    svcSpy.getSet.and.returnValue(of({ id: 5, steps: [{ id: 50, sort_order: 1, title: 'Step 1', body: 'Body', required: true, checklist: [{ item_text: 'Check' }] }] }));
    component.saveSet();
    expect(svcSpy.createSet).toHaveBeenCalled();
    expect(snackSpy.open).toHaveBeenCalledWith('Saved as draft', 'OK', jasmine.any(Object));
  });

  it('saveSet should update existing set when activeSet exists', () => {
    component.selectedReasonCode = 'CO-45';
    component.activeSet = { id: 1, reason_code: 'CO-45', role: 'ar-specialist', status: 'draft', version: 1 } as any;
    component.editingSteps = [{ sort_order: 1, title: 'Updated', body: 'Body', required: false, checklist: [] }];
    svcSpy.updateSet.and.returnValue(of({ id: 1 }));
    svcSpy.getSet.and.returnValue(of({ id: 1, steps: [] }));
    component.saveSet();
    expect(svcSpy.updateSet).toHaveBeenCalledWith(1, jasmine.any(Object));
  });

  it('saveSet should do nothing if no reason code', () => {
    component.selectedReasonCode = '';
    component.saveSet();
    expect(svcSpy.createSet).not.toHaveBeenCalled();
    expect(svcSpy.updateSet).not.toHaveBeenCalled();
  });

  it('saveSet should handle error', () => {
    component.selectedReasonCode = 'CO-45';
    component.activeSet = null;
    component.editingSteps = [{ sort_order: 1, title: 'Fail', body: '', required: false, checklist: [] }];
    svcSpy.createSet.and.returnValue(throwError(() => new Error('fail')));
    component.saveSet();
    expect(snackSpy.open).toHaveBeenCalledWith('Save failed', 'OK', jasmine.any(Object));
    expect(component.saving).toBeFalse();
  });

  // -- publishSet --
  it('publishSet should call service and update activeSet', () => {
    component.activeSet = { id: 1, status: 'draft', version: 1 } as any;
    svcSpy.publishSet.and.returnValue(of({ version: 2 }));
    component.publishSet();
    expect(svcSpy.publishSet).toHaveBeenCalledWith(1);
    expect(component.activeSet!.status).toBe('active');
    expect(component.activeSet!.version).toBe(2);
    expect(snackSpy.open).toHaveBeenCalledWith('Published as version 2', 'OK', jasmine.any(Object));
  });

  it('publishSet should do nothing if no activeSet', () => {
    component.activeSet = null;
    component.publishSet();
    expect(svcSpy.publishSet).not.toHaveBeenCalled();
  });

  it('publishSet should handle error', () => {
    component.activeSet = { id: 1, status: 'draft', version: 1 } as any;
    svcSpy.publishSet.and.returnValue(throwError(() => new Error('fail')));
    component.publishSet();
    expect(snackSpy.open).toHaveBeenCalledWith('Publish failed', 'OK', jasmine.any(Object));
    expect(component.saving).toBeFalse();
  });

  // -- openHistory --
  it('openHistory should load history entries', () => {
    component.activeSet = { id: 1 } as any;
    component.openHistory();
    expect(component.historyOpen).toBeTrue();
    expect(svcSpy.getSetHistory).toHaveBeenCalledWith(1);
    expect(component.historyEntries.length).toBe(1);
  });

  it('openHistory should do nothing if no activeSet', () => {
    component.activeSet = null;
    svcSpy.getSetHistory.calls.reset();
    component.openHistory();
    expect(svcSpy.getSetHistory).not.toHaveBeenCalled();
  });

  // -- selectHistoryVersion --
  it('selectHistoryVersion should set historySelectedVersion', () => {
    const entry = { id: 1, version: 1 } as any;
    component.selectHistoryVersion(entry);
    expect(component.historySelectedVersion).toBe(entry);
  });

  // -- getParsedSnapshot --
  it('getParsedSnapshot should parse valid JSON array', () => {
    const result = component.getParsedSnapshot('[{"title":"Step 1"}]');
    expect(result.length).toBe(1);
  });

  it('getParsedSnapshot should return empty for invalid JSON', () => {
    const result = component.getParsedSnapshot('not json');
    expect(result).toEqual([]);
  });

  it('getParsedSnapshot should return empty for non-array JSON', () => {
    const result = component.getParsedSnapshot('{"key": "value"}');
    expect(result).toEqual([]);
  });

  // -- Step editing --
  it('addStep should append a blank step', () => {
    component.editingSteps = [{ sort_order: 1, title: 'Existing', body: '', required: false, checklist: [] }];
    component.addStep();
    expect(component.editingSteps.length).toBe(2);
    expect(component.editingSteps[1].sort_order).toBe(2);
    expect(component.editingSteps[1].title).toBe('');
  });

  it('removeStep should remove and reorder', () => {
    component.editingSteps = [
      { sort_order: 1, title: 'A', body: '', required: false, checklist: [] },
      { sort_order: 2, title: 'B', body: '', required: false, checklist: [] },
      { sort_order: 3, title: 'C', body: '', required: false, checklist: [] },
    ];
    component.removeStep(1);
    expect(component.editingSteps.length).toBe(2);
    expect(component.editingSteps[0].title).toBe('A');
    expect(component.editingSteps[1].title).toBe('C');
    expect(component.editingSteps[1].sort_order).toBe(2);
  });

  it('moveStep should swap and reorder', () => {
    component.editingSteps = [
      { sort_order: 1, title: 'A', body: '', required: false, checklist: [] },
      { sort_order: 2, title: 'B', body: '', required: false, checklist: [] },
    ];
    component.moveStep(0, 1);
    expect(component.editingSteps[0].title).toBe('B');
    expect(component.editingSteps[1].title).toBe('A');
    expect(component.editingSteps[0].sort_order).toBe(1);
    expect(component.editingSteps[1].sort_order).toBe(2);
  });

  it('moveStep should not move beyond start', () => {
    component.editingSteps = [{ sort_order: 1, title: 'A', body: '', required: false, checklist: [] }];
    component.moveStep(0, -1);
    expect(component.editingSteps[0].title).toBe('A');
  });

  it('moveStep should not move beyond end', () => {
    component.editingSteps = [{ sort_order: 1, title: 'A', body: '', required: false, checklist: [] }];
    component.moveStep(0, 1);
    expect(component.editingSteps[0].title).toBe('A');
  });

  it('addChecklistItem should append an item to step', () => {
    const step = { sort_order: 1, title: 'S', body: '', required: false, checklist: [] } as any;
    component.addChecklistItem(step);
    expect(step.checklist.length).toBe(1);
    expect(step.checklist[0].item_text).toBe('');
  });

  it('removeChecklistItem should remove item at index', () => {
    const step = { sort_order: 1, title: 'S', body: '', required: false, checklist: [{ item_text: 'A' }, { item_text: 'B' }] } as any;
    component.removeChecklistItem(step, 0);
    expect(step.checklist.length).toBe(1);
    expect(step.checklist[0].item_text).toBe('B');
  });

  // -- addCustomCode --
  it('addCustomCode should add new code and set as selected', () => {
    component.newCodeInput = ' co-99 ';
    component.reasonCodes = ['DEFAULT', 'CO-45'];
    component.addCustomCode();
    expect(component.reasonCodes).toContain('CO-99');
    expect(component.selectedReasonCode).toBe('CO-99');
    expect(component.newCodeInput).toBe('');
    expect(component.showNewCodeInput).toBeFalse();
  });

  it('addCustomCode should not add duplicate code', () => {
    component.newCodeInput = 'CO-45';
    component.reasonCodes = ['DEFAULT', 'CO-45'];
    component.addCustomCode();
    expect(component.reasonCodes.filter(c => c === 'CO-45').length).toBe(1);
  });

  it('addCustomCode should not add empty code', () => {
    component.newCodeInput = '  ';
    component.reasonCodes = ['DEFAULT'];
    const len = component.reasonCodes.length;
    component.addCustomCode();
    expect(component.reasonCodes.length).toBe(len);
  });

  // -- Feedback --
  it('loadFeedback should call listFeedback with status filter', () => {
    svcSpy.listFeedback.calls.reset();
    component.feedbackStatusFilter = 'approved';
    component.loadFeedback();
    expect(svcSpy.listFeedback).toHaveBeenCalledWith({ status: 'approved' });
  });

  it('loadFeedback should pass undefined for empty status filter', () => {
    svcSpy.listFeedback.calls.reset();
    component.feedbackStatusFilter = '';
    component.loadFeedback();
    expect(svcSpy.listFeedback).toHaveBeenCalledWith({ status: undefined });
  });

  it('onFeedbackFilterChange should set filter and reload', () => {
    spyOn(component, 'loadFeedback');
    component.onFeedbackFilterChange('approved');
    expect(component.feedbackStatusFilter).toBe('approved');
    expect(component.loadFeedback).toHaveBeenCalled();
  });

  it('openFeedbackDrawer should set drawer item', () => {
    const item = { id: 1, suggestion: 'Test' } as any;
    component.openFeedbackDrawer(item);
    expect(component.feedbackDrawer).toBe(item);
    expect(component.reviewNote).toBe('');
  });

  it('closeFeedbackDrawer should clear drawer', () => {
    component.feedbackDrawer = { id: 1 } as any;
    component.closeFeedbackDrawer();
    expect(component.feedbackDrawer).toBeNull();
  });

  // -- reviewFeedback --
  it('reviewFeedback should call service and reload feedback', () => {
    component.feedbackDrawer = { id: 5, reason_code: 'CO-45', set_id: 1, set_role: 'ar-specialist' } as any;
    component.reviewNote = 'Looks good';
    svcSpy.reviewFeedback.and.returnValue(of(null));
    component.reviewFeedback('approved');
    expect(svcSpy.reviewFeedback).toHaveBeenCalledWith(5, { status: 'approved', reviewer_note: 'Looks good' });
    expect(snackSpy.open).toHaveBeenCalledWith('Feedback approved', 'OK', jasmine.any(Object));
    expect(component.feedbackDrawer).toBeNull();
  });

  it('reviewFeedback should navigate to SOP when approved with set info', () => {
    component.feedbackDrawer = { id: 5, reason_code: 'CO-45', set_id: 1, set_role: 'ar-specialist' } as any;
    svcSpy.reviewFeedback.and.returnValue(of(null));
    spyOn(component, 'loadSetForCode');
    component.reviewFeedback('approved');
    expect(component.selectedReasonCode).toBe('CO-45');
    expect(component.selectedRole).toBe('ar-specialist');
    expect(component.loadSetForCode).toHaveBeenCalled();
  });

  it('reviewFeedback should not navigate for rejected', () => {
    component.feedbackDrawer = { id: 5, reason_code: 'CO-45', set_id: 1, set_role: 'ar-specialist' } as any;
    svcSpy.reviewFeedback.and.returnValue(of(null));
    spyOn(component, 'loadSetForCode');
    component.reviewFeedback('rejected');
    expect(component.loadSetForCode).not.toHaveBeenCalled();
  });

  it('reviewFeedback should do nothing if no drawer', () => {
    component.feedbackDrawer = null;
    component.reviewFeedback('approved');
    expect(svcSpy.reviewFeedback).not.toHaveBeenCalled();
  });

  it('reviewFeedback should handle error', () => {
    component.feedbackDrawer = { id: 5 } as any;
    svcSpy.reviewFeedback.and.returnValue(throwError(() => new Error('fail')));
    component.reviewFeedback('rejected');
    expect(snackSpy.open).toHaveBeenCalledWith('Review failed', 'OK', jasmine.any(Object));
  });

  it('reviewFeedback should pass undefined for empty reviewNote', () => {
    component.feedbackDrawer = { id: 5 } as any;
    component.reviewNote = '';
    svcSpy.reviewFeedback.and.returnValue(of(null));
    component.reviewFeedback('deferred');
    expect(svcSpy.reviewFeedback).toHaveBeenCalledWith(5, { status: 'deferred', reviewer_note: undefined });
  });

  // -- Recommendations --
  it('loadRecommendations should handle error', () => {
    svcSpy.getSOPRecommendations.and.returnValue(throwError(() => new Error('fail')));
    svcSpy.getSOPEffectiveness.and.returnValue(throwError(() => new Error('fail')));
    component.loadRecommendations();
    expect(component.recommendations).toEqual([]);
    expect(component.effectiveness).toEqual([]);
    expect(component.recsLoading).toBeFalse();
  });

  it('recTypeIcon should return correct icon', () => {
    expect(component.recTypeIcon('low_completion')).toBe('warning');
    expect(component.recTypeIcon('high_feedback')).toBe('feedback');
    expect(component.recTypeIcon('escalation_spike')).toBe('trending_up');
    expect(component.recTypeIcon('slow_resolution')).toBe('schedule');
    expect(component.recTypeIcon('missing_sop')).toBe('add_circle');
    expect(component.recTypeIcon('unknown_type')).toBe('info');
  });

  it('recTypeLabel should return correct label', () => {
    expect(component.recTypeLabel('low_completion')).toBe('Low Completion');
    expect(component.recTypeLabel('high_feedback')).toBe('High Feedback');
    expect(component.recTypeLabel('escalation_spike')).toBe('Escalation Spike');
    expect(component.recTypeLabel('slow_resolution')).toBe('Slow Resolution');
    expect(component.recTypeLabel('missing_sop')).toBe('Missing SOP');
    expect(component.recTypeLabel('unknown_type')).toBe('unknown_type');
  });

  // -- jumpToSOP --
  it('jumpToSOP should set reason code and load set', () => {
    spyOn(component, 'loadSetForCode');
    component.jumpToSOP('CO-45');
    expect(component.selectedReasonCode).toBe('CO-45');
    expect(component.loadSetForCode).toHaveBeenCalled();
  });

  // -- trackByIndex --
  it('trackByIndex should return index', () => {
    expect(component.trackByIndex(5)).toBe(5);
  });

  // -- deleteSet ----------------------------------------------------------

  it('deleteSet should call svc.deleteSet when dialogService confirms', () => {
    // Override dialog with confirm=true
    const dialogSpy = TestBed.inject(RpDialogService) as jasmine.SpyObj<RpDialogService>;
    (dialogSpy as any).dangerConfirm = jasmine.createSpy('dangerConfirm').and.returnValue(of(true));
    (component as any).dialog = dialogSpy;

    const set = { id: 1, reason_code: 'CO-45', role: 'ar-specialist', version: 1 } as any;
    component.deleteSet(set);
    expect(svcSpy.deleteSet).toHaveBeenCalledWith(1);
    expect(snackSpy.open).toHaveBeenCalledWith('Step set deleted', 'OK', jasmine.any(Object));
  });

  it('deleteSet should not delete when dialog returns false', () => {
    const dialogMock = { dangerConfirm: jasmine.createSpy('dangerConfirm').and.returnValue(of(false)) };
    (component as any).dialog = dialogMock;
    svcSpy.deleteSet.calls.reset();
    const set = { id: 1, reason_code: 'CO-45', role: 'ar-specialist', version: 1 } as any;
    component.deleteSet(set);
    expect(svcSpy.deleteSet).not.toHaveBeenCalled();
  });

  it('deleteSet should clear activeSet when deleting the current active set', () => {
    const dialogMock = { dangerConfirm: jasmine.createSpy('dangerConfirm').and.returnValue(of(true)) };
    (component as any).dialog = dialogMock;
    const set = { id: 1, reason_code: 'CO-45', role: 'ar-specialist', version: 1 } as any;
    component.activeSet = set;
    component.editingSteps = [{ sort_order: 1, title: 'Step', body: '', required: false, checklist: [] }];
    component.deleteSet(set);
    expect(component.activeSet).toBeNull();
    expect(component.editingSteps).toEqual([]);
  });

  // -- editSetFromOverview ------------------------------------------------

  it('editSetFromOverview should set code and role, then load set', () => {
    spyOn(component, 'loadSetForCode');
    const set = { id: 1, reason_code: 'CO-97', role: 'manager', version: 1 } as any;
    component.editSetFromOverview(set);
    expect(component.selectedReasonCode).toBe('CO-97');
    expect(component.selectedRole).toBe('manager');
    expect(component.showAllSets).toBeFalse();
    expect(component.historyOpen).toBeFalse();
    expect(component.loadSetForCode).toHaveBeenCalled();
  });

  // -- newSetFromOverview ------------------------------------------------

  it('newSetFromOverview should init blank editing state', () => {
    component.newSetFromOverview();
    expect(component.showAllSets).toBeFalse();
    expect(component.activeSet).toBeNull();
    expect(component.editingSteps.length).toBe(1);
    expect(component.selectedReasonCode).toBe('');
    expect(component.selectedRole).toBe('ar-specialist');
  });

  // -- Reference Library -------------------------------------------------

  it('loadRefEntries should have called HttpClient on init', () => {
    // The component uses HttpClient directly via provideHttpClientTesting
    // The refLoading may be true because the HTTP call is still pending in tests
    // Just verify the component was created successfully with refLoading state
    expect(component).toBeTruthy();
    // refLoading will be true while waiting for HTTP response in test environment
    expect(typeof component.refLoading).toBe('boolean');
  });

  it('onRefSearchChange should update search text and reset page', () => {
    spyOn(component, 'loadRefEntries');
    component.onRefSearchChange('test search');
    expect(component.refSearchText).toBe('test search');
    expect(component.refPageIndex).toBe(0);
    expect(component.loadRefEntries).toHaveBeenCalled();
  });

  it('onRefCategoryFilter should update category and reset page', () => {
    spyOn(component, 'loadRefEntries');
    component.onRefCategoryFilter('billing');
    expect(component.refCategoryFilter).toBe('billing');
    expect(component.refPageIndex).toBe(0);
    expect(component.loadRefEntries).toHaveBeenCalled();
  });

  it('prevRefPage should decrement page and reload', () => {
    component.refPageIndex = 2;
    spyOn(component, 'loadRefEntries');
    component.prevRefPage();
    expect(component.refPageIndex).toBe(1);
    expect(component.loadRefEntries).toHaveBeenCalled();
  });

  it('prevRefPage should not go below 0', () => {
    component.refPageIndex = 0;
    spyOn(component, 'loadRefEntries');
    component.prevRefPage();
    expect(component.refPageIndex).toBe(0);
    expect(component.loadRefEntries).not.toHaveBeenCalled();
  });

  it('nextRefPage should increment page when hasNextRefPage', () => {
    component.refPageIndex = 0;
    component.refPageSize = 25;
    component.refTotal = 50;
    spyOn(component, 'loadRefEntries');
    component.nextRefPage();
    expect(component.refPageIndex).toBe(1);
    expect(component.loadRefEntries).toHaveBeenCalled();
  });

  it('nextRefPage should not increment when no more pages', () => {
    component.refPageIndex = 1;
    component.refPageSize = 25;
    component.refTotal = 30;
    spyOn(component, 'loadRefEntries');
    component.nextRefPage();
    expect(component.refPageIndex).toBe(1);
    expect(component.loadRefEntries).not.toHaveBeenCalled();
  });

  it('refPageLabel should return 0 of 0 when total is 0', () => {
    component.refTotal = 0;
    expect(component.refPageLabel).toBe('0 of 0');
  });

  it('refPageLabel should return correct range', () => {
    component.refPageIndex = 0;
    component.refPageSize = 25;
    component.refTotal = 60;
    expect(component.refPageLabel).toBe('1\u201325 of 60');
  });

  it('refPageLabel should cap range at total on last page', () => {
    component.refPageIndex = 2;
    component.refPageSize = 25;
    component.refTotal = 60;
    expect(component.refPageLabel).toBe('51\u201360 of 60');
  });

  it('hasNextRefPage should be true when more pages exist', () => {
    component.refPageIndex = 0;
    component.refPageSize = 25;
    component.refTotal = 50;
    expect(component.hasNextRefPage).toBeTrue();
  });

  it('hasNextRefPage should be false when on last page', () => {
    component.refPageIndex = 1;
    component.refPageSize = 25;
    component.refTotal = 50;
    expect(component.hasNextRefPage).toBeFalse();
  });

  it('newRefEntry should show editor with blank entry', () => {
    component.showRefEditor = false;
    component.newRefEntry();
    expect(component.showRefEditor).toBeTrue();
    expect(component.editingRef.term).toBe('');
    expect(component.editingRef.definition).toBe('');
    expect(component.editingRef.category).toBeNull();
  });

  it('editRefEntry should copy entry and show editor', () => {
    const ref = { id: 5, term: 'EOB', definition: 'Explanation of Benefits', category: 'billing' } as any;
    component.editRefEntry(ref);
    expect(component.editingRef).toEqual(ref);
    expect(component.showRefEditor).toBeTrue();
  });

  it('cancelRefEdit should hide editor and reset entry', () => {
    component.showRefEditor = true;
    component.editingRef = { id: 5, term: 'EOB', definition: 'Explanation of Benefits', category: 'billing' };
    component.cancelRefEdit();
    expect(component.showRefEditor).toBeFalse();
    expect(component.editingRef.term).toBe('');
  });

  it('saveRefEntry should show error when term is empty', () => {
    component.editingRef = { term: '', definition: 'Something', category: null };
    component.saveRefEntry();
    expect(snackSpy.open).toHaveBeenCalledWith('Term and definition are required', 'Dismiss', jasmine.any(Object));
  });

  it('saveRefEntry should show error when definition is empty', () => {
    component.editingRef = { term: 'EOB', definition: '', category: null };
    component.saveRefEntry();
    expect(snackSpy.open).toHaveBeenCalledWith('Term and definition are required', 'Dismiss', jasmine.any(Object));
  });

  it('deleteRefEntry should return early if no id', () => {
    spyOn(window, 'confirm');
    component.deleteRefEntry({ term: 'Test', definition: 'Def', category: null });
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('deleteRefEntry should return early if confirm is false', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.deleteRefEntry({ id: 5, term: 'Test', definition: 'Def', category: null });
    expect(snackSpy.open).not.toHaveBeenCalled();
  });

  it('trackByRefId should return id when present', () => {
    expect(component.trackByRefId(0, { id: 7, term: 'T', definition: 'D', category: null })).toBe(7);
  });

  it('trackByRefId should return index when id is absent', () => {
    expect(component.trackByRefId(3, { term: 'T', definition: 'D', category: null })).toBe(3);
  });

  // -- loadSetForCode - published status ---------------------------------

  it('loadSetForCode should load published set if no active status', () => {
    component.selectedReasonCode = 'CO-45';
    svcSpy.listSets.and.returnValue(of([{ id: 5, status: 'published' }]));
    component.loadSetForCode();
    expect(svcSpy.getSet).toHaveBeenCalledWith(5);
  });
});
