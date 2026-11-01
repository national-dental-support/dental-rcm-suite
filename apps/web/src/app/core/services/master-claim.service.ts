import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MasterClaimResponse } from '../models/master-claim.model';

@Injectable({ providedIn: 'root' })
export class MasterClaimService {
  private readonly baseUrl = `${environment.server.baseUrl}/claims`;
  private cache = new Map<string, MasterClaimResponse>();

  constructor(private http: HttpClient) {}

  getClaim(id: string): Observable<MasterClaimResponse> {
    if (this.cache.has(id)) {
      return of(this.cache.get(id)!);
    }
    return this.http.get<MasterClaimResponse>(`${this.baseUrl}/${id}`).pipe(
      tap(res => this.cache.set(id, res))
    );
  }

  clearCache(): void {
    this.cache.clear();
  }
}
