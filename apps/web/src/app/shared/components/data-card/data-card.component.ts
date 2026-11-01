import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
    selector: 'app-data-card',
    templateUrl: './data-card.component.html',
    styleUrls: ['./data-card.component.scss'],
    standalone: false
})
export class DataCardComponent {
  @Input() title = '';
  @Input() tooltip = '';
  @Input() value = '';
  @Input() subtitle = '';
  @Input() showAction = false;
  @Input() actionIcon: string = 'chevron_right';
  @Input() actionAriaLabel: string = 'open';

  // Optional (so cards without trends don't break)
  @Input() trendDirection?: 'up' | 'down';
  @Input() trendColor?: 'green' | 'red';

  // Match the "loading opacity" behavior from the KPI mat-card
  @Input() loading = false;

  @Output() actionClick = new EventEmitter<void>();

  get showTrend(): boolean {
    return !!this.trendDirection && !!this.trendColor;
  }

  onActionClicked(evt: MouseEvent): void {
    // Prevent card click / row click side-effects if you ever add them
    evt.stopPropagation();
    this.actionClick.emit();
  }
}
