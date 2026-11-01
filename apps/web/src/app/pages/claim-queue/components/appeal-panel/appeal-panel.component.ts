import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component,
  Input, OnChanges, SimpleChanges,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  DenialManagementService,
  AppealLetterTemplate,
  ClaimAppeal,
} from '../../../../core/services/denial-management.service';

@Component({
    selector: 'app-appeal-panel',
    templateUrl: './appeal-panel.component.html',
    styleUrls: ['./appeal-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class AppealPanelComponent implements OnChanges {
  @Input() claimId = '';
  @Input() denialCode = '';

  appeals: ClaimAppeal[] = [];
  templates: AppealLetterTemplate[] = [];

  loading = false;
  generating = false;

  // Generate form state
  showGenerateForm = false;
  selectedTemplateId: number | null = null;
  customNotes = '';

  // Generated letter preview
  generatedLetter: string | null = null;
  generatedAppealId: number | null = null;

  // Status update state
  updatingId: number | null = null;

  constructor(
    private svc: DenialManagementService,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['claimId'] && this.claimId) {
      this.loadAppeals();
      this.loadTemplates();
    }
  }

  loadAppeals(): void {
    this.loading = true;
    this.svc.listClaimAppeals(this.claimId).subscribe({
      next: (appeals) => {
        this.appeals = appeals;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadTemplates(): void {
    this.svc.listAppealTemplates().subscribe({
      next: (templates) => {
        this.templates = templates;
        this.cdr.markForCheck();
      },
    });
  }

  openGenerateForm(): void {
    this.showGenerateForm = true;
    this.generatedLetter = null;
    this.generatedAppealId = null;
    this.customNotes = '';

    // Auto-select: find first active template whose carc_codes includes the claim's denial code
    this.selectedTemplateId = this.autoSelectTemplate();
    this.cdr.markForCheck();
  }

  private autoSelectTemplate(): number | null {
    if (!this.denialCode || !this.templates.length) return null;
    const code = this.denialCode.trim().toUpperCase();
    const match = this.templates.find(
      t => t.carc_codes && t.carc_codes.toUpperCase().split(',').map(s => s.trim()).includes(code)
    );
    return match?.id ?? null;
  }

  cancelGenerate(): void {
    this.showGenerateForm = false;
    this.generatedLetter = null;
    this.cdr.markForCheck();
  }

  generate(): void {
    this.generating = true;
    const tid = this.selectedTemplateId ?? undefined;
    const notes = this.customNotes.trim() || undefined;

    this.svc.generateAppealLetter(this.claimId, tid, notes).subscribe({
      next: ({ appeal, letter }) => {
        this.generatedLetter = letter;
        this.generatedAppealId = appeal.id;
        this.generating = false;
        this.loadAppeals();
        this.cdr.markForCheck();
      },
      error: () => {
        this.generating = false;
        this.snack.open('Failed to generate appeal letter.', 'Dismiss', { duration: 4000 });
        this.cdr.markForCheck();
      },
    });
  }

  generateAi(): void {
    this.generating = true;
    const notes = this.customNotes.trim() || undefined;

    this.svc.generateAiAppealLetter(this.claimId, notes).subscribe({
      next: ({ appeal, letter }) => {
        this.generatedLetter = letter;
        this.generatedAppealId = appeal.id;
        this.generating = false;
        this.loadAppeals();
        this.snack.open('AI appeal letter generated', 'OK', { duration: 3000 });
        this.cdr.markForCheck();
      },
      error: () => {
        this.generating = false;
        this.snack.open('AI generation failed \u2014 try template instead.', 'Dismiss', { duration: 4000 });
        this.cdr.markForCheck();
      },
    });
  }

  copyLetter(): void {
    if (!this.generatedLetter) return;
    navigator.clipboard.writeText(this.generatedLetter).then(() => {
      this.snack.open('Letter copied to clipboard.', '', { duration: 2000 });
    });
  }

  printLetter(): void {
    if (!this.generatedLetter) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><body><pre style="font-family:serif;white-space:pre-wrap;padding:2rem">${
      this.generatedLetter.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</pre></body></html>`);
    win.document.close();
    win.print();
  }

  doneWithLetter(): void {
    this.showGenerateForm = false;
    this.generatedLetter = null;
    this.generatedAppealId = null;
    this.cdr.markForCheck();
  }

  updateStatus(appeal: ClaimAppeal, status: ClaimAppeal['status']): void {
    this.updatingId = appeal.id;
    this.svc.updateAppealStatus(appeal.id, status).subscribe({
      next: () => {
        appeal.status = status;
        this.updatingId = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.updatingId = null;
        this.snack.open('Failed to update status.', 'Dismiss', { duration: 4000 });
        this.cdr.markForCheck();
      },
    });
  }

  isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }

  statusLabel(status: ClaimAppeal['status']): string {
    const map: Record<string, string> = {
      draft: 'Draft',
      submitted: 'Submitted',
      won: 'Won',
      lost: 'Lost',
      pending: 'Pending',
    };
    return map[status] ?? status;
  }

  trackById(_: number, a: ClaimAppeal) { return a.id; }
}
