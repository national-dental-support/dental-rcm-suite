import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PayerIqStrategyService, BuilderInfoResponseDto } from './payer-iq-strategy.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('PayerIqStrategyService', () => {
  let service: PayerIqStrategyService;
  let httpMock: HttpTestingController;
  const baseUrl = '/api/payer-iq/strategy/builder-info';

  const mockResponse: BuilderInfoResponseDto = {
    message: 'ok',
    filters: { payerContractId: 1, start: '2024-01-01', end: '2024-12-31' },
    summary: {
      underpaymentCount: 5,
      underpaymentDollars: 1500,
      avgPaymentLagDays: 12,
      totalDenials: 3,
    },
    rows: [
      {
        payerContractId: 1,
        cpt: '99213',
        volume: 100,
        currentAllowed: 150,
        avgPaid: 130,
        totalCharges: 15000,
        underpaidDollars: 2000,
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PayerIqStrategyService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});

    service = TestBed.inject(PayerIqStrategyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getBuilderInfo() should GET the builder-info endpoint', () => {
    service.getBuilderInfo({ payerContractId: 1 }).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(r => r.url === baseUrl);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('getBuilderInfo() should include payerContractId as query param', () => {
    service.getBuilderInfo({ payerContractId: 42 }).subscribe();

    const req = httpMock.expectOne(r => r.url === baseUrl);
    expect(req.request.params.get('payerContractId')).toBe('42');
    req.flush(mockResponse);
  });

  it('getBuilderInfo() should include start param when provided', () => {
    service.getBuilderInfo({ payerContractId: 1, start: '2024-01-01' }).subscribe();

    const req = httpMock.expectOne(r => r.url === baseUrl);
    expect(req.request.params.get('start')).toBe('2024-01-01');
    req.flush(mockResponse);
  });

  it('getBuilderInfo() should include end param when provided', () => {
    service.getBuilderInfo({ payerContractId: 1, end: '2024-12-31' }).subscribe();

    const req = httpMock.expectOne(r => r.url === baseUrl);
    expect(req.request.params.get('end')).toBe('2024-12-31');
    req.flush(mockResponse);
  });

  it('getBuilderInfo() should not include start param when not provided', () => {
    service.getBuilderInfo({ payerContractId: 1 }).subscribe();

    const req = httpMock.expectOne(r => r.url === baseUrl);
    expect(req.request.params.has('start')).toBeFalse();
    req.flush(mockResponse);
  });

  it('getBuilderInfo() should not include end param when not provided', () => {
    service.getBuilderInfo({ payerContractId: 1 }).subscribe();

    const req = httpMock.expectOne(r => r.url === baseUrl);
    expect(req.request.params.has('end')).toBeFalse();
    req.flush(mockResponse);
  });

  it('getBuilderInfo() should include both start and end when both provided', () => {
    service.getBuilderInfo({ payerContractId: 5, start: '2023-01-01', end: '2023-12-31' }).subscribe();

    const req = httpMock.expectOne(r => r.url === baseUrl);
    expect(req.request.params.get('payerContractId')).toBe('5');
    expect(req.request.params.get('start')).toBe('2023-01-01');
    expect(req.request.params.get('end')).toBe('2023-12-31');
    req.flush(mockResponse);
  });
});
