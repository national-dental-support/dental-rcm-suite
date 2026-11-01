import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AzureBlobService, BlobItemLite } from './azure-blob.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('AzureBlobService', () => {
  let service: AzureBlobService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(AzureBlobService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listExcelBlobs()', () => {
    it('should GET /api/storage/excel with empty prefix by default', () => {
      const mockBlobs: BlobItemLite[] = [
        { name: 'file1.xlsx', url: 'https://storage.example.com/file1.xlsx', size: 1024 },
      ];

      service.listExcelBlobs().subscribe(blobs => {
        expect(blobs).toEqual(mockBlobs);
      });

      const req = http.expectOne(r => r.url === '/api/storage/excel');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('prefix')).toBe('');
      req.flush(mockBlobs);
    });

    it('should GET /api/storage/excel with a specified prefix', () => {
      service.listExcelBlobs('reports/').subscribe();
      const req = http.expectOne(r => r.url === '/api/storage/excel');
      expect(req.request.params.get('prefix')).toBe('reports/');
      req.flush([]);
    });
  });

  describe('downloadBlob()', () => {
    it('should GET /api/storage/excel/download with blob name as param', () => {
      service.downloadBlob('myfile.xlsx').subscribe(blob => {
        expect(blob).toBeTruthy();
      });

      const req = http.expectOne(r => r.url === '/api/storage/excel/download');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('name')).toBe('myfile.xlsx');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['test']));
    });
  });

  describe('parseExcel()', () => {
    it('should return an observable (parsing is handled internally via XLSX)', (done) => {
      // Create a minimal valid XLSX blob - we just verify the observable resolves without error
      // Real XLSX parsing is a unit that depends on XLSX.read which requires a valid workbook.
      // We test that parseExcel returns an observable that calls .arrayBuffer() on the blob.
      const mockBlob = new Blob(['']);
      spyOn(mockBlob, 'arrayBuffer').and.returnValue(
        Promise.reject(new Error('not a real xlsx'))
      );

      service.parseExcel(mockBlob).subscribe({
        error: err => {
          // Expected - not a real XLSX file
          expect(err).toBeTruthy();
          done();
        },
      });
    });

    it('parseExcel with sheet number should call arrayBuffer', (done) => {
      const mockBlob = new Blob(['']);
      spyOn(mockBlob, 'arrayBuffer').and.returnValue(
        Promise.reject(new Error('not a real xlsx'))
      );
      service.parseExcel(mockBlob, { sheet: 0 }).subscribe({
        error: () => { expect(mockBlob.arrayBuffer).toHaveBeenCalled(); done(); },
      });
    });

    it('parseExcel with sheet string should call arrayBuffer', (done) => {
      const mockBlob = new Blob(['']);
      spyOn(mockBlob, 'arrayBuffer').and.returnValue(
        Promise.reject(new Error('not a real xlsx'))
      );
      service.parseExcel(mockBlob, { sheet: 'Sheet1' }).subscribe({
        error: () => { expect(mockBlob.arrayBuffer).toHaveBeenCalled(); done(); },
      });
    });
  });

  describe('clearCache()', () => {
    it('should clear the blob cache so next call fetches fresh', () => {
      // Populate cache
      service.listExcelBlobs().subscribe();
      const req = http.expectOne(r => r.url === '/api/storage/excel');
      req.flush([{ name: 'cached.xlsx', url: 'url1' }]);

      // Clear cache
      service.clearCache();

      // Next call should hit HTTP again
      service.listExcelBlobs().subscribe();
      const req2 = http.expectOne(r => r.url === '/api/storage/excel');
      req2.flush([{ name: 'fresh.xlsx', url: 'url2' }]);
    });
  });

  describe('listExcelBlobs() cache', () => {
    it('should return cached list without HTTP call on second call', () => {
      const mockBlobs: BlobItemLite[] = [{ name: 'file.xlsx', url: 'url' }];
      // First call - populates cache
      service.listExcelBlobs().subscribe();
      http.expectOne(r => r.url === '/api/storage/excel').flush(mockBlobs);

      // Second call - should return cached, no HTTP call
      let result: BlobItemLite[] | undefined;
      service.listExcelBlobs().subscribe(v => result = v);
      http.expectNone('/api/storage/excel');
      expect(result).toEqual(mockBlobs);
    });
  });
});
