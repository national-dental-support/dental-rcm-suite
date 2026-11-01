import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UserStoreService } from '../stores/user-store.service';
import { InsightflowStore } from '../../store/insightflow/insightflow.store';
import { environment } from '../../../environments/environment';

export interface UserInfo {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  locationAssignments: any[];
}

/** Identity the server returns alongside a successful login. */
export interface SessionIdentity {
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  /** True while the seeded bootstrap password is still in place. */
  mustChangePassword?: boolean;
}

export interface LoginResult {
  token: string;
  identity: SessionIdentity;
}

/** sessionStorage key holding the bearer token for the current session. */
export const SESSION_TOKEN_KEY = 'drs_session_token';

/**
 * Keys the application reads for the current identity. They are written on
 * login and cleared on logout.
 */
const IDENTITY_KEYS = [
  'xUserEmail',
  'xUserOid',
  'myRCMAzureUserFirstName',
  'myRCMAzureUserLastName',
  'rcm_subscription_state',
  'impersonating',
  SESSION_TOKEN_KEY,
];

/**
 * Local credential authentication.
 *
 * The suite authenticates against its own user table. On success the server
 * returns a signed session token, which the HTTP interceptor sends as a bearer
 * token; the server derives the acting user from it. No identity-provider
 * library is involved.
 *
 * Single sign-on, when an operator configures it, is handled server-side - the
 * browser still only ever holds a session token issued by this API.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(
    private http: HttpClient,
    private router: Router,
    private userStore: UserStoreService,
    private insightflowStore: InsightflowStore,
  ) {}

  /** The bearer token for the current session, or null when signed out. */
  get sessionToken(): string | null {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? localStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  get isAuthenticated(): boolean {
    return !!this.sessionToken;
  }

  /** Exchange credentials for a session token. Throws on bad credentials. */
  async login(email: string, password: string): Promise<SessionIdentity> {
    const res = await firstValueFrom(
      this.http.post<LoginResult>(`${environment.server.baseUrl}/auth/login`, { email, password }),
    );
    this.storeSession(res);
    return res.identity;
  }

  /**
   * Replace the current password. The seeded bootstrap account cannot reach any
   * other route until this succeeds.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResult>(`${environment.server.baseUrl}/auth/change-password`, {
        currentPassword,
        newPassword,
      }),
    );
    // The server issues a fresh token so the must-change flag is cleared.
    if (res?.token) this.storeSession(res);
  }

  private storeSession(res: LoginResult): void {
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, res.token);
      sessionStorage.setItem('xUserEmail', res.identity.email);
      localStorage.setItem('xUserEmail', res.identity.email);
      if (res.identity.firstName) {
        localStorage.setItem('myRCMAzureUserFirstName', res.identity.firstName);
      }
      if (res.identity.lastName) {
        localStorage.setItem('myRCMAzureUserLastName', res.identity.lastName);
      }
    } catch {
      // Private browsing or blocked storage - the session simply will not persist
      // across a reload. Login still works for this page view.
    }
  }

  logout(): void {
    // Clear the Superset SSO cookie, which is HttpOnly and so must be cleared
    // by the server. Best effort - logging out locally must not depend on it.
    this.http.post(`${environment.server.baseUrl}/superset/logout`, {}).subscribe({
      error: err => {
        if (!environment.production) console.warn('Failed to clear superset_sso cookie:', err);
      },
    });

    this.clearLocalState();
    this.userStore.setUser(null);
    this.insightflowStore.clear();
    void this.router.navigate(['/signin']);
  }

  /** Alias kept for callers that previously triggered a provider redirect. */
  logoutRedirect(): void {
    this.logout();
  }

  private clearLocalState(): void {
    IDENTITY_KEYS.forEach(k => {
      try {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch {
        // Ignore unavailable storage.
      }
    });
  }
}
