import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface EraPostingConfirmDialogData {
  eobCount: number;
  bankAccountName?: string;
}

@Component({
    selector: 'app-era-posting-confirm-dialog',
    templateUrl: './era-posting-confirm-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class EraPostingConfirmDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: EraPostingConfirmDialogData,
    private dialogRef: MatDialogRef<EraPostingConfirmDialogComponent>
  ) {}

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
