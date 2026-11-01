import { Component, Inject } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    template: `
    <h2 mat-dialog-title>{{ data.action }}</h2>
    <div mat-dialog-content>
      <p>{{ data.action === 'Escalate' ? 'Enter the reason for escalation:' : 'Add an optional message:' }}</p>
      <textarea rows="4" [formControl]="note"
        [placeholder]="data.action === 'Escalate' ? 'e.g. Underpayment, coding dispute, timely filing issue, authorization required...' : ''">
      </textarea>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancel</button>
      <button mat-raised-button color="primary" (click)="ref.close(note.value)">
        {{ data.action === 'Escalate' ? 'Escalate' : 'Confirm' }}
      </button>
    </div>
  `,
    styles: [`
    textarea { width: 95%; border-radius: 8px; border: 1px solid #e5e7eb; padding: 10px; font-family: inherit; font-size: 14px; resize: vertical; }
    p { margin: 0 0 8px; color: #374151; font-size: 14px; }
  `],
    standalone: false
})
export class ClaimActionDialogComponent {
  note = this.fb.control('');
  constructor(@Inject(MAT_DIALOG_DATA) public data: { action: string }, public ref: MatDialogRef<ClaimActionDialogComponent>, private fb: FormBuilder) {}
}

export interface TransactionalAdjustmentResult {
  adjustment_amount: number;
  adjustment_code: string;
  notes: string;
}

@Component({
  template: `
    <h2 mat-dialog-title>Request Transactional Adjustment</h2>
    <div mat-dialog-content>
      <p class="adj-hint">Submit an adjustment request for manager approval.</p>
      <label class="adj-label">Adjustment Amount ($)</label>
      <input class="adj-input" type="number" min="0.01" step="0.01" (input)="amount = +$any($event.target).value" placeholder="0.00">
      <label class="adj-label">Adjustment Code</label>
      <select class="adj-input" (change)="code = $any($event.target).value">
        <option value="">-- Select code --</option>
        <option value="CO-45">CO-45 \u2014 Charge exceeds fee schedule</option>
        <option value="CO-97">CO-97 \u2014 Payment included in another claim</option>
        <option value="PR-1">PR-1 \u2014 Deductible amount</option>
        <option value="PR-2">PR-2 \u2014 Coinsurance amount</option>
        <option value="PI-5">PI-5 \u2014 Professional courtesy adjustment</option>
        <option value="OA-23">OA-23 \u2014 Maximum contractual amount</option>
        <option value="OTHER">Other</option>
      </select>
      <label class="adj-label">Notes (optional)</label>
      <textarea class="adj-input" rows="3" (input)="notes = $any($event.target).value" placeholder="Reason for adjustment..."></textarea>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancel</button>
      <button mat-raised-button color="primary" type="button" [disabled]="!amount || !code" (click)="submit()">Submit Request</button>
    </div>
  `,
  styles: [`
    .adj-hint { margin: 0 0 12px; color: #6b7280; font-size: 14px; }
    .adj-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin: 8px 0 4px; }
    .adj-input { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; font-size: 14px; }
    select.adj-input { background: #fff; }
  `],
  standalone: false,
})
export class TransactionalAdjustmentDialogComponent {
  amount: number | null = null;
  code = '';
  notes = '';

  constructor(public ref: MatDialogRef<TransactionalAdjustmentDialogComponent>) {}

  submit(): void {
    if (!this.amount || !this.code) return;
    this.ref.close({ adjustment_amount: this.amount, adjustment_code: this.code, notes: this.notes } as TransactionalAdjustmentResult);
  }
}
