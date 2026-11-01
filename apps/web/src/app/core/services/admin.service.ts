// src/app/pages/admin/services/admin.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { UserDto, UserCreateDto, UserUpdateDto } from '../models/user.models';

export interface UserProduct {
  id: number;
  slug: string;
  name: string;
  assigned: boolean;
}

export interface UserScope {
  locations: string[];
  providers: string[];
  payers: string[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private base = `${environment.server.baseUrl}/admin/users`;

  constructor(private http: HttpClient) {}

  list(status: 'active' | 'archived' | 'all' = 'active'): Observable<UserDto[]> {
    return this.http.get<UserDto[]>(this.base, { params: { status } });
  }
  get(id: string): Observable<UserDto> {
    return this.http.get<UserDto>(`${this.base}/${id}`);
  }
  create(payload: UserCreateDto): Observable<{ message: string; id: number | null }> {
    return this.http.post<{ message: string; id: number | null }>(this.base, payload);
  }
  update(id: string, payload: UserUpdateDto): Observable<UserDto> {
    return this.http.put<UserDto>(`${this.base}/${id}`, payload);
  }
  archive(id: string): Observable<void> {
    return this.http.patch<void>(`${this.base}/${id}/archive`, {});
  }

  restore(id: string): Observable<void> {
    return this.http.patch<void>(`${this.base}/${id}/restore`, {});
  }

  terminate(email: string, termination_reason?: string): Observable<void> {
    return this.http.patch<void>(`${environment.server.baseUrl}/users/terminate`, {
      email,
      termination_reason: termination_reason ?? null,
    });
  }

  getUserProducts(id: string): Observable<UserProduct[]> {
    return this.http.get<UserProduct[]>(`${this.base}/${id}/products`);
  }

  updateUserProducts(id: string, productIds: number[]): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/products`, { productIds });
  }

  getUserScope(id: string): Observable<UserScope> {
    return this.http.get<UserScope>(`${this.base}/${id}/scope`);
  }

  updateUserScope(id: string, scope: UserScope): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/scope`, scope);
  }

  getManagers(): Observable<{ id: number; name: string }[]> {
    return this.http
      .get<{ data: { id: number; name: string }[] }>(`${environment.server.baseUrl}/admin/users/managers`)
      .pipe(map(res => res.data));
  }

  setUserManager(userId: number, managerId: number | null): Observable<any> {
    return this.http.put(`${environment.server.baseUrl}/admin/users/${userId}/manager`, { manager_id: managerId });
  }

  toggleStatus(id: string, enable: boolean): Observable<{ message: string; active: boolean }> {
    return this.http.patch<{ message: string; active: boolean }>(`${this.base}/${id}/toggle-status`, { enable });
  }
}
