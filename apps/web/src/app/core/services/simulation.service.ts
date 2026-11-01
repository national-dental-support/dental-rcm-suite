import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SimulationListItem {
  id: number;
  title: string;
  description: string;
  carcCode: string;
  difficulty: string;
  timeLimitMinutes: number | null;
  passingScore: number;
  stepCount: number;
  myAttempts: number;
  bestScore: number | null;
}

export interface SimulationStep {
  id: number;
  sortOrder: number;
  title: string;
  instruction: string;
  expectedAction: string;
  points: number;
  hint: string | null;
  feedbackCorrect: string | null;
  feedbackIncorrect: string | null;
}

export interface SimulationDetail {
  id: number;
  title: string;
  description: string;
  carcCode: string;
  payerName: string;
  patientName: string;
  chargeAmount: number;
  dateOfService: string;
  difficulty: string;
  timeLimitMinutes: number | null;
  passingScore: number;
  scenario: any;
  steps: SimulationStep[];
}

export interface StepSubmitResult {
  isCorrect: boolean;
  pointsEarned: number;
  feedback: string | null;
}

export interface StepResultRow {
  stepId: number;
  stepTitle: string;
  actionTaken: string;
  expectedAction: string;
  isCorrect: boolean;
  pointsEarned: number;
  maxPoints: number;
  timeSeconds: number;
}

export interface AttemptResult {
  score: number;
  maxScore: number;
  scorePct: number;
  passed: boolean;
  timeTakenSeconds: number;
  stepResults: StepResultRow[];
}

export interface AttemptRow {
  id: number;
  startedAt: string;
  completedAt: string | null;
  score: number;
  maxScore: number;
  scorePct: number;
  passed: boolean;
  timeTakenSeconds: number;
}

export interface AdminSimRow {
  id: number;
  title: string;
  description: string;
  carcCode: string;
  difficulty: string;
  timeLimitMinutes: number | null;
  passingScore: number;
  isActive: boolean;
  createdAt: string;
  stepCount: number;
  totalAttempts: number;
  avgScorePct: number | null;
}

export interface SimAnalyticsRow {
  id: number;
  title: string;
  difficulty: string;
  carcCode: string;
  totalAttempts: number;
  completedAttempts: number;
  passedAttempts: number;
  avgScorePct: number | null;
  avgTimeSec: number | null;
  uniqueUsers: number;
}

@Injectable({ providedIn: 'root' })
export class SimulationService {
  private base = `${environment.server.baseUrl}/training/simulations`;
  private adminBase = `${environment.server.baseUrl}/training/admin/simulations`;

  constructor(private http: HttpClient) {}

  // Trainee
  list(): Observable<SimulationListItem[]> {
    return this.http.get<SimulationListItem[]>(this.base);
  }

  get(id: number): Observable<SimulationDetail> {
    return this.http.get<SimulationDetail>(`${this.base}/${id}`);
  }

  startAttempt(simId: number): Observable<{ attemptId: number; maxScore: number }> {
    return this.http.post<{ attemptId: number; maxScore: number }>(`${this.base}/${simId}/start`, {});
  }

  submitStep(attemptId: number, stepId: number, actionTaken: string, timeSeconds: number): Observable<StepSubmitResult> {
    return this.http.post<StepSubmitResult>(`${this.base}/attempt/${attemptId}/step`, {
      stepId, actionTaken, timeSeconds,
    });
  }

  completeAttempt(attemptId: number): Observable<AttemptResult> {
    return this.http.post<AttemptResult>(`${this.base}/attempt/${attemptId}/complete`, {});
  }

  getMyAttempts(simId: number): Observable<AttemptRow[]> {
    return this.http.get<AttemptRow[]>(`${this.base}/${simId}/my-attempts`);
  }

  // Admin
  adminList(): Observable<AdminSimRow[]> {
    return this.http.get<AdminSimRow[]>(this.adminBase);
  }

  adminCreate(body: any): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.adminBase, body);
  }

  adminUpdate(id: number, body: any): Observable<any> {
    return this.http.put(`${this.adminBase}/${id}`, body);
  }

  adminDelete(id: number): Observable<any> {
    return this.http.delete(`${this.adminBase}/${id}`);
  }

  adminAnalytics(): Observable<SimAnalyticsRow[]> {
    return this.http.get<SimAnalyticsRow[]>(`${this.adminBase}/analytics`);
  }
}
