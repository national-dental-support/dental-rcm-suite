import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RcmService } from './rcm.service';
import { Filters } from '../models/rcm.models';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = `${environment.server.baseUrl}/analytics/rcm`;

const FILTERS: Filters = { practice_groups: 'all' } as any;

describe('RcmService', () => {
  let service: RcmService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [RcmService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(RcmService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getClaimsCount() should POST to /claims-count', () => {
    service.getClaimsCount(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/claims-count`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ filters: FILTERS });
    req.flush({ count: 100 });
  });

  it('getGrossProduction() should POST to /gross-production', () => {
    service.getGrossProduction(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/gross-production`);
    expect(req.request.method).toBe('POST');
    req.flush({ total: 5000000 });
  });

  it('getCollectionRate() should POST to /collection-rate', () => {
    service.getCollectionRate(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/collection-rate`);
    expect(req.request.method).toBe('POST');
    req.flush({ rate: 0.92 });
  });

  it('getRevenueByPractice() should POST to /revenue-by-practice with all args', () => {
    service.getRevenueByPractice(FILTERS, { field: 'name', dir: 'asc' }, 1, 20).subscribe();
    const req = http.expectOne(`${BASE}/revenue-by-practice`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ filters: FILTERS, sort: { field: 'name', dir: 'asc' }, page: 1, pageSize: 20 });
    req.flush([]);
  });

  it('getLookups() should POST to /lookups', () => {
    service.getLookups('all').subscribe();
    const req = http.expectOne(`${BASE}/lookups`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ practice_groups: 'all' });
    req.flush({});
  });

  it('getClaimValueByStatus() should POST to /claim-value-by-status', () => {
    service.getClaimValueByStatus(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/claim-value-by-status`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getClaimAmountsByPractice() should POST to /claim-amounts-by-practice', () => {
    service.getClaimAmountsByPractice(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/claim-amounts-by-practice`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getCollectionAdjustmentTrends() should POST to /collection-adjustment-trends', () => {
    service.getCollectionAdjustmentTrends(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/collection-adjustment-trends`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getClaimAmountsByPayer() should POST to /claim-amounts-by-payer', () => {
    service.getClaimAmountsByPayer(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/claim-amounts-by-payer`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('getClaimValuesByType() should POST to /claim-values-by-type', () => {
    service.getClaimValuesByType(FILTERS).subscribe();
    const req = http.expectOne(`${BASE}/claim-values-by-type`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });
});
