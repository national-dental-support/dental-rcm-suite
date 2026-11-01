import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { ClaimVisionService } from '../services/claim-vision.service';
import { Rule, RuleDraft } from '../models/rules.model';
import {
  StoreSlice,
  emptySlice,
  loadingSlice,
  loadedSlice,
  errorSlice,
} from '../../store/store.models';

const TTL_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class RulesStoreService {
  private readonly _custom$ = new BehaviorSubject<StoreSlice<Rule[]>>(emptySlice());
  private readonly _system$ = new BehaviorSubject<StoreSlice<Rule[]>>(emptySlice());

  readonly customRules$  = this._custom$.pipe(map(s => s.data ?? []), distinctUntilChanged());
  readonly systemRules$  = this._system$.pipe(map(s => s.data ?? []), distinctUntilChanged());
  readonly loading$      = this._custom$.pipe(map(s => s.loading), distinctUntilChanged());
  readonly error$        = this._custom$.pipe(map(s => s.error), distinctUntilChanged());

  constructor(private claimVisionService: ClaimVisionService) {}

  loadAll(force = false): void {
    const customFresh = !force && this._custom$.value.data !== null &&
      Date.now() - this._custom$.value.cachedAt < TTL_MS;
    if (customFresh) return;

    this._custom$.next(loadingSlice(this._custom$.value));
    this._system$.next(loadingSlice(this._system$.value));

    forkJoin({
      custom: this.claimVisionService.getCustomRules(),
      system: this.claimVisionService.getSystemRules(),
    }).subscribe({
      next: ({ custom, system }) => {
        this._custom$.next(loadedSlice([...(custom || [])]));
        this._system$.next(loadedSlice([...(system || [])]));
      },
      error: (err) => {
        const msg = err?.message ?? 'Failed to load rules';
        this._custom$.next(errorSlice(this._custom$.value, msg));
        this._system$.next(errorSlice(this._system$.value, msg));
      },
    });
  }

  addCustomRule(draft: RuleDraft): Rule {
    const all = [...(this._custom$.value.data ?? []), ...(this._system$.value.data ?? [])];
    const maxNumeric = all.reduce((max, r) => {
      const n = Number(r.id);
      return !isNaN(n) && n > max ? n : max;
    }, 0);
    const nextId = String(maxNumeric + 1);
    const now = new Date();
    const dateLabel = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const createdLabel = `${dateLabel}\nYou`;

    const newRule: Rule = {
      id: nextId,
      ...draft,
      createdLabel,
      modifiedLabel: createdLabel,
      claimsImpacted: 0,
      kind: 'custom',
      scope: draft.scope || 'enterprise',
      scopeValues: draft.scopeValues || [],
    };

    const current = this._custom$.value.data ?? [];
    this._custom$.next(loadedSlice([...current, newRule]));
    return newRule;
  }

  updateRule(updated: Rule): void {
    const custom = this._custom$.value.data ?? [];
    const system = this._system$.value.data ?? [];

    const idx = custom.findIndex(r => r.id === updated.id);
    if (idx !== -1) {
      const copy = [...custom];
      copy[idx] = updated;
      this._custom$.next(loadedSlice(copy));
      return;
    }

    const sysIdx = system.findIndex(r => r.id === updated.id);
    if (sysIdx !== -1) {
      const copy = [...system];
      copy[sysIdx] = updated;
      this._system$.next(loadedSlice(copy));
    }
  }

  deleteRule(id: string): void {
    const before = this._custom$.value.data ?? [];
    const optimistic = before.filter(r => r.id !== id);
    this._custom$.next(loadedSlice(optimistic));

    this.claimVisionService.deleteRule(id).subscribe({
      error: () => {
        this._custom$.next(loadedSlice(before));
        this.loadAll(true);
      },
    });
  }

  reorderCustomRules(reordered: Rule[]): void {
    this._custom$.next(loadedSlice([...reordered]));

    const items = reordered.map((r, i) => ({ ruleId: r.id, executionOrder: i }));
    this.claimVisionService.reorderRules(items).subscribe({
      error: () => this.loadAll(true),
    });
  }

  getRuleById(id: string): Rule | undefined {
    return (
      (this._custom$.value.data ?? []).find(r => r.id === id) ||
      (this._system$.value.data ?? []).find(r => r.id === id)
    );
  }

  get customSnapshot(): Rule[] { return this._custom$.value.data ?? []; }
  get systemSnapshot(): Rule[] { return this._system$.value.data ?? []; }
}
