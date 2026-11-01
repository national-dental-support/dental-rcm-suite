import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RiskSummary {
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  totalScored: number;
  avgRiskScore: number;
  highRiskCharges: number;
  totalCharges: number;
  highRiskPrecision: number;
}

export interface HighRiskClaim {
  claimId: string;
  chargeAmt: number;
  dateOfService: string;
  insuranceName: string;
  providerName: string;
  cptCode: string | null;
  carcCode: string | null;
  location: string;
  coverageType: string;
  isDenied: boolean;
  riskScore: number;
  riskTier: 'High' | 'Medium' | 'Low';
  payerDenialPct: number;
  providerDenialPct: number;
  procedureDenialPct: number;
  payerProcDenialPct: number;
}

export interface PayerRisk {
  payerName: string;
  totalClaims: number;
  deniedClaims: number;
  totalCharges: number;
  deniedCharges: number;
  denialRate: number;
  riskTier: 'High' | 'Medium' | 'Low';
}

export interface ReasonRisk {
  carcCode: string;
  reasonDescription: string;
  deniedClaims: number;
  deniedCharges: number;
  avgResolutionDays: number;
  recoveryRate: number;
}

export interface RiskTrendPoint {
  period: string;
  totalClaims: number;
  highRiskClaims: number;
  avgRiskScore: number;
}

export interface ClaimRiskScore {
  claimId: string;
  chargeAmt: number;
  dateOfService: string;
  insuranceName: string;
  providerName: string;
  carcCode: string | null;
  coverageType: string;
  isDenied: boolean;
  riskScore: number;
  riskTier: 'High' | 'Medium' | 'Low';
  payerDenialPct: number;
  providerDenialPct: number;
  payerClaimVolume: number;
  carcDeniedCount: number;
  riskFactors: string[];
}

@Injectable({ providedIn: 'root' })
export class DenialPredictionService {
  private readonly base = `${environment.server.baseUrl}/insightflow/predictions`;

  constructor(private http: HttpClient) {}

  getRiskSummary(): Observable<RiskSummary> {
    return this.http.get<{ data: RiskSummary }>(`${this.base}/risk-summary`)
      .pipe(map(r => r.data));
  }

  getHighRiskClaims(limit = 50): Observable<HighRiskClaim[]> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<{ data: HighRiskClaim[] }>(`${this.base}/high-risk-claims`, { params })
      .pipe(map(r => r.data ?? []));
  }

  getRiskByPayer(): Observable<PayerRisk[]> {
    return this.http.get<{ data: PayerRisk[] }>(`${this.base}/risk-by-payer`)
      .pipe(map(r => r.data ?? []));
  }

  getRiskByReason(): Observable<ReasonRisk[]> {
    return this.http.get<{ data: ReasonRisk[] }>(`${this.base}/risk-by-reason`)
      .pipe(map(r => r.data ?? []));
  }

  getRiskTrend(): Observable<RiskTrendPoint[]> {
    return this.http.get<{ data: RiskTrendPoint[] }>(`${this.base}/risk-trend`)
      .pipe(map(r => r.data ?? []));
  }

  scoreClaimById(claimId: string): Observable<ClaimRiskScore> {
    return this.http.get<{ data: ClaimRiskScore }>(`${this.base}/score/${encodeURIComponent(claimId)}`)
      .pipe(map(r => r.data));
  }
}
