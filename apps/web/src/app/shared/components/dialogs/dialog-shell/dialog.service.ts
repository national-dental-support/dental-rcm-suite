import { Injectable, TemplateRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { DialogComponent } from './dialog-shell.component';
import { RpDialogConfig, RpDialogResult } from './dialog.tokens';

@Injectable({ providedIn: 'root' })
export class RpDialogService {
  constructor(private dialog: MatDialog) {}

  open<TPayload = unknown, TResult = unknown>(
    cfg: RpDialogConfig<TPayload>
  ): Observable<RpDialogResult<TResult> | undefined> {
    const ref = this.dialog.open<DialogComponent<TPayload, TResult>, RpDialogConfig<TPayload>, RpDialogResult<TResult>>(
      DialogComponent,
      {
        width: cfg.width ?? 'min(560px, 92vw)',
        maxWidth: cfg.maxWidth ?? '92vw',
        disableClose: !!cfg.disableClose,
        autoFocus: cfg.autoFocus ?? true,
        data: cfg,
        panelClass: ['rp-dialog-panel'], // optional global tweaks
      }
    );

    return ref.afterClosed();
  }

  confirm(message: string, title = 'Confirm'): Observable<boolean> {
    return this.open({
      title,
      message,
      tone: 'default',
      icon: 'help',
      actions: { cancelText: 'Cancel', primaryText: 'Confirm', primaryColor: 'primary' },
    }).pipe(map(r => r?.action === 'primary'));
  }

  dangerConfirm(message: string, title = 'Are you sure?'): Observable<boolean> {
    return this.open({
      title,
      message,
      tone: 'danger',
      icon: 'warning',
      actions: { cancelText: 'Cancel', primaryText: 'Delete', primaryColor: 'warn' },
      disableClose: false,
    }).pipe(map(r => r?.action === 'primary'));
  }

  // Template-driven custom dialog (fastest way to reuse in-place content)
  openTemplate<TPayload = unknown, TResult = unknown>(opts: {
    title: string;
    template: TemplateRef<any>;
    payload?: TPayload;
    tone?: RpDialogConfig['tone'];
    icon?: string;
    primaryText?: string;
    primaryColor?: 'primary' | 'accent' | 'warn';
    disableClose?: boolean;
    primaryDisabled?: () => boolean;
  }): Observable<RpDialogResult<TResult> | undefined> {
    return this.open<TPayload, TResult>({
      title: opts.title,
      tone: opts.tone,
      icon: opts.icon,
      contentTemplate: opts.template,
      payload: opts.payload,
      actions: {
        cancelText: 'Cancel',
        primaryText: opts.primaryText ?? 'Save',
        primaryColor: opts.primaryColor ?? 'primary',
      },
      disableClose: opts.disableClose,
      primaryDisabled: opts.primaryDisabled,
    });
  }
}
