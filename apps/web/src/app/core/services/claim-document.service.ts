import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ClaimDocument {
  id: number;
  claim_id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  doc_type: string;
  uploaded_by: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ClaimDocumentService {
  private baseUrl = `${environment.server.baseUrl}/denial-iq/claim-detail/documents`;

  constructor(private http: HttpClient) {}

  list(claimId: string): Observable<ClaimDocument[]> {
    return this.http
      .get<{ data: ClaimDocument[] }>(this.baseUrl, { params: { claimId } })
      .pipe(map(res => res.data));
  }

  upload(claimId: string, file: File, docType: string): Observable<ClaimDocument> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('claimId', claimId);
    fd.append('docType', docType);
    return this.http
      .post<{ data: ClaimDocument }>(this.baseUrl, fd)
      .pipe(map(res => res.data));
  }

  getDownloadUrl(docId: number): string {
    return `${this.baseUrl}/${docId}/download`;
  }

  downloadBlob(docId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${docId}/download`, { responseType: 'blob' });
  }

  remove(docId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${docId}`);
  }
}
