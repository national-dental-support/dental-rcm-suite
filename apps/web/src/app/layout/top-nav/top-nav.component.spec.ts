import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { TopNavComponent } from './top-nav.component';
import { DenialIqContextService } from '../../pages/claim-queue/services/denialIqRole.service';
import { ClaimContextService } from '../../pages/claim-queue/services/claim-context.service';
import { GlobalFiltersStore, PayerIqFiltersStore } from '../../shared/components/global-filters/global-filters.store';
import { EMPTY_GLOBAL_FILTERS } from '../../shared/components/global-filters/global-filters.models';
import { PayerIqService } from '../../core/services/payer-iq.service';
import { ThemeService } from '../../core/services/theme.service';
import { RefDataStore } from '../../store/global/ref-data.store';
import { EnterpriseService } from '../../core/services/enterprise.service';

describe('TopNavComponent', () => {
  let component: TopNavComponent;
  let fixture: ComponentFixture<TopNavComponent>;
  let routerEvents$: Subject<any>;
  let routerSpy: any;

  const role$ = new BehaviorSubject<string>('ar-specialist');
  const activeClaim$ = new BehaviorSubject<any>(null);
  const applied$ = new BehaviorSubject<any>(EMPTY_GLOBAL_FILTERS);
  const darkMode$ = new BehaviorSubject<boolean>(false);
  const data$ = new BehaviorSubject<any>(null);

  beforeEach(async () => {
    routerEvents$ = new Subject();
    routerSpy = {
      events: routerEvents$.asObservable(),
      navigate: jasmine.createSpy('navigate'),
    };

    await TestBed.configureTestingModule({
      declarations: [TopNavComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: DenialIqContextService, useValue: { role$ } },
        { provide: ClaimContextService, useValue: { activeClaim$ } },
        { provide: GlobalFiltersStore, useValue: { applied$, set: jasmine.createSpy('set'), setOptions: jasmine.createSpy('setOptions') } },
        { provide: PayerIqFiltersStore, useValue: { set: jasmine.createSpy('set') } },
        { provide: PayerIqService, useValue: {} },
        { provide: ThemeService, useValue: { isDarkMode: () => false, darkMode$ } },
        { provide: RefDataStore, useValue: { data$ } },
        { provide: EnterpriseService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TopNavComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should detect denial-iq dashboard route', () => {
    routerEvents$.next(new NavigationEnd(1, '/app/denial-iq/dashboard', '/app/denial-iq/dashboard'));
    expect(component.isInDenialIq).toBeTrue();
    expect(component.isOnDashboard).toBeTrue();
  });

  it('should detect denial-iq non-dashboard route', () => {
    routerEvents$.next(new NavigationEnd(1, '/app/denial-iq/claim-queue', '/app/denial-iq/claim-queue'));
    expect(component.isInDenialIq).toBeTrue();
    expect(component.isOnDashboard).toBeFalse();
  });

  it('should detect claim-vision rules route', () => {
    routerEvents$.next(new NavigationEnd(1, '/app/claim-vision/rules', '/app/claim-vision/rules'));
    expect(component.isInClaimVision).toBeTrue();
    expect(component.isOnRules).toBeTrue();
  });

  it('should detect payer-iq contracts route', () => {
    routerEvents$.next(new NavigationEnd(1, '/app/payer-iq/contracts', '/app/payer-iq/contracts'));
    expect(component.isInPayerIq).toBeTrue();
    expect(component.isOnPayerIqContracts).toBeTrue();
  });

  it('should track role changes', () => {
    role$.next('manager');
    expect(component.currentRole).toBe('manager');
  });

  it('should track active claim', () => {
    activeClaim$.next({ id: 'CL50001', patient: 'John Smith' });
    expect(component.activeClaim).toBeTruthy();
    expect(component.activeClaimLabel).toContain('J.');
    expect(component.activeClaimLabel).toContain('Smith');
    expect(component.activeClaimLabel).toContain('***0001');
  });

  it('activeClaimLabel is empty when no active claim', () => {
    activeClaim$.next(null);
    expect(component.activeClaimLabel).toBe('');
  });

  it('goToClaimQueue navigates to ar-specialist queue', () => {
    component.currentRole = 'ar-specialist';
    component.goToClaimQueue();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/denial-iq/claim-queue', 'ar-specialist']);
  });

  it('goToClaimQueue navigates to manager queue', () => {
    component.currentRole = 'manager';
    component.goToClaimQueue();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/denial-iq/claim-queue', 'manager']);
  });

  it('goHome navigates to /app/home', () => {
    component.goHome();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/home']);
  });

  it('goToRules navigates to rules', () => {
    component.goToRules();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules']);
  });

  it('goToPayerIqContracts navigates to contracts', () => {
    component.goToPayerIqContracts();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/payer-iq/contracts']);
  });

  it('goToPayerIqRootOrContracts toggles between root and contracts', () => {
    component.isOnPayerIqContracts = true;
    component.goToPayerIqRootOrContracts();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/payer-iq']);

    component.isOnPayerIqContracts = false;
    component.goToPayerIqRootOrContracts();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/payer-iq/contracts']);
  });

  it('onGlobalFiltersApply updates both stores', () => {
    const gfStore = TestBed.inject(GlobalFiltersStore) as any;
    const piqStore = TestBed.inject(PayerIqFiltersStore) as any;
    const filters = {
      ...EMPTY_GLOBAL_FILTERS,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      payers: ['Aetna'],
      providers: ['Dr. A'],
      location: { scope: 'enterprise' as const },
    };
    component.onGlobalFiltersApply(filters);
    expect(gfStore.set).toHaveBeenCalledWith(filters);
    expect(piqStore.set).toHaveBeenCalled();
  });

  it('should update isDark from themeService darkMode$', () => {
    darkMode$.next(true);
    expect(component.isDark).toBeTrue();
  });

  it('should set globalFilterOptions from refDataStore', () => {
    const opts = { payers: [], providers: [], locations: [] };
    data$.next(opts);
    expect(component.globalFilterOptions).toEqual(opts as any);
  });

  it('ngOnDestroy unsubscribes without error', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // -- formatClaimBadge edge cases ------------------------------------------

  it('activeClaimLabel handles single-word patient name (no lastName)', () => {
    activeClaim$.next({ id: 'CL50001', patient: 'Madonna' });
    // firstName = 'Madonna', lastName = '' (falsy), last4 = '0001'
    expect(component.activeClaimLabel).toContain('M.');
    expect(component.activeClaimLabel).toContain('***0001');
  });

  it('activeClaimLabel handles empty patient string', () => {
    activeClaim$.next({ id: 'CL50001', patient: '' });
    // firstName = '', firstInitial = '' (falsy branch)
    expect(component.activeClaimLabel).toContain('***0001');
  });

  // -- ngOnChanges ---------------------------------------------------------

  it('ngOnChanges calls loadEnterprises when isSuperAdmin is true', () => {
    const entSvc = { loadEnterprises: jasmine.createSpy('loadEnterprises'), setActive: jasmine.createSpy('setActive') };
    (component as any).enterpriseSvc = entSvc;
    component.isSuperAdmin = true;
    component.ngOnChanges();
    expect(entSvc.loadEnterprises).toHaveBeenCalled();
  });

  it('ngOnChanges does not call loadEnterprises when isSuperAdmin is false', () => {
    const entSvc = { loadEnterprises: jasmine.createSpy('loadEnterprises') };
    (component as any).enterpriseSvc = entSvc;
    component.isSuperAdmin = false;
    component.ngOnChanges();
    expect(entSvc.loadEnterprises).not.toHaveBeenCalled();
  });

  // -- flattenLocations via onGlobalFiltersApply ----------------------------

  it('onGlobalFiltersApply handles group scope location', () => {
    const piqStore = TestBed.inject(PayerIqFiltersStore) as any;
    const filters = {
      ...EMPTY_GLOBAL_FILTERS,
      location: { scope: 'group' as const, groups: ['GroupA'] },
    };
    component.onGlobalFiltersApply(filters as any);
    expect(piqStore.set).toHaveBeenCalled();
  });

  it('onGlobalFiltersApply handles practice scope location', () => {
    const piqStore = TestBed.inject(PayerIqFiltersStore) as any;
    const filters = {
      ...EMPTY_GLOBAL_FILTERS,
      location: { scope: 'practice' as const, practices: ['PracticeA'] },
    };
    component.onGlobalFiltersApply(filters as any);
    expect(piqStore.set).toHaveBeenCalled();
  });

  it('onGlobalFiltersApply handles location scope', () => {
    const piqStore = TestBed.inject(PayerIqFiltersStore) as any;
    const filters = {
      ...EMPTY_GLOBAL_FILTERS,
      location: { scope: 'location' as const, locations: ['LocA'] },
    };
    component.onGlobalFiltersApply(filters as any);
    expect(piqStore.set).toHaveBeenCalled();
  });

  it('onGlobalFiltersApply handles null payers/providers with ?? [] fallback', () => {
    const piqStore = TestBed.inject(PayerIqFiltersStore) as any;
    const filters = {
      ...EMPTY_GLOBAL_FILTERS,
      payers: null as any,
      providers: null as any,
      location: { scope: 'enterprise' as const },
    };
    component.onGlobalFiltersApply(filters as any);
    const called = piqStore.set.calls.mostRecent().args[0];
    expect(called.payers).toEqual([]);
    expect(called.providers).toEqual([]);
  });

  // -- refDataStore null data guard ------------------------------------------

  it('should not set globalFilterOptions when refData is null', () => {
    const gfStore = TestBed.inject(GlobalFiltersStore) as any;
    gfStore.setOptions.calls.reset();
    data$.next(null);
    // null should not trigger setOptions
    expect(gfStore.setOptions).not.toHaveBeenCalled();
  });

  // -- isInClaimVision route detection -------------------------------------

  it('should detect claim-vision non-rules route', () => {
    routerEvents$.next(new NavigationEnd(1, '/app/claim-vision/overview', '/app/claim-vision/overview'));
    expect(component.isInClaimVision).toBeTrue();
    expect(component.isOnRules).toBeFalse();
  });

  it('should set isInClaimVision false for non-claim-vision route', () => {
    routerEvents$.next(new NavigationEnd(1, '/app/home', '/app/home'));
    expect(component.isInClaimVision).toBeFalse();
    expect(component.isOnRules).toBeFalse();
  });
});
