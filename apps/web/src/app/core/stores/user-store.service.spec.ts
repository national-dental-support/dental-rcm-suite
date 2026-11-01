import { TestBed } from '@angular/core/testing';
import { UserStoreService } from './user-store.service';
import { UserState } from '../services/user.service';

const MOCK_USER: UserState = {
  userId: 'user-123',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  locationAssignments: [],
};

describe('UserStoreService', () => {
  let store: UserStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UserStoreService],
    });
    store = TestBed.inject(UserStoreService);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('user$ should start as null', () => {
    let user: UserState | null | undefined;
    store.user$.subscribe(u => (user = u));
    expect(user).toBeNull();
  });

  it('setUser() should update user$', () => {
    let emitted: UserState | null | undefined;
    store.user$.subscribe(u => (emitted = u));

    store.setUser(MOCK_USER);

    expect(emitted).toEqual(MOCK_USER);
  });

  it('getUser() should return the current user synchronously', () => {
    store.setUser(MOCK_USER);
    const result = store.getUser();
    expect(result).toEqual(MOCK_USER);
  });

  it('getUser() should return null before setUser() is called', () => {
    expect(store.getUser()).toBeNull();
  });

  it('setUser(null) should clear the user', () => {
    store.setUser(MOCK_USER);
    store.setUser(null);
    expect(store.getUser()).toBeNull();
  });

  it('user$ should emit each value set via setUser()', () => {
    const emissions: (UserState | null)[] = [];
    store.user$.subscribe(u => emissions.push(u));

    store.setUser(MOCK_USER);
    store.setUser(null);

    expect(emissions).toEqual([null, MOCK_USER, null]);
  });

  it('userId should return null when no user is set (binary-expr arm0 \u2014 nullish fallback)', () => {
    // No user set - data is null, so data?.userId is undefined -> ?? null
    expect(store.userId).toBeNull();
  });

  it('userId should return the user ID when user is set (binary-expr arm1 \u2014 truthy value)', () => {
    // User is set - data?.userId = 'user-123' (truthy) -> returns userId
    store.setUser(MOCK_USER);
    expect(store.userId).toBe('user-123');
  });
});
