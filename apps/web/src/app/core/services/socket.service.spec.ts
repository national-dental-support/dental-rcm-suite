import { TestBed } from '@angular/core/testing';
import { SocketService } from './socket.service';
import { UserStoreService } from '../stores/user-store.service';
import { UserState } from './user.service';

describe('SocketService', () => {
  let service: SocketService;
  let userStoreSpy: jasmine.SpyObj<UserStoreService>;

  beforeEach(() => {
    userStoreSpy = jasmine.createSpyObj<UserStoreService>('UserStoreService', ['getUser', 'setUser']);

    TestBed.configureTestingModule({
      providers: [
        SocketService,
        { provide: UserStoreService, useValue: userStoreSpy },
      ],
    });
    service = TestBed.inject(SocketService);
  });

  afterEach(() => {
    service.disconnect();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('connect() should not connect when userId is missing', () => {
    userStoreSpy.getUser.and.returnValue(null);
    service.connect();
    expect(service['socket']).toBeNull();
  });

  it('disconnect() should null out socket and emit false', () => {
    let connected: boolean | undefined;
    service.isConnected$.subscribe(v => (connected = v));
    service.disconnect();
    expect(service['socket']).toBeNull();
    expect(connected).toBeFalse();
  });

  it('isConnected$ should be observable', () => {
    let emitted = false;
    service.isConnected$.subscribe(() => (emitted = true));
    expect(emitted).toBeTrue();
  });

  it('onClaimUpdated() should return observable', () => {
    const obs = service.onClaimUpdated();
    expect(obs).toBeDefined();
  });

  it('onNotification() should return observable', () => {
    const obs = service.onNotification();
    expect(obs).toBeDefined();
  });

  it('ngOnDestroy() should call disconnect', () => {
    const spy = spyOn(service, 'disconnect');
    service.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });
});
