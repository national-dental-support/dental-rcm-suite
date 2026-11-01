import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  TrainingAssignment, AdminCompletionRow, TrainingRoleDefault, AdminTrainingVideo,
  AdminQuiz, AdminQuizQuestion, PendingSubmission, AdminContent, AdminModuleRow, AdminSection,
  QuizQuestionAnalytics, TrainingSignature, ModuleVersion, LearningPath,
} from '../models/training.model';

@Injectable({ providedIn: 'root' })
export class TrainingAdminService {
  private readonly base = '/api/training/admin';

  constructor(private http: HttpClient) {}

  // -- Dashboard --

  getDashboard(): Observable<any> {
    return this.http.get(`${this.base}/dashboard`);
  }

  getOrgAnalytics(days = 90): Observable<any> {
    return this.http.get(`${this.base}/analytics`, { params: { days: String(days) } });
  }

  // -- Paths --

  listAdminPaths(): Observable<{ data: LearningPath[] }> {
    return this.http.get<{ data: LearningPath[] }>(`${this.base}/paths`);
  }

  createPath(data: any): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/paths`, data);
  }

  updatePath(id: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/paths/${id}`, data);
  }

  // -- Modules --

  createModule(data: any): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/modules`, data);
  }

  updateModule(id: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/modules/${id}`, data);
  }

  // -- Assignments --

  listAssignments(): Observable<{ data: TrainingAssignment[] }> {
    return this.http.get<{ data: TrainingAssignment[] }>(`${this.base}/assignments`);
  }

  createAssignment(data: any): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/assignments`, data);
  }

  deleteAssignment(id: number): Observable<any> {
    return this.http.delete(`${this.base}/assignments/${id}`);
  }

  // -- Completions --

  getCompletions(filters?: { from?: string; to?: string; user?: string }): Observable<{ data: AdminCompletionRow[] }> {
    let params = new HttpParams();
    if (filters?.from) params = params.set('from', filters.from);
    if (filters?.to) params = params.set('to', filters.to);
    if (filters?.user) params = params.set('user', filters.user);
    return this.http.get<{ data: AdminCompletionRow[] }>(`${this.base}/completions`, { params });
  }

  // -- Role Defaults --

  listRoleDefaults(): Observable<{ data: TrainingRoleDefault[] }> {
    return this.http.get<{ data: TrainingRoleDefault[] }>(`${this.base}/role-defaults`);
  }

  createRoleDefault(data: { role: string; learningPathId: number; isMandatory?: boolean }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/role-defaults`, data);
  }

  deleteRoleDefault(id: number): Observable<any> {
    return this.http.delete(`${this.base}/role-defaults/${id}`);
  }

  // -- Delete Path / Module --

  deletePath(id: number): Observable<any> {
    return this.http.delete(`${this.base}/paths/${id}`);
  }

  deleteModule(id: number): Observable<any> {
    return this.http.delete(`${this.base}/modules/${id}`);
  }

  // -- Videos --

  listVideos(): Observable<{ data: AdminTrainingVideo[] }> {
    return this.http.get<{ data: AdminTrainingVideo[] }>(`${this.base}/videos`);
  }

  createVideo(formData: FormData): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/videos`, formData);
  }

  updateVideo(id: number, formData: FormData): Observable<any> {
    return this.http.put(`${this.base}/videos/${id}`, formData);
  }

  deleteVideo(id: number): Observable<any> {
    return this.http.delete(`${this.base}/videos/${id}`);
  }

  bulkUpdateVideos(action: 'delete' | 'reassign' | 'deactivate', videoIds: number[], moduleId?: number): Observable<any> {
    return this.http.put(`${this.base}/videos/bulk`, { action, videoIds, moduleId });
  }

  // -- Transcripts --

  saveTranscript(videoId: number, transcriptText: string, transcriptVtt?: string): Observable<any> {
    return this.http.put(`${this.base}/videos/${videoId}/transcript`, { transcriptText, transcriptVtt });
  }

  // -- Quiz Admin --

  listQuizzes(): Observable<{ data: AdminQuiz[] }> {
    return this.http.get<{ data: AdminQuiz[] }>(`${this.base}/quizzes`);
  }

  listQuizQuestions(quizId: number): Observable<{ data: AdminQuizQuestion[] }> {
    return this.http.get<{ data: AdminQuizQuestion[] }>(`${this.base}/quizzes/${quizId}/questions`);
  }

  createQuizQuestion(quizId: number, data: AdminQuizQuestion): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/quizzes/${quizId}/questions`, data);
  }

  updateQuizQuestion(questionId: number, data: AdminQuizQuestion): Observable<any> {
    return this.http.put(`${this.base}/questions/${questionId}`, data);
  }

  deleteQuizQuestion(questionId: number): Observable<any> {
    return this.http.delete(`${this.base}/questions/${questionId}`);
  }

  // -- Non-video Content --

  listModulesAdmin(): Observable<{ data: AdminModuleRow[] }> {
    return this.http.get<{ data: AdminModuleRow[] }>(`${this.base}/modules-list`);
  }

  listContent(moduleId?: number): Observable<{ data: AdminContent[] }> {
    let params = new HttpParams();
    if (moduleId != null) params = params.set('moduleId', moduleId.toString());
    return this.http.get<{ data: AdminContent[] }>(`${this.base}/content`, { params });
  }

  createContent(formData: FormData): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/content`, formData);
  }

  updateContent(id: number, formData: FormData): Observable<any> {
    return this.http.put(`${this.base}/content/${id}`, formData);
  }

  deleteContent(id: number): Observable<any> {
    return this.http.delete(`${this.base}/content/${id}`);
  }

  // -- Sections (Phase 3) --

  listSections(moduleId: number): Observable<{ data: AdminSection[] }> {
    return this.http.get<{ data: AdminSection[] }>(`${this.base}/modules/${moduleId}/sections`);
  }

  createSection(moduleId: number, data: { title: string; description?: string; sortOrder?: number }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/modules/${moduleId}/sections`, data);
  }

  updateSection(sectionId: number, data: { title: string; description?: string; sortOrder: number }): Observable<any> {
    return this.http.put(`${this.base}/sections/${sectionId}`, data);
  }

  deleteSection(sectionId: number): Observable<any> {
    return this.http.delete(`${this.base}/sections/${sectionId}`);
  }

  reorderSections(moduleId: number, items: Array<{ id: number; sortOrder: number }>): Observable<any> {
    return this.http.put(`${this.base}/modules/${moduleId}/reorder-sections`, { items });
  }

  reorderContent(moduleId: number, items: Array<{ type: 'video' | 'content'; id: number; sortOrder: number; sectionId?: number | null }>): Observable<any> {
    return this.http.put(`${this.base}/modules/${moduleId}/reorder-content`, { items });
  }

  // -- Manual Grading --

  getPendingSubmissions(): Observable<{ data: PendingSubmission[] }> {
    return this.http.get<{ data: PendingSubmission[] }>(`${this.base}/submissions/pending`);
  }

  gradeSubmission(attemptId: number, questionGrades: Array<{ shortAnswerId: number; score: number }>): Observable<any> {
    return this.http.post(`${this.base}/submissions/${attemptId}/grade`, { questionGrades });
  }

  // -- Phase 4: Analytics, E-Signatures, Versions --

  getQuizAnalytics(quizId: number): Observable<{ data: QuizQuestionAnalytics[] }> {
    return this.http.get<{ data: QuizQuestionAnalytics[] }>(`${this.base}/analytics/quiz/${quizId}`);
  }

  listSignatures(): Observable<{ data: TrainingSignature[] }> {
    return this.http.get<{ data: TrainingSignature[] }>(`${this.base}/signatures`);
  }

  listModuleVersions(moduleId: number): Observable<{ data: ModuleVersion[] }> {
    return this.http.get<{ data: ModuleVersion[] }>(`${this.base}/modules/${moduleId}/versions`);
  }
}
