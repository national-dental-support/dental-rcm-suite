import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HomeDashboardService, HomeWidgetData } from './home-dashboard.service';
import { ErrorDisplayService } from './error-display.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('HomeDashboardService', () => {
  let service: HomeDashboardService;
  let httpMock: HttpTestingController;
  let errorsSpy: jasmine.SpyObj<ErrorDisplayService>;

  const STATS_URL = `${environment.server.baseUrl}/home/stats`;

  const MOCK_STATS: HomeWidgetData = {
    checkInsToday:   12,
    roomsAvailable:  3,
    openInvoices:    47,
    rpmAlerts:       2,
    telehealthToday: 8,
    pendingFaxes:    1,
  };

  beforeEach(() => {
    errorsSpy = jasmine.createSpyObj('ErrorDisplayService', ['log', 'show']);

    TestBed.configureTestingModule({
      imports: [],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: ErrorDisplayService, useValue: errorsSpy },
      ],
    });
    service  = TestBed.inject(HomeDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- getStats - success path --------------------------------------

  it('getStats returns full HomeWidgetData from /home/stats', (done) => {
    service.getStats().subscribe(data => {
      expect(data).toEqual(MOCK_STATS);
      done();
    });

    httpMock.expectOne(STATS_URL).flush(MOCK_STATS);
  });

  it('getStats calls GET /home/stats exactly once', () => {
    service.getStats().subscribe();
    httpMock.expectOne(STATS_URL);
  });

  // -- getStats - error path ----------------------------------------

  it('getStats returns zero-filled defaults on HTTP 500', (done) => {
    service.getStats().subscribe(data => {
      expect(data.checkInsToday).toBe(0);
      expect(data.roomsAvailable).toBe(0);
      expect(data.openInvoices).toBe(0);
      expect(data.rpmAlerts).toBe(0);
      expect(data.telehealthToday).toBe(0);
      expect(data.pendingFaxes).toBe(0);
      done();
    });

    httpMock.expectOne(STATS_URL).flush('Error', { status: 500, statusText: 'Server Error' });
  });

  it('getStats calls ErrorDisplayService.log on HTTP 500', (done) => {
    service.getStats().subscribe(() => {
      expect(errorsSpy.log).toHaveBeenCalledWith('HomeDashboard/stats', jasmine.anything());
      done();
    });

    httpMock.expectOne(STATS_URL).flush('Error', { status: 500, statusText: 'Server Error' });
  });

  it('getStats calls ErrorDisplayService.show on HTTP 500', (done) => {
    service.getStats().subscribe(() => {
      expect(errorsSpy.show).toHaveBeenCalledWith(jasmine.stringContaining('unavailable'));
      done();
    });

    httpMock.expectOne(STATS_URL).flush('Error', { status: 500, statusText: 'Server Error' });
  });

  it('getStats returns zero-filled defaults on HTTP 404', (done) => {
    service.getStats().subscribe(data => {
      expect(data.checkInsToday).toBe(0);
      expect(data.openInvoices).toBe(0);
      done();
    });

    httpMock.expectOne(STATS_URL).flush('Not found', { status: 404, statusText: 'Not Found' });
  });

  it('getStats does not re-throw on error (observable completes)', (done) => {
    let completed = false;
    service.getStats().subscribe({
      next: () => { completed = true; },
      error: () => fail('Observable should not error'),
      complete: () => {
        expect(completed).toBeTrue();
        done();
      },
    });

    httpMock.expectOne(STATS_URL).flush('Error', { status: 503, statusText: 'Service Unavailable' });
  });

  // -- field mapping ------------------------------------------------

  it('getStats passes through all six fields unchanged', (done) => {
    service.getStats().subscribe(data => {
      expect(data.checkInsToday).toBe(99);
      expect(data.roomsAvailable).toBe(88);
      expect(data.openInvoices).toBe(77);
      expect(data.rpmAlerts).toBe(66);
      expect(data.telehealthToday).toBe(55);
      expect(data.pendingFaxes).toBe(44);
      done();
    });

    httpMock.expectOne(STATS_URL).flush({
      checkInsToday:   99,
      roomsAvailable:  88,
      openInvoices:    77,
      rpmAlerts:       66,
      telehealthToday: 55,
      pendingFaxes:    44,
    });
  });
});
