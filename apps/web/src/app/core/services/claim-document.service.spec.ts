import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClaimDocumentService, ClaimDocument } from './claim-document.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = '/api/denial-iq/claim-detail/documents';

const mockDoc: ClaimDocument = {
  id: 1,
  claim_id: 'CL001',
  file_name: 'eob.pdf',
  content_type: 'application/pdf',
  file_size: 20480,
  doc_type: 'EOB',
  uploaded_by: 'jane.doe',
  created_at: '2026-01-01T00:00:00Z',
};

describe('ClaimDocumentService', () => {
  let service: ClaimDocumentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ClaimDocumentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('list()', () => {
    it('should GET documents with claimId as query param', () => {
      service.list('CL001').subscribe(docs => {
        expect(docs).toEqual([mockDoc]);
      });

      const req = http.expectOne(r => r.url === BASE && r.params.get('claimId') === 'CL001');
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockDoc] });
    });
  });

  describe('upload()', () => {
    it('should POST FormData with file, claimId, and docType', () => {
      const mockFile = new File(['content'], 'eob.pdf', { type: 'application/pdf' });

      service.upload('CL001', mockFile, 'EOB').subscribe(doc => {
        expect(doc).toEqual(mockDoc);
      });

      const req = http.expectOne(BASE);
      expect(req.request.method).toBe('POST');

      const formData: FormData = req.request.body;
      expect(formData.get('claimId')).toBe('CL001');
      expect(formData.get('docType')).toBe('EOB');
      expect(formData.get('file')).toBeTruthy();

      req.flush({ data: mockDoc });
    });
  });

  describe('getDownloadUrl()', () => {
    it('should return the correct download URL for a docId', () => {
      const url = service.getDownloadUrl(42);
      expect(url).toBe(`${BASE}/42/download`);
    });
  });

  describe('remove()', () => {
    it('should DELETE the document by id', () => {
      service.remove(1).subscribe();

      const req = http.expectOne(`${BASE}/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
