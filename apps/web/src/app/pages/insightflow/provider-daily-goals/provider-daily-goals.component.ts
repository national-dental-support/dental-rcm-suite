import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InsightflowService, ProviderDailyProductionRow } from '../../../core/services/insight-flow.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

@Component({
    selector: 'app-provider-daily-goals',
    templateUrl: './provider-daily-goals.component.html',
    styleUrls: ['./provider-daily-goals.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ProviderDailyGoalsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private pollTimer: any;

  loading = true;
  error = false;
  rows: ProviderDailyProductionRow[] = [];
  asOf: string | null = null;

  private locations: string[] = [];
  private providers: string[] = [];

  readonly displayedColumns = [
    'providerName', 'production', 'dailyGoal', 'pctOfDailyGoal',
    'weekProduction', 'weeklyGoal', 'pctOfWeeklyGoal', 'rag',
  ];

  constructor(
    private svc: InsightflowService,
    private globalFilters: GlobalFiltersStore,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.globalFilters.applied$.pipe(takeUntil(this.destroy$)).subscribe(f => {
      const loc = f.location;
      this.locations = loc.scope === 'location' ? (loc as any).locations ?? [] : [];
      this.providers = f.providers ?? [];
      this.fetch();
    });

    this.ngZone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        this.ngZone.run(() => this.fetch());
      }, 60_000);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearInterval(this.pollTimer);
  }

  fetch(): void {
    this.loading = true;
    this.error = false;
    this.svc.getProviderDailyProduction(undefined, this.locations, this.providers)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.rows = result.rows ?? [];
          this.asOf = result.asOf ?? null;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = true;
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  ragClass(rag: string): string {
    return `rag-${rag}`;
  }

  ragIcon(rag: string): string {
    switch (rag) {
      case 'green': return 'check_circle';
      case 'amber': return 'warning';
      case 'red': return 'flag';
      default: return 'radio_button_unchecked';
    }
  }

  ragTooltip(rag: string, pct: number | null): string {
    if (pct == null) return 'No goal set';
    const p = Math.round(pct);
    switch (rag) {
      case 'green': return `On track \u2014 ${p}% of daily goal`;
      case 'amber': return `Near threshold \u2014 ${p}% of daily goal`;
      case 'red': return `Below target \u2014 ${p}% of daily goal`;
      default: return 'No goal set';
    }
  }

  trackByProvider(_: number, row: ProviderDailyProductionRow): string {
    return row.providerName;
  }
}
