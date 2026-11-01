import { Injectable } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { forkJoin } from 'rxjs';
import { map, distinctUntilChanged, catchError } from 'rxjs/operators';
import {
  PayerIqService,
  ChargeAmountResponse,
  PayerMixReimbursementPaymentResponse,
  PayerMixPatientVolumeResponse,
  PayerMixCptVolumeResponse,
  ForecastingPayerPaymentsResponse,
  CptNonPaymentResponse,
  PayerDetailsTreeResponse,
} from '../../core/services/payer-iq.service';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../store.models';
import { PayerIqFiltersValue } from '../../shared/components/global-filters/global-filters.models';

export interface PayerIqDashboardData {
  chargeAmount: ChargeAmountResponse;
  payerMixReimbursement: PayerMixReimbursementPaymentResponse;
  payerMixPatientVolume: PayerMixPatientVolumeResponse;
  payerMixCptVolume: PayerMixCptVolumeResponse;
  forecasting: ForecastingPayerPaymentsResponse;
  cptNonPayment: CptNonPaymentResponse;
  payerDetails: PayerDetailsTreeResponse;
}

/** 10-minute TTL for payer-iq dashboard data. */
const DASHBOARD_TTL = 10 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PayerIqStore {
  private readonly _dashboard$ = new BehaviorSubject<StoreSlice<PayerIqDashboardData>>(emptySlice());

  readonly dashboard$         = this._dashboard$.asObservable();
  readonly dashboardData$     = this._dashboard$.pipe(map(s => s.data), distinctUntilChanged());
  readonly dashboardLoading$  = this._dashboard$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly dashboardError$    = this._dashboard$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(private payerIqService: PayerIqService) {}

  /**
   * Load all 7 Payer IQ dashboard datasets in parallel.
   * Cached for 10 minutes; pass force=true to bypass (e.g. on filter apply).
   */
  loadDashboard(filters?: PayerIqFiltersValue, force = false): void {
    if (!force && isFresh(this._dashboard$.value, DASHBOARD_TTL)) return;

    this._dashboard$.next(loadingSlice(this._dashboard$.value));

    forkJoin({
      chargeAmount:          this.payerIqService.getChargeAmount(filters).pipe(catchError(() => of({ data: [] } as ChargeAmountResponse))),
      payerMixReimbursement: this.payerIqService.getPayerMixReimbursementPayment(filters).pipe(catchError(() => of({ data: [] } as PayerMixReimbursementPaymentResponse))),
      payerMixPatientVolume: this.payerIqService.getPayerMixPatientVolume(filters).pipe(catchError(() => of({ data: [] } as PayerMixPatientVolumeResponse))),
      payerMixCptVolume:     this.payerIqService.getPayerMixCptVolume(filters).pipe(catchError(() => of({ data: [] } as PayerMixCptVolumeResponse))),
      forecasting:           this.payerIqService.getForecastingPayerPayments(filters).pipe(catchError(() => of({ data: [] } as ForecastingPayerPaymentsResponse))),
      cptNonPayment:         this.payerIqService.getCptNonPayment(filters).pipe(catchError(() => of({ payerRollup: [], cptRollup: [], lineItems: [] } as CptNonPaymentResponse))),
      payerDetails:          this.payerIqService.getPayerDetails(filters).pipe(catchError(() => of({ data: [] } as PayerDetailsTreeResponse))),
    }).subscribe({
      next:  data => this._dashboard$.next(loadedSlice(data)),
      error: err  => this._dashboard$.next(
        errorSlice(this._dashboard$.value, err?.message ?? 'Failed to load payer-iq dashboard'),
      ),
    });
  }

  reloadDashboard(filters?: PayerIqFiltersValue): void {
    this.loadDashboard(filters, true);
  }

  get dashboardSnapshot(): PayerIqDashboardData | null {
    return this._dashboard$.value.data;
  }
}
