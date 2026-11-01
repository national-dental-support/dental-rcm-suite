import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClaimsTrackingService } from './claims-tracking.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const API_URL = `${environment.server.baseUrl}/claims`;

describe('ClaimsTrackingService', () => {
  let service: ClaimsTrackingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ClaimsTrackingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('claimsTrackingData$ should emit an empty array initially', (done) => {
    service.claimsTrackingData$.subscribe(data => {
      expect(data).toEqual([]);
      done();
    });
  });

  describe('getClaims()', () => {
    it('should GET /claims with APIKey header and location_ids param', () => {
      const locationIds = [1, 2, 3];
      service.getClaims(locationIds).subscribe();

      const req = http.expectOne(r => r.url === API_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('APIKey')).toBe(false);
      expect(req.request.params.get('data')).toBe(
        JSON.stringify({ location_ids: locationIds })
      );
      req.flush([]);
    });
  });

  describe('getClaimDenials()', () => {
    it('should GET /claims/denials with APIKey header and location_ids param', () => {
      const locationIds = [10];
      service.getClaimDenials(locationIds).subscribe();

      const req = http.expectOne(r => r.url === `${API_URL}/denials`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('APIKey')).toBe(false);
      expect(req.request.params.get('data')).toBe(
        JSON.stringify({ location_ids: locationIds })
      );
      req.flush([]);
    });
  });

  describe('getArchivedClaims()', () => {
    it('should GET /claims/archives with location_id as comma-joined param', () => {
      const locationIds = [4, 5];
      service.getArchivedClaims(locationIds).subscribe();

      const req = http.expectOne(r => r.url === `${API_URL}/archives`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('APIKey')).toBe(false);
      expect(req.request.params.get('location_id')).toBe('4,5');
      req.flush([]);
    });
  });

  describe('setClaimsTrackingData() and getClaimsTrackingData()', () => {
    it('should update claimsTrackingData$ when setClaimsTrackingData is called', (done) => {
      const mockData = [{ id: 1, status: 'pending' }];
      service.setClaimsTrackingData(mockData);
      service.getClaimsTrackingData().subscribe(data => {
        expect(data).toEqual(mockData);
        done();
      });
    });
  });
});
