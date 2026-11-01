import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { take } from 'rxjs/operators';
import { PayerIqStore, PayerIqDashboardData } from './payer-iq.store';
import {
  PayerIqService, ChargeAmountResponse, PayerMixReimbursementPaymentResponse,
  PayerMixPatientVolumeResponse, PayerMixCptVolumeResponse,
  ForecastingPayerPaymentsResponse, CptNonPaymentResponse, PayerDetailsTreeResponse,
} from '../../core/services/payer-iq.service';
import { PayerIqFiltersValue } from '../../shared/components/global-filters/global-filters.models';

const DEFAULT_FILTERS: PayerIqFiltersValue = {
  startDate: null, endDate: null,
  payers: [], plans: [], leaseNetworks: [], providers: [], locations: [],
};

const mockDashboardData: PayerIqDashboardData = {
  chargeAmount: { data: [{ PayerName: 'BlueCross', TotalCharges: 100000 }] } as ChargeAmountResponse,
  payerMixReimbursement: { data: [{ PayerName: 'Aetna', TotalPayments: 50000 }] } as PayerMixReimbursementPaymentResponse,
  payerMixPatientVolume: { data: [{ PayerName: 'Cigna', PatientEncounter: 120 }] } as PayerMixPatientVolumeResponse,
  payerMixCptVolume: { data: [{ PayerName: 'Humana', ProcedureCode: '99213', ChargeRowCount: 40 }] } as PayerMixCptVolumeResponse,
  forecasting: { data: [] } as ForecastingPayerPaymentsResponse,
  cptNonPayment: { payerRollup: [], cptRollup: [], lineItems: [] } as CptNonPaymentResponse,
  payerDetails: { data: [] } as PayerDetailsTreeResponse,
};

function setupSuccessSpies(svcSpy: jasmine.SpyObj<PayerIqService>) {
  svcSpy.getChargeAmount.and.returnValue(of(mockDashboardData.chargeAmount));
  svcSpy.getPayerMixReimbursementPayment.and.returnValue(of(mockDashboardData.payerMixReimbursement));
  svcSpy.getPayerMixPatientVolume.and.returnValue(of(mockDashboardData.payerMixPatientVolume));
  svcSpy.getPayerMixCptVolume.and.returnValue(of(mockDashboardData.payerMixCptVolume));
  svcSpy.getForecastingPayerPayments.and.returnValue(of(mockDashboardData.forecasting));
  svcSpy.getCptNonPayment.and.returnValue(of(mockDashboardData.cptNonPayment));
  svcSpy.getPayerDetails.and.returnValue(of(mockDashboardData.payerDetails));
}

