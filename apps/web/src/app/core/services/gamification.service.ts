import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Badge {
  id: number;
  name: string;
  description: string;
  icon: string;
  category: string;
  threshold: number;
  isActive: boolean;
}

export interface UserBadge {
  id: number;
  badgeId: number;
  badgeName: string;
  badgeIcon: string;
  badgeDescription: string;
  earnedAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  totalPoints: number;
  badgeCount: number;
  rank: number;
}

export interface UserPoints {
  totalPoints: number;
  breakdown: { category: string; points: number }[];
}

@Injectable({ providedIn: 'root' })
export class GamificationService {
  private base = `${environment.server.baseUrl}/api/workforce/gamification`;

  constructor(private http: HttpClient) {}

  getBadges() {
    return this.http.get<Badge[]>(`${this.base}/badges`);
  }

  getUserBadges(userId: string) {
    return this.http.get<UserBadge[]>(`${this.base}/users/${userId}/badges`);
  }

  getLeaderboard(period?: string) {
    const params: any = {};
    if (period) params.period = period;
    return this.http.get<LeaderboardEntry[]>(`${this.base}/leaderboard`, { params });
  }

  getUserPoints(userId: string) {
    return this.http.get<UserPoints>(`${this.base}/users/${userId}/points`);
  }
}
