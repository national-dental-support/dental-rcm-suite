import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  PayerIqService,
  ChargeAmountResponse, PayerMixReimbursementPaymentResponse,
  PayerMixPatientVolumeResponse, PayerMixCptVolumeResponse,
  ForecastingPayerPaymentsResponse, NetworkLeasesResponse,
  CptNonPaymentResponse, PayerDetailsTreeResponse,
  NetworkPayersDropdownResponse, AtRiskPayersResponse,
  StrategyContractOptionsResponse,
} from './payer-iq.service';
import { PayerIqFiltersValue } from '../../shared/components/global-filters/global-filters.models';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const DEFAULT_FILTERS: PayerIqFiltersValue = {
  startDate: null, endDate: null,
  payers: [], plans: [], leaseNetworks: [], providers: [], locations: [],
};

const DASH_BASE = '/api/payer-iq/dashboard';
const NETWORK_LEASES_BASE = '/api/payer-iq/network-leases';
const NETWORK_PAYERS_BASE = '/api/payer-iq/network-payers';
const UNDERPAYMENTS_BASE = '/api/payer-iq/underpayments';
const STRATEGY_BASE = '/api/payer-iq/strategy';

describe('PayerIqService', () => {
  let service: PayerIqService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PayerIqService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(PayerIqService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // -- Charge Amount ---------------------------------------------------------

  describe('getChargeAmount()', () => {
    it('GET /api/payer-iq/dashboard/charge-amount', () => {
      const resp: ChargeAmountResponse = { data: [{ PayerName: 'BlueCross', TotalCharges: 100000 }] };
      service.getChargeAmount(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data[0].PayerName).toBe('BlueCross');
      });
      http.expectOne(r => r.url === `${DASH_BASE}/charge-amount`).flush(resp);
    });

    it('sends start/end date params when provided', () => {
      const filters: PayerIqFiltersValue = {
        ...DEFAULT_FILTERS,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      };
      service.getChargeAmount(filters).subscribe();
      const req = http.expectOne(r =>
        r.url === `${DASH_BASE}/charge-amount` &&
        r.params.get('start') === '2025-01-01' &&
        r.params.get('end') === '2025-12-31'
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });

    it('sends payer filter as repeated params', () => {
      const filters: PayerIqFiltersValue = { ...DEFAULT_FILTERS, payers: ['BlueCross', 'Aetna'] };
      service.getChargeAmount(filters).subscribe();
      const req = http.expectOne(r =>
        r.url === `${DASH_BASE}/charge-amount` && r.params.getAll('payer')?.length === 2
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });
  });

  // -- Payer Mix by Reimbursement --------------------------------------------

  describe('getPayerMixReimbursementPayment()', () => {
    it('GET /api/payer-iq/dashboard/payer-mix-reimbursement-payment', () => {
      const resp: PayerMixReimbursementPaymentResponse = {
        data: [{ PayerName: 'Aetna', TotalPayments: 50000 }],
      };
      service.getPayerMixReimbursementPayment(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data[0].PayerName).toBe('Aetna');
      });
      http.expectOne(r => r.url === `${DASH_BASE}/payer-mix-reimbursement-payment`).flush(resp);
    });
  });

  // -- Payer Mix by Patient Volume -------------------------------------------

  describe('getPayerMixPatientVolume()', () => {
    it('GET /api/payer-iq/dashboard/payer-mix-patient-volume', () => {
      const resp: PayerMixPatientVolumeResponse = {
        data: [{ PayerName: 'Cigna', PatientEncounter: 120 }],
      };
      service.getPayerMixPatientVolume(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data[0].PatientEncounter).toBe(120);
      });
      http.expectOne(r => r.url === `${DASH_BASE}/payer-mix-patient-volume`).flush(resp);
    });
  });

  // -- Payer Mix by CPT Volume -----------------------------------------------

  describe('getPayerMixCptVolume()', () => {
    it('GET /api/payer-iq/dashboard/payer-mix-cpt-volume', () => {
      const resp: PayerMixCptVolumeResponse = {
        data: [{ PayerName: 'Humana', ProcedureCode: '99213', ChargeRowCount: 40 }],
      };
      service.getPayerMixCptVolume(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data[0].ProcedureCode).toBe('99213');
      });
      http.expectOne(r => r.url === `${DASH_BASE}/payer-mix-cpt-volume`).flush(resp);
    });
  });

  // -- Forecasting -----------------------------------------------------------

  describe('getForecastingPayerPayments()', () => {
    it('GET /api/payer-iq/dashboard/forecasting-payer-payments', () => {
      const resp: ForecastingPayerPaymentsResponse = { data: [] };
      service.getForecastingPayerPayments(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data).toEqual([]);
      });
      http.expectOne(r => r.url === `${DASH_BASE}/forecasting-payer-payments`).flush(resp);
    });
  });

  // -- CPT Non Payment -------------------------------------------------------

  describe('getCptNonPayment()', () => {
    it('GET /api/payer-iq/dashboard/cpt-non-payment', () => {
      const resp: CptNonPaymentResponse = { payerRollup: [], cptRollup: [], lineItems: [] };
      service.getCptNonPayment(DEFAULT_FILTERS).subscribe(r => {
        expect(r.payerRollup).toEqual([]);
      });
      http.expectOne(r => r.url === `${DASH_BASE}/cpt-non-payment`).flush(resp);
    });
  });

  // -- Payer Details Tree ----------------------------------------------------

  describe('getPayerDetails()', () => {
    it('GET /api/payer-iq/dashboard/payer-details', () => {
      const resp: PayerDetailsTreeResponse = { data: [] };
      service.getPayerDetails(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data).toEqual([]);
      });
      http.expectOne(r => r.url === `${DASH_BASE}/payer-details`).flush(resp);
    });
  });

  // -- Network Leases --------------------------------------------------------

  describe('getNetworkLeases()', () => {
    it('GET /api/payer-iq/network-leases/network-leases-summary', () => {
      const resp: NetworkLeasesResponse = { data: { networks: [], payers: [] } };
      service.getNetworkLeases(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data.networks).toEqual([]);
      });
      http.expectOne(r => r.url === `${NETWORK_LEASES_BASE}/network-leases-summary`).flush(resp);
    });
  });

  // -- Network Payers Dropdown -----------------------------------------------

  describe('getNetworkPayersDropdown()', () => {
    it('GET /api/payer-iq/network-payers/network-payers-dropdown', () => {
      const resp: NetworkPayersDropdownResponse = { networks: [], networkPayers: [] };
      service.getNetworkPayersDropdown(DEFAULT_FILTERS).subscribe(r => {
        expect(r.networks).toEqual([]);
      });
      http.expectOne(r => r.url === `${NETWORK_PAYERS_BASE}/network-payers-dropdown`).flush(resp);
    });
  });

  // -- At-Risk Payers --------------------------------------------------------

  describe('getAtRiskPayers()', () => {
    it('GET /api/payer-iq/underpayments/at-risk-payers', () => {
      const resp: AtRiskPayersResponse = { data: [] };
      service.getAtRiskPayers(DEFAULT_FILTERS).subscribe(r => {
        expect(r.data).toEqual([]);
      });
      http.expectOne(r => r.url === `${UNDERPAYMENTS_BASE}/at-risk-payers`).flush(resp);
    });
  });

  // -- Strategy Contract Options ---------------------------------------------

  describe('getStrategyContractOptions()', () => {
    it('GET /api/payer-iq/strategy/contract-options', () => {
      const resp: StrategyContractOptionsResponse = {
        data: [{ PayerContractID: 1, ContractPlanName: 'BlueCross PPO' }],
      };
      service.getStrategyContractOptions().subscribe(r => {
        expect(r.data[0].ContractPlanName).toBe('BlueCross PPO');
      });
      http.expectOne(r => r.url === `${STRATEGY_BASE}/contract-options`).flush(resp);
    });
  });

  // -- getChargeAmountByPayer (helper) ---------------------------------------

  describe('getChargeAmountByPayer()', () => {
    it('GET /api/payer-iq/dashboard/charge-amount with payerId param', () => {
      service.getChargeAmountByPayer('42').subscribe();
      const req = http.expectOne(r =>
        r.url === `${DASH_BASE}/charge-amount` && r.params.get('payerId') === '42'
      );
      expect(req).toBeTruthy();
      req.flush({ data: [] });
    });
  });
});
