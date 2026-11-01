import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MedicareDashboardService } from './medicare-dashboard.service';
import { RequestObject } from '../models/types';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = environment.server.baseUrl;

const VALID_PAYLOAD: RequestObject = { customer_id: 'cust-1', filters: {} } as any;
const INVALID_PAYLOAD: RequestObject = { customer_id: '', filters: {} } as any;

describe('MedicareDashboardService', () => {
  let service: MedicareDashboardService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [MedicareDashboardService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(MedicareDashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getProceduresAndClaimCounts() should POST to correct endpoint', () => {
    service.getProceduresAndClaimCounts(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/procedure-and-claim-counts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('APIKey')).toBe(false);
    req.flush([]);
  });

  it('getProceduresAndClaimCounts() should error if customer_id is missing', () => {
    let errored = false;
    service.getProceduresAndClaimCounts(INVALID_PAYLOAD).subscribe({
      error: () => (errored = true),
    });
    expect(errored).toBeTrue();
    http.expectNone(`${BASE}/analytics/medicare-dashboard/procedure-and-claim-counts`);
  });

  it('getChargesVsMedicare() should POST to /charges-vs-medicare', () => {
    service.getChargesVsMedicare(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/charges-vs-medicare`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getPaymentsVsMedicare() should POST to /payments-vs-medicare', () => {
    service.getPaymentsVsMedicare(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/payments-vs-medicare`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMedicarePerClaim() should POST to /uncollected-medicare-per-claim', () => {
    service.getUncollectedMedicarePerClaim(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/uncollected-medicare-per-claim`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMCRPerClaim() should POST to /uncollected-mcr-per-claim', () => {
    service.getUncollectedMCRPerClaim(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/uncollected-mcr-per-claim`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMedicarePerClaimMix() should POST to /uncollected-medicare-per-claim-mix', () => {
    service.getUncollectedMedicarePerClaimMix(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/uncollected-medicare-per-claim-mix`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getMedicareByCptGroup() should POST to /medicare-by-cpt-group', () => {
    service.getMedicareByCptGroup(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/medicare-by-cpt-group`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMedicareByCptGroup() should POST to /uncollected-medicare-by-cpt-group', () => {
    service.getUncollectedMedicareByCptGroup(VALID_PAYLOAD).subscribe();
    const req = http.expectOne(`${BASE}/analytics/medicare-dashboard/uncollected-medicare-by-cpt-group`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });
});
