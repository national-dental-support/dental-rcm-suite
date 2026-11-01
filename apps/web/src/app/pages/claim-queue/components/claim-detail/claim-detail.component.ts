import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subject, switchMap, take, takeUntil, of } from 'rxjs';
import { ClaimService } from '../../services/claim.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  RemediationService,
  ClaimRemediationData,
  RemediationStep,
  ClaimStepNote,
} from '../../../../core/services/remediation.service';
import { UserStoreService } from '../../../../core/stores/user-store.service';
import { ClaimActionDialogComponent, TransactionalAdjustmentDialogComponent, TransactionalAdjustmentResult } from '../claim-action-dialog/claim-action-dialog';
import { ClaimContextService } from '../../services/claim-context.service';
import { ClaimDetail } from '../../models/claim.models';
import { DenialIqContextService, DenialIqRole } from '../../services/denialIqRole.service';
import { ClaimDocumentDialogComponent } from '../claim-dialog/claim-document-dialog.component';
import { MasterClaimService } from '../../../../core/services/master-claim.service';
import { SubscriptionService } from '../../../../core/services/subscription.service';
import { ClaimEnrichmentMap } from '../../../../core/models/master-claim.model';
import { ClaimHistoryItem } from '../../services/claim.service';
import { DenialPredictionService, ClaimRiskScore } from '../../../../core/services/denial-prediction.service';
import { KeyboardShortcutsService } from '../../../../core/services/keyboard-shortcuts.service';
import {
  DenialManagementService,
  NarrativeScore,
  ClaimRewrite,
  ClaimApprovalRecord,
  PayerVelocityScore,
  ResubmissionPackage,
  TemplatePerformanceRow,
} from '../../../../core/services/denial-management.service';

