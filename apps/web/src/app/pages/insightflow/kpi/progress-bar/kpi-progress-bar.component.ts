import {ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { KpiThresholds, Rag } from '../kpi.models';

@Component({
    selector: 'app-kpi-progress-bar',
    templateUrl: './kpi-progress-bar.component.html',
    styleUrls: ['./kpi-progress-bar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class KpiProgressBarComponent {
  @Input() value: number | null = null;
  @Input() thresholds!: KpiThresholds;
  @Input() unit = '%';
  @Input() rag: Rag = 'red';

  /** Fill width as % of the track, proportional to value within 0-max */
  get fillWidth(): number {
    if (this.value == null || !this.thresholds) return 0;
    return Math.max(0, Math.min(100, (this.value / this.thresholds.max) * 100));
  }

  /** Position of the "target minimum" line (start of green zone) */
  get targetLeft(): number {
    if (!this.thresholds) return 0;
    return (this.thresholds.amberMax / this.thresholds.max) * 100;
  }
}
