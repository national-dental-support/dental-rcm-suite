import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import {
  PriorityService,
  PriorityWeights,
  PriorityStats,
  PriorityDistribution,
  TopPriorityClaim,
} from '../../../core/services/priority.service';

@Component({
    selector: 'rp-priority-settings',
    templateUrl: './priority-settings.component.html',
    styleUrls: ['./priority-settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PrioritySettingsComponent implements OnInit {
  loading = true;
  saving = false;
  recalculating = false;

  enabled = true;
  weights: PriorityWeights = { aging: 40, value: 25, deadline: 20, workload: 15 };
  stats: PriorityStats = { totalScored: 0, lastRunAt: null, avgScore: 0, maxScore: 0, minScore: 0 };
  distribution: PriorityDistribution = { high: 0, medium: 0, low: 0 };

  topClaims: TopPriorityClaim[] = [];
  showTop = false;

  constructor(
    private svc: PriorityService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading = true;
    this.svc.getSettings().subscribe({
      next: s => {
        this.weights = s.weights;
        this.enabled = s.enabled;
        this.stats = s.stats;
        this.distribution = s.distribution;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get weightsTotal(): number {
    return this.weights.aging + this.weights.value + this.weights.deadline + this.weights.workload;
  }

  saveWeights(): void {
    this.saving = true;
    this.svc.updateSettings({ weights: this.weights, enabled: this.enabled }).subscribe({
      next: () => {
        this.saving = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleEnabled(): void {
    this.enabled = !this.enabled;
    this.svc.updateSettings({ enabled: this.enabled }).subscribe();
  }

  triggerRecalc(): void {
    this.recalculating = true;
    this.svc.triggerRecalculate().subscribe({
      next: () => {
        this.recalculating = false;
        this.loadSettings();
      },
      error: () => {
        this.recalculating = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadTopClaims(): void {
    this.showTop = !this.showTop;
    if (this.showTop && this.topClaims.length === 0) {
      this.svc.getTopClaims(50).subscribe({
        next: res => {
          this.topClaims = res.data ?? [];
          this.cdr.markForCheck();
        },
      });
    }
  }

  scoreClass(score: number): string {
    return score >= 70 ? 'score-high' : score >= 40 ? 'score-medium' : 'score-low';
  }

  trackByIndex(i: number): number { return i; }
}
