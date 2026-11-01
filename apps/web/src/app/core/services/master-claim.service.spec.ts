import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MasterClaimService } from './master-claim.service';
import { MasterClaimResponse } from '../models/master-claim.model';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('MasterClaimService', () => {
  let service: MasterClaimService;
  let http: HttpTestingController;
  const baseUrl = `${environment.server.baseUrl}/claims`;

  const mockResponse: MasterClaimResponse = {
    claim: {
      id: 'CL50001',
      guid: 'abc-123-def',
      patientId: 'PAT-001',
      payerId: 10,
      providerId: 5,
      dateOfService: '2026-01-15',
      chargeAmount: 1500.00,
      submittedDate: '2026-01-16',
      insuranceClaimId: 'INS-001',
      customerId: 1,
    },
    enrichments: {
      'denial-iq': { available: true },
      'recon-iq': { available: false },
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(MasterClaimService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Clear cache between tests
    service.clearCache();
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getClaim', () => {
    it('should GET /claims/:id on the first call', () => {
      service.getClaim('CL50001').subscribe(res => {
        expect(res).toEqual(mockResponse);
      });

      const req = http.expectOne(`${baseUrl}/CL50001`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should return cached response on subsequent call without HTTP request', () => {
      // First call - populates cache
      service.getClaim('CL50001').subscribe();
      http.expectOne(`${baseUrl}/CL50001`).flush(mockResponse);

      // Second call - should use cache
      service.getClaim('CL50001').subscribe(res => {
        expect(res).toEqual(mockResponse);
      });
      http.expectNone(`${baseUrl}/CL50001`);
    });

    it('should cache different claim IDs independently', () => {
      const otherResponse: MasterClaimResponse = {
        ...mockResponse,
        claim: { ...mockResponse.claim, id: 'CL50002' },
      };

      service.getClaim('CL50001').subscribe();
      http.expectOne(`${baseUrl}/CL50001`).flush(mockResponse);

      service.getClaim('CL50002').subscribe(res => {
        expect(res.claim.id).toBe('CL50002');
      });
      http.expectOne(`${baseUrl}/CL50002`).flush(otherResponse);
    });

    it('should make a new HTTP request after clearCache()', () => {
      // First call
      service.getClaim('CL50001').subscribe();
      http.expectOne(`${baseUrl}/CL50001`).flush(mockResponse);

      // Clear cache
      service.clearCache();

      // Second call after clear - should make a new request
      service.getClaim('CL50001').subscribe(res => {
        expect(res).toEqual(mockResponse);
      });
      const req = http.expectOne(`${baseUrl}/CL50001`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should handle different claim ID formats (CLM prefix)', () => {
      const clmResponse: MasterClaimResponse = {
        ...mockResponse,
        claim: { ...mockResponse.claim, id: 'CLM00001' },
      };

      service.getClaim('CLM00001').subscribe(res => {
        expect(res.claim.id).toBe('CLM00001');
      });

      const req = http.expectOne(`${baseUrl}/CLM00001`);
      expect(req.request.method).toBe('GET');
      req.flush(clmResponse);
    });
  });

  describe('clearCache', () => {
    it('should not throw when cache is already empty', () => {
      expect(() => service.clearCache()).not.toThrow();
    });

    it('should clear all cached entries', () => {
      // Populate cache with two entries
      service.getClaim('CL50001').subscribe();
      http.expectOne(`${baseUrl}/CL50001`).flush(mockResponse);

      service.getClaim('CL50002').subscribe();
      http.expectOne(`${baseUrl}/CL50002`).flush(mockResponse);

      service.clearCache();

      // Both should require new HTTP calls
      service.getClaim('CL50001').subscribe();
      http.expectOne(`${baseUrl}/CL50001`).flush(mockResponse);

      service.getClaim('CL50002').subscribe();
      http.expectOne(`${baseUrl}/CL50002`).flush(mockResponse);
    });
  });
});
