import { Component, ChangeDetectionStrategy, Input } from '@angular/core';

const STATUS_COLORS: Record<string, string> = {
  // Green
  signed: 'green',
  completed: 'green',
  paid: 'green',
  healthy: 'green',
  active: 'green',
  sent: 'green',
  delivered: 'green',
  compliant: 'green',
  // Amber / Orange
  pending: 'amber',
  in_progress: 'amber',
  draft: 'amber',
  scheduled: 'amber',
  in_review: 'amber',
  warning: 'amber',
  // Red
  expired: 'red',
  failed: 'red',
  cancelled: 'red',
  down: 'red',
  critical: 'red',
  non_compliant: 'red',
  rejected: 'red',
  // Grey
  revoked: 'grey',
  voided: 'grey',
  refunded: 'grey',
  suspended: 'grey',
};

@Component({
    selector: 'app-status-badge',
    template: `<span class="status-badge" [ngClass]="[statusClass, sizeClass]">{{ displayText }}</span>`,
    styles: [
        `
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-weight: 500;
      text-transform: capitalize;
      white-space: nowrap;
    }
    .status-badge.size-sm {
      font-size: 11px;
      padding: 1px 8px;
    }
    .status-badge.size-md {
      font-size: 13px;
      padding: 2px 10px;
    }
    .status-badge.color-green {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
    .status-badge.color-amber {
      background-color: #fff3e0;
      color: #e65100;
    }
    .status-badge.color-red {
      background-color: #ffebee;
      color: #c62828;
    }
    .status-badge.color-grey {
      background-color: #f5f5f5;
      color: #616161;
    }
    .status-badge.color-blue {
      background-color: #e3f2fd;
      color: #1565c0;
    }
    `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SharedStatusBadgeComponent {
  @Input() status = '';
  @Input() size: 'sm' | 'md' = 'md';

  get statusClass(): string {
    const key = this.status.toLowerCase().replace(/[\s-]/g, '_');
    const color = STATUS_COLORS[key] || 'blue';
    return `color-${color}`;
  }

  get sizeClass(): string {
    return `size-${this.size}`;
  }

  get displayText(): string {
    return this.status.replace(/_/g, ' ');
  }
}
