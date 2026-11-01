import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UserService } from './user.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;
  const BASE = '/api/users';

  beforeEach(() => {
    // Set a mock token so getHeaders() works
    sessionStorage.setItem('myRCMAzureIDToken', 'mock-token-123');

    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('myRCMAzureIDToken');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- setUser() / user$ -------------------------------------------------------

  describe('setUser()', () => {
    it('should update user$ observable', (done) => {
      const mockUser = { userId: '1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', locationAssignments: [] } as any;
      service.setUser(mockUser);

      service.user$.subscribe(user => {
        expect(user).toEqual(mockUser);
        done();
      });
    });
  });

  // -- getUsers() --------------------------------------------------------------

  describe('getUsers()', () => {
    it('should GET /users/test with auth headers', (done) => {
      service.getUsers().subscribe(result => {
        expect(result).toBeDefined();
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/test`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('Authorization')).toBe(true);
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token-123');
      req.flush([]);
    });

    it('should use empty string token when sessionStorage has no token (L32 binary-expr arm1)', (done) => {
      // Remove token so getHeaders() falls back to '' (covers || '' arm1)
      sessionStorage.removeItem('myRCMAzureIDToken');
      service.getUsers().subscribe(result => {
        expect(result).toBeDefined();
        done();
      });
      const req = http.expectOne(r => r.url === `${BASE}/test`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer ');
      req.flush([]);
      // Restore token for other tests
      sessionStorage.setItem('myRCMAzureIDToken', 'mock-token-123');
    });
  });

  // -- getUserByEmail() --------------------------------------------------------

  describe('getUserByEmail()', () => {
    it('should POST /users/get-by-email', (done) => {
      service.getUserByEmail('john@test.com').subscribe(result => {
        expect(result).toBeDefined();
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/get-by-email`);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 1, email: 'john@test.com' });
    });
  });

  // -- checkIfUserExists() ---------------------------------------------------

  describe('checkIfUserExists()', () => {
    it('should GET /users/get-by-email with email param', (done) => {
      service.checkIfUserExists('jane@test.com').subscribe(result => {
        expect(result.found).toBe(true);
        expect(result.uid).toBe(5);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/get-by-email`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('email')).toBe('jane@test.com');
      req.flush({ found: true, uid: 5 });
    });

    it('should return found=false when user does not exist', (done) => {
      service.checkIfUserExists('nobody@test.com').subscribe(result => {
        expect(result.found).toBe(false);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/get-by-email`);
      req.flush({ found: false });
    });
  });

  // -- createUser() ------------------------------------------------------------

  describe('createUser()', () => {
    it('should POST /users/create', (done) => {
      const userData = {
        azureID: 'az123',
        firstName: 'New',
        lastName: 'User',
        email: 'new@test.com',
      };

      service.createUser(userData).subscribe(result => {
        expect(result).toBeDefined();
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/create`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.email).toBe('new@test.com');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token-123');
      req.flush({ message: 'Created', id: 10 });
    });
  });

  // -- getLocationAssignments() -----------------------------------------------

  describe('getLocationAssignments()', () => {
    it('should GET /users with user_id param', (done) => {
      service.getLocationAssignments(42).subscribe(result => {
        expect(result.length).toBe(1);
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}` && r.params.has('user_id'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('user_id')).toBe('42');
      req.flush([{ id: '1', user_id: '42', location_id: 'L1' }]);
    });
  });
});
