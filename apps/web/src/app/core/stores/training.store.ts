import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { TrainingService } from '../services/training.service';
import { TrainingModule, LearningPath, MyTrainingDashboard, BrowsablePath } from '../models/training.model';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
  isFresh,
} from '../../store/store.models';

const TTL_MS = 10 * 60_000;

@Injectable({ providedIn: 'root' })
export class TrainingStore {
  private readonly _modules$      = new BehaviorSubject<StoreSlice<TrainingModule[]>>(emptySlice());
  private readonly _paths$        = new BehaviorSubject<StoreSlice<LearningPath[]>>(emptySlice());
  private readonly _dashboard$    = new BehaviorSubject<StoreSlice<MyTrainingDashboard>>(emptySlice());
  private readonly _browsePaths$  = new BehaviorSubject<StoreSlice<BrowsablePath[]>>(emptySlice());

  readonly modules$          = this._modules$.pipe(map(s => s.data), distinctUntilChanged());
  readonly paths$            = this._paths$.pipe(map(s => s.data), distinctUntilChanged());
  readonly dashboard$        = this._dashboard$.pipe(map(s => s.data), distinctUntilChanged());
  readonly browsePaths$      = this._browsePaths$.pipe(map(s => s.data), distinctUntilChanged());
  readonly loading$          = this._modules$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly dashboardLoading$ = this._dashboard$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly browsePathsLoading$ = this._browsePaths$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly error$            = this._modules$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(private trainingService: TrainingService) {}

  loadModules(force = false): void {
    if (!force && isFresh(this._modules$.value, TTL_MS)) return;
    this._modules$.next(loadingSlice(this._modules$.value));
    this.trainingService.getModules().subscribe({
      next: res => this._modules$.next(loadedSlice(res.data || [])),
      error: err => this._modules$.next(errorSlice(this._modules$.value, err?.message ?? 'Load failed')),
    });
  }

  loadPaths(force = false): void {
    if (!force && isFresh(this._paths$.value, TTL_MS)) return;
    this._paths$.next(loadingSlice(this._paths$.value));
    this.trainingService.getPaths().subscribe({
      next: res => this._paths$.next(loadedSlice(res.data || [])),
      error: err => this._paths$.next(errorSlice(this._paths$.value, err?.message ?? 'Load failed')),
    });
  }

  loadDashboard(force = false): void {
    if (!force && isFresh(this._dashboard$.value, TTL_MS)) return;
    this._dashboard$.next(loadingSlice(this._dashboard$.value));
    this.trainingService.getMyDashboard().subscribe({
      next: data => this._dashboard$.next(loadedSlice(data)),
      error: err => this._dashboard$.next(errorSlice(this._dashboard$.value, err?.message ?? 'Load failed')),
    });
  }

  loadBrowsePaths(force = false): void {
    if (!force && isFresh(this._browsePaths$.value, TTL_MS)) return;
    this._browsePaths$.next(loadingSlice(this._browsePaths$.value));
    this.trainingService.getBrowsePaths().subscribe({
      next: res => this._browsePaths$.next(loadedSlice(res.data || [])),
      error: err => this._browsePaths$.next(errorSlice(this._browsePaths$.value, err?.message ?? 'Load failed')),
    });
  }

  reload(): void {
    this.loadModules(true);
    this.loadPaths(true);
    this.loadDashboard(true);
    this.loadBrowsePaths(true);
  }

  get modulesSnapshot(): TrainingModule[] | null { return this._modules$.value.data; }
  get pathsSnapshot(): LearningPath[] | null { return this._paths$.value.data; }
  get dashboardSnapshot(): MyTrainingDashboard | null { return this._dashboard$.value.data; }
  get browsePathsSnapshot(): BrowsablePath[] | null { return this._browsePaths$.value.data; }
}
