import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
    selector: 'rp-table-skeleton',
    templateUrl: './rp-table-skeleton.component.html',
    styleUrls: ['./rp-table-skeleton.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RpTableSkeletonComponent {
  @Input() rows = 5;
  @Input() columns = 8;

  get rowArray(): number[] {
    return Array.from({ length: this.rows }, (_, i) => i);
  }

  get colArray(): number[] {
    return Array.from({ length: this.columns }, (_, i) => i);
  }
}
