import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MedicareDashboardDataService } from './medicare-dashboard-data.service';
import { Filters } from '../models/medicare-dashboard.types';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE_URL = environment.server.baseUrl;
// Replicate the service's computeApiBase logic
function computeApiBase(baseUrl: string): string {
  const b = (baseUrl || '').replace(/\/+$/, '');
  if (b.endsWith('/api/analytics')) return b;
  if (b.endsWith('/api')) return `${b}/analytics`;
  return `${b}/api/analytics`;
}
const API_BASE = computeApiBase(BASE_URL);
const MEDICARE_BASE = `${API_BASE}/medicare-dashboard`;
const LOOKUPS_BASE = `${API_BASE}/lookups`;

const FILTERS: Filters = {} as any;

describe('MedicareDashboardDataService', () => {
  let service: MedicareDashboardDataService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [MedicareDashboardDataService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(MedicareDashboardDataService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getPracticeGroups() should POST to lookups/locations-and-groups and extract practice_groups', () => {
    service.getPracticeGroups().subscribe(res => expect(res).toEqual(['Group A']));
    const req = http.expectOne(`${LOOKUPS_BASE}/locations-and-groups`);
    expect(req.request.method).toBe('POST');
    req.flush({ practice_groups: ['Group A'] });
  });

  it('getPracticeGroups() should return [] on error', () => {
    service.getPracticeGroups().subscribe(res => expect(res).toEqual([]));
    http.expectOne(`${LOOKUPS_BASE}/locations-and-groups`).flush('err', { status: 500, statusText: 'Error' });
  });

  it('getLocations() should POST to lookups/locations-and-groups and extract locations', () => {
    service.getLocations(['Group A']).subscribe(res => expect(res).toEqual(['Dallas']));
    const req = http.expectOne(`${LOOKUPS_BASE}/locations-and-groups`);
    expect(req.request.method).toBe('POST');
    req.flush({ locations: ['Dallas'] });
  });

  it('getProviders() should POST to lookups/providers and extract providers', () => {
    service.getProviders(FILTERS).subscribe(res => expect(res).toEqual(['Dr. Smith']));
    const req = http.expectOne(`${LOOKUPS_BASE}/providers`);
    expect(req.request.method).toBe('POST');
    req.flush({ providers: ['Dr. Smith'] });
  });

  it('getCptAndClaimCounts() should POST to /procedure-and-claim-counts', () => {
    service.getCptAndClaimCounts(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/procedure-and-claim-counts`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getChargesVsMedicare() should POST to /charges-vs-medicare', () => {
    service.getChargesVsMedicare(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/charges-vs-medicare`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getPaymentsVsMedicare() should POST to /payments-vs-medicare', () => {
    service.getPaymentsVsMedicare(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/payments-vs-medicare`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMedicarePerClaim() should POST to /uncollected-medicare-per-claim', () => {
    service.getUncollectedMedicarePerClaim(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/uncollected-medicare-per-claim`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMCRPerClaim() should POST to /uncollected-mcr-per-claim', () => {
    service.getUncollectedMCRPerClaim(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/uncollected-mcr-per-claim`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMedicarePerClaimMix() should POST to /uncollected-medicare-per-claim-mix', () => {
    service.getUncollectedMedicarePerClaimMix(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/uncollected-medicare-per-claim-mix`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getMedicareByCptGroup() should POST to /medicare-by-cpt-group', () => {
    service.getMedicareByCptGroup(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/medicare-by-cpt-group`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getUncollectedMedicareByCptGroup() should POST to /uncollected-medicare-by-cpt-group', () => {
    service.getUncollectedMedicareByCptGroup(FILTERS).subscribe();
    const req = http.expectOne(`${MEDICARE_BASE}/uncollected-medicare-by-cpt-group`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('setCustomerId() should update the internal customerId', () => {
    service.setCustomerId('99');
    expect(service['customerId']).toBe('99');
  });
});
