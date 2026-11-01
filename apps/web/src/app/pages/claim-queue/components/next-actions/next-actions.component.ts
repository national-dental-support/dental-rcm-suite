import { Component, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { NextActionsService } from '../../../../core/services/next-actions.service';

@Component({
    selector: 'app-next-actions',
    templateUrl: './next-actions.component.html',
    styleUrls: ['./next-actions.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class NextActionsComponent implements OnChanges {
  @Input() claimId = '';

  loading = false;
  error = false;
  actions = '';

  constructor(
    private svc: NextActionsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['claimId'] && this.claimId) {
      this.loadActions();
    }
  }

  loadActions(): void {
    this.loading = true;
    this.error = false;
    this.svc.getNextActions(this.claimId).subscribe({
      next: res => {
        this.actions = res.actions;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = true;
        this.cdr.markForCheck();
      },
    });
  }
}
