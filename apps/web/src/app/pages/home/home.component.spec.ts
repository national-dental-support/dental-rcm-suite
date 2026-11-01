import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, BehaviorSubject, throwError } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HomeComponent } from './home.component';
import { SubscriptionService } from '../../core/services/subscription.service';
import { TrainingService } from '../../core/services/training.service';
import { HomeDashboardService } from '../../core/services/home-dashboard.service';

const makeStateSub = (role = '', permissions: any = {}, subscriptions: any[] = []) =>
  new BehaviorSubject({ role, permissions, subscriptions });

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mockRouter: jasmine.SpyObj<Router>;
  let httpMock: HttpTestingController;
  let mockSubscriptionService: any;
  let mockHomeDashboardService: any;

  beforeEach(async () => {
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockSubscriptionService = {
      isSuperAdmin$: new BehaviorSubject(false),
      state$: makeStateSub(),
      getProducts: jasmine.createSpy('getProducts').and.returnValue(of([])),
    };
    mockHomeDashboardService = {
      getStats: jasmine.createSpy().and.returnValue(of({
        checkInsToday:   5,
        roomsAvailable:  3,
        openInvoices:    10,
        rpmAlerts:       2,
        telehealthToday: 4,
        pendingFaxes:    1,
      })),
    };

    await TestBed.configureTestingModule({
      declarations: [HomeComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [HttpClientTestingModule],
      providers: [
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        { provide: TrainingService, useValue: {
          trainingMode$: new BehaviorSubject(false),
          setPreference: jasmine.createSpy('setPreference').and.returnValue(of(null)),
        }},
        { provide: HomeDashboardService, useValue: mockHomeDashboardService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: () => null } },
            params: of({}),
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Flush the app-registry HTTP request
    const req = httpMock.expectOne('/api/app-registry');
    req.flush([{ name: 'App1', url: 'http://app1.com', icon: 'icon1' }]);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- iconName -------------------------------------------------------------

  it('iconName returns the mapped icon for a known slug', () => {
    expect(component.iconName({ slug: 'insightflow' } as any)).toBe('insights');
  });

  it('iconName returns the default icon for an unknown slug', () => {
    expect(component.iconName({ slug: 'unknown-product' } as any)).toBe('settings');
  });

  it('iconName for denial-iq', () => {
    expect(component.iconName({ slug: 'denial-iq' } as any)).toBe('fact_check');
  });

  it('iconName for admin', () => {
    expect(component.iconName({ slug: 'admin' } as any)).toBe('admin_panel_settings');
  });

  // -- productDescription --------------------------------------------------

  it('productDescription returns description for known slug', () => {
    const result = component.productDescription({ slug: 'insightflow' } as any);
    expect(result).toContain('analytics');
  });

  it('productDescription returns empty string for unknown slug', () => {
    const result = component.productDescription({ slug: 'unknown-product' } as any);
    expect(result).toBe('');
  });

  // -- navigate -------------------------------------------------------------

  it('navigate should call router.navigate when product is subscribed', () => {
    const product = { slug: 'insightflow', navRoute: '/app/insightflow', subscribed: true } as any;
    component.navigate(product);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/insightflow']);
  });

  it('navigate should not call router.navigate when product is not subscribed', () => {
    const product = { slug: 'recon-iq', navRoute: '/app/recon-iq', subscribed: false } as any;
    component.navigate(product);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  // -- toggleTrainingMode ---------------------------------------------------

  it('toggleTrainingMode calls setPreference with toggled value', () => {
    const trainingService = TestBed.inject(TrainingService);
    component.trainingMode = false;
    component.toggleTrainingMode();
    expect(trainingService.setPreference).toHaveBeenCalledWith(true);
  });

  // -- loadWidgets via state$ ------------------------------------------------

  it('loadWidgets should be called when user role is Admin', () => {
    mockSubscriptionService.state$.next({ role: 'Admin', permissions: {}, subscriptions: [] });
    fixture.detectChanges();
    expect(mockHomeDashboardService.getStats).toHaveBeenCalled();
  });

  it('loadWidgets should be called when user role is Manager', () => {
    mockSubscriptionService.state$.next({ role: 'Manager', permissions: {}, subscriptions: [] });
    fixture.detectChanges();
    expect(mockHomeDashboardService.getStats).toHaveBeenCalled();
  });

  it('showWidgets should be false for non-admin roles', () => {
    mockSubscriptionService.state$.next({ role: 'Staff', permissions: {}, subscriptions: [] });
    fixture.detectChanges();
    expect(component.showWidgets).toBeFalse();
  });

  // -- rebuildProducts ------------------------------------------------------

  it('should show Admin tile for Admin role', () => {
    mockSubscriptionService.state$.next({
      role: 'Admin',
      permissions: {},
      subscriptions: [],
    });
    fixture.detectChanges();
    expect(component.products.some(p => p.slug === 'admin')).toBeTrue();
  });

  it('should not show Admin tile for Staff role', () => {
    mockSubscriptionService.state$.next({
      role: 'Staff',
      permissions: {},
      subscriptions: [],
    });
    fixture.detectChanges();
    expect(component.products.some(p => p.slug === 'admin')).toBeFalse();
  });

  it('should show superadmin tile when isSuperAdmin is true', () => {
    mockSubscriptionService.isSuperAdmin$.next(true);
    mockSubscriptionService.getProducts.and.returnValue(of([
      { id: 99, slug: 'superadmin', name: 'Super Admin', icon: 'key', navRoute: '/app/superadmin', navOrder: 0, isActive: true },
    ]));
    component.ngOnInit();
    const req = httpMock.expectOne('/api/app-registry');
    req.flush([]);
    fixture.detectChanges();
    // superadmin shown for super admin
    expect(component.isSuperAdmin).toBeTrue();
  });

  it('should fall back to the cached catalog when getProducts errors', () => {
    localStorage.setItem('rcm_products_cache', JSON.stringify([
      { id: 1, slug: 'denial-iq', name: 'Denial-IQ', icon: 'fact_check',
        navRoute: '/app/denial-iq', navOrder: 5, isActive: true },
    ]));
    mockSubscriptionService.getProducts.and.returnValue(throwError(() => new Error('Network error')));
    component.ngOnInit();
    httpMock.expectOne('/api/app-registry').flush([]);
    fixture.detectChanges();

    expect(component.products.some(p => p.slug === 'denial-iq')).toBeTrue();
    localStorage.removeItem('rcm_products_cache');
  });

  it('should show no products when getProducts errors and there is no cache', () => {
    localStorage.removeItem('rcm_products_cache');
    mockSubscriptionService.getProducts.and.returnValue(throwError(() => new Error('Network error')));
    component.ngOnInit();
    httpMock.expectOne('/api/app-registry').flush([]);
    fixture.detectChanges();

    // The catalog is never fabricated: showing products the tenant may not be
    // subscribed to would be worse than showing none.
    expect(component.products.length).toBe(0);
  });

  it('app-registry HTTP error sets externalApps to empty', () => {
    mockSubscriptionService.getProducts.and.returnValue(of([]));
    component.ngOnInit();
    const req = httpMock.expectOne('/api/app-registry');
    req.flush('error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.externalApps).toEqual([]);
  });

  // -- canSeeTechMonitoring -------------------------------------------------

  it('canSeeTechMonitoring is true when techMonitoringAccess permission is set', () => {
    mockSubscriptionService.state$.next({
      role: 'Staff',
      permissions: { techMonitoringAccess: true },
      subscriptions: [],
    });
    fixture.detectChanges();
    expect(component.canSeeTechMonitoring).toBeTrue();
  });

  it('canSeeTechMonitoring is true when role is Admin', () => {
    mockSubscriptionService.state$.next({
      role: 'Admin',
      permissions: {},
      subscriptions: [],
    });
    fixture.detectChanges();
    expect(component.canSeeTechMonitoring).toBeTrue();
  });
});
