import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminService } from './admin.service';
import { UserDto, UserCreateDto, UserUpdateDto } from '../models/user.models';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('AdminService', () => {
  let service: AdminService;
  let http: HttpTestingController;
  const BASE = '/api/admin/users';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- list() ------------------------------------------------------------------

  describe('list()', () => {
    it('should GET /admin/users with default status=active', (done) => {
      const users: UserDto[] = [
        { id: '1', name: 'John', email: 'john@test.com', role: 'Admin' },
      ];

      service.list().subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('John');
        done();
      });

      const req = http.expectOne(r => r.url === BASE);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('status')).toBe('active');
      req.flush(users);
    });

    it('should accept custom status', () => {
      service.list('archived').subscribe();

      const req = http.expectOne(r => r.url === BASE);
      expect(req.request.params.get('status')).toBe('archived');
      req.flush([]);
    });

    it('should accept "all" status', () => {
      service.list('all').subscribe();

      const req = http.expectOne(r => r.url === BASE);
      expect(req.request.params.get('status')).toBe('all');
      req.flush([]);
    });
  });

  // -- get() -------------------------------------------------------------------

  describe('get()', () => {
    it('should GET /admin/users/:id', (done) => {
      const user: UserDto = { id: '5', name: 'Jane', email: 'jane@test.com', role: 'Manager' };

      service.get('5').subscribe(result => {
        expect(result.id).toBe('5');
        expect(result.role).toBe('Manager');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/5`);
      expect(req.request.method).toBe('GET');
      req.flush(user);
    });
  });

  // -- create() ----------------------------------------------------------------

  describe('create()', () => {
    it('should POST /admin/users', (done) => {
      const payload: UserCreateDto = {
        firstName: 'New',
        lastName: 'User',
        email: 'new@test.com',
        role: 'User',
      };

      service.create(payload).subscribe(result => {
        expect(result.message).toBe('Created');
        expect(result.id).toBe(10);
        done();
      });

      const req = http.expectOne(r => r.url === BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.email).toBe('new@test.com');
      req.flush({ message: 'Created', id: 10 });
    });
  });

  // -- update() ----------------------------------------------------------------

  describe('update()', () => {
    it('should PUT /admin/users/:id', (done) => {
      const payload: UserUpdateDto = { role: 'Admin' };

      service.update('5', payload).subscribe(result => {
        expect(result.role).toBe('Admin');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/5`);
      expect(req.request.method).toBe('PUT');
      req.flush({ id: '5', name: 'Jane', email: 'jane@test.com', role: 'Admin' });
    });
  });

  // -- archive() ---------------------------------------------------------------

  describe('archive()', () => {
    it('should PATCH /admin/users/:id/archive', (done) => {
      service.archive('5').subscribe(() => done());

      const req = http.expectOne(r => r.url === `${BASE}/5/archive`);
      expect(req.request.method).toBe('PATCH');
      req.flush(null);
    });
  });

  // -- restore() ---------------------------------------------------------------

  describe('restore()', () => {
    it('should PATCH /admin/users/:id/restore', (done) => {
      service.restore('5').subscribe(() => done());

      const req = http.expectOne(r => r.url === `${BASE}/5/restore`);
      expect(req.request.method).toBe('PATCH');
      req.flush(null);
    });
  });

  // -- terminate() -------------------------------------------------------------

  describe('terminate()', () => {
    it('should PATCH /users/terminate with email', (done) => {
      service.terminate('user@test.com', 'Resigned').subscribe(() => done());

      const req = http.expectOne(r => r.url === '/api/users/terminate');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.email).toBe('user@test.com');
      expect(req.request.body.termination_reason).toBe('Resigned');
      req.flush(null);
    });

    it('should send null reason when not provided', () => {
      service.terminate('user@test.com').subscribe();

      const req = http.expectOne(r => r.url === '/api/users/terminate');
      expect(req.request.body.termination_reason).toBeNull();
      req.flush(null);
    });
  });

  // -- getUserProducts() -------------------------------------------------------

  describe('getUserProducts()', () => {
    it('should GET /admin/users/:id/products', (done) => {
      service.getUserProducts('5').subscribe(products => {
        expect(products.length).toBe(2);
        expect(products[0].slug).toBe('denial-iq');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/5/products`);
      expect(req.request.method).toBe('GET');
      req.flush([
        { id: 1, slug: 'denial-iq', name: 'Denial IQ', assigned: true },
        { id: 2, slug: 'recon-iq', name: 'Recon IQ', assigned: false },
      ]);
    });
  });

  // -- updateUserProducts() ----------------------------------------------------

  describe('updateUserProducts()', () => {
    it('should PUT /admin/users/:id/products', (done) => {
      service.updateUserProducts('5', [1, 3]).subscribe(() => done());

      const req = http.expectOne(r => r.url === `${BASE}/5/products`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.productIds).toEqual([1, 3]);
      req.flush(null);
    });
  });

  // -- getUserScope() ----------------------------------------------------------

  describe('getUserScope()', () => {
    it('should GET /admin/users/:id/scope', (done) => {
      service.getUserScope('5').subscribe(scope => {
        expect(scope.locations).toEqual(['Main Office']);
        expect(scope.providers).toEqual(['Dr. Smith']);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/5/scope`);
      expect(req.request.method).toBe('GET');
      req.flush({ locations: ['Main Office'], providers: ['Dr. Smith'], payers: [] });
    });
  });

  // -- updateUserScope() ------------------------------------------------------

  describe('updateUserScope()', () => {
    it('should PUT /admin/users/:id/scope', (done) => {
      const scope = { locations: ['LOC1'], providers: ['P1'], payers: ['Aetna'] };
      service.updateUserScope('5', scope).subscribe(() => done());

      const req = http.expectOne(r => r.url === `${BASE}/5/scope`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.locations).toEqual(['LOC1']);
      req.flush(null);
    });
  });
});
