// src/app/pages/claim-vision/rules/services/claim-rules.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Rule } from '../../../core/models/rules.model';

const STORAGE_KEY = 'claimVision.claimRules.overrides';

interface RulesStoragePayload {
  rules: Rule[];
  lastUpdated: string; // ISO date (optional, just for debugging)
}

@Injectable({ providedIn: 'root' })
export class ClaimRulesService {
  // All locally overridden rules (created or edited)
  private readonly overridesSubject = new BehaviorSubject<Rule[]>([]);
  readonly overrides$: Observable<Rule[]> = this.overridesSubject.asObservable();

  // Optional: expose overrides as "rules$" so existing code compiles
  private readonly rulesSubject = new BehaviorSubject<Rule[]>([]);
  readonly rules$: Observable<Rule[]> = this.rulesSubject.asObservable();

  constructor() {
    // Initialize from sessionStorage on service construction
    const local = this.loadLocal();
    this.overridesSubject.next(local?.rules ?? []);
    this.rulesSubject.next(local?.rules ?? []);
  }

  /**
   * Safe no-op-ish: re-sync from sessionStorage.
   * Called from ClaimVisionRulesPageComponent.ngOnInit().
   */
  loadRules(): void {
    const local = this.loadLocal();
    const rules = local?.rules ?? [];
    this.overridesSubject.next(rules);
    this.rulesSubject.next(rules);
  }

  /**
   * Upsert a rule into local overrides.
   * - If id matches an existing override: replace it.
   * - If id is empty: generate a temporary local id.
   */
  upsertRule(rule: Rule): void {
    const current = [...this.overridesSubject.value];

    const id =
      rule.id && rule.id.trim().length > 0
        ? rule.id
        : this.generateLocalId();

    const target: Rule = { ...rule, id };

    const idx = current.findIndex((r) => r.id === id);
    if (idx > -1) {
      current[idx] = target;
    } else {
      current.unshift(target);
    }

    this.overridesSubject.next(current);
    this.rulesSubject.next(current);
    this.saveLocal(current);
  }

  /** Optional: delete a rule from local overrides */
  deleteRule(ruleId: string): void {
    const current = this.overridesSubject.value.filter((r) => r.id !== ruleId);
    this.overridesSubject.next(current);
    this.rulesSubject.next(current);
    this.saveLocal(current);
  }

  /**
   * Merge backend rules with local overrides.
   * - Same id -> override wins
   * - Local-only id -> appended
   */
  applyOverrides(baseRules: Rule[]): Rule[] {
    const overrides = this.overridesSubject.value;
    if (!overrides.length) return baseRules || [];

    const map = new Map<string, Rule>();

    // Start with backend data
    (baseRules || []).forEach((r) => {
      if (r && r.id) {
        map.set(r.id, r);
      }
    });

    // Overlay / add overrides
    overrides.forEach((o) => {
      if (o && o.id) {
        map.set(o.id, o);
      }
    });

    return Array.from(map.values());
  }

  /** Call this once you have real PUT/POST in place, after syncing to backend */
  clearLocal(): void {
    this.overridesSubject.next([]);
    this.rulesSubject.next([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }

  // ---------- local storage helpers ----------

  private loadLocal(): RulesStoragePayload | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as RulesStoragePayload;
    } catch {
      return null;
    }
  }

  private saveLocal(rules: Rule[]): void {
    const payload: RulesStoragePayload = {
      rules,
      lastUpdated: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  private generateLocalId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `local-${crypto.randomUUID()}`;
    }
    return `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
