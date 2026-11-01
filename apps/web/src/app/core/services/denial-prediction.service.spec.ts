import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DenialPredictionService, RiskSummary, HighRiskClaim, PayerRisk, ReasonRisk, RiskTrendPoint, ClaimRiskScore } from './denial-prediction.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('DenialPredictionService', () => {
  let service: DenialPredictionService;
  let http: HttpTestingController;
  const BASE = '/api/insightflow/predictions';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(DenialPredictionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getRiskSummary() --------------------------------------------------------

  describe('getRiskSummary()', () => {
    it('should GET /risk-summary and extract data', (done) => {
      const summary: RiskSummary = {
        highRisk: 10, mediumRisk: 20, lowRisk: 70,
        totalScored: 100, avgRiskScore: 45,
        highRiskCharges: 50000, totalCharges: 500000,
        highRiskPrecision: 0.85,
      };

      service.getRiskSummary().subscribe(result => {
        expect(result.highRisk).toBe(10);
        expect(result.totalScored).toBe(100);
        expect(result.highRiskPrecision).toBe(0.85);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/risk-summary`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: summary });
    });
  });

  // -- getHighRiskClaims() -----------------------------------------------------

  describe('getHighRiskClaims()', () => {
    it('should GET /high-risk-claims with default limit=50', (done) => {
      const claims: Partial<HighRiskClaim>[] = [
        { claimId: 'CL5001', riskScore: 92, riskTier: 'High', chargeAmt: 1500 },
      ];

      service.getHighRiskClaims().subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].riskScore).toBe(92);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/high-risk-claims`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('limit')).toBe('50');
      req.flush({ data: claims });
    });

    it('should accept custom limit', () => {
      service.getHighRiskClaims(10).subscribe();

      const req = http.expectOne(r => r.url === `${BASE}/high-risk-claims`);
      expect(req.request.params.get('limit')).toBe('10');
      req.flush({ data: [] });
    });

    it('should handle null data', (done) => {
      service.getHighRiskClaims().subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/high-risk-claims`);
      req.flush({ data: null });
    });
  });

  // -- getRiskByPayer() --------------------------------------------------------

  describe('getRiskByPayer()', () => {
    it('should GET /risk-by-payer', (done) => {
      const payers: Partial<PayerRisk>[] = [
        { payerName: 'Aetna', denialRate: 0.15, riskTier: 'High' },
      ];

      service.getRiskByPayer().subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].payerName).toBe('Aetna');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/risk-by-payer`);
      req.flush({ data: payers });
    });

    it('should handle null data', (done) => {
      service.getRiskByPayer().subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/risk-by-payer`);
      req.flush({ data: null });
    });
  });

  // -- getRiskByReason() -------------------------------------------------------

  describe('getRiskByReason()', () => {
    it('should GET /risk-by-reason', (done) => {
      const reasons: Partial<ReasonRisk>[] = [
        { carcCode: 'CO-4', deniedClaims: 50, recoveryRate: 0.6 },
      ];

      service.getRiskByReason().subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].carcCode).toBe('CO-4');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/risk-by-reason`);
      req.flush({ data: reasons });
    });
  });

  // -- getRiskTrend() ----------------------------------------------------------

  describe('getRiskTrend()', () => {
    it('should GET /risk-trend', (done) => {
      const trend: RiskTrendPoint[] = [
        { period: '2025-01', totalClaims: 100, highRiskClaims: 10, avgRiskScore: 42 },
        { period: '2025-02', totalClaims: 110, highRiskClaims: 12, avgRiskScore: 44 },
      ];

      service.getRiskTrend().subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].period).toBe('2025-01');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/risk-trend`);
      req.flush({ data: trend });
    });
  });

  // -- scoreClaimById() --------------------------------------------------------

  describe('scoreClaimById()', () => {
    it('should GET /score/:claimId', (done) => {
      const score: Partial<ClaimRiskScore> = {
        claimId: 'CL5001', riskScore: 88, riskTier: 'High',
        riskFactors: ['High payer denial rate', 'Historically denied CPT'],
      };

      service.scoreClaimById('CL5001').subscribe(result => {
        expect(result.riskScore).toBe(88);
        expect(result.riskFactors.length).toBe(2);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/score/CL5001`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: score });
    });

    it('should encode special characters in claimId', () => {
      service.scoreClaimById('CL 5001').subscribe();

      const req = http.expectOne(r => r.url === `${BASE}/score/CL%205001`);
      req.flush({ data: { claimId: 'CL 5001', riskScore: 50 } });
    });
  });
});
