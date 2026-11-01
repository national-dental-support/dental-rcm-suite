// src/app/services/user.service.ts
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ILocationAssignment } from '../../shared/types/location-assignments';


export interface UserState {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  locationAssignments: any[];
}

export interface CreateUserDto {
  azureID: string;
  firstName: string;
  lastName: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private baseUrl = `${environment.server.baseUrl}/users`;
  private userSubject = new BehaviorSubject<[any]>([null]);
  user$ = this.userSubject.asObservable();
  constructor(private http: HttpClient) {}

private getHeaders(): HttpHeaders {
  const token = sessionStorage.getItem('myRCMAzureIDToken') || '';
  return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
}

   setUser(user: any) {
    this.userSubject.next(user);
  }

  getUsers() {
    return this.http.get(`${this.baseUrl}/test`, {
      headers: this.getHeaders()
    });
  }

getUserByEmail(email: string) {
  return this.http.post(`${this.baseUrl}/get-by-email`, {
    headers: this.getHeaders(),
    params: new HttpParams().set('email', email),
  });
}

checkIfUserExists(email: string) {
  return this.http.get<{ found: boolean; uid?: number }>(
    `${this.baseUrl}/get-by-email`,
    { headers: this.getHeaders(), params: new HttpParams().set('email', email) }
  );
}


createUser(userData: CreateUserDto) {
  return this.http.post(`${this.baseUrl}/create`, userData, {
    headers: this.getHeaders()
  });
}



getLocationAssignments(userId: number): Observable<ILocationAssignment[]> {
  const params = new HttpParams().set('user_id', userId.toString());
  const token = sessionStorage.getItem('myRCMAzureIDToken') || '';
  const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  return this.http.get<any[]>(`${environment.server.baseUrl}/users`, {
    headers: headers,
    params: params
  });
}



}
