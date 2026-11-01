import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

@Component({
    selector: 'app-confirm-dialog',
    template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">
        {{ data.cancelText || 'Cancel' }}
      </button>
      <button
        mat-raised-button
        [color]="data.destructive ? 'warn' : 'primary'"
        [mat-dialog-close]="true"
      >
        {{ data.confirmText || 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
    styles: [
        `
    mat-dialog-content p {
      color: rgba(0, 0, 0, 0.7);
      font-size: 14px;
      line-height: 1.5;
      margin: 0;
    }
    mat-dialog-actions {
      padding: 8px 0 0;
    }
    `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SharedConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SharedConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
  ) {}
}

export function openConfirmDialog(
  dialog: MatDialog,
  data: ConfirmDialogData,
): Observable<boolean> {
  const ref = dialog.open(SharedConfirmDialogComponent, {
    width: '420px',
    data,
  });
  return ref.afterClosed().pipe(map((result) => result === true));
}
