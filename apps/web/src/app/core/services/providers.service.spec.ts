import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProvidersService } from './providers.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ProvidersService', () => {
  let service: ProvidersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ProvidersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- fetch() -----------------------------------------------------------------

  describe('fetch()', () => {
    it('should POST /api/analytics/lookups/providers with practiceGroups and locations', (done) => {
      service.fetch(['Group A', 'Group B'], ['Location 1']).subscribe(result => {
        expect(result).toEqual(['Dr. Smith', 'Dr. Jones']);
        done();
      });

      const req = http.expectOne(r => r.url === '/api/analytics/lookups/providers');
      expect(req.request.method).toBe('POST');
      expect(req.request.body.practiceGroups).toEqual(['Group A', 'Group B']);
      expect(req.request.body.locations).toEqual(['Location 1']);
      req.flush({ providers: ['Dr. Smith', 'Dr. Jones'] });
    });

    it('should handle empty arrays', (done) => {
      service.fetch([], []).subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === '/api/analytics/lookups/providers');
      expect(req.request.body.practiceGroups).toEqual([]);
      expect(req.request.body.locations).toEqual([]);
      req.flush({ providers: [] });
    });

    it('should handle null providers in response', (done) => {
      service.fetch([], []).subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === '/api/analytics/lookups/providers');
      req.flush({ providers: null });
    });
  });
});
