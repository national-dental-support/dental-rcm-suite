import { Component, Inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface PaletteCommand {
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
}

@Component({
    selector: 'app-command-palette',
    template: `
    <div class="palette-backdrop" (click)="close()">
      <div class="palette-card" (click)="$event.stopPropagation()">
        <div class="palette-search">
          <mat-icon class="search-icon">search</mat-icon>
          <input #searchInput type="text" placeholder="Type a command\u2026"
            [(ngModel)]="query" (ngModel)="filterCommands()"
            (keydown.escape)="close()"
            (keydown.arrowDown)="moveSelection(1); $event.preventDefault()"
            (keydown.arrowUp)="moveSelection(-1); $event.preventDefault()"
            (keydown.enter)="runSelected()"
            autofocus />
          </div>
          @if (filtered.length) {
            <div class="palette-results">
              @for (cmd of filtered; track cmd; let i = $index) {
                <button class="palette-item"
                  [class.selected]="i === selectedIndex"
                  (click)="run(cmd)"
                  (mouseenter)="selectedIndex = i">
                  <mat-icon class="item-icon">{{ cmd.icon }}</mat-icon>
                  <span class="item-label">{{ cmd.label }}</span>
                  @if (cmd.shortcut) {
                    <kbd class="item-shortcut">{{ cmd.shortcut }}</kbd>
                  }
                </button>
              }
            </div>
          }
          @if (!filtered.length && query) {
            <div class="palette-empty">
              No matching commands
            </div>
          }
          <div class="palette-footer">
            <span><kbd>\u2191\u2193</kbd> Navigate</span>
            <span><kbd>\u21B5</kbd> Run</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    `,
    styles: [`
    .palette-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      display: flex; justify-content: center; padding-top: 20vh;
      background: rgba(0,0,0,0.35);
    }
    .palette-card {
      width: 520px; max-width: calc(100vw - 32px);
      max-height: 420px; background: #fff;
      border-radius: 14px; overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      display: flex; flex-direction: column;
    }
    .palette-search {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
    }
    .search-icon { color: #9ca3af; }
    input {
      flex: 1; border: none; outline: none; font-size: 15px;
      font-family: inherit; background: transparent; color: #111;
    }
    .palette-results {
      flex: 1; overflow-y: auto; padding: 6px 0;
    }
    .palette-item {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 10px 16px; border: none;
      background: transparent; cursor: pointer; font-size: 14px;
      font-family: inherit; color: #374151; text-align: left;
    }
    .palette-item:hover, .palette-item.selected {
      background: #f0f4ff; color: #1d4ed8;
    }
    .item-icon { font-size: 18px; width: 18px; height: 18px; color: #6b7280; }
    .palette-item.selected .item-icon { color: #1d4ed8; }
    .item-label { flex: 1; }
    .item-shortcut {
      font-size: 11px; padding: 2px 6px; border-radius: 4px;
      background: #f3f4f6; color: #6b7280; font-family: monospace;
    }
    .palette-empty {
      padding: 24px 16px; text-align: center; color: #9ca3af; font-size: 14px;
    }
    .palette-footer {
      display: flex; gap: 16px; padding: 8px 16px;
      border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;
    }
    .palette-footer kbd {
      font-family: monospace; font-size: 11px;
      padding: 1px 4px; border-radius: 3px;
      background: #f3f4f6; margin-right: 2px;
    }
  `],
    standalone: false
})
export class CommandPaletteComponent implements OnInit {
  query = '';
  selectedIndex = 0;
  commands: PaletteCommand[] = [];
  filtered: PaletteCommand[] = [];

  constructor(
    private dialogRef: MatDialogRef<CommandPaletteComponent>,
    private router: Router,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.commands = [
      { label: 'Go to Home', icon: 'home', shortcut: 'H', action: () => this.nav('/app/home') },
      { label: 'Go to Denial IQ Dashboard', icon: 'dashboard', action: () => this.nav('/app/denial-iq') },
      { label: 'Go to Claim Queue', icon: 'list_alt', shortcut: 'Q', action: () => this.nav('/app/denial-iq/claim-queue/ar-specialist') },
      { label: 'Go to InsightFlow', icon: 'insights', action: () => this.nav('/app/insightflow') },
      { label: 'Go to Claim Vision', icon: 'search', action: () => this.nav('/app/claim-vision') },
      { label: 'Go to Payer IQ', icon: 'calculate', action: () => this.nav('/app/payer-iq') },
      { label: 'Go to Recon IQ', icon: 'account_balance', action: () => this.nav('/app/recon-iq') },
      { label: 'Go to Training', icon: 'school', action: () => this.nav('/app/training') },
      { label: 'Go to Admin', icon: 'settings', action: () => this.nav('/app/admin') },
      { label: 'Go to Report Builder', icon: 'bar_chart', action: () => this.nav('/app/insightflow/report-builder') },
    ];
    this.filtered = [...this.commands];
  }

  filterCommands(): void {
    const q = this.query.toLowerCase().trim();
    this.filtered = q
      ? this.commands.filter(c => c.label.toLowerCase().includes(q))
      : [...this.commands];
    this.selectedIndex = 0;
  }

  moveSelection(delta: number): void {
    this.selectedIndex = Math.max(0, Math.min(this.filtered.length - 1, this.selectedIndex + delta));
  }

  runSelected(): void {
    if (this.filtered[this.selectedIndex]) {
      this.run(this.filtered[this.selectedIndex]);
    }
  }

  run(cmd: PaletteCommand): void {
    this.close();
    cmd.action();
  }

  close(): void {
    this.dialogRef.close();
  }

  private nav(path: string): void {
    this.router.navigate([path]);
  }
}
