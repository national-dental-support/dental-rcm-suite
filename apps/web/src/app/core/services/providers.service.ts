import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProvidersService {
  constructor(private http: HttpClient) {}
  fetch(practiceGroups: string[], locations: string[]): Observable<string[]> {
    return this.http
      .post<{ providers: string[] }>(
        '/api/analytics/lookups/providers',
        { practiceGroups, locations }
      )
      .pipe(map(r => r.providers ?? []));
  }
}
