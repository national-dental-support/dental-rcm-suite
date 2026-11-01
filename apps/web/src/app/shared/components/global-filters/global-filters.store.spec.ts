import { TestBed } from '@angular/core/testing';
import { GlobalFiltersStore, PayerIqFiltersStore } from './global-filters.store';
import {
  EMPTY_GLOBAL_FILTERS,
  EMPTY_GLOBAL_OPTIONS,
  EMPTY_PAYERIQ_FILTERS,
  EMPTY_PAYERIQ_OPTIONS,
  GlobalFiltersValue,
  GlobalFilterOptions,
  PayerIqFiltersValue,
  PayerIqFilterOptions,
} from './global-filters.models';

describe('GlobalFiltersStore', () => {
  let store: GlobalFiltersStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GlobalFiltersStore],
    });
    store = TestBed.inject(GlobalFiltersStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should initialize with empty filters', (done) => {
    store.applied$.subscribe(filters => {
      expect(filters).toEqual(EMPTY_GLOBAL_FILTERS);
      done();
    });
  });

  it('should initialize with empty options', (done) => {
    store.options$.subscribe(opts => {
      expect(opts).toEqual(EMPTY_GLOBAL_OPTIONS);
      done();
    });
  });

  it('set() should update applied filters', (done) => {
    const newFilters: GlobalFiltersValue = {
      ...EMPTY_GLOBAL_FILTERS,
      payers: ['BlueCross'],
    };
    store.set(newFilters);
    store.applied$.subscribe(filters => {
      expect(filters.payers).toEqual(['BlueCross']);
      done();
    });
  });

  it('setOptions() should update options', (done) => {
    const newOpts: GlobalFilterOptions = {
      ...EMPTY_GLOBAL_OPTIONS,
      payers: ['Aetna', 'Cigna'],
    };
    store.setOptions(newOpts);
    store.options$.subscribe(opts => {
      expect(opts.payers).toEqual(['Aetna', 'Cigna']);
      done();
    });
  });

  it('value getter should return current filters', () => {
    const newFilters: GlobalFiltersValue = {
      ...EMPTY_GLOBAL_FILTERS,
      providers: ['Dr. Smith'],
    };
    store.set(newFilters);
    expect(store.value.providers).toEqual(['Dr. Smith']);
  });

  it('options getter should return current options', () => {
    const newOpts: GlobalFilterOptions = {
      ...EMPTY_GLOBAL_OPTIONS,
      locations: ['Main Office'],
    };
    store.setOptions(newOpts);
    expect(store.options.locations).toEqual(['Main Office']);
  });

  it('reset() should restore empty state', () => {
    store.set({ ...EMPTY_GLOBAL_FILTERS, payers: ['Test'] });
    store.reset();
    expect(store.value).toEqual(EMPTY_GLOBAL_FILTERS);
    expect(store.options).toEqual(EMPTY_GLOBAL_OPTIONS);
  });
});

describe('PayerIqFiltersStore', () => {
  let store: PayerIqFiltersStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PayerIqFiltersStore],
    });
    store = TestBed.inject(PayerIqFiltersStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should initialize with empty payer-iq filters', (done) => {
    store.applied$.subscribe(filters => {
      expect(filters).toEqual(EMPTY_PAYERIQ_FILTERS);
      done();
    });
  });

  it('should initialize with empty payer-iq options', (done) => {
    store.options$.subscribe(opts => {
      expect(opts).toEqual(EMPTY_PAYERIQ_OPTIONS);
      done();
    });
  });

  it('set() should update applied payer-iq filters', (done) => {
    const newFilters: PayerIqFiltersValue = {
      ...EMPTY_PAYERIQ_FILTERS,
      payers: ['UHC'],
    };
    store.set(newFilters);
    store.applied$.subscribe(filters => {
      expect(filters.payers).toEqual(['UHC']);
      done();
    });
  });

  it('setOptions() should update payer-iq options', (done) => {
    const newOpts: PayerIqFilterOptions = {
      ...EMPTY_PAYERIQ_OPTIONS,
      payers: ['Humana'],
    };
    store.setOptions(newOpts);
    store.options$.subscribe(opts => {
      expect(opts.payers).toEqual(['Humana']);
      done();
    });
  });

  it('reset() should restore empty state', () => {
    store.set({ ...EMPTY_PAYERIQ_FILTERS, payers: ['UHC'] });
    store.reset();
    expect(store.value).toEqual(EMPTY_PAYERIQ_FILTERS);
  });
});
