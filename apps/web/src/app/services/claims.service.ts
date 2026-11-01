import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ClaimsService {
   private apiUrl = `${environment.server.baseUrl}/claims`;
  constructor(private http: HttpClient) {}

  getClaims(data: any) {
    return this.http.post(this.apiUrl, data);
  }
}
