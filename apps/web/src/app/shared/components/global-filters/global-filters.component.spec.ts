import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { GlobalFiltersComponent } from './global-filters.component';
import { GlobalFilterOptions, GlobalFiltersValue } from './global-filters.models';
import { GlobalFilterOptionsService } from '../../../core/services/global-filter-options.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { of } from 'rxjs';

describe('GlobalFiltersComponent', () => {
  let component: GlobalFiltersComponent;
  let fixture: ComponentFixture<GlobalFiltersComponent>;
  let routerEventSubject: Subject<any>;
  let mockRouter: any;
  let mockFilterOptionsSvc: jasmine.SpyObj<GlobalFilterOptionsService>;

  const mockOptions: GlobalFilterOptions = {
    payers: ['Aetna', 'BCBS', 'Cigna'],
    providers: ['Dr. Smith', 'Dr. Jones'],
    groups: ['East', 'West'],
    practices: ['Main', 'Branch'],
    locations: ['New York', 'Chicago', 'LA'],
  };

  beforeEach(() => {
    routerEventSubject = new Subject<any>();
    mockRouter = {
      url: '/dashboard',
      events: routerEventSubject.asObservable(),
    };
    mockFilterOptionsSvc = jasmine.createSpyObj('GlobalFilterOptionsService', ['getRefinedOptions']);
    mockFilterOptionsSvc.getRefinedOptions.and.returnValue(of({
      practices: [], locations: [], payers: [], providers: [],
    }));

    TestBed.configureTestingModule({
      declarations: [GlobalFiltersComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [ReactiveFormsModule, MatMenuModule, MatDatepickerModule, MatNativeDateModule],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: Router, useValue: mockRouter },
        { provide: GlobalFilterOptionsService, useValue: mockFilterOptionsSvc },
      ]
    });

    fixture = TestBed.createComponent(GlobalFiltersComponent);
    component = fixture.componentInstance;
    component.options = mockOptions;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---
  it('should emit changed when form value changes', () => {
    spyOn(component.changed, 'emit');
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.changed.emit).toHaveBeenCalled();
  });

  it('should patch from initialValue on init', () => {
    const initial: Partial<GlobalFiltersValue> = {
      payers: ['BCBS'],
      providers: ['Dr. Smith'],
      location: { scope: 'enterprise' },
    };
    component.initialValue = initial;
    component.ngOnInit();
    expect(component.filtersForm.controls.payers.value).toEqual(['BCBS']);
    expect(component.filtersForm.controls.providers.value).toEqual(['Dr. Smith']);
  });

  // --- ngOnChanges ---
  it('should patch from initialValue on changes', () => {
    component.initialValue = {
      payers: ['Cigna'],
      location: { scope: 'group', groups: ['East'] },
    };
    component.ngOnChanges({
      initialValue: { currentValue: component.initialValue, previousValue: null, firstChange: false, isFirstChange: () => false },
    });
    expect(component.filtersForm.controls.payers.value).toEqual(['Cigna']);
    expect(component.filtersForm.controls.locationScope.value).toBe('group');
    expect(component.filtersForm.controls.groups.value).toEqual(['East']);
  });

  // --- ngOnDestroy ---
  it('should complete destroy$ on ngOnDestroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // --- value getter ---
  it('value should return enterprise location by default', () => {
    expect(component.value.location.scope).toBe('enterprise');
  });

  it('value should return group location when scope is group', () => {
    component.filtersForm.controls.locationScope.setValue('group');
    component.filtersForm.controls.groups.setValue(['East']);
    const val = component.value;
    expect(val.location.scope).toBe('group');
    expect((val.location as any).groups).toEqual(['East']);
  });

  it('value should return practice location when scope is practice', () => {
    component.filtersForm.controls.locationScope.setValue('practice');
    component.filtersForm.controls.practices.setValue(['Main']);
    const val = component.value;
    expect(val.location.scope).toBe('practice');
    expect((val.location as any).practices).toEqual(['Main']);
  });

  it('value should return location scope when scope is location', () => {
    component.filtersForm.controls.locationScope.setValue('location');
    component.filtersForm.controls.locations.setValue(['New York']);
    const val = component.value;
    expect(val.location.scope).toBe('location');
    expect((val.location as any).locations).toEqual(['New York']);
  });

  it('value should include dates', () => {
    const d1 = new Date(2025, 0, 1);
    const d2 = new Date(2025, 11, 31);
    component.filtersForm.controls.startDate.setValue(d1);
    component.filtersForm.controls.endDate.setValue(d2);
    expect(component.value.startDate).toEqual(d1);
    expect(component.value.endDate).toEqual(d2);
  });

  // --- patchFromInitial edge cases ---
  it('patchFromInitial should handle practice scope', () => {
    (component as any).patchFromInitial({
      location: { scope: 'practice', practices: ['Branch'] },
    });
    expect(component.filtersForm.controls.locationScope.value).toBe('practice');
    expect(component.filtersForm.controls.practices.value).toEqual(['Branch']);
    expect(component.filtersForm.controls.groups.value).toEqual([]);
  });

  it('patchFromInitial should handle location scope', () => {
    (component as any).patchFromInitial({
      location: { scope: 'location', locations: ['LA'] },
    });
    expect(component.filtersForm.controls.locationScope.value).toBe('location');
    expect(component.filtersForm.controls.locations.value).toEqual(['LA']);
  });

  it('patchFromInitial should default to enterprise when no location', () => {
    (component as any).patchFromInitial({});
    expect(component.filtersForm.controls.locationScope.value).toBe('enterprise');
  });

  // --- dateRangeLabel ---
  it('dateRangeLabel should return All when no dates set', () => {
    expect(component.dateRangeLabel).toBe('All');
  });

  it('dateRangeLabel should show start only', () => {
    component.filtersForm.controls.startDate.setValue(new Date(2025, 0, 1));
    expect(component.dateRangeLabel).toContain('1/1/2025');
    expect(component.dateRangeLabel).toContain('\u2026');
  });

  it('dateRangeLabel should show both dates', () => {
    component.filtersForm.controls.startDate.setValue(new Date(2025, 0, 1));
    component.filtersForm.controls.endDate.setValue(new Date(2025, 11, 31));
    const label = component.dateRangeLabel;
    expect(label).toContain('\u2013');
  });

  // --- payerLabel ---
  it('payerLabel should return All when no payers selected', () => {
    expect(component.payerLabel).toBe('All');
  });

  it('payerLabel should return name when 1 payer selected', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.payerLabel).toBe('Aetna');
  });

  it('payerLabel should return count when multiple payers selected', () => {
    component.filtersForm.controls.payers.setValue(['Aetna', 'BCBS']);
    expect(component.payerLabel).toBe('2 selected');
  });

  // --- providerLabel ---
  it('providerLabel should return All when empty', () => {
    expect(component.providerLabel).toBe('All');
  });

  it('providerLabel should return single name', () => {
    component.filtersForm.controls.providers.setValue(['Dr. Smith']);
    expect(component.providerLabel).toBe('Dr. Smith');
  });

  // --- locationLabel ---
  it('locationLabel should return All for enterprise scope', () => {
    expect(component.locationLabel).toBe('All');
  });

  it('locationLabel should return group info', () => {
    component.filtersForm.controls.locationScope.setValue('group');
    component.filtersForm.controls.groups.setValue(['East', 'West']);
    expect(component.locationLabel).toBe('2 selected');
  });

  it('locationLabel should return practice info', () => {
    component.filtersForm.controls.locationScope.setValue('practice');
    component.filtersForm.controls.practices.setValue(['Main']);
    expect(component.locationLabel).toBe('Main');
  });

  it('locationLabel should return location info', () => {
    component.filtersForm.controls.locationScope.setValue('location');
    component.filtersForm.controls.locations.setValue(['New York']);
    expect(component.locationLabel).toBe('New York');
  });

  // --- isSelected ---
  it('isSelected should return true for selected value', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.isSelected(component.filtersForm.controls.payers, 'Aetna')).toBeTrue();
  });

  it('isSelected should return false for unselected value', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.isSelected(component.filtersForm.controls.payers, 'BCBS')).toBeFalse();
  });

  // --- toggleArrayValue ---
  it('toggleArrayValue should add value when checked', () => {
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', true);
    expect(component.filtersForm.controls.payers.value).toContain('Aetna');
  });

  it('toggleArrayValue should remove value when unchecked', () => {
    component.filtersForm.controls.payers.setValue(['Aetna', 'BCBS']);
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', false);
    expect(component.filtersForm.controls.payers.value).not.toContain('Aetna');
    expect(component.filtersForm.controls.payers.value).toContain('BCBS');
  });

  it('toggleArrayValue should not duplicate when adding existing', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', true);
    expect(component.filtersForm.controls.payers.value.filter((v: string) => v === 'Aetna').length).toBe(1);
  });

  it('toggleArrayValue should mark dirty', () => {
    component.toggleArrayValue(component.filtersForm.controls.payers, 'Aetna', true);
    expect(component.filtersForm.controls.payers.dirty).toBeTrue();
  });

  // --- isAllSelectedStr ---
  it('isAllSelectedStr should return true when all options selected', () => {
    component.filtersForm.controls.payers.setValue(['Aetna', 'BCBS', 'Cigna']);
    expect(component.isAllSelectedStr(component.filtersForm.controls.payers, mockOptions.payers)).toBeTrue();
  });

  it('isAllSelectedStr should return false when partial', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.isAllSelectedStr(component.filtersForm.controls.payers, mockOptions.payers)).toBeFalse();
  });

  it('isAllSelectedStr should return false for empty options', () => {
    expect(component.isAllSelectedStr(component.filtersForm.controls.payers, [])).toBeFalse();
  });

  // --- isSomeSelectedStr ---
  it('isSomeSelectedStr should return true when some but not all selected', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    expect(component.isSomeSelectedStr(component.filtersForm.controls.payers, mockOptions.payers)).toBeTrue();
  });

  it('isSomeSelectedStr should return false when all selected', () => {
    component.filtersForm.controls.payers.setValue(['Aetna', 'BCBS', 'Cigna']);
    expect(component.isSomeSelectedStr(component.filtersForm.controls.payers, mockOptions.payers)).toBeFalse();
  });

  it('isSomeSelectedStr should return false when none selected', () => {
    expect(component.isSomeSelectedStr(component.filtersForm.controls.payers, mockOptions.payers)).toBeFalse();
  });

  // --- toggleSelectAllStr ---
  it('toggleSelectAllStr should select all when not all selected', () => {
    component.toggleSelectAllStr(component.filtersForm.controls.payers, mockOptions.payers);
    expect(component.filtersForm.controls.payers.value).toEqual(mockOptions.payers);
  });

  it('toggleSelectAllStr should deselect all when all selected', () => {
    component.filtersForm.controls.payers.setValue([...mockOptions.payers]);
    component.toggleSelectAllStr(component.filtersForm.controls.payers, mockOptions.payers);
    expect(component.filtersForm.controls.payers.value).toEqual([]);
  });

  it('toggleSelectAllStr should mark dirty', () => {
    component.toggleSelectAllStr(component.filtersForm.controls.payers, mockOptions.payers);
    expect(component.filtersForm.controls.payers.dirty).toBeTrue();
  });

  // --- clearDateRange ---
  it('clearDateRange should reset both dates', () => {
    component.filtersForm.controls.startDate.setValue(new Date());
    component.filtersForm.controls.endDate.setValue(new Date());
    component.clearDateRange();
    expect(component.filtersForm.controls.startDate.value).toBeNull();
    expect(component.filtersForm.controls.endDate.value).toBeNull();
  });

  // --- clearPayers ---
  it('clearPayers should reset payers', () => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    component.clearPayers();
    expect(component.filtersForm.controls.payers.value).toEqual([]);
  });

  // --- clearProviders ---
  it('clearProviders should reset providers', () => {
    component.filtersForm.controls.providers.setValue(['Dr. Smith']);
    component.clearProviders();
    expect(component.filtersForm.controls.providers.value).toEqual([]);
  });

  // --- clearLocation ---
  it('clearLocation should clear groups for group scope', () => {
    component.filtersForm.controls.locationScope.setValue('group');
    component.filtersForm.controls.groups.setValue(['East']);
    component.clearLocation();
    expect(component.filtersForm.controls.groups.value).toEqual([]);
  });

  it('clearLocation should clear practices for practice scope', () => {
    component.filtersForm.controls.locationScope.setValue('practice');
    component.filtersForm.controls.practices.setValue(['Main']);
    component.clearLocation();
    expect(component.filtersForm.controls.practices.value).toEqual([]);
  });

  it('clearLocation should clear locations for location scope', () => {
    component.filtersForm.controls.locationScope.setValue('location');
    component.filtersForm.controls.locations.setValue(['NY']);
    component.clearLocation();
    expect(component.filtersForm.controls.locations.value).toEqual([]);
  });

  // --- clearAndApply helpers ---
  it('clearPayersAndApply should clear payers and emit apply', () => {
    spyOn(component.apply, 'emit');
    component.filtersForm.controls.payers.setValue(['Aetna']);
    component.clearPayersAndApply();
    expect(component.filtersForm.controls.payers.value).toEqual([]);
    expect(component.apply.emit).toHaveBeenCalled();
  });

  it('clearProvidersAndApply should clear providers and emit apply', () => {
    spyOn(component.apply, 'emit');
    component.filtersForm.controls.providers.setValue(['Dr. Smith']);
    component.clearProvidersAndApply();
    expect(component.filtersForm.controls.providers.value).toEqual([]);
    expect(component.apply.emit).toHaveBeenCalled();
  });

  it('clearDateRangeAndApply should clear dates and emit apply', () => {
    spyOn(component.apply, 'emit');
    component.filtersForm.controls.startDate.setValue(new Date());
    component.clearDateRangeAndApply();
    expect(component.filtersForm.controls.startDate.value).toBeNull();
    expect(component.apply.emit).toHaveBeenCalled();
  });

  it('clearLocationAndApply should clear location and emit apply', () => {
    spyOn(component.apply, 'emit');
    component.filtersForm.controls.locationScope.setValue('group');
    component.filtersForm.controls.groups.setValue(['East']);
    component.clearLocationAndApply();
    expect(component.filtersForm.controls.groups.value).toEqual([]);
    expect(component.apply.emit).toHaveBeenCalled();
  });

  // --- onLocationScopeChanged ---
  it('onLocationScopeChanged should update scope control', () => {
    component.onLocationScopeChanged('practice');
    expect(component.filtersForm.controls.locationScope.value).toBe('practice');
    expect(component.filtersForm.controls.locationScope.dirty).toBeTrue();
  });

  // --- applyFilters ---
  it('applyFilters should emit apply event', () => {
    spyOn(component.apply, 'emit');
    component.applyFilters();
    expect(component.apply.emit).toHaveBeenCalledWith(component.value);
  });

  // --- options getters ---
  it('payerOptions should return options payers', () => {
    expect(component.payerOptions).toEqual(mockOptions.payers);
  });

  it('providerOptions should return options providers', () => {
    expect(component.providerOptions).toEqual(mockOptions.providers);
  });

  it('groupOptions should return options groups', () => {
    expect(component.groupOptions).toEqual(mockOptions.groups);
  });

  it('practiceOptions should return options practices', () => {
    expect(component.practiceOptions).toEqual(mockOptions.practices);
  });

  it('locationOptions should return options locations', () => {
    expect(component.locationOptions).toEqual(mockOptions.locations);
  });

  it('options getters should return empty when options is null', () => {
    component.options = null;
    expect(component.payerOptions).toEqual([]);
    expect(component.providerOptions).toEqual([]);
    expect(component.groupOptions).toEqual([]);
    expect(component.practiceOptions).toEqual([]);
    expect(component.locationOptions).toEqual([]);
  });

  // --- filtered options ---
  it('filteredPayerOptions should return all when no search', () => {
    component.payerSearch = '';
    expect(component.filteredPayerOptions).toEqual(mockOptions.payers);
  });

  it('filteredPayerOptions should filter by search', () => {
    component.payerSearch = 'aet';
    expect(component.filteredPayerOptions).toEqual(['Aetna']);
  });

  it('filteredProviderOptions should filter by search', () => {
    component.providerSearch = 'smith';
    expect(component.filteredProviderOptions).toEqual(['Dr. Smith']);
  });

  it('filteredProviderOptions should return all when no search', () => {
    component.providerSearch = '';
    expect(component.filteredProviderOptions).toEqual(mockOptions.providers);
  });

  it('filteredGroupOptions should filter by search', () => {
    component.locationSearch = 'east';
    expect(component.filteredGroupOptions).toEqual(['East']);
  });

  it('filteredPracticeOptions should filter by search', () => {
    component.locationSearch = 'main';
    expect(component.filteredPracticeOptions).toEqual(['Main']);
  });

  it('filteredLocationOptions should filter by search', () => {
    component.locationSearch = 'york';
    expect(component.filteredLocationOptions).toEqual(['New York']);
  });

  it('filteredLocationOptions should return all when no search', () => {
    component.locationSearch = '';
    expect(component.filteredLocationOptions).toEqual(mockOptions.locations);
  });

  // --- syncProviderVisibility via router NavigationEnd ---------------------

  it('should update showProvider to true when navigating to recon-iq route', fakeAsync(() => {
    component.ngOnInit(); // re-subscribe
    routerEventSubject.next(new NavigationEnd(1, '/recon-iq/matching', '/recon-iq/matching'));
    tick();
    expect(component.showProvider).toBeTrue();
  }));

  it('should update showProvider to false when leaving recon-iq route', fakeAsync(() => {
    // First set to recon-iq so showProvider = true
    component.ngOnInit();
    routerEventSubject.next(new NavigationEnd(1, '/recon-iq/matching', '/recon-iq/matching'));
    tick();
    expect(component.showProvider).toBeTrue();
    // Now leave
    routerEventSubject.next(new NavigationEnd(2, '/dashboard', '/dashboard'));
    tick();
    expect(component.showProvider).toBeFalse();
  }));

  it('should clear providers when leaving recon-iq route with providers set', fakeAsync(() => {
    component.ngOnInit();
    // Setup: navigate to recon-iq
    routerEventSubject.next(new NavigationEnd(1, '/recon-iq/matching', '/recon-iq/matching'));
    tick();
    // Set providers
    component.filtersForm.controls.providers.setValue(['Dr. Smith']);
    // Navigate away
    routerEventSubject.next(new NavigationEnd(2, '/dashboard', '/dashboard'));
    tick();
    expect(component.filtersForm.controls.providers.value).toEqual([]);
  }));

  // --- refreshRefinedOptions when there ARE active filters -----------------

  it('refreshRefinedOptions should call filterOptionsSvc when payers are selected', fakeAsync(() => {
    component.filtersForm.controls.payers.setValue(['Aetna']);
    tick(300); // debounce
    expect(mockFilterOptionsSvc.getRefinedOptions).toHaveBeenCalled();
  }));

  it('refreshRefinedOptions should set refined options to null when no filters', fakeAsync(() => {
    component.refinedPayers = ['Aetna'];
    component.filtersForm.controls.payers.setValue([]);
    tick(300);
    expect(component.refinedPayers).toBeNull();
  }));

  it('payerOptions should return refinedPayers when set', () => {
    component.refinedPayers = ['BCBS'];
    expect(component.payerOptions).toEqual(['BCBS']);
  });

  it('providerOptions should return refinedProviders when set', () => {
    component.refinedProviders = ['Dr. Jones'];
    expect(component.providerOptions).toEqual(['Dr. Jones']);
  });

  it('practiceOptions should return cascadedPractices when set', () => {
    component.cascadedPractices = ['Branch'];
    expect(component.practiceOptions).toEqual(['Branch']);
  });

  it('practiceOptions should return refinedPractices when cascaded is null', () => {
    component.cascadedPractices = null;
    component.refinedPractices = ['Main'];
    expect(component.practiceOptions).toEqual(['Main']);
  });

  it('locationOptions should return cascadedLocations when set', () => {
    component.cascadedLocations = ['LA'];
    expect(component.locationOptions).toEqual(['LA']);
  });

  it('locationOptions should return refinedLocations when cascaded is null', () => {
    component.cascadedLocations = null;
    component.refinedLocations = ['Chicago'];
    expect(component.locationOptions).toEqual(['Chicago']);
  });

  // --- onGroupsChanged with groupsData -------------------------------------

  it('onGroupsChanged should cascade locations from the selected groups', fakeAsync(() => {
    component.options = {
      ...mockOptions,
      groupsData: [
        { name: 'East', locations: [{ name: 'New York' }, { name: 'Boston' }] },
        { name: 'West', locations: [{ name: 'LA' }] },
      ],
    } as any;
    component.filtersForm.controls.groups.setValue(['East']);
    tick(10);
    // Locations cascade from the group itself and come back sorted. Practices
    // are no longer derived from the group selection.
    expect(component.cascadedLocations).toEqual(['Boston', 'New York']);
    expect(component.cascadedPractices).toBeNull();
  }));

  it('onGroupsChanged should not include locations from unselected groups', fakeAsync(() => {
    component.options = {
      ...mockOptions,
      groupsData: [
        { name: 'East', locations: [{ name: 'New York' }] },
        { name: 'West', locations: [{ name: 'LA' }] },
      ],
    } as any;
    component.filtersForm.controls.groups.setValue(['East']);
    tick(10);
    expect(component.cascadedLocations).toEqual(['New York']);
  }));

  it('onGroupsChanged should clear cascades when no groups selected', fakeAsync(() => {
    component.cascadedPractices = ['East Clinic'];
    component.cascadedLocations = ['New York'];
    component.filtersForm.controls.groups.setValue([]);
    tick(10);
    expect(component.cascadedPractices).toBeNull();
    expect(component.cascadedLocations).toBeNull();
  }));

  it('onGroupsChanged should clear cascades when options has no groupsData', fakeAsync(() => {
    component.cascadedPractices = ['x'];
    component.options = { ...mockOptions };
    (component.options as any).groupsData = null;
    component.filtersForm.controls.groups.setValue(['East']);
    tick(10);
    expect(component.cascadedPractices).toBeNull();
  }));

  // --- patchFromInitial with scopes -----------------------------------------

  it('patchFromInitial with group scope sets groups', () => {
    const initVal = { location: { scope: 'group', groups: ['East'] }, payers: [], providers: [] } as any;
    component.initialValue = initVal;
    component.ngOnChanges({ initialValue: { currentValue: initVal, previousValue: null, firstChange: false, isFirstChange: () => false } } as any);
    expect(component.filtersForm.controls.groups.value).toEqual(['East']);
    expect(component.filtersForm.controls.locationScope.value).toBe('group');
  });

  it('patchFromInitial with practice scope sets practices', () => {
    const initVal = { location: { scope: 'practice', practices: ['Main'] }, payers: [], providers: [] } as any;
    component.initialValue = initVal;
    component.ngOnChanges({ initialValue: { currentValue: initVal, previousValue: null, firstChange: false, isFirstChange: () => false } } as any);
    expect(component.filtersForm.controls.practices.value).toEqual(['Main']);
    expect(component.filtersForm.controls.locationScope.value).toBe('practice');
  });

  it('patchFromInitial with location scope sets locations', () => {
    const initVal = { location: { scope: 'location', locations: ['NYC'] }, payers: [], providers: [] } as any;
    component.initialValue = initVal;
    component.ngOnChanges({ initialValue: { currentValue: initVal, previousValue: null, firstChange: false, isFirstChange: () => false } } as any);
    expect(component.filtersForm.controls.locations.value).toEqual(['NYC']);
    expect(component.filtersForm.controls.locationScope.value).toBe('location');
  });

  // --- value getter with different scopes -----------------------------------

  it('value getter returns group scope', () => {
    component.filtersForm.controls.locationScope.setValue('group');
    component.filtersForm.controls.groups.setValue(['East', 'West']);
    const val = component.value;
    expect(val.location.scope).toBe('group');
    expect((val.location as any).groups).toEqual(['East', 'West']);
  });

  it('value getter returns practice scope', () => {
    component.filtersForm.controls.locationScope.setValue('practice');
    component.filtersForm.controls.practices.setValue(['Main']);
    const val = component.value;
    expect(val.location.scope).toBe('practice');
  });

  it('value getter returns location scope', () => {
    component.filtersForm.controls.locationScope.setValue('location');
    component.filtersForm.controls.locations.setValue(['Chicago']);
    const val = component.value;
    expect(val.location.scope).toBe('location');
  });

  // --- locationLabel for scopes ---------------------------------------------

  it('locationLabel returns All for enterprise scope', () => {
    component.filtersForm.controls.locationScope.setValue('enterprise');
    expect(component.locationLabel).toBe('All');
  });

  it('locationLabel returns group label', () => {
    component.filtersForm.controls.locationScope.setValue('group');
    component.filtersForm.controls.groups.setValue(['East']);
    expect(component.locationLabel).toBe('East');
  });

  it('locationLabel returns practice label', () => {
    component.filtersForm.controls.locationScope.setValue('practice');
    component.filtersForm.controls.practices.setValue(['Main', 'Branch']);
    expect(component.locationLabel).toBe('2 selected');
  });

  it('locationLabel returns location label', () => {
    component.filtersForm.controls.locationScope.setValue('location');
    component.filtersForm.controls.locations.setValue(['New York']);
    expect(component.locationLabel).toBe('New York');
  });

  // --- payerOptions and providerOptions with refined values ----------------

  it('payerOptions returns refinedPayers when set', () => {
    component.refinedPayers = ['Delta'];
    expect(component.payerOptions).toEqual(['Delta']);
  });

  it('payerOptions returns options.payers when no refined', () => {
    component.refinedPayers = null;
    expect(component.payerOptions).toEqual(mockOptions.payers);
  });

  it('providerOptions returns refinedProviders when set', () => {
    component.refinedProviders = ['Dr. A'];
    expect(component.providerOptions).toEqual(['Dr. A']);
  });

  // --- practiceOptions and locationOptions with cascaded values ------------

  it('practiceOptions returns cascadedPractices when set', () => {
    component.cascadedPractices = ['ClinA', 'ClinB'];
    expect(component.practiceOptions).toEqual(['ClinA', 'ClinB']);
  });

  it('practiceOptions returns refinedPractices when cascaded is null', () => {
    component.cascadedPractices = null;
    component.refinedPractices = ['RefinedMain'];
    expect(component.practiceOptions).toEqual(['RefinedMain']);
  });

  it('practiceOptions falls back to options.practices', () => {
    component.cascadedPractices = null;
    component.refinedPractices = null;
    expect(component.practiceOptions).toEqual(mockOptions.practices);
  });

  it('locationOptions returns cascadedLocations when set', () => {
    component.cascadedLocations = ['CityA'];
    expect(component.locationOptions).toEqual(['CityA']);
  });

  it('locationOptions returns refinedLocations when cascaded null', () => {
    component.cascadedLocations = null;
    component.refinedLocations = ['RefinedCity'];
    expect(component.locationOptions).toEqual(['RefinedCity']);
  });

  // --- filtered search options ----------------------------------------------

  it('filteredPayerOptions filters by payerSearch', () => {
    component.payerSearch = 'aetna';
    expect(component.filteredPayerOptions).toEqual(['Aetna']);
  });

  it('filteredProviderOptions filters by providerSearch', () => {
    component.providerSearch = 'smith';
    expect(component.filteredProviderOptions).toEqual(['Dr. Smith']);
  });

  it('filteredGroupOptions filters by locationSearch', () => {
    component.locationSearch = 'east';
    expect(component.filteredGroupOptions).toEqual(['East']);
  });

  it('filteredPracticeOptions filters by locationSearch', () => {
    component.locationSearch = 'main';
    expect(component.filteredPracticeOptions).toEqual(['Main']);
  });

  it('filteredLocationOptions filters by locationSearch', () => {
    component.locationSearch = 'new';
    expect(component.filteredLocationOptions).toEqual(['New York']);
  });

  // --- syncProviderVisibility via NavigationEnd ------------------------------

  it('shows provider on recon-iq route', fakeAsync(() => {
    routerEventSubject.next(new NavigationEnd(1, '/recon-iq/dashboard', '/recon-iq/dashboard'));
    tick(10);
    expect(component.showProvider).toBeTrue();
  }));

  it('hides provider on non-recon-iq route when currently showing', fakeAsync(() => {
    // First navigate to recon-iq
    routerEventSubject.next(new NavigationEnd(1, '/recon-iq/dashboard', '/recon-iq/dashboard'));
    tick(10);
    expect(component.showProvider).toBeTrue();
    // Set a provider selection
    component.filtersForm.controls.providers.setValue(['Dr. Smith']);
    // Navigate away
    routerEventSubject.next(new NavigationEnd(2, '/dashboard', '/dashboard'));
    tick(10);
    expect(component.showProvider).toBeFalse();
    expect(component.filtersForm.controls.providers.value).toEqual([]);
  }));

  // --- clearLocation with scopes ---------------------------------------------

  it('clearLocation clears groups when scope is group', () => {
    component.filtersForm.controls.locationScope.setValue('group');
    component.filtersForm.controls.groups.setValue(['East']);
    component.clearLocation();
    expect(component.filtersForm.controls.groups.value).toEqual([]);
  });

  it('clearLocation clears practices when scope is practice', () => {
    component.filtersForm.controls.locationScope.setValue('practice');
    component.filtersForm.controls.practices.setValue(['Main']);
    component.clearLocation();
    expect(component.filtersForm.controls.practices.value).toEqual([]);
  });

  it('clearLocation clears locations when scope is location', () => {
    component.filtersForm.controls.locationScope.setValue('location');
    component.filtersForm.controls.locations.setValue(['New York']);
    component.clearLocation();
    expect(component.filtersForm.controls.locations.value).toEqual([]);
  });

  // --- onLocationTabChange ---------------------------------------------------

  it('onLocationTabChange with group tab and no groups sets enterprise', () => {
    component.locationTab = 'group';
    component.filtersForm.controls.groups.setValue([]);
    component.onLocationTabChange();
    expect(component.filtersForm.controls.locationScope.value).toBe('enterprise');
  });

  it('onLocationTabChange with group tab and groups sets group scope', () => {
    component.locationTab = 'group';
    component.filtersForm.controls.groups.setValue(['East']);
    component.onLocationTabChange();
    expect(component.filtersForm.controls.locationScope.value).toBe('group');
  });

  it('onLocationTabChange with practice tab and no practices sets enterprise', () => {
    component.locationTab = 'practice';
    component.filtersForm.controls.practices.setValue([]);
    component.onLocationTabChange();
    expect(component.filtersForm.controls.locationScope.value).toBe('enterprise');
  });

  it('onLocationTabChange with location tab and locations sets location scope', () => {
    component.locationTab = 'location';
    component.filtersForm.controls.locations.setValue(['Chicago']);
    component.onLocationTabChange();
    expect(component.filtersForm.controls.locationScope.value).toBe('location');
  });

  // --- setLocationScope ------------------------------------------------------

  it('setLocationScope to enterprise clears groups and locations', () => {
    component.filtersForm.controls.groups.setValue(['East']);
    component.filtersForm.controls.locations.setValue(['NYC']);
    component.setLocationScope('enterprise');
    expect(component.filtersForm.controls.groups.value).toEqual([]);
    expect(component.filtersForm.controls.locations.value).toEqual([]);
  });

  it('setLocationScope to practice does not clear groups', () => {
    component.filtersForm.controls.groups.setValue(['East']);
    component.setLocationScope('practice');
    expect(component.filtersForm.controls.groups.value).toEqual(['East']);
  });

  // --- isGroupSelected, isGroupIndeterminate, toggleGroup -------------------

  it('isGroupSelected returns false when group not found', () => {
    component.options = { ...mockOptions, groupsData: [] };
    expect(component.isGroupSelected('NonExistent')).toBeFalse();
  });

  it('toggleGroup with checked adds all group locations', () => {
    const mockGroupsData = [
      {
        name: 'East',
        practices: [
          { name: 'Main', locations: [{ name: 'NYC' }, { name: 'Boston' }] },
        ],
      },
    ];
    component.options = { ...mockOptions, groupsData: mockGroupsData as any };
    component.toggleGroup(mockGroupsData[0] as any, true);
    expect(component.filtersForm.controls.locations.value).toContain('NYC');
    expect(component.filtersForm.controls.locations.value).toContain('Boston');
    expect(component.filtersForm.controls.locationScope.value).toBe('location');
  });

  it('toggleGroup with unchecked removes group locations', () => {
    const mockGroupsData = [
      {
        name: 'East',
        practices: [
          { name: 'Main', locations: [{ name: 'NYC' }] },
        ],
      },
    ];
    component.options = { ...mockOptions, groupsData: mockGroupsData as any };
    component.filtersForm.controls.locations.setValue(['NYC', 'Chicago']);
    component.toggleGroup(mockGroupsData[0] as any, false);
    expect(component.filtersForm.controls.locations.value).not.toContain('NYC');
    expect(component.filtersForm.controls.locations.value).toContain('Chicago');
  });

  it('toggleGroup with no locations sets scope to enterprise', () => {
    const mockGroupsData = [
      { name: 'Empty', practices: [] },
    ];
    component.options = { ...mockOptions, groupsData: mockGroupsData as any };
    component.toggleGroup(mockGroupsData[0] as any, false);
    expect(component.filtersForm.controls.locationScope.value).toBe('enterprise');
  });

  it('isGroupIndeterminate returns true when some but not all selected', () => {
    const group = {
      name: 'East',
      practices: [{ name: 'Main', locations: [{ name: 'NYC' }, { name: 'Boston' }] }],
    } as any;
    component.options = { ...mockOptions, groupsData: [group] };
    component.filtersForm.controls.locations.setValue(['NYC']); // only one of two
    expect(component.isGroupIndeterminate(group)).toBeTrue();
  });

  it('isGroupIndeterminate returns false when all selected', () => {
    const group = {
      name: 'East',
      practices: [{ name: 'Main', locations: [{ name: 'NYC' }] }],
    } as any;
    component.options = { ...mockOptions, groupsData: [group] };
    component.filtersForm.controls.locations.setValue(['NYC']);
    expect(component.isGroupIndeterminate(group)).toBeFalse();
  });

  // --- toggleLocationInGroup -------------------------------------------------

  it('toggleLocationInGroup adds location and sets location scope', () => {
    component.toggleLocationInGroup('Chicago', true);
    expect(component.filtersForm.controls.locations.value).toContain('Chicago');
    expect(component.filtersForm.controls.locationScope.value).toBe('location');
  });

  it('toggleLocationInGroup removes location and sets enterprise when empty', () => {
    component.filtersForm.controls.locations.setValue(['Chicago']);
    component.toggleLocationInGroup('Chicago', false);
    expect(component.filtersForm.controls.locations.value).not.toContain('Chicago');
    expect(component.filtersForm.controls.locationScope.value).toBe('enterprise');
  });

  // --- refreshRefinedOptions when no selections -----------------------------

  it('refreshRefinedOptions clears refined when nothing selected', fakeAsync(() => {
    component.refinedPractices = ['X'];
    component.refinedLocations = ['Y'];
    component.refinedPayers = ['Z'];
    component.refinedProviders = ['W'];
    // All form values are already empty arrays from initialization
    // Trigger valueChanges by changing something back
    component.filtersForm.controls.payers.setValue([]);
    tick(400);
    expect(component.refinedPractices).toBeNull();
    expect(component.refinedLocations).toBeNull();
    expect(component.refinedPayers).toBeNull();
    expect(component.refinedProviders).toBeNull();
  }));

  it('refreshRefinedOptions calls service when payers selected', fakeAsync(() => {
    mockFilterOptionsSvc.getRefinedOptions.and.returnValue(of({
      practices: ['P1'], locations: ['L1'], payers: ['Pay1'], providers: ['Prov1'],
    }));
    component.filtersForm.controls.payers.setValue(['Aetna']);
    tick(400);
    expect(mockFilterOptionsSvc.getRefinedOptions).toHaveBeenCalled();
    expect(component.refinedPractices).toEqual(['P1']);
  }));

  // --- Option getters - null/fallback paths ---------------------------------

  describe('option getters', () => {
    it('payerOptions returns refinedPayers when set', () => {
      component.refinedPayers = ['RefinedPay1'];
      expect(component.payerOptions).toEqual(['RefinedPay1']);
    });

    it('payerOptions falls back to options.payers', () => {
      component.refinedPayers = null;
      expect(component.payerOptions).toEqual(mockOptions.payers);
    });

    it('payerOptions falls back to [] when options is null', () => {
      component.refinedPayers = null;
      component.options = null as any;
      expect(component.payerOptions).toEqual([]);
    });

    it('providerOptions returns refinedProviders when set', () => {
      component.refinedProviders = ['RefinedProv1'];
      expect(component.providerOptions).toEqual(['RefinedProv1']);
    });

    it('providerOptions falls back to options.providers', () => {
      component.refinedProviders = null;
      expect(component.providerOptions).toEqual(mockOptions.providers);
    });

    it('providerOptions falls back to [] when options is null', () => {
      component.refinedProviders = null;
      component.options = null as any;
      expect(component.providerOptions).toEqual([]);
    });

    it('groupOptions returns options.groups', () => {
      expect(component.groupOptions).toEqual(mockOptions.groups);
    });

    it('groupOptions returns [] when options.groups is missing', () => {
      component.options = { ...mockOptions, groups: undefined as any };
      expect(component.groupOptions).toEqual([]);
    });

    it('practiceOptions returns cascadedPractices when set', () => {
      component.cascadedPractices = ['CascadedP1'];
      expect(component.practiceOptions).toEqual(['CascadedP1']);
    });

    it('practiceOptions returns refinedPractices when cascadedPractices is null', () => {
      component.cascadedPractices = null;
      component.refinedPractices = ['RefinedP1'];
      expect(component.practiceOptions).toEqual(['RefinedP1']);
    });

    it('practiceOptions falls back to options.practices', () => {
      component.cascadedPractices = null;
      component.refinedPractices = null;
      expect(component.practiceOptions).toEqual(mockOptions.practices);
    });

    it('practiceOptions falls back to [] when options is null', () => {
      component.cascadedPractices = null;
      component.refinedPractices = null;
      component.options = null as any;
      expect(component.practiceOptions).toEqual([]);
    });

    it('locationOptions returns cascadedLocations when set', () => {
      component.cascadedLocations = ['CascLoc1'];
      expect(component.locationOptions).toEqual(['CascLoc1']);
    });

    it('locationOptions returns refinedLocations when cascadedLocations is null', () => {
      component.cascadedLocations = null;
      component.refinedLocations = ['RefinedLoc1'];
      expect(component.locationOptions).toEqual(['RefinedLoc1']);
    });

    it('locationOptions falls back to options.locations', () => {
      component.cascadedLocations = null;
      component.refinedLocations = null;
      expect(component.locationOptions).toEqual(mockOptions.locations);
    });

    it('locationOptions falls back to [] when options is null', () => {
      component.cascadedLocations = null;
      component.refinedLocations = null;
      component.options = null as any;
      expect(component.locationOptions).toEqual([]);
    });
  });

  // --- Filtered option getters (search) -------------------------------------

  describe('filtered option getters', () => {
    it('filteredPayerOptions returns all when payerSearch is empty', () => {
      component.payerSearch = '';
      expect(component.filteredPayerOptions).toEqual(mockOptions.payers);
    });

    it('filteredPayerOptions filters by payerSearch', () => {
      component.payerSearch = 'Aetna';
      expect(component.filteredPayerOptions).toEqual(['Aetna']);
    });

    it('filteredProviderOptions returns all when providerSearch is empty', () => {
      component.providerSearch = '';
      expect(component.filteredProviderOptions).toEqual(mockOptions.providers);
    });

    it('filteredProviderOptions filters by providerSearch', () => {
      component.providerSearch = 'Smith';
      expect(component.filteredProviderOptions).toEqual(['Dr. Smith']);
    });

    it('filteredGroupOptions returns all when locationSearch is empty', () => {
      component.locationSearch = '';
      expect(component.filteredGroupOptions).toEqual(mockOptions.groups);
    });

    it('filteredGroupOptions filters by locationSearch', () => {
      component.locationSearch = 'East';
      expect(component.filteredGroupOptions).toEqual(['East']);
    });
  });
});
