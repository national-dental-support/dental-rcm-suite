import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

export interface OdUser { UserNum: number; UserName: string; IsHidden?: boolean; }
export interface OdUserGroup { UserGroupNum: number; Description: string; }
export interface OdSecurityPerm { Permission: number | string; Description: string; }
export interface OdClinic {
  ClinicNum: number; Abbr: string; Description: string;
  Phone?: string; Address?: string; City?: string; State?: string; Zip?: string;
}

@Injectable({ providedIn: 'root' })
export class OdAdminService {
  private base = `${environment.server.baseUrl}/od`;
  // If you already have a tenant context, inject it; for now use 'tenantA' or route param
  private tenant = 'tenantA';

  constructor(private http: HttpClient) {}

  users(): Observable<OdUser[]> {
    return this.http.get<OdUser[]>(`${this.base}/${this.tenant}/users`);
  }
  userGroups(): Observable<OdUserGroup[]> {
    return this.http.get<OdUserGroup[]>(`${this.base}/${this.tenant}/usergroups`);
  }
  securityPerms(): Observable<OdSecurityPerm[]> {
    return this.http.get<OdSecurityPerm[]>(`${this.base}/${this.tenant}/security-perms`);
  }
  clinics(): Observable<OdClinic[]> {
    return this.http.get<OdClinic[]>(`${this.base}/${this.tenant}/clinics`);
  }
  updateClinic(id: number, payload: Partial<OdClinic>): Observable<OdClinic> {
    return this.http.put<OdClinic>(`${this.base}/${this.tenant}/clinics/${id}`, payload);
  }
}
