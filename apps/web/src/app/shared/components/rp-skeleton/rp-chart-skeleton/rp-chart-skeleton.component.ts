import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

type ChartSkeletonType = 'pie' | 'bar' | 'line' | 'area' | 'stacked';

@Component({
    selector: 'rp-chart-skeleton',
    templateUrl: './rp-chart-skeleton.component.html',
    styleUrls: ['./rp-chart-skeleton.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RpChartSkeletonComponent {
  @Input() type: ChartSkeletonType = 'pie';
  @Input() title?: string;

  @Input() showLegend = true;
  @Input() showAxes = true;

  @Input() message: string = 'Preparing insights\u2026';

  legendItems = Array.from({ length: 4 });
  bars = ['40px', '70px', '55px', '90px', '60px', '80px', '50px', '72px'];
}
