// global-filters.store.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import {
  GlobalFilterOptions,
  GlobalFiltersValue,
  EMPTY_GLOBAL_FILTERS,
  EMPTY_GLOBAL_OPTIONS,
  PayerIqFilterOptions,
  PayerIqFiltersValue,
  EMPTY_PAYERIQ_FILTERS,
  EMPTY_PAYERIQ_OPTIONS,
} from './global-filters.models';

@Injectable({ providedIn: 'root' })
export class PayerIqFiltersStore {
  private readonly _applied$ = new BehaviorSubject<PayerIqFiltersValue>(EMPTY_PAYERIQ_FILTERS);
  readonly applied$ = this._applied$.asObservable();

  private readonly _options$ = new BehaviorSubject<PayerIqFilterOptions>(EMPTY_PAYERIQ_OPTIONS);
  readonly options$ = this._options$.asObservable();

  set(filters: PayerIqFiltersValue): void {
    this._applied$.next(filters);
  }

  setOptions(opts: PayerIqFilterOptions): void {
    this._options$.next(opts);
  }

  get value(): PayerIqFiltersValue {
    return this._applied$.value;
  }

  get options(): PayerIqFilterOptions {
    return this._options$.value;
  }

  reset(): void {
    this._applied$.next(EMPTY_PAYERIQ_FILTERS);
    this._options$.next(EMPTY_PAYERIQ_OPTIONS);
  }
}

@Injectable({ providedIn: 'root' })
export class GlobalFiltersStore {
  private readonly _applied$ = new BehaviorSubject<GlobalFiltersValue>(EMPTY_GLOBAL_FILTERS);
  readonly applied$ = this._applied$.asObservable();

  private readonly _options$ = new BehaviorSubject<GlobalFilterOptions>(EMPTY_GLOBAL_OPTIONS);
  readonly options$ = this._options$.asObservable();

  set(filters: GlobalFiltersValue): void {
    this._applied$.next(filters);
  }

  setOptions(opts: GlobalFilterOptions): void {
    this._options$.next(opts);
  }

  get value(): GlobalFiltersValue {
    return this._applied$.value;
  }

  get options(): GlobalFilterOptions {
    return this._options$.value;
  }

  reset(): void {
    this._applied$.next(EMPTY_GLOBAL_FILTERS);
    this._options$.next(EMPTY_GLOBAL_OPTIONS);
  }
}
