import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotificationsService, AppNotification } from './notifications.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.server.baseUrl}/notifications`;

  const mockNotifications: AppNotification[] = [
    { id: 1, userId: 10, type: 'info', title: 'Test 1', message: null, link: null, isRead: false, createdAt: '2025-01-01' },
    { id: 2, userId: 10, type: 'alert', title: 'Test 2', message: 'msg', link: '/link', isRead: true, createdAt: '2025-01-02' },
    { id: 3, userId: 10, type: 'info', title: 'Test 3', message: null, link: null, isRead: false, createdAt: '2025-01-03' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(NotificationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial empty notifications', (done) => {
    service.notifications.subscribe(n => {
      expect(n).toEqual([]);
      done();
    });
  });

  it('should have initial unread count of 0', (done) => {
    service.unreadCount.subscribe(c => {
      expect(c).toBe(0);
      done();
    });
  });

  it('loadNotifications should fetch and update notifications$', () => {
    service.loadNotifications(10);
    const req = httpMock.expectOne(`${baseUrl}?userId=10`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockNotifications });

    let result: AppNotification[] = [];
    service.notifications.subscribe(n => result = n);
    expect(result.length).toBe(3);
  });

  it('loadNotifications should update unread count', () => {
    service.loadNotifications(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: mockNotifications });

    let count = 0;
    service.unreadCount.subscribe(c => count = c);
    expect(count).toBe(2); // id 1 and 3 are unread
  });

  it('loadNotifications should handle empty data', () => {
    service.loadNotifications(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: null });

    let result: AppNotification[] = [];
    service.notifications.subscribe(n => result = n);
    expect(result).toEqual([]);
  });

  it('init should load notifications once, then rely on the socket', fakeAsync(() => {
    service.init(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: mockNotifications });

    // Real-time updates arrive over the socket, so no polling request follows.
    tick(60_000);
    httpMock.expectNone(`${baseUrl}?userId=10`);

    service.disconnect();
  }));

  it('disconnect should clear userId and issue no further requests', fakeAsync(() => {
    service.init(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: [] });

    service.disconnect();

    tick(60_000);
    httpMock.expectNone(`${baseUrl}?userId=10`);
  }));

  it('ngOnDestroy should call disconnect', fakeAsync(() => {
    service.init(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: [] });

    service.ngOnDestroy();

    tick(60_000);
    httpMock.expectNone(`${baseUrl}?userId=10`);
  }));

  it('markRead should PUT and update notification state', () => {
    // Load initial data
    service.loadNotifications(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: mockNotifications });

    service.markRead(1);
    const req = httpMock.expectOne(`${baseUrl}/1/read`);
    expect(req.request.method).toBe('PUT');
    req.flush({});

    let result: AppNotification[] = [];
    service.notifications.subscribe(n => result = n);
    expect(result.find(n => n.id === 1)!.isRead).toBeTrue();
  });

  it('markRead should update unread count', () => {
    service.loadNotifications(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: mockNotifications });

    service.markRead(1);
    httpMock.expectOne(`${baseUrl}/1/read`).flush({});

    let count = 0;
    service.unreadCount.subscribe(c => count = c);
    expect(count).toBe(1); // only id 3 unread now
  });

  it('markAllRead should PUT and mark all as read', () => {
    service.init(10);
    httpMock.expectOne(`${baseUrl}?userId=10`).flush({ data: mockNotifications });

    service.markAllRead();
    const req = httpMock.expectOne(`${baseUrl}/read-all?userId=10`);
    expect(req.request.method).toBe('PUT');
    req.flush({});

    let count = 0;
    service.unreadCount.subscribe(c => count = c);
    expect(count).toBe(0);

    service.disconnect();
  });

  it('markAllRead should no-op if userId is null', () => {
    service.markAllRead();
    httpMock.expectNone(`${baseUrl}/read-all`);
  });
});
