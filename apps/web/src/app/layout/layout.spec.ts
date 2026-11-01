import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { LayoutComponent } from './layout';
import { AnalyticsService } from '../core/services/analytics.service';
import { IdleTimeoutService } from '../core/services/idle-timeout.service';
import { AuthStore } from '../store/global/auth.store';
import { RefDataStore } from '../store/global/ref-data.store';
import { SocketService } from '../core/services/socket.service';
import { UserStoreService } from '../core/stores/user-store.service';
import { SubscriptionService } from '../core/services/subscription.service';
import { ImpersonationService } from '../core/services/impersonation.service';
import { BehaviorSubject } from 'rxjs';

describe('Layout', () => {
  let component: LayoutComponent;
  let fixture: ComponentFixture<LayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LayoutComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AnalyticsService, useValue: { startTracking: () => {} } },
        { provide: IdleTimeoutService, useValue: { start: () => {} } },
        { provide: AuthStore, useValue: { init: () => {} } },
        { provide: RefDataStore, useValue: { load: () => {} } },
        { provide: SocketService, useValue: { connect: () => {} } },
        { provide: UserStoreService, useValue: { getUser: () => null } },
        { provide: SubscriptionService, useValue: { isSuperAdmin$: of(false) } },
        { provide: ImpersonationService, useValue: { restore: () => {}, startImpersonation: () => {}, stopImpersonation: () => {}, isImpersonating$: new BehaviorSubject(false) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('toggleSidebar should flip sidebarOpen', () => {
    component.sidebarOpen = false;
    component.toggleSidebar();
    expect(component.sidebarOpen).toBeTrue();
  });

  it('closeSidebar should close sidebar', () => {
    component.sidebarOpen = true;
    component.closeSidebar();
    expect(component.sidebarOpen).toBeFalse();
  });
});

describe('Layout \u2014 with authenticated user', () => {
  it('should call socketService.connect() when user has userId (if arm0)', async () => {
    const socketSpy = jasmine.createSpyObj('SocketService', ['connect']);
    await TestBed.configureTestingModule({
      declarations: [LayoutComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AnalyticsService, useValue: { startTracking: () => {} } },
        { provide: IdleTimeoutService, useValue: { start: () => {} } },
        { provide: AuthStore, useValue: { init: () => {} } },
        { provide: RefDataStore, useValue: { load: () => {} } },
        { provide: SocketService, useValue: socketSpy },
        { provide: UserStoreService, useValue: { getUser: () => ({ userId: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', locationAssignments: [] }) } },
        { provide: SubscriptionService, useValue: { isSuperAdmin$: of(false) } },
        { provide: ImpersonationService, useValue: { restore: () => {}, isImpersonating$: new BehaviorSubject(false) } },
      ],
    }).compileComponents();
    const fixture2 = TestBed.createComponent(LayoutComponent);
    fixture2.detectChanges();
    expect(socketSpy.connect).toHaveBeenCalled();
  });
});
