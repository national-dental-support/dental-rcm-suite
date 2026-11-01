import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { TrainingService } from '../../../core/services/training.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'rp-training-panel',
    template: `
    @if (visible) {
      <div class="training-panel">
        <div class="training-panel-header" (click)="expanded = !expanded">
          <mat-icon>school</mat-icon>
          <span>{{ title || 'Need help?' }}</span>
          <mat-icon class="expand-icon">{{ expanded ? 'expand_less' : 'expand_more' }}</mat-icon>
        </div>
        @if (expanded) {
          <div class="training-panel-body">
            <ng-content></ng-content>
          </div>
        }
      </div>
    }
    `,
    styles: [`
    .training-panel {
      border: 1px solid #bbdefb;
      border-radius: 8px;
      background: #e3f2fd;
      margin: 12px 0;
      overflow: hidden;
    }
    .training-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #1565c0;
    }
    .training-panel-header:hover {
      background: #d0e8fc;
    }
    .expand-icon {
      margin-left: auto;
    }
    .training-panel-body {
      padding: 0 14px 14px;
      font-size: 13px;
      line-height: 1.6;
      color: #333;
    }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class TrainingPanelComponent implements OnInit, OnDestroy {
  @Input() title = '';
  visible = false;
  expanded = false;

  private sub?: Subscription;

  constructor(
    private trainingService: TrainingService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.sub = this.trainingService.trainingMode$.subscribe(mode => {
      this.visible = mode;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
