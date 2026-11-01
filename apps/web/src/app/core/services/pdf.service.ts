import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PdfService {
  private readonly apiBase = environment.server.baseUrl;

  constructor(private http: HttpClient) {}

  /** Fetch EOB as HTML string (rendered inline, no PDF viewer needed) */
  getEobHtml(claimId?: string): Observable<string> {
    const params = claimId ? `?claimId=${claimId}` : '';
    return this.http.get(`${this.apiBase}/pdf/generate${params}`, { responseType: 'text' });
  }

  /** Legacy: fetch as blob (kept for backward compat) */
  getPdf(claimId?: string): Observable<Blob> {
    const params = claimId ? `?claimId=${claimId}` : '';
    return this.http.get(`${this.apiBase}/pdf/generate${params}`, { responseType: 'blob' });
  }
}
