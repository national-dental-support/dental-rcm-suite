import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LearningAnalyticsSummary {
  activeLearnersCount: number;
  modulesCompletedCount: number;
  avgCompletionMinutes: number | null;
  avgQuizScore: number | null;
  quizPassRate: number | null;
  certificatesIssued: number;
  totalWatchHours: number | null;
}

export interface CompletionTrendPoint {
  weekStart: string;
  completions: number;
  uniqueLearners: number;
}

export interface ModulePerformanceRow {
  moduleId: number;
  moduleName: string;
  completions: number;
  avgMinutes: number | null;
  avgQuizScore: number | null;
  activeButIncomplete: number;
}

export interface QuizPerformanceRow {
  moduleId: number;
  moduleName: string;
  attempts: number;
  passed: number;
  avgScore: number | null;
  minScore: number | null;
  maxScore: number | null;
}

export interface TopLearnerRow {
  userEmail: string;
  modulesCompleted: number;
  avgQuizScore: number | null;
  totalHours: number | null;
}

export interface PathCompletionRow {
  pathId: number;
  pathName: string;
  enrolledCount: number;
  completedCount: number;
  avgPctComplete: number | null;
}

export interface LearningAnalyticsData {
  summary: LearningAnalyticsSummary;
  completionTrend: CompletionTrendPoint[];
  modulePerformance: ModulePerformanceRow[];
  quizPerformance: QuizPerformanceRow[];
  topLearners: TopLearnerRow[];
  pathCompletionRates: PathCompletionRow[];
  periodDays: number;
}

@Injectable({ providedIn: 'root' })
export class LearningAnalyticsService {
  private base = `${environment.server.baseUrl}/training/admin/analytics`;

  constructor(private http: HttpClient) {}

  getAnalytics(days = 90): Observable<LearningAnalyticsData> {
    return this.http.get<LearningAnalyticsData>(this.base, { params: { days } });
  }
}
