import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { GlobalFilterOptionsService } from '../../core/services/global-filter-options.service';
import { GlobalFilterOptions } from '../../shared/components/global-filters/global-filters.models';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../store.models';

/** 15-minute TTL for dropdown reference data. */
const REF_DATA_TTL = 15 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class RefDataStore {
  private readonly _slice$ = new BehaviorSubject<StoreSlice<GlobalFilterOptions>>(emptySlice());

  readonly slice$  = this._slice$.asObservable();
  readonly data$   = this._slice$.pipe(map(s => s.data), distinctUntilChanged());
  readonly loading$ = this._slice$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly error$   = this._slice$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(private filterOptionsService: GlobalFilterOptionsService) {}

  /**
   * Load global filter options (payers, practices, providers).
   * Cached for 15 minutes; pass force=true to bypass cache.
   * Call from LayoutComponent.ngOnInit() so the data is ready for all
   * filter dropdowns without each component fetching independently.
   */
  load(force = false): void {
    if (!force && isFresh(this._slice$.value, REF_DATA_TTL)) return;

    this._slice$.next(loadingSlice(this._slice$.value));
    this.filterOptionsService.getGlobalFilterOptions().subscribe({
      next: data => this._slice$.next(loadedSlice(data)),
      error: err => this._slice$.next(
        errorSlice(this._slice$.value, err?.message ?? 'Failed to load filter options'),
      ),
    });
  }

  /** Synchronous snapshot of current data. */
  get snapshot(): GlobalFilterOptions | null {
    return this._slice$.value.data;
  }
}
