import { InjectionToken, TemplateRef } from '@angular/core';

export type RpDialogTone = 'default' | 'info' | 'success' | 'warning' | 'danger';

export type RpDialogAction = {
  id: 'cancel' | 'secondary' | 'primary';
  label: string;
  color?: 'primary' | 'accent' | 'warn';
  variant?: 'flat' | 'stroked' | 'basic';
  disabled?: boolean;
  icon?: string; // mat-icon name
  closeOnClick?: boolean; // default true for cancel; false for primary in async flows
};

export type RpDialogConfig<TPayload = unknown> = {
  title: string;
  subtitle?: string;

  tone?: RpDialogTone;
  icon?: string; // optional leading icon in header

  // Content options (choose one)
  message?: string; // for confirm/info
  contentTemplate?: TemplateRef<any>; // for "template-driven" content
  payload?: TPayload; // template context / custom component data

  actions?: {
    cancelText?: string;
    secondary?: Omit<RpDialogAction, 'id'>;
    primaryText?: string;
    primaryColor?: 'primary' | 'accent' | 'warn';
  };

  primaryDisabled?: () => boolean; // disables primary button based on form state

  // Behavior
  disableClose?: boolean;        // prevents ESC/backdrop
  showCloseX?: boolean;          // default true
  width?: string;                // default 560px
  maxWidth?: string;             // default 92vw
  autoFocus?: boolean;           // default true
};

export type RpDialogResult<TResult = unknown> = {
  action: 'cancel' | 'secondary' | 'primary' | 'close';
  data?: TResult;
};

export const RP_DIALOG_CONFIG = new InjectionToken<RpDialogConfig>('RP_DIALOG_CONFIG');
