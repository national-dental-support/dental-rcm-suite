import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface CoachingRecommendation {
  id: number;
  staffId: number;
  staffName: string;
  staffRole: string;
  carcCode: string;
  rating: string;
  staffAvgMin: number;
  teamAvgMin: number;
  mentorId: number | null;
  mentorName: string | null;
  moduleId: number | null;
  assignmentId: number | null;
  reviewDate: string | null;
  status: 'pending' | 'in-progress' | 'completed';
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CoachingSummary {
  pending: number;
  inProgress: number;
  completed: number;
  total: number;
  uniqueStaff: number;
  uniqueCodes: number;
  uniqueMentors: number;
  topGapCodes: { carcCode: string; count: number }[];
  topMentors: { mentorName: string; menteeCount: number }[];
}

export interface GenerateResult {
  message: string;
  created: number;
  totalGaps: number;
  existingSkipped: number;
}

@Injectable({ providedIn: 'root' })
export class CoachingService {
  private base = `${environment.server.baseUrl}/admin/coaching`;

  constructor(private http: HttpClient) {}

  listRecommendations(status = 'all'): Observable<{ data: CoachingRecommendation[]; summary: any }> {
    return this.http.get<{ data: CoachingRecommendation[]; summary: any }>(
      `${this.base}/recommendations`, { params: { status } }
    );
  }

  generateRecommendations(): Observable<GenerateResult> {
    return this.http.post<GenerateResult>(`${this.base}/generate`, {});
  }

  updateRecommendation(id: number, body: Partial<{ status: string; notes: string; mentorId: number; mentorName: string; reviewDate: string }>): Observable<any> {
    return this.http.patch(`${this.base}/recommendations/${id}`, body);
  }

  getSummary(): Observable<CoachingSummary> {
    return this.http.get<CoachingSummary>(`${this.base}/summary`);
  }
}
