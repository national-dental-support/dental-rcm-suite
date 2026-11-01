import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { ClaimVisionService, ClaimVisionBatch, RejectedClaimsTrendPoint } from '../services/claim-vision.service';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../../store/store.models';

const TTL_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class ClaimVisionStore {
  private readonly _batches$ = new BehaviorSubject<StoreSlice<ClaimVisionBatch[]>>(emptySlice());
  private readonly _trend$   = new BehaviorSubject<StoreSlice<RejectedClaimsTrendPoint[]>>(emptySlice());

  readonly batches$  = this._batches$.pipe(map(s => s.data), distinctUntilChanged());
  readonly trend$    = this._trend$.pipe(map(s => s.data), distinctUntilChanged());
  readonly loading$  = this._batches$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly error$    = this._batches$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(private claimVisionService: ClaimVisionService) {}

  loadBatches(force = false): void {
    if (!force && isFresh(this._batches$.value, TTL_MS)) return;
    this._batches$.next(loadingSlice(this._batches$.value));
    this.claimVisionService.getRejectedClaims().subscribe({
      next: data => this._batches$.next(loadedSlice(data)),
      error: err  => this._batches$.next(errorSlice(this._batches$.value, err?.message ?? 'Load failed')),
    });
  }

  loadTrend(force = false): void {
    if (!force && isFresh(this._trend$.value, TTL_MS)) return;
    this._trend$.next(loadingSlice(this._trend$.value));
    this.claimVisionService.getRejectedClaimsTrend().subscribe({
      next: data => this._trend$.next(loadedSlice(data)),
      error: err  => this._trend$.next(errorSlice(this._trend$.value, err?.message ?? 'Load failed')),
    });
  }

  reload(): void {
    this.loadBatches(true);
    this.loadTrend(true);
  }

  get batchesSnapshot(): ClaimVisionBatch[] | null { return this._batches$.value.data; }
  get trendSnapshot(): RejectedClaimsTrendPoint[] | null { return this._trend$.value.data; }
}
