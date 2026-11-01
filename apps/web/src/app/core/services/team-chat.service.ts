import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ChatChannel {
  id: number;
  name: string;
  channelType: 'team' | 'direct' | 'claim';
  claimId: string | null;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  senderId: string;
  senderName: string;
  body: string;
  claimRef: string | null;
  trainingRef: number | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class TeamChatService {
  private base = `${environment.server.baseUrl}/api/collaboration/team-chat`;

  constructor(private http: HttpClient) {}

  listChannels(userId?: string) {
    const params: any = {};
    if (userId) params.userId = userId;
    return this.http.get<ChatChannel[]>(`${this.base}/channels`, { params });
  }

  createChannel(channel: { name: string; channelType: string; claimId?: string; createdBy: string; memberIds?: string[] }) {
    return this.http.post<{ id: number }>(`${this.base}/channels`, channel);
  }

  getMessages(channelId: number, before?: number) {
    const params: any = {};
    if (before) params.before = before;
    return this.http.get<ChatMessage[]>(`${this.base}/channels/${channelId}/messages`, { params });
  }

  sendMessage(channelId: number, msg: { senderId: string; body: string; claimRef?: string; trainingRef?: number }) {
    return this.http.post<{ id: number }>(`${this.base}/channels/${channelId}/messages`, msg);
  }
}
