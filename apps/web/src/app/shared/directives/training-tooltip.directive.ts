import {
  Directive, Input, OnInit, OnDestroy, OnChanges,
  ElementRef, ViewContainerRef,
} from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { Overlay } from '@angular/cdk/overlay';
import { ScrollDispatcher } from '@angular/cdk/scrolling';
import { Platform } from '@angular/cdk/platform';
import { TrainingService } from '../../core/services/training.service';
import { Subscription } from 'rxjs';

@Directive({
    selector: '[rpTrainingTooltip]',
    providers: [MatTooltip],
    standalone: false
})
export class TrainingTooltipDirective implements OnInit, OnChanges, OnDestroy {
  @Input('rpTrainingTooltip') tooltipText = '';

  private sub?: Subscription;

  constructor(
    private trainingService: TrainingService,
    private tooltip: MatTooltip,
  ) {}

  ngOnInit(): void {
    this.sub = this.trainingService.trainingMode$.subscribe(mode => {
      if (mode) {
        this.tooltip.message = this.tooltipText;
        this.tooltip.disabled = false;
      } else {
        this.tooltip.disabled = true;
      }
    });
  }

  ngOnChanges(): void {
    this.tooltip.message = this.tooltipText;
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.tooltip.ngOnDestroy();
  }
}
