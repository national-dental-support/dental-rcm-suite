import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocationsService } from './ar-locations.service';
import { Filters } from '../models/ar-types';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = '/api';

const defaultFilters = {
  practice_groups: ['Group A'],
  location: ['Loc 1'],
  provider: [],
  startDate: '2026-01-01',
  endDate: '2026-01-31',
} as any;

describe('LocationsService', () => {
  let service: LocationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(LocationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('fetch()', () => {
    it('should POST to locations-and-groups with practiceGroups in body', () => {
      const mockResponse = {
        locations: ['Loc 1', 'Loc 2'],
        practiceGroups: ['Group A'],
      };

      service.fetch(['Group A']).subscribe(res => {
        expect(res).toEqual(mockResponse);
      });

      const req = http.expectOne(`${BASE}/analytics/lookups/locations-and-groups`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ practiceGroups: ['Group A'] });
      req.flush(mockResponse);
    });

    it('should return empty locations on error', () => {
      service.fetch(['Group A']).subscribe(res => {
        expect(res).toEqual({ locations: [], practiceGroups: [] });
      });

      const req = http.expectOne(`${BASE}/analytics/lookups/locations-and-groups`);
      req.error(new ErrorEvent('Network error'));
    });

    it('should return empty result for empty practiceGroups', () => {
      service.fetch([]).subscribe(res => {
        expect(res).toBeTruthy();
      });

      const req = http.expectOne(`${BASE}/analytics/lookups/locations-and-groups`);
      expect(req.request.body).toEqual({ practiceGroups: [] });
      req.flush({ locations: [], practiceGroups: [] });
    });
  });

  describe('fetchProviders()', () => {
    it('should POST to providers endpoint with practice_groups and locations', () => {
      service.fetchProviders(defaultFilters).subscribe(providers => {
        expect(providers).toEqual(['Dr. Smith', 'Dr. Jones']);
      });

      const req = http.expectOne(`${BASE}/analytics/lookups/providers`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        practice_groups: ['Group A'],
        locations: ['Loc 1'],
      });
      req.flush({ providers: ['Dr. Smith', 'Dr. Jones'] });
    });

    it('should return empty array on error', () => {
      service.fetchProviders(defaultFilters).subscribe(providers => {
        expect(providers).toEqual([]);
      });

      const req = http.expectOne(`${BASE}/analytics/lookups/providers`);
      req.error(new ErrorEvent('Network error'));
    });

    it('should return empty array when response has no providers field', () => {
      service.fetchProviders(defaultFilters).subscribe(providers => {
        expect(providers).toEqual([]);
      });

      const req = http.expectOne(`${BASE}/analytics/lookups/providers`);
      req.flush({});
    });

    it('should use empty arrays for undefined filter fields', () => {
      const filtersNoLocation = {
        practice_groups: [],
        location: undefined as any,
        provider: [],
        startDate: '',
        endDate: '',
      } as any;

      service.fetchProviders(filtersNoLocation).subscribe();

      const req = http.expectOne(`${BASE}/analytics/lookups/providers`);
      expect(req.request.body.locations).toEqual([]);
      req.flush({ providers: [] });
    });
  });
});
