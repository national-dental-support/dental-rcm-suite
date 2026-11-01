import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClaimsService } from './claims.service';
import { environment } from '../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ClaimsService', () => {
  let service: ClaimsService;
  let httpMock: HttpTestingController;
  const apiUrl = `${environment.server.baseUrl}/claims`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [ClaimsService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});

    service = TestBed.inject(ClaimsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getClaims() should POST to the claims endpoint', () => {
    const requestData = { status: 'open', page: 1 };
    const mockResponse = { claims: [], total: 0 };

    service.getClaims(requestData).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(apiUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(requestData);
    req.flush(mockResponse);
  });

  it('getClaims() should not send APIKey header', () => {
    service.getClaims({}).subscribe();

    const req = httpMock.expectOne(apiUrl);
    expect(req.request.headers.has('APIKey')).toBe(false);
    req.flush([]);
  });

  it('getClaims() should handle empty body', () => {
    let result: any;
    service.getClaims({}).subscribe(r => result = r);

    const req = httpMock.expectOne(apiUrl);
    req.flush([]);
    expect(result).toEqual([]);
  });
});
