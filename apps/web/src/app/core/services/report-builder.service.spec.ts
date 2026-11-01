import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportBuilderService, ReportSchema, ReportResult, SavedReport } from './report-builder.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;
  let http: HttpTestingController;
  const BASE = '/api/insightflow/report-builder';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ReportBuilderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getSchema() -------------------------------------------------------------

  describe('getSchema()', () => {
    it('should GET /schema', (done) => {
      const schema: ReportSchema = {
        dimensions: [
          { key: 'payer', label: 'Payer' },
          { key: 'provider', label: 'Provider' },
        ],
        measures: [
          { key: 'chargeAmt', label: 'Charge Amount', format: 'currency' },
        ],
      };

      service.getSchema().subscribe(result => {
        expect(result.dimensions.length).toBe(2);
        expect(result.measures.length).toBe(1);
        expect(result.measures[0].format).toBe('currency');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/schema`);
      expect(req.request.method).toBe('GET');
      req.flush(schema);
    });
  });

  // -- runReport() -------------------------------------------------------------

  describe('runReport()', () => {
    it('should POST /run with dimensions, measures, days', (done) => {
      const result: ReportResult = {
        rows: [{ payer: 'Aetna', chargeAmt: 5000 }],
        rowCount: 1,
        dimensions: ['payer'],
        measures: ['chargeAmt'],
      };

      service.runReport(['payer'], ['chargeAmt'], 30).subscribe(r => {
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].payer).toBe('Aetna');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/run`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.dimensions).toEqual(['payer']);
      expect(req.request.body.measures).toEqual(['chargeAmt']);
      expect(req.request.body.days).toBe(30);
      req.flush(result);
    });
  });

  // -- listSaved() -------------------------------------------------------------

  describe('listSaved()', () => {
    it('should GET /saved', (done) => {
      const saved: Partial<SavedReport>[] = [
        { id: 1, name: 'Monthly Report', isShared: true },
        { id: 2, name: 'Payer Analysis', isShared: false },
      ];

      service.listSaved().subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].name).toBe('Monthly Report');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/saved`);
      expect(req.request.method).toBe('GET');
      req.flush(saved);
    });
  });

  // -- saveReport() ------------------------------------------------------------

  describe('saveReport()', () => {
    it('should POST /saved', (done) => {
      const body = { name: 'New Report', dimensions: '["payer"]', measures: '["chargeAmt"]' };

      service.saveReport(body).subscribe(result => {
        expect(result.id).toBe(5);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/saved`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.name).toBe('New Report');
      req.flush({ id: 5 });
    });
  });

  // -- deleteSaved() -----------------------------------------------------------

  describe('deleteSaved()', () => {
    it('should DELETE /saved/:id', (done) => {
      service.deleteSaved(3).subscribe(() => done());

      const req = http.expectOne(r => r.url === `${BASE}/saved/3`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });
});