@Component({
    selector: 'app-claim-detail',
    templateUrl: './claim-detail.component.html',
    styleUrls: ['./claim-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ClaimDetailComponent implements OnInit, OnDestroy {
  loading = false;
  error = false;
  claim?: ClaimDetail;
  /** Patient name passed from queue row via router state - used as fallback when API can't resolve */
  private _navPatient: string | undefined;
  notes = '';

  lineItemColumns: string[] = [
    'dos', 'cpt', 'charge', 'insurancePaid', 'allowed',
    'contractualAdj', 'transactionAdj', 'patientResp',
    'deductible', 'copay', 'coins', 'reasonCode',
  ];

  feedback = {
    readyToClose: false,
  };

  activeRole: DenialIqRole = 'ar-specialist';

  // -- Remediation (API-driven) ---------------------------------------------
  claimRemediation: ClaimRemediationData | null = null;
  claimReasonCode = '';
  claimNotes: ClaimStepNote[] = [];

  noteText = '';
  noteStepId: number | null = null;
  noteType = 'follow-up';
  noteStepTitle = '';
  showNoteForm = false;
  editingNoteId: number | null = null;

  // Structured follow-up fields
  noteContactMethod = '';
  noteContactPerson = '';
  notePhoneNumber = '';
  noteCaseNumber = '';
  noteReferenceNumber = '';
  noteActionTaken = '';
  noteAppealLevel = '';

  get isManager(): boolean {
    const role = this.subscriptionSvc.snapshot?.role ?? '';
    return role === 'Manager' || role === 'Super Admin';
  }

  get isSuperAdmin(): boolean {
    return this.subscriptionSvc.snapshot?.role === 'Super Admin';
  }

  editRemediationSteps(): void {
    const code = this.claim?.reasonCode ?? this.claimReasonCode;
    this.router.navigate(['/app/admin/remediation'], {
      queryParams: { code: code || undefined, role: this.activeRole },
    });
  }

  get nextClaimId(): string | null {
    const state = this.claimCtx.getQueueState();
    if (!state?.rows.length) return null;
    const idx = state.rows.findIndex(r => r.id === this.claimId);
    if (idx === -1 || idx >= state.rows.length - 1) return null;
    return state.rows[idx + 1].id;
  }

  goToNextClaim(): void {
    const nextId = this.nextClaimId;
    if (!nextId) return;
    this.router.navigate(['../', nextId], { relativeTo: this.route });
  }

  feedbackStepId: number | null = null;
  feedbackStepTitle = '';
  feedbackText = '';
  showFeedbackForm = false;

  // -- Close reason --------------------------------------------------------
  closeReason = '';
  readonly closeReasonOptions = [
    'Paid in Full',
    'Adjusted / Written Off',
    'Patient Responsible',
    'Duplicate Claim',
    'Unable to Collect',
    'Other',
  ];

  sopBannerVisible = false;
  showIncompleteHighlight = false;

  // -- Workspace tabs -----------------------------------------------------
  activeWorkspaceTab = 0;

  // -- Cross-product enrichments (subscription-gated) ---------------------
  enrichments: ClaimEnrichmentMap = {};

  activityTimeline: ClaimHistoryItem[] = [];
  activityFilter: 'all' | 'status' | 'event' | 'note' | 'sla' = 'all';

  get filteredTimeline(): ClaimHistoryItem[] {
    if (this.activityFilter === 'all') return this.activityTimeline;
    if (this.activityFilter === 'status') return this.activityTimeline.filter(h => h.eventSource === 'history' && h.type === 'status');
    if (this.activityFilter === 'event')  return this.activityTimeline.filter(h => h.eventSource === 'event');
    if (this.activityFilter === 'note')   return this.activityTimeline.filter(h => h.eventSource === 'history' && h.type !== 'status');
    if (this.activityFilter === 'sla')    return this.activityTimeline.filter(h => h.eventSource === 'sla');
    return this.activityTimeline;
  }

  // -- Risk prediction ----------------------------------------------------
  riskScore: ClaimRiskScore | null = null;

  // -- CARC description map (code -> description for tooltips) ---------
  carcDescMap: Record<string, string> = {};
  carcLoadingCodes = new Set<string>();

  // -- AI Assist ------------------------------------------------------
  narrativeScore: NarrativeScore | null = null;
  narrativeScoreLoading = false;
  claimRewrite: ClaimRewrite | null = null;
  rewriteLoading = false;
  rewriteEditText = '';
  showOriginalNarrative = false;
  approvalRecord: ClaimApprovalRecord | null = null;
  approvalLoading = false;
  payerVelocityScore: PayerVelocityScore | null = null;
  approvalReviewerNotes = '';
  showApprovalRejectForm = false;

  // -- Resubmission Package -------------------------------------------
  pkg: ResubmissionPackage | null = null;
  pkgLoading = false;

  // -- Template Performance -------------------------------------------
  templateLeaderboard: TemplatePerformanceRow[] = [];
  templateLeaderboardLoading = false;

  // -- Outcome Recording ----------------------------------------------
  outcomeRecorded = false;
  outcomeLoading = false;
  outcomeDaysInput = '';

  private claimId = '';
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: ClaimService,
    private remSvc: RemediationService,
    private userStore: UserStoreService,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private claimCtx: ClaimContextService,
    private denialCtx: DenialIqContextService,
    private masterClaimSvc: MasterClaimService,
    public subscriptionSvc: SubscriptionService,
    private predictionSvc: DenialPredictionService,
    private shortcuts: KeyboardShortcutsService,
    private denialSvc: DenialManagementService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this._navPatient = (window.history.state as { patient?: string })?.patient;

    // Resolve role synchronously before paramMap fires so forkJoin can use it
    this.denialCtx.role$
      .pipe(take(1))
      .subscribe(role => (this.activeRole = role ?? 'ar-specialist'));

    this.route.paramMap
      .pipe(
        switchMap(p => {
          const id = p.get('id')!;
          this.claimId = id;
          // Load detail + line items in parallel; remediation is fetched after detail
          // so we can pass the claim's CARC code directly (avoids a second claimhistory lookup
          // and ensures CARC-specific SOP sets are matched correctly - issue #78).
          return forkJoin({
            detail: this.svc.detail(id),
            lineItems: this.svc.getClaimDetailTable(id),
          });
        }),
        switchMap(({ detail, lineItems }) => {
          const reasonCode = detail.reasonCode ?? '';
          return forkJoin({
            detail: of(detail),
            lineItems: of(lineItems),
            remediation: this.remSvc.getClaimSteps(this.claimId, this.activeRole, reasonCode || undefined),
          });
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: ({ detail, lineItems, remediation }) => {
          // Preserve patient name from queue row (passed via route state) if API couldn't resolve it
          const resolvedPatient = (detail.patient && detail.patient !== 'Unknown patient')
            ? detail.patient
            : (this._navPatient || detail.patient);
          this.claim = { ...detail, patient: resolvedPatient, lineItems };
          this.notes = this.claim.notes || '';
          this.claimRemediation = remediation.data;
          this.claimReasonCode = remediation.claimReasonCode ?? '';
          this.loading = false;
          this.cdr.markForCheck();
          this.claimCtx.setActiveClaim({ id: this.claim.id, patient: this.claim.patient });
          this.loadNotes();
          this.loadHistory();
          this.loadEnrichments();
          this.loadRiskScore();
          this.loadCarcDescriptions(this.claim);
          this.loadNarrativeScore();
          this.loadApprovalStatus();
          this.loadPayerVelocity();
          this.loadPackage();
          this.loadLatestRewrite();
          this.loadTemplateLeaderboard();

          // Track work start in claimhistory
          this.svc.startWork(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
            error: (err) => console.error('[ClaimDetail] startWork failed', err),
          });
        },
        error: () => {
          this.loading = false;
          this.error = true;
          this.cdr.markForCheck();
        },
      });

    // Keyboard shortcuts: E=escalate, S=save & close
    this.shortcuts.onAction$
      .pipe(takeUntil(this.destroy$))
      .subscribe(action => {
        if (!this.claim) return;
        switch (action) {
          case 'escalate':
            this.escalate();
            break;
          case 'save-close':
            this.saveClose();
            break;
        }
      });
  }

private loadNotes(): void {
    this.remSvc.getNotes(this.claimId).subscribe({
      next: notes => { this.claimNotes = notes; this.cdr.markForCheck(); },
      error: (err) => console.error('[ClaimDetail] loadNotes failed', err),
    });
  }

  private loadHistory(): void {
    this.svc.getClaimHistory(this.claimId).subscribe({
      next: items => { this.activityTimeline = items; this.cdr.markForCheck(); },
      error: (err) => console.error('[ClaimDetail] loadHistory failed', err),
    });
  }

  exportActivity(): void {
    this.svc.exportClaimHistory(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `claim-${this.claimId}-activity.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('Export failed', 'OK', { duration: 3000 }),
    });
  }

  private loadEnrichments(): void {
    this.masterClaimSvc.getClaim(this.claimId).subscribe({
      next: res => { this.enrichments = res.enrichments; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  private loadRiskScore(): void {
    this.predictionSvc.scoreClaimById(this.claimId).subscribe({
      next: score => { this.riskScore = score; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  private loadNarrativeScore(): void {
    this.denialSvc.getNarrativeScore(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: score => { this.narrativeScore = score; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  private loadApprovalStatus(): void {
    this.denialSvc.listApprovals(undefined, this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: records => {
        this.approvalRecord = records.find(r => r.status === 'pending_review' || r.status === 'approved') ?? records[0] ?? null;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  private loadPayerVelocity(): void {
    this.denialSvc.getPayerVelocityScore(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: score => { this.payerVelocityScore = score; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  private loadLatestRewrite(): void {
    this.denialSvc.getLatestRewrite(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: rewrite => {
        if (rewrite) {
          this.claimRewrite = rewrite;
          this.rewriteEditText = rewrite.rewritten_text || '';
          this.cdr.markForCheck();
        }
      },
      error: () => {},
    });
  }

  private loadPackage(): void {
    this.denialSvc.getResubmissionPackage(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: pkg => { this.pkg = pkg; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  private loadTemplateLeaderboard(): void {
    this.templateLeaderboardLoading = true;
    const payer = this.claim?.payer ?? undefined;
    const denial = this.claim?.reasonCode ?? undefined;
    this.denialSvc.getTemplateLeaderboard(payer, denial).pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        this.templateLeaderboard = rows.slice(0, 5);
        this.templateLeaderboardLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.templateLeaderboardLoading = false; this.cdr.markForCheck(); },
    });
  }

  createPackage(): void {
    this.pkgLoading = true;
    this.cdr.markForCheck();
    this.denialSvc.createResubmissionPackage(this.claimId, { appeal_id: this.approvalRecord?.id ?? null }).pipe(takeUntil(this.destroy$)).subscribe({
      next: pkg => {
        this.pkg = pkg;
        this.pkgLoading = false;
        this.snack.open('Resubmission package created', 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => {
        this.pkgLoading = false;
        this.snack.open('Failed to create package', 'OK', { duration: 3000 });
        this.cdr.markForCheck();
      },
    });
  }

  toggleChecklistItem(index: number, checked: boolean): void {
    if (!this.pkg) return;
    const checklist = this.pkg.checklist.map((item, i) => i === index ? { ...item, checked } : item);
    this.pkg = { ...this.pkg, checklist };
    this.cdr.markForCheck();
    this.denialSvc.updateResubmissionPackage(this.pkg.id, { checklist }).pipe(takeUntil(this.destroy$)).subscribe({
      error: () => this.snack.open('Failed to update checklist', 'OK', { duration: 3000 }),
    });
  }

  markPackageReady(): void {
    if (!this.pkg) return;
    this.denialSvc.updateResubmissionPackage(this.pkg.id, { status: 'ready' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.pkg = { ...this.pkg!, status: 'ready' };
        this.snack.open('Package marked as ready', 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Failed to update package', 'OK', { duration: 3000 }),
    });
  }

  recordOutcome(outcome: 'won' | 'lost', days?: number): void {
    const appealId = this.approvalRecord?.appeal_id ?? null;
    if (!appealId) return;
    this.outcomeLoading = true;
    this.cdr.markForCheck();
    this.denialSvc.recordAppealOutcome(appealId, outcome, days).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.outcomeRecorded = true;
        this.outcomeLoading = false;
        this.snack.open(`Outcome recorded: ${outcome}`, 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => {
        this.outcomeLoading = false;
        this.snack.open('Failed to record outcome', 'OK', { duration: 3000 });
        this.cdr.markForCheck();
      },
    });
  }

  scoreNarrative(): void {
    this.narrativeScoreLoading = true;
    this.cdr.markForCheck();
    this.denialSvc.scoreNarrative(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: score => {
        this.narrativeScore = score;
        this.narrativeScoreLoading = false;
        this.snack.open('Narrative scored successfully', 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => {
        this.narrativeScoreLoading = false;
        this.snack.open('Scoring unavailable \u2014 Ollama may be offline', 'OK', { duration: 3500 });
        this.cdr.markForCheck();
      },
    });
  }

  generateRewrite(): void {
    this.rewriteLoading = true;
    this.showOriginalNarrative = false;
    this.cdr.markForCheck();
    this.denialSvc.generateRewrite(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: rewrite => {
        this.claimRewrite = rewrite;
        this.rewriteEditText = rewrite.rewritten_text || '';
        this.rewriteLoading = false;
        this.snack.open('Rewrite suggestions generated', 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => {
        this.rewriteLoading = false;
        this.snack.open('Rewrite unavailable \u2014 Ollama may be offline', 'OK', { duration: 3500 });
        this.cdr.markForCheck();
      },
    });
  }

  toggleOriginal(): void {
    this.showOriginalNarrative = !this.showOriginalNarrative;
    this.cdr.markForCheck();
  }

  copyRewrite(): void {
    navigator.clipboard.writeText(this.rewriteEditText).then(() => {
      this.snack.open('Copied to clipboard', 'OK', { duration: 1500 });
    });
  }

  acceptRewrite(accepted: boolean): void {
    if (!this.claimRewrite) return;
    const editedText = accepted ? this.rewriteEditText : undefined;
    this.denialSvc.acceptRewrite(this.claimRewrite.id, accepted, editedText).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.claimRewrite) {
          this.claimRewrite = {
            ...this.claimRewrite,
            accepted,
            rewritten_text: editedText ?? this.claimRewrite.rewritten_text,
          };
        }
        this.snack.open(accepted ? 'Rewrite accepted & saved' : 'Rewrite discarded', 'OK', { duration: 2000 });
        this.cdr.markForCheck();
      },
    });
  }

  submitForApproval(): void {
    this.approvalLoading = true;
    this.cdr.markForCheck();
    this.denialSvc.submitForApproval(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: record => {
        this.approvalRecord = record;
        this.approvalLoading = false;
        this.snack.open('Submitted for manager review', 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.approvalLoading = false;
        const msg = err?.error?.message || 'Failed to submit for review';
        this.snack.open(msg, 'OK', { duration: 3500 });
        this.cdr.markForCheck();
      },
    });
  }

  recallApproval(): void {
    if (!this.approvalRecord) return;
    this.denialSvc.recallApproval(this.approvalRecord.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.approvalRecord) this.approvalRecord = { ...this.approvalRecord, status: 'recalled' };
        this.snack.open('Submission recalled', 'OK', { duration: 2000 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Failed to recall', 'OK', { duration: 3000 }),
    });
  }

  reviewApproval(decision: 'approved' | 'rejected'): void {
    if (!this.approvalRecord) return;
    this.approvalLoading = true;
    this.cdr.markForCheck();
    this.denialSvc.reviewApproval(this.approvalRecord.id, decision, this.approvalReviewerNotes || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (this.approvalRecord) this.approvalRecord = { ...this.approvalRecord, status: decision };
          this.approvalLoading = false;
          this.showApprovalRejectForm = false;
          this.snack.open(decision === 'approved' ? 'Resubmission approved' : 'Resubmission rejected', 'OK', { duration: 2500 });
          this.cdr.markForCheck();
        },
        error: () => {
          this.approvalLoading = false;
          this.snack.open('Failed to record decision', 'OK', { duration: 3000 });
          this.cdr.markForCheck();
        },
      });
  }

  get pkgAllChecked(): boolean {
    return !!this.pkg?.checklist?.length && this.pkg.checklist.every(item => item.checked);
  }

  get narrativeScoreColor(): string {
    if (!this.narrativeScore) return '#9e9e9e';
    if (this.narrativeScore.score >= 80) return '#4caf50';
    if (this.narrativeScore.score >= 60) return '#ff9800';
    return '#f44336';
  }

  private loadCarcDescriptions(claim: ClaimDetail): void {
    const codes = new Set<string>();
    if (claim.reasonCode) codes.add(claim.reasonCode);
    (claim.lineItems ?? []).forEach(li => { if (li.reasonCode) codes.add(li.reasonCode); });
    codes.forEach(code => {
      if (this.carcDescMap[code] || this.carcLoadingCodes.has(code)) return;
      this.carcLoadingCodes.add(code);
      this.cdr.markForCheck();
      this.denialSvc.getCarcDetail(code).pipe(takeUntil(this.destroy$)).subscribe({
        next: g => {
          this.carcLoadingCodes.delete(code);
          if (g) {
            this.carcDescMap = { ...this.carcDescMap, [code]: g.description ? `${code}: ${g.description}` : code };
          } else {
            this.carcDescMap = { ...this.carcDescMap, [code]: code };
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.carcLoadingCodes.delete(code);
          this.carcDescMap = { ...this.carcDescMap, [code]: code };
          this.cdr.markForCheck();
        },
      });
    });
  }

  onStepToggle(step: RemediationStep, completed: boolean): void {
    const userId = this.userStore.getUser()?.email ?? 'unknown';
    step.completed = completed;
    if (this.showIncompleteHighlight && !this.requiredStepsIncomplete) {
      this.showIncompleteHighlight = false;
    }
    this.cdr.markForCheck();
    this.remSvc.saveStepCompletion({ claimId: this.claimId, stepId: step.id, completed, userId })
      .subscribe({
        error: () => {
          step.completed = !completed;
          this.snack.open('Failed to save step completion', 'OK', { duration: 3000 });
        },
      });
  }

  get requiredStepsIncomplete(): boolean {
    return (this.claimRemediation?.steps ?? []).some(s => s.required && !s.completed);
  }

  openNoteForm(stepId: number | null = null, stepTitle = ''): void {
    this.noteStepId = stepId;
    this.noteStepTitle = stepTitle;
    this.noteText = '';
    this.noteType = 'follow-up';
    this.editingNoteId = null;
    this.noteContactMethod = '';
    this.noteContactPerson = '';
    this.notePhoneNumber = '';
    this.noteCaseNumber = '';
    this.noteReferenceNumber = '';
    this.noteActionTaken = '';
    this.noteAppealLevel = '';
    this.showNoteForm = true;
    this.showFeedbackForm = false;
  }

  openEditNote(note: ClaimStepNote): void {
    this.editingNoteId = note.id;
    this.noteText = note.note_text;
    this.noteType = note.note_type;
    this.noteStepTitle = note.step_title ?? '';
    this.noteContactMethod = note.contact_method ?? '';
    this.noteContactPerson = note.contact_person ?? '';
    this.notePhoneNumber = note.phone_number ?? '';
    this.noteCaseNumber = note.case_number ?? '';
    this.noteReferenceNumber = note.reference_number ?? '';
    this.noteActionTaken = note.action_taken ?? '';
    this.noteAppealLevel = note.appeal_level ?? '';
    this.showNoteForm = true;
    this.showFeedbackForm = false;
  }

  submitNote(): void {
    if (!this.noteText.trim()) return;

    const structuredPayload = {
      noteText: this.noteText.trim(),
      noteType: this.noteType,
      contactMethod: this.noteContactMethod || undefined,
      contactPerson: this.noteContactPerson || undefined,
      phoneNumber: this.notePhoneNumber || undefined,
      caseNumber: this.noteCaseNumber || undefined,
      referenceNumber: this.noteReferenceNumber || undefined,
      actionTaken: this.noteActionTaken || undefined,
      appealLevel: this.noteAppealLevel || undefined,
    };

    const onSuccess = () => {
      this.showNoteForm = false;
      this.editingNoteId = null;
      this.cdr.markForCheck();
      this.loadNotes();
      this.snack.open('Note saved', 'OK', { duration: 2000 });
    };
    const onError = () => this.snack.open('Failed to save note', 'OK', { duration: 3000 });

    if (this.editingNoteId !== null) {
      this.remSvc.updateNote(this.editingNoteId, structuredPayload).subscribe({ next: onSuccess, error: onError });
    } else {
      const userId = this.userStore.getUser()?.email ?? 'unknown';
      this.remSvc.addNote({
        claimId: this.claimId,
        stepId: this.noteStepId,
        authorUserId: userId,
        ...structuredPayload,
      }).subscribe({ next: onSuccess, error: onError });
    }
  }

  deleteNote(note: ClaimStepNote): void {
    this.remSvc.deleteNote(note.id).subscribe({
      next: () => { this.claimNotes = this.claimNotes.filter(n => n.id !== note.id); this.cdr.markForCheck(); },
      error: () => { this.snack.open('Failed to delete note', 'OK', { duration: 3000 }); },
    });
  }

  notesForStep(stepId: number | null): ClaimStepNote[] {
    return this.claimNotes.filter(n => n.step_id === stepId);
  }

  openFeedbackForm(stepId: number | null = null, stepTitle = ''): void {
    this.feedbackStepId = stepId;
    this.feedbackStepTitle = stepTitle;
    this.feedbackText = '';
    this.showFeedbackForm = true;
    this.showNoteForm = false;
  }

  submitFeedback(): void {
    if (!this.feedbackText.trim() || !this.claimRemediation) return;
    const userId = this.userStore.getUser()?.email ?? 'unknown';
    this.remSvc.submitFeedback({
      setId: this.claimRemediation.set_id,
      stepId: this.feedbackStepId,
      claimId: this.claimId,
      authorUserId: userId,
      suggestion: this.feedbackText.trim(),
    }).subscribe({
      next: () => {
        this.feedbackText = '';
        this.showFeedbackForm = false;
        this.snack.open('Feedback submitted - thank you!', 'OK', { duration: 3000 });
      },
      error: () => { this.snack.open('Failed to submit feedback', 'OK', { duration: 3000 }); },
    });
  }

  private attemptClose(closeFn: () => void): void {
    if (!this.closeReason) {
      this.snack.open('Select a close reason before closing.', 'OK', { duration: 3000 });
      return;
    }
    const isActualManager = this.isManager;
    if (this.requiredStepsIncomplete && !isActualManager) {
      this.showIncompleteHighlight = true;
      this.activeWorkspaceTab = 0;
      this.cdr.markForCheck();
      this.snack.open(
        'Complete all required steps (highlighted below) before closing.',
        'OK',
        { duration: 5000 },
      );
      return;
    }
    this.showIncompleteHighlight = false;
    closeFn();
  }

  saveClose(): void {
    this.attemptClose(() => {
      this.loading = true;

      // Calculate progress from completed steps
      const steps = this.claimRemediation?.steps ?? [];
      const progress = steps.length
        ? Math.round((steps.filter(s => s.completed).length / steps.length) * 100)
        : 100;

      this.svc.closeClaim(this.claimId, progress, 'Closed', this.closeReason).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.snack.open('Claim closed successfully', 'OK', { duration: 2000 });
          const roleSegment = this.isManager ? 'manager' : 'ar-specialist';
          this.router.navigate(['../', roleSegment], { relativeTo: this.route });
          this.loading = false;
        },
        error: () => {
          this.snack.open('Failed to close claim', 'OK', { duration: 3000 });
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  escalate(): void {
    const ref = this.dialog.open(ClaimActionDialogComponent, {
      width: '460px',
      data: { action: 'Escalate' },
    });
    ref.afterClosed().subscribe(result => {
      if (result !== null && result !== undefined) {
        this.loading = true;
        const reason = typeof result === 'string' && result !== 'confirm' ? result : undefined;
        this.svc.escalateClaim(this.claimId, reason).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.snack.open('Claim escalated to manager', 'OK', { duration: 2000 });
            const roleSegment = this.isManager ? 'manager' : 'ar-specialist';
            this.router.navigate(['../', roleSegment], { relativeTo: this.route });
            this.loading = false;
          },
          error: () => {
            this.snack.open('Failed to escalate claim', 'OK', { duration: 3000 });
            this.loading = false;
            this.cdr.markForCheck();
          },
        });
      }
    });
  }

  requestTransactionalAdjustment(): void {
    const ref = this.dialog.open(TransactionalAdjustmentDialogComponent, { width: '480px' });
    ref.afterClosed().subscribe((result: TransactionalAdjustmentResult | undefined) => {
      if (!result) return;
      this.loading = true;
      this.denialSvc.submitForApproval(this.claimId, undefined, {
        type: 'transactional_adjustment',
        adjustment_amount: result.adjustment_amount,
        adjustment_code: result.adjustment_code,
        notes: result.notes,
      }).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.snack.open('Adjustment request submitted for manager approval', 'OK', { duration: 3000 });
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.snack.open('Failed to submit adjustment request', 'OK', { duration: 3000 });
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  assignToMe(): void {
    this.loading = true;
    this.svc.assignClaim(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.snack.open('Claim assigned to you', 'OK', { duration: 2000 });
        if (this.claim) {
          const u = this.userStore.getUser();
          const displayName = u ? `${u.firstName} ${u.lastName}`.trim() : 'You';
          this.claim = { ...this.claim, assignedUserName: displayName };
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snack.open('Failed to assign claim', 'OK', { duration: 3000 });
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  closeAdjudicated(): void {
    this.attemptClose(() => {
      this.loading = true;
      const steps = this.claimRemediation?.steps ?? [];
      const progress = steps.length
        ? Math.round((steps.filter(s => s.completed).length / steps.length) * 100)
        : 100;

      this.svc.closeClaimAdjudicated(this.claimId, progress, this.closeReason).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.snack.open('Claim closed as fully adjudicated', 'OK', { duration: 2000 });
          const roleSegment = this.isManager ? 'manager' : 'ar-specialist';
          this.router.navigate(['../', roleSegment], { relativeTo: this.route });
          this.loading = false;
        },
        error: () => {
          this.snack.open('Failed to close claim', 'OK', { duration: 3000 });
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  unassignClaim(): void {
    this.loading = true;
    this.svc.unassignClaim(this.claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.snack.open('Claim unassigned', 'OK', { duration: 2000 });
        if (this.claim) {
          this.claim = { ...this.claim, assignedUserName: null, assignedTo: null };
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snack.open('Failed to unassign claim', 'OK', { duration: 3000 });
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get isAssignedToMe(): boolean {
    const userId = this.userStore.getUser()?.userId;
    return !!userId && (this.claim?.assignedTo === userId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.claimCtx.clear();
    this.masterClaimSvc.clearCache();
  }

  openDocumentsDialog(docType?: 'eob' | 'claim-form'): void {
    this.dialog.open(ClaimDocumentDialogComponent, {
      width: '780px',
      data: { title: 'Claim Documents', docType, claimId: this.claim?.id, narrative: this.claim?.notes || '' },
    });
  }

  onWorkspaceTabChange(index: number): void {
    this.activeWorkspaceTab = index;
    this.cdr.markForCheck();
  }

  trackByStepId(_: number, step: RemediationStep): number { return step.id; }
  trackByNoteId(_: number, note: ClaimStepNote): number { return note.id; }
}
