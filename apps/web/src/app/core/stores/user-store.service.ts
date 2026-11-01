import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { UserState } from '../services/user.service';
import {
  StoreSlice,
  emptySlice,
  loadedSlice,
  errorSlice,
} from '../../store/store.models';

@Injectable({ providedIn: 'root' })
export class UserStoreService {
  private readonly _slice$ = new BehaviorSubject<StoreSlice<UserState>>(emptySlice());

  readonly user$    = this._slice$.pipe(map(s => s.data), distinctUntilChanged());
  readonly loading$ = this._slice$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly error$   = this._slice$.pipe(map(s => s.error), distinctUntilChanged());

  get snapshot(): UserState | null {
    return this._slice$.value.data;
  }

  get userId(): string | null {
    return this._slice$.value.data?.userId ?? null;
  }

  setUser(user: UserState | null): void {
    if (user) {
      this._slice$.next(loadedSlice(user));
    } else {
      this._slice$.next(emptySlice());
    }
  }

  setError(message: string): void {
    this._slice$.next(errorSlice(this._slice$.value, message));
  }

  /** @deprecated use snapshot instead */
  getUser(): UserState | null {
    return this.snapshot;
  }
}
