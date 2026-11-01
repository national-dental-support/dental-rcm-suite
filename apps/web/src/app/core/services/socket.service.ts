import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { UserStoreService } from '../stores/user-store.service';

export interface ClaimUpdateEvent {
  type: 'closed' | 'escalated' | 'assigned' | 'bulk-assigned' | 'bulk-escalated' | 'bulk-closed' | 'bulk-reassigned';
  claimId?: string;
  userId?: number;
  assignedTo?: number;
  fromUserId?: number;
  toUserId?: number;
  status?: string;
  count?: number;
}

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private connected$ = new BehaviorSubject<boolean>(false);
  private claimUpdated$ = new Subject<ClaimUpdateEvent>();
  private notification$ = new Subject<any>();
  private eraComplete$ = new Subject<{ logId: number; status: string; claimsFound: number; claimsMatched: number }>();

  constructor(private userStore: UserStoreService) {}

  connect(): void {
    if (this.socket?.connected) return;
    if (this.socket && !this.socket.disconnected) return;

    const user = this.userStore.getUser();
    const userId = user?.userId;

    if (!userId) {
      console.warn('[SocketService] connect skipped - no userId yet');
      return;
    }

    const socketUrl = environment.server.socketUrl;

    console.log('[SocketService] connecting', {
      socketUrl,
      userId,
      path: '/ws',
    });

    this.socket = io(socketUrl, {
      path: '/ws',
      query: { userId: String(userId) },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] connected', this.socket?.id);
      this.connected$.next(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[SocketService] disconnected', reason);
      this.connected$.next(false);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[SocketService] connect_error', err);
      this.connected$.next(false);
    });

    this.socket.on('claim:updated', (data: ClaimUpdateEvent) => {
      this.claimUpdated$.next(data);
    });

    this.socket.on('notification', (data: any) => {
      this.notification$.next(data);
    });

    this.socket.on('era:processing-complete', (data: any) => {
      this.eraComplete$.next(data);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected$.next(false);
  }

  get isConnected$(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  onClaimUpdated(): Observable<ClaimUpdateEvent> {
    return this.claimUpdated$.asObservable();
  }

  onNotification(): Observable<any> {
    return this.notification$.asObservable();
  }

  onEraProcessingComplete(): Observable<{ logId: number; status: string; claimsFound: number; claimsMatched: number }> {
    return this.eraComplete$.asObservable();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}