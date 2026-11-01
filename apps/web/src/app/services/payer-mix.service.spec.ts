import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PayerMixService } from './payer-mix.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { environment } from '../../environments/environment';

describe('PayerMixService (src/app/services)', () => {
  let service: PayerMixService;
  let httpMock: HttpTestingController;
  const apiUrl = `${environment.server.baseUrl}/analytics/payer-mix`;
  const mockRequest: any = { startDate: '2025-01-01', endDate: '2025-12-31' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        PayerMixService,
      ],
    });
    service = TestBed.inject(PayerMixService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getInsuranceCollections -----------------------------------------------

  describe('getInsuranceCollections()', () => {
    it('should return mapped total and prior_year', () => {
      let result: any;
      service.getInsuranceCollections(mockRequest).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${apiUrl}/insurance-collections`);
      expect(req.request.method).toBe('POST');
      req.flush({ total: 50000, prior_year: 45000 });

      expect(result.total).toBe(50000);
      expect(result.prior_year).toBe(45000);
    });

    it('should use ?? null fallback when total and prior_year are missing', () => {
      let result: any;
      service.getInsuranceCollections(mockRequest).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${apiUrl}/insurance-collections`);
      req.flush({});

      expect(result.total).toBeNull();
      expect(result.prior_year).toBeNull();
    });

    it('should throw error on HTTP error (catchError path)', () => {
      let error: any;
      service.getInsuranceCollections(mockRequest).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${apiUrl}/insurance-collections`);
      req.flush('Error', { status: 500, statusText: 'Server Error' });

      expect(error).toBeTruthy();
      expect(error.message).toContain('Failed to fetch insurance collections');
    });
  });

  // -- getPatientCollections -------------------------------------------------

  describe('getPatientCollections()', () => {
    it('should return mapped total and prior_year', () => {
      let result: any;
      service.getPatientCollections(mockRequest).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${apiUrl}/patient-collections`);
      expect(req.request.method).toBe('POST');
      req.flush({ total: 10000, prior_year: 9000 });

      expect(result.total).toBe(10000);
      expect(result.prior_year).toBe(9000);
    });

    it('should use ?? null fallback when fields are missing', () => {
      let result: any;
      service.getPatientCollections(mockRequest).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${apiUrl}/patient-collections`);
      req.flush({});

      expect(result.total).toBeNull();
      expect(result.prior_year).toBeNull();
    });

    it('should throw error on HTTP error (catchError path)', () => {
      let error: any;
      service.getPatientCollections(mockRequest).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${apiUrl}/patient-collections`);
      req.flush('Error', { status: 500, statusText: 'Server Error' });

      expect(error).toBeTruthy();
      expect(error.message).toContain('Failed to fetch patient collections');
    });
  });

  // -- getCollectionTrends ---------------------------------------------------

  describe('getCollectionTrends()', () => {
    it('should return trend data', () => {
      const mockTrend = [{ month: 'Jan', amount: 5000 }];
      let result: any;
      service.getCollectionTrends(mockRequest).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${apiUrl}/collection-trends`);
      expect(req.request.method).toBe('POST');
      req.flush(mockTrend);

      expect(result).toEqual(mockTrend);
    });

    it('should throw error on HTTP error (catchError path)', () => {
      let error: any;
      service.getCollectionTrends(mockRequest).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${apiUrl}/collection-trends`);
      req.flush('Error', { status: 500, statusText: 'Server Error' });

      expect(error).toBeTruthy();
      expect(error.message).toContain('Failed to fetch collection trends');
    });
  });
});
