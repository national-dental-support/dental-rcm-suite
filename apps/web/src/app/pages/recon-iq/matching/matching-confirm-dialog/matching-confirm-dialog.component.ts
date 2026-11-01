import {ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

type PaymentNoEobRow = {
  paymentId: string;
  value: string;
  date: string;
  payer: string;
  type: string;
  amount: string;
};

type EobNoPaymentRow = {
  eobId: string;
  value: string;
  date: string;
  payer: string;
  type: string;
  amount: string;
};

export type MatchingConfirmDialogData = {
  payment: PaymentNoEobRow;
  eob: EobNoPaymentRow;
};

@Component({
    selector: 'app-matching-confirm-dialog',
    templateUrl: './matching-confirm-dialog.component.html',
    styleUrls: ['./matching-confirm-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class MatchingConfirmDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: MatchingConfirmDialogData,
    private dialogRef: MatDialogRef<MatchingConfirmDialogComponent>
  ) {}

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
