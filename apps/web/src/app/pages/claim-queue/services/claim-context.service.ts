import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ActiveClaimContext {
  id: string;
  patient: string;
}

export interface QueueEntry {
  id: string;
  patient: string;
}

export interface QueueState {
  rows: QueueEntry[];
}

@Injectable({ providedIn: 'root' })
export class ClaimContextService {
  private activeClaimSubject = new BehaviorSubject<ActiveClaimContext | null>(null);
  private queueStateSubject = new BehaviorSubject<QueueState | null>(null);

  readonly activeClaim$: Observable<ActiveClaimContext | null> =
    this.activeClaimSubject.asObservable();

  setActiveClaim(ctx: ActiveClaimContext): void {
    this.activeClaimSubject.next(ctx);
  }

  setQueueState(state: QueueState): void {
    this.queueStateSubject.next(state);
  }

  getQueueState(): QueueState | null {
    return this.queueStateSubject.value;
  }

  clear(): void {
    this.activeClaimSubject.next(null);
  }
}
