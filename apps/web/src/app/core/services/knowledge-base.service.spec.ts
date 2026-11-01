import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KnowledgeBaseService, KbArticleListItem, KbArticle, KbCategory, AdminKbRow } from './knowledge-base.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/training/kb`;
  const adminBase = `${environment.server.baseUrl}/training/admin/kb`;

  const mockListItem: KbArticleListItem = {
    id: 1,
    title: 'Understanding CO-4',
    slug: 'understanding-co-4',
    category: 'Denials',
    carcCodes: 'CO-4',
    payerIds: '',
    cptCodes: '',
    tags: 'denial,co-4',
    viewCount: 42,
    updatedAt: '2026-01-01T00:00:00Z',
    authorName: 'Admin',
    excerpt: 'Learn about CO-4...',
  };

  const mockArticle: KbArticle = {
    id: 1,
    title: 'Understanding CO-4',
    slug: 'understanding-co-4',
    body: '<p>Full article body</p>',
    category: 'Denials',
    carcCodes: 'CO-4',
    payerIds: '',
    cptCodes: '',
    tags: 'denial,co-4',
    viewCount: 42,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    authorName: 'Admin',
  };

  const mockCategory: KbCategory = { category: 'Denials', articleCount: 5 };

  const mockAdminRow: AdminKbRow = {
    id: 1,
    title: 'Understanding CO-4',
    slug: 'understanding-co-4',
    category: 'Denials',
    carcCodes: 'CO-4',
    tags: 'denial',
    isPublished: true,
    viewCount: 42,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    authorName: 'Admin',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(KnowledgeBaseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('list', () => {
    it('should GET /training/kb with no filters', () => {
      service.list().subscribe(items => expect(items).toEqual([mockListItem]));
      const req = http.expectOne(base);
      expect(req.request.method).toBe('GET');
      req.flush([mockListItem]);
    });

    it('should GET /training/kb with category filter', () => {
      service.list({ category: 'Denials' }).subscribe();
      const req = http.expectOne(r => r.url === base && r.params.get('category') === 'Denials');
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('should GET /training/kb with carcCode filter', () => {
      service.list({ carcCode: 'CO-4' }).subscribe();
      const req = http.expectOne(r => r.url === base && r.params.get('carcCode') === 'CO-4');
      req.flush([]);
    });

    it('should GET /training/kb with search filter', () => {
      service.list({ search: 'denial' }).subscribe();
      const req = http.expectOne(r => r.url === base && r.params.get('search') === 'denial');
      req.flush([]);
    });

    it('should GET /training/kb with multiple filters combined', () => {
      service.list({ category: 'Denials', search: 'co-4' }).subscribe();
      const req = http.expectOne(r =>
        r.url === base &&
        r.params.get('category') === 'Denials' &&
        r.params.get('search') === 'co-4'
      );
      req.flush([]);
    });
  });

  describe('get', () => {
    it('should GET /training/kb/:id by numeric id', () => {
      service.get(1).subscribe(article => expect(article).toEqual(mockArticle));
      const req = http.expectOne(`${base}/1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockArticle);
    });

    it('should GET /training/kb/:slug by slug string', () => {
      service.get('understanding-co-4').subscribe(article => expect(article).toEqual(mockArticle));
      const req = http.expectOne(`${base}/understanding-co-4`);
      expect(req.request.method).toBe('GET');
      req.flush(mockArticle);
    });
  });

  describe('getForClaim', () => {
    it('should GET /training/kb/by-claim/:carcCode with encoding', () => {
      service.getForClaim('CO-4').subscribe(items => expect(items).toEqual([mockListItem]));
      const req = http.expectOne(`${base}/by-claim/CO-4`);
      expect(req.request.method).toBe('GET');
      req.flush([mockListItem]);
    });

    it('should URL-encode special characters in carcCode', () => {
      service.getForClaim('CO 4').subscribe();
      const req = http.expectOne(`${base}/by-claim/CO%204`);
      req.flush([]);
    });
  });

  describe('getCategories', () => {
    it('should GET /training/kb/categories', () => {
      service.getCategories().subscribe(cats => expect(cats).toEqual([mockCategory]));
      const req = http.expectOne(`${base}/categories`);
      expect(req.request.method).toBe('GET');
      req.flush([mockCategory]);
    });
  });

  describe('adminList', () => {
    it('should GET /training/admin/kb', () => {
      service.adminList().subscribe(rows => expect(rows).toEqual([mockAdminRow]));
      const req = http.expectOne(adminBase);
      expect(req.request.method).toBe('GET');
      req.flush([mockAdminRow]);
    });
  });

  describe('adminCreate', () => {
    it('should POST /training/admin/kb with body', () => {
      const body = { title: 'New Article', body: 'Content', category: 'Denials' };
      service.adminCreate(body).subscribe(res => expect(res).toEqual({ id: 2, slug: 'new-article' }));
      const req = http.expectOne(adminBase);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ id: 2, slug: 'new-article' });
    });
  });

  describe('adminUpdate', () => {
    it('should PUT /training/admin/kb/:id with body', () => {
      const body = { title: 'Updated Title' };
      service.adminUpdate(1, body).subscribe(res => expect(res).toBeTruthy());
      const req = http.expectOne(`${adminBase}/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(body);
      req.flush({ success: true });
    });
  });

  describe('adminDelete', () => {
    it('should DELETE /training/admin/kb/:id', () => {
      service.adminDelete(1).subscribe(res => expect(res).toBeTruthy());
      const req = http.expectOne(`${adminBase}/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });
});
