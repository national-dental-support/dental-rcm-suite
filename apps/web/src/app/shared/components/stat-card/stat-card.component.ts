import { Component, ChangeDetectionStrategy, Input } from '@angular/core';

@Component({
    selector: 'app-stat-card',
    templateUrl: './stat-card.component.html',
    styleUrls: ['./stat-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SharedStatCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() icon = '';
  @Input() color = '#1976d2';
  @Input() trend: 'up' | 'down' | 'flat' | null = null;
  @Input() suffix = '';

  get trendIcon(): string {
    switch (this.trend) {
      case 'up':
        return 'trending_up';
      case 'down':
        return 'trending_down';
      case 'flat':
        return 'trending_flat';
      default:
        return '';
    }
  }

  get hasData(): boolean {
    return this.value !== null && this.value !== undefined && this.value !== '';
  }

  get trendClass(): string {
    switch (this.trend) {
      case 'up':
        return 'trend-up';
      case 'down':
        return 'trend-down';
      case 'flat':
        return 'trend-flat';
      default:
        return '';
    }
  }
}
