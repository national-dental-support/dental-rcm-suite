import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface BuilderInfoSummaryDto {
  underpaymentCount: number;
  underpaymentDollars: number;
  avgPaymentLagDays: number;
  totalDenials: number;
}

export interface BuilderInfoRowDto {
  payerContractId: number;
  cpt: string;
  volume: number;
  currentAllowed: number;
  avgPaid: number;
  totalCharges: number;
  underpaidDollars: number;
}

export interface BuilderInfoResponseDto {
  message: string;
  filters: { payerContractId: number; start: string; end: string };
  summary: BuilderInfoSummaryDto;
  rows: BuilderInfoRowDto[];
}

@Injectable({ providedIn: 'root' })
export class PayerIqStrategyService {
  constructor(private http: HttpClient) {}

  getBuilderInfo(args: {
    payerContractId: number;
    start?: string; // YYYY-MM-DD
    end?: string;   // YYYY-MM-DD
  }): Observable<BuilderInfoResponseDto> {
    let params = new HttpParams().set('payerContractId', String(args.payerContractId));
    if (args.start) params = params.set('start', args.start);
    if (args.end) params = params.set('end', args.end);

    return this.http.get<BuilderInfoResponseDto>('/api/payer-iq/strategy/builder-info', { params });
  }
}
