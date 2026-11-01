import { emptySlice, isFresh, loadingSlice, loadedSlice, errorSlice, StoreSlice } from './store.models';

describe('Store Model Helpers', () => {

  // -- emptySlice ------------------------------------------------------------

  describe('emptySlice()', () => {
    it('returns slice with null data, not loading, no error, cachedAt=0', () => {
      const s = emptySlice<string[]>();
      expect(s.data).toBeNull();
      expect(s.loading).toBeFalse();
      expect(s.error).toBeNull();
      expect(s.cachedAt).toBe(0);
    });
  });

  // -- isFresh ---------------------------------------------------------------

  describe('isFresh()', () => {
    it('returns false for emptySlice (data=null)', () => {
      const s = emptySlice<string[]>();
      expect(isFresh(s, 60000)).toBeFalse();
    });

    it('returns true when data exists and cachedAt is within TTL', () => {
      const s: StoreSlice<string[]> = { data: ['a'], loading: false, error: null, cachedAt: Date.now() - 1000 };
      expect(isFresh(s, 60000)).toBeTrue();
    });

    it('returns false when cachedAt is older than TTL', () => {
      const s: StoreSlice<string[]> = { data: ['a'], loading: false, error: null, cachedAt: Date.now() - 120000 };
      expect(isFresh(s, 60000)).toBeFalse();
    });

    it('returns false when data is null even with recent cachedAt', () => {
      const s: StoreSlice<string[]> = { data: null, loading: false, error: null, cachedAt: Date.now() };
      expect(isFresh(s, 60000)).toBeFalse();
    });
  });

  // -- loadingSlice ----------------------------------------------------------

  describe('loadingSlice()', () => {
    it('sets loading=true and clears error, preserves existing data', () => {
      const current: StoreSlice<string[]> = { data: ['existing'], loading: false, error: 'old error', cachedAt: 100 };
      const s = loadingSlice(current);
      expect(s.loading).toBeTrue();
      expect(s.error).toBeNull();
      expect(s.data).toEqual(['existing']); // stale data preserved
      expect(s.cachedAt).toBe(100);
    });

    it('works on empty slice', () => {
      const s = loadingSlice(emptySlice<number>());
      expect(s.loading).toBeTrue();
      expect(s.data).toBeNull();
    });
  });

  // -- loadedSlice -----------------------------------------------------------

  describe('loadedSlice()', () => {
    it('sets data, clears loading and error, sets cachedAt to now', () => {
      const before = Date.now();
      const s = loadedSlice(['item1', 'item2']);
      const after = Date.now();
      expect(s.data).toEqual(['item1', 'item2']);
      expect(s.loading).toBeFalse();
      expect(s.error).toBeNull();
      expect(s.cachedAt).toBeGreaterThanOrEqual(before);
      expect(s.cachedAt).toBeLessThanOrEqual(after);
    });

    it('works with null as data value', () => {
      const s = loadedSlice<string[] | null>(null);
      expect(s.data).toBeNull();
      expect(s.loading).toBeFalse();
    });
  });

  // -- errorSlice ------------------------------------------------------------

  describe('errorSlice()', () => {
    it('sets error message, clears loading, preserves stale data', () => {
      const current: StoreSlice<string[]> = { data: ['stale'], loading: true, error: null, cachedAt: 50 };
      const s = errorSlice(current, 'Network error');
      expect(s.error).toBe('Network error');
      expect(s.loading).toBeFalse();
      expect(s.data).toEqual(['stale']); // stale data preserved for display
      expect(s.cachedAt).toBe(50);
    });

    it('works on empty slice', () => {
      const s = errorSlice(emptySlice<string[]>(), 'Failed');
      expect(s.error).toBe('Failed');
      expect(s.data).toBeNull();
    });
  });

  // -- Full lifecycle ---------------------------------------------------------

  describe('Full load lifecycle', () => {
    it('empty \u2192 loading \u2192 loaded \u2192 stale-loading \u2192 loaded', () => {
      let s = emptySlice<string[]>();
      expect(s.data).toBeNull();
      expect(s.loading).toBeFalse();

      s = loadingSlice(s);
      expect(s.loading).toBeTrue();
      expect(s.data).toBeNull();

      s = loadedSlice(['a', 'b']);
      expect(s.data).toEqual(['a', 'b']);
      expect(s.loading).toBeFalse();
      expect(isFresh(s, 60000)).toBeTrue();

      // Simulate re-load while stale data still available
      const stale = s;
      s = loadingSlice(s);
      expect(s.loading).toBeTrue();
      expect(s.data).toEqual(stale.data); // stale data still shown

      s = loadedSlice(['c', 'd']);
      expect(s.data).toEqual(['c', 'd']);
    });

    it('empty \u2192 loading \u2192 error', () => {
      let s = emptySlice<string[]>();
      s = loadingSlice(s);
      s = errorSlice(s, 'Server error');

      expect(s.data).toBeNull();
      expect(s.loading).toBeFalse();
      expect(s.error).toBe('Server error');
      expect(isFresh(s, 60000)).toBeFalse();
    });
  });
});
