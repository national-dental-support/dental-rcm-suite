import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

type SkeletonVariant = 'text' | 'rect' | 'circle';
type SkeletonAnimate = 'pulse' | 'shimmer' | 'none';
type SkeletonTone = 'base' | 'muted';

@Component({
    selector: 'rp-skeleton',
    templateUrl: './rp-skeleton.component.html',
    styleUrls: ['./rp-skeleton.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RpSkeletonComponent {
  @Input() variant: SkeletonVariant = 'rect';
  @Input() animate: SkeletonAnimate = 'pulse';
  @Input() tone: SkeletonTone = 'base';

  @Input() w: string = '100%';
  @Input() h: string = '16px';
  @Input() radius?: string;

  get borderRadius(): string {
    if (this.radius) return this.radius;
    if (this.variant === 'circle') return '999px';
    if (this.variant === 'text') return '6px';
    return 'var(--rp-skeleton-radius)';
  }
}
