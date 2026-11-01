import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { take } from 'rxjs/operators';
import { RefDataStore } from './ref-data.store';
import { GlobalFilterOptionsService } from '../../core/services/global-filter-options.service';
import { GlobalFilterOptions } from '../../shared/components/global-filters/global-filters.models';

const mockFilterOptions: GlobalFilterOptions = {
  payers: ['Aetna', 'BlueCross'],
  practices: ['Main Clinic'],
  providers: ['Dr. Smith'],
  groups: [],
  locations: ['New York'],
};

describe('RefDataStore', () => {
  let store: RefDataStore;
  let svc: jasmine.SpyObj<GlobalFilterOptionsService>;

  beforeEach(() => {
    svc = jasmine.createSpyObj<GlobalFilterOptionsService>('GlobalFilterOptionsService', [
      'getGlobalFilterOptions',
    ]);

    TestBed.configureTestingModule({
      providers: [
        RefDataStore,
        { provide: GlobalFilterOptionsService, useValue: svc },
      ],
    });
    store = TestBed.inject(RefDataStore);
  });

  it('should start with null snapshot', () => {
    expect(store.snapshot).toBeNull();
  });

  it('should load filter options', fakeAsync(() => {
    svc.getGlobalFilterOptions.and.returnValue(of(mockFilterOptions));

    store.load();
    tick();

    expect(store.snapshot).toEqual(mockFilterOptions);
  }));

  it('should emit loading states', fakeAsync(() => {
    svc.getGlobalFilterOptions.and.returnValue(of(mockFilterOptions));
    const states: boolean[] = [];
    store.loading$.pipe(take(3)).subscribe(l => states.push(l));

    store.load();
    tick();

    expect(states).toEqual([false, true, false]);
  }));

  it('should cache within TTL', fakeAsync(() => {
    svc.getGlobalFilterOptions.and.returnValue(of(mockFilterOptions));

    store.load();
    tick();
    store.load(); // cached
    tick();

    expect(svc.getGlobalFilterOptions).toHaveBeenCalledTimes(1);
  }));

  it('should bypass cache with force=true', fakeAsync(() => {
    svc.getGlobalFilterOptions.and.returnValue(of(mockFilterOptions));

    store.load();
    tick();
    store.load(true);
    tick();

    expect(svc.getGlobalFilterOptions).toHaveBeenCalledTimes(2);
  }));

  it('should set error on failure', fakeAsync(() => {
    svc.getGlobalFilterOptions.and.returnValue(throwError(() => new Error('Server down')));

    store.load();
    tick();

    let error: string | null = null;
    store.error$.subscribe(e => error = e);
    expect(error).toBeTruthy();
    expect(store.snapshot).toBeNull();
  }));

  it('data$ should emit loaded data', fakeAsync(() => {
    svc.getGlobalFilterOptions.and.returnValue(of(mockFilterOptions));
    const values: (GlobalFilterOptions | null)[] = [];
    store.data$.pipe(take(2)).subscribe(d => values.push(d));

    store.load();
    tick();

    expect(values).toEqual([null, mockFilterOptions]);
  }));

  it('should use err.message in errorSlice when error has a message (binary-expr arm1)', fakeAsync(() => {
    // Throw an error with an explicit message - covers err?.message ?? 'fallback' arm1
    const errWithMsg = new Error('Connection refused');
    svc.getGlobalFilterOptions.and.returnValue(throwError(() => errWithMsg));

    store.load(true); // force=true to bypass cache
    tick();

    let error: string | null = null;
    store.error$.subscribe(e => error = e);
    // The error message from err.message should be used
    expect(error).toBe('Connection refused');
  }));
});
