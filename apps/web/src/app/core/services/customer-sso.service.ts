import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SSOConfig {
  id: number;
  customerId: number;
  customerName?: string;
  providerType: 'saml' | 'oidc' | 'azure-ad';
  displayName: string;
  domain: string;
  clientId?: string;
  metadataUrl?: string;
  issuer?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  certificate?: string;
  attributeMapping?: Record<string, string>;
  isActive: boolean;
  autoProvisionUsers: boolean;
  defaultRole: string;
  enforceSso: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SSOTestResult {
  success: boolean;
  providerType: string;
  displayName: string;
  checks: { check: string; status: string; detail?: string }[];
}

export interface SSOLookupResult {
  hasSso: boolean;
  enforceSso?: boolean;
  provider?: {
    type: string;
    displayName: string;
    authorizationUrl?: string;
    clientId?: string;
    metadataUrl?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class CustomerSSOService {
  private base = `${environment.server.baseUrl}/api/admin/sso`;

  constructor(private http: HttpClient) {}

  listConfigs(): Observable<SSOConfig[]> {
    return this.http.get<SSOConfig[]>(`${this.base}/configs`);
  }

  getConfig(id: number): Observable<SSOConfig> {
    return this.http.get<SSOConfig>(`${this.base}/configs/${id}`);
  }

  createConfig(data: Partial<SSOConfig> & { clientSecret?: string }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/configs`, data);
  }

  updateConfig(id: number, data: Partial<SSOConfig> & { clientSecret?: string }): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.base}/configs/${id}`, data);
  }

  deleteConfig(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/configs/${id}`);
  }

  lookupByDomain(domain: string): Observable<SSOLookupResult> {
    return this.http.get<SSOLookupResult>(`${this.base}/lookup`, { params: { domain } });
  }

  testConfig(id: number): Observable<SSOTestResult> {
    return this.http.post<SSOTestResult>(`${this.base}/test/${id}`, {});
  }
}
