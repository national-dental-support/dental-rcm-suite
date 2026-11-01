import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ArDataService } from './ar-data.service';
import { Filters, ArSort } from '../models/ar-types';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = '/api';
const defaultFilters = {
  practice_groups: [],
  location: [],
  provider: [],
  startDate: '2026-01-01',
  endDate: '2026-01-31',
} as any;
const defaultSort = { column: 'practice', direction: 'asc' } as any;

function flushDefaults(http: HttpTestingController): void {
  http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
  http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
  http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
  http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
  http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
  http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
}

describe('ArDataService', () => {
  let service: ArDataService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ArDataService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('fetch()', () => {
    it('should POST to all six AR endpoints and combine results', () => {
      const emptyArData$ = service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data).toBeTruthy();
        // arBalance comes from ar-balance endpoint total
        expect(data.arBalance).toBe(1_700_000);
        expect(data.priorYearARBalance).toBe(0);
        expect(data.averageDaysInAR).toBe(118);
      });

      const summaryReq = http.expectOne(`${BASE}/analytics/ar/ar-summary`);
      expect(summaryReq.request.method).toBe('POST');
      expect(summaryReq.request.body).toEqual({ filters: defaultFilters, sort: defaultSort });
      summaryReq.flush({ ar_aging: null, ar_trends: null, ar_specialty: null });

      const balanceReq = http.expectOne(`${BASE}/analytics/ar/ar-balance`);
      expect(balanceReq.request.method).toBe('POST');
      balanceReq.flush({ total: '$1.70M', prior_year: null });

      const daysReq = http.expectOne(`${BASE}/analytics/ar/ar-days`);
      expect(daysReq.request.method).toBe('POST');
      daysReq.flush({ total: '118', prior_year: null });

      const breakdownReq = http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`);
      expect(breakdownReq.request.method).toBe('POST');
      breakdownReq.flush({ data: [] });

      const distributionReq = http.expectOne(`${BASE}/analytics/ar/ar-distribution`);
      expect(distributionReq.request.method).toBe('POST');
      distributionReq.flush({ rows: [] });

      const daysByPracticeReq = http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`);
      expect(daysByPracticeReq.request.method).toBe('POST');
      daysByPracticeReq.flush({ rows: [] });
    });

    it('should handle errors gracefully (catchError returns empty/defaults)', () => {
      let result: any;
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        result = data;
      });

      // Critical endpoints have no catchError - flush with empty data
      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});

      // Non-critical endpoints have catchError - error them to verify defaults are used
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).error(new ErrorEvent('Network error'));
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).error(new ErrorEvent('Network error'));
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).error(new ErrorEvent('Network error'));

      expect(result).toBeTruthy();
      expect(result.arBalance).toBe(0);
      expect(result.averageDaysInAR).toBe(0);
    });

    it('should parse K suffix correctly', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.arBalance).toBeCloseTo(573_470, 0);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({ total: '$573.47K' });
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should include aging data when summary provides it', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.agingData).toBeTruthy();
        expect(data.agingData!.total).toBeGreaterThan(0);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_aging: {
          total: 100000,
          details: [
            { category: '0-30', value: 50000, percentage: 50 },
            { category: '31-60', value: 50000, percentage: 50 },
          ],
        },
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should return null agingData when aging details are all zero', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        // zero-value details get filtered out -> empty details -> agingData null
        expect(data.agingData).toBeNull();
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_aging: { total: 0, details: [{ category: '0-30', value: 0, percentage: 0 }] },
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should include specialty data when summary provides it', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect((data as any).specialtyData).toBeTruthy();
        expect((data as any).specialtyData.details.length).toBe(2);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_specialty: {
          total: 200000,
          details: [
            { category: 'General', value: 120000, percentage: 60 },
            { category: 'Specialist', value: 80000, percentage: 40 },
          ],
        },
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should return null specialtyData when specialty details are empty', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect((data as any).specialtyData).toBeNull();
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_specialty: { total: 0, details: [] },
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should include breakdown when collections data is present', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect((data as any).breakdown).toBeTruthy();
        expect((data as any).breakdown.rows.length).toBe(1);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({
        data: [{
          practice: 'Main St',
          numCollections: 100,
          insuranceCollections: 50000,
          patientCollections: 10000,
          grossCollections: 60000,
          collectionRate: 0.85,
          productionAdjustment: 5000,
          collectionAdjustment: 2000,
          refund: 1000,
          insuranceBilled: 75000,
        }],
      });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should include distribution table when distribution rows are present', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect((data as any).distribution).toBeTruthy();
        expect((data as any).distribution.rows.length).toBe(1);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({
        rows: [{
          AgingBracket: '0-30',
          NumAccts_LT0: 5, ARBalance_LT0: -100,
          NumAccts_0_1000: 10, ARBalance_0_1000: 5000,
          NumAccts_1001_2000: 3, ARBalance_1001_2000: 4500,
          NumAccts_GT2000: 2, ARBalance_GT2000: 8000,
        }],
      });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should include daysInARByPractice when rows are present', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect((data as any).daysInARByPractice).toBeTruthy();
        expect((data as any).daysInARByPractice.rows.length).toBe(1);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({
        rows: [{ operations: 'Main St', currentYear: 45, previousYear: 50 }],
      });
    });

    it('should parse M suffix correctly', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.arBalance).toBeCloseTo(2_500_000, 0);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({ total: '2.5M' });
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should handle numeric input to toNumber directly', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.averageDaysInAR).toBe(45);
        expect(data.priorYearAverageDaysInAR).toBe(50);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({ total: 45, prior_year: 50, last_12_months: 42 });
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should handle trend data in summary', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.trendsData.details.length).toBe(2);
        expect((data.trendsData.details[0] as any).month).toBe('2025-01');
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_trends: {
          details: [
            { month: '2025-01', total_0_30: 10000, total_31_60: 5000, total_61_90: 3000, total_over_90: 2000 },
            { month: '2025-02', total_0_30: 12000, total_31_60: 6000, total_61_90: 4000, total_over_90: 1000 },
          ],
        },
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should filter out trend rows with empty month', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.trendsData.details.length).toBe(1);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_trends: {
          details: [
            { month: '2025-01', total_0_30: 10000, total_31_60: 5000, total_61_90: 3000, total_over_90: 2000 },
            { month: '', total_0_30: 5000, total_31_60: 2000, total_61_90: 1000, total_over_90: 500 },
          ],
        },
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should handle last_12_months as null for days', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.last12MonthsDaysInAR).toBeNull();
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({ total: 30, prior_year: 35 }); // no last_12_months
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should handle invalid string in toNumber', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.arBalance).toBe(0);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({ total: 'invalid_nan_string' });
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should build breakdown when breakdownRes has rows', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect((data as any).breakdown).toBeDefined();
        expect((data as any).breakdown).not.toBeNull();
        expect((data as any).breakdown.rows.length).toBe(1);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({ total: 50000 });
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({ total: 30 });
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({
        data: [{
          practice: 'Main Office', numCollections: 120, insuranceCollections: 80000,
          patientCollections: 20000, grossCollections: 100000, collectionRate: 0.95,
          productionAdjustment: 5000, collectionAdjustment: 2000, refund: 500, insuranceBilled: 110000
        }]
      });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should build daysInARByPractice when rows exist', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect((data as any).daysInARByPractice).toBeDefined();
        expect((data as any).daysInARByPractice).not.toBeNull();
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({
        rows: [{ operations: 'Main', currentYear: 35, previousYear: 38 }]
      });
    });

    it('should build specialty data when specialtyDetails exist', () => {
      service.fetch(defaultFilters, defaultSort).subscribe((data: any) => {
        expect(data.specialtyData).toBeDefined();
        expect(data.specialtyData).not.toBeNull();
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_specialty: {
          total: 200000,
          details: [
            { category: 'General', value: 120000, percentage: 60 },
            { category: 'Specialty', value: 80000, percentage: 40 },
          ]
        }
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should include last_12_months for days when provided', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.last12MonthsDaysInAR).toBe(28);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({ total: 30, prior_year: 35, last_12_months: 28 });
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should build breakdown table with actual rows', () => {
      service.fetch(defaultFilters, defaultSort).subscribe((data: any) => {
        expect(data.breakdown).not.toBeNull();
        expect(data.breakdown.columns.length).toBeGreaterThan(0);
        expect(data.breakdown.rows.length).toBe(2);
        expect(data.breakdown.rows[0].practice).toBe('Main Practice');
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({
        data: [
          {
            practice: 'Main Practice', numCollections: 100, insuranceCollections: 50000,
            patientCollections: 10000, grossCollections: 60000, collectionRate: 85.5,
            productionAdjustment: 5000, collectionAdjustment: 1000, refund: 500, insuranceBilled: 70000,
          },
          {
            practice: 'East Branch', numCollections: 50, insuranceCollections: 25000,
            patientCollections: 5000, grossCollections: 30000, collectionRate: null,
            productionAdjustment: 2000, collectionAdjustment: 500, refund: 200, insuranceBilled: 35000,
          },
        ]
      });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should build daysInARByPractice table with actual rows', () => {
      service.fetch(defaultFilters, defaultSort).subscribe((data: any) => {
        expect(data.daysInARByPractice).not.toBeNull();
        expect(data.daysInARByPractice.columns.length).toBe(3);
        expect(data.daysInARByPractice.rows.length).toBe(2);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({
        rows: [
          { operations: 'Main', currentYear: 35, previousYear: 40 },
          { operations: 'East', currentYear: 28, previousYear: 32 },
        ]
      });
    });

    it('should build distribution table with actual rows and null field fallbacks', () => {
      service.fetch(defaultFilters, defaultSort).subscribe((data: any) => {
        expect(data.distribution).not.toBeNull();
        expect(data.distribution.columns.length).toBeGreaterThan(0);
        expect(data.distribution.rows[0].agingBracket).toBe('0-30');
        expect(data.distribution.rows[0].numAcctsLT0).toBe(0); // null -> 0
        expect(data.distribution.rows[0].arBalanceLT0).toBe(5000);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({
        rows: [
          {
            AgingBracket: '0-30',
            NumAccts_LT0: null, ARBalance_LT0: 5000,
            NumAccts_0_1000: 10, ARBalance_0_1000: 8000,
            NumAccts_1001_2000: null, ARBalance_1001_2000: null,
            NumAccts_GT2000: 5, ARBalance_GT2000: 25000,
          }
        ]
      });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should compute specialty percentages when total is 0 but details have values', () => {
      service.fetch(defaultFilters, defaultSort).subscribe((data: any) => {
        // With total=0, computedTotal = sum of detail values = 200000
        // percentage should be computed for details with 0 percentage
        expect(data.specialtyData).toBeTruthy();
        const detail = data.specialtyData.details[0];
        // percentage was 0, should be computed from value/computedTotal * 100
        expect(detail.percentage).toBeGreaterThan(0);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_specialty: {
          total: 0,
          details: [
            { category: 'General', value: 120000, percentage: 0 },
            { category: 'Specialty', value: 80000, percentage: 0 },
          ]
        }
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('should handle specialty details with missing category (uses em dash)', () => {
      service.fetch(defaultFilters, defaultSort).subscribe((data: any) => {
        expect(data.specialtyData).toBeTruthy();
        const detail = data.specialtyData.details[0];
        expect(detail.label).toBe('\u2014');
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_specialty: {
          total: 100,
          details: [{ value: 50, percentage: 50 }] // no category
        }
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('normalizeAgingFromSummary should include details with missing category', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.agingData).toBeTruthy();
        expect(data.agingData!.details[0].label).toBe('');
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_aging: {
          total: 50000,
          details: [{ value: 50000, percentage: 100 }] // no category
        }
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });

    it('normalizeTrendsFromSummary should include trend rows with all fields', () => {
      service.fetch(defaultFilters, defaultSort).subscribe(data => {
        expect(data.trendsData.details.length).toBe(2);
        expect((data.trendsData.details[0] as any).month).toBe('Jan 2025');
        expect((data.trendsData.details[0] as any).total_0_30).toBe(10000);
      });

      http.expectOne(`${BASE}/analytics/ar/ar-summary`).flush({
        ar_trends: {
          details: [
            { month: 'Jan 2025', total_0_30: 10000, total_31_60: 5000, total_61_90: 2000, total_over_90: 1000 },
            { month: 'Feb 2025', total_0_30: 12000, total_31_60: 6000, total_61_90: 3000, total_over_90: 1500 },
          ]
        }
      });
      http.expectOne(`${BASE}/analytics/ar/ar-balance`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-days`).flush({});
      http.expectOne(`${BASE}/analytics/ar/ar-collections-breakdown`).flush({ data: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-distribution`).flush({ rows: [] });
      http.expectOne(`${BASE}/analytics/ar/ar-days-by-practice`).flush({ rows: [] });
    });
  });
});
