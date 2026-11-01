import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PayerMixService } from './payer-mix.service';
import { Filters } from '../models/payer-mix.models';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = `${(environment.server.baseUrl || '/api').replace(/\/+$/, '')}/analytics/payer-mix`;

const FILTERS: Filters = {
  provider: 'all',
  practice_groups: 'all',
  location: 'all',
  payment_received: { start_date: '2026-01-01', end_date: '2026-03-01' },
};

describe('PayerMixService', () => {
  let service: PayerMixService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PayerMixService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(PayerMixService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getInsuranceTotals() should POST to /insurance-collections and map result', () => {
    service.getInsuranceTotals(FILTERS).subscribe(res => {
      expect(res.total).toBe('$1,200,000');
      expect(res.prior_year).toBe('--');
    });
    const req = http.expectOne(`${BASE}/insurance-collections`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ filters: FILTERS });
    req.flush({ total: 1200000, formatted: '1,200,000' });
  });

  it('getInsuranceTotals() should return default on error', () => {
    service.getInsuranceTotals(FILTERS).subscribe(res => {
      expect(res.total).toBe('--');
    });
    http.expectOne(`${BASE}/insurance-collections`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  it('getPatientTotals() should POST to /patient-collections and map result', () => {
    service.getPatientTotals(FILTERS).subscribe(res => {
      expect(res.total).toBe('$500,000');
    });
    const req = http.expectOne(`${BASE}/patient-collections`);
    expect(req.request.method).toBe('POST');
    req.flush({ total: 500000, formatted: '500,000' });
  });

  it('getCollectionTrends() should POST to /collection-trends', () => {
    service.getCollectionTrends(FILTERS).subscribe(res => {
      expect(Array.isArray(res)).toBeTrue();
    });
    const req = http.expectOne(`${BASE}/collection-trends`);
    expect(req.request.method).toBe('POST');
    req.flush([{ Month: '2026-01', PatientCollections: 100, InsuranceCollections: 200, TotalCollections: 300, PatientPct: 33, InsurancePct: 67 }]);
  });

  it('getCollectionTrends() should return [] on error', () => {
    service.getCollectionTrends(FILTERS).subscribe(res => expect(res).toEqual([]));
    http.expectOne(`${BASE}/collection-trends`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  it('getPayersIncreasing() should POST to /payers-increasing-production', () => {
    service.getPayersIncreasing(FILTERS).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${BASE}/payers-increasing-production`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getPayersDecreasing() should POST to /payers-decreasing-production', () => {
    service.getPayersDecreasing(FILTERS).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${BASE}/payers-decreasing-production`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getProceduresIncreasing() should POST to /procedures-increasing-production', () => {
    service.getProceduresIncreasing(FILTERS).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${BASE}/procedures-increasing-production`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getProceduresDecreasing() should POST to /procedures-decreasing-production', () => {
    service.getProceduresDecreasing(FILTERS).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${BASE}/procedures-decreasing-production`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getPayerCollectionDetails() should POST to /payer-collection-details', () => {
    service.getPayerCollectionDetails(FILTERS).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${BASE}/payer-collection-details`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  // -- Branch coverage: null fields default to 0 or null ----------------------

  it('getInsuranceTotals() maps prior_year_formatted when present', () => {
    service.getInsuranceTotals(FILTERS).subscribe(res => {
      expect(res.prior_year).toBe('$900,000');
    });
    http.expectOne(`${BASE}/insurance-collections`).flush({ total: 1200000, formatted: '1,200,000', prior_year_formatted: '900,000' });
  });

  it('getInsuranceTotals() maps all_time_formatted when present', () => {
    service.getInsuranceTotals(FILTERS).subscribe(res => {
      expect(res.all_time).toBe('$2,000,000');
    });
    http.expectOne(`${BASE}/insurance-collections`).flush({ total: 1200000, formatted: '1,200,000', all_time_formatted: '2,000,000' });
  });

  it('getPatientTotals() maps prior_year_formatted when present', () => {
    service.getPatientTotals(FILTERS).subscribe(res => {
      expect(res.prior_year).toBe('$400,000');
    });
    http.expectOne(`${BASE}/patient-collections`).flush({ total: 500000, formatted: '500,000', prior_year_formatted: '400,000' });
  });

  it('getPatientTotals() returns default on error', () => {
    service.getPatientTotals(FILTERS).subscribe(res => {
      expect(res.total).toBe('--');
    });
    http.expectOne(`${BASE}/patient-collections`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  it('getCollectionTrends() maps multiple rows correctly', () => {
    service.getCollectionTrends(FILTERS).subscribe(res => {
      expect(res.length).toBe(3);
      expect(res[0].monthLabel).toBeTruthy();
    });
    http.expectOne(`${BASE}/collection-trends`).flush([
      { Month: '2026-01', PatientCollections: 100, InsuranceCollections: 200, TotalCollections: 300, PatientPct: 33, InsurancePct: 67 },
      { Month: '2026-02', PatientCollections: 120, InsuranceCollections: 220, TotalCollections: 340, PatientPct: 35, InsurancePct: 65 },
      { Month: '2026-03', PatientCollections: 90, InsuranceCollections: 180, TotalCollections: 270, PatientPct: 33, InsurancePct: 67 },
    ]);
  });

  it('getCollectionTrends() handles null InsuranceCollections (defaults to 0)', () => {
    service.getCollectionTrends(FILTERS).subscribe(res => {
      expect(res[0].insuranceCollection).toBe(0);
      expect(res[0].patientCollection).toBe(0);
    });
    http.expectOne(`${BASE}/collection-trends`).flush([
      { Month: '2026-01', PatientCollections: null, InsuranceCollections: null, TotalCollections: null, PatientPct: null, InsurancePct: null },
    ]);
  });

  it('getPayersIncreasing() maps null fields to defaults', () => {
    service.getPayersIncreasing(FILTERS).subscribe(res => {
      expect(res[0].insuranceId).toBeNull();
      expect(res[0].insuranceName).toBeNull();
      expect(res[0].chargeDeltaPct).toBeNull();
      expect(res[0].currentPeriodCharges).toBe(0);
    });
    http.expectOne(`${BASE}/payers-increasing-production`).flush([
      { InsuranceID: null, InsuranceName: null, CurrentPeriodCharges: null, LastPeriodCharges: null, ChargeDelta: null, ChargeDeltaPct: null },
    ]);
  });

  it('getPayersIncreasing() returns [] on error', () => {
    service.getPayersIncreasing(FILTERS).subscribe(res => expect(res).toEqual([]));
    http.expectOne(`${BASE}/payers-increasing-production`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  it('getPayersDecreasing() maps null fields to defaults', () => {
    service.getPayersDecreasing(FILTERS).subscribe(res => {
      expect(res[0].chargeDelta).toBe(0);
    });
    http.expectOne(`${BASE}/payers-decreasing-production`).flush([
      { InsuranceID: 1, InsuranceName: 'Test', CurrentPeriodCharges: 100, LastPeriodCharges: 200, ChargeDelta: null, ChargeDeltaPct: -5 },
    ]);
  });

  it('getPayersDecreasing() returns [] on error', () => {
    service.getPayersDecreasing(FILTERS).subscribe(res => expect(res).toEqual([]));
    http.expectOne(`${BASE}/payers-decreasing-production`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  it('getProceduresIncreasing() maps null fields to defaults', () => {
    service.getProceduresIncreasing(FILTERS).subscribe(res => {
      expect(res[0].currentPeriodCharges).toBe(0);
      expect(res[0].chargeDeltaPct).toBeNull();
    });
    http.expectOne(`${BASE}/procedures-increasing-production`).flush([
      { ProcedureCode: 'D1110', CurrentPeriodCharges: null, LastPeriodCharges: null, ChargeDelta: null, ChargeDeltaPct: null },
    ]);
  });

  it('getProceduresIncreasing() returns [] on error', () => {
    service.getProceduresIncreasing(FILTERS).subscribe(res => expect(res).toEqual([]));
    http.expectOne(`${BASE}/procedures-increasing-production`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  it('getProceduresDecreasing() maps null fields to defaults', () => {
    service.getProceduresDecreasing(FILTERS).subscribe(res => {
      expect(res[0].lastPeriodCharges).toBe(0);
    });
    http.expectOne(`${BASE}/procedures-decreasing-production`).flush([
      { ProcedureCode: 'D2140', CurrentPeriodCharges: 5000, LastPeriodCharges: null, ChargeDelta: -500, ChargeDeltaPct: -10 },
    ]);
  });

  it('getProceduresDecreasing() returns [] on error', () => {
    service.getProceduresDecreasing(FILTERS).subscribe(res => expect(res).toEqual([]));
    http.expectOne(`${BASE}/procedures-decreasing-production`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  it('getPayerCollectionDetails() maps null fields to defaults', () => {
    service.getPayerCollectionDetails(FILTERS).subscribe(res => {
      expect(res[0].insuranceName).toBeNull();
      expect(res[0].totalCollections).toBe(0);
      expect(res[0].insurancePercentage).toBeNull();
    });
    http.expectOne(`${BASE}/payer-collection-details`).flush([
      { InsuranceName: null, TotalCollections: null, InsuranceCollections: null, PatientCollections: null, InsurancePercentage: null, PatientPercentage: null, Claim: null },
    ]);
  });

  it('getPayerCollectionDetails() returns [] on error', () => {
    service.getPayerCollectionDetails(FILTERS).subscribe(res => expect(res).toEqual([]));
    http.expectOne(`${BASE}/payer-collection-details`).flush('error', { status: 500, statusText: 'Server Error' });
  });

  // -- Additional ?? fallback branches --------------------------------------

  it('getInsuranceTotals() when api is null returns -- for all fields', () => {
    service.getInsuranceTotals(FILTERS).subscribe(res => {
      expect(res.total).toBe('--');
      expect(res.prior_year).toBe('--');
      expect(res.all_time).toBe('--');
    });
    http.expectOne(`${BASE}/insurance-collections`).flush(null);
  });

  it('getInsuranceTotals() when formatted is empty string returns --', () => {
    service.getInsuranceTotals(FILTERS).subscribe(res => {
      expect(res.total).toBe('--');
    });
    http.expectOne(`${BASE}/insurance-collections`).flush({ formatted: '' });
  });

  it('getPatientTotals() when api is null returns -- for all fields', () => {
    service.getPatientTotals(FILTERS).subscribe(res => {
      expect(res.total).toBe('--');
      expect(res.prior_year).toBe('--');
      expect(res.all_time).toBe('--');
    });
    http.expectOne(`${BASE}/patient-collections`).flush(null);
  });

  it('getPatientTotals() maps all_time_formatted when present', () => {
    service.getPatientTotals(FILTERS).subscribe(res => {
      expect(res.all_time).toBe('$1,500,000');
    });
    http.expectOne(`${BASE}/patient-collections`).flush({ formatted: '500,000', all_time_formatted: '1,500,000' });
  });

  it('getCollectionTrends() when rows is null defaults to []', () => {
    service.getCollectionTrends(FILTERS).subscribe(res => {
      expect(Array.isArray(res)).toBeTrue();
      expect(res.length).toBe(0);
    });
    http.expectOne(`${BASE}/collection-trends`).flush(null);
  });

  it('getPayersIncreasing() when rows is null defaults to []', () => {
    service.getPayersIncreasing(FILTERS).subscribe(res => {
      expect(res).toEqual([]);
    });
    http.expectOne(`${BASE}/payers-increasing-production`).flush(null);
  });

  it('getPayersIncreasing() maps non-null fields without ?? fallback', () => {
    service.getPayersIncreasing(FILTERS).subscribe(res => {
      expect(res[0].insuranceId).toBe(1);
      expect(res[0].insuranceName).toBe('Aetna');
      expect(res[0].currentPeriodCharges).toBe(10000);
      expect(res[0].chargeDeltaPct).toBe(5.5);
    });
    http.expectOne(`${BASE}/payers-increasing-production`).flush([
      { InsuranceID: 1, InsuranceName: 'Aetna', CurrentPeriodCharges: 10000, LastPeriodCharges: 9000, ChargeDelta: 1000, ChargeDeltaPct: 5.5 },
    ]);
  });

  it('getPayersDecreasing() when rows is null defaults to []', () => {
    service.getPayersDecreasing(FILTERS).subscribe(res => {
      expect(res).toEqual([]);
    });
    http.expectOne(`${BASE}/payers-decreasing-production`).flush(null);
  });

  it('getPayersDecreasing() maps non-null InsuranceName and ID', () => {
    service.getPayersDecreasing(FILTERS).subscribe(res => {
      expect(res[0].insuranceName).toBe('BCBS');
      expect(res[0].insuranceId).toBe(2);
    });
    http.expectOne(`${BASE}/payers-decreasing-production`).flush([
      { InsuranceID: 2, InsuranceName: 'BCBS', CurrentPeriodCharges: 5000, LastPeriodCharges: 6000, ChargeDelta: -1000, ChargeDeltaPct: -16.7 },
    ]);
  });

  it('getProceduresIncreasing() when rows is null defaults to []', () => {
    service.getProceduresIncreasing(FILTERS).subscribe(res => {
      expect(res).toEqual([]);
    });
    http.expectOne(`${BASE}/procedures-increasing-production`).flush(null);
  });

  it('getProceduresDecreasing() when rows is null defaults to []', () => {
    service.getProceduresDecreasing(FILTERS).subscribe(res => {
      expect(res).toEqual([]);
    });
    http.expectOne(`${BASE}/procedures-decreasing-production`).flush(null);
  });

  it('getProceduresIncreasing() maps non-null ChargeDeltaPct', () => {
    service.getProceduresIncreasing(FILTERS).subscribe(res => {
      expect(res[0].chargeDeltaPct).toBe(12.3);
    });
    http.expectOne(`${BASE}/procedures-increasing-production`).flush([
      { ProcedureCode: 'D1110', CurrentPeriodCharges: 5000, LastPeriodCharges: 4000, ChargeDelta: 1000, ChargeDeltaPct: 12.3 },
    ]);
  });

  it('getPayerCollectionDetails() when rows is null defaults to []', () => {
    service.getPayerCollectionDetails(FILTERS).subscribe(res => {
      expect(res).toEqual([]);
    });
    http.expectOne(`${BASE}/payer-collection-details`).flush(null);
  });

  it('getPayerCollectionDetails() maps non-null InsuranceName and percentages', () => {
    service.getPayerCollectionDetails(FILTERS).subscribe(res => {
      expect(res[0].insuranceName).toBe('UHC');
      expect(res[0].insurancePercentage).toBe(75.5);
      expect(res[0].patientPercentage).toBe(24.5);
    });
    http.expectOne(`${BASE}/payer-collection-details`).flush([
      { InsuranceName: 'UHC', TotalCollections: 100000, InsuranceCollections: 75500, PatientCollections: 24500, InsurancePercentage: 75.5, PatientPercentage: 24.5, Claim: 50 },
    ]);
  });

  it('monthToLabel should format month correctly', () => {
    // Call getCollectionTrends with a specific month to exercise monthToLabel
    service.getCollectionTrends(FILTERS).subscribe(res => {
      expect(res[0].monthLabel).toContain('2026');
    });
    http.expectOne(`${BASE}/collection-trends`).flush([
      { Month: '2026-06', PatientCollections: 100, InsuranceCollections: 200, TotalCollections: 300, PatientPct: 33, InsurancePct: 67 },
    ]);
  });
});
