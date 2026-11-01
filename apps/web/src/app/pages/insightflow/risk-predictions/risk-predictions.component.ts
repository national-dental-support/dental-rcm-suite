import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import {
  DenialPredictionService,
  RiskSummary,
  HighRiskClaim,
  PayerRisk,
  ReasonRisk,
  RiskTrendPoint,
} from '../../../core/services/denial-prediction.service';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-risk-predictions',
    templateUrl: './risk-predictions.component.html',
    styleUrls: ['./risk-predictions.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RiskPredictionsComponent implements OnInit {
  loading = true;
  error = false;

  summary: RiskSummary | null = null;
  highRiskClaims: HighRiskClaim[] = [];
  payerRisks: PayerRisk[] = [];
  reasonRisks: ReasonRisk[] = [];
  riskTrend: RiskTrendPoint[] = [];

  // View state
  activeSection: 'overview' | 'claims' | 'payers' | 'reasons' = 'overview';
  showAlgorithm = false;

  constructor(
    private predictionService: DenialPredictionService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = false;

    forkJoin({
      summary: this.predictionService.getRiskSummary(),
      claims: this.predictionService.getHighRiskClaims(50),
      payers: this.predictionService.getRiskByPayer(),
      reasons: this.predictionService.getRiskByReason(),
      trend: this.predictionService.getRiskTrend(),
    }).subscribe({
      next: res => {
        this.summary = res.summary;
        this.highRiskClaims = res.claims;
        this.payerRisks = res.payers;
        this.reasonRisks = res.reasons;
        this.riskTrend = res.trend;
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

  get highRiskPct(): number {
    if (!this.summary || !this.summary.totalScored) return 0;
    return Number(((this.summary.highRisk / this.summary.totalScored) * 100).toFixed(1));
  }

  get revenueAtRiskPct(): number {
    if (!this.summary || !this.summary.totalCharges) return 0;
    return Number(((this.summary.highRiskCharges / this.summary.totalCharges) * 100).toFixed(1));
  }

  formatCurrency(val: number): string {
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (val >= 1_000) return '$' + (val / 1_000).toFixed(0) + 'K';
    return '$' + val.toFixed(0);
  }

  riskTierClass(tier: string): string {
    switch (tier) {
      case 'High': return 'risk-high';
      case 'Medium': return 'risk-medium';
      case 'Low': return 'risk-low';
      default: return '';
    }
  }

  riskScoreClass(score: number): string {
    if (score >= 70) return 'risk-high';
    if (score >= 40) return 'risk-medium';
    return 'risk-low';
  }
}
