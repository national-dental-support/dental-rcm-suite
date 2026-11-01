/** Generic data slice for all domain stores. */
export interface StoreSlice<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** epoch ms - 0 means "never loaded" */
  cachedAt: number;
}

/** Default empty slice (type-safe initializer). */
export function emptySlice<T>(): StoreSlice<T> {
  return { data: null, loading: false, error: null, cachedAt: 0 };
}

/** Returns true when the slice has fresh data within the given TTL. */
export function isFresh<T>(slice: StoreSlice<T>, ttlMs: number): boolean {
  return !!slice.data && Date.now() - slice.cachedAt < ttlMs;
}

/** Produces a new slice in the "loading" state, preserving stale data. */
export function loadingSlice<T>(current: StoreSlice<T>): StoreSlice<T> {
  return { ...current, loading: true, error: null };
}

/** Produces a new slice with fresh data. */
export function loadedSlice<T>(data: T): StoreSlice<T> {
  return { data, loading: false, error: null, cachedAt: Date.now() };
}

/** Produces a new slice in the error state, preserving stale data. */
export function errorSlice<T>(current: StoreSlice<T>, err: string): StoreSlice<T> {
  return { ...current, loading: false, error: err };
}
