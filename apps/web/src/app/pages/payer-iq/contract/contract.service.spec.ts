import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ContractService } from './contract.service';

describe('ContractService', () => {
  let service: ContractService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ContractService],
    });
    service = TestBed.inject(ContractService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getContracts -----------------------------------------------------------

  it('getContracts should GET /api/payer-iq/contracts and return data array', () => {
    const mock = [{ PayerContractID: 1, PayerName: 'Aetna' }];
    let result: any[] | undefined;

    service.getContracts().subscribe(d => (result = d));

    const req = httpMock.expectOne('/api/payer-iq/contracts');
    expect(req.request.method).toBe('GET');
    req.flush({ data: mock });

    expect(result).toEqual(mock);
  });

  it('getContracts should return empty array when data is missing', () => {
    let result: any[] | undefined;
    service.getContracts().subscribe(d => (result = d));
    httpMock.expectOne('/api/payer-iq/contracts').flush({});
    expect(result).toEqual([]);
  });

  // -- getFeeSchedule ---------------------------------------------------------

  it('getFeeSchedule should GET /:id/fee-schedule', () => {
    const mock = [{ ProcedureCode: 'D0120', ContractedRate: 54 }];
    let result: any[] | undefined;

    service.getFeeSchedule(1).subscribe(d => (result = d));

    const req = httpMock.expectOne('/api/payer-iq/contracts/1/fee-schedule');
    expect(req.request.method).toBe('GET');
    req.flush({ data: mock });

    expect(result).toEqual(mock);
  });

  // -- getRoutingArbitrage ----------------------------------------------------

  it('getRoutingArbitrage should GET /routing-arbitrage without filter', () => {
    let result: any[] | undefined;
    service.getRoutingArbitrage().subscribe(d => (result = d));

    const req = httpMock.expectOne(r => r.url === '/api/payer-iq/contracts/routing-arbitrage');
    req.flush({ data: [{ payerId: 1 }] });
    expect(result?.length).toBe(1);
  });

  it('getRoutingArbitrage should include cpt_code param when provided', () => {
    service.getRoutingArbitrage('D0120').subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/payer-iq/contracts/routing-arbitrage');
    expect(req.request.params.get('cpt_code')).toBe('D0120');
    req.flush({ data: [] });
  });

  it('getRoutingArbitrage should not include cpt_code param when empty', () => {
    service.getRoutingArbitrage('').subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/payer-iq/contracts/routing-arbitrage');
    expect(req.request.params.has('cpt_code')).toBeFalse();
    req.flush({ data: [] });
  });

  // -- getSavingsSummary ------------------------------------------------------

  it('getSavingsSummary should GET /savings-summary with default 90 days', () => {
    let result: any;
    service.getSavingsSummary().subscribe(d => (result = d));

    const req = httpMock.expectOne(r => r.url === '/api/payer-iq/contracts/savings-summary');
    expect(req.request.params.get('days')).toBe('90');
    req.flush({ data: { TotalClaims: 100 } });

    expect(result.TotalClaims).toBe(100);
  });

  it('getSavingsSummary should pass custom days param', () => {
    service.getSavingsSummary(30).subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/payer-iq/contracts/savings-summary');
    expect(req.request.params.get('days')).toBe('30');
    req.flush({ data: {} });
  });

  // -- getRoutingPaths --------------------------------------------------------

  it('getRoutingPaths should GET /:id/routing-paths', () => {
    const mock = [{ LeaseNetworkKey: 'Availity-Direct' }];
    let result: any[] | undefined;

    service.getRoutingPaths(5).subscribe(d => (result = d));

    const req = httpMock.expectOne('/api/payer-iq/contracts/5/routing-paths');
    expect(req.request.method).toBe('GET');
    req.flush({ data: mock });

    expect(result).toEqual(mock);
  });

  it('getRoutingPaths should return empty array when data missing', () => {
    let result: any[] | undefined;
    service.getRoutingPaths(5).subscribe(d => (result = d));
    httpMock.expectOne('/api/payer-iq/contracts/5/routing-paths').flush({});
    expect(result).toEqual([]);
  });
});
