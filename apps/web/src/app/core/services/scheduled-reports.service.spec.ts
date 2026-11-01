import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ScheduledReportsService, ScheduledReport } from './scheduled-reports.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ScheduledReportsService', () => {
  let service: ScheduledReportsService;
  let http: HttpTestingController;
  const BASE = '/api/insightflow/scheduled-reports';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ScheduledReportsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- list() ------------------------------------------------------------------

  describe('list()', () => {
    it('should GET /scheduled-reports and extract data array', (done) => {
      const reports: ScheduledReport[] = [
        { id: 1, name: 'Weekly Denial', reportType: 'denial', frequency: 'weekly', recipients: 'a@b.com', isActive: true },
        { id: 2, name: 'Monthly ROI', reportType: 'roi', frequency: 'monthly', recipients: 'c@d.com', isActive: false },
      ];

      service.list().subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].name).toBe('Weekly Denial');
        expect(result[1].isActive).toBe(false);
        done();
      });

      const req = http.expectOne(r => r.url === BASE);
      expect(req.request.method).toBe('GET');
      req.flush({ data: reports });
    });

    it('should handle null data', (done) => {
      service.list().subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      const req = http.expectOne(r => r.url === BASE);
      req.flush({ data: null });
    });
  });

  // -- create() ----------------------------------------------------------------

  describe('create()', () => {
    it('should POST /scheduled-reports and extract id', (done) => {
      const report: Partial<ScheduledReport> = {
        name: 'New Report',
        reportType: 'denial',
        frequency: 'daily',
        recipients: 'user@test.com',
        isActive: true,
      };

      service.create(report).subscribe(result => {
        expect(result.id).toBe(10);
        done();
      });

      const req = http.expectOne(r => r.url === BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.name).toBe('New Report');
      req.flush({ data: { id: 10 } });
    });
  });

  // -- update() ----------------------------------------------------------------

  describe('update()', () => {
    it('should PUT /scheduled-reports/:id', (done) => {
      service.update(5, { name: 'Updated Report', isActive: false }).subscribe(() => done());

      const req = http.expectOne(r => r.url === `${BASE}/5`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.name).toBe('Updated Report');
      req.flush(null);
    });
  });

  // -- delete() ----------------------------------------------------------------

  describe('delete()', () => {
    it('should DELETE /scheduled-reports/:id', (done) => {
      service.delete(3).subscribe(() => done());

      const req = http.expectOne(r => r.url === `${BASE}/3`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  // -- runNow() ----------------------------------------------------------------

  describe('runNow()', () => {
    it('should POST /scheduled-reports/:id/run', (done) => {
      service.runNow(7).subscribe(result => {
        expect(result.message).toBe('Report triggered');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/7/run`);
      expect(req.request.method).toBe('POST');
      req.flush({ message: 'Report triggered' });
    });
  });
});
