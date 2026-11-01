import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  InsightflowService,
  TreatmentAcceptanceSummary,
  TreatmentAcceptanceTrendPoint,
} from '../../../core/services/insight-flow.service';

@Component({
    selector: 'app-treatment-acceptance',
    templateUrl: './treatment-acceptance.component.html',
    styleUrls: ['./treatment-acceptance.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class TreatmentAcceptanceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private pollTimer: any;

  loading = true;
  trendLoading = true;
  error = false;

  summary: TreatmentAcceptanceSummary | null = null;
  trend: TreatmentAcceptanceTrendPoint[] = [];

  readonly typeColumns = ['treatmentType', 'totalPlans', 'totalPresented', 'totalAccepted', 'acceptanceRate', 'status'];

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.fetch();
    this.ngZone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        this.ngZone.run(() => this.fetch());
      }, 300_000);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearInterval(this.pollTimer);
  }

  fetch(): void {
    this.loading = true;
    this.trendLoading = true;
    this.error = false;

    this.svc.getTreatmentAcceptanceSummary().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.summary = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });

    this.svc.getTreatmentAcceptanceTrend().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.trend = data.trend ?? [];
        this.trendLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.trendLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  ragClass(rag: string): string { return `rag-${rag}`; }

  ragLabel(rag: string): string {
    return rag === 'green' ? 'On Target' : rag === 'amber' ? 'Near Threshold' : rag === 'red' ? 'Below Target' : '--';
  }

  ragIcon(rag: string): string {
    return rag === 'green' ? 'check_circle' : rag === 'amber' ? 'warning' : rag === 'red' ? 'flag' : 'radio_button_unchecked';
  }

  trackByType(_: number, r: any): string { return r.treatmentType; }
  trackByMonth(_: number, r: any): string { return r.month; }
}