describe('PayerIqStore', () => {
  let store: PayerIqStore;
  let svcSpy: jasmine.SpyObj<PayerIqService>;

  beforeEach(() => {
    svcSpy = jasmine.createSpyObj<PayerIqService>('PayerIqService', [
      'getChargeAmount', 'getPayerMixReimbursementPayment', 'getPayerMixPatientVolume',
      'getPayerMixCptVolume', 'getForecastingPayerPayments', 'getCptNonPayment', 'getPayerDetails',
    ]);

    TestBed.configureTestingModule({
      providers: [
        PayerIqStore,
        { provide: PayerIqService, useValue: svcSpy },
      ],
    });
    store = TestBed.inject(PayerIqStore);
  });

  // -- Initial state ----------------------------------------------------------

  it('dashboard$ starts in empty state', (done) => {
    store.dashboard$.pipe(take(1)).subscribe(s => {
      expect(s.data).toBeNull();
      expect(s.loading).toBeFalse();
      expect(s.error).toBeNull();
      done();
    });
  });

  it('dashboardData$ emits null initially', (done) => {
    store.dashboardData$.pipe(take(1)).subscribe(d => {
      expect(d).toBeNull();
      done();
    });
  });

  it('dashboardLoading$ emits false initially', (done) => {
    store.dashboardLoading$.pipe(take(1)).subscribe(l => {
      expect(l).toBeFalse();
      done();
    });
  });

  it('dashboardError$ emits null initially', (done) => {
    store.dashboardError$.pipe(take(1)).subscribe(e => {
      expect(e).toBeNull();
      done();
    });
  });

  // -- loadDashboard success -------------------------------------------------

  describe('loadDashboard() success', () => {
    it('emits loaded slice with all 7 datasets', fakeAsync(() => {
      setupSuccessSpies(svcSpy);
      store.loadDashboard(DEFAULT_FILTERS);
      tick();

      const snapshot = store.dashboardSnapshot;
      expect(snapshot).not.toBeNull();
      expect(snapshot!.chargeAmount.data[0].PayerName).toBe('BlueCross');
      expect(snapshot!.payerMixReimbursement.data[0].PayerName).toBe('Aetna');
      expect(snapshot!.payerMixPatientVolume.data[0].PatientEncounter).toBe(120);
    }));

    it('dashboardSnapshot returns data after load', fakeAsync(() => {
      setupSuccessSpies(svcSpy);
      store.loadDashboard(DEFAULT_FILTERS);
      tick();

      expect(store.dashboardSnapshot).not.toBeNull();
      expect(store.dashboardSnapshot!.chargeAmount).toBeDefined();
    }));

    it('passes filters to each service method', fakeAsync(() => {
      setupSuccessSpies(svcSpy);
      const filters: PayerIqFiltersValue = { ...DEFAULT_FILTERS, payers: ['BlueCross'] };
      store.loadDashboard(filters);
      tick();

      expect(svcSpy.getChargeAmount).toHaveBeenCalledWith(filters);
      expect(svcSpy.getCptNonPayment).toHaveBeenCalledWith(filters);
    }));
  });

  // -- loadDashboard TTL cache -----------------------------------------------

  describe('TTL caching', () => {
    it('second loadDashboard call skips API (data is fresh)', fakeAsync(() => {
      setupSuccessSpies(svcSpy);
      store.loadDashboard(DEFAULT_FILTERS);
      tick();

      store.loadDashboard(DEFAULT_FILTERS); // should be skipped
      tick();

      expect(svcSpy.getChargeAmount).toHaveBeenCalledTimes(1);
    }));

    it('reloadDashboard() forces reload even with fresh data', fakeAsync(() => {
      setupSuccessSpies(svcSpy);
      store.loadDashboard(DEFAULT_FILTERS);
      tick();

      store.reloadDashboard(DEFAULT_FILTERS);
      tick();

      expect(svcSpy.getChargeAmount).toHaveBeenCalledTimes(2);
    }));
  });

  // -- loadDashboard with partial failures -----------------------------------

  describe('loadDashboard() with partial service failures', () => {
    it('still emits loaded data when chargeAmount fails (catchError fallback)', fakeAsync(() => {
      svcSpy.getChargeAmount.and.returnValue(throwError(() => new Error('Network error')));
      svcSpy.getPayerMixReimbursementPayment.and.returnValue(of(mockDashboardData.payerMixReimbursement));
      svcSpy.getPayerMixPatientVolume.and.returnValue(of(mockDashboardData.payerMixPatientVolume));
      svcSpy.getPayerMixCptVolume.and.returnValue(of(mockDashboardData.payerMixCptVolume));
      svcSpy.getForecastingPayerPayments.and.returnValue(of(mockDashboardData.forecasting));
      svcSpy.getCptNonPayment.and.returnValue(of(mockDashboardData.cptNonPayment));
      svcSpy.getPayerDetails.and.returnValue(of(mockDashboardData.payerDetails));

      store.loadDashboard(DEFAULT_FILTERS);
      tick();

      const snapshot = store.dashboardSnapshot;
      expect(snapshot).not.toBeNull();
      // chargeAmount failed -> fallback { data: [] }
      expect(snapshot!.chargeAmount.data).toEqual([]);
      // others still loaded
      expect(snapshot!.payerMixReimbursement.data[0].PayerName).toBe('Aetna');
    }));
  });
});
