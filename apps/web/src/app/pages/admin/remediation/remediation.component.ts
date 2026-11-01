import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  RemediationService,
  RemediationStepSet,
  RemediationStep,
  RemediationFeedback,
  StepSetHistory,
  SOPRecommendation,
  SOPEffectivenessRow,
} from '../../../core/services/remediation.service';
import { environment } from '../../../../environments/environment';

import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';

interface ReferenceEntry {
  id?: number;
  term: string;
  definition: string;
  category: string | null;
}

interface EditableChecklist {
  item_text: string;
}

interface EditableStep {
  id?: number;
  sort_order: number;
  title: string;
  body: string;
  required: boolean;
  checklist: EditableChecklist[];
}

@Component({
    selector: 'rp-remediation-admin',
    templateUrl: './remediation.component.html',
    styleUrls: ['./remediation.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RemediationAdminComponent implements OnInit {
  // -- State ------------------------------------------------------------------
  loading = false;
  saving = false;

  // SOP Library tab
  sets: RemediationStepSet[] = [];
  allSets: RemediationStepSet[] = [];          // full overview list
  allSetsLoading = false;
  showAllSets = true;                          // overview vs editor toggle
  reasonCodes: string[] = [];
  selectedReasonCode = '';
  selectedRole: 'ar-specialist' | 'manager' = 'ar-specialist';
  activeSet: RemediationStepSet | null = null;
  editingSteps: EditableStep[] = [];
  historyEntries: StepSetHistory[] = [];
  historyOpen = false;
  historySelectedVersion: StepSetHistory | null = null;
  newCodeInput = '';
  showNewCodeInput = false;
  allSetsColumns: AdvancedTableColumnConfig[] = [];

  // Feedback tab
  feedbackList: RemediationFeedback[] = [];
  feedbackStatusFilter = 'pending';
  feedbackDrawer: RemediationFeedback | null = null;
  reviewNote = '';
  feedbackColumns: AdvancedTableColumnConfig[] = [];

  // Recommendations tab
  recsLoading = false;
  recommendations: SOPRecommendation[] = [];
  effectiveness: SOPEffectivenessRow[] = [];

  // -- Reference Library tab (#114) ---------------------------------------
  refEntries: ReferenceEntry[] = [];
  refCategories: string[] = [];
  refLoading = false;
  refSaving = false;
  refSearchText = '';
  refCategoryFilter = '';
  refPageSize = 25;
  refPageIndex = 0;
  refTotal = 0;
  showRefEditor = false;
  editingRef: ReferenceEntry = this.emptyRef();
  private readonly refBase = `${environment.server.baseUrl}/admin/reference-library`;

  constructor(
    private svc: RemediationService,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: RpDialogService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.feedbackColumns = this.buildFeedbackColumns();
    this.allSetsColumns = this.buildAllSetsColumns();
    this.loadReasonCodes();
    this.loadAllSets();
    this.loadFeedback();
    this.loadRecommendations();
    this.loadRefEntries();
    this.loadRefCategories();

    // Deep-link: ?code=CO50&role=ar-specialist jumps straight into the editor
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const role = params.get('role') as 'ar-specialist' | 'manager' | null;
    if (code) {
      this.selectedReasonCode = code.toUpperCase();
      if (role === 'manager') this.selectedRole = 'manager';
      this.showAllSets = false;
      this.loadSetForCode();
    }
  }

  goBack(): void {
    this.router.navigate(['/app/admin']);
  }

  // -- Reference Library (#114) ------------------------------------------

  private emptyRef(): ReferenceEntry {
    return { term: '', definition: '', category: null };
  }

  loadRefEntries(): void {
    this.refLoading = true;
    let params = new HttpParams()
      .set('limit', String(this.refPageSize))
      .set('offset', String(this.refPageIndex * this.refPageSize));
    if (this.refSearchText.trim()) params = params.set('q', this.refSearchText.trim());
    if (this.refCategoryFilter) params = params.set('category', this.refCategoryFilter);

    this.http
      .get<{ data: ReferenceEntry[]; total: number }>(this.refBase, { params })
      .subscribe({
        next: (res) => {
          this.refEntries = res.data ?? [];
          this.refTotal = res.total ?? 0;
          this.refLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.refLoading = false;
          this.snack.open('Failed to load reference library', 'Dismiss', { duration: 3000 });
          this.cdr.markForCheck();
        },
      });
  }

  loadRefCategories(): void {
    this.http.get<{ data: string[] }>(`${this.refBase}/categories`).subscribe({
      next: (res) => {
        this.refCategories = res.data ?? [];
        this.cdr.markForCheck();
      },
    });
  }

  onRefSearchChange(value: string): void {
    this.refSearchText = value;
    this.refPageIndex = 0;
    this.loadRefEntries();
  }

  onRefCategoryFilter(value: string): void {
    this.refCategoryFilter = value;
    this.refPageIndex = 0;
    this.loadRefEntries();
  }

  prevRefPage(): void {
    if (this.refPageIndex === 0) return;
    this.refPageIndex--;
    this.loadRefEntries();
  }

  nextRefPage(): void {
    if (!this.hasNextRefPage) return;
    this.refPageIndex++;
    this.loadRefEntries();
  }

  get refPageLabel(): string {
    if (this.refTotal === 0) return '0 of 0';
    const from = this.refPageIndex * this.refPageSize + 1;
    const to = Math.min((this.refPageIndex + 1) * this.refPageSize, this.refTotal);
    return `${from}\u2013${to} of ${this.refTotal}`;
  }

  get hasNextRefPage(): boolean {
    return (this.refPageIndex + 1) * this.refPageSize < this.refTotal;
  }

  newRefEntry(): void {
    this.editingRef = this.emptyRef();
    this.showRefEditor = true;
  }

  editRefEntry(r: ReferenceEntry): void {
    this.editingRef = { ...r };
    this.showRefEditor = true;
  }

  cancelRefEdit(): void {
    this.showRefEditor = false;
    this.editingRef = this.emptyRef();
  }

  saveRefEntry(): void {
    if (!this.editingRef.term?.trim() || !this.editingRef.definition?.trim()) {
      this.snack.open('Term and definition are required', 'Dismiss', { duration: 3000 });
      return;
    }
    this.refSaving = true;
    const payload = { ...this.editingRef };
    const req$ = this.editingRef.id
      ? this.http.put(`${this.refBase}/${this.editingRef.id}`, payload)
      : this.http.post(this.refBase, payload);

    req$.subscribe({
      next: () => {
        this.refSaving = false;
        this.showRefEditor = false;
        this.snack.open('Reference entry saved', 'OK', { duration: 2500 });
        this.loadRefEntries();
        this.loadRefCategories();
      },
      error: (err) => {
        this.refSaving = false;
        this.snack.open(err?.error?.message || 'Save failed', 'Dismiss', { duration: 3500 });
        this.cdr.markForCheck();
      },
    });
  }

  deleteRefEntry(r: ReferenceEntry): void {
    if (!r.id) return;
    if (!confirm(`Delete "${r.term}"?`)) return;
    this.http.delete(`${this.refBase}/${r.id}`).subscribe({
      next: () => {
        this.snack.open('Entry deleted', 'OK', { duration: 2500 });
        this.loadRefEntries();
      },
      error: () => this.snack.open('Delete failed', 'Dismiss', { duration: 3000 }),
    });
  }

  trackByRefId(_idx: number, r: ReferenceEntry): number | string {
    return r.id ?? _idx;
  }

  // -- SOP Library -----------------------------------------------------------

  loadAllSets(): void {
    this.allSetsLoading = true;
    this.cdr.markForCheck();
    this.svc.listSets().subscribe({
      next: (sets) => {
        this.allSets = sets;
        this.allSetsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.allSetsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  editSetFromOverview(set: RemediationStepSet): void {
    this.selectedReasonCode = set.reason_code;
    this.selectedRole = set.role as 'ar-specialist' | 'manager';
    this.showAllSets = false;
    this.historyOpen = false;
    this.cdr.markForCheck();
    this.loadSetForCode();
  }

  newSetFromOverview(): void {
    this.showAllSets = false;
    this.activeSet = null;
    this.editingSteps = [this._blankStep(1)];
    this.selectedReasonCode = '';
    this.selectedRole = 'ar-specialist';
    this.cdr.markForCheck();
  }

  deleteSet(set: RemediationStepSet): void {
    this.dialog
      .dangerConfirm(
        `Delete SOP set for "${set.reason_code}" (${set.role}) v${set.version}? This will permanently remove all steps, history, and feedback for this set.`,
        'Delete Step Set'
      )
      .subscribe(ok => {
        if (!ok) return;
        this.svc.deleteSet(set.id).subscribe({
          next: () => {
            this.snack.open('Step set deleted', 'OK', { duration: 3000 });
            // If we were editing this set, clear the editor
            if (this.activeSet?.id === set.id) {
              this.activeSet = null;
              this.editingSteps = [];
            }
            this.loadAllSets();
            this.cdr.markForCheck();
          },
          error: () => {
            this.snack.open('Delete failed', 'OK', { duration: 3000 });
          },
        });
      });
  }

  loadReasonCodes(): void {
    this.svc.listReasonCodes().subscribe({
      next: (codes) => {
        this.reasonCodes = ['DEFAULT', ...codes.filter((c) => c !== 'DEFAULT')];
        this.cdr.markForCheck();
      },
    });
  }

  onReasonCodeChange(code: string): void {
    this.selectedReasonCode = code;
    this.historyOpen = false;
    this.showAllSets = false;
    this.loadSetForCode();
  }

  onRoleChange(role: 'ar-specialist' | 'manager'): void {
    this.selectedRole = role;
    this.historyOpen = false;
    this.loadSetForCode();
  }

  loadSetForCode(): void {
    if (!this.selectedReasonCode) return;
    this.loading = true;
    this.cdr.markForCheck();

    this.svc
      .listSets({ reasonCode: this.selectedReasonCode, role: this.selectedRole })
      .pipe(
        switchMap((sets) => {
          // 'active' is the canonical published status set by publishSet().
          // Seeds may have used 'published' - treat both as the active version.
          const active = sets.find((s) => s.status === 'active' || s.status === 'published');
          const draft  = sets.find((s) => s.status === 'draft');
          const target = active ?? draft ?? null;
          return target ? this.svc.getSet(target.id) : of(null);
        }),
      )
      .subscribe({
        next: (full) => {
          if (full) {
            this.activeSet = full;
            this.editingSteps = this._toEditable(full.steps ?? []);
          } else {
            this.activeSet = null;
            this.editingSteps = [];
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  createNewSet(): void {
    if (!this.selectedReasonCode) return;
    this.activeSet = null;
    this.editingSteps = [this._blankStep(1)];
    this.showAllSets = false;
    this.cdr.markForCheck();
  }

  saveSet(): void {
    if (!this.selectedReasonCode) return;
    this.saving = true;
    this.cdr.markForCheck();

    const payload = {
      reason_code: this.selectedReasonCode,
      role: this.selectedRole as string,
      steps: this.editingSteps.map((s) => ({
        title: s.title,
        body: s.body,
        required: s.required,
        checklist: s.checklist.map((c) => c.item_text),
      })),
    };

    const op = this.activeSet
      ? this.svc.updateSet(this.activeSet.id, payload)
      : this.svc.createSet(payload);

    op.subscribe({
      next: (result) => {
        this.snack.open('Saved as draft', 'OK', { duration: 3000 });
        this.saving = false;

        // Reload the set to get DB-assigned IDs
        this.svc.getSet(result.id).subscribe({
          next: (full) => {
            this.activeSet = full;
            this.editingSteps = this._toEditable(full.steps ?? []);
            this.cdr.markForCheck();
          },
        });

        this.loadAllSets();
        this.cdr.markForCheck();
      },
      error: () => {
        this.snack.open('Save failed', 'OK', { duration: 3000 });
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  publishSet(): void {
    if (!this.activeSet) return;
    this.saving = true;
    this.cdr.markForCheck();

    this.svc.publishSet(this.activeSet.id).subscribe({
      next: (result) => {
        this.snack.open(`Published as version ${result.version}`, 'OK', { duration: 3000 });
        this.saving = false;
        this.activeSet = { ...this.activeSet!, status: 'active', version: result.version };
        this.loadAllSets();
        this.cdr.markForCheck();
      },
      error: () => {
        this.snack.open('Publish failed', 'OK', { duration: 3000 });
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  openHistory(): void {
    if (!this.activeSet) return;
    this.historyOpen = true;
    this.svc.getSetHistory(this.activeSet.id).subscribe({
      next: (h) => {
        this.historyEntries = h;
        this.cdr.markForCheck();
      },
    });
  }

  selectHistoryVersion(entry: StepSetHistory): void {
    this.historySelectedVersion = entry;
  }

  getParsedSnapshot(snapshot: string): RemediationStep[] {
    try {
      const parsed = JSON.parse(snapshot);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }

  // Step editing helpers
  addStep(): void {
    this.editingSteps.push(this._blankStep(this.editingSteps.length + 1));
    this.cdr.markForCheck();
  }

  removeStep(index: number): void {
    this.editingSteps.splice(index, 1);
    this.editingSteps.forEach((s, i) => (s.sort_order = i + 1));
    this.cdr.markForCheck();
  }

  moveStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.editingSteps.length) return;
    [this.editingSteps[index], this.editingSteps[target]] = [this.editingSteps[target], this.editingSteps[index]];
    this.editingSteps.forEach((s, i) => (s.sort_order = i + 1));
    this.cdr.markForCheck();
  }

  addChecklistItem(step: EditableStep): void {
    step.checklist.push({ item_text: '' });
    this.cdr.markForCheck();
  }

  removeChecklistItem(step: EditableStep, index: number): void {
    step.checklist.splice(index, 1);
    this.cdr.markForCheck();
  }

  addCustomCode(): void {
    const code = this.newCodeInput.trim().toUpperCase();
    if (code && !this.reasonCodes.includes(code)) {
      this.reasonCodes = [...this.reasonCodes, code];
      this.selectedReasonCode = code;
      this.activeSet = null;
      this.editingSteps = [this._blankStep(1)];
      this.showAllSets = false;
    }
    this.newCodeInput = '';
    this.showNewCodeInput = false;
    this.cdr.markForCheck();
  }

  // -- Feedback Queue --------------------------------------------------------

  loadFeedback(): void {
    this.svc.listFeedback({ status: this.feedbackStatusFilter || undefined }).subscribe({
      next: (list) => {
        this.feedbackList = list;
        this.cdr.markForCheck();
      },
    });
  }

  onFeedbackFilterChange(status: string): void {
    this.feedbackStatusFilter = status;
    this.loadFeedback();
  }

  openFeedbackDrawer(item: RemediationFeedback): void {
    this.feedbackDrawer = item;
    this.reviewNote = '';
    this.cdr.markForCheck();
  }

  closeFeedbackDrawer(): void {
    this.feedbackDrawer = null;
    this.cdr.markForCheck();
  }

  reviewFeedback(status: 'approved' | 'rejected' | 'deferred'): void {
    if (!this.feedbackDrawer) return;

    this.svc
      .reviewFeedback(this.feedbackDrawer.id, {
        status,
        reviewer_note: this.reviewNote || undefined,
      })
      .subscribe({
        next: () => {
          this.snack.open(`Feedback ${status}`, 'OK', { duration: 3000 });

          // capture before closing (we read it below)
          const approvedSetId = status === 'approved' ? this.feedbackDrawer?.set_id : null;
          const approvedReason = this.feedbackDrawer?.reason_code;
          const approvedRole = this.feedbackDrawer?.set_role;

          this.closeFeedbackDrawer();
          this.loadFeedback();

          // If approved and there's an associated set, offer to open the editor
          if (approvedSetId && approvedReason && approvedRole) {
            this.selectedReasonCode = approvedReason;
            this.selectedRole = approvedRole as 'ar-specialist' | 'manager';
            this.loadSetForCode();
          }
        },
        error: () => {
          this.snack.open('Review failed', 'OK', { duration: 3000 });
        },
      });
  }

  // -- Recommendations ------------------------------------------------------

  loadRecommendations(): void {
    this.recsLoading = true;
    this.cdr.markForCheck();

    this.svc.getSOPRecommendations().subscribe({
      next: (recs) => {
        this.recommendations = recs;
        this.recsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.recommendations = [];
        this.recsLoading = false;
        this.cdr.markForCheck();
      },
    });

    this.svc.getSOPEffectiveness().subscribe({
      next: (rows) => {
        this.effectiveness = rows;
        this.cdr.markForCheck();
      },
      error: () => {
        this.effectiveness = [];
        this.cdr.markForCheck();
      },
    });
  }

  recTypeIcon(type: string): string {
    const map: Record<string, string> = {
      low_completion: 'warning',
      high_feedback: 'feedback',
      escalation_spike: 'trending_up',
      slow_resolution: 'schedule',
      missing_sop: 'add_circle',
    };
    return map[type] ?? 'info';
  }

  recTypeLabel(type: string): string {
    const map: Record<string, string> = {
      low_completion: 'Low Completion',
      high_feedback: 'High Feedback',
      escalation_spike: 'Escalation Spike',
      slow_resolution: 'Slow Resolution',
      missing_sop: 'Missing SOP',
    };
    return map[type] ?? type;
  }

  jumpToSOP(reasonCode: string): void {
    this.selectedReasonCode = reasonCode;
    this.loadSetForCode();
  }

  // -- All Sets Columns ------------------------------------------------------

  private buildAllSetsColumns(): AdvancedTableColumnConfig[] {
    return [
      { id: 'reason_code', header: 'Reason Code', type: 'text', sortable: true, filterable: true, width: '130px' },
      { id: 'role', header: 'Role', type: 'text', sortable: true, filterable: true, width: '130px' },
      { id: 'status', header: 'Status', type: 'text', sortable: true, filterable: true, width: '90px' },
      { id: 'version', header: 'Version', type: 'number', sortable: true, width: '80px' },
      { id: 'step_count', header: 'Steps', type: 'number', sortable: true, width: '70px' },
      { id: 'updated_at', header: 'Last Updated', type: 'date', sortable: true, width: '130px' },
      { id: 'updated_by', header: 'Updated By', type: 'text', sortable: true, width: '150px' },
      { id: 'actions', header: '', type: 'text', sortable: false, filterable: false, width: '96px', align: 'end' },
    ];
  }

  // -- Feedback Columns ----------------------------------------------------

  private buildFeedbackColumns(): AdvancedTableColumnConfig[] {
    return [
      { id: 'reason_code', header: 'Code', type: 'text', sortable: true },
      { id: 'claim_id', header: 'Claim', type: 'text', sortable: true },
      { id: 'suggestion', header: 'Suggestion', type: 'text', sortable: false },
      { id: 'submitted_by_name', header: 'Submitted By', type: 'text', sortable: true },
      { id: 'status', header: 'Status', type: 'chip', sortable: true },
      { id: 'created_at', header: 'Date', type: 'date', sortable: true },
    ];
  }

  // -- Helpers ---------------------------------------------------------------

  private _blankStep(order: number): EditableStep {
    return { sort_order: order, title: '', body: '', required: false, checklist: [] };
  }

  private _toEditable(steps: RemediationStep[]): EditableStep[] {
    return steps.map((s) => ({
      id: s.id,
      sort_order: s.sort_order,
      title: s.title,
      body: s.body ?? '',
      required: s.required,
      checklist: s.checklist.map((c) => ({ item_text: c.item_text })),
    }));
  }

  trackByIndex(index: number): number {
    return index;
  }
}
