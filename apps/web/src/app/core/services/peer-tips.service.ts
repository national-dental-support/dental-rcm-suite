import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PeerTip {
  id: number;
  authorId: string;
  authorName: string;
  reasonCode: string;
  payerName: string | null;
  title: string;
  body: string;
  upvotes: number;
  downvotes: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  userVote?: number;
}

@Injectable({ providedIn: 'root' })
export class PeerTipsService {
  private base = `${environment.server.baseUrl}/api/lms/peer-tips`;

  constructor(private http: HttpClient) {}

  listTips(params?: { reasonCode?: string; payerName?: string; status?: string }) {
    return this.http.get<PeerTip[]>(`${this.base}`, { params: params as any });
  }

  createTip(tip: { reasonCode: string; payerName?: string; title: string; body: string }) {
    return this.http.post<{ id: number }>(`${this.base}`, tip);
  }

  vote(tipId: number, direction: 1 | -1, userId: string) {
    return this.http.post<{ success: boolean }>(`${this.base}/${tipId}/vote`, { userId, direction });
  }

  approveTip(tipId: number, status: 'approved' | 'rejected') {
    return this.http.patch<{ success: boolean }>(`${this.base}/${tipId}/approve`, { status });
  }
}
