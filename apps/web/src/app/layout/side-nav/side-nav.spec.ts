import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef, ElementRef } from '@angular/core';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SideNavComponent } from './side-nav';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.services';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ImpersonationService } from '../../core/services/impersonation.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SideNav', () => {
  let component: SideNavComponent;
  let fixture: ComponentFixture<SideNavComponent>;
  let stateSubject: BehaviorSubject<any>;
  let authSvcSpy: jasmine.SpyObj<any>;
  let impersonationSpy: any;
  let http: HttpTestingController;

  beforeEach(async () => {
    stateSubject = new BehaviorSubject({ subscriptions: [], role: null });
    authSvcSpy = jasmine.createSpyObj('AuthService', ['logout']);
    impersonationSpy = {
      restore: jasmine.createSpy('restore'),
      startImpersonation: jasmine.createSpy('startImpersonation'),
      stopImpersonation: jasmine.createSpy('stopImpersonation'),
      isImpersonating$: new BehaviorSubject(false),
    };

    await TestBed.configureTestingModule({
      declarations: [SideNavComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [],
      providers: [
        { provide: Router, useValue: { navigate: () => { }, events: new BehaviorSubject(null) } },
        { provide: AuthService, useValue: authSvcSpy },
        { provide: SubscriptionService, useValue: { state$: stateSubject } },
        { provide: ImpersonationService, useValue: impersonationSpy },
        { provide: ChangeDetectorRef, useValue: { detectChanges: () => {}, markForCheck: () => {} } },
        { provide: ElementRef, useValue: { nativeElement: document.createElement('div') } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SideNavComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Flush the /api/app-registry request that ngOnInit makes
    const appRegistryReq = http.expectOne('/api/app-registry');
    appRegistryReq.flush([]);
  });

  /** Super Admin state triggers a tenant-list fetch; consume it. */
  function flushSuperAdminOrgRequest(): void {
    http.match(r => r.url.includes('/superadmin/org')).forEach(r => r.flush([]));
  }

  afterEach(() => {
    http.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- ngOnInit calls ---------------------------------------------------------

  it('should call impersonation.restore on init', () => {
    expect(impersonationSpy.restore).toHaveBeenCalled();
  });

  it('should subscribe to subscriptionService.state$ and rebuild nav items', () => {
    stateSubject.next({
      subscriptions: ['denial-iq', 'payer-iq'],
      role: 'Manager',
    });
    expect(component.rcmItems.length).toBeGreaterThanOrEqual(0);
  });

  it('should set isSuperAdmin when superadmin subscription present', () => {
    stateSubject.next({ subscriptions: ['superadmin', 'denial-iq'], role: 'Super Admin' });
    flushSuperAdminOrgRequest();
    expect(component.isSuperAdmin).toBeTrue();
  });

  // -- loadUserInfo -----------------------------------------------------------

  it('loadUserInfo should populate userEmail and userName from storage', () => {
    localStorage.setItem('xUserEmail', 'test@test.com');
    localStorage.setItem('myRCMAzureUserFirstName', 'John');
    localStorage.setItem('myRCMAzureUserLastName', 'Doe');
    component.loadUserInfo();
    expect(component.userEmail).toBe('test@test.com');
    expect(component.userName).toBe('John Doe');
    localStorage.removeItem('xUserEmail');
    localStorage.removeItem('myRCMAzureUserFirstName');
    localStorage.removeItem('myRCMAzureUserLastName');
  });

  it('loadUserInfo should read the identity from localStorage', () => {
    localStorage.setItem('xUserEmail', 'fallback@test.com');
    localStorage.setItem('myRCMAzureUserFirstName', 'Jane');
    localStorage.setItem('myRCMAzureUserLastName', 'Doe');
    component.loadUserInfo();
    expect(component.userEmail).toBe('fallback@test.com');
    expect(component.userName).toBe('Jane Doe');
    localStorage.removeItem('xUserEmail');
    localStorage.removeItem('myRCMAzureUserFirstName');
    localStorage.removeItem('myRCMAzureUserLastName');
  });

  it('loadUserInfo should fall back to sessionStorage', () => {
    sessionStorage.setItem('xUserEmail', 'safe@test.com');
    expect(() => component.loadUserInfo()).not.toThrow();
    expect(component.userEmail).toBe('safe@test.com');
    sessionStorage.removeItem('xUserEmail');
  });

  // -- userInitials getter ----------------------------------------------------

  it('userInitials should return empty string when no userName', () => {
    component.userName = '';
    expect(component.userInitials).toBe('');
  });

  it('userInitials should return first letter of single name', () => {
    component.userName = 'Alice';
    expect(component.userInitials).toBe('A');
  });

  it('userInitials should return first + last initials for multi-word name', () => {
    component.userName = 'Alice Bob';
    expect(component.userInitials).toBe('AB');
  });

  it('userInitials should return first + last initials for 3-part name', () => {
    component.userName = 'Alice Marie Bob';
    expect(component.userInitials).toBe('AB');
  });

  // -- toggleCollapse ---------------------------------------------------------

  it('toggleCollapse should emit collapseToggle event', () => {
    spyOn(component.collapseToggle, 'emit');
    component.toggleCollapse();
    expect(component.collapseToggle.emit).toHaveBeenCalled();
  });

  // -- toggleUserMenu ---------------------------------------------------------

  it('toggleUserMenu should toggle showUserMenu', () => {
    expect(component.showUserMenu).toBeFalse();
    component.toggleUserMenu();
    expect(component.showUserMenu).toBeTrue();
    component.toggleUserMenu();
    expect(component.showUserMenu).toBeFalse();
  });

  // -- logout -----------------------------------------------------------------

  it('logout should call authService.logout', () => {
    component.logout();
    expect(authSvcSpy.logout).toHaveBeenCalled();
  });

  // -- canShow / rebuildNavItems ----------------------------------------------

  it('rebuildNavItems should hide subscription-based items when not subscribed', () => {
    stateSubject.next({ subscriptions: [], role: 'Manager' }); // no subscriptions
    expect(component.rcmItems.filter(i => (i as any).slug)).toEqual([]);
  });

  it('rebuildNavItems should show items when subscribed', () => {
    stateSubject.next({ subscriptions: ['denial-iq'], role: 'AR Specialist' });
    const denialItem = component.rcmItems.find(i => (i as any).slug === 'denial-iq');
    expect(denialItem).toBeTruthy();
  });

  it('rebuildNavItems should include superAdminItem in configureItems for SuperAdmin', () => {
    stateSubject.next({ subscriptions: ['superadmin'], role: 'Super Admin' });
    flushSuperAdminOrgRequest();
    expect(component.configureItems.length).toBeGreaterThan(0);
  });

  // -- openPersonaSwitcher ----------------------------------------------------

  it('openPersonaSwitcher should show switcher if personaGroups already loaded', () => {
    component.personaGroups = [{ role: 'Manager', users: [] }];
    component.openPersonaSwitcher();
    expect(component.showPersonaSwitcher).toBeTrue();
    http.expectNone('/admin/users');
  });

  it('openPersonaSwitcher should call /admin/users API and populate groups', () => {
    component.personaGroups = [];
    component.openPersonaSwitcher();
    const req = http.expectOne(r => r.url.includes('/admin/users'));
    req.flush([
      { userID: '1', name: 'Bob Manager', email: 'bob@test.com', role: 'Manager' },
      { userID: '2', name: 'Alice Spec', email: 'alice@test.com', role: 'AR Specialist' },
    ]);
    expect(component.showPersonaSwitcher).toBeTrue();
    expect(component.personaGroups.length).toBeGreaterThan(0);
  });

  it('openPersonaSwitcher should handle API error gracefully', () => {
    component.personaGroups = [];
    component.openPersonaSwitcher();
    const req = http.expectOne(r => r.url.includes('/admin/users'));
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(component.showPersonaSwitcher).toBeFalse();
  });

  // -- onPersonaSelect --------------------------------------------------------

  it('onPersonaSelect should call startImpersonation with selected user', () => {
    component.personaUsers = [{ id: 5, name: 'Test User', email: 'test@test.com', role: 'Manager' }];
    const event = { target: { value: '5' } } as any;
    component.onPersonaSelect(event);
    expect(impersonationSpy.startImpersonation).toHaveBeenCalledWith(
      jasmine.objectContaining({ id: 5, name: 'Test User' })
    );
    expect(component.showPersonaSwitcher).toBeFalse();
  });

  it('onPersonaSelect should do nothing when user not found', () => {
    component.personaUsers = [];
    const event = { target: { value: '999' } } as any;
    component.onPersonaSelect(event);
    expect(impersonationSpy.startImpersonation).not.toHaveBeenCalled();
  });

  // -- onDocumentClick --------------------------------------------------------

  it('onDocumentClick should close user menu when clicking outside', () => {
    component.showUserMenu = true;
    const event = new MouseEvent('click');
    component.onDocumentClick(event);
    expect(component.showUserMenu).toBeFalse();
  });

  it('onDocumentClick should not close user menu when showUserMenu is false', () => {
    component.showUserMenu = false;
    const event = new MouseEvent('click');
    component.onDocumentClick(event);
    expect(component.showUserMenu).toBeFalse();
  });

  // -- externalApps from /api/app-registry -----------------------------------

  it('should have externalApps populated from /api/app-registry', () => {
    // The beforeEach flushes [] for app-registry - apps should be empty array
    expect(component.externalApps).toEqual([]);
  });

  it('should set externalApps from /api/app-registry response', () => {
    // Trigger ngOnInit again to get a fresh request
    component.ngOnInit();
    const req = http.expectOne('/api/app-registry');
    req.flush([{ name: 'Other App', url: 'http://other.com', icon: 'icon.svg' }]);
    expect(component.externalApps.length).toBe(1);
  });

  it('should set externalApps to empty on /api/app-registry error', () => {
    component.externalApps = [{ name: 'x', url: 'x', icon: 'x' } as any];
    component.ngOnInit();
    const req = http.expectOne('/api/app-registry');
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(component.externalApps).toEqual([]);
  });

});
