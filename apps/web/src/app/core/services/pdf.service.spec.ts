import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PdfService } from './pdf.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('PdfService', () => {
  let service: PdfService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PdfService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(PdfService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getPdf() should GET /pdf/generate with apikey header and responseType blob', () => {
    const mockBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

    service.getPdf().subscribe(res => {
      expect(res instanceof Blob).toBeTrue();
    });

    const req = http.expectOne(`${environment.server.baseUrl}/pdf/generate`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(mockBlob);
  });
});
