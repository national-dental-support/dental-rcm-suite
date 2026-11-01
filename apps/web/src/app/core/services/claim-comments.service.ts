import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClaimComment {
  id: number;
  claimId: string;
  parentId: number | null;
  authorId: number;
  authorName: string;
  authorRole: string;
  body: string;
  mentions: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt?: string;
  replies?: ClaimComment[];
}

export interface CommentsResponse {
  comments: ClaimComment[];
  totalCount: number;
}

@Injectable({ providedIn: 'root' })
export class ClaimCommentsService {
  private base = `${environment.server.baseUrl}/denial-iq/claim-detail/comments`;

  constructor(private http: HttpClient) {}

  getComments(claimId: string): Observable<CommentsResponse> {
    return this.http.get<CommentsResponse>(`${this.base}/${encodeURIComponent(claimId)}`);
  }

  addComment(
    claimId: string,
    body: string,
    authorId: number,
    authorName: string,
    parentId?: number,
  ): Observable<ClaimComment> {
    return this.http.post<ClaimComment>(`${this.base}/${encodeURIComponent(claimId)}`, {
      body,
      authorId,
      authorName,
      parentId: parentId || null,
    });
  }

  editComment(commentId: number, body: string): Observable<any> {
    return this.http.put(`${this.base}/${commentId}`, { body });
  }

  deleteComment(commentId: number): Observable<any> {
    return this.http.delete(`${this.base}/${commentId}`);
  }
}
