import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ElementRef } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { Router } from '@angular/router';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationsService, AppNotification } from '../../../core/services/notifications.service';
import { UserStoreService } from '../../../core/stores/user-store.service';

describe('NotificationBellComponent', () => {
  let component: NotificationBellComponent;
  let fixture: ComponentFixture<NotificationBellComponent>;
  let mockNotifService: any;
  let mockRouter: any;
  let notificationsSubject: BehaviorSubject<AppNotification[]>;
  let unreadCountSubject: BehaviorSubject<number>;

  const sampleNotifications: AppNotification[] = [
    { id: 1, userId: 1, type: 'assignment', title: 'New claim assigned', message: 'Claim CL5001', link: '/app/claims/CL5001', isRead: false, createdAt: new Date().toISOString() },
    { id: 2, userId: 1, type: 'escalation', title: 'Escalation', message: null, link: null, isRead: true, createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, userId: 1, type: 'sla', title: 'SLA breach', message: 'Past due', link: '/app/claims/CL5002', isRead: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
  ];

  beforeEach(async () => {
    notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
    unreadCountSubject = new BehaviorSubject<number>(0);

    mockNotifService = {
      init: jasmine.createSpy('init'),
      notifications: notificationsSubject.asObservable(),
      unreadCount: unreadCountSubject.asObservable(),
      markRead: jasmine.createSpy('markRead'),
      markAllRead: jasmine.createSpy('markAllRead'),
    };

    mockRouter = {
      navigateByUrl: jasmine.createSpy('navigateByUrl'),
    };

    await TestBed.configureTestingModule({
      declarations: [NotificationBellComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: NotificationsService, useValue: mockNotifService },
        {
          provide: UserStoreService,
          useValue: {
            getUser: () => ({ userId: 1, email: 'test@test.com' }),
          },
        },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---
  it('should call notifService.init with userId on init', () => {
    expect(mockNotifService.init).toHaveBeenCalledWith(1);
  });

  it('should not call init when user is null', async () => {
    mockNotifService.init.calls.reset();

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [NotificationBellComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: NotificationsService, useValue: mockNotifService },
        { provide: UserStoreService, useValue: { getUser: () => null } },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    const f = TestBed.createComponent(NotificationBellComponent);
    f.detectChanges();
    expect(mockNotifService.init).not.toHaveBeenCalled();
  });

  it('should subscribe to notifications and update list', () => {
    notificationsSubject.next(sampleNotifications);
    expect(component.notifications).toEqual(sampleNotifications);
  });

  it('should subscribe to unreadCount and update count', () => {
    unreadCountSubject.next(5);
    expect(component.unreadCount).toBe(5);
  });

  // --- ngOnDestroy ---
  it('should unsubscribe on destroy', () => {
    const sub = (component as any).sub;
    spyOn(sub, 'unsubscribe').and.callThrough();
    component.ngOnDestroy();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  // --- toggle ---
  it('should toggle open state from false to true', () => {
    expect(component.open).toBeFalse();
    component.toggle();
    expect(component.open).toBeTrue();
  });

  it('should toggle open state from true to false', () => {
    component.open = true;
    component.toggle();
    expect(component.open).toBeFalse();
  });

  // --- close ---
  it('should set open to false', () => {
    component.open = true;
    component.close();
    expect(component.open).toBeFalse();
  });

  it('close should be idempotent when already closed', () => {
    component.open = false;
    component.close();
    expect(component.open).toBeFalse();
  });

  // --- markRead ---
  it('should call notifService.markRead for unread notification', () => {
    const notif = sampleNotifications[0]; // isRead: false
    component.markRead(notif);
    expect(mockNotifService.markRead).toHaveBeenCalledWith(1);
  });

  it('should NOT call notifService.markRead for already-read notification', () => {
    const notif = sampleNotifications[1]; // isRead: true
    component.markRead(notif);
    expect(mockNotifService.markRead).not.toHaveBeenCalled();
  });

  it('should navigate to link and close panel when notification has link', () => {
    const notif = sampleNotifications[0]; // link: '/app/claims/CL5001'
    component.open = true;
    component.markRead(notif);
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/claims/CL5001');
    expect(component.open).toBeFalse();
  });

  it('should not navigate when notification has no link', () => {
    const notif = sampleNotifications[1]; // link: null
    component.open = true;
    component.markRead(notif);
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    // Panel stays open because no navigation happened
    expect(component.open).toBeTrue();
  });

  // --- markAllRead ---
  it('should delegate to notifService.markAllRead', () => {
    component.markAllRead();
    expect(mockNotifService.markAllRead).toHaveBeenCalled();
  });

  // --- getIcon ---
  it('should return assignment_ind for assignment type', () => {
    expect(component.getIcon('assignment')).toBe('assignment_ind');
  });

  it('should return priority_high for escalation type', () => {
    expect(component.getIcon('escalation')).toBe('priority_high');
  });

  it('should return timer for sla type', () => {
    expect(component.getIcon('sla')).toBe('timer');
  });

  it('should return school for training type', () => {
    expect(component.getIcon('training')).toBe('school');
  });

  it('should return feedback for feedback type', () => {
    expect(component.getIcon('feedback')).toBe('feedback');
  });

  it('should return auto_fix_high for workflow type', () => {
    expect(component.getIcon('workflow')).toBe('auto_fix_high');
  });

  it('should return notifications for unknown type', () => {
    expect(component.getIcon('unknown')).toBe('notifications');
    expect(component.getIcon('')).toBe('notifications');
  });

  // --- timeAgo ---
  it('should return "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(component.timeAgo(now)).toBe('just now');
  });

  it('should return minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(component.timeAgo(fiveMinAgo)).toBe('5m ago');
  });

  it('should return hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(component.timeAgo(threeHoursAgo)).toBe('3h ago');
  });

  it('should return days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(component.timeAgo(twoDaysAgo)).toBe('2d ago');
  });

  it('should handle 59 minutes as minutes', () => {
    const fiftyNineMin = new Date(Date.now() - 59 * 60000).toISOString();
    expect(component.timeAgo(fiftyNineMin)).toBe('59m ago');
  });

  it('should handle exactly 60 minutes as 1h', () => {
    const sixtyMin = new Date(Date.now() - 60 * 60000).toISOString();
    expect(component.timeAgo(sixtyMin)).toBe('1h ago');
  });

  it('should handle 23 hours as hours', () => {
    const twentyThreeH = new Date(Date.now() - 23 * 3600000).toISOString();
    expect(component.timeAgo(twentyThreeH)).toBe('23h ago');
  });

  it('should handle exactly 24 hours as 1d', () => {
    const twentyFourH = new Date(Date.now() - 24 * 3600000).toISOString();
    expect(component.timeAgo(twentyFourH)).toBe('1d ago');
  });

  // --- onDocumentClick (HostListener) ---
  it('should close panel when clicking outside the component', () => {
    component.open = true;
    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: outsideElement });
    component.onDocumentClick(event);
    expect(component.open).toBeFalse();
    document.body.removeChild(outsideElement);
  });

  it('should NOT close panel when clicking inside the component', () => {
    component.open = true;
    const nativeEl = fixture.nativeElement;
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: nativeEl });
    component.onDocumentClick(event);
    expect(component.open).toBeTrue();
  });

  it('should not close panel if already closed when clicking outside', () => {
    component.open = false;
    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: outsideElement });
    component.onDocumentClick(event);
    expect(component.open).toBeFalse();
    document.body.removeChild(outsideElement);
  });
});
