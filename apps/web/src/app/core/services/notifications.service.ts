import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { io, Socket } from 'socket.io-client';

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService implements OnDestroy {
  private baseUrl = `${environment.server.baseUrl}/notifications`;
  private socket: Socket | null = null;
  private userId: number | null = null;

  private notifications$ = new BehaviorSubject<AppNotification[]>([]);
  private unreadCount$ = new BehaviorSubject<number>(0);

  readonly notifications = this.notifications$.asObservable();
  readonly unreadCount = this.unreadCount$.asObservable();

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  /** Initialize - call after login with the user's ID */
  init(userId: number): void {
    this.userId = userId;

    // Load existing notifications immediately on init
    this.loadNotifications(userId);

    // Connect socket.io for real-time push - eliminates 60s polling latency
    this.ngZone.runOutsideAngular(() => {
      // The socket is authenticated by the session cookie and the server's own
      // handshake check; no browser-held key is involved.
      const apiKey = '';
      this.socket = io(environment.server.baseUrl, {
        path: '/ws',
        query: { userId: String(userId) },
        auth: { apiKey },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: 10,
      });

      this.socket.on('notification', (notification: AppNotification) => {
        this.ngZone.run(() => {
          const current = this.notifications$.value;
          // Prepend new notification; avoid duplicates
          if (!current.some(n => n.id === notification.id)) {
            const updated = [notification, ...current];
            this.notifications$.next(updated);
            this.unreadCount$.next(updated.filter(n => !n.isRead).length);
          }
        });
      });

      this.socket.on('connect_error', (err: Error) => {
        // Non-fatal - notifications will still load on demand via markRead/markAllRead
        console.warn('[Notifications] WebSocket connection error:', err.message);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.userId = null;
    this.notifications$.next([]);
    this.unreadCount$.next(0);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  loadNotifications(userId: number): void {
    this.http.get<{ data: AppNotification[] }>(`${this.baseUrl}?userId=${userId}`)
      .pipe(map(res => res.data || []))
      .subscribe({
        next: (list) => {
          this.notifications$.next(list);
          this.unreadCount$.next(list.filter(n => !n.isRead).length);
        },
      });
  }

  markRead(id: number): void {
    this.http.put(`${this.baseUrl}/${id}/read`, {}).subscribe({
      next: () => {
        const current = this.notifications$.value.map(n =>
          n.id === id ? { ...n, isRead: true } : n
        );
        this.notifications$.next(current);
        this.unreadCount$.next(current.filter(n => !n.isRead).length);
      },
    });
  }

  markAllRead(): void {
    if (!this.userId) return;
    this.http.put(`${this.baseUrl}/read-all?userId=${this.userId}`, {}).subscribe({
      next: () => {
        const current = this.notifications$.value.map(n => ({ ...n, isRead: true }));
        this.notifications$.next(current);
        this.unreadCount$.next(0);
      },
    });
  }
}
