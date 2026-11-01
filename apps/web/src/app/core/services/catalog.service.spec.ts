import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CatalogService, CatalogItem, SyncResult, AliasItem } from './catalog.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = '/api/admin/catalog';

const mockItem: CatalogItem = {
  id: 1,
  name: 'Test Location',
  status: 'active',
  source: 'manual',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockAlias: AliasItem = {
  id: 10,
  entity_type: 'location',
  dirty_name: 'Loc 1 Inc',
  canonical_name: 'Location 1',
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('list()', () => {
    it('should GET catalog items without status filter', () => {
      service.list('location').subscribe(items => {
        expect(items).toEqual([mockItem]);
      });

      const req = http.expectOne(`${BASE}/location`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockItem] });
    });

    it('should GET catalog items with status filter', () => {
      service.list('provider', 'active').subscribe(items => {
        expect(items).toEqual([mockItem]);
      });

      const req = http.expectOne(`${BASE}/provider?status=active`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockItem] });
    });
  });

  describe('sync()', () => {
    it('should POST to /:type/sync', () => {
      const mockSync: SyncResult = {
        added: 5,
        isFirstSync: false,
        total: 20,
        pending: 3,
        active: 15,
        archived: 2,
      };

      service.sync('payer').subscribe(res => {
        expect(res).toEqual(mockSync);
      });

      const req = http.expectOne(`${BASE}/payer/sync`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(mockSync);
    });
  });

  describe('addManual()', () => {
    it('should POST to /:type with name in body', () => {
      service.addManual('location', 'New Location').subscribe(item => {
        expect(item).toEqual(mockItem);
      });

      const req = http.expectOne(`${BASE}/location`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'New Location' });
      req.flush({ data: mockItem });
    });
  });

  describe('updateStatus()', () => {
    it('should PATCH /:type/:id with status in body', () => {
      service.updateStatus('location', 1, 'archived').subscribe();

      const req = http.expectOne(`${BASE}/location/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'archived' });
      req.flush(null);
    });
  });

  describe('bulkUpdateStatus()', () => {
    it('should PATCH /:type with ids and status', () => {
      service.bulkUpdateStatus('provider', [1, 2, 3], 'active').subscribe();

      const req = http.expectOne(`${BASE}/provider`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ ids: [1, 2, 3], status: 'active' });
      req.flush(null);
    });
  });

  describe('deleteManual()', () => {
    it('should DELETE /:type/:id', () => {
      service.deleteManual('payer', 5).subscribe();

      const req = http.expectOne(`${BASE}/payer/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('activeNames()', () => {
    it('should return array of names from active items', () => {
      service.activeNames('location').subscribe(names => {
        expect(names).toEqual(['Test Location']);
      });

      const req = http.expectOne(`${BASE}/location?status=active`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockItem] });
    });
  });

  describe('listAliases()', () => {
    it('should GET /:type/aliases', () => {
      service.listAliases('location').subscribe(aliases => {
        expect(aliases).toEqual([mockAlias]);
      });

      const req = http.expectOne(`${BASE}/location/aliases`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockAlias] });
    });
  });

  describe('mapToCanonical()', () => {
    it('should POST /:type/map with dirty_name and canonical_name', () => {
      service.mapToCanonical('location', 'Loc 1 Inc', 'Location 1').subscribe(res => {
        expect(res.mapped).toBeTrue();
        expect(res.aliasId).toBe(10);
      });

      const req = http.expectOne(`${BASE}/location/map`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ dirty_name: 'Loc 1 Inc', canonical_name: 'Location 1' });
      req.flush({ mapped: true, aliasId: 10 });
    });
  });

  describe('deleteAlias()', () => {
    it('should DELETE /:type/aliases/:id', () => {
      service.deleteAlias('location', 10).subscribe();

      const req = http.expectOne(`${BASE}/location/aliases/10`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
