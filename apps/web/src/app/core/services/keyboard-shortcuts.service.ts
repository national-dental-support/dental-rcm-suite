import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

export type ShortcutAction =
  | 'command-palette'
  | 'next-claim'
  | 'escalate'
  | 'save-close'
  | 'go-home'
  | 'go-queue';

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService implements OnDestroy {
  private action$ = new Subject<ShortcutAction>();
  private listener: ((e: KeyboardEvent) => void) | null = null;
  private enabled = true;

  /** Observable that emits when a shortcut is triggered */
  readonly onAction$ = this.action$.asObservable();

  start(): void {
    if (this.listener) return;
    this.listener = (e: KeyboardEvent) => this.handleKey(e);
    document.addEventListener('keydown', this.listener);
  }

  stop(): void {
    if (this.listener) {
      document.removeEventListener('keydown', this.listener);
      this.listener = null;
    }
  }

  /** Temporarily disable shortcuts (e.g., when a modal/input is focused) */
  disable(): void { this.enabled = false; }
  enable(): void { this.enabled = true; }

  private handleKey(e: KeyboardEvent): void {
    if (!this.enabled) return;

    // Ignore when typing in inputs/textareas/contenteditable
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
      // Only allow Ctrl+K / Cmd+K in inputs
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.action$.next('command-palette');
      }
      return;
    }

    // Ctrl+K / Cmd+K -> Command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      this.action$.next('command-palette');
      return;
    }

    // Single-key shortcuts (only when no modifier held)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key.toLowerCase()) {
      case 'n':
        this.action$.next('next-claim');
        break;
      case 'e':
        this.action$.next('escalate');
        break;
      case 's':
        e.preventDefault();
        this.action$.next('save-close');
        break;
      case 'h':
        this.action$.next('go-home');
        break;
      case 'q':
        this.action$.next('go-queue');
        break;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
