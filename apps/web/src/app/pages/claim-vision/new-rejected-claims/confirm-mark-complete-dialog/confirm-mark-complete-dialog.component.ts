import {ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface NewConfirmMarkCompleteData {
  patientName: string;
}

@Component({
    selector: 'app-confirm-mark-complete-dialog',
    templateUrl: './confirm-mark-complete-dialog.component.html',
    styleUrls: ['./confirm-mark-complete-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class NewConfirmMarkCompleteDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<NewConfirmMarkCompleteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NewConfirmMarkCompleteData
  ) {}

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
