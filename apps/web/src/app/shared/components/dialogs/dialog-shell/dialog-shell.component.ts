import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RpDialogConfig, RpDialogResult, RpDialogTone } from './dialog.tokens';

@Component({
    selector: 'app-dialog-shell',
    templateUrl: './dialog-shell.component.html',
    styleUrls: ['./dialog-shell.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DialogComponent<TPayload = unknown, TResult = unknown> {
  saving = false;
  errorMessage: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<DialogComponent<TPayload, TResult>, RpDialogResult<TResult>>,
    @Inject(MAT_DIALOG_DATA) public cfg: RpDialogConfig<TPayload>
  ) {}

  tone(): RpDialogTone {
    return this.cfg.tone ?? 'default';
  }

  closeX(): void {
    this.dialogRef.close({ action: 'close' });
  }

  click(action: 'cancel' | 'secondary' | 'primary'): void {
    if (this.saving) return;

    if (action === 'cancel') {
      this.dialogRef.close({ action: 'cancel' });
      return;
    }

    this.dialogRef.close({ action });
  }

  /** Use this from async callers to lock the dialog */
  setSaving(isSaving: boolean): void {
    this.saving = isSaving;
    if (isSaving) this.dialogRef.disableClose = true;
    else this.dialogRef.disableClose = !!this.cfg.disableClose;
  }

  setError(message: string | null): void {
    this.errorMessage = message;
  }
}
