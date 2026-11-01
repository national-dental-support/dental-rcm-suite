import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Subject, of } from 'rxjs';
import { AppComponent } from './app';
import { Router, NavigationEnd } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AnalyticsService } from './core/services/analytics.service';
import { SubscriptionService } from './core/services/subscription.service';
import { IdleTimeoutService } from './core/services/idle-timeout.service';
import { SocketService } from './core/services/socket.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';
import { UserStoreService } from './core/stores/user-store.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let routerEvents$: Subject<any>;
  let analyticsSpy: any;
  let idleTimeoutSpy: any;
  let socketSpy: any;
  let shortcutsSpy: any;
  let shortcutsAction$: Subject<string>;
  let dialogSpy: any;
  let routerSpy: any;
  let userStoreSpy: any;
  let subscriptionSpy: any;

  beforeEach(async () => {
    routerEvents$ = new Subject();
    shortcutsAction$ = new Subject<string>();

    routerSpy = { events: routerEvents$.asObservable(), navigate: jasmine.createSpy('navigate') };
    analyticsSpy = { track: jasmine.createSpy('track'), startTracking: jasmine.createSpy('startTracking') };
    subscriptionSpy = { load: jasmine.createSpy('load') };
    idleTimeoutSpy = { start: jasmine.createSpy('start') };
    socketSpy = { connect: jasmine.createSpy('connect') };
    shortcutsSpy = { start: jasmine.createSpy('start'), stop: jasmine.createSpy('stop'), onAction$: shortcutsAction$.asObservable() };
    userStoreSpy = { getUser: jasmine.createSpy('getUser').and.returnValue(null) };
    dialogSpy = { open: jasmine.createSpy('open'), openDialogs: [] };

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AnalyticsService, useValue: analyticsSpy },
        { provide: SubscriptionService, useValue: subscriptionSpy },
        { provide: IdleTimeoutService, useValue: idleTimeoutSpy },
        { provide: SocketService, useValue: socketSpy },
        { provide: KeyboardShortcutsService, useValue: shortcutsSpy },
        { provide: UserStoreService, useValue: userStoreSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem('xUserEmail');
    localStorage.removeItem('myRCMAzureUserFirstName');
    localStorage.removeItem('myRCMAzureUserLastName');
  });

  it('should create the app', () => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should track page_view on NavigationEnd', () => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    routerEvents$.next(new NavigationEnd(1, '/app/home', '/app/home'));
    expect(analyticsSpy.track).toHaveBeenCalledWith('page_view', { url: '/app/home' });
  });

  it('should track page_exit when navigating away from a page', () => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    routerEvents$.next(new NavigationEnd(1, '/app/home', '/app/home'));
    analyticsSpy.track.calls.reset();
    routerEvents$.next(new NavigationEnd(2, '/app/denial-iq', '/app/denial-iq'));
    expect(analyticsSpy.track).toHaveBeenCalledWith('page_exit', jasmine.objectContaining({ url: '/app/home' }));
  });

  it('ngOnInit with no email should not load subscriptions', () => {
    localStorage.removeItem('xUserEmail');
    sessionStorage.removeItem('xUserEmail');
    subscriptionSpy.load.calls.reset();
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(subscriptionSpy.load).not.toHaveBeenCalled();
  });

  it('ngOnInit with email should start idle timeout and shortcuts', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(idleTimeoutSpy.start).toHaveBeenCalled();
    expect(shortcutsSpy.start).toHaveBeenCalled();
    expect(subscriptionSpy.load).toHaveBeenCalled();
  });

  it('ngOnInit with email and user should connect socket', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    userStoreSpy.getUser.and.returnValue({ userId: 1 });
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(socketSpy.connect).toHaveBeenCalled();
  });

  it('ngOnInit with email but no user should not connect socket', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    userStoreSpy.getUser.and.returnValue(null);
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(socketSpy.connect).not.toHaveBeenCalled();
  });

  it('keyboard shortcut command-palette opens dialog', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    shortcutsAction$.next('command-palette');
    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('command-palette does not open when dialog already open', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    dialogSpy.openDialogs = [{}]; // simulate open dialog
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    shortcutsAction$.next('command-palette');
    expect(dialogSpy.open).not.toHaveBeenCalled();
  });

  it('keyboard shortcut go-home navigates to /app/home', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    shortcutsAction$.next('go-home');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/home']);
  });

  it('keyboard shortcut go-queue navigates to claim queue', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    shortcutsAction$.next('go-queue');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/denial-iq/claim-queue/ar-specialist']);
  });

  it('ngOnDestroy stops shortcuts', () => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    component.ngOnDestroy();
    expect(shortcutsSpy.stop).toHaveBeenCalled();
  });
});
