import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Enterprise {
  id: number;
  name: string;
  slug: string;
}

const STORAGE_KEY = 'rcm_active_enterprise';

@Injectable({ providedIn: 'root' })
export class EnterpriseService {
  private _active$ = new BehaviorSubject<Enterprise | null>(this.loadFromStorage());
  active$ = this._active$.asObservable();

  private _enterprises$ = new BehaviorSubject<Enterprise[]>([]);
  enterprises$ = this._enterprises$.asObservable();

  constructor(private http: HttpClient) {}

  get activeEnterprise(): Enterprise | null {
    return this._active$.value;
  }

  get activeEnterpriseId(): number | null {
    return this._active$.value?.id ?? null;
  }

  /** Load the enterprise list from the backend (Super Admin only) */
  loadEnterprises(): void {
    console.log('[EnterpriseService] loadEnterprises() called');
    this.http.get<{ data: any[] }>(`${environment.server.baseUrl}/superadmin/org`)
      .subscribe({
        next: (res) => {
          const ents = (res.data || []).map((e: any) => ({
            id: e.id,
            name: e.name,
            slug: e.slug || '',
          }));
          console.log('[EnterpriseService] enterprises loaded:', ents.map(e => e.name));
          this._enterprises$.next(ents);

          // Validate cached selection still exists; clear stale ids from old data
          const current = this._active$.value;
          const stillValid = current && ents.some(e => e.id === current.id);
          if (!stillValid && ents.length > 0) {
            this.setActive(ents[0]);
          }
        },
        error: (err) => { console.error('[EnterpriseService] loadEnterprises failed:', err?.status, err?.message); },
      });
  }

  setActive(ent: Enterprise): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ent));
    this._active$.next(ent);
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._active$.next(null);
  }

  private loadFromStorage(): Enterprise | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const ent = JSON.parse(stored);
        console.log('[EnterpriseService] loaded from storage:', ent);
        return ent;
      }
    } catch { /* ignore */ }
    return null;
  }
}
