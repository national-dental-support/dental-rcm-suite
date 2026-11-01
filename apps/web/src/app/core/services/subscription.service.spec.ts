import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SubscriptionService } from './subscription.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let http: HttpTestingController;
  const BASE = '/api';

  beforeEach(() => {
    // Clear sessionStorage cache
    sessionStorage.removeItem('rcm_subscription_state');

    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(SubscriptionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('rcm_subscription_state');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- initial state -----------------------------------------------------------

  describe('initial state', () => {
    it('should have seed subscriptions when no cache exists', () => {
      const snap = service.snapshot;
      expect(snap.subscriptions).toContain('denial-iq');
      expect(snap.subscriptions).toContain('insightflow');
      expect(snap.subscriptions).toContain('recon-iq');
      expect(snap.customerId).toBeNull();
    });
  });

  // -- load() ------------------------------------------------------------------

  describe('load()', () => {
    it('should GET /subscriptions/my-org', () => {
      service.load();

      const req = http.expectOne(r => r.url === `${BASE}/subscriptions/my-org`);
      expect(req.request.method).toBe('GET');
      req.flush({
        customerId: 1,
        subscriptions: ['denial-iq', 'recon-iq'],
        role: 'Admin',
      });
    });

    it('should update snapshot after successful load', fakeAsync(() => {
      service.load();

      const req = http.expectOne(r => r.url.includes('/subscriptions/my-org'));
      req.flush({
        customerId: 5,
        subscriptions: ['denial-iq'],
        role: 'User',
      });
      tick();

      expect(service.snapshot.customerId).toBe(5);
      expect(service.snapshot.subscriptions).toEqual(['denial-iq']);
    }));

    it('should not start a second load if already loading', () => {
      service.load();
      service.load(); // duplicate call

      const reqs = http.match(r => r.url.includes('/subscriptions/my-org'));
      expect(reqs.length).toBe(1);
      reqs[0].flush({ customerId: 1, subscriptions: [] });
    });
  });

  // -- isSubscribed() ----------------------------------------------------------

  describe('isSubscribed()', () => {
    it('should return true for seed slugs', () => {
      expect(service.isSubscribed('denial-iq')).toBe(true);
    });

    it('should return false for superadmin (not in seed)', () => {
      expect(service.isSubscribed('superadmin' as any)).toBe(false);
    });
  });

  // -- userRole$ ---------------------------------------------------------------

  describe('userRole$', () => {
    it('should emit empty string when role is not set', (done) => {
      service.userRole$.subscribe(role => {
        expect(role).toBe('');
        done();
      });
    });

    it('should emit role after load', fakeAsync(() => {
      let emittedRole = '';
      service.userRole$.subscribe(r => emittedRole = r);

      service.load();
      const req = http.expectOne(r => r.url.includes('/subscriptions/my-org'));
      req.flush({ customerId: 1, subscriptions: [], role: 'Manager' });
      tick();

      expect(emittedRole).toBe('Manager');
    }));
  });

  // -- isSuperAdmin$ ----------------------------------------------------------

  describe('isSuperAdmin$', () => {
    it('should emit false when superadmin is not in subscriptions', (done) => {
      service.isSuperAdmin$.subscribe(val => {
        expect(val).toBe(false);
        done();
      });
    });

    it('should emit true when superadmin is in subscriptions', fakeAsync(() => {
      let result = false;
      service.isSuperAdmin$.subscribe(v => result = v);

      service.load();
      const req = http.expectOne(r => r.url.includes('/subscriptions/my-org'));
      req.flush({ customerId: 1, subscriptions: ['superadmin', 'denial-iq'] });
      tick();

      expect(result).toBe(true);
    }));
  });

  // -- visibleProducts$ -------------------------------------------------------

  describe('visibleProducts$', () => {
    it('should exclude superadmin from visible products', fakeAsync(() => {
      let products: string[] = [];
      service.visibleProducts$.subscribe(p => products = p);

      service.load();
      const req = http.expectOne(r => r.url.includes('/subscriptions/my-org'));
      req.flush({ customerId: 1, subscriptions: ['superadmin', 'denial-iq', 'recon-iq'] });
      tick();

      expect(products).toEqual(['denial-iq', 'recon-iq']);
      expect(products).not.toContain('superadmin');
    }));
  });

  // -- getProducts() ----------------------------------------------------------

  describe('getProducts()', () => {
    it('should GET /subscriptions/products and extract data array', (done) => {
      service.getProducts().subscribe(products => {
        expect(products.length).toBe(2);
        expect(products[0].slug).toBe('denial-iq');
        done();
      });

      const req = http.expectOne(r => r.url === `${BASE}/subscriptions/products`);
      expect(req.request.method).toBe('GET');
      req.flush({
        data: [
          { id: 1, slug: 'denial-iq', name: 'Denial IQ', icon: '', navRoute: '', navOrder: 1, isActive: true },
          { id: 2, slug: 'recon-iq', name: 'Recon IQ', icon: '', navRoute: '', navOrder: 2, isActive: true },
        ],
      });
    });
  });

  // -- state$ ------------------------------------------------------------------

  describe('state$', () => {
    it('should emit the full OrgSubscriptions object', (done) => {
      service.state$.subscribe(state => {
        expect(state.subscriptions).toBeDefined();
        expect(state.customerId).toBeDefined();
        done();
      });
    });
  });

  // -- reload() ----------------------------------------------------------------

  describe('reload()', () => {
    it('should reset loading flag and call load again', () => {
      service.reload();

      const req = http.expectOne(r => r.url.includes('/subscriptions/my-org'));
      expect(req.request.method).toBe('GET');
      req.flush({ customerId: 1, subscriptions: [] });
    });
  });
});
