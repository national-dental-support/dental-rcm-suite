import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { EnterpriseService, Enterprise } from './enterprise.service';
import { environment } from '../../../environments/environment';

const STORAGE_KEY = 'rcm_active_enterprise';

const ENT_A: Enterprise = { id: 1, name: 'Enterprise Alpha', slug: 'alpha' };
const ENT_B: Enterprise = { id: 2, name: 'Enterprise Beta',  slug: 'beta'  };

describe('EnterpriseService', () => {
  let service: EnterpriseService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);

    TestBed.configureTestingModule({
      providers: [
        EnterpriseService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(EnterpriseService);
    http    = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  // -- 1. Creation ------------------------------------------------------------

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- 2. activeEnterprise / activeEnterpriseId -------------------------------

  it('activeEnterprise should be null when nothing is in localStorage', () => {
    expect(service.activeEnterprise).toBeNull();
  });

  it('activeEnterpriseId should be null when no enterprise is active', () => {
    expect(service.activeEnterpriseId).toBeNull();
  });

  it('activeEnterpriseId should return the enterprise id when active (binary-expr arm1)', () => {
    service.setActive(ENT_A);
    expect(service.activeEnterpriseId).toBe(ENT_A.id);
  });

  it('activeEnterprise should restore from localStorage on construction', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ENT_A));
    // Re-create service so the constructor reads localStorage
    const svc2 = new EnterpriseService(null as any);
    expect(svc2.activeEnterprise).toEqual(ENT_A);
    expect(svc2.activeEnterpriseId).toBe(ENT_A.id);
  });

  // -- 3. setActive -----------------------------------------------------------

  it('setActive should update activeEnterprise and persist to localStorage', () => {
    service.setActive(ENT_A);
    expect(service.activeEnterprise).toEqual(ENT_A);
    expect(service.activeEnterpriseId).toBe(ENT_A.id);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(ENT_A);
  });

  it('setActive should emit on active$', (done) => {
    service.active$.subscribe(ent => {
      if (ent?.id === ENT_A.id) {
        expect(ent).toEqual(ENT_A);
        done();
      }
    });
    service.setActive(ENT_A);
  });

  // -- 4. clear --------------------------------------------------------------

  it('clear should set activeEnterprise to null and remove from localStorage', () => {
    service.setActive(ENT_A);
    service.clear();
    expect(service.activeEnterprise).toBeNull();
    expect(service.activeEnterpriseId).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // -- 5. loadEnterprises - success path -------------------------------------

  it('loadEnterprises should GET /superadmin/org and populate enterprises$', () => {
    let ents: Enterprise[] | undefined;
    service.enterprises$.subscribe(e => (ents = e));

    service.loadEnterprises();

    const req = http.expectOne(`${environment.server.baseUrl}/superadmin/org`);
    expect(req.request.method).toBe('GET');

    req.flush({
      data: [
        { id: 1, name: 'Alpha', slug: 'alpha' },
        { id: 2, name: 'Beta',  slug: 'beta'  },
      ],
    });

    expect(ents!.length).toBe(2);
    expect(ents![0].slug).toBe('alpha');
  });

  it('loadEnterprises should auto-select first enterprise when none is active', () => {
    service.loadEnterprises();

    const req = http.expectOne(`${environment.server.baseUrl}/superadmin/org`);
    req.flush({ data: [{ id: 1, name: 'Alpha', slug: 'alpha' }] });

    expect(service.activeEnterprise?.id).toBe(1);
  });

  it('loadEnterprises should keep an already-valid active selection', () => {
    service.setActive(ENT_A);
    service.loadEnterprises();

    const req = http.expectOne(`${environment.server.baseUrl}/superadmin/org`);
    req.flush({ data: [{ id: 1, name: 'Alpha', slug: 'alpha' }, { id: 2, name: 'Beta', slug: 'beta' }] });

    // ENT_A (id=1) is still in the list, so it should remain
    expect(service.activeEnterprise?.id).toBe(ENT_A.id);
  });

  it('loadEnterprises should replace stale selection with first when id no longer exists', () => {
    service.setActive({ id: 999, name: 'Old', slug: 'old' });
    service.loadEnterprises();

    const req = http.expectOne(`${environment.server.baseUrl}/superadmin/org`);
    req.flush({ data: [{ id: 1, name: 'Alpha', slug: 'alpha' }] });

    expect(service.activeEnterprise?.id).toBe(1);
  });

  it('loadEnterprises should not fail and enterprises$ stays empty on HTTP error', () => {
    let ents: Enterprise[] | undefined;
    service.enterprises$.subscribe(e => (ents = e));

    service.loadEnterprises();

    const req = http.expectOne(`${environment.server.baseUrl}/superadmin/org`);
    req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

    // Should not throw - enterprises$ stays as empty array
    expect(ents).toEqual([]);
  });

  it('loadEnterprises should handle missing slug gracefully (defaults to empty string)', () => {
    let ents: Enterprise[] | undefined;
    service.enterprises$.subscribe(e => (ents = e));

    service.loadEnterprises();

    const req = http.expectOne(`${environment.server.baseUrl}/superadmin/org`);
    req.flush({ data: [{ id: 1, name: 'NoSlug' }] });

    expect(ents![0].slug).toBe('');
  });

  // -- 6. active$ observable -------------------------------------------------

  it('active$ should emit null initially when no localStorage', (done) => {
    service.active$.subscribe(v => {
      expect(v).toBeNull();
      done();
    });
  });

  // -- 7. loadFromStorage handles corrupt JSON --------------------------------

  it('should return null (not throw) when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json}');
    const svc2 = new EnterpriseService(null as any);
    expect(svc2.activeEnterprise).toBeNull();
  });
});
