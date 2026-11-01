import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-denial-prediction',
  templateUrl: './denial-prediction.component.html',
  styleUrls: ['./denial-prediction.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DenialPredictionComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  predictions: any[] = [];
  filteredPredictions: any[] = [];
  accuracy: any = null;
  filterRisk = '';

  chartOptions: any = {};

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    forkJoin({
      predictions: this.svc.getDenialPredictions(),
      accuracy: this.svc.getDenialPredictionAccuracy(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.predictions = res.predictions;
        this.accuracy = res.accuracy;
        this.buildChart();
        this.applyFilter();
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

  buildChart(): void {
    const high = this.predictions.filter(p => p.riskLevel === 'high').length;
    const medium = this.predictions.filter(p => p.riskLevel === 'medium').length;
    const low = this.predictions.filter(p => p.riskLevel === 'low').length;
    this.chartOptions = {
      series: [high, medium, low],
      chart: { type: 'donut', height: 220 },
      labels: ['High Risk', 'Medium Risk', 'Low Risk'],
      colors: ['#ef5350', '#ffa726', '#66bb6a'],
      legend: { position: 'bottom', labels: { colors: '#fff' } },
      dataLabels: { style: { colors: ['#fff'] } },
      plotOptions: { pie: { donut: { size: '60%' } } },
    };
  }

  applyFilter(): void {
    if (!this.filterRisk) {
      this.filteredPredictions = [...this.predictions];
    } else {
      this.filteredPredictions = this.predictions.filter(p => p.riskLevel === this.filterRisk);
    }
    this.cdr.markForCheck();
  }

  onFilterChange(val: string): void {
    this.filterRisk = val;
    this.applyFilter();
  }

  riskColor(level: string): string {
    const map: Record<string, string> = { high: '#ef5350', medium: '#ffa726', low: '#66bb6a' };
    return map[level] ?? '#bdbdbd';
  }

  scoreBarColor(score: number): string {
    if (score >= 75) return '#ef5350';
    if (score >= 50) return '#ffa726';
    return '#66bb6a';
  }

  trackById(_: number, item: any): any { return item.claimId; }
}
