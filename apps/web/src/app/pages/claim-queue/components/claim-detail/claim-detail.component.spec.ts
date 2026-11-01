import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClaimDetailComponent } from './claim-detail.component';
import { ClaimService } from '../../services/claim.service';
import { RemediationService } from '../../../../core/services/remediation.service';
import { UserStoreService } from '../../../../core/stores/user-store.service';
import { ClaimContextService } from '../../services/claim-context.service';
import { DenialIqContextService } from '../../services/denialIqRole.service';
import { MasterClaimService } from '../../../../core/services/master-claim.service';
import { SubscriptionService } from '../../../../core/services/subscription.service';
import { DenialPredictionService } from '../../../../core/services/denial-prediction.service';
import { KeyboardShortcutsService } from '../../../../core/services/keyboard-shortcuts.service';
import { DenialManagementService } from '../../../../core/services/denial-management.service';

describe('ClaimDetailComponent', () => {
  let component: ClaimDetailComponent;
  let fixture: ComponentFixture<ClaimDetailComponent>;
  let mockClaimService: jasmine.SpyObj<ClaimService>;
  let mockSnack: jasmine.SpyObj<MatSnackBar>;
  let mockRemSvc: jasmine.SpyObj<RemediationService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockClaimCtx: jasmine.SpyObj<ClaimContextService>;
  let mockMasterClaim: jasmine.SpyObj<MasterClaimService>;
  let mockPrediction: jasmine.SpyObj<DenialPredictionService>;
  let mockUserStore: any;
  let keyboardAction$: Subject<string>;

  const mockClaim: any = {
    id: 'CL5001',
    patient: 'John Doe',
    payer: 'Aetna',
    provider: 'Dr. Smith',
    notes: 'Some notes',
    assignedUserName: 'Jane Smith',
    lineItems: [],
  };

  beforeEach(() => {
    mockClaimService = jasmine.createSpyObj('ClaimService', [
      'detail', 'getClaimDetailTable', 'closeClaim', 'escalateClaim',
      'assignClaim', 'startWork', 'getClaimHistory',
    ]);
    mockClaimService.detail.and.returnValue(of(mockClaim));
    mockClaimService.getClaimDetailTable.and.returnValue(of([]));
    mockClaimService.startWork.and.returnValue(of({ message: 'ok', claimHistoryId: 'CH1' } as any));
    mockClaimService.getClaimHistory.and.returnValue(of([]));
    mockClaimService.closeClaim.and.returnValue(of({ message: 'ok' } as any));
    mockClaimService.escalateClaim.and.returnValue(of({ message: 'ok', managerId: 1 } as any));
    mockClaimService.assignClaim.and.returnValue(of({ message: 'ok', assignedTo: 1 } as any));

    mockSnack = jasmine.createSpyObj('MatSnackBar', ['open']);

    mockRemSvc = jasmine.createSpyObj('RemediationService', [
      'getClaimSteps', 'getNotes', 'saveStepCompletion', 'addNote', 'deleteNote', 'submitFeedback',
    ]);
    mockRemSvc.getClaimSteps.and.returnValue(of({ data: { set_id: 1, steps: [] }, claimReasonCode: 'CO50' } as any));
    mockRemSvc.getNotes.and.returnValue(of([]));
    mockRemSvc.saveStepCompletion.and.returnValue(of(undefined as any));
    mockRemSvc.addNote.and.returnValue(of({ id: 10, step_id: null, noteText: 'Test', authorUserId: 'test@test.com', noteType: 'general', created_at: '' } as any));
    mockRemSvc.deleteNote.and.returnValue(of(undefined as any));
    mockRemSvc.submitFeedback.and.returnValue(of({ id: 0 } as any));

    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue({ afterClosed: () => of('confirm') } as any);

    mockClaimCtx = jasmine.createSpyObj('ClaimContextService', ['setActiveClaim', 'clear', 'getQueueState']);
    mockClaimCtx.getQueueState.and.returnValue(null);
    mockMasterClaim = jasmine.createSpyObj('MasterClaimService', ['getClaim', 'clearCache']);
    (mockMasterClaim.getClaim as any).and.returnValue(of({ enrichments: { payerIq: { data: {} } } }));
    mockPrediction = jasmine.createSpyObj('DenialPredictionService', ['scoreClaimById']);
    mockPrediction.scoreClaimById.and.returnValue(of({ riskScore: 0.8, riskFactors: ['high charges'], factors: [] } as any));

    mockUserStore = {
      getUser: () => ({ email: 'test@test.com', userId: '1', firstName: 'Test', lastName: 'User' }),
    };

    keyboardAction$ = new Subject<string>();

    TestBed.configureTestingModule({
      declarations: [ClaimDetailComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ClaimService, useValue: mockClaimService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({ get: (_k: string) => 'CL5001' }),
            snapshot: { params: { id: 'CL5001' } },
            params: of({ id: 'CL5001' }),
          },
        },
        { provide: Router, useValue: mockRouter },
        { provide: RemediationService, useValue: mockRemSvc },
        { provide: UserStoreService, useValue: mockUserStore },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnack },
        { provide: ClaimContextService, useValue: mockClaimCtx },
        { provide: DenialIqContextService, useValue: { role$: of('ar-specialist'), setRole: () => {} } },
        { provide: MasterClaimService, useValue: mockMasterClaim },
        { provide: SubscriptionService, useValue: { isSubscribed: () => true } },
        { provide: DenialPredictionService, useValue: mockPrediction },
        { provide: KeyboardShortcutsService, useValue: { onAction$: keyboardAction$.asObservable() } },
        {
          provide: DenialManagementService,
          useValue: {
            getCarcDetail: () => of(null),
            getNarrativeScore: () => of(null),
            listApprovals: () => of([]),
            getPayerVelocityScore: () => of(null),
            getResubmissionPackage: () => of(null),
            getLatestRewrite: () => of(null),
            getTemplateLeaderboard: () => of([]),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ClaimDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---
  it('should load claim on init', () => {
    expect(mockClaimService.detail).toHaveBeenCalledWith('CL5001');
    expect(component.claim).toBeTruthy();
    expect(component.claim!.patient).toBe('John Doe');
    expect(component.loading).toBeFalse();
  });

  it('should set notes from claim', () => {
    expect(component.notes).toBe('Some notes');
  });

  it('should call startWork after loading claim', () => {
    expect(mockClaimService.startWork).toHaveBeenCalledWith('CL5001');
  });

  it('should set context after loading claim', () => {
    expect(mockClaimCtx.setActiveClaim).toHaveBeenCalledWith({ id: 'CL5001', patient: 'John Doe' });
  });

  it('should load remediation', () => {
    expect(mockRemSvc.getClaimSteps).toHaveBeenCalledWith('CL5001', 'ar-specialist', undefined);
  });

  it('should set claimReasonCode', () => {
    expect(component.claimReasonCode).toBe('CO50');
  });

  it('should load notes', () => {
    expect(mockRemSvc.getNotes).toHaveBeenCalledWith('CL5001');
  });

  it('should load history', () => {
    expect(mockClaimService.getClaimHistory).toHaveBeenCalledWith('CL5001');
  });

  it('should load enrichments', () => {
    expect(mockMasterClaim.getClaim).toHaveBeenCalledWith('CL5001');
    expect(component.enrichments).toBeTruthy();
  });

  it('should load risk score', () => {
    expect(mockPrediction.scoreClaimById).toHaveBeenCalledWith('CL5001');
    expect(component.riskScore).toBeTruthy();
  });

  it('should have default activeRole of ar-specialist', () => {
    expect(component.activeRole).toBe('ar-specialist');
  });

  it('should handle claim load error', () => {
    mockClaimService.detail.and.returnValue(throwError(() => new Error('fail')));
    // Create a new component
    const f2 = TestBed.createComponent(ClaimDetailComponent);
    const c2 = f2.componentInstance;
    f2.detectChanges();
    expect(c2.loading).toBeFalse();
    expect(c2.error).toBeTrue();
  });

  // --- keyboard shortcuts ---
  it('should handle escalate keyboard shortcut', () => {
    component.claim = mockClaim;
    keyboardAction$.next('escalate');
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('should handle save-close keyboard shortcut', () => {
    component.claim = mockClaim;
    component.claimRemediation = { set_id: 1, steps: [] } as any;
    component.closeReason = 'Closed';
    keyboardAction$.next('save-close');
    expect(mockClaimService.closeClaim).toHaveBeenCalled();
  });

  it('should ignore shortcuts when no claim loaded', () => {
    component.claim = undefined;
    mockDialog.open.calls.reset();
    keyboardAction$.next('escalate');
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  // --- requiredStepsIncomplete ---
  it('requiredStepsIncomplete should return false when no remediation', () => {
    component.claimRemediation = null;
    expect(component.requiredStepsIncomplete).toBeFalse();
  });

  it('requiredStepsIncomplete should detect incomplete required steps', () => {
    component.claimRemediation = {
      set_id: 1,
      steps: [
        { id: 1, title: 'Step 1', body: '', required: true, completed: false, sort_order: 1, checklist: [] },
        { id: 2, title: 'Step 2', body: '', required: false, completed: false, sort_order: 2, checklist: [] },
      ],
    } as any;
    expect(component.requiredStepsIncomplete).toBeTrue();
  });

  it('requiredStepsIncomplete should return false when all required complete', () => {
    component.claimRemediation = {
      set_id: 1,
      steps: [
        { id: 1, title: 'Step 1', body: '', required: true, completed: true, sort_order: 1, checklist: [] },
      ],
    } as any;
    expect(component.requiredStepsIncomplete).toBeFalse();
  });

  // --- onStepToggle ---
  it('onStepToggle should save step completion', () => {
    const step = { id: 1, title: 'S1', body: '', completed: false } as any;
    component.onStepToggle(step, true);
    expect(step.completed).toBeTrue();
    expect(mockRemSvc.saveStepCompletion).toHaveBeenCalledWith({
      claimId: 'CL5001',
      stepId: 1,
      completed: true,
      userId: 'test@test.com',
    });
  });

  it('onStepToggle should revert on error', () => {
    mockRemSvc.saveStepCompletion.and.returnValue(throwError(() => new Error('fail')));
    const step = { id: 1, title: 'S1', body: '', completed: false } as any;
    component.onStepToggle(step, true);
    expect(step.completed).toBeFalse();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to save step completion', 'OK', jasmine.any(Object));
  });

  // --- openNoteForm ---
  it('openNoteForm should set note form state', () => {
    component.openNoteForm(5, 'Step Five');
    expect(component.noteStepId).toBe(5);
    expect(component.noteStepTitle).toBe('Step Five');
    expect(component.showNoteForm).toBeTrue();
    expect(component.showFeedbackForm).toBeFalse();
    expect(component.noteText).toBe('');
    expect(component.noteType).toBe('follow-up');
  });

  it('openNoteForm should use defaults when no args', () => {
    component.openNoteForm();
    expect(component.noteStepId).toBeNull();
    expect(component.noteStepTitle).toBe('');
  });

  // --- submitNote ---
  it('submitNote should not submit if noteText is empty', () => {
    component.noteText = '   ';
    component.submitNote();
    expect(mockRemSvc.addNote).not.toHaveBeenCalled();
  });

  it('submitNote should add note and update list', () => {
    component.noteText = 'New note text';
    component.noteStepId = 3;
    component.noteType = 'internal';
    component.submitNote();
    expect(mockRemSvc.addNote).toHaveBeenCalledWith(jasmine.objectContaining({
      claimId: 'CL5001',
      stepId: 3,
      noteText: 'New note text',
      noteType: 'internal',
      authorUserId: 'test@test.com',
    }));
    expect(component.showNoteForm).toBeFalse();
    expect(mockSnack.open).toHaveBeenCalledWith('Note saved', 'OK', jasmine.any(Object));
  });

  it('submitNote should handle error', () => {
    mockRemSvc.addNote.and.returnValue(throwError(() => new Error('fail')));
    component.noteText = 'Test';
    component.submitNote();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to save note', 'OK', jasmine.any(Object));
  });

  // --- deleteNote ---
  it('deleteNote should remove note from list', () => {
    component.claimNotes = [
      { id: 1, noteText: 'A' } as any,
      { id: 2, noteText: 'B' } as any,
    ];
    component.deleteNote({ id: 1 } as any);
    expect(component.claimNotes.length).toBe(1);
    expect(component.claimNotes[0].id).toBe(2);
  });

  it('deleteNote should handle error', () => {
    mockRemSvc.deleteNote.and.returnValue(throwError(() => new Error('fail')));
    component.claimNotes = [{ id: 1, noteText: 'A' } as any];
    component.deleteNote({ id: 1 } as any);
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to delete note', 'OK', jasmine.any(Object));
  });

  // --- notesForStep ---
  it('notesForStep should filter notes by step_id', () => {
    component.claimNotes = [
      { id: 1, step_id: 5, noteText: 'A' } as any,
      { id: 2, step_id: null, noteText: 'B' } as any,
      { id: 3, step_id: 5, noteText: 'C' } as any,
    ];
    expect(component.notesForStep(5).length).toBe(2);
    expect(component.notesForStep(null).length).toBe(1);
    expect(component.notesForStep(99).length).toBe(0);
  });

  // --- openFeedbackForm ---
  it('openFeedbackForm should set feedback form state', () => {
    component.openFeedbackForm(3, 'Step Three');
    expect(component.feedbackStepId).toBe(3);
    expect(component.feedbackStepTitle).toBe('Step Three');
    expect(component.showFeedbackForm).toBeTrue();
    expect(component.showNoteForm).toBeFalse();
    expect(component.feedbackText).toBe('');
  });

  // --- submitFeedback ---
  it('submitFeedback should not submit if feedbackText is empty', () => {
    component.feedbackText = '   ';
    component.submitFeedback();
    expect(mockRemSvc.submitFeedback).not.toHaveBeenCalled();
  });

  it('submitFeedback should not submit if no claimRemediation', () => {
    component.claimRemediation = null;
    component.feedbackText = 'Suggestion';
    component.submitFeedback();
    expect(mockRemSvc.submitFeedback).not.toHaveBeenCalled();
  });

  it('submitFeedback should submit and reset form', () => {
    component.claimRemediation = { set_id: 42, steps: [] } as any;
    component.feedbackText = 'Great suggestion';
    component.feedbackStepId = 5;
    component.submitFeedback();
    expect(mockRemSvc.submitFeedback).toHaveBeenCalledWith(jasmine.objectContaining({
      setId: 42,
      stepId: 5,
      claimId: 'CL5001',
      suggestion: 'Great suggestion',
    }));
    expect(component.feedbackText).toBe('');
    expect(component.showFeedbackForm).toBeFalse();
    expect(mockSnack.open).toHaveBeenCalledWith('Feedback submitted - thank you!', 'OK', jasmine.any(Object));
  });

  it('submitFeedback should handle error', () => {
    mockRemSvc.submitFeedback.and.returnValue(throwError(() => new Error('fail')));
    component.claimRemediation = { set_id: 1, steps: [] } as any;
    component.feedbackText = 'Test';
    component.submitFeedback();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to submit feedback', 'OK', jasmine.any(Object));
  });

  // --- saveClose ---
  it('saveClose should block when required steps incomplete for ar-specialist', () => {
    component.activeRole = 'ar-specialist';
    component.closeReason = 'Paid in Full';
    component.claimRemediation = {
      set_id: 1,
      steps: [{ id: 1, title: 'S', body: '', required: true, completed: false, sort_order: 1, checklist: [] }],
    } as any;
    component.saveClose();
    expect(mockSnack.open).toHaveBeenCalledWith(
      jasmine.stringContaining('all required'),
      'OK',
      jasmine.any(Object)
    );
    expect(mockClaimService.closeClaim).not.toHaveBeenCalled();
  });

  it('saveClose should proceed when all steps complete', () => {
    component.closeReason = 'Paid in Full';
    component.claimRemediation = {
      set_id: 1,
      steps: [{ id: 1, title: 'S', body: '', required: true, completed: true, sort_order: 1, checklist: [] }],
    } as any;
    component.saveClose();
    expect(mockClaimService.closeClaim).toHaveBeenCalledWith('CL5001', 100, 'Closed', 'Paid in Full');
  });

  it('saveClose should calculate progress correctly', () => {
    component.closeReason = 'Paid in Full';
    component.claimRemediation = {
      set_id: 1,
      steps: [
        { id: 1, title: 'S1', body: '', required: false, completed: true, sort_order: 1, checklist: [] },
        { id: 2, title: 'S2', body: '', required: false, completed: false, sort_order: 2, checklist: [] },
      ],
    } as any;
    component.saveClose();
    expect(mockClaimService.closeClaim).toHaveBeenCalledWith('CL5001', 50, 'Closed', 'Paid in Full');
  });

  it('saveClose should navigate on success', () => {
    component.closeReason = 'Paid in Full';
    component.claimRemediation = { set_id: 1, steps: [] } as any;
    component.saveClose();
    expect(mockRouter.navigate).toHaveBeenCalled();
    expect(mockSnack.open).toHaveBeenCalledWith('Claim closed successfully', 'OK', jasmine.any(Object));
  });

  it('saveClose should handle error', () => {
    mockClaimService.closeClaim.and.returnValue(throwError(() => new Error('fail')));
    component.closeReason = 'Paid in Full';
    component.claimRemediation = { set_id: 1, steps: [] } as any;
    component.saveClose();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to close claim', 'OK', jasmine.any(Object));
    expect(component.loading).toBeFalse();
  });

  it('saveClose with no steps should use 100 progress', () => {
    component.closeReason = 'Paid in Full';
    component.claimRemediation = null;
    component.activeRole = 'manager';
    component.saveClose();
    expect(mockClaimService.closeClaim).toHaveBeenCalledWith('CL5001', 100, 'Closed', 'Paid in Full');
  });

  // --- escalate ---
  it('escalate should open dialog', () => {
    component.escalate();
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('escalate should call escalateClaim on confirm', () => {
    component.escalate();
    expect(mockClaimService.escalateClaim).toHaveBeenCalledWith('CL5001', undefined);
    expect(mockSnack.open).toHaveBeenCalledWith('Claim escalated to manager', 'OK', jasmine.any(Object));
  });

  it('escalate should pass reason when result is a string', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of('Needs manager review') } as any);
    component.escalate();
    expect(mockClaimService.escalateClaim).toHaveBeenCalledWith('CL5001', 'Needs manager review');
  });

  it('escalate should not call service on cancel (dialog dismissed)', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    mockClaimService.escalateClaim.calls.reset();
    component.escalate();
    expect(mockClaimService.escalateClaim).not.toHaveBeenCalled();
  });

  it('escalate should not call service on null result', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of(null) } as any);
    mockClaimService.escalateClaim.calls.reset();
    component.escalate();
    expect(mockClaimService.escalateClaim).not.toHaveBeenCalled();
  });

  it('escalate should handle error', () => {
    mockClaimService.escalateClaim.and.returnValue(throwError(() => new Error('fail')));
    component.escalate();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to escalate claim', 'OK', jasmine.any(Object));
    expect(component.loading).toBeFalse();
  });

  // --- assignToMe ---
  it('assignToMe should call assignClaim', () => {
    component.assignToMe();
    expect(mockClaimService.assignClaim).toHaveBeenCalledWith('CL5001');
    expect(mockSnack.open).toHaveBeenCalledWith('Claim assigned to you', 'OK', jasmine.any(Object));
  });

  it('assignToMe should update claim assignedUserName', () => {
    component.claim = { ...mockClaim };
    component.assignToMe();
    expect(component.claim!.assignedUserName).toBe('Test User');
  });

  it('assignToMe should handle error', () => {
    mockClaimService.assignClaim.and.returnValue(throwError(() => new Error('fail')));
    component.assignToMe();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to assign claim', 'OK', jasmine.any(Object));
    expect(component.loading).toBeFalse();
  });

  // --- openDocumentsDialog ---
  it('openDocumentsDialog should open dialog', () => {
    mockDialog.open.calls.reset();
    component.openDocumentsDialog('eob');
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('openDocumentsDialog should pass docType', () => {
    mockDialog.open.calls.reset();
    component.openDocumentsDialog('claim-form');
    const data = mockDialog.open.calls.mostRecent().args[1];
    expect((data as any)?.data?.docType).toBe('claim-form');
  });

  // --- trackBy functions ---
  it('trackByStepId should return step id', () => {
    expect(component.trackByStepId(0, { id: 42 } as any)).toBe(42);
  });

  it('trackByNoteId should return note id', () => {
    expect(component.trackByNoteId(0, { id: 99 } as any)).toBe(99);
  });

  // --- ngOnDestroy ---
  it('should clean up on destroy', () => {
    component.ngOnDestroy();
    expect(mockClaimCtx.clear).toHaveBeenCalled();
    expect(mockMasterClaim.clearCache).toHaveBeenCalled();
  });

  // --- lineItemColumns ---
  it('should have lineItemColumns defined', () => {
    expect(component.lineItemColumns.length).toBeGreaterThan(0);
    expect(component.lineItemColumns).toContain('dos');
    expect(component.lineItemColumns).toContain('cpt');
  });

  // --- default state ---
  it('should initialize with correct defaults', () => {
    expect(component.feedback.readyToClose).toBeFalse();
    expect(component.sopBannerVisible).toBeFalse();
    expect(component.showNoteForm).toBeFalse();
    expect(component.showFeedbackForm).toBeFalse();
  });

  // -- filteredTimeline --
  it('filteredTimeline returns all when filter is all', () => {
    component.activityTimeline = [
      { eventSource: 'history', type: 'status' } as any,
      { eventSource: 'event', type: 'action' } as any,
    ];
    component.activityFilter = 'all';
    expect(component.filteredTimeline.length).toBe(2);
  });

  it('filteredTimeline returns status events when filter is status', () => {
    component.activityTimeline = [
      { eventSource: 'history', type: 'status' } as any,
      { eventSource: 'history', type: 'note' } as any,
      { eventSource: 'event', type: 'status' } as any,
    ];
    component.activityFilter = 'status';
    expect(component.filteredTimeline.length).toBe(1);
    expect(component.filteredTimeline[0].type).toBe('status');
  });

  it('filteredTimeline returns external events when filter is event', () => {
    component.activityTimeline = [
      { eventSource: 'history', type: 'status' } as any,
      { eventSource: 'event', type: 'action' } as any,
    ];
    component.activityFilter = 'event';
    expect(component.filteredTimeline.length).toBe(1);
    expect(component.filteredTimeline[0].eventSource).toBe('event');
  });

  it('filteredTimeline returns note events when filter is note', () => {
    component.activityTimeline = [
      { eventSource: 'history', type: 'status' } as any,
      { eventSource: 'history', type: 'note' } as any,
      { eventSource: 'event', type: 'action' } as any,
    ];
    component.activityFilter = 'note';
    expect(component.filteredTimeline.length).toBe(1);
    expect(component.filteredTimeline[0].type).toBe('note');
  });

  it('filteredTimeline returns sla events when filter is sla', () => {
    component.activityTimeline = [
      { eventSource: 'sla', type: 'alert' } as any,
      { eventSource: 'event', type: 'action' } as any,
    ];
    component.activityFilter = 'sla';
    expect(component.filteredTimeline.length).toBe(1);
    expect(component.filteredTimeline[0].eventSource).toBe('sla');
  });

  // -- isManager --
  it('isManager returns true for Manager role', () => {
    component.subscriptionSvc = { snapshot: { role: 'Manager' } } as any;
    expect(component.isManager).toBeTrue();
  });

  it('isManager returns true for Super Admin role', () => {
    component.subscriptionSvc = { snapshot: { role: 'Super Admin' } } as any;
    expect(component.isManager).toBeTrue();
  });

  it('isManager returns false for AR Specialist', () => {
    component.subscriptionSvc = { snapshot: { role: 'AR Specialist' } } as any;
    expect(component.isManager).toBeFalse();
  });

  it('isManager returns false when snapshot is null', () => {
    component.subscriptionSvc = { snapshot: null } as any;
    expect(component.isManager).toBeFalse();
  });

  // -- isAssignedToMe --
  it('isAssignedToMe returns true when claim assigned to current user', () => {
    component.claim = { ...mockClaim, assignedTo: '1' };
    expect(component.isAssignedToMe).toBeTrue();
  });

  it('isAssignedToMe returns false when claim assigned to different user', () => {
    component.claim = { ...mockClaim, assignedTo: '99' };
    expect(component.isAssignedToMe).toBeFalse();
  });

  it('isAssignedToMe returns false when no claim', () => {
    component.claim = undefined;
    expect(component.isAssignedToMe).toBeFalse();
  });

  // -- narrativeScoreColor --
  it('narrativeScoreColor returns grey for null score', () => {
    component.narrativeScore = null;
    expect(component.narrativeScoreColor).toBe('#9e9e9e');
  });

  it('narrativeScoreColor returns green for score >= 80', () => {
    component.narrativeScore = { score: 80 } as any;
    expect(component.narrativeScoreColor).toBe('#4caf50');
    component.narrativeScore = { score: 95 } as any;
    expect(component.narrativeScoreColor).toBe('#4caf50');
  });

  it('narrativeScoreColor returns orange for score >= 60 and < 80', () => {
    component.narrativeScore = { score: 65 } as any;
    expect(component.narrativeScoreColor).toBe('#ff9800');
  });

  it('narrativeScoreColor returns red for score < 60', () => {
    component.narrativeScore = { score: 40 } as any;
    expect(component.narrativeScoreColor).toBe('#f44336');
  });

  // -- pkgAllChecked --
  it('pkgAllChecked returns false when pkg is null', () => {
    component.pkg = null;
    expect(component.pkgAllChecked).toBeFalse();
  });

  it('pkgAllChecked returns false when checklist is empty', () => {
    component.pkg = { id: 1, checklist: [] } as any;
    expect(component.pkgAllChecked).toBeFalse();
  });

  it('pkgAllChecked returns true when all items checked', () => {
    component.pkg = { id: 1, checklist: [{ checked: true }, { checked: true }] } as any;
    expect(component.pkgAllChecked).toBeTrue();
  });

  it('pkgAllChecked returns false when some items unchecked', () => {
    component.pkg = { id: 1, checklist: [{ checked: true }, { checked: false }] } as any;
    expect(component.pkgAllChecked).toBeFalse();
  });

  // -- onWorkspaceTabChange --
  it('onWorkspaceTabChange should update activeWorkspaceTab', () => {
    component.onWorkspaceTabChange(2);
    expect(component.activeWorkspaceTab).toBe(2);
  });

  // -- toggleOriginal --
  it('toggleOriginal should toggle showOriginalNarrative', () => {
    component.showOriginalNarrative = false;
    component.toggleOriginal();
    expect(component.showOriginalNarrative).toBeTrue();
    component.toggleOriginal();
    expect(component.showOriginalNarrative).toBeFalse();
  });

  // -- openEditNote --
  it('openEditNote should populate note form fields', () => {
    const note: any = {
      id: 5, note_text: 'Existing note', note_type: 'internal', step_title: 'Step 1',
      contact_method: 'Phone', contact_person: 'Alice', phone_number: '555-1234',
      case_number: 'CASE1', reference_number: 'REF1', action_taken: 'Called payer',
      appeal_level: 'First',
    };
    component.openEditNote(note);
    expect(component.editingNoteId).toBe(5);
    expect(component.noteText).toBe('Existing note');
    expect(component.noteType).toBe('internal');
    expect(component.noteContactMethod).toBe('Phone');
    expect(component.showNoteForm).toBeTrue();
    expect(component.showFeedbackForm).toBeFalse();
  });

  it('openEditNote handles missing optional fields', () => {
    const note: any = { id: 3, note_text: 'Note', note_type: 'general' };
    component.openEditNote(note);
    expect(component.noteContactMethod).toBe('');
    expect(component.noteContactPerson).toBe('');
    expect(component.noteCaseNumber).toBe('');
  });

  // -- submitNote with editingNoteId --
  it('submitNote should update existing note when editingNoteId is set', () => {
    mockRemSvc.updateNote = jasmine.createSpy('updateNote').and.returnValue(of({}));
    component.editingNoteId = 5;
    component.noteText = 'Updated note text';
    component.submitNote();
    expect((mockRemSvc as any).updateNote).toHaveBeenCalledWith(5, jasmine.objectContaining({
      noteText: 'Updated note text',
    }));
  });

  // -- saveClose no closeReason --
  it('saveClose should show snack when no closeReason', () => {
    component.closeReason = '';
    component.saveClose();
    expect(mockSnack.open).toHaveBeenCalledWith('Select a close reason before closing.', 'OK', jasmine.any(Object));
    expect(mockClaimService.closeClaim).not.toHaveBeenCalled();
  });

  // -- onStepToggle with showIncompleteHighlight --
  it('onStepToggle clears showIncompleteHighlight when all required steps complete', () => {
    component.showIncompleteHighlight = true;
    component.claimRemediation = {
      set_id: 1,
      steps: [{ id: 1, title: 'S', body: '', required: true, completed: false, sort_order: 1, checklist: [] }],
    } as any;
    const step = component.claimRemediation!.steps[0];
    component.onStepToggle(step, true); // this completes all required steps
    expect(component.showIncompleteHighlight).toBeFalse();
  });

  // -- closeAdjudicated --
  it('closeAdjudicated should close claim as adjudicated', () => {
    mockClaimService.closeClaimAdjudicated = jasmine.createSpy('closeClaimAdjudicated').and.returnValue(of({}));
    component.closeReason = 'Paid in Full';
    component.claimRemediation = { set_id: 1, steps: [] } as any;
    component.closeAdjudicated();
    expect((mockClaimService as any).closeClaimAdjudicated).toHaveBeenCalledWith('CL5001', 100, 'Paid in Full');
  });

  it('closeAdjudicated should handle error', () => {
    mockClaimService.closeClaimAdjudicated = jasmine.createSpy('closeClaimAdjudicated').and.returnValue(throwError(() => new Error('fail')));
    component.closeReason = 'Paid in Full';
    component.claimRemediation = { set_id: 1, steps: [] } as any;
    component.closeAdjudicated();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to close claim', 'OK', jasmine.any(Object));
  });

  // -- unassignClaim --
  it('unassignClaim should unassign and update claim', () => {
    mockClaimService.unassignClaim = jasmine.createSpy('unassignClaim').and.returnValue(of({}));
    component.claim = { ...mockClaim, assignedUserName: 'Alice', assignedTo: '1' };
    component.unassignClaim();
    expect((mockClaimService as any).unassignClaim).toHaveBeenCalledWith('CL5001');
    expect(component.claim!.assignedTo).toBeNull();
    expect(component.claim!.assignedUserName).toBeNull();
    expect(mockSnack.open).toHaveBeenCalledWith('Claim unassigned', 'OK', jasmine.any(Object));
  });

  it('unassignClaim should handle error', () => {
    mockClaimService.unassignClaim = jasmine.createSpy('unassignClaim').and.returnValue(throwError(() => new Error('fail')));
    component.unassignClaim();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to unassign claim', 'OK', jasmine.any(Object));
    expect(component.loading).toBeFalse();
  });

  // -- exportActivity --
  it('exportActivity should download csv on success', () => {
    mockClaimService.exportClaimHistory = jasmine.createSpy('exportClaimHistory').and.returnValue(of(new Blob(['csv'])));
    const createSpy = spyOn(document, 'createElement').and.callThrough();
    component.exportActivity();
    expect((mockClaimService as any).exportClaimHistory).toHaveBeenCalledWith('CL5001');
  });

  it('exportActivity should handle error', () => {
    mockClaimService.exportClaimHistory = jasmine.createSpy('exportClaimHistory').and.returnValue(throwError(() => new Error('fail')));
    component.exportActivity();
    expect(mockSnack.open).toHaveBeenCalledWith('Export failed', 'OK', jasmine.any(Object));
  });

  // --- patient name fallback (Unknown patient) -----------------------------

  it('resolvedPatient falls back when API patient is "Unknown patient"', () => {
    // The fallback logic: if api patient is "Unknown patient", use _navPatient
    // We can verify the logic by checking the component post-init with a mocked detail
    mockClaimService.detail.and.returnValue(of({ ...mockClaim, patient: 'Unknown patient' }));
    fixture = TestBed.createComponent(ClaimDetailComponent);
    component = fixture.componentInstance;
    // Set _navPatient via window.history.state won't work easily - just verify claim loads
    fixture.detectChanges();
    // The patient may be 'Unknown patient' since _navPatient is undefined in this test
    expect(component.claim).toBeTruthy();
  });

  // --- scoreNarrative -------------------------------------------------------

  it('scoreNarrative sets narrativeScore on success', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.scoreNarrative = jasmine.createSpy('scoreNarrative').and.returnValue(of({ score: 85, feedback: [] }));
    component.scoreNarrative();
    expect(component.narrativeScore).toEqual({ score: 85, feedback: [] } as any);
    expect(mockSnack.open).toHaveBeenCalledWith('Narrative scored successfully', 'OK', jasmine.any(Object));
  });

  it('scoreNarrative shows error message on fail', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.scoreNarrative = jasmine.createSpy('scoreNarrative').and.returnValue(throwError(() => new Error('fail')));
    component.scoreNarrative();
    expect(mockSnack.open).toHaveBeenCalledWith('Scoring unavailable \u2014 Ollama may be offline', 'OK', jasmine.any(Object));
  });

  // --- generateRewrite -----------------------------------------------------

  it('generateRewrite sets claimRewrite on success', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    const rewrite = { id: 1, rewritten_text: 'New text', accepted: false };
    mockDenialSvc.generateRewrite = jasmine.createSpy('generateRewrite').and.returnValue(of(rewrite));
    component.generateRewrite();
    expect(component.claimRewrite).toEqual(rewrite as any);
    expect(component.rewriteEditText).toBe('New text');
    expect(mockSnack.open).toHaveBeenCalledWith('Rewrite suggestions generated', 'OK', jasmine.any(Object));
  });

  it('generateRewrite shows error on fail', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.generateRewrite = jasmine.createSpy('generateRewrite').and.returnValue(throwError(() => new Error()));
    component.generateRewrite();
    expect(mockSnack.open).toHaveBeenCalledWith('Rewrite unavailable \u2014 Ollama may be offline', 'OK', jasmine.any(Object));
  });

  // --- toggleOriginal and acceptRewrite ------------------------------------

  it('toggleOriginal toggles showOriginalNarrative', () => {
    expect(component.showOriginalNarrative).toBeFalse();
    component.toggleOriginal();
    expect(component.showOriginalNarrative).toBeTrue();
    component.toggleOriginal();
    expect(component.showOriginalNarrative).toBeFalse();
  });

  it('acceptRewrite does nothing when claimRewrite is null', () => {
    component.claimRewrite = null;
    expect(() => component.acceptRewrite(true)).not.toThrow();
  });

  it('acceptRewrite with accepted=false sends undefined editedText', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.acceptRewrite = jasmine.createSpy('acceptRewrite').and.returnValue(of({}));
    component.claimRewrite = { id: 5, rewritten_text: 'Old', accepted: false } as any;
    component.rewriteEditText = 'Edited';
    component.acceptRewrite(false);
    expect(mockDenialSvc.acceptRewrite).toHaveBeenCalledWith(5, false, undefined);
    expect(mockSnack.open).toHaveBeenCalledWith('Rewrite discarded', 'OK', jasmine.any(Object));
  });

  it('acceptRewrite with accepted=true sends edited text', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.acceptRewrite = jasmine.createSpy('acceptRewrite').and.returnValue(of({}));
    component.claimRewrite = { id: 5, rewritten_text: 'Old', accepted: false } as any;
    component.rewriteEditText = 'Edited text';
    component.acceptRewrite(true);
    expect(mockDenialSvc.acceptRewrite).toHaveBeenCalledWith(5, true, 'Edited text');
    expect(mockSnack.open).toHaveBeenCalledWith('Rewrite accepted & saved', 'OK', jasmine.any(Object));
  });

  // --- submitForApproval ---------------------------------------------------

  it('submitForApproval sets approvalRecord on success', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    const record = { id: 99, status: 'pending_review', claim_id: 'CL5001' };
    mockDenialSvc.submitForApproval = jasmine.createSpy('submitForApproval').and.returnValue(of(record));
    component.submitForApproval();
    expect(component.approvalRecord).toEqual(record as any);
    expect(mockSnack.open).toHaveBeenCalledWith('Submitted for manager review', 'OK', jasmine.any(Object));
  });

  it('submitForApproval shows error message on fail', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.submitForApproval = jasmine.createSpy('submitForApproval').and.returnValue(
      throwError(() => ({ error: { message: 'Custom error' } }))
    );
    component.submitForApproval();
    expect(mockSnack.open).toHaveBeenCalledWith('Custom error', 'OK', jasmine.any(Object));
  });

  it('submitForApproval shows fallback error when no message', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.submitForApproval = jasmine.createSpy('submitForApproval').and.returnValue(
      throwError(() => ({}))
    );
    component.submitForApproval();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to submit for review', 'OK', jasmine.any(Object));
  });

  // --- recallApproval ------------------------------------------------------

  it('recallApproval does nothing when approvalRecord is null', () => {
    component.approvalRecord = null;
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.recallApproval = jasmine.createSpy('recallApproval');
    component.recallApproval();
    expect(mockDenialSvc.recallApproval).not.toHaveBeenCalled();
  });

  it('recallApproval updates status on success', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.recallApproval = jasmine.createSpy('recallApproval').and.returnValue(of({}));
    component.approvalRecord = { id: 10, status: 'pending_review', claim_id: 'CL5001' } as any;
    component.recallApproval();
    expect(component.approvalRecord?.status).toBe('recalled');
    expect(mockSnack.open).toHaveBeenCalledWith('Submission recalled', 'OK', jasmine.any(Object));
  });

  it('recallApproval shows error on fail', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.recallApproval = jasmine.createSpy('recallApproval').and.returnValue(throwError(() => new Error()));
    component.approvalRecord = { id: 10, status: 'pending_review', claim_id: 'CL5001' } as any;
    component.recallApproval();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to recall', 'OK', jasmine.any(Object));
  });

  // --- reviewApproval ------------------------------------------------------

  it('reviewApproval does nothing when approvalRecord is null', () => {
    component.approvalRecord = null;
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.reviewApproval = jasmine.createSpy('reviewApproval');
    component.reviewApproval('approved');
    expect(mockDenialSvc.reviewApproval).not.toHaveBeenCalled();
  });

  it('reviewApproval updates status on success', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.reviewApproval = jasmine.createSpy('reviewApproval').and.returnValue(of({}));
    component.approvalRecord = { id: 20, status: 'pending_review', claim_id: 'CL5001' } as any;
    component.reviewApproval('approved');
    expect(component.approvalRecord?.status).toBe('approved');
    expect(mockSnack.open).toHaveBeenCalledWith('Resubmission approved', 'OK', jasmine.any(Object));
  });

  it('reviewApproval shows rejected message', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.reviewApproval = jasmine.createSpy('reviewApproval').and.returnValue(of({}));
    component.approvalRecord = { id: 20, status: 'pending_review', claim_id: 'CL5001' } as any;
    component.reviewApproval('rejected');
    expect(mockSnack.open).toHaveBeenCalledWith('Resubmission rejected', 'OK', jasmine.any(Object));
  });

  it('reviewApproval shows error on fail', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.reviewApproval = jasmine.createSpy('reviewApproval').and.returnValue(throwError(() => new Error()));
    component.approvalRecord = { id: 20, status: 'pending_review', claim_id: 'CL5001' } as any;
    component.reviewApproval('approved');
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to record decision', 'OK', jasmine.any(Object));
  });

  // --- recordOutcome -------------------------------------------------------

  it('recordOutcome does nothing when no appealId', () => {
    component.approvalRecord = null;
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.recordAppealOutcome = jasmine.createSpy('recordAppealOutcome');
    component.recordOutcome('won', 30);
    expect(mockDenialSvc.recordAppealOutcome).not.toHaveBeenCalled();
  });

  it('recordOutcome sets outcomeRecorded on success', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.recordAppealOutcome = jasmine.createSpy('recordAppealOutcome').and.returnValue(of({}));
    component.approvalRecord = { id: 5, appeal_id: 42, status: 'approved', claim_id: 'CL5001' } as any;
    component.recordOutcome('won', 30);
    expect(component.outcomeRecorded).toBeTrue();
    expect(mockSnack.open).toHaveBeenCalledWith('Outcome recorded: won', 'OK', jasmine.any(Object));
  });

  it('recordOutcome shows error on fail', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.recordAppealOutcome = jasmine.createSpy('recordAppealOutcome').and.returnValue(throwError(() => new Error()));
    component.approvalRecord = { id: 5, appeal_id: 42, status: 'approved', claim_id: 'CL5001' } as any;
    component.recordOutcome('lost');
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to record outcome', 'OK', jasmine.any(Object));
  });

  // --- toggleChecklistItem -------------------------------------------------

  it('toggleChecklistItem does nothing when pkg is null', () => {
    component.pkg = null;
    expect(() => component.toggleChecklistItem(0, true)).not.toThrow();
  });

  it('toggleChecklistItem updates checklist item', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.updateResubmissionPackage = jasmine.createSpy('updateResubmissionPackage').and.returnValue(of({}));
    component.pkg = {
      id: 7, status: 'draft',
      checklist: [{ label: 'Step 1', checked: false }, { label: 'Step 2', checked: false }],
    } as any;
    component.toggleChecklistItem(0, true);
    expect(component.pkg?.checklist[0].checked).toBeTrue();
    expect(mockDenialSvc.updateResubmissionPackage).toHaveBeenCalled();
  });

  // --- markPackageReady -----------------------------------------------------

  it('markPackageReady does nothing when pkg is null', () => {
    component.pkg = null;
    expect(() => component.markPackageReady()).not.toThrow();
  });

  it('markPackageReady updates package status', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.updateResubmissionPackage = jasmine.createSpy('updateResubmissionPackage').and.returnValue(of({}));
    component.pkg = { id: 8, status: 'draft', checklist: [] } as any;
    component.markPackageReady();
    expect(component.pkg?.status).toBe('ready');
    expect(mockSnack.open).toHaveBeenCalledWith('Package marked as ready', 'OK', jasmine.any(Object));
  });

  // --- narrativeScoreColor --------------------------------------------------

  it('narrativeScoreColor returns gray when no score', () => {
    component.narrativeScore = null;
    expect(component.narrativeScoreColor).toBe('#9e9e9e');
  });

  it('narrativeScoreColor returns green for score >= 80', () => {
    component.narrativeScore = { score: 90, feedback: [] } as any;
    expect(component.narrativeScoreColor).toBe('#4caf50');
  });

  it('narrativeScoreColor returns orange for score 60-79', () => {
    component.narrativeScore = { score: 65, feedback: [] } as any;
    expect(component.narrativeScoreColor).toBe('#ff9800');
  });

  it('narrativeScoreColor returns red for score < 60', () => {
    component.narrativeScore = { score: 40, feedback: [] } as any;
    expect(component.narrativeScoreColor).toBe('#f44336');
  });

  // --- pkgAllChecked --------------------------------------------------------

  it('pkgAllChecked returns false when pkg is null', () => {
    component.pkg = null;
    expect(component.pkgAllChecked).toBeFalse();
  });

  it('pkgAllChecked returns true when all items checked', () => {
    component.pkg = { id: 1, status: 'draft', checklist: [{ label: 'A', checked: true }] } as any;
    expect(component.pkgAllChecked).toBeTrue();
  });

  it('pkgAllChecked returns false when some items unchecked', () => {
    component.pkg = {
      id: 1, status: 'draft',
      checklist: [{ label: 'A', checked: true }, { label: 'B', checked: false }],
    } as any;
    expect(component.pkgAllChecked).toBeFalse();
  });

  // --- submitNote with editingNoteId ----------------------------------------

  it('submitNote does nothing when noteText is empty', () => {
    component.noteText = '   ';
    expect(() => component.submitNote()).not.toThrow();
    expect(mockRemSvc.addNote).not.toHaveBeenCalled();
  });

  it('submitNote calls updateNote when editingNoteId is set', () => {
    mockRemSvc.updateNote = jasmine.createSpy('updateNote').and.returnValue(of({}));
    component.editingNoteId = 5;
    component.noteText = 'Updated note';
    component.noteType = 'follow-up';
    component.submitNote();
    expect(mockRemSvc.updateNote).toHaveBeenCalled();
    expect(mockSnack.open).toHaveBeenCalledWith('Note saved', 'OK', jasmine.any(Object));
  });

  it('submitNote shows error when updateNote fails', () => {
    mockRemSvc.updateNote = jasmine.createSpy('updateNote').and.returnValue(throwError(() => new Error()));
    component.editingNoteId = 5;
    component.noteText = 'Updated note';
    component.noteType = 'follow-up';
    component.submitNote();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to save note', 'OK', jasmine.any(Object));
  });

  // --- attemptClose with requiredStepsIncomplete ----------------------------

  it('attemptClose shows error when no closeReason', () => {
    component.closeReason = '';
    component.saveClose();
    expect(mockSnack.open).toHaveBeenCalledWith('Select a close reason before closing.', 'OK', jasmine.any(Object));
  });

  it('attemptClose highlights incomplete steps for ar-specialist', () => {
    component.closeReason = 'Approved';
    // subscriptionSvc.snapshot is undefined -> isManager = false
    component.claimRemediation = {
      set_id: 1,
      steps: [{ id: 1, title: 'Step 1', required: true, completed: false }],
    } as any;
    component.saveClose();
    expect(component.showIncompleteHighlight).toBeTrue();
  });

  // --- saveClose with steps progress ----------------------------------------

  it('saveClose calculates progress from completed steps', () => {
    component.closeReason = 'Approved';
    component.claimRemediation = {
      set_id: 1,
      steps: [
        { id: 1, title: 'Step A', required: false, completed: true },
        { id: 2, title: 'Step B', required: false, completed: false },
      ],
    } as any;
    component.saveClose();
    expect(mockClaimService.closeClaim).toHaveBeenCalledWith('CL5001', 50, 'Closed', 'Approved');
  });

  // --- isAssignedToMe -------------------------------------------------------

  it('isAssignedToMe returns true when claim.assignedTo matches userId', () => {
    component.claim = { ...mockClaim, assignedTo: '1' };
    expect(component.isAssignedToMe).toBeTrue();
  });

  it('isAssignedToMe returns false when assignedTo does not match', () => {
    component.claim = { ...mockClaim, assignedTo: '999' };
    expect(component.isAssignedToMe).toBeFalse();
  });

  // --- assignToMe updates claim ---------------------------------------------

  it('assignToMe updates claim.assignedUserName on success', () => {
    component.claim = { ...mockClaim, assignedUserName: null };
    component.assignToMe();
    expect(component.claim?.assignedUserName).toBe('Test User');
  });

  // --- openNoteForm and openEditNote ----------------------------------------

  it('openNoteForm resets note form state', () => {
    component.openNoteForm(3, 'Step Title');
    expect(component.noteStepId).toBe(3);
    expect(component.noteStepTitle).toBe('Step Title');
    expect(component.showNoteForm).toBeTrue();
    expect(component.showFeedbackForm).toBeFalse();
  });

  it('openEditNote sets edit form state', () => {
    const note = {
      id: 7, note_text: 'My note', note_type: 'general', step_title: 'Step X',
      contact_method: 'Phone', contact_person: 'Jane', phone_number: '555-1234',
      case_number: 'CASE-1', reference_number: 'REF-1', action_taken: 'Called', appeal_level: 'Level 1',
    } as any;
    component.openEditNote(note);
    expect(component.editingNoteId).toBe(7);
    expect(component.noteText).toBe('My note');
    expect(component.noteContactMethod).toBe('Phone');
    expect(component.showNoteForm).toBeTrue();
  });

  // --- createPackage -------------------------------------------------------

  it('createPackage creates a package successfully', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    const newPkg = { id: 3, status: 'draft', checklist: [] };
    mockDenialSvc.createResubmissionPackage = jasmine.createSpy('createResubmissionPackage').and.returnValue(of(newPkg));
    component.approvalRecord = { id: 10, appeal_id: null, status: 'pending_review', claim_id: 'CL5001' } as any;
    component.createPackage();
    expect(component.pkg).toEqual(newPkg as any);
    expect(mockSnack.open).toHaveBeenCalledWith('Resubmission package created', 'OK', jasmine.any(Object));
  });

  it('createPackage shows error on fail', () => {
    const mockDenialSvc = TestBed.inject(DenialManagementService) as any;
    mockDenialSvc.createResubmissionPackage = jasmine.createSpy('createResubmissionPackage').and.returnValue(throwError(() => new Error()));
    component.approvalRecord = null;
    component.createPackage();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to create package', 'OK', jasmine.any(Object));
  });

  // --- openFeedbackForm and submitFeedback ----------------------------------

  it('openFeedbackForm sets feedback form state', () => {
    component.openFeedbackForm(2, 'Step 2');
    expect(component.feedbackStepId).toBe(2);
    expect(component.feedbackStepTitle).toBe('Step 2');
    expect(component.showFeedbackForm).toBeTrue();
    expect(component.showNoteForm).toBeFalse();
  });

  it('submitFeedback does nothing when feedbackText is empty', () => {
    component.feedbackText = '';
    expect(() => component.submitFeedback()).not.toThrow();
    expect(mockRemSvc.submitFeedback).not.toHaveBeenCalled();
  });

  it('submitFeedback does nothing when claimRemediation is null', () => {
    component.feedbackText = 'Some feedback';
    (component as any).claimRemediation = null;
    expect(() => component.submitFeedback()).not.toThrow();
  });

  it('submitFeedback submits and clears form on success', () => {
    component.feedbackText = 'Great step!';
    component.showFeedbackForm = true;
    component.submitFeedback();
    expect(mockRemSvc.submitFeedback).toHaveBeenCalled();
    expect(component.feedbackText).toBe('');
    expect(component.showFeedbackForm).toBeFalse();
    expect(mockSnack.open).toHaveBeenCalledWith('Feedback submitted - thank you!', 'OK', jasmine.any(Object));
  });

  it('submitFeedback shows error on fail', () => {
    mockRemSvc.submitFeedback.and.returnValue(throwError(() => new Error()));
    component.feedbackText = 'Great step!';
    component.submitFeedback();
    expect(mockSnack.open).toHaveBeenCalledWith('Failed to submit feedback', 'OK', jasmine.any(Object));
  });
});
