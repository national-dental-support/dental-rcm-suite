// src/app/core/services/denial-iq-context.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type DenialIqRole = 'manager' | 'ar-specialist';

@Injectable({ providedIn: 'root' })
export class DenialIqContextService {
  private roleSubject = new BehaviorSubject<DenialIqRole>('ar-specialist');

  /** Observable for components that want to react to role changes */
  role$ = this.roleSubject.asObservable();

  /** Sync getter - useful for nav clicks */
  get currentRole(): DenialIqRole {
    return this.roleSubject.value;
  }

  /** Called by Dashboard / Claim Queue to declare the active context */
  setRole(role: DenialIqRole): void {
    this.roleSubject.next(role);
  }
}
