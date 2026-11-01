import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NotificationsService, AppNotification } from '../../../core/services/notifications.service';
import { UserStoreService } from '../../../core/stores/user-store.service';

@Component({
    selector: 'rp-notification-bell',
    templateUrl: './notification-bell.component.html',
    styleUrls: ['./notification-bell.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  unreadCount = 0;
  open = false;

  private sub = new Subscription();

  constructor(
    private notifService: NotificationsService,
    private userStore: UserStoreService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.elRef.nativeElement.contains(event.target)) {
      this.open = false;
      this.cdr.markForCheck();
    }
  }

  ngOnInit(): void {
    const user = this.userStore.getUser();
    if (user?.userId) {
      this.notifService.init(Number(user.userId));
    }

    this.sub.add(
      this.notifService.notifications.subscribe(list => {
        this.notifications = list;
        this.cdr.markForCheck();
      })
    );

    this.sub.add(
      this.notifService.unreadCount.subscribe(count => {
        this.unreadCount = count;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  toggle(): void {
    this.open = !this.open;
  }

  close(): void {
    this.open = false;
  }

  markRead(n: AppNotification): void {
    if (!n.isRead) {
      this.notifService.markRead(n.id);
    }
    if (n.link) {
      this.router.navigateByUrl(n.link);
      this.close();
    }
  }

  markAllRead(): void {
    this.notifService.markAllRead();
  }

  getIcon(type: string): string {
    const icons: Record<string, string> = {
      assignment: 'assignment_ind',
      escalation: 'priority_high',
      sla: 'timer',
      training: 'school',
      feedback: 'feedback',
      workflow: 'auto_fix_high',
    };
    return icons[type] || 'notifications';
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
