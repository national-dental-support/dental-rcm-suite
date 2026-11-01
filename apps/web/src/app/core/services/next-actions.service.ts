import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface NextActionsResponse {
  claimId: string;
  actions: string;
}

@Injectable({ providedIn: 'root' })
export class NextActionsService {
  private base = `${environment.server.baseUrl}/api/ai/next-action`;

  constructor(private http: HttpClient) {}

  getNextActions(claimId: string): Observable<NextActionsResponse> {
    return this.http.get<NextActionsResponse>(`${this.base}/${claimId}`);
  }
}
