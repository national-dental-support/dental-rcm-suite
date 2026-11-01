import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GlobalFilterOptionsService } from './global-filter-options.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('GlobalFilterOptionsService', () => {
  let service: GlobalFilterOptionsService;
  let http: HttpTestingController;

  const payersUrl = `${environment.server.baseUrl}/payers`;
  const practicesUrl = `${environment.server.baseUrl}/practices`;
  const providersUrl = `${environment.server.baseUrl}/providers`;
  const locationsUrl = `${environment.server.baseUrl}/locations`;
  const groupsUrl = `${environment.server.baseUrl}/groups`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(GlobalFilterOptionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getGlobalFilterOptions', () => {
    it('should make parallel GET requests to all four endpoints', () => {
      service.getGlobalFilterOptions().subscribe(opts => {
        expect(opts.payers).toEqual(['Aetna', 'BCBS']);
        expect(opts.practices).toEqual(['Main', 'North']);
        expect(opts.providers).toEqual(['Dr. Smith']);
        expect(opts.locations).toEqual(['Location A']);
        expect(opts.groups).toEqual([]);
      });

      const payersReq = http.expectOne(payersUrl);
      const practicesReq = http.expectOne(practicesUrl);
      const providersReq = http.expectOne(providersUrl);
      const locationsReq = http.expectOne(locationsUrl);
      const groupsReq = http.expectOne(groupsUrl);

      expect(payersReq.request.method).toBe('GET');
      expect(practicesReq.request.method).toBe('GET');
      expect(providersReq.request.method).toBe('GET');
      expect(locationsReq.request.method).toBe('GET');
      expect(groupsReq.request.method).toBe('GET');

      payersReq.flush({ data: ['Aetna', 'BCBS'] });
      practicesReq.flush({ data: ['Main', 'North'] });
      providersReq.flush({ data: ['Dr. Smith'] });
      locationsReq.flush({ data: ['Location A'] });
      groupsReq.flush({ data: [] });
    });

    it('should always set groups to empty array', () => {
      service.getGlobalFilterOptions().subscribe(opts => {
        expect(opts.groups).toEqual([]);
      });

      http.expectOne(payersUrl).flush({ data: [] });
      http.expectOne(practicesUrl).flush({ data: [] });
      http.expectOne(providersUrl).flush({ data: [] });
      http.expectOne(locationsUrl).flush({ data: [] });
      http.expectOne(groupsUrl).flush({ data: [] });
    });
  });
});
