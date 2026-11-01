import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { InsightflowStore } from '../../store/insightflow/insightflow.store';

export interface ImpersonatedUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class ImpersonationService {
  constructor(private insightflowStore: InsightflowStore) {}

  private _impersonating$ = new BehaviorSubject<ImpersonatedUser | null>(null);
  impersonating$ = this._impersonating$.asObservable();

  get isImpersonating(): boolean {
    return this._impersonating$.value !== null;
  }

  get currentImpersonation(): ImpersonatedUser | null {
    return this._impersonating$.value;
  }

  startImpersonation(user: ImpersonatedUser, redirectPath?: string): void {
    sessionStorage.setItem('impersonating', JSON.stringify(user));
    // Clear cached subscription state so the reload fetches the impersonated user's role/permissions fresh
    sessionStorage.removeItem('rcm_subscription_state');
    this._impersonating$.next(user);
    this.insightflowStore.clear();
    // Navigate to the target path (e.g. the right queue for this persona's role) or
    // fall back to a plain reload so existing callers that don't pass a path still work.
    if (redirectPath) {
      // Only allow same-origin relative paths - prevent open redirect attacks
      if (redirectPath.startsWith('/') && !redirectPath.startsWith('//')) {
        window.location.href = redirectPath;
      } else {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  }

  stopImpersonation(): void {
    sessionStorage.removeItem('impersonating');
    // Clear cached subscription state so the reload fetches the real user's role/permissions fresh
    sessionStorage.removeItem('rcm_subscription_state');
    this._impersonating$.next(null);
    this.insightflowStore.clear();
    window.location.reload();
  }

  /** Restore from sessionStorage on app init, with structural validation. */
  restore(): void {
    this.validateAndRestore();
  }

  /** Validate sessionStorage on NavigationEnd - clear if malformed. */
  validate(): void {
    this.validateAndRestore();
  }

  private validateAndRestore(): void {
    const stored = sessionStorage.getItem('impersonating');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (
        parsed &&
        typeof parsed === 'object' &&
        Number.isInteger(parsed.id) &&
        parsed.id > 0 &&
        typeof parsed.name === 'string' &&
        typeof parsed.email === 'string' &&
        typeof parsed.role === 'string'
      ) {
        this._impersonating$.next(parsed as ImpersonatedUser);
      } else {
        console.warn('[ImpersonationService] Malformed impersonation data \u2014 clearing.');
        sessionStorage.removeItem('impersonating');
        this._impersonating$.next(null);
      }
    } catch {
      sessionStorage.removeItem('impersonating');
      this._impersonating$.next(null);
    }
  }
}
